import { revalidateTag } from "next/cache";
import { and, eq } from "drizzle-orm";

import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { auditLogs, shipments } from "@/lib/db/schema";

/**
 * Physical delivery-document return tracking (folio / contrarrecibo). Carriers
 * hand back a signed printed folio after a route; the broker's rule is
 * "no folio returned, no carrier payment". The record lives on
 * shipments.metadata.folio and feeds the reconciliation engine's folio_return
 * requirement when the workspace enables it.
 */

export type FolioStatusValue = "received" | "waived";

export type FolioRecord = {
  status: FolioStatusValue;
  note: string | null;
  recordedByUserId: string;
  recordedByName: string | null;
  recordedAt: string;
};

const FOLIO_METADATA_KEY = "folio";
const FOLIO_SETTINGS_KEY = "reconciliationSettings";

export function parseFolioRecord(
  metadata: Record<string, unknown> | null | undefined,
): FolioRecord | null {
  const raw = metadata?.[FOLIO_METADATA_KEY];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (record.status !== "received" && record.status !== "waived") {
    return null;
  }

  if (typeof record.recordedByUserId !== "string" || typeof record.recordedAt !== "string") {
    return null;
  }

  return {
    status: record.status,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
    recordedByUserId: record.recordedByUserId,
    recordedByName: typeof record.recordedByName === "string" ? record.recordedByName : null,
    recordedAt: record.recordedAt,
  };
}

/**
 * Whether this workspace gates carrier payment on the physical folio return.
 * Stored as tenants.metadata.reconciliationSettings.requireFolioReturn so the
 * gate is a per-workspace agreement, not a product-wide assumption.
 */
export function tenantRequiresFolioReturn(
  tenantMetadata: Record<string, unknown> | null | undefined,
): boolean {
  const settings = tenantMetadata?.[FOLIO_SETTINGS_KEY];

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return false;
  }

  return (settings as Record<string, unknown>).requireFolioReturn === true;
}

type FolioActor = {
  tenantId: string;
  userId: string;
  userName: string | null;
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

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

export async function recordFolioStatus(args: {
  actor: FolioActor;
  shipmentId: string;
  status: FolioStatusValue;
  note?: string | null;
}): Promise<FolioRecord> {
  const database = requireDb();
  const row = await loadShipmentMetadata(args.actor.tenantId, args.shipmentId);
  const note = args.note?.trim() ? args.note.trim() : null;

  const record: FolioRecord = {
    status: args.status,
    note,
    recordedByUserId: args.actor.userId,
    recordedByName: args.actor.userName,
    recordedAt: new Date().toISOString(),
  };

  await database.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({
        metadata: { ...(row.metadata ?? {}), [FOLIO_METADATA_KEY]: record },
        updatedAt: new Date(),
      })
      .where(and(eq(shipments.tenantId, args.actor.tenantId), eq(shipments.id, args.shipmentId)));

    await tx.insert(auditLogs).values({
      tenantId: args.actor.tenantId,
      entityType: "shipment",
      entityId: args.shipmentId,
      action: args.status === "received" ? "folio.received" : "folio.waived",
      actorType: "user",
      actorUserId: args.actor.userId,
      summary:
        args.status === "received"
          ? "Recorded the signed folio as returned for this route"
          : "Waived the folio return requirement for this route",
      payload: { note },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.actor.tenantId), "max");

  return record;
}

export async function clearFolioStatus(args: {
  actor: FolioActor;
  shipmentId: string;
}): Promise<void> {
  const database = requireDb();
  const row = await loadShipmentMetadata(args.actor.tenantId, args.shipmentId);
  const currentMetadata = { ...(row.metadata ?? {}) };

  if (!(FOLIO_METADATA_KEY in currentMetadata)) {
    return;
  }

  delete currentMetadata[FOLIO_METADATA_KEY];

  await database.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({ metadata: currentMetadata, updatedAt: new Date() })
      .where(and(eq(shipments.tenantId, args.actor.tenantId), eq(shipments.id, args.shipmentId)));

    await tx.insert(auditLogs).values({
      tenantId: args.actor.tenantId,
      entityType: "shipment",
      entityId: args.shipmentId,
      action: "folio.cleared",
      actorType: "user",
      actorUserId: args.actor.userId,
      summary: "Cleared the folio return record for this route",
    });
  });

  revalidateTag(dashboardSnapshotTag(args.actor.tenantId), "max");
}
