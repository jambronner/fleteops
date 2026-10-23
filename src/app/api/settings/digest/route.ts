import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { digestFrequencies, setDigestFrequency } from "@/lib/digest/preferences";

export const runtime = "nodejs";

const payloadSchema = z.object({
  frequency: z.enum(digestFrequencies),
});

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const payload = payloadSchema.parse(await request.json());

  await setDigestFrequency(session.user.id, session.tenant.id, payload.frequency);

  return NextResponse.json({ ok: true, frequency: payload.frequency });
}
