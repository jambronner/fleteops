import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthBaseUrlFromRequest } from "@/lib/auth/base-url";
import { buildSupabaseAuthCallbackUrl } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const contentType = request.headers.get("content-type") ?? "";
  const appUrl = resolveAuthBaseUrlFromRequest(request);
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.redirect(new URL("/login?error=db", appUrl), 303);
    }

    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const email =
    contentType.includes("application/x-www-form-urlencoded")
      ? normalizeText(new URLSearchParams(await request.text()).get("email"))
      : normalizeText((await request.formData()).get("email"));

  if (!email) {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.redirect(new URL("/login?error=invalid", appUrl), 303);
    }

    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const redirectTo = buildSupabaseAuthCallbackUrl(appUrl);

  const { error } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo.toString(),
    },
  });

  if (error) {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.redirect(new URL("/login?error=invalid", appUrl), 303);
    }

    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.redirect(new URL("/login?status=magic-link-sent", appUrl), 303);
  }

  return NextResponse.json({ ok: true });
}
