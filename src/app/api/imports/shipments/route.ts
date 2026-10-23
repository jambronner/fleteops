import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionForTenant } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { detectImportFormat, supportedImportTypes } from "@/lib/imports/contracts";
import { directoryItemTypes, directoryOrganizationTypes, processDirectoryImport } from "@/lib/imports/directory";
import { canManageImportType } from "@/lib/imports/policy";
import {
  readRoutePreviewDraftMetadata,
  routePreviewConfirmationMatches,
} from "@/lib/imports/route-preview-drafts";
import { parseRouteManifestMappingPayload } from "@/lib/imports/route-manifest";
import { saveConfirmedMappingProfile } from "@/lib/imports/mapping-profiles";
import {
  scanImportUpload,
  validateImportUpload,
} from "@/lib/imports/server";
import { resolveShipmentTrackerImportBatchStatus } from "@/lib/imports/shipment-import-status";
import { processShipmentTrackerImport } from "@/lib/imports/shipment-tracker";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";
import { getStorageDriver } from "@/lib/storage";
import { buildImportBatchObjectKey, buildStoredObjectRoutePath } from "@/lib/storage/object-keys";

export const runtime = "nodejs";

const importRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  fileName: z.string().min(1),
  importType: z.enum(supportedImportTypes),
  mappingTemplate: z.string().optional(),
});
const routePreviewConfirmSchema = z.object({
  tenantId: z.string().min(1).optional(),
  previewBatchId: z.string().uuid(),
  importType: z.literal("shipment_tracker"),
  mappingTemplate: z.string().optional().nullable(),
  routeManifestMapping: z.unknown().optional(),
  sheetName: z.string().optional().nullable(),
  saveProfile: z.object({ name: z.string().trim().min(1) }).optional().nullable(),
});

const directoryFieldMappingsSchema = z.record(z.string(), z.string().nullable());
const directoryOrganizationTypeSchema = z.enum(directoryOrganizationTypes);

function parseDirectoryFieldMappings(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return directoryFieldMappingsSchema.safeParse(JSON.parse(value));
  } catch {
    return { success: false } as const;
  }
}

