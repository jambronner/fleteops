import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { removeWorkspaceMember, WorkspaceMemberManagementError } from "@/lib/workspaces/member-management";
import { createDrizzleWorkspaceMemberManagementRepository } from "@/lib/workspaces/member-management-repository";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.redirect(new URL("/settings?member=error", request.url), 303);
  }

  const session = await getOptionalSession();

  if (!session || !hasPermission(session.permissions, "membership.manage")) {
    return NextResponse.redirect(new URL("/settings?member=forbidden", request.url), 303);
  }

  const { memberId } = await params;

  try {
    await removeWorkspaceMember({
      actor: {
        tenantId: session.tenant.id,
        userId: session.user.id,
      },
      memberUserId: memberId,
      now: new Date(),
      repository: createDrizzleWorkspaceMemberManagementRepository(),
    });

    return NextResponse.redirect(new URL("/settings?member=removed", request.url), 303);
  } catch (error) {
    if (error instanceof WorkspaceMemberManagementError) {
      return NextResponse.redirect(new URL(`/settings?member=${error.code}`, request.url), 303);
    }

    return NextResponse.redirect(new URL("/settings?member=error", request.url), 303);
  }
}
