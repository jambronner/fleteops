import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clearFolioStatus, recordFolioStatus } from "@/lib/operations/folio";

export const runtime = "nodejs";

const payloadSchema = z.object({
  status: z.enum(["received", "waived", "clear"]),
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

  const canRecord =
    hasPermission(session.permissions, "review.resolve") ||
    hasPermission(session.permissions, "finance.write");

  if (!canRecord) {
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

    if (payload.status === "clear") {
      await clearFolioStatus({ actor, shipmentId: parsedShipmentId });
      return NextResponse.json({ ok: true, folio: null });
    }

    const folio = await recordFolioStatus({
      actor,
      shipmentId: parsedShipmentId,
      status: payload.status,
      note: payload.note,
    });

    return NextResponse.json({ ok: true, folio });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, error: "Invalid folio status request." },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to record the folio status.";
    const status = message.includes("not found") ? 404 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
