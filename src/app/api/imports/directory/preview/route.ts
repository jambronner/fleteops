import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionForTenant } from "@/lib/auth/session";
import { buildDirectoryPreview, directoryItemTypes } from "@/lib/imports/directory";
import { canManageImportType } from "@/lib/imports/policy";
import {
  scanImportUpload,
  validateImportUpload,
} from "@/lib/imports/server";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";

export const runtime = "nodejs";

const itemTypeSchema = z.enum(directoryItemTypes);

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const formData = await request.formData();
  const tenantIdValue = formData.get("tenantId");
  const file = formData.get("file");
  const itemTypeValue = formData.get("directoryItemType");
  const session = await getSessionForTenant(typeof tenantIdValue === "string" ? tenantIdValue : null);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageImportType(session, "directory")) {
    return NextResponse.json(
      { ok: false, error: "You do not have permission to import directory records." },
      { status: 403 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: session.tenant.locale === "en" ? "Choose a file first." : "Primero selecciona un archivo." },
      { status: 400 },
    );
  }

  const itemTypeParse = itemTypeSchema.safeParse(itemTypeValue);
  if (!itemTypeParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: session.tenant.locale === "en" ? "Choose what kind of directory file this is." : "Selecciona qué tipo de archivo de directorio es.",
      },
      { status: 400 },
    );
  }

  const validation = validateImportUpload({
    fileName: file.name,
    fileSize: file.size,
    importType: "directory",
    locale: session.tenant.locale,
  });

  if (validation.errors.length > 0) {
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
    await scanImportUpload({
      bytes: body,
      fileName: file.name,
      mimeType: file.type || null,
    });
    const preview = buildDirectoryPreview({
      body,
      fileName: file.name,
      itemType: itemTypeParse.data,
      locale: session.tenant.locale,
    });

    return NextResponse.json({
      ok: true,
      preview: {
        ...preview,
        warnings: [...validation.warnings, ...preview.warnings],
      },
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
