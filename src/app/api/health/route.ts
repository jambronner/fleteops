import { isDemoMode } from "@/lib/runtime-mode";
import { NextResponse } from "next/server";

import { env, getAppUrl } from "@/lib/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";

type AuthProvider = "supabase" | "local" | null;

function normalizeAuthProvider(authProviderRaw: string): AuthProvider {
  if (authProviderRaw === "supabase") {
    return "supabase";
  }

  if (authProviderRaw === "local") {
    return "local";
  }

  return null;
}

function isAppUrlOk(appUrl: string): boolean {
  return appUrl.startsWith("https://") && !appUrl.includes("localhost");
}

/**
 * Pure builder for the health-check payload. Kept separate from GET() so it
 * can be unit tested without a real request/env, and so it never has direct
 * access to anything secret (only booleans/derived values are passed in).
 */
export function buildHealthPayload(input: {
  commitSha: string | null;
  appUrl: string;
  authProviderRaw: string;
  authConfigured: boolean;
}) {
  return {
    ok: true,
    service: "fleteops-ai",
    timestamp: new Date().toISOString(),
    commit: input.commitSha,
    authProvider: normalizeAuthProvider(input.authProviderRaw),
    authConfigured: input.authConfigured,
    appUrlOk: isAppUrlOk(input.appUrl),
  };
}

export async function GET() {
  if (isDemoMode()) return NextResponse.json({ ok: true, service: "fleteops", mode: "demo" });
  const payload = buildHealthPayload({
    commitSha: process.env.APP_COMMIT_SHA ?? null,
    appUrl: getAppUrl(),
    authProviderRaw: env.AUTH_PROVIDER,
    authConfigured: isSupabaseAuthEnabled(),
  });

  return NextResponse.json(payload);
}
