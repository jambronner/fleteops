import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { documentLifecycleRequestSchema } from "@/lib/documents/lifecycle";
import { canWriteDocuments } from "@/lib/documents/policy";
import {
  archiveDocumentForTenant,
  restoreDocumentForTenant,
} from "@/lib/documents/repository";

export const runtime = "nodejs";

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to manage documents."
    : "No tienes permiso para administrar documentos.";
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canWriteDocuments(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const params = await context.params;
    const payload = documentLifecycleRequestSchema.parse(await request.json());
    const result =
      payload.action === "archive"
        ? await archiveDocumentForTenant({
            tenantId: session.tenant.id,
            documentId: params.documentId,
            reason: payload.reason,
            session,
          })
        : await restoreDocumentForTenant({
            tenantId: session.tenant.id,
            documentId: params.documentId,
            session,
          });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof z.ZodError
              ? error.issues[0]?.message ?? "Invalid lifecycle action."
              : "Invalid lifecycle request body.",
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to update document lifecycle.";
    console.error("Failed to update document lifecycle", {
      documentId: (await context.params).documentId,
      error,
    });

    if (message === "Document not found in this workspace.") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }

    return NextResponse.json(
      { ok: false, error: "Unable to update document lifecycle right now." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (isDemoMode()) return demoApiDisabled();

  return NextResponse.json(
    {
      ok: false,
      error: "Permanent evidence deletion is disabled. Archive the document instead.",
    },
    { status: 405, headers: { Allow: "PATCH" } },
  );
}
