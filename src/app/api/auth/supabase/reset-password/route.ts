import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthBaseUrlFromRequest } from "@/lib/auth/base-url";
import { buildSupabaseAuthCallbackUrl, PASSWORD_RESET_PATH } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const contentType = request.headers.get("content-type") ?? "";
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const email =
    contentType.includes("application/x-www-form-urlencoded")
      ? normalizeText(new URLSearchParams(await request.text()).get("email"))
      : normalizeText((await request.formData()).get("email"));

  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const appUrl = resolveAuthBaseUrlFromRequest(request);
  const redirectTo = buildSupabaseAuthCallbackUrl(appUrl, PASSWORD_RESET_PATH);

  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
    redirectTo: redirectTo.toString(),
  });

  if (error) {
    console.error("Supabase password recovery request failed", {
      code: error.code,
      status: error.status,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to send a recovery email right now.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        "If this email belongs to an invited account, a recovery link will be sent.",
    },
    { status: 202 },
  );
}
