import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLogs, users } from "@/lib/db/schema";

export type ShipmentAuditEvent = {
  id: string;
  action: string;
  summary: string | null;
  actorName: string | null;
  actorType: string;
  createdAt: Date;
};

export async function getShipmentAuditTrail(
  tenantId: string,
  shipmentId: string,
  limit = 8,
): Promise<ShipmentAuditEvent[]> {
  if (!db) {
    return [];
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      summary: auditLogs.summary,
      actorType: auditLogs.actorType,
      actorName: users.fullName,
      actorEmail: users.email,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.entityType, "shipment"),
        eq(auditLogs.entityId, shipmentId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    summary: row.summary,
    actorName: row.actorName ?? row.actorEmail,
    actorType: row.actorType,
    createdAt: row.createdAt,
  }));
}
