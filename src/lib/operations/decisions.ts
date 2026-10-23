import { revalidateTag } from "next/cache";
import { and, eq } from "drizzle-orm";

import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { auditLogs, shipments } from "@/lib/db/schema";
import type {
  ReconciliationEvaluation,
  ShipmentLifecycle,
} from "@/lib/reconciliation/types";

export type RouteDecisionVerdict = "approved" | "hold";

export type RouteDecision = {
  verdict: RouteDecisionVerdict;
  note: string | null;
  decidedByUserId: string;
  decidedByName: string | null;
  decidedAt: string;
};

const DECISION_METADATA_KEY = "decision";

export type RouteApprovalReadiness = {
  canApprove: boolean;
  blockers: string[];
};

export function evaluateRouteApprovalReadiness(input: {
  lifecycle: ShipmentLifecycle;
  evaluation: ReconciliationEvaluation;
}): RouteApprovalReadiness {
  const blockers: string[] = [];

  if (input.lifecycle !== "delivered") {
    blockers.push("route_not_delivered");
  }

  for (const requirement of input.evaluation.requirements) {
    if (
      requirement.status !== "not_required_yet" &&
      requirement.status !== "matched"
    ) {
      blockers.push(`requirement:${requirement.code}`);
    }
  }

  for (const exception of input.evaluation.exceptions) {
    if (exception.blocking) {
      blockers.push(`exception:${exception.type}`);
    }
  }

  return {
    canApprove: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

export function parseRouteDecision(
  metadata: Record<string, unknown> | null | undefined,
): RouteDecision | null {
  const raw = metadata?.[DECISION_METADATA_KEY];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (record.verdict !== "approved" && record.verdict !== "hold") {
    return null;
  }

  if (typeof record.decidedByUserId !== "string" || typeof record.decidedAt !== "string") {
    return null;
  }

  return {
    verdict: record.verdict,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
    decidedByUserId: record.decidedByUserId,
    decidedByName: typeof record.decidedByName === "string" ? record.decidedByName : null,
    decidedAt: record.decidedAt,
  };
}

type DecisionActor = {
  tenantId: string;
  userId: string;
  userName: string | null;
};

async function loadShipmentMetadata(tenantId: string, shipmentId: string) {
  const database = requireDb();
  const [row] = await database
    .select({ id: shipments.id, metadata: shipments.metadata })
    .from(shipments)
    .where(and(eq(shipments.tenantId, tenantId), eq(shipments.id, shipmentId)))
    .limit(1);

  if (!row) {
    throw new Error("Route not found in this workspace.");
  }

  return row;
}

export async function recordRouteDecision(args: {
  actor: DecisionActor;
  shipmentId: string;
  verdict: RouteDecisionVerdict;
  note?: string | null;
}): Promise<RouteDecision> {
  const database = requireDb();
  const row = await loadShipmentMetadata(args.actor.tenantId, args.shipmentId);
  const note = args.note?.trim() ? args.note.trim() : null;

  const decision: RouteDecision = {
    verdict: args.verdict,
    note,
    decidedByUserId: args.actor.userId,
    decidedByName: args.actor.userName,
    decidedAt: new Date().toISOString(),
  };

  await database.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({
        metadata: { ...(row.metadata ?? {}), [DECISION_METADATA_KEY]: decision },
        updatedAt: new Date(),
      })
      .where(and(eq(shipments.tenantId, args.actor.tenantId), eq(shipments.id, args.shipmentId)));

    await tx.insert(auditLogs).values({
      tenantId: args.actor.tenantId,
      entityType: "shipment",
      entityId: args.shipmentId,
      action: args.verdict === "approved" ? "decision.approved" : "decision.hold",
      actorType: "user",
      actorUserId: args.actor.userId,
      summary:
        args.verdict === "approved"
          ? "Approved carrier payment for this route"
          : "Placed this route on hold",
      payload: { note },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.actor.tenantId), "max");

  return decision;
}

export async function clearRouteDecision(args: {
  actor: DecisionActor;
  shipmentId: string;
}): Promise<void> {
  const database = requireDb();
  const row = await loadShipmentMetadata(args.actor.tenantId, args.shipmentId);
  const currentMetadata = { ...(row.metadata ?? {}) };

  if (!(DECISION_METADATA_KEY in currentMetadata)) {
    return;
  }

  delete currentMetadata[DECISION_METADATA_KEY];

  await database.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({ metadata: currentMetadata, updatedAt: new Date() })
      .where(and(eq(shipments.tenantId, args.actor.tenantId), eq(shipments.id, args.shipmentId)));

    await tx.insert(auditLogs).values({
      tenantId: args.actor.tenantId,
      entityType: "shipment",
      entityId: args.shipmentId,
      action: "decision.cleared",
      actorType: "user",
      actorUserId: args.actor.userId,
      summary: "Reverted the payment decision for this route",
    });
  });

  revalidateTag(dashboardSnapshotTag(args.actor.tenantId), "max");
}
