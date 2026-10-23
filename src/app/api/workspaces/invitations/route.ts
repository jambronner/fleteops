import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { getAppUrl } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { createWorkspaceInvite, WorkspaceInviteFlowError } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";
import {
  createEmailSupabaseClient,
  createSupabaseInviteEmailAuthClient,
} from "@/lib/workspaces/supabase-invite-email";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "operator", "finance", "viewer"]).default("viewer"),
});

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveAuthBaseUrl(request: NextRequest) {
  const configuredAppUrl = getAppUrl();
  const requestOrigin = new URL(request.url).origin;

  if (configuredAppUrl.includes("localhost") && !requestOrigin.includes("localhost")) {
    return requestOrigin;
  }

  return configuredAppUrl;
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session || !hasPermission(session.permissions, "membership.manage")) {
    return NextResponse.json({ ok: false, error: "Membership admin access is required." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isFormRequest =
    contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  const rawPayload = isFormRequest
    ? await request.formData().then((formData) => ({
        email: normalizeText(formData.get("email")),
        role: normalizeText(formData.get("role")) || "viewer",
      }))
    : await request.json();
  const parsed = inviteSchema.safeParse(rawPayload);

  if (!parsed.success) {
    if (isFormRequest) {
      return NextResponse.redirect(new URL("/settings?invite=invalid", request.url), 303);
    }

    return NextResponse.json({ ok: false, error: "Invalid invitation payload." }, { status: 400 });
  }

  const payload = parsed.data;
  const supabaseAdmin = createAdminSupabaseClient();
  const supabaseEmail = createEmailSupabaseClient();

  if (!supabaseAdmin || !supabaseEmail) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 503 });
  }

  const now = new Date();

  try {
    const result = await createWorkspaceInvite({
      actor: {
        tenantId: session.tenant.id,
        userId: session.user.id,
      },
      input: payload,
      appUrl: resolveAuthBaseUrl(request),
      now,
      repository: createDrizzleWorkspaceInviteRepository(),
      auth: createSupabaseInviteEmailAuthClient(supabaseAdmin, supabaseEmail),
    });

    if (isFormRequest) {
      return NextResponse.redirect(new URL("/settings?invite=sent", request.url), 303);
    }

    return NextResponse.json(
      {
        ok: true,
        invite: {
          id: result.invite.id,
          email: result.invite.email,
          role: result.invite.role,
          status: result.invite.status,
          expiresAt: result.invite.expiresAt,
        },
        deliveryKind: result.deliveryKind,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof WorkspaceInviteFlowError) {
      const status = error.code === "already_member" ? 409 : 400;
      if (isFormRequest) {
        return NextResponse.redirect(new URL(`/settings?invite=${error.code}`, request.url), 303);
      }

      return NextResponse.json({ ok: false, error: error.message }, { status });
    }

    const message = error instanceof Error ? error.message : "Unable to create invite.";
    if (isFormRequest) {
      return NextResponse.redirect(new URL("/settings?invite=error", request.url), 303);
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
