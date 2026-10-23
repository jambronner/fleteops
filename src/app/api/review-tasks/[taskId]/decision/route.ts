import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import {
  decideRouteChangeProposalForTenant,
  RouteChangeDecisionError,
} from "@/lib/review-tasks/repository";

export const runtime = "nodejs";

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to decide route changes."
    : "No tienes permiso para decidir cambios de ruta.";
}

function statusForDecisionError(error: RouteChangeDecisionError) {
  switch (error.code) {
    case "not_found":
      return 404;
    case "already_decided":
    case "route_changed":
    case "route_cancelled":
      return 409;
    case "invalid_proposal":
      return 400;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!hasPermission(session.permissions, "shipment.write")) {
    return NextResponse.json(
      { ok: false, error: forbiddenMessage(session.tenant.locale) },
      { status: 403 },
    );
  }

  try {
    const params = await context.params;
    const payload = decisionSchema.parse(await request.json());
    const result = await decideRouteChangeProposalForTenant({
      tenantId: session.tenant.id,
      taskId: params.taskId,
      decision: payload.decision,
      session,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid decision." },
        { status: 400 },
      );
    }

    if (error instanceof RouteChangeDecisionError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: statusForDecisionError(error) },
      );
    }

    console.error("Failed to decide AI route change proposal", { error });
    return NextResponse.json(
      { ok: false, error: "Unable to decide this route change right now." },
      { status: 500 },
    );
  }
}
