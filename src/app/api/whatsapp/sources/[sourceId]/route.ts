import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { canManageCounterparties } from "@/lib/partners/policy";
import {
  discardHeldWhatsappMessagesForSource,
  processHeldWhatsappMessagesForSource,
} from "@/inngest/functions/process-whatsapp-message";
import { updateWhatsappSourceStatus } from "@/lib/whatsapp/sources";

export const runtime = "nodejs";

const statusSchema = z.object({
  status: z.enum(["active", "ignored", "blocked", "unclaimed"]),
});

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to manage WhatsApp sources."
    : "No tienes permiso para administrar fuentes de WhatsApp.";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageCounterparties(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const { sourceId } = await params;
    const payload = statusSchema.parse(await request.json());

    await updateWhatsappSourceStatus({
      session,
      sourceId,
      status: payload.status,
    });

    const heldMessages = payload.status === "active"
      ? await processHeldWhatsappMessagesForSource({
          tenantId: session.tenant.id,
          sourceId,
        })
      : payload.status === "blocked" || payload.status === "ignored"
        ? await discardHeldWhatsappMessagesForSource({
            tenantId: session.tenant.id,
            sourceId,
            status: payload.status,
          })
        : null;

    return NextResponse.json({ ok: true, heldMessages });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update WhatsApp source.",
      },
      { status: 400 },
    );
  }
}
