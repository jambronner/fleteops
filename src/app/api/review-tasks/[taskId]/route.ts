import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import {
  dismissReviewTaskForTenant,
  RouteChangeDecisionError,
} from "@/lib/review-tasks/repository";

export const runtime = "nodejs";

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to dismiss review items."
    : "No tienes permiso para descartar elementos de revisión.";
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const canManage =
    hasPermission(session.permissions, "document.write") || hasPermission(session.permissions, "shipment.write");

  if (!canManage) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const params = await context.params;
    const dismissed = await dismissReviewTaskForTenant({
      tenantId: session.tenant.id,
      taskId: params.taskId,
      session,
    });

    return NextResponse.json({ ok: true, dismissed });
  } catch (error) {
    if (error instanceof RouteChangeDecisionError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 409 },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to dismiss review task.";
    const status = message === "Review task not found in this workspace." ? 404 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
