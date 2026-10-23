import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { canLinkDocumentsToShipments } from "@/lib/documents/policy";
import {
  linkDocumentToShipment,
  unlinkDocumentFromShipment,
} from "@/lib/documents/repository";

export const runtime = "nodejs";

const payloadSchema = z.object({
  shipmentId: z.string().uuid(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().trim().max(500).optional(),
});

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to connect evidence to routes."
    : "No tienes permiso para conectar evidencia con rutas.";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canLinkDocumentsToShipments(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const params = await context.params;
    const payload = payloadSchema.parse(await request.json());
    const linked = await linkDocumentToShipment({
      tenantId: session.tenant.id,
      documentId: params.documentId,
      shipmentId: payload.shipmentId,
      confidence: payload.confidence ?? null,
      notes: payload.notes ?? null,
      session,
    });

    return NextResponse.json({ ok: true, linked });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof z.ZodError
              ? error.issues[0]?.message ?? "Invalid request."
              : "Invalid request body.",
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to link document to route.";
    if (
      message === "Document not found in this workspace." ||
      message === "Route not found in this workspace."
    ) {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }

    if (message === "Restore this archived document before linking it to a route.") {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }

    console.error("Failed to link evidence to a route", {
      documentId: (await context.params).documentId,
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Unable to update the route link right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canLinkDocumentsToShipments(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const params = await context.params;
    const result = await unlinkDocumentFromShipment({
      tenantId: session.tenant.id,
      documentId: params.documentId,
      session,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove the route link.";
    if (message === "Document not found in this workspace.") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }

    console.error("Failed to remove an evidence route link", {
      documentId: (await context.params).documentId,
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Unable to remove the route link right now." },
      { status: 500 },
    );
  }
}