function parseRouteManifestMapping(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return parseRouteManifestMappingPayload(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseRouteManifestMappingValue(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return parseRouteManifestMappingPayload(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return parseRouteManifestMappingPayload(value);
}

function uniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings.filter(Boolean)));
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const routePreviewPayload = routePreviewConfirmSchema.safeParse(body);

    if (routePreviewPayload.success) {
      const payload = routePreviewPayload.data;
      const session = await getSessionForTenant(payload.tenantId ?? null);

      if (!session) {
        return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
      }

      if (!canManageImportType(session, "shipment_tracker")) {
        return NextResponse.json(
          { ok: false, error: "You do not have permission to manage route imports." },
          { status: 403 },
        );
      }

      const [draftBatch] = await db
        .select({
          id: importBatches.id,
          fileName: importBatches.fileName,
          metadata: importBatches.metadata,
        })
        .from(importBatches)
        .where(
          and(
            eq(importBatches.id, payload.previewBatchId),
            eq(importBatches.tenantId, session.tenant.id),
            eq(importBatches.status, "pending"),
          ),
        )
        .limit(1);
      const draftMetadata = readRoutePreviewDraftMetadata(draftBatch?.metadata);

      if (!draftBatch || !draftMetadata) {
        return NextResponse.json({ ok: false, error: "Saved preview draft was not found." }, { status: 404 });
      }

      const submittedMapping = parseRouteManifestMappingValue(
        payload.routeManifestMapping,
      );

      if (
        !routePreviewConfirmationMatches({
          draft: draftMetadata,
          mappingTemplate: payload.mappingTemplate,
          routeManifestMapping:
            payload.routeManifestMapping === undefined
              ? undefined
              : submittedMapping,
          sheetName: payload.sheetName,
        })
      ) {
        return NextResponse.json(
          {
            ok: false,
            code: "route_preview_stale",
            error:
              "The file, sheet, or mapping changed after the preview. Update the preview before confirming.",
          },
          { status: 409 },
        );
      }

      try {
        const storageDriver = await getStorageDriver();
        const storedBody = await storageDriver.readObject({ key: draftMetadata.storage.key });
        await scanImportUpload({
          bytes: storedBody,
          fileName: draftMetadata.fileName,
          mimeType: draftMetadata.file.mimeType,
        });
        const routeManifestMapping = draftMetadata.routeManifestMapping;
        const sheetName = draftMetadata.sheetName;
        const mappingTemplate = draftMetadata.mappingTemplate;
        const shipmentResult = await processShipmentTrackerImport({
          body: storedBody,
          fileName: draftMetadata.fileName,
          locale: session.tenant.locale,
          session,
          importBatchId: draftBatch.id,
          mapping: routeManifestMapping,
          sheetName: sheetName ?? undefined,
        });

        // Persist the mapping the user actually confirmed with (including derived sources like
        // dispatch date <- file name) as a reusable named profile. Best-effort: a save failure
        // must not undo the import that already happened, so it only surfaces as a warning.
        const profileSaveOutcome = await saveConfirmedMappingProfile({
          tenantId: session.tenant.id,
          locale: session.tenant.locale,
          saveProfileName: payload.saveProfile?.name,
          sheetName: draftMetadata.sheetName,
          mapping: routeManifestMapping,
        });
        const savedProfile = profileSaveOutcome.savedProfile;

        if (profileSaveOutcome.warning) {
          shipmentResult.warnings.push(profileSaveOutcome.warning);
        }

        const allWarnings = uniqueWarnings(shipmentResult.warnings);
        const status = resolveShipmentTrackerImportBatchStatus(shipmentResult);
        const metadata = {
          ...draftMetadata,
          mappingTemplate,
          routeManifestMapping,
          sheetName,
          warnings: allWarnings,
          result: shipmentResult,
          processedAt: new Date().toISOString(),
        };

        await db
          .update(importBatches)
          .set({
            status,
            rowCount: String(shipmentResult.rowCount),
            notes: allWarnings[0] ?? null,
            errorSummary:
              status === "partially_completed"
                ? {
                    skippedRows: shipmentResult.skipped,
                    unmatchedLocations: shipmentResult.unmatchedLocations,
                    duplicateSkipped: shipmentResult.duplicateSkipped,
                  }
                : null,
            metadata,
            updatedAt: new Date(),
          })
          .where(eq(importBatches.id, draftBatch.id));

        const signedReadUrl = await storageDriver.createSignedReadUrl({
          key: draftMetadata.storage.key,
          fileName: draftMetadata.fileName,
        });

        return NextResponse.json(
          {
            ok: true,
            accepted: true,
            batchId: draftBatch.id,
            status,
            importType: payload.importType,
            sourceFormat: draftMetadata.sourceFormat,
            mappingTemplate,
            file: {
              name: draftMetadata.fileName,
              size: draftMetadata.file.size,
              mimeType: draftMetadata.file.mimeType,
            },
            warnings: allWarnings,
            result: shipmentResult,
            savedProfile,
            signedReadUrl,
          },
          { status: 202 },
        );
      } catch (error) {
        if (error instanceof DocumentScanRejectedError) {
          return NextResponse.json(
            {
              ok: false,
              code: error.code,
              error: error.userMessage,
              requestId: error.requestId,
              batchId: draftBatch.id,
            },
            { status: error.statusCode },
          );
        }

        const summary = error instanceof Error ? error.message : "Route import failed.";

        await db
          .update(importBatches)
          .set({
            notes: summary,
            errorSummary: {
              error: summary,
            },
            metadata: {
              ...draftMetadata,
              confirmationError: summary,
              confirmationFailedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(importBatches.id, draftBatch.id));

        return NextResponse.json(
          {
            ok: false,
            error: summary,
            batchId: draftBatch.id,
          },
          { status: 400 },
        );
      }
    }

    const payload = importRequestSchema.parse(body);
    const session = await getSessionForTenant(payload.tenantId ?? null);

    if (!session) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    if (!canManageImportType(session, payload.importType)) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to create this import." },
        { status: 403 },
      );
    }

    const sourceFormat = detectImportFormat(payload.fileName);
    const batchId = randomUUID();

    await db.insert(importBatches).values({
      id: batchId,
      tenantId: session.tenant.id,
      fileName: payload.fileName,
      sourceChannel: "api",
      status: "pending",
      importedByUserId: session.user.id,
      metadata: {
        importType: payload.importType,
        sourceFormat,
        mappingTemplate: payload.mappingTemplate ?? null,
        intakeMode: "metadata_only",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        batchId,
        status: "pending",
        importType: payload.importType,
        sourceFormat,
      },
      { status: 202 },
    );
  }

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported content type. Use multipart/form-data.",
      },
      { status: 415 },
    );
  }

  const formData = await request.formData();
  const tenantIdValue = formData.get("tenantId");
  const file = formData.get("file");
  const importTypeValue = formData.get("importType");
  const mappingTemplateValue = formData.get("mappingTemplate");
  const directoryItemTypeValue = formData.get("directoryItemType");
  const fieldMappingsValue = formData.get("fieldMappings");
  const routeManifestMappingValue = formData.get("routeManifestMapping");
  const sheetNameValue = formData.get("sheetName");
  const defaultCounterpartyTypeValue = formData.get("defaultCounterpartyType");
  const session = await getSessionForTenant(typeof tenantIdValue === "string" ? tenantIdValue : null);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "A file is required." }, { status: 400 });
  }

  const importTypeParse = z.enum(supportedImportTypes).safeParse(importTypeValue);

  if (!importTypeParse.success) {
    return NextResponse.json(
      { ok: false, error: session.tenant.locale === "en" ? "Choose an import type." : "Selecciona un tipo de importación." },
      { status: 400 },
    );
  }

  if (!canManageImportType(session, importTypeParse.data)) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to create this import." },
      { status: 403 },
    );
  }

  const validation = validateImportUpload({
    fileName: file.name,
    fileSize: file.size,
    importType: importTypeParse.data,
    locale: session.tenant.locale,
  });

  if (validation.errors.length > 0 || !validation.sourceFormat) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.errors[0] ?? "Import validation failed.",
        details: validation.errors,
      },
      { status: 400 },
    );
  }

  const batchId = randomUUID();
  const objectKey = buildImportBatchObjectKey({
    tenantId: session.tenant.id,
    importBatchId: batchId,
    importType: importTypeParse.data,
    originalFileName: file.name,
  });
  const storageDriver = await getStorageDriver();
  const body = new Uint8Array(await file.arrayBuffer());
  let scanResult;

  try {
    scanResult = await scanImportUpload({
      bytes: body,
      fileName: file.name,
      mimeType: file.type || null,
    });
  } catch (error) {
    if (error instanceof DocumentScanRejectedError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.userMessage,
          requestId: error.requestId,
        },
        { status: error.statusCode },
      );
    }

    throw error;
  }

  const storedObject = await storageDriver.putObject({
    key: objectKey,
    body,
    contentType: file.type || null,
    originalFileName: file.name,
  });

  const stableFileUrl = buildStoredObjectRoutePath(storedObject.key);
  const signedReadUrl = await storageDriver.createSignedReadUrl({
    key: storedObject.key,
    fileName: file.name,
  });
  const mappingTemplate = typeof mappingTemplateValue === "string" && mappingTemplateValue.trim()
    ? mappingTemplateValue.trim()
    : null;
  const directoryItemType =
    typeof directoryItemTypeValue === "string" ? z.enum(directoryItemTypes).safeParse(directoryItemTypeValue) : null;
  const fieldMappings = parseDirectoryFieldMappings(fieldMappingsValue);
  const routeManifestMapping = parseRouteManifestMapping(routeManifestMappingValue);
  const sheetName = typeof sheetNameValue === "string" && sheetNameValue.trim() ? sheetNameValue.trim() : null;
  const defaultCounterpartyType =
    typeof defaultCounterpartyTypeValue === "string" && defaultCounterpartyTypeValue.trim()
      ? directoryOrganizationTypeSchema.safeParse(defaultCounterpartyTypeValue)
      : null;

  const batchMetadata: Record<string, unknown> = {
    importType: importTypeParse.data,
    sourceFormat: validation.sourceFormat,
    mappingTemplate,
    stableFileUrl,
    file: {
      size: file.size,
      mimeType: file.type || null,
    },
    storage: storedObject,
    warnings: validation.warnings,
    upload: {
      uploadedAt: new Date().toISOString(),
    },
    scan: {
      outcome: scanResult.outcome,
      requestId: scanResult.requestId,
      scannedAt: new Date().toISOString(),
    },
  };

  await db.insert(importBatches).values({
    id: batchId,
    tenantId: session.tenant.id,
    fileName: file.name,
    sourceChannel: "spreadsheet_import",
    status: "pending",
    importedByUserId: session.user.id,
    notes: validation.warnings[0] ?? null,
    metadata: batchMetadata,
  });

  if (importTypeParse.data === "directory") {
    if (!directoryItemType?.success) {
      const error = session.tenant.locale === "en"
        ? "Choose whether this file contains counterparties or locations."
        : "Selecciona si este archivo contiene contrapartes o ubicaciones.";

      await db
        .update(importBatches)
        .set({
          status: "failed",
          notes: error,
          errorSummary: {
            error,
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: false,
          error,
          batchId,
        },
        { status: 400 },
      );
    }

    if (!fieldMappings?.success) {
      const error = session.tenant.locale === "en"
        ? "Review and confirm the field mapping before importing the directory."
        : "Revisa y confirma el mapeo de campos antes de importar el directorio.";

      await db
        .update(importBatches)
        .set({
          status: "failed",
          notes: error,
          errorSummary: {
            error,
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: false,
          error,
          batchId,
        },
        { status: 400 },
      );
    }

    if (directoryItemType.data === "counterparties" && defaultCounterpartyType && !defaultCounterpartyType.success) {
      const error = session.tenant.locale === "en"
        ? "Choose a valid default counterparty type."
        : "Selecciona un tipo de contraparte predeterminado válido.";

      await db
        .update(importBatches)
        .set({
          status: "failed",
          notes: error,
          errorSummary: {
            error,
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: false,
          error,
          batchId,
        },
        { status: 400 },
      );
    }

    try {
      const directoryResult = await processDirectoryImport({
        body,
        fileName: file.name,
        itemType: directoryItemType.data,
        locale: session.tenant.locale,
        fieldMappings: fieldMappings.data,
        defaultCounterpartyType: defaultCounterpartyType?.success ? defaultCounterpartyType.data : null,
        session,
      });
      const allWarnings = [...validation.warnings, ...directoryResult.warnings];
      const status = directoryResult.skipped > 0 ? "partially_completed" : "completed";

      await db
        .update(importBatches)
        .set({
          status,
          rowCount: String(directoryResult.rowCount),
          notes: allWarnings[0] ?? null,
          errorSummary:
            directoryResult.skipped > 0
              ? {
                  skippedRows: directoryResult.skipped,
                }
              : null,
          metadata: {
            ...batchMetadata,
            directoryItemType: directoryItemType.data,
            fieldMappings: fieldMappings.data,
            defaultCounterpartyType: defaultCounterpartyType?.success ? defaultCounterpartyType.data : null,
            warnings: allWarnings,
            result: directoryResult,
            processedAt: new Date().toISOString(),
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          batchId,
          status,
          importType: importTypeParse.data,
          sourceFormat: validation.sourceFormat,
          mappingTemplate,
          directoryItemType: directoryItemType.data,
          file: {
            name: file.name,
            size: file.size,
            mimeType: file.type || null,
          },
          warnings: allWarnings,
          result: directoryResult,
          signedReadUrl,
        },
        { status: 202 },
      );
    } catch (error) {
      const summary = error instanceof Error ? error.message : "Directory import failed.";

      await db
        .update(importBatches)
        .set({
          status: "failed",
          notes: summary,
          errorSummary: {
            error: summary,
          },
          metadata: {
            ...batchMetadata,
            failedAt: new Date().toISOString(),
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: false,
          error: summary,
          batchId,
        },
        { status: 400 },
      );
    }
  }

  if (importTypeParse.data === "shipment_tracker") {
    try {
      const shipmentResult = await processShipmentTrackerImport({
        body,
        fileName: file.name,
        locale: session.tenant.locale,
        session,
        importBatchId: batchId,
        mapping: routeManifestMapping ?? undefined,
        sheetName: sheetName ?? undefined,
      });
      const allWarnings = uniqueWarnings([...validation.warnings, ...shipmentResult.warnings]);
      const status = resolveShipmentTrackerImportBatchStatus(shipmentResult);

      await db
        .update(importBatches)
        .set({
          status,
          rowCount: String(shipmentResult.rowCount),
          notes: allWarnings[0] ?? null,
          errorSummary:
            status === "partially_completed"
              ? {
                  skippedRows: shipmentResult.skipped,
                  unmatchedLocations: shipmentResult.unmatchedLocations,
                  duplicateSkipped: shipmentResult.duplicateSkipped,
                }
              : null,
          metadata: {
            ...batchMetadata,
            warnings: allWarnings,
            routeManifestMapping,
            sheetName,
            result: shipmentResult,
            processedAt: new Date().toISOString(),
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          batchId,
          status,
          importType: importTypeParse.data,
          sourceFormat: validation.sourceFormat,
          mappingTemplate,
          file: {
            name: file.name,
            size: file.size,
            mimeType: file.type || null,
          },
          warnings: allWarnings,
          result: shipmentResult,
          signedReadUrl,
        },
        { status: 202 },
      );
    } catch (error) {
      const summary = error instanceof Error ? error.message : "Route import failed.";

      await db
        .update(importBatches)
        .set({
          status: "failed",
          notes: summary,
          errorSummary: {
            error: summary,
          },
          metadata: {
            ...batchMetadata,
            failedAt: new Date().toISOString(),
          },
        })
        .where(eq(importBatches.id, batchId));

      return NextResponse.json(
        {
          ok: false,
          error: summary,
          batchId,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      batchId,
      status: "pending",
      importType: importTypeParse.data,
      sourceFormat: validation.sourceFormat,
      mappingTemplate,
      file: {
        name: file.name,
        size: file.size,
        mimeType: file.type || null,
      },
      warnings: validation.warnings,
      signedReadUrl,
    },
    { status: 202 },
  );
}
