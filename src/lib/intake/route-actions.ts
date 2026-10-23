import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { extractServiceDateCandidates, type IntakeClassificationResult } from "@/lib/ai/intake";
import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { auditLogs, documentLinks, documents, intakeEvents, reviewTasks, shipments } from "@/lib/db/schema";
import {
  hasProposedRouteDateChanges,
  shouldRequireHumanRouteChangeApproval,
} from "@/lib/review-tasks/route-change-proposal";

type RouteActionIntakeArgs = {
  tenantId: string;
  intakeEventId: string;
  externalEventId: string;
  externalConversationId?: string | null;
  sourceChannel: "email" | "whatsapp";
  subject?: string | null;
  messageText?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  receivedAt?: string | null;
  classification: IntakeClassificationResult;
};

const MIN_ROUTE_DRAFT_CONFIDENCE = 0.55;
const MIN_ROUTE_UPDATE_CONFIDENCE = 0.7;

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8).toUpperCase();
}

function normalizeServiceDate(value?: string | null) {
  const cleaned = cleanNullable(value);

  if (!cleaned) {
    return null;
  }

  const isoDateMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDateMatch) {
    return cleaned;
  }

  const regionalDateMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);

  if (!regionalDateMatch) {
    return null;
  }

  const day = regionalDateMatch[1]?.padStart(2, "0");
  const month = regionalDateMatch[2]?.padStart(2, "0");
  const rawYear = regionalDateMatch[3] ?? String(new Date().getFullYear());
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function normalizeIsoDate(value?: string | null) {
  const normalized = normalizeServiceDate(value);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  const [year, month, day] = normalized.split("-").map(Number);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function revalidateDashboardSnapshot(tenantId: string) {
  try {
    revalidateTag(dashboardSnapshotTag(tenantId), "max");
  } catch {
    // Intake processing may run outside a Next request context during replays or workers.
  }
}

function buildRouteReference(args: RouteActionIntakeArgs) {
  const subject = cleanNullable(args.subject);

  if (subject) {
    return truncate(subject.replace(/^re:\s*/i, "").replace(/^fwd?:\s*/i, ""), 128);
  }

  const customerName = cleanNullable(args.classification.clues.customerName);
  const locationName = cleanNullable(args.classification.clues.locationName);
  const serviceDate = cleanNullable(args.classification.clues.serviceDate);
  const label = [customerName, locationName, serviceDate].filter(Boolean).join(" - ");

  if (label) {
    return truncate(label, 128);
  }

  return `EMAIL-${shortHash(args.externalEventId)}`;
}

function buildNotes(args: RouteActionIntakeArgs) {
  const sourceLabel = args.sourceChannel === "whatsapp" ? "a WhatsApp message" : "an inbound email route request";
  const lines = [
    `Created automatically from ${sourceLabel}.`,
    args.senderName || args.senderAddress
      ? `Sender: ${[args.senderName, args.senderAddress].filter(Boolean).join(" <")}${args.senderName && args.senderAddress ? ">" : ""}`
      : null,
    args.subject ? `Subject: ${args.subject}` : null,
    args.messageText ? `Message: ${truncate(args.messageText.replace(/\s+/g, " "), 900)}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function buildReviewTaskSourceMetadata(args: RouteActionIntakeArgs) {
  return {
    channel: args.sourceChannel,
    senderName: cleanNullable(args.senderName),
    senderAddress: cleanNullable(args.senderAddress),
    subject: cleanNullable(args.subject),
    externalConversationId: cleanNullable(args.externalConversationId),
    externalEventId: args.externalEventId,
    receivedAt: cleanNullable(args.receivedAt),
  };
}

function buildRouteUpdateValues(classification: IntakeClassificationResult) {
  const expectedCompletionDate = normalizeIsoDate(classification.updates.expectedCompletionDate);
  const actualCompletionDate = normalizeIsoDate(classification.updates.actualCompletionDate);
  const serviceDate = normalizeIsoDate(classification.updates.serviceDate);

  return {
    pickupDate: serviceDate,
    deliveryDateExpected: expectedCompletionDate,
    deliveryDateActual: actualCompletionDate,
  };
}

function hasRouteUpdateValues(values: ReturnType<typeof buildRouteUpdateValues>) {
  return Boolean(values.pickupDate || values.deliveryDateExpected || values.deliveryDateActual);
}

function routeUpdateReviewReason(args: {
  classification: IntakeClassificationResult;
  updateValues: ReturnType<typeof buildRouteUpdateValues>;
}) {
  if (!hasRouteUpdateValues(args.updateValues)) {
    return "The message requested a route update, but no explicit route value could be extracted.";
  }

  if (args.classification.needsReview) {
    return "The message requested a route update, but the target route or wording is ambiguous enough to require human review.";
  }

  if (args.classification.confidence < MIN_ROUTE_UPDATE_CONFIDENCE) {
    return "The message requested a route update, but classifier confidence was not high enough to change route data automatically.";
  }

  return "The message requested a route update, but it needs human review before changing route data.";
}

function getRouteDraftReviewReasonOrNull(args: {
  classification: IntakeClassificationResult;
  messageText?: string | null;
}) {
  const dateCandidates = extractServiceDateCandidates(args.messageText ?? "");

  if (dateCandidates.length > 1) {
    return "The message requested a route draft, but it contains multiple dates and the system cannot safely choose which one should drive the route schedule.";
  }

  if (args.classification.needsReview) {
    return "The message looked like a route request, but the classifier marked it for human review.";
  }

  if (args.classification.confidence < MIN_ROUTE_DRAFT_CONFIDENCE) {
    return "The message looked like a route request, but classifier confidence was not high enough to create a draft route automatically.";
  }

  return null;
}

export function shouldReviewRouteDraftFromIntake(args: {
  classification: IntakeClassificationResult;
  messageText?: string | null;
}) {
  return Boolean(getRouteDraftReviewReasonOrNull(args));
}

export function getRouteDraftReviewReason(args: {
  classification: IntakeClassificationResult;
  messageText?: string | null;
}) {
  return getRouteDraftReviewReasonOrNull(args) ?? "The route request needs human review before creating a draft.";
}

async function annotateIntakeActionResult(args: {
  tenantId: string;
  intakeEventId: string;
  status?: typeof intakeEvents.$inferSelect.status;
  actionResult: Record<string, unknown>;
}) {
  if (!db) {
    return;
  }

  const [event] = await db
    .select({
      id: intakeEvents.id,
      metadata: intakeEvents.metadata,
    })
    .from(intakeEvents)
    .where(and(eq(intakeEvents.id, args.intakeEventId), eq(intakeEvents.tenantId, args.tenantId)))
    .limit(1);

  if (!event) {
    return;
  }

  const nextMetadata = {
    ...metadataRecord(event.metadata),
    actionResult: {
      ...args.actionResult,
      recordedAt: new Date().toISOString(),
    },
  };

  await db
    .update(intakeEvents)
    .set({
      status: args.status,
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(intakeEvents.id, args.intakeEventId));
}

async function createIntakeReviewTask(args: {
  tenantId: string;
  intakeEventId: string;
  title: string;
  details: string;
  priority?: typeof reviewTasks.$inferSelect.priority;
  metadata?: Record<string, unknown>;
}) {
  if (!db) {
    return;
  }

  await db.insert(reviewTasks).values({
    tenantId: args.tenantId,
    subjectType: "intake_event",
    subjectId: args.intakeEventId,
    priority: args.priority ?? "normal",
    title: args.title,
    details: args.details,
    metadata: args.metadata,
  });

  revalidateDashboardSnapshot(args.tenantId);
}

/**
 * Pulls a route number out of free text ("Ruta 3", "route #5", "RUTA 12").
 * Operators and carrier invoices identify a route execution by the operating
 * day plus this number, so it doubles as a resolution key against the
 * shipments' first-class route identity columns.
 */
export function extractRouteNumberFromText(text: string | null | undefined): number | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\b(?:ruta|route)\s*#?\s*(\d{1,3})\b/i);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveShipmentFromIntakeContext(args: RouteActionIntakeArgs) {
  if (!db) {
    return {
      shipmentId: null,
      reason: "Database is not configured.",
      candidates: [] as string[],
    };
  }

  const externalConversationId = cleanNullable(args.externalConversationId);

  if (externalConversationId) {
    const conversationRows = await db
      .select({
        id: shipments.id,
      })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, args.tenantId),
          sql`${shipments.metadata}->>'externalConversationId' = ${externalConversationId}`,
        ),
      )
      .orderBy(desc(shipments.updatedAt))
      .limit(3);

    const conversationMatches = [...new Set(conversationRows.map((row) => row.id))];

    if (conversationMatches.length === 1) {
      return {
        shipmentId: conversationMatches[0],
        reason: `Matched the route from the same inbound ${args.sourceChannel} conversation.`,
        candidates: conversationMatches,
      };
    }

    if (conversationMatches.length > 1) {
      return {
        shipmentId: null,
        reason: `Multiple routes were tied to the same inbound ${args.sourceChannel} conversation.`,
        candidates: conversationMatches,
      };
    }

    const linkedDocumentRows = await db
      .select({
        shipmentId: documentLinks.targetId,
      })
      .from(documentLinks)
      .innerJoin(documents, eq(documents.id, documentLinks.documentId))
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.targetType, "shipment"),
          isNull(documents.archivedAt),
          sql`${documents.metadata}#>>'{provenance,threadId}' = ${externalConversationId}`,
        ),
      )
      .limit(5);

    const linkedDocumentMatches = [...new Set(linkedDocumentRows.map((row) => row.shipmentId))];

    if (linkedDocumentMatches.length === 1) {
      return {
        shipmentId: linkedDocumentMatches[0],
        reason: `Matched the route from evidence previously linked in the same ${args.sourceChannel} conversation.`,
        candidates: linkedDocumentMatches,
      };
    }

    if (linkedDocumentMatches.length > 1) {
      return {
        shipmentId: null,
        reason: `Multiple linked routes were found in the same ${args.sourceChannel} conversation.`,
        candidates: linkedDocumentMatches,
      };
    }
  }

  const routeReference = cleanNullable(args.classification.target.routeReference);
  const purchaseOrderNumber = cleanNullable(args.classification.target.purchaseOrderNumber);
  const explicitReference = routeReference ?? purchaseOrderNumber;

  if (explicitReference) {
    const referenceRows = await db
      .select({
        id: shipments.id,
      })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, args.tenantId),
          or(
            sql`lower(${shipments.internalShipmentNumber}) = lower(${explicitReference})`,
            sql`lower(${shipments.externalShipmentReference}) = lower(${explicitReference})`,
          ),
        ),
      )
      .limit(3);

    const referenceMatches = [...new Set(referenceRows.map((row) => row.id))];

    if (referenceMatches.length === 1) {
      return {
        shipmentId: referenceMatches[0],
        reason: "Matched the route from an explicit route or purchase-order reference.",
        candidates: referenceMatches,
      };
    }

    if (referenceMatches.length > 1) {
      return {
        shipmentId: null,
        reason: "Multiple routes matched the explicit route or purchase-order reference.",
        candidates: referenceMatches,
      };
    }
  }

  // Route identity fallback: an operating day plus a route number ("Ruta 3"
  // on the 18th) is how the team and carrier invoices name a route execution.
  // Matches against the shipments' first-class operation_date/route_code
  // columns, which the unique route-identity index keeps unambiguous.
  const routeNumber = extractRouteNumberFromText(
    [args.subject, args.messageText].filter(Boolean).join("\n"),
  );
  const clueServiceDate = normalizeIsoDate(args.classification.clues.serviceDate);
  const textDateCandidates = extractServiceDateCandidates(args.messageText ?? "");
  const serviceDate =
    clueServiceDate ?? (textDateCandidates.length === 1 ? normalizeIsoDate(textDateCandidates[0]) : null);

  if (routeNumber && serviceDate) {
    const routeCodeCandidates = [`ruta ${routeNumber}`, `route ${routeNumber}`, String(routeNumber)];
    const identityRows = await db
      .select({ id: shipments.id })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, args.tenantId),
          eq(shipments.operationDate, serviceDate),
          inArray(shipments.routeCode, routeCodeCandidates),
        ),
      )
      .limit(3);

    const identityMatches = [...new Set(identityRows.map((row) => row.id))];

    if (identityMatches.length === 1) {
      return {
        shipmentId: identityMatches[0],
        reason: `Matched the route by its operating day (${serviceDate}) and route number (${routeNumber}).`,
        candidates: identityMatches,
      };
    }

    if (identityMatches.length > 1) {
      return {
        shipmentId: null,
        reason: `Multiple routes matched operating day ${serviceDate} and route number ${routeNumber}.`,
        candidates: identityMatches,
      };
    }
  }

  return {
    shipmentId: null,
    reason: `No confident route target could be resolved from the ${args.sourceChannel} thread, linked evidence, or references.`,
    candidates: [] as string[],
  };
}

