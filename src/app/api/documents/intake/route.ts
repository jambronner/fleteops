import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { getSessionForTenant } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { DocumentIntakeLimitError, persistIncomingDocument } from "@/lib/documents/intake";
import { canWriteDocuments } from "@/lib/documents/policy";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";
import { tenantExists } from "@/lib/documents/repository";

export const runtime = "nodejs";

const allowedDocumentTypes = new Set([
  "customer_po",
  "shipper_po",
  "retailer_receipt",
  "pod",
  "carrier_invoice",
  "broker_invoice",
  "vendor_invoice",
  "credit_note",
  "photo",
  "voice_note",
  "pdf",
  "spreadsheet_import",
  "other",
]);

const allowedSourceChannels = new Set(["whatsapp", "upload", "manual", "api", "spreadsheet_import"]);
type AllowedSourceChannel = "whatsapp" | "upload" | "manual" | "api" | "spreadsheet_import";

function parseBoolean(value: FormDataEntryValue | null, defaultValue: boolean) {
  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "Use multipart/form-data with a file upload." },
      { status: 415 },
    );
  }

  const formData = await request.formData();
  const tenantIdValue = formData.get("tenantId");
  const file = formData.get("file");
  const documentType = formData.get("documentType");
  const sourceChannelValue = formData.get("sourceChannel");
  const languageValue = formData.get("language");
  const issuingOrgIdValue = formData.get("issuingOrgId");
  const receivingOrgIdValue = formData.get("receivingOrgId");
  const autoExtract = parseBoolean(formData.get("autoExtract"), true);
  const tenantId = typeof tenantIdValue === "string" && tenantIdValue ? tenantIdValue : null;
  const session = await getSessionForTenant(tenantId);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canWriteDocuments(session)) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to upload evidence." },
      { status: 403 },
    );
  }

  const resolvedTenantId = session.tenant.id;

  if (!(file instanceof File) || typeof documentType !== "string") {
    return NextResponse.json(
      { ok: false, error: "documentType and file are required." },
      { status: 400 },
    );
  }

  if (!allowedDocumentTypes.has(documentType)) {
    return NextResponse.json({ ok: false, error: "Unsupported document type." }, { status: 400 });
  }

  const sourceChannel: AllowedSourceChannel =
    typeof sourceChannelValue === "string" && allowedSourceChannels.has(sourceChannelValue)
      ? (sourceChannelValue as AllowedSourceChannel)
      : "upload";
  const language = typeof languageValue === "string" && languageValue ? languageValue : "es-MX";
  const issuingOrgId = typeof issuingOrgIdValue === "string" && issuingOrgIdValue ? issuingOrgIdValue : null;
  const receivingOrgId =
    typeof receivingOrgIdValue === "string" && receivingOrgIdValue ? receivingOrgIdValue : null;

  if (!(await tenantExists(resolvedTenantId))) {
    return NextResponse.json({ ok: false, error: "Unknown tenantId." }, { status: 404 });
  }

  const body = new Uint8Array(await file.arrayBuffer());
  try {
    const persistedDocument = await persistIncomingDocument({
      tenantId: resolvedTenantId,
      documentType: documentType as "customer_po" | "shipper_po" | "retailer_receipt" | "pod" | "carrier_invoice" | "broker_invoice" | "vendor_invoice" | "credit_note" | "photo" | "voice_note" | "pdf" | "spreadsheet_import" | "other",
      sourceChannel,
      trigger: "upload",
      originalFileName: file.name,
      mimeType: file.type || null,
      bytes: body,
      language,
      issuingOrgId,
      receivingOrgId,
      autoExtract,
      metadata: {
        upload: {
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        documentId: persistedDocument.documentId,
        extractionQueued: persistedDocument.extractionQueued,
        extractionReused: persistedDocument.extractionReused,
        extractionProcessed: persistedDocument.extractionProcessed,
        extractionError: persistedDocument.extractionError,
        extraction: persistedDocument.extraction,
        routing: persistedDocument.routing,
        readiness: persistedDocument.readiness,
        file: persistedDocument.file,
        signedReadUrl: persistedDocument.signedReadUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DocumentIntakeLimitError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.userMessage,
          details: error.details,
        },
        { status: error.statusCode },
      );
    }

    if (error instanceof DocumentScanRejectedError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.userMessage, requestId: error.requestId },
        { status: error.statusCode },
      );
    }

    throw error;
  }
}
