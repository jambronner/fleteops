import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { dismissOnboardingChecklist } from "@/lib/onboarding/checklist";

export const runtime = "nodejs";

export async function POST() {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dismissOnboardingChecklist(session.tenant.id, session.user.id);

  return NextResponse.json({ ok: true });
}
