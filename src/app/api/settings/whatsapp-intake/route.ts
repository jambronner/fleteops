import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import {
  canManageWhatsappIntakeSettings,
  parseWhatsappIntakeNumberUpdatePayload,
  updateWhatsappIntakeChannelPhoneNumber,
} from "@/lib/intake/channels";

export const runtime = "nodejs";

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to manage workspace settings."
    : "No tienes permiso para administrar la configuración del espacio.";
}

export async function PATCH(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageWhatsappIntakeSettings(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = parseWhatsappIntakeNumberUpdatePayload(await request.json());
    const channel = await updateWhatsappIntakeChannelPhoneNumber(session, payload);

    return NextResponse.json({ ok: true, channel });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid WhatsApp intake settings." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update WhatsApp intake settings.",
      },
      {
        status: error instanceof Error && error.message === "Database is not configured." ? 503 : 400,
      },
    );
  }
}
