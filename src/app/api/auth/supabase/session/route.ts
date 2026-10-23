import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { getAppHomePathForHost } from "@/lib/app-routing";
import {
  authRedirectPathMatches,
  PASSWORD_RESET_PATH,
  resolveSupabaseAuthRedirectPathFromValue,
} from "@/lib/auth/redirects";
import {
  activeTenantCookieName,
  createSessionCookieValue,
  getSessionCookieOptions,
  selectSessionTenantId,
  sessionCookieName,
} from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptWorkspaceInvitesForSupabaseUser, workspaceNoAccessPath } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";

export const runtime = "nodejs";

type SessionCompletionPayload = {
  accessToken?: unknown;
  next?: unknown;
  refreshToken?: unknown;
};

function redirectJson(request: NextRequest, path: string, status = 200) {
  const redirectTo = new URL(path, request.url);

  return NextResponse.json({ redirectTo: `${redirectTo.pathname}${redirectTo.search}` }, { status });
}

async function readSessionCompletionPayload(request: NextRequest): Promise<SessionCompletionPayload> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  try {
    return (await request.json()) as SessionCompletionPayload;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const supabase = await createServerSupabaseClient();

  if (!supabase || !db) {
    return redirectJson(request, "/login?error=db", 500);
  }

  const payload = await readSessionCompletionPayload(request);
  const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : null;
  const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : null;
  const fallbackPath = getAppHomePathForHost(request.headers.get("host"));
  const nextPath =
    typeof payload.next === "string"
      ? resolveSupabaseAuthRedirectPathFromValue(payload.next, new URL(request.url).origin, fallbackPath)
      : fallbackPath;

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      return redirectJson(request, "/login?error=invalid", 401);
    }
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return redirectJson(request, "/login?error=invalid", 401);
  }

  if (authRedirectPathMatches(nextPath, PASSWORD_RESET_PATH)) {
    return redirectJson(request, nextPath);
  }

  const access = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: user.id,
      email: user.email,
      fullName:
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        null,
      preferredLocale:
        (typeof user.user_metadata?.preferred_locale === "string" && user.user_metadata.preferred_locale) ||
        (typeof user.user_metadata?.locale === "string" && user.user_metadata.locale) ||
        null,
    },
    now: new Date(),
    repository: createDrizzleWorkspaceInviteRepository(),
  });

  if (access.activeMemberships.length === 0) {
    return redirectJson(request, workspaceNoAccessPath);
  }

  const tenantId = selectSessionTenantId({
    memberships: access.activeMemberships,
    preferredTenantId: request.cookies.get(activeTenantCookieName)?.value ?? null,
  });

  if (!tenantId) {
    return redirectJson(request, workspaceNoAccessPath);
  }

  // Mint the application session here, in a route handler, because this is the
  // only auth context that can persist cookies. Page renders then read this
  // cookie instead of re-resolving identity against Supabase.
  const response = redirectJson(request, nextPath);
  response.cookies.set(
    sessionCookieName,
    createSessionCookieValue({ userId: access.userId, tenantId }),
    getSessionCookieOptions(),
  );

  return response;
}
