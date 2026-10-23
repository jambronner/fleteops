import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  clearRouteDecision,
  evaluateRouteApprovalReadiness,
  recordRouteDecision,
} from "@/lib/operations/decisions";
import { getCurrentShipmentDetail } from "@/lib/reconciliation/queries";

export const runtime = "nodejs";

const payloadSchema = z.object({
  verdict: z.enum(["approved", "hold", "clear"]),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const canDecide =
    hasPermission(session.permissions, "review.resolve") ||
    hasPermission(session.permissions, "finance.write");

  if (!canDecide) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  try {
    const { shipmentId } = await params;
    const parsedShipmentId = z.string().uuid().parse(shipmentId);
    const payload = payloadSchema.parse(await request.json());
    const actor = {
      tenantId: session.tenant.id,
      userId: session.user.id,
      userName: session.user.fullName ?? session.user.email,
    };

    if (payload.verdict === "clear") {
      await clearRouteDecision({ actor, shipmentId: parsedShipmentId });
      return NextResponse.json({ ok: true, decision: null });
    }

    if (payload.verdict === "approved") {
      const current = await getCurrentShipmentDetail(
        session.tenant.id,
        parsedShipmentId,
        session.tenant.locale,
      );

      if (!current) {
        return NextResponse.json(
          { ok: false, error: "Route not found in this workspace." },
          { status: 404 },
        );
      }

      const readiness = evaluateRouteApprovalReadiness({
        lifecycle: current.packet.lifecycle,
        evaluation: current.evaluation,
      });

      if (!readiness.canApprove) {
        return NextResponse.json(
          {
            ok: false,
            code: "route_not_ready_for_payment",
            error:
              "Complete the required evidence and resolve blocking discrepancies before approving payment.",
            blockers: readiness.blockers,
          },
          { status: 409 },
        );
      }
    }

    const decision = await recordRouteDecision({
      actor,
      shipmentId: parsedShipmentId,
      verdict: payload.verdict,
      note: payload.note,
    });

    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, error: "Invalid route decision request." },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to record the decision.";
    const status = message.includes("not found") ? 404 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
