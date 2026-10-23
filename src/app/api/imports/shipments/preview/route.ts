import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionForTenant } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { importBatches, locations, organizations } from "@/lib/db/schema";
import { supportedImportTypes } from "@/lib/imports/contracts";
import {
  buildRoutePreviewDraftMetadata,
  type RoutePreviewDraftPreview,
} from "@/lib/imports/route-preview-drafts";
import { discardRoutePreviewDraft, findRoutePreviewDraft } from "@/lib/imports/route-preview-draft-records";
import {
  defaultRouteManifestMapping,
  getRouteManifestAcceptedFields,
  parseRouteManifestMappingPayload,
} from "@/lib/imports/route-manifest";
import { findMatchingImportMappingProfile, listImportMappingProfiles } from "@/lib/imports/mapping-profiles";
import { canManageImportType } from "@/lib/imports/policy";
import { buildShipmentTrackerDrafts } from "@/lib/imports/shipment-tracker";
import { parseSpreadsheet } from "@/lib/imports/spreadsheet";
import {
  scanImportUpload,
  validateImportUpload,
} from "@/lib/imports/server";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";
import { getStorageDriver } from "@/lib/storage";
import { buildImportBatchObjectKey, buildStoredObjectRoutePath } from "@/lib/storage/object-keys";

export const runtime = "nodejs";

const importTypeSchema = z.enum(supportedImportTypes);
const draftPreviewRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  draftId: z.string().uuid(),
  importType: z.literal("shipment_tracker"),
  mappingTemplate: z.string().optional().nullable(),
  routeManifestMapping: z.unknown().optional(),
  sheetName: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getSessionForTenant(request.nextUrl.searchParams.get("tenantId"));

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageImportType(session, "shipment_tracker")) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to manage route imports." },
      { status: 403 },
    );
  }

  const draft = await findRoutePreviewDraft(session.tenant.id, request.nextUrl.searchParams.get("draftId"));

  if (!draft) {
    return NextResponse.json({ ok: true, preview: null });
  }

  const storageDriver = await getStorageDriver();
  const signedReadUrl = await storageDriver.createSignedReadUrl({
    key: draft.metadata.storage.key,
    fileName: draft.metadata.fileName,
  });

  return NextResponse.json({
    ok: true,
    preview: previewResponse({
      draftId: draft.id,
      preview: draft.metadata.routePreviewDraft.preview,
      mappingTemplate: draft.metadata.mappingTemplate,
      signedReadUrl,
    }),
  });
}

