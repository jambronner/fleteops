import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthBaseUrlFromRequest } from "@/lib/auth/base-url";
import { db } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildWorkspaceInviteRedirectUrl, normalizeWorkspaceInviteEmail } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";

const signUpSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
});

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const appUrl = resolveAuthBaseUrlFromRequest(request);
  const formData = await request.formData();
  const parsed = signUpSchema.safeParse({
    fullName: normalizeText(formData.get("fullName")),
    email: normalizeText(formData.get("email")),
    password: normalizeText(formData.get("password")),
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/login?error=invalid", appUrl));
  }

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=db", appUrl));
  }

  if (!db) {
    return NextResponse.redirect(new URL("/login?error=db", appUrl));
  }

  const repository = createDrizzleWorkspaceInviteRepository();
  const email = normalizeWorkspaceInviteEmail(parsed.data.email);
  const pendingInvites = await repository.findPendingInvitesByEmail(email, new Date());

  if (pendingInvites.length === 0) {
    return NextResponse.redirect(new URL("/login?error=invite-required", appUrl));
  }

  const { error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: buildWorkspaceInviteRedirectUrl(appUrl).toString(),
      data: {
        full_name: parsed.data.fullName,
      },
    },
  });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=invalid", appUrl));
  }

  return NextResponse.redirect(new URL("/login?status=check-email", appUrl));
}
