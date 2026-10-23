import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import type { AppSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { auditLogs, locations, organizations, purchaseOrders, shipmentStops } from "@/lib/db/schema";
import { sortPartnerLocationsByName } from "@/lib/partners/display";

export type PartnerLocationRecord = {
  id: string;
  name: string;
  locationType: string;
  organizationId: string | null;
  organizationName: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

type LocationInput = {
  name: string;
  locationType: string;
  organizationId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown> | null;
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function insertAuditLog(args: {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  payload?: Record<string, unknown>;
}) {
  const database = requireDb();

  await database.insert(auditLogs).values({
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    summary: args.summary,
    payload: args.payload,
  });
}

async function ensureTenantOrganization(tenantId: string, organizationId: string) {
  const database = requireDb();
  const [record] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Organization not found in this workspace.");
  }
}

async function ensureTenantLocation(tenantId: string, locationId: string) {
  const database = requireDb();
  const [record] = await database
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Location not found in this workspace.");
  }
}

export async function getPartnerLocations(tenantId: string): Promise<PartnerLocationRecord[]> {
  const database = requireDb();
  const rows = await database
    .select({
      id: locations.id,
      name: locations.name,
      locationType: locations.locationType,
      organizationId: locations.organizationId,
      organizationDisplayName: organizations.displayName,
      organizationLegalName: organizations.legalName,
      addressLine1: locations.addressLine1,
      city: locations.city,
      state: locations.state,
      postalCode: locations.postalCode,
      country: locations.country,
    })
    .from(locations)
    .leftJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(eq(locations.tenantId, tenantId))
    .orderBy(asc(locations.locationType), asc(locations.name));

  return sortPartnerLocationsByName(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      locationType: row.locationType,
      organizationId: row.organizationId,
      organizationName: row.organizationDisplayName ?? row.organizationLegalName ?? null,
      addressLine1: row.addressLine1,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
    })),
  );
}

export async function createLocationRecord(session: AppSession, input: LocationInput) {
  const database = requireDb();
  const organizationId = cleanNullable(input.organizationId);

  if (organizationId) {
    await ensureTenantOrganization(session.tenant.id, organizationId);
  }

  const [created] = await database
    .insert(locations)
    .values({
      id: randomUUID(),
      tenantId: session.tenant.id,
      organizationId,
      name: input.name.trim(),
      locationType: input.locationType as (typeof locations.$inferSelect)["locationType"],
      addressLine1: cleanNullable(input.addressLine1),
      addressLine2: cleanNullable(input.addressLine2),
      city: cleanNullable(input.city),
      state: cleanNullable(input.state),
      postalCode: cleanNullable(input.postalCode),
      country: cleanNullable(input.country) ?? "MX",
      metadata: input.metadata ?? null,
    })
    .returning({ id: locations.id, name: locations.name });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "location",
    entityId: created.id,
    action: "created",
    summary: `Created location ${created.name}.`,
    payload: { organizationId, locationType: input.locationType },
  });

  return created;
}

export async function updateLocationRecord(session: AppSession, input: LocationInput & { id: string }) {
  const database = requireDb();
  const organizationId = cleanNullable(input.organizationId);

  if (organizationId) {
    await ensureTenantOrganization(session.tenant.id, organizationId);
  }

  await ensureTenantLocation(session.tenant.id, input.id);

  await database
    .update(locations)
    .set({
      organizationId,
      name: input.name.trim(),
      locationType: input.locationType as (typeof locations.$inferSelect)["locationType"],
      addressLine1: cleanNullable(input.addressLine1),
      addressLine2: cleanNullable(input.addressLine2),
      city: cleanNullable(input.city),
      state: cleanNullable(input.state),
      postalCode: cleanNullable(input.postalCode),
      country: cleanNullable(input.country) ?? "MX",
      metadata: input.metadata ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(locations.id, input.id), eq(locations.tenantId, session.tenant.id)));

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "location",
    entityId: input.id,
    action: "updated",
    summary: `Updated location ${input.name}.`,
    payload: { organizationId, locationType: input.locationType },
  });
}

export async function deleteLocationRecord(session: AppSession, locationId: string) {
  const database = requireDb();
  await ensureTenantLocation(session.tenant.id, locationId);

  const [linkedPurchaseOrder, linkedStop, locationRecord] = await Promise.all([
    database
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, session.tenant.id),
          sql`${purchaseOrders.shipToLocationId} = ${locationId} OR ${purchaseOrders.billToLocationId} = ${locationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: shipmentStops.id })
      .from(shipmentStops)
      .where(and(eq(shipmentStops.tenantId, session.tenant.id), eq(shipmentStops.locationId, locationId)))
      .limit(1),
    database
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, session.tenant.id)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (linkedPurchaseOrder.length || linkedStop.length) {
    throw new Error("This location is already referenced by routes or commercial records. Remove those links first or keep the location for history.");
  }

  await database
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, session.tenant.id)));

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "location",
    entityId: locationId,
    action: "deleted",
    summary: `Deleted location ${locationRecord?.name ?? locationId}.`,
  });
}
