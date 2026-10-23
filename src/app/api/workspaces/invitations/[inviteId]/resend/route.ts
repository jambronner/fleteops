import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getAppUrl } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { resendWorkspaceInvite, WorkspaceInviteFlowError } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";
import {
  createEmailSupabaseClient,
  createSupabaseInviteEmailAuthClient,
} from "@/lib/workspaces/supabase-invite-email";

function resolveAuthBaseUrl(request: NextRequest) {
  const configuredAppUrl = getAppUrl();
  const requestOrigin = new URL(request.url).origin;

  if (configuredAppUrl.includes("localhost") && !requestOrigin.includes("localhost")) {
    return requestOrigin;
  }

  return configuredAppUrl;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.redirect(new URL("/settings?invite=error", request.url), 303);
  }

  const session = await getOptionalSession();

  if (!session || !hasPermission(session.permissions, "membership.manage")) {
    return NextResponse.redirect(new URL("/settings?invite=forbidden", request.url), 303);
  }

  const supabaseAdmin = createAdminSupabaseClient();
  const supabaseEmail = createEmailSupabaseClient();

  if (!supabaseAdmin || !supabaseEmail) {
    return NextResponse.redirect(new URL("/settings?invite=error", request.url), 303);
  }

  const { inviteId } = await params;

  try {
    await resendWorkspaceInvite({
      actor: {
        tenantId: session.tenant.id,
        userId: session.user.id,
      },
      inviteId,
      appUrl: resolveAuthBaseUrl(request),
      now: new Date(),
      repository: createDrizzleWorkspaceInviteRepository(),
      auth: createSupabaseInviteEmailAuthClient(supabaseAdmin, supabaseEmail),
    });

    return NextResponse.redirect(new URL("/settings?invite=resent", request.url), 303);
  } catch (error) {
    if (error instanceof WorkspaceInviteFlowError) {
      return NextResponse.redirect(new URL(`/settings?invite=${error.code}`, request.url), 303);
    }

    return NextResponse.redirect(new URL("/settings?invite=error", request.url), 303);
  }
}
