import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getAppHomePathForHost } from "@/lib/app-routing";
import { authRedirectPathMatches, PASSWORD_RESET_PATH, resolveSupabaseAuthRedirectPath } from "@/lib/auth/redirects";
import { buildSupabaseImplicitCallbackBridgeHtml } from "@/lib/auth/supabase-callback-bridge";
import { resolveWorkspaceAccessAfterSupabaseAuth } from "@/lib/auth/supabase-workspace-access";
import { db } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { workspaceNoAccessPath } from "@/lib/workspaces/invite-flow";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const code = requestUrl.searchParams.get("code");
  const next = resolveSupabaseAuthRedirectPath(request.url, getAppHomePathForHost(request.headers.get("host")));
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=db", request.url));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      if (!authRedirectPathMatches(next, PASSWORD_RESET_PATH)) {
        if (!db) {
          return NextResponse.redirect(new URL("/login?error=db", request.url));
        }

        const access = await resolveWorkspaceAccessAfterSupabaseAuth(supabase);

        if (access.activeMemberships.length === 0) {
          return NextResponse.redirect(new URL(workspaceNoAccessPath, request.url));
        }
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  if (!code) {
    return new NextResponse(buildSupabaseImplicitCallbackBridgeHtml(next), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  if (!authRedirectPathMatches(next, PASSWORD_RESET_PATH)) {
    if (!db) {
      return NextResponse.redirect(new URL("/login?error=db", request.url));
    }

    const access = await resolveWorkspaceAccessAfterSupabaseAuth(supabase);

    if (access.activeMemberships.length === 0) {
      return NextResponse.redirect(new URL(workspaceNoAccessPath, request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
