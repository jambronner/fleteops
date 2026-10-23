import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import type { AppSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";

import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { listDocumentsLinkedToShipment, type ShipmentLinkedDocumentRecord } from "@/lib/documents/repository";
import { parseRouteDecision, type RouteDecision } from "@/lib/operations/decisions";
import { parseFolioRecord, type FolioRecord } from "@/lib/operations/folio";
import {
  auditLogs,
  documentLinks,
  exceptions,
  invoices,
  locations,
  organizations,
  payments,
  purchaseOrderLines,
  purchaseOrders,
  reconciliationCases,
  shipmentOrders,
  shipmentLineItems,
  shipments,
  shipmentStops,
  whatsappThreads,
} from "@/lib/db/schema";

type ShipmentStatus = (typeof shipments.$inferSelect)["status"];
type StopType = (typeof shipmentStops.$inferSelect)["stopType"];

export type WorkspaceOrganizationOption = {
  id: string;
  label: string;
  type: string;
};

export type WorkspaceLocationOption = {
  id: string;
  label: string;
  type: string;
  organizationId: string | null;
};

export type WorkspacePurchaseOrderOption = {
  id: string;
  poNumber: string;
  label: string;
};

export type ManualShipmentRecord = {
  id: string;
  shipmentReference: string;
  internalShipmentNumber: string | null;
  externalReference: string | null;
  brokerOrgId: string | null;
  shipperOrgId: string | null;
  carrierOrgId: string | null;
  customerOrgId: string | null;
  pickupLocationId: string | null;
  deliveryLocationId: string | null;
  deliveryLocationIds: string[];
  deliveryStops: Array<{
    id: string;
    name: string;
    sequenceNo: number;
  }>;
  /** Count of delivery stop rows (location-matched or not); falls back to the imported routeStopCount. */
  deliveryStopCount: number | null;
  purchaseOrderId: string | null;
  status: ShipmentStatus;
  pickupDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  shipperName: string | null;
  carrierName: string | null;
  customerName: string | null;
  pickupLocationName: string | null;
  deliveryLocationName: string | null;
  purchaseOrderNumber: string | null;
  notes: string | null;
  temperatureControlled: boolean;
  importReview: ManualShipmentImportReview | null;
  decision: RouteDecision | null;
  folio: FolioRecord | null;
  createdAt: string;
};

export type ManualShipmentImportReview = {
  sourceFileName: string | null;
  sourceRowNumber: number | null;
  routeName: string | null;
  brand: string | null;
  locationName: string | null;
  address: string | null;
  orderNumber: string | null;
  invoiceNumber: string | null;
  needsLocationReview: boolean;
  needsOrganizationReview: boolean;
};

export type ManualPurchaseOrderRecord = {
  id: string;
  issuerOrgId: string;
  supplierOrgId: string | null;
  shipToLocationId: string | null;
  billToLocationId: string | null;
  poNumber: string;
  externalPoNumber: string | null;
  status: string | null;
  issuerName: string | null;
  supplierName: string | null;
  shipToLocationName: string | null;
  billToLocationName: string | null;
  poDate: string | null;
  requestedDeliveryDate: string | null;
  note: string | null;
  lines: ManualPurchaseOrderLineRecord[];
  createdAt: string;
};

export type ManualPurchaseOrderLineRecord = {
  id: string;
  lineNumber: number | null;
  externalProductCode: string | null;
  description: string;
  qtyOrdered: string | null;
  uom: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  requestedDeliveryDate: string | null;
};

export type ManualShipmentDetail = {
  shipment: ManualShipmentRecord;
  linkedPurchaseOrders: WorkspacePurchaseOrderOption[];
  linkedEvidence: ShipmentLinkedDocumentRecord[];
};

type ShipmentInput = {
  internalShipmentNumber?: string | null;
  externalShipmentReference?: string | null;
  brokerOrgId?: string | null;
  shipperOrgId?: string | null;
  carrierOrgId?: string | null;
  customerOrgId?: string | null;
  pickupLocationId?: string | null;
  deliveryLocationId?: string | null;
  deliveryLocationIds?: string[];
  purchaseOrderId?: string | null;
  pickupDate?: string | null;
  deliveryDateExpected?: string | null;
  deliveryDateActual?: string | null;
  status: ShipmentStatus;
  temperatureControlled?: boolean;
  notes?: string | null;
};

type PurchaseOrderInput = {
  issuerOrgId: string;
  supplierOrgId?: string | null;
  shipToLocationId?: string | null;
  billToLocationId?: string | null;
  poNumber: string;
  externalPoNumber?: string | null;
  poDate?: string | null;
  requestedDeliveryDate?: string | null;
  status?: string | null;
  note?: string | null;
  lines?: PurchaseOrderLineInput[];
};

type PurchaseOrderLineInput = {
  lineNumber?: number | string | null;
  externalProductCode?: string | null;
  description: string;
  qtyOrdered?: string | null;
  uom?: string | null;
  unitPrice?: string | null;
  lineTotal?: string | null;
  requestedDeliveryDate?: string | null;
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

function toDateOrNull(value?: string | null) {
  const trimmed = cleanNullable(value);
  return trimmed ? trimmed : null;
}

function toIntegerOrNull(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNumericOrNull(value?: string | number | null) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = typeof value === "string" ? value.trim() : String(value);
  return trimmed ? trimmed : null;
}

function todayToken() {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function buildGeneratedRouteReference() {
  return `RTE-${todayToken()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function normalizeLocationIds(primaryLocationId?: string | null, locationIds?: string[]) {
  const seen = new Set<string>();
  const values = [...(locationIds ?? []), primaryLocationId ?? ""]
    .map((value) => cleanNullable(value))
    .filter((value): value is string => Boolean(value));

  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function parseManualNote(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || !("manualNote" in metadata)) {
    return null;
  }

  return String(metadata.manualNote ?? "");
}

function parseLineRequestedDate(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || !("requestedDeliveryDate" in metadata)) {
    return null;
  }

  const value = metadata.requestedDeliveryDate;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringMetadataValue(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberMetadataValue(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseShipmentImportReview(args: {
  metadata: Record<string, unknown> | null | undefined;
  customerOrgId: string | null;
  shipperOrgId: string | null;
  deliveryLocationIds: string[];
}) {
  if (args.metadata?.entryMode !== "import") {
    return null;
  }

  const brand = stringMetadataValue(args.metadata, "brand");
  const locationName = stringMetadataValue(args.metadata, "locationName");
  const address = stringMetadataValue(args.metadata, "address");

  return {
    sourceFileName: stringMetadataValue(args.metadata, "sourceFileName"),
    sourceRowNumber: numberMetadataValue(args.metadata, "sourceRowNumber"),
    routeName: stringMetadataValue(args.metadata, "routeName"),
    brand,
    locationName,
    address,
    orderNumber: stringMetadataValue(args.metadata, "orderNumber"),
    invoiceNumber: stringMetadataValue(args.metadata, "invoiceNumber"),
    needsLocationReview: Boolean((locationName || address) && args.deliveryLocationIds.length === 0),
    needsOrganizationReview: Boolean(brand && !args.customerOrgId && !args.shipperOrgId),
  } satisfies ManualShipmentImportReview;
}

function normalizePurchaseOrderLines(lines: PurchaseOrderLineInput[] | undefined) {
  return (lines ?? [])
    .map((line, index) => ({
      lineNumber: toIntegerOrNull(line.lineNumber ?? index + 1),
      externalProductCode: cleanNullable(line.externalProductCode),
      description: line.description.trim(),
      qtyOrdered: toNumericOrNull(line.qtyOrdered),
      uom: cleanNullable(line.uom),
      unitPrice: toNumericOrNull(line.unitPrice),
      lineTotal: toNumericOrNull(line.lineTotal),
      requestedDeliveryDate: toDateOrNull(line.requestedDeliveryDate),
    }))
    .filter((line) => line.description.length > 0);
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

async function ensureTenantPurchaseOrder(tenantId: string, purchaseOrderId: string) {
  const database = requireDb();
  const [record] = await database
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Purchase order not found in this workspace.");
  }
}

async function ensureTenantShipment(tenantId: string, shipmentId: string) {
  const database = requireDb();
  const [record] = await database
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Shipment not found in this workspace.");
  }
}

function buildOrganizationLabel(row: { displayName: string | null; legalName: string }) {
  return row.displayName ?? row.legalName;
}

export async function getOperationalFormOptions(tenantId: string) {
  const database = requireDb();
  const [organizationRows, locationRows, purchaseOrderRows] = await Promise.all([
    database
      .select({
        id: organizations.id,
        legalName: organizations.legalName,
        displayName: organizations.displayName,
        organizationType: organizations.organizationType,
      })
      .from(organizations)
      .where(and(eq(organizations.tenantId, tenantId), eq(organizations.active, true)))
      .orderBy(asc(organizations.organizationType), asc(organizations.legalName)),
    database
      .select({
        id: locations.id,
        name: locations.name,
        locationType: locations.locationType,
        organizationId: locations.organizationId,
      })
      .from(locations)
      .where(eq(locations.tenantId, tenantId))
      .orderBy(asc(locations.locationType), asc(locations.name)),
    database
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        externalPoNumber: purchaseOrders.externalPoNumber,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.tenantId, tenantId))
      .orderBy(desc(purchaseOrders.createdAt)),
  ]);

  return {
    organizations: organizationRows.map((row) => ({
      id: row.id,
      label: buildOrganizationLabel(row),
      type: row.organizationType,
    })) satisfies WorkspaceOrganizationOption[],
    locations: locationRows.map((row) => ({
      id: row.id,
      label: row.name,
      type: row.locationType,
      organizationId: row.organizationId,
    })) satisfies WorkspaceLocationOption[],
    purchaseOrders: purchaseOrderRows.map((row) => ({
      id: row.id,
      poNumber: row.poNumber,
      label: row.externalPoNumber ? `${row.poNumber} / ${row.externalPoNumber}` : row.poNumber,
    })) satisfies WorkspacePurchaseOrderOption[],
  };
}

export async function getManualShipments(tenantId: string): Promise<ManualShipmentRecord[]> {
  const database = requireDb();
  const shipmentRows = await database
    .select({
      id: shipments.id,
      internalShipmentNumber: shipments.internalShipmentNumber,
      externalShipmentReference: shipments.externalShipmentReference,
      brokerOrgId: shipments.brokerOrgId,
      shipperOrgId: shipments.shipperOrgId,
      carrierOrgId: shipments.carrierOrgId,
      customerOrgId: shipments.customerOrgId,
      status: shipments.status,
      pickupDate: shipments.pickupDate,
      deliveryDateExpected: shipments.deliveryDateExpected,
      deliveryDateActual: shipments.deliveryDateActual,
      notes: shipments.notes,
      temperatureControlled: shipments.temperatureControlled,
      metadata: shipments.metadata,
      createdAt: shipments.createdAt,
    })
    .from(shipments)
    .where(eq(shipments.tenantId, tenantId))
    .orderBy(desc(shipments.createdAt));

  const shipmentIds = shipmentRows.map((row) => row.id);
  const organizationIds = Array.from(
    new Set(
      shipmentRows.flatMap((row) =>
        [row.brokerOrgId, row.shipperOrgId, row.carrierOrgId, row.customerOrgId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  );

  const organizationRows = organizationIds.length
    ? await database
        .select({
          id: organizations.id,
          legalName: organizations.legalName,
          displayName: organizations.displayName,
        })
        .from(organizations)
        .where(inArray(organizations.id, organizationIds))
    : [];

  const organizationMap = new Map(
    organizationRows.map((row) => [row.id, buildOrganizationLabel(row)]),
  );

  const [stopRows, poLinkRows] = shipmentIds.length
    ? await Promise.all([
        database
          .select({
            shipmentId: shipmentStops.shipmentId,
            stopType: shipmentStops.stopType,
            sequenceNo: shipmentStops.sequenceNo,
            locationId: shipmentStops.locationId,
            locationName: locations.name,
          })
          .from(shipmentStops)
          .leftJoin(locations, eq(locations.id, shipmentStops.locationId))
          .where(inArray(shipmentStops.shipmentId, shipmentIds))
          .orderBy(asc(shipmentStops.sequenceNo)),
        database
          .select({
            shipmentId: shipmentOrders.shipmentId,
            purchaseOrderId: shipmentOrders.purchaseOrderId,
            poNumber: purchaseOrders.poNumber,
          })
          .from(shipmentOrders)
          .innerJoin(purchaseOrders, eq(purchaseOrders.id, shipmentOrders.purchaseOrderId))
          .where(inArray(shipmentOrders.shipmentId, shipmentIds)),
      ])
    : [[], []];

  const stopMap = new Map<string, {
    pickupLocationName: string | null;
    deliveryLocationName: string | null;
    deliveryStops: Array<{ id: string; name: string; sequenceNo: number }>;
    deliveryRowCount: number;
  }>();
  const stopIdMap = new Map<string, {
    pickupLocationId: string | null;
    deliveryLocationId: string | null;
    deliveryLocationIds: string[];
  }>();
  for (const row of stopRows) {
    const current = stopMap.get(row.shipmentId) ?? {
      pickupLocationName: null,
      deliveryLocationName: null,
      deliveryStops: [],
      deliveryRowCount: 0,
    };
    const currentIds = stopIdMap.get(row.shipmentId) ?? {
      pickupLocationId: null,
      deliveryLocationId: null,
      deliveryLocationIds: [],
    };

    if (row.stopType === "pickup" && row.locationName && !current.pickupLocationName) {
      current.pickupLocationName = row.locationName;
    }
    if (row.stopType === "pickup" && row.locationId && !currentIds.pickupLocationId) {
      currentIds.pickupLocationId = row.locationId;
    }

    if (row.stopType === "delivery") {
      current.deliveryRowCount += 1;
    }
    if (row.stopType === "delivery" && row.locationName && !current.deliveryLocationName) {
      current.deliveryLocationName = row.locationName;
    }
    if (row.stopType === "delivery" && row.locationId && row.locationName) {
      current.deliveryStops.push({
        id: row.locationId,
        name: row.locationName,
        sequenceNo: row.sequenceNo,
      });
    }
    if (row.stopType === "delivery" && row.locationId && !currentIds.deliveryLocationId) {
      currentIds.deliveryLocationId = row.locationId;
    }
    if (row.stopType === "delivery" && row.locationId && !currentIds.deliveryLocationIds.includes(row.locationId)) {
      currentIds.deliveryLocationIds.push(row.locationId);
    }

    stopMap.set(row.shipmentId, current);
    stopIdMap.set(row.shipmentId, currentIds);
  }

  const poMap = new Map<string, string>();
  const poIdMap = new Map<string, string>();
  for (const row of poLinkRows) {
    if (!poMap.has(row.shipmentId)) {
      poMap.set(row.shipmentId, row.poNumber);
    }
    if (!poIdMap.has(row.shipmentId)) {
      poIdMap.set(row.shipmentId, row.purchaseOrderId);
    }
  }

  return shipmentRows.map((row) => {
    const stopData = stopMap.get(row.id);
    const stopIdData = stopIdMap.get(row.id);
    const shipmentReference = row.internalShipmentNumber ?? row.externalShipmentReference ?? row.id;

    const deliveryLocationIds = stopIdData?.deliveryLocationIds ?? [];

    return {
      id: row.id,
      shipmentReference,
      internalShipmentNumber: row.internalShipmentNumber,
      externalReference: row.externalShipmentReference,
      brokerOrgId: row.brokerOrgId,
      shipperOrgId: row.shipperOrgId,
      carrierOrgId: row.carrierOrgId,
      customerOrgId: row.customerOrgId,
      pickupLocationId: stopIdData?.pickupLocationId ?? null,
      deliveryLocationId: stopIdData?.deliveryLocationId ?? null,
      deliveryLocationIds,
      deliveryStops: stopData?.deliveryStops ?? [],
      deliveryStopCount:
        stopData?.deliveryRowCount && stopData.deliveryRowCount > 0
          ? stopData.deliveryRowCount
          : typeof row.metadata?.routeStopCount === "number"
            ? row.metadata.routeStopCount
            : null,
      purchaseOrderId: poIdMap.get(row.id) ?? null,
      status: row.status,
      pickupDate: row.pickupDate,
      expectedDeliveryDate: row.deliveryDateExpected,
      actualDeliveryDate: row.deliveryDateActual,
      shipperName: row.shipperOrgId ? organizationMap.get(row.shipperOrgId) ?? null : null,
      carrierName: row.carrierOrgId ? organizationMap.get(row.carrierOrgId) ?? null : null,
      customerName: row.customerOrgId ? organizationMap.get(row.customerOrgId) ?? null : null,
      pickupLocationName: stopData?.pickupLocationName ?? null,
      deliveryLocationName: stopData?.deliveryLocationName ?? null,
      purchaseOrderNumber: poMap.get(row.id) ?? null,
      notes: row.notes,
      temperatureControlled: row.temperatureControlled,
      importReview: parseShipmentImportReview({
        metadata: row.metadata,
        customerOrgId: row.customerOrgId,
        shipperOrgId: row.shipperOrgId,
        deliveryLocationIds,
      }),
      decision: parseRouteDecision(row.metadata),
      folio: parseFolioRecord(row.metadata),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getManualPurchaseOrders(tenantId: string): Promise<ManualPurchaseOrderRecord[]> {
  const database = requireDb();
  const poRows = await database
    .select({
      id: purchaseOrders.id,
      issuerOrgId: purchaseOrders.issuerOrgId,
      supplierOrgId: purchaseOrders.supplierOrgId,
      shipToLocationId: purchaseOrders.shipToLocationId,
      billToLocationId: purchaseOrders.billToLocationId,
      poNumber: purchaseOrders.poNumber,
      externalPoNumber: purchaseOrders.externalPoNumber,
      poDate: purchaseOrders.poDate,
      requestedDeliveryDate: purchaseOrders.requestedDeliveryDate,
      status: purchaseOrders.status,
      metadata: purchaseOrders.metadata,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenantId, tenantId))
    .orderBy(desc(purchaseOrders.createdAt));

  const purchaseOrderIds = poRows.map((row) => row.id);

  const organizationIds = Array.from(
    new Set(
      poRows.flatMap((row) =>
        [row.issuerOrgId, row.supplierOrgId].filter((value): value is string => Boolean(value)),
      ),
    ),
  );
  const locationIds = Array.from(
    new Set(
      poRows.flatMap((row) =>
        [row.shipToLocationId, row.billToLocationId].filter((value): value is string => Boolean(value)),
      ),
    ),
  );

  const [organizationRows, locationRows] = await Promise.all([
    organizationIds.length
      ? database
          .select({
            id: organizations.id,
            legalName: organizations.legalName,
            displayName: organizations.displayName,
          })
          .from(organizations)
          .where(inArray(organizations.id, organizationIds))
      : [],
    locationIds.length
      ? database
          .select({
            id: locations.id,
            name: locations.name,
          })
          .from(locations)
          .where(inArray(locations.id, locationIds))
      : [],
  ]);

  const lineRows = purchaseOrderIds.length
    ? await database
        .select({
          id: purchaseOrderLines.id,
          purchaseOrderId: purchaseOrderLines.purchaseOrderId,
          lineNumber: purchaseOrderLines.lineNumber,
          externalProductCode: purchaseOrderLines.externalProductCode,
          description: purchaseOrderLines.description,
          qtyOrdered: purchaseOrderLines.qtyOrdered,
          uom: purchaseOrderLines.uom,
          unitPrice: purchaseOrderLines.unitPrice,
          lineTotal: purchaseOrderLines.lineTotal,
          metadata: purchaseOrderLines.metadata,
          createdAt: purchaseOrderLines.createdAt,
        })
        .from(purchaseOrderLines)
        .where(inArray(purchaseOrderLines.purchaseOrderId, purchaseOrderIds))
        .orderBy(asc(purchaseOrderLines.lineNumber), asc(purchaseOrderLines.createdAt))
    : [];

  const organizationMap = new Map(organizationRows.map((row) => [row.id, buildOrganizationLabel(row)]));
  const locationMap = new Map(locationRows.map((row) => [row.id, row.name]));
  const lineMap = new Map<string, ManualPurchaseOrderLineRecord[]>();

  for (const row of lineRows) {
    const current = lineMap.get(row.purchaseOrderId) ?? [];
    current.push({
      id: row.id,
      lineNumber: row.lineNumber,
      externalProductCode: row.externalProductCode,
      description: row.description,
      qtyOrdered: row.qtyOrdered ? String(row.qtyOrdered) : null,
      uom: row.uom,
      unitPrice: row.unitPrice ? String(row.unitPrice) : null,
      lineTotal: row.lineTotal ? String(row.lineTotal) : null,
      requestedDeliveryDate: parseLineRequestedDate(row.metadata),
    });
    lineMap.set(row.purchaseOrderId, current);
  }

  return poRows.map((row) => ({
    id: row.id,
    issuerOrgId: row.issuerOrgId,
    supplierOrgId: row.supplierOrgId,
    shipToLocationId: row.shipToLocationId,
    billToLocationId: row.billToLocationId,
    poNumber: row.poNumber,
    externalPoNumber: row.externalPoNumber,
    status: row.status,
    issuerName: organizationMap.get(row.issuerOrgId) ?? null,
    supplierName: row.supplierOrgId ? organizationMap.get(row.supplierOrgId) ?? null : null,
    shipToLocationName: row.shipToLocationId ? locationMap.get(row.shipToLocationId) ?? null : null,
    billToLocationName: row.billToLocationId ? locationMap.get(row.billToLocationId) ?? null : null,
    poDate: row.poDate,
    requestedDeliveryDate: row.requestedDeliveryDate,
    note: parseManualNote(row.metadata),
    lines: lineMap.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getManualShipmentDetail(
  tenantId: string,
  shipmentId: string,
): Promise<ManualShipmentDetail | null> {
  const shipmentsList = await getManualShipments(tenantId);
  const shipment = shipmentsList.find((item) => item.id === shipmentId);

  if (!shipment) {
    return null;
  }

  const database = requireDb();
  const [linkedPurchaseOrdersRows, linkedEvidence] = await Promise.all([
    database
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        externalPoNumber: purchaseOrders.externalPoNumber,
      })
      .from(shipmentOrders)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, shipmentOrders.purchaseOrderId))
      .where(eq(shipmentOrders.shipmentId, shipmentId)),
    listDocumentsLinkedToShipment({
      tenantId,
      shipmentId,
    }),
  ]);

  return {
    shipment,
    linkedPurchaseOrders: linkedPurchaseOrdersRows.map((row) => ({
      id: row.id,
      poNumber: row.poNumber,
      label: row.externalPoNumber ? `${row.poNumber} / ${row.externalPoNumber}` : row.poNumber,
    })),
    linkedEvidence,
  };
}

export async function createPurchaseOrderRecord(session: AppSession, input: PurchaseOrderInput) {
  const database = requireDb();
  await ensureTenantOrganization(session.tenant.id, input.issuerOrgId);

  const supplierOrgId = cleanNullable(input.supplierOrgId);
  const shipToLocationId = cleanNullable(input.shipToLocationId);
  const billToLocationId = cleanNullable(input.billToLocationId);

  if (supplierOrgId) {
    await ensureTenantOrganization(session.tenant.id, supplierOrgId);
  }

  if (shipToLocationId) {
    await ensureTenantLocation(session.tenant.id, shipToLocationId);
  }

  if (billToLocationId) {
    await ensureTenantLocation(session.tenant.id, billToLocationId);
  }

  const lineItems = normalizePurchaseOrderLines(input.lines);
  const purchaseOrderId = randomUUID();

  const [created] = await database.transaction(async (tx) => {
    const [createdPurchaseOrder] = await tx
      .insert(purchaseOrders)
      .values({
        id: purchaseOrderId,
        tenantId: session.tenant.id,
        issuerOrgId: input.issuerOrgId,
        supplierOrgId,
        shipToLocationId,
        billToLocationId,
        poNumber: input.poNumber.trim(),
        externalPoNumber: cleanNullable(input.externalPoNumber),
        poDate: toDateOrNull(input.poDate),
        requestedDeliveryDate: toDateOrNull(input.requestedDeliveryDate),
        status: cleanNullable(input.status) ?? "open",
        metadata: {
          entryMode: "manual",
          manualNote: cleanNullable(input.note),
        },
      })
      .returning({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber });

    await replacePurchaseOrderLines({
      purchaseOrderId,
      tenantId: session.tenant.id,
      tx,
      lines: lineItems,
    });

    return [createdPurchaseOrder];
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "purchase_order",
    entityId: created.id,
    action: "created",
    summary: `Created purchase order ${created.poNumber}.`,
    payload: {
      issuerOrgId: input.issuerOrgId,
      supplierOrgId,
      shipToLocationId,
      billToLocationId,
      lineCount: lineItems.length,
    },
  });

  return created;
}

export async function updatePurchaseOrderRecord(
  session: AppSession,
  input: PurchaseOrderInput & { id: string },
) {
  const database = requireDb();
  await ensureTenantPurchaseOrder(session.tenant.id, input.id);
  await ensureTenantOrganization(session.tenant.id, input.issuerOrgId);

  const supplierOrgId = cleanNullable(input.supplierOrgId);
  const shipToLocationId = cleanNullable(input.shipToLocationId);
  const billToLocationId = cleanNullable(input.billToLocationId);

  if (supplierOrgId) {
    await ensureTenantOrganization(session.tenant.id, supplierOrgId);
  }

  if (shipToLocationId) {
    await ensureTenantLocation(session.tenant.id, shipToLocationId);
  }

  if (billToLocationId) {
    await ensureTenantLocation(session.tenant.id, billToLocationId);
  }

  const lineItems = normalizePurchaseOrderLines(input.lines);

  const [current] = await database
    .select({ metadata: purchaseOrders.metadata })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, session.tenant.id)))
    .limit(1);

  await database.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        issuerOrgId: input.issuerOrgId,
        supplierOrgId,
        shipToLocationId,
        billToLocationId,
        poNumber: input.poNumber.trim(),
        externalPoNumber: cleanNullable(input.externalPoNumber),
        poDate: toDateOrNull(input.poDate),
        requestedDeliveryDate: toDateOrNull(input.requestedDeliveryDate),
        status: cleanNullable(input.status) ?? "open",
        metadata: {
          ...(current?.metadata ?? {}),
          entryMode: "manual",
          manualNote: cleanNullable(input.note),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, session.tenant.id)));

    await replacePurchaseOrderLines({
      purchaseOrderId: input.id,
      tenantId: session.tenant.id,
      tx,
      lines: lineItems,
    });
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "purchase_order",
    entityId: input.id,
    action: "updated",
    summary: `Updated purchase order ${input.poNumber}.`,
    payload: {
      issuerOrgId: input.issuerOrgId,
      supplierOrgId,
      shipToLocationId,
      billToLocationId,
      lineCount: lineItems.length,
    },
  });
}

async function replacePurchaseOrderLines(args: {
  tenantId: string;
  purchaseOrderId: string;
  tx: Pick<ReturnType<typeof requireDb>, "delete" | "insert">;
  lines: ReturnType<typeof normalizePurchaseOrderLines>;
}) {
  await args.tx
    .delete(purchaseOrderLines)
    .where(
      and(
        eq(purchaseOrderLines.purchaseOrderId, args.purchaseOrderId),
        eq(purchaseOrderLines.tenantId, args.tenantId),
      ),
    );

  if (args.lines.length === 0) {
    return;
  }

  await args.tx.insert(purchaseOrderLines).values(
    args.lines.map((line) => ({
      id: randomUUID(),
      tenantId: args.tenantId,
      purchaseOrderId: args.purchaseOrderId,
      lineNumber: line.lineNumber,
      externalProductCode: line.externalProductCode,
      description: line.description,
      qtyOrdered: line.qtyOrdered,
      uom: line.uom,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      metadata: {
        requestedDeliveryDate: line.requestedDeliveryDate,
        entryMode: "manual",
      },
    })),
  );
}

async function replaceShipmentStops(args: {
  tenantId: string;
  shipmentId: string;
  pickupLocationId: string | null;
  deliveryLocationIds: string[];
}) {
  const database = requireDb();

  await database
    .delete(shipmentStops)
    .where(and(eq(shipmentStops.shipmentId, args.shipmentId), eq(shipmentStops.tenantId, args.tenantId)));

  const stopValues: Array<typeof shipmentStops.$inferInsert> = [];

  const maybePushStop = (stopType: StopType, locationId: string | null, sequenceNo: number) => {
    if (!locationId) {
      return;
    }

    stopValues.push({
      id: randomUUID(),
      tenantId: args.tenantId,
      shipmentId: args.shipmentId,
      stopType,
      sequenceNo,
      locationId,
      status: "planned",
    });
  };

  maybePushStop("pickup", args.pickupLocationId, 1);
  const deliverySequenceStart = args.pickupLocationId ? 2 : 1;
  args.deliveryLocationIds.forEach((deliveryLocationId, index) => {
    maybePushStop("delivery", deliveryLocationId, deliverySequenceStart + index);
  });

  if (stopValues.length > 0) {
    await database.insert(shipmentStops).values(stopValues);
  }
}

export async function createShipmentRecord(session: AppSession, input: ShipmentInput) {
  const database = requireDb();
  const internalShipmentNumber = cleanNullable(input.internalShipmentNumber) ?? buildGeneratedRouteReference();
  const externalShipmentReference = cleanNullable(input.externalShipmentReference);

  const brokerOrgId = cleanNullable(input.brokerOrgId);
  const customerOrgId = cleanNullable(input.customerOrgId);
  const shipperOrgId = cleanNullable(input.shipperOrgId) ?? customerOrgId;
  const carrierOrgId = cleanNullable(input.carrierOrgId);
  const pickupLocationId = cleanNullable(input.pickupLocationId);
  const deliveryLocationIds = normalizeLocationIds(input.deliveryLocationId, input.deliveryLocationIds);
  const purchaseOrderId = cleanNullable(input.purchaseOrderId);

  for (const organizationId of [brokerOrgId, shipperOrgId, carrierOrgId, customerOrgId]) {
    if (organizationId) {
      await ensureTenantOrganization(session.tenant.id, organizationId);
    }
  }

  for (const locationId of [pickupLocationId, ...deliveryLocationIds]) {
    if (locationId) {
      await ensureTenantLocation(session.tenant.id, locationId);
    }
  }

  if (purchaseOrderId) {
    await ensureTenantPurchaseOrder(session.tenant.id, purchaseOrderId);
  }

  const shipmentId = randomUUID();

  await database.transaction(async (tx) => {
    await tx.insert(shipments).values({
      id: shipmentId,
      tenantId: session.tenant.id,
      brokerOrgId,
      shipperOrgId,
      carrierOrgId,
      customerOrgId,
      internalShipmentNumber,
      externalShipmentReference,
      pickupDate: toDateOrNull(input.pickupDate),
      deliveryDateExpected: toDateOrNull(input.deliveryDateExpected),
      deliveryDateActual: toDateOrNull(input.deliveryDateActual),
      status: input.status,
      temperatureControlled: input.temperatureControlled ?? false,
      notes: cleanNullable(input.notes),
      metadata: {
        entryMode: "manual",
      },
    });

    if (purchaseOrderId) {
      await tx.insert(shipmentOrders).values({
        shipmentId,
        purchaseOrderId,
      });
    }
  });

  await replaceShipmentStops({
    tenantId: session.tenant.id,
    shipmentId,
    pickupLocationId,
    deliveryLocationIds,
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "shipment",
    entityId: shipmentId,
    action: "created",
    summary: `Created shipment ${internalShipmentNumber ?? externalShipmentReference}.`,
    payload: {
      brokerOrgId,
      shipperOrgId,
      carrierOrgId,
      customerOrgId,
      pickupLocationId,
      deliveryLocationIds,
      purchaseOrderId,
      status: input.status,
    },
  });

  revalidateTag(dashboardSnapshotTag(session.tenant.id), "max");

  return shipmentId;
}

export async function updateShipmentRecord(session: AppSession, input: ShipmentInput & { id: string }) {
  const database = requireDb();
  await ensureTenantShipment(session.tenant.id, input.id);

  const internalShipmentNumber = cleanNullable(input.internalShipmentNumber);
  const externalShipmentReference = cleanNullable(input.externalShipmentReference);

  if (!internalShipmentNumber && !externalShipmentReference) {
    throw new Error("Provide at least one shipment reference.");
  }

  const brokerOrgId = cleanNullable(input.brokerOrgId);
  const customerOrgId = cleanNullable(input.customerOrgId);
  const shipperOrgId = cleanNullable(input.shipperOrgId) ?? customerOrgId;
  const carrierOrgId = cleanNullable(input.carrierOrgId);
  const pickupLocationId = cleanNullable(input.pickupLocationId);
  const deliveryLocationIds = normalizeLocationIds(input.deliveryLocationId, input.deliveryLocationIds);
  const purchaseOrderId = cleanNullable(input.purchaseOrderId);

  for (const organizationId of [brokerOrgId, shipperOrgId, carrierOrgId, customerOrgId]) {
    if (organizationId) {
      await ensureTenantOrganization(session.tenant.id, organizationId);
    }
  }

  for (const locationId of [pickupLocationId, ...deliveryLocationIds]) {
    if (locationId) {
      await ensureTenantLocation(session.tenant.id, locationId);
    }
  }

  if (purchaseOrderId) {
    await ensureTenantPurchaseOrder(session.tenant.id, purchaseOrderId);
  }

  const [current] = await database
    .select({ metadata: shipments.metadata })
    .from(shipments)
    .where(and(eq(shipments.id, input.id), eq(shipments.tenantId, session.tenant.id)))
    .limit(1);

  await database.transaction(async (tx) => {
    await tx
      .update(shipments)
      .set({
        brokerOrgId,
        shipperOrgId,
        carrierOrgId,
        customerOrgId,
        internalShipmentNumber,
        externalShipmentReference,
        pickupDate: toDateOrNull(input.pickupDate),
        deliveryDateExpected: toDateOrNull(input.deliveryDateExpected),
        deliveryDateActual: toDateOrNull(input.deliveryDateActual),
        status: input.status,
        temperatureControlled: input.temperatureControlled ?? false,
        notes: cleanNullable(input.notes),
        metadata: {
          ...(current?.metadata ?? {}),
          entryMode: "manual",
        },
        updatedAt: new Date(),
      })
      .where(and(eq(shipments.id, input.id), eq(shipments.tenantId, session.tenant.id)));

    await tx
      .delete(shipmentOrders)
      .where(eq(shipmentOrders.shipmentId, input.id));

    if (purchaseOrderId) {
      await tx.insert(shipmentOrders).values({
        shipmentId: input.id,
        purchaseOrderId,
      });
    }
  });

  await replaceShipmentStops({
    tenantId: session.tenant.id,
    shipmentId: input.id,
    pickupLocationId,
    deliveryLocationIds,
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "shipment",
    entityId: input.id,
    action: "updated",
    summary: `Updated shipment ${internalShipmentNumber ?? externalShipmentReference}.`,
    payload: {
      brokerOrgId,
      shipperOrgId,
      carrierOrgId,
      customerOrgId,
      pickupLocationId,
      deliveryLocationIds,
      purchaseOrderId,
      status: input.status,
    },
  });

  revalidateTag(dashboardSnapshotTag(session.tenant.id), "max");
}

export async function deleteShipmentRecord(session: AppSession, shipmentId: string) {
  const database = requireDb();
  await ensureTenantShipment(session.tenant.id, shipmentId);

  const [
    shipmentRecord,
    linkedDocument,
    linkedInvoice,
    linkedPayment,
    linkedCase,
    linkedException,
    linkedThread,
  ] = await Promise.all([
    database
      .select({
        id: shipments.id,
        internalShipmentNumber: shipments.internalShipmentNumber,
        externalShipmentReference: shipments.externalShipmentReference,
      })
      .from(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, session.tenant.id)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({ id: documentLinks.id })
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, session.tenant.id),
          eq(documentLinks.targetType, "shipment"),
          eq(documentLinks.targetId, shipmentId),
        ),
      )
      .limit(1),
    database
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.tenantId, session.tenant.id), eq(invoices.shipmentId, shipmentId)))
      .limit(1),
    database
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.tenantId, session.tenant.id), eq(payments.shipmentId, shipmentId)))
      .limit(1),
    database
      .select({ id: reconciliationCases.id })
      .from(reconciliationCases)
      .where(and(eq(reconciliationCases.tenantId, session.tenant.id), eq(reconciliationCases.shipmentId, shipmentId)))
      .limit(1),
    database
      .select({ id: exceptions.id })
      .from(exceptions)
      .where(and(eq(exceptions.tenantId, session.tenant.id), eq(exceptions.shipmentId, shipmentId)))
      .limit(1),
    database
      .select({ id: whatsappThreads.id })
      .from(whatsappThreads)
      .where(and(eq(whatsappThreads.tenantId, session.tenant.id), eq(whatsappThreads.shipmentId, shipmentId)))
      .limit(1),
  ]);

  if (
    linkedDocument.length ||
    linkedInvoice.length ||
    linkedPayment.length ||
    linkedCase.length ||
    linkedException.length ||
    linkedThread.length
  ) {
    throw new Error(
      "This route is already linked to evidence, finance, or reconciliation history. Remove those links first or keep the route for audit history.",
    );
  }

  await database.transaction(async (tx) => {
    const stopIds = await tx
      .select({ id: shipmentStops.id })
      .from(shipmentStops)
      .where(and(eq(shipmentStops.tenantId, session.tenant.id), eq(shipmentStops.shipmentId, shipmentId)));

    if (stopIds.length > 0) {
      await tx
        .delete(shipmentLineItems)
        .where(
          and(
            eq(shipmentLineItems.tenantId, session.tenant.id),
            or(
              eq(shipmentLineItems.shipmentId, shipmentId),
              inArray(
                shipmentLineItems.shipmentStopId,
                stopIds.map((stop) => stop.id),
              ),
            ),
          ),
        );
    } else {
      await tx
        .delete(shipmentLineItems)
        .where(and(eq(shipmentLineItems.tenantId, session.tenant.id), eq(shipmentLineItems.shipmentId, shipmentId)));
    }

    await tx
      .delete(shipmentStops)
      .where(and(eq(shipmentStops.tenantId, session.tenant.id), eq(shipmentStops.shipmentId, shipmentId)));

    await tx
      .delete(shipmentOrders)
      .where(and(eq(shipmentOrders.shipmentId, shipmentId)));

    await tx
      .delete(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.tenantId, session.tenant.id)));
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "shipment",
    entityId: shipmentId,
    action: "deleted",
    summary: `Deleted shipment ${shipmentRecord?.internalShipmentNumber ?? shipmentRecord?.externalShipmentReference ?? shipmentId}.`,
  });

  revalidateTag(dashboardSnapshotTag(session.tenant.id), "max");
}
