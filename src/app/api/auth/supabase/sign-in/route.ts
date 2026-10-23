import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { getAppHomePathForHost } from "@/lib/app-routing";
import { db } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptWorkspaceInvitesForSupabaseUser, workspaceNoAccessPath } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const formData = await request.formData();
  const email = normalizeText(formData.get("email")).toLowerCase();
  const password = normalizeText(formData.get("password"));
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=db", request.url));
  }

  if (!db) {
    return NextResponse.redirect(new URL("/login?error=db", request.url));
  }

  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/login?error=not-found", request.url));
  }

  const access = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: data.user.id,
      email: data.user.email,
      fullName:
        (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
        (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
        null,
      preferredLocale:
        (typeof data.user.user_metadata?.preferred_locale === "string" && data.user.user_metadata.preferred_locale) ||
        (typeof data.user.user_metadata?.locale === "string" && data.user.user_metadata.locale) ||
        null,
    },
    now: new Date(),
    repository: createDrizzleWorkspaceInviteRepository(),
  });

  if (access.activeMemberships.length === 0) {
    return NextResponse.redirect(new URL(workspaceNoAccessPath, request.url));
  }

  return NextResponse.redirect(new URL(getAppHomePathForHost(request.headers.get("host")), request.url));
}