async function maybeApplyRouteUpdateFromIntake(args: RouteActionIntakeArgs) {
  if (!db) {
    return null;
  }

  if (args.classification.classification !== "route_request" || args.classification.action !== "update_route") {
    return null;
  }

  const updateValues = buildRouteUpdateValues(args.classification);

  if (
    args.classification.needsReview ||
    args.classification.confidence < MIN_ROUTE_UPDATE_CONFIDENCE ||
    !hasRouteUpdateValues(updateValues)
  ) {
    const reason = routeUpdateReviewReason({
      classification: args.classification,
      updateValues,
    });
    const resolution = hasRouteUpdateValues(updateValues)
      ? await resolveShipmentFromIntakeContext(args)
      : {
          shipmentId: null,
          reason: "Route matching skipped because there was no explicit route value to apply.",
          candidates: [] as string[],
        };

    await annotateIntakeActionResult({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      status: "needs_review",
      actionResult: {
        action: "update_route",
        status: "needs_review",
        reason,
        routeResolution: resolution,
        proposedUpdates: updateValues,
        classification: args.classification,
      },
    });

    await createIntakeReviewTask({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      title: "Review requested route update",
      details: reason,
      priority: "normal",
      metadata: {
        action: "update_route",
        source: buildReviewTaskSourceMetadata(args),
        routeResolution: resolution,
        proposedUpdates: updateValues,
        classification: args.classification,
        externalEventId: args.externalEventId,
        externalConversationId: args.externalConversationId ?? null,
      },
    });

    return {
      action: "needs_review" as const,
      reason,
    };
  }

  const resolution = await resolveShipmentFromIntakeContext(args);

  if (!resolution.shipmentId) {
    await annotateIntakeActionResult({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      status: "needs_review",
      actionResult: {
        action: "update_route",
        status: "needs_review",
        reason: resolution.reason,
        candidates: resolution.candidates,
        classification: args.classification,
      },
    });

    await createIntakeReviewTask({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      title: "Route update needs a matching route",
      details: resolution.reason,
      priority: "high",
      metadata: {
        action: "update_route",
        source: buildReviewTaskSourceMetadata(args),
        candidates: resolution.candidates,
        classification: args.classification,
        externalEventId: args.externalEventId,
        externalConversationId: args.externalConversationId ?? null,
      },
    });

    return {
      action: "needs_review" as const,
      reason: resolution.reason,
    };
  }

  const [shipment] = await db
    .select({
      id: shipments.id,
      internalShipmentNumber: shipments.internalShipmentNumber,
      externalShipmentReference: shipments.externalShipmentReference,
      status: shipments.status,
      pickupDate: shipments.pickupDate,
      deliveryDateExpected: shipments.deliveryDateExpected,
      deliveryDateActual: shipments.deliveryDateActual,
      metadata: shipments.metadata,
    })
    .from(shipments)
    .where(and(eq(shipments.id, resolution.shipmentId), eq(shipments.tenantId, args.tenantId)))
    .limit(1);

  if (!shipment) {
    return null;
  }

  const currentMetadata = metadataRecord(shipment.metadata);
  const shipmentReference =
    shipment.internalShipmentNumber ?? shipment.externalShipmentReference ?? shipment.id;
  const currentValues = {
    pickupDate: shipment.pickupDate,
    deliveryDateExpected: shipment.deliveryDateExpected,
    deliveryDateActual: shipment.deliveryDateActual,
  };

  if (!hasProposedRouteDateChanges(currentValues, updateValues)) {
    await annotateIntakeActionResult({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      status: "classified",
      actionResult: {
        action: "update_route",
        status: "no_change",
        shipmentId: shipment.id,
        shipmentReference,
        proposedUpdates: updateValues,
        confidence: args.classification.confidence,
      },
    });

    return {
      action: "unchanged" as const,
      shipmentId: shipment.id,
      shipmentReference,
    };
  }

  if (shouldRequireHumanRouteChangeApproval(shipment.status)) {
    const reason = `AI identified a change to active route ${shipmentReference}. Review the source and approve or reject the proposed values.`;
    const proposalMetadata = {
      proposalVersion: 1 as const,
      requiresHumanApproval: true as const,
      action: "update_route" as const,
      routeResolution: {
        shipmentId: shipment.id,
        reason: resolution.reason,
      },
      routeReference: shipmentReference,
      routeStatus: shipment.status,
      currentValues,
      proposedUpdates: updateValues,
      confidence: args.classification.confidence,
      classification: { ...args.classification },
      source: buildReviewTaskSourceMetadata(args),
      externalEventId: args.externalEventId,
      externalConversationId: args.externalConversationId ?? null,
    };

    await annotateIntakeActionResult({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      status: "needs_review",
      actionResult: {
        ...proposalMetadata,
        status: "proposed",
      },
    });

    await createIntakeReviewTask({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      title: `Approve changes to ${shipmentReference}`,
      details: reason,
      priority: "high",
      metadata: proposalMetadata,
    });

    return {
      action: "needs_review" as const,
      reason,
      shipmentId: shipment.id,
      shipmentReference,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({
        pickupDate: updateValues.pickupDate ?? undefined,
        deliveryDateExpected: updateValues.deliveryDateExpected ?? undefined,
        deliveryDateActual: updateValues.deliveryDateActual ?? undefined,
        metadata: {
          ...currentMetadata,
          lastIntakeAction: {
            action: "update_route",
            intakeEventId: args.intakeEventId,
            externalEventId: args.externalEventId,
            externalConversationId: args.externalConversationId ?? null,
            updates: updateValues,
            confidence: args.classification.confidence,
            recordedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(and(eq(shipments.id, shipment.id), eq(shipments.tenantId, args.tenantId)));

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      entityType: "shipment",
      entityId: shipment.id,
      action: `updated_from_${args.sourceChannel}_instruction`,
      actorType: "system",
      summary: `Updated route ${shipmentReference} from inbound ${args.sourceChannel} instructions.`,
      payload: {
        intakeEventId: args.intakeEventId,
        externalEventId: args.externalEventId,
        externalConversationId: args.externalConversationId ?? null,
        resolutionReason: resolution.reason,
        before: {
          pickupDate: shipment.pickupDate,
          deliveryDateExpected: shipment.deliveryDateExpected,
          deliveryDateActual: shipment.deliveryDateActual,
        },
        after: updateValues,
        classification: args.classification,
      },
    });
  });

  await annotateIntakeActionResult({
    tenantId: args.tenantId,
    intakeEventId: args.intakeEventId,
    status: "classified",
    actionResult: {
      action: "update_route",
      status: "applied",
      shipmentId: shipment.id,
      shipmentReference,
      updates: updateValues,
      resolutionReason: resolution.reason,
      confidence: args.classification.confidence,
    },
  });

  revalidateDashboardSnapshot(args.tenantId);

  return {
    action: "updated" as const,
    shipmentId: shipment.id,
    shipmentReference,
  };
}

export async function maybeCreateRouteDraftFromIntake(args: RouteActionIntakeArgs) {
  if (!db) {
    return null;
  }

  if (args.classification.classification !== "route_request") {
    return null;
  }

  const reviewReason = getRouteDraftReviewReasonOrNull({
    classification: args.classification,
    messageText: args.messageText,
  });

  if (reviewReason) {
    const serviceDate = normalizeServiceDate(args.classification.clues.serviceDate);
    const shipmentReference = buildRouteReference(args);

    await annotateIntakeActionResult({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      status: "needs_review",
      actionResult: {
        action: "create_route",
        status: "needs_review",
        reason: reviewReason,
        proposedDraft: {
          shipmentReference,
          pickupDate: serviceDate,
          deliveryDateExpected: serviceDate,
        },
        classification: args.classification,
      },
    });

    await createIntakeReviewTask({
      tenantId: args.tenantId,
      intakeEventId: args.intakeEventId,
      title: "Review requested route draft",
      details: reviewReason,
      priority: "normal",
      metadata: {
        action: "create_route",
        source: buildReviewTaskSourceMetadata(args),
        proposedDraft: {
          shipmentReference,
          pickupDate: serviceDate,
          deliveryDateExpected: serviceDate,
        },
        classification: args.classification,
        externalEventId: args.externalEventId,
        externalConversationId: args.externalConversationId ?? null,
      },
    });

    return {
      action: "needs_review" as const,
      reason: reviewReason,
    };
  }

  const serviceDate = normalizeServiceDate(args.classification.clues.serviceDate);
  const shipmentReference = buildRouteReference(args);
  const externalConversationId = cleanNullable(args.externalConversationId);

  if (externalConversationId) {
    const [existingRoute] = await db
      .select({
        id: shipments.id,
        notes: shipments.notes,
        metadata: shipments.metadata,
      })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, args.tenantId),
          eq(shipments.status, "draft"),
          sql`${shipments.metadata}->>'externalConversationId' = ${externalConversationId}`,
        ),
      )
      .orderBy(desc(shipments.createdAt))
      .limit(1);

    if (existingRoute) {
      const currentMetadata =
        existingRoute.metadata && typeof existingRoute.metadata === "object"
          ? existingRoute.metadata
          : {};

      await db.transaction(async (tx) => {
        await tx
          .update(shipments)
          .set({
            pickupDate: serviceDate ?? undefined,
            deliveryDateExpected: serviceDate ?? undefined,
            notes: [existingRoute.notes, buildNotes(args)].filter(Boolean).join("\n\n---\n\n"),
            metadata: {
              ...currentMetadata,
              lastIntakeEventId: args.intakeEventId,
              lastExternalEventId: args.externalEventId,
              lastInboundReceivedAt: args.receivedAt ?? null,
              latestClassification: args.classification,
            },
            updatedAt: new Date(),
          })
          .where(and(eq(shipments.id, existingRoute.id), eq(shipments.tenantId, args.tenantId)));

        await tx.insert(auditLogs).values({
          tenantId: args.tenantId,
          entityType: "shipment",
          entityId: existingRoute.id,
          action: `updated_from_${args.sourceChannel}`,
          actorType: "system",
          summary: `Updated draft route from inbound ${args.sourceChannel} ${shipmentReference}.`,
          payload: {
            intakeEventId: args.intakeEventId,
            externalEventId: args.externalEventId,
            externalConversationId,
            classification: args.classification,
          },
        });
      });

      revalidateDashboardSnapshot(args.tenantId);

      return {
        action: "updated" as const,
        shipmentId: existingRoute.id,
        shipmentReference,
      };
    }
  }

  const shipmentId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(shipments).values({
      id: shipmentId,
      tenantId: args.tenantId,
      externalShipmentReference: shipmentReference,
      pickupDate: serviceDate,
      deliveryDateExpected: serviceDate,
      status: "draft",
      notes: buildNotes(args),
      metadata: {
        entryMode: `${args.sourceChannel}_ingest`,
        sourceChannel: args.sourceChannel,
        intakeEventId: args.intakeEventId,
        externalEventId: args.externalEventId,
        externalConversationId,
        senderName: args.senderName ?? null,
        senderAddress: args.senderAddress ?? null,
        receivedAt: args.receivedAt ?? null,
        classification: args.classification,
      },
    });

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      entityType: "shipment",
      entityId: shipmentId,
      action: `created_from_${args.sourceChannel}`,
      actorType: "system",
      summary: `Created draft route from inbound ${args.sourceChannel} ${shipmentReference}.`,
      payload: {
        intakeEventId: args.intakeEventId,
        externalEventId: args.externalEventId,
        classification: args.classification,
      },
    });
  });

  revalidateDashboardSnapshot(args.tenantId);

  return {
    action: "created" as const,
    shipmentId,
    shipmentReference,
  };
}

export async function maybeHandleRouteActionFromIntake(args: RouteActionIntakeArgs) {
  if (args.classification.action === "update_route") {
    return maybeApplyRouteUpdateFromIntake(args);
  }

  if (args.classification.action === "create_route") {
    return maybeCreateRouteDraftFromIntake(args);
  }

  return null;
}