function parseMappingPayload(value: unknown) {
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

function previewResponse(args: {
  draftId: string;
  preview: RoutePreviewDraftPreview;
  mappingTemplate: string | null;
  signedReadUrl: string;
}) {
  return {
    ...args.preview,
    draftId: args.draftId,
    mappingTemplate: args.mappingTemplate,
    signedReadUrl: args.signedReadUrl,
  };
}

async function directoryRows(session: NonNullable<Awaited<ReturnType<typeof getSessionForTenant>>>) {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return Promise.all([
    db
      .select({
        id: organizations.id,
        legalName: organizations.legalName,
        displayName: organizations.displayName,
      })
      .from(organizations)
      .where(and(eq(organizations.tenantId, session.tenant.id), eq(organizations.active, true))),
    db
      .select({
        id: locations.id,
        name: locations.name,
        addressLine1: locations.addressLine1,
      })
      .from(locations)
      .where(eq(locations.tenantId, session.tenant.id)),
  ]);
}

async function buildRoutePreview(args: {
  body: Uint8Array;
  fileName: string;
  locale: string;
  sheetName?: string;
  mappingValue: unknown;
  sourceFormat: "csv" | "xlsx" | "xls";
  validationWarnings: string[];
  session: NonNullable<Awaited<ReturnType<typeof getSessionForTenant>>>;
}): Promise<{ preview: RoutePreviewDraftPreview; mapping: ReturnType<typeof defaultRouteManifestMapping>; sheetName: string | null }> {
  const parsed = parseSpreadsheet({
    body: args.body,
    fileName: args.fileName,
    locale: args.locale,
    sheetName: args.sheetName,
  });
  const headers = parsed.rows[0] ?? [];
  const suggestedMapping = defaultRouteManifestMapping(headers);
  const submittedMapping = parseMappingPayload(args.mappingValue);
  let mapping = submittedMapping ? { ...suggestedMapping, ...submittedMapping } : suggestedMapping;
  let appliedProfile: { id: string; name: string } | null = null;

  // Auto-apply a saved mapping profile only when the caller hasn't already chosen a mapping
  // (first analyze of a fresh file). Once a mapping is in play -- whether hand-picked or
  // auto-applied on a prior preview -- later refreshes carry it forward as-is instead of
  // re-matching, so user edits are never silently clobbered.
  if (!submittedMapping) {
    const profiles = await listImportMappingProfiles(args.session.tenant.id);
    const matchedProfile = findMatchingImportMappingProfile({
      profiles,
      importType: "shipment_tracker",
      headers,
    });

    if (matchedProfile) {
      mapping = { ...suggestedMapping, ...matchedProfile.mapping };
      appliedProfile = { id: matchedProfile.id, name: matchedProfile.name };
    }
  }

  const [organizationRows, locationRows] = await directoryRows(args.session);

  const result = buildShipmentTrackerDrafts({
    fileName: args.fileName,
    locale: args.locale,
    rows: parsed.rows,
    organizations: organizationRows,
    locations: locationRows,
    existingImportRowHashes: new Set(),
    mapping,
  });

  return {
    preview: {
      fileName: args.fileName,
      importType: "shipment_tracker",
      sourceFormat: args.sourceFormat,
      sheetName: parsed.sheetName ?? null,
      sheets: parsed.sheets ?? [],
      sourceHeaders: headers,
      acceptedFields: getRouteManifestAcceptedFields(args.locale),
      suggestedMapping,
      mapping,
      directoryOptions: {
        locations: locationRows.map((location) => ({
          id: location.id,
          label: location.name,
          addressLine1: location.addressLine1,
        })),
        organizations: organizationRows.map((organization) => ({
          id: organization.id,
          label: organization.displayName ?? organization.legalName,
        })),
      },
      result,
      warnings: [...args.validationWarnings, ...parsed.warnings, ...result.warnings],
      appliedProfile,
    },
    mapping,
    sheetName: parsed.sheetName ?? null,
  };
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = draftPreviewRequestSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ ok: false, error: "Invalid preview draft request." }, { status: 400 });
    }

    const session = await getSessionForTenant(payload.data.tenantId ?? null);

    if (!session) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    if (!canManageImportType(session, "shipment_tracker")) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to manage route imports." },
        { status: 403 },
      );
    }

    const draft = await findRoutePreviewDraft(session.tenant.id, payload.data.draftId);

    if (!draft) {
      return NextResponse.json({ ok: false, error: "Saved preview draft was not found." }, { status: 404 });
    }

    try {
      const storageDriver = await getStorageDriver();
      const body = await storageDriver.readObject({ key: draft.metadata.storage.key });
      const scanResult = await scanImportUpload({
        bytes: body,
        fileName: draft.metadata.fileName,
        mimeType: draft.metadata.file.mimeType,
      });
      const { preview, mapping, sheetName } = await buildRoutePreview({
        body,
        fileName: draft.metadata.fileName,
        locale: session.tenant.locale,
        sheetName: payload.data.sheetName?.trim() || undefined,
        mappingValue: payload.data.routeManifestMapping ?? draft.metadata.routeManifestMapping,
        sourceFormat: draft.metadata.sourceFormat,
        validationWarnings: [],
        session,
      });
      const metadata = buildRoutePreviewDraftMetadata({
        fileName: draft.metadata.fileName,
        sourceFormat: draft.metadata.sourceFormat,
        mappingTemplate: payload.data.mappingTemplate?.trim() || null,
        sheetName,
        routeManifestMapping: mapping,
        preview,
        stableFileUrl: draft.metadata.stableFileUrl,
        storedObject: draft.metadata.storage,
        scan: {
          outcome: scanResult.outcome,
          requestId: scanResult.requestId,
          scannedAt: new Date().toISOString(),
        },
      });

      await db.update(importBatches).set({ metadata, updatedAt: new Date() }).where(eq(importBatches.id, draft.id));

      const signedReadUrl = await storageDriver.createSignedReadUrl({
        key: metadata.storage.key,
        fileName: metadata.fileName,
      });

      return NextResponse.json({
        ok: true,
        preview: previewResponse({
          draftId: draft.id,
          preview,
          mappingTemplate: metadata.mappingTemplate,
          signedReadUrl,
        }),
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

      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Preview failed.",
        },
        { status: 400 },
      );
    }
  }

  const formData = await request.formData();
  const tenantIdValue = formData.get("tenantId");
  const file = formData.get("file");
  const importTypeValue = formData.get("importType");
  const sheetNameValue = formData.get("sheetName");
  const mappingValue = formData.get("routeManifestMapping");
  const mappingTemplateValue = formData.get("mappingTemplate");
  const draftIdValue = formData.get("draftId");
  const session = await getSessionForTenant(typeof tenantIdValue === "string" ? tenantIdValue : null);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageImportType(session, "shipment_tracker")) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to manage route imports." },
      { status: 403 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: session.tenant.locale === "en" ? "Choose a file first." : "Primero selecciona un archivo." },
      { status: 400 },
    );
  }

  const importTypeParse = importTypeSchema.safeParse(importTypeValue);

  if (!importTypeParse.success || importTypeParse.data !== "shipment_tracker") {
    return NextResponse.json(
      { ok: false, error: session.tenant.locale === "en" ? "Choose a route import type." : "Selecciona una importación de rutas." },
      { status: 400 },
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

  try {
    const body = new Uint8Array(await file.arrayBuffer());
    const scanResult = await scanImportUpload({
      bytes: body,
      fileName: file.name,
      mimeType: file.type || null,
    });
    const storageDriver = await getStorageDriver();
    const reusableDraft = await findRoutePreviewDraft(
      session.tenant.id,
      typeof draftIdValue === "string" && draftIdValue.trim() ? draftIdValue.trim() : null,
    );
    const draftId = reusableDraft?.id ?? randomUUID();
    const objectKey = buildImportBatchObjectKey({
      tenantId: session.tenant.id,
      importBatchId: draftId,
      importType: importTypeParse.data,
      originalFileName: file.name,
    });
    const storedObject = await storageDriver.putObject({
      key: objectKey,
      body,
      contentType: file.type || null,
      originalFileName: file.name,
    });
    const stableFileUrl = buildStoredObjectRoutePath(storedObject.key);
    const { preview, mapping, sheetName } = await buildRoutePreview({
      body,
      fileName: file.name,
      locale: session.tenant.locale,
      sheetName: typeof sheetNameValue === "string" && sheetNameValue.trim() ? sheetNameValue.trim() : undefined,
      mappingValue,
      sourceFormat: validation.sourceFormat,
      validationWarnings: validation.warnings,
      session,
    });
    const mappingTemplate = typeof mappingTemplateValue === "string" && mappingTemplateValue.trim()
      ? mappingTemplateValue.trim()
      : null;
    const metadata = buildRoutePreviewDraftMetadata({
      fileName: file.name,
      sourceFormat: validation.sourceFormat,
      mappingTemplate,
      sheetName,
      routeManifestMapping: mapping,
      preview,
      stableFileUrl,
      storedObject,
      scan: {
        outcome: scanResult.outcome,
        requestId: scanResult.requestId,
        scannedAt: new Date().toISOString(),
      },
    });

    if (reusableDraft) {
      const previousKey = reusableDraft.metadata.storage.key;
      await db
        .update(importBatches)
        .set({ fileName: file.name, notes: preview.warnings[0] ?? null, metadata, updatedAt: new Date() })
        .where(eq(importBatches.id, reusableDraft.id));

      if (previousKey !== storedObject.key) {
        await storageDriver.deleteObject({ key: previousKey }).catch(() => undefined);
      }
    } else {
      await db.insert(importBatches).values({
        id: draftId,
        tenantId: session.tenant.id,
        fileName: file.name,
        sourceChannel: "spreadsheet_import",
        status: "pending",
        importedByUserId: session.user.id,
        notes: preview.warnings[0] ?? null,
        metadata,
      });
    }

    const signedReadUrl = await storageDriver.createSignedReadUrl({
      key: metadata.storage.key,
      fileName: metadata.fileName,
    });

    return NextResponse.json({
      ok: true,
      preview: previewResponse({
        draftId,
        preview,
        mappingTemplate,
        signedReadUrl,
      }),
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

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Preview failed.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getSessionForTenant(request.nextUrl.searchParams.get("tenantId"));

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageImportType(session, "shipment_tracker")) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to manage route imports." },
      { status: 403 },
    );
  }

  const draftId = request.nextUrl.searchParams.get("draftId");

  if (!draftId) {
    return NextResponse.json({ ok: false, error: "Choose a saved preview draft to cancel." }, { status: 400 });
  }

  const discarded = await discardRoutePreviewDraft({
    tenantId: session.tenant.id,
    draftId,
  });

  if (!discarded) {
    return NextResponse.json({ ok: false, error: "Saved preview draft was not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
