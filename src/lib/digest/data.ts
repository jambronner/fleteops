import { and, count, eq, gt, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documentLinks, reviewTasks } from "@/lib/db/schema";
import type { DigestRouteStatus, TenantDigestInputs } from "@/lib/digest/content";
import { getDashboardSnapshot } from "@/lib/reconciliation/queries";
import { getWhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

const QUEUE_ROUTE_STATUSES: DigestRouteStatus[] = ["blocked", "needsReview", "pendingDocs"];

/** Same sources as the dashboard decision queue, narrowed to digest inputs. */
export async function buildTenantDigestInputs(
  tenantId: string,
  locale: string,
): Promise<TenantDigestInputs> {
  const [snapshot, whatsappSnapshot] = await Promise.all([
    getDashboardSnapshot(tenantId, locale),
    getWhatsappSourceReviewSnapshot(tenantId),
  ]);

  const missingLabelsByShipment = new Map(
    snapshot.documentQueue.map((entry) => [entry.shipmentId, entry.missingLabels]),
  );

  return {
    routes: snapshot.shipments
      .filter((shipment) =>
        QUEUE_ROUTE_STATUSES.includes(shipment.evaluation.controlTowerStatus as DigestRouteStatus),
      )
      .map((shipment) => ({
        id: shipment.packet.id,
        reference: shipment.packet.shipmentReference,
        customerName: shipment.packet.customerName,
        status: shipment.evaluation.controlTowerStatus as DigestRouteStatus,
        expectedDeliveryDate: shipment.packet.expectedDeliveryDate,
        missingLabels: missingLabelsByShipment.get(shipment.packet.id) ?? [],
      })),
    intakeTasks: snapshot.intakeActionQueue.map((task) => ({
      id: task.id,
      title: task.title,
      createdAt: task.createdAt,
      subjectId: task.subjectId,
      metadata: task.metadata,
    })),
    whatsappSources: whatsappSnapshot.sources
      .filter((source) => source.status === "unclaimed")
      .map((source) => ({
        id: source.id,
        label: source.displayName ?? source.externalConversationId,
        lastSeenAt: source.lastSeenAt,
      })),
  };
}

/** Review tasks closed plus evidence linked to routes since the window start. */
export async function countResolvedSince(tenantId: string, since: Date): Promise<number> {
  if (!db) {
    return 0;
  }

  const [resolvedTasks, linkedEvidence] = await Promise.all([
    db
      .select({ value: count() })
      .from(reviewTasks)
      .where(
        and(
          eq(reviewTasks.tenantId, tenantId),
          inArray(reviewTasks.status, ["resolved", "dismissed"]),
          isNotNull(reviewTasks.resolvedAt),
          gt(reviewTasks.resolvedAt, since),
        ),
      ),
    db
      .select({ value: count() })
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, tenantId),
          eq(documentLinks.targetType, "shipment"),
          gt(documentLinks.createdAt, since),
        ),
      ),
  ]);

  return (resolvedTasks[0]?.value ?? 0) + (linkedEvidence[0]?.value ?? 0);
}
