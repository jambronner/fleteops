import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import type { AppSession } from "@/lib/auth/session";
import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { auditLogs, intakeEvents, reviewTasks, shipments } from "@/lib/db/schema";
import {
  parseRouteChangeProposal,
  routeDateValuesMatch,
  type RouteChangeDecision,
} from "@/lib/review-tasks/route-change-proposal";

type RouteChangeDecisionErrorCode =
  | "not_found"
  | "invalid_proposal"
  | "already_decided"
  | "route_changed"
  | "route_cancelled";

export class RouteChangeDecisionError extends Error {
  code: RouteChangeDecisionErrorCode;

  constructor(code: RouteChangeDecisionErrorCode, message: string) {
    super(message);
    this.name = "RouteChangeDecisionError";
    this.code = code;
  }
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

export async function dismissReviewTaskForTenant(args: {
  tenantId: string;
  taskId: string;
  session: AppSession;
}) {
  const database = requireDb();

  const [task] = await database
    .select({
      id: reviewTasks.id,
      title: reviewTasks.title,
      details: reviewTasks.details,
      status: reviewTasks.status,
      priority: reviewTasks.priority,
      subjectType: reviewTasks.subjectType,
      subjectId: reviewTasks.subjectId,
      metadata: reviewTasks.metadata,
    })
    .from(reviewTasks)
    .where(and(eq(reviewTasks.id, args.taskId), eq(reviewTasks.tenantId, args.tenantId)))
    .limit(1);

  if (!task) {
    throw new Error("Review task not found in this workspace.");
  }

  if (parseRouteChangeProposal(task.metadata)) {
    throw new RouteChangeDecisionError(
      "invalid_proposal",
      "Approve or reject this route change from its decision controls.",
    );
  }

  if (task.status === "dismissed" || task.status === "resolved") {
    return task;
  }

  await database.transaction(async (tx) => {
    await tx
      .update(reviewTasks)
      .set({
        status: "dismissed",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(reviewTasks.id, args.taskId), eq(reviewTasks.tenantId, args.tenantId)));

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      entityType: "review_task",
      entityId: args.taskId,
      action: "dismissed",
      actorType: "user",
      actorUserId: args.session.user.id,
      summary: `Dismissed review task ${task.title}`,
      payload: {
        title: task.title,
        details: task.details,
        priority: task.priority,
        subjectType: task.subjectType,
        subjectId: task.subjectId,
        metadata: task.metadata,
      },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");

  return task;
}

export async function decideRouteChangeProposalForTenant(args: {
  tenantId: string;
  taskId: string;
  decision: RouteChangeDecision;
  session: AppSession;
}) {
  const database = requireDb();

  const result = await database.transaction(async (tx) => {
    const [task] = await tx
      .select({
        id: reviewTasks.id,
        title: reviewTasks.title,
        status: reviewTasks.status,
        subjectType: reviewTasks.subjectType,
        subjectId: reviewTasks.subjectId,
        metadata: reviewTasks.metadata,
      })
      .from(reviewTasks)
      .where(and(eq(reviewTasks.id, args.taskId), eq(reviewTasks.tenantId, args.tenantId)))
      .limit(1)
      .for("update");

    if (!task) {
      throw new RouteChangeDecisionError("not_found", "Route change proposal not found in this workspace.");
    }

    if (task.status === "resolved" || task.status === "dismissed") {
      throw new RouteChangeDecisionError("already_decided", "This route change proposal was already decided.");
    }

    const proposal = parseRouteChangeProposal(task.metadata);

    if (!proposal) {
      throw new RouteChangeDecisionError("invalid_proposal", "This review item is not an actionable route change proposal.");
    }

    const [shipment] = await tx
      .select({
        id: shipments.id,
        status: shipments.status,
        pickupDate: shipments.pickupDate,
        deliveryDateExpected: shipments.deliveryDateExpected,
        deliveryDateActual: shipments.deliveryDateActual,
        metadata: shipments.metadata,
      })
      .from(shipments)
      .where(
        and(
          eq(shipments.id, proposal.routeResolution.shipmentId),
          eq(shipments.tenantId, args.tenantId),
        ),
      )
      .limit(1)
      .for("update");

    if (!shipment) {
      throw new RouteChangeDecisionError("not_found", "The proposed route no longer exists in this workspace.");
    }

    if (shipment.status === "cancelled" && args.decision === "approve") {
      throw new RouteChangeDecisionError("route_cancelled", "A cancelled route cannot accept AI-proposed changes.");
    }

    const currentValues = {
      pickupDate: shipment.pickupDate,
      deliveryDateExpected: shipment.deliveryDateExpected,
      deliveryDateActual: shipment.deliveryDateActual,
    };

    if (args.decision === "approve" && !routeDateValuesMatch(currentValues, proposal.currentValues)) {
      throw new RouteChangeDecisionError(
        "route_changed",
        "The route changed after this proposal was created. Review the current route before deciding.",
      );
    }

    const decidedAt = new Date();
    const decisionMetadata = {
      outcome: args.decision === "approve" ? "approved" : "rejected",
      decidedAt: decidedAt.toISOString(),
      decidedByUserId: args.session.user.id,
      decidedByName: args.session.user.fullName,
    };

    if (args.decision === "approve") {
      const currentMetadata = metadataRecord(shipment.metadata);

      await tx
        .update(shipments)
        .set({
          pickupDate: proposal.proposedUpdates.pickupDate ?? undefined,
          deliveryDateExpected: proposal.proposedUpdates.deliveryDateExpected ?? undefined,
          deliveryDateActual: proposal.proposedUpdates.deliveryDateActual ?? undefined,
          metadata: {
            ...currentMetadata,
            lastIntakeAction: {
              action: "update_route",
              reviewTaskId: task.id,
              intakeEventId: task.subjectType === "intake_event" ? task.subjectId : null,
              updates: proposal.proposedUpdates,
              confidence: proposal.confidence,
              approvedByUserId: args.session.user.id,
              approvedAt: decidedAt.toISOString(),
            },
          },
          updatedAt: decidedAt,
        })
        .where(and(eq(shipments.id, shipment.id), eq(shipments.tenantId, args.tenantId)));
    }

    await tx
      .update(reviewTasks)
      .set({
        status: args.decision === "approve" ? "resolved" : "dismissed",
        resolvedAt: decidedAt,
        metadata: {
          ...metadataRecord(task.metadata),
          decision: decisionMetadata,
        },
        updatedAt: decidedAt,
      })
      .where(and(eq(reviewTasks.id, task.id), eq(reviewTasks.tenantId, args.tenantId)));

    if (task.subjectType === "intake_event") {
      const [event] = await tx
        .select({ metadata: intakeEvents.metadata })
        .from(intakeEvents)
        .where(and(eq(intakeEvents.id, task.subjectId), eq(intakeEvents.tenantId, args.tenantId)))
        .limit(1);

      if (event) {
        await tx
          .update(intakeEvents)
          .set({
            status: "classified",
            metadata: {
              ...metadataRecord(event.metadata),
              proposalDecision: decisionMetadata,
            },
            updatedAt: decidedAt,
          })
          .where(and(eq(intakeEvents.id, task.subjectId), eq(intakeEvents.tenantId, args.tenantId)));
      }
    }

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      entityType: "shipment",
      entityId: shipment.id,
      action:
        args.decision === "approve"
          ? "ai_route_change_approved"
          : "ai_route_change_rejected",
      actorType: "user",
      actorUserId: args.session.user.id,
      summary:
        args.decision === "approve"
          ? `Approved AI-proposed changes to route ${proposal.routeReference}.`
          : `Rejected AI-proposed changes to route ${proposal.routeReference}.`,
      payload: {
        reviewTaskId: task.id,
        intakeEventId: task.subjectType === "intake_event" ? task.subjectId : null,
        before: proposal.currentValues,
        proposed: proposal.proposedUpdates,
        applied: args.decision === "approve",
        confidence: proposal.confidence,
        classification: proposal.classification ?? null,
        source: proposal.source ?? null,
      },
    });

    return {
      taskId: task.id,
      shipmentId: shipment.id,
      routeReference: proposal.routeReference,
      decision: args.decision,
      applied: args.decision === "approve",
    };
  });

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");
  return result;
}
