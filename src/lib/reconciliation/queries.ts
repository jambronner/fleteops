import { unstable_cache } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { documentLinks, documents, extractedFacts, reviewTasks, tenants } from "@/lib/db/schema";
import { tenantRequiresFolioReturn } from "@/lib/operations/folio";
import {
  getManualShipmentDetail,
  getManualShipments,
  type ManualShipmentRecord,
} from "@/lib/operations/repository";
import { evaluateShipmentPacket } from "@/lib/reconciliation/engine";
import {
  getRateCardsForTenant,
  resolveRateCardAmount,
  type RateCardRecord,
} from "@/lib/reconciliation/rate-cards";
import type {
  DashboardSnapshot,
  EvidenceChannel,
  EvidenceDocumentType,
  ShipmentDetail,
  ShipmentLifecycle,
  ShipmentPacket,
} from "@/lib/reconciliation/types";

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function mapLifecycle(status: string): ShipmentLifecycle {
  if (status === "delivered" || status === "delivered_with_exception") {
    return "delivered";
  }

  if (status === "in_transit") {
    return "in_transit";
  }

  return "planned";
}

function mapDocumentType(type: string): EvidenceDocumentType {
  if (
    type === "customer_po" ||
    type === "retailer_receipt" ||
    type === "pod" ||
    type === "carrier_invoice" ||
    type === "broker_invoice" ||
    type === "photo" ||
    type === "voice_note"
  ) {
    return type;
  }

  if (type === "shipper_po") {
    return "customer_po";
  }

  if (type === "vendor_invoice") {
    return "carrier_invoice";
  }

  return "photo";
}

function mapSourceChannel(channel: string): EvidenceChannel {
  if (
    channel === "whatsapp" ||
    channel === "email" ||
    channel === "upload" ||
    channel === "manual" ||
    channel === "import"
  ) {
    return channel;
  }

  if (channel === "spreadsheet_import") {
    return "import";
  }

  return "upload";
}

function buildRouteLabel(args: {
  pickupLocationName: string | null;
  deliveryLocationName: string | null;
  deliveryStops?: Array<{ name: string }>;
}) {
  const deliveryLabel =
    args.deliveryStops && args.deliveryStops.length > 1
      ? `${args.deliveryStops[0].name} +${args.deliveryStops.length - 1}`
      : args.deliveryLocationName;

  return [args.pickupLocationName, deliveryLabel].filter(Boolean).join(" → ");
}

function dateOrFallback(value: string | null | undefined, fallback: string) {
  return value ?? fallback;
}

/**
 * Latest extracted amount_total per shipment from linked carrier invoices, so
 * the engine can compare the invoiced amount against the rate-card expectation.
 */
async function loadCarrierInvoiceAmounts(
  tenantId: string,
  shipmentIds: string[],
): Promise<Map<string, number>> {
  const database = requireDb();

  if (shipmentIds.length === 0) {
    return new Map();
  }

  const rows = await database
    .select({
      shipmentId: documentLinks.targetId,
      valueNumber: extractedFacts.valueNumber,
      confidence: extractedFacts.confidence,
      createdAt: extractedFacts.createdAt,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .innerJoin(extractedFacts, eq(extractedFacts.documentId, documents.id))
    .where(
      and(
        eq(documentLinks.tenantId, tenantId),
        eq(documentLinks.targetType, "shipment"),
        inArray(documentLinks.targetId, shipmentIds),
        isNull(documents.archivedAt),
        inArray(documents.documentType, ["carrier_invoice", "vendor_invoice"]),
        eq(extractedFacts.factType, "amount_total"),
      ),
    )
    .orderBy(desc(extractedFacts.createdAt));

  const amounts = new Map<string, { amount: number; confidence: number }>();

  for (const row of rows) {
    const amount = row.valueNumber != null ? Number(row.valueNumber) : Number.NaN;
    const confidence = row.confidence != null ? Number(row.confidence) : 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const current = amounts.get(row.shipmentId);

    if (!current || confidence > current.confidence) {
      amounts.set(row.shipmentId, { amount, confidence });
    }
  }

  return new Map([...amounts.entries()].map(([shipmentId, entry]) => [shipmentId, entry.amount]));
}

async function loadTenantRequiresFolioReturn(tenantId: string): Promise<boolean> {
  const database = requireDb();
  const [row] = await database
    .select({ metadata: tenants.metadata })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return tenantRequiresFolioReturn(row?.metadata ?? null);
}

function resolveExpectedCarrierAmount(args: {
  rateCards: RateCardRecord[];
  shipment: Pick<
    ManualShipmentRecord,
    "carrierOrgId" | "deliveryStopCount" | "expectedDeliveryDate" | "pickupDate"
  >;
}): number | undefined {
  const resolved = resolveRateCardAmount({
    rateCards: args.rateCards,
    direction: "carrier",
    counterpartyOrgId: args.shipment.carrierOrgId,
    stopCount: args.shipment.deliveryStopCount,
    serviceDate: args.shipment.expectedDeliveryDate ?? args.shipment.pickupDate,
  });

  return resolved?.amount;
}

async function readDashboardSnapshot(
  tenantId: string,
  locale = "es-MX",
): Promise<DashboardSnapshot> {
  const database = requireDb();
  const shipmentRows = await getManualShipments(tenantId);
  const shipmentIds = shipmentRows.map((shipment) => shipment.id);
  const [rateCards, carrierInvoiceAmounts, folioRequired] = await Promise.all([
    getRateCardsForTenant(tenantId),
    loadCarrierInvoiceAmounts(tenantId, shipmentIds),
    loadTenantRequiresFolioReturn(tenantId),
  ]);
  const intakeActionQueue = await database
    .select({
      id: reviewTasks.id,
      title: reviewTasks.title,
      details: reviewTasks.details,
      priority: reviewTasks.priority,
      subjectType: reviewTasks.subjectType,
      subjectId: reviewTasks.subjectId,
      metadata: reviewTasks.metadata,
      createdAt: reviewTasks.createdAt,
    })
    .from(reviewTasks)
    .where(
      and(
        eq(reviewTasks.tenantId, tenantId),
        inArray(reviewTasks.status, ["open", "assigned"]),
        eq(reviewTasks.subjectType, "intake_event"),
      ),
    )
    .orderBy(desc(reviewTasks.createdAt))
    .limit(12);

  const linkedDocumentRows = shipmentIds.length
    ? await database
        .select({
          shipmentId: documentLinks.targetId,
          documentId: documents.id,
          documentType: documents.documentType,
          sourceChannel: documents.sourceChannel,
          title: documents.originalFileName,
          documentNumber: documents.documentNumber,
          issuingOrgId: documents.issuingOrgId,
          uploadedAt: documents.createdAt,
        })
        .from(documentLinks)
        .innerJoin(documents, eq(documents.id, documentLinks.documentId))
        .where(
          and(
            eq(documentLinks.tenantId, tenantId),
            eq(documentLinks.targetType, "shipment"),
            inArray(documentLinks.targetId, shipmentIds),
            isNull(documents.archivedAt),
          ),
        )
        .orderBy(desc(documentLinks.createdAt))
    : [];

  const documentsByShipment = new Map<string, typeof linkedDocumentRows>();

  for (const document of linkedDocumentRows) {
    const current = documentsByShipment.get(document.shipmentId) ?? [];
    current.push(document);
    documentsByShipment.set(document.shipmentId, current);
  }

  const shipments: ShipmentDetail[] = shipmentRows.map((shipment) => {
    const fallbackDate = shipment.createdAt.slice(0, 10);
    const linkedDocuments = documentsByShipment.get(shipment.id) ?? [];
    const packet: ShipmentPacket = {
      id: shipment.id,
      tenantId,
      shipmentReference: shipment.shipmentReference,
      brokerName: "FleteOps",
      customerName: shipment.customerName ?? "Unassigned customer",
      shipperName: shipment.shipperName ?? "Unassigned shipper",
      destinationName: shipment.deliveryLocationName ?? "Unassigned destination",
      routeLabel:
        buildRouteLabel({
          pickupLocationName: shipment.pickupLocationName,
          deliveryLocationName: shipment.deliveryLocationName,
          deliveryStops: shipment.deliveryStops,
        }) || shipment.shipmentReference,
      lifecycle: mapLifecycle(shipment.status),
      poNumber: shipment.purchaseOrderNumber ?? undefined,
      expectedDeliveryDate: dateOrFallback(
        shipment.expectedDeliveryDate,
        shipment.pickupDate ?? fallbackDate,
      ),
      actualDeliveryDate: shipment.actualDeliveryDate ?? undefined,
      expectedQuantity: 1,
      deliveredQuantity:
        shipment.status === "delivered" || shipment.status === "delivered_with_exception"
          ? linkedDocuments.some((document) =>
              ["pod", "retailer_receipt", "photo"].includes(document.documentType),
            )
            ? 1
            : undefined
          : undefined,
      expectedCarrierInvoiceAmount: resolveExpectedCarrierAmount({ rateCards, shipment }),
      carrierInvoiceAmount: carrierInvoiceAmounts.get(shipment.id),
      folioRequired,
      folioStatus: shipment.folio?.status ?? null,
      documents: linkedDocuments.map((document) => ({
        id: document.documentId,
        type: mapDocumentType(document.documentType),
        title: document.title ?? document.documentNumber ?? document.documentId,
        sourceChannel: mapSourceChannel(document.sourceChannel),
        uploadedAt: document.uploadedAt.toISOString(),
        issuingParty: document.issuingOrgId ?? "Unknown",
        extractedFacts: document.documentNumber ? [document.documentNumber] : [],
      })),
      messages: [],
      decision: shipment.decision,
    };

    return {
      packet,
      evaluation: evaluateShipmentPacket(packet, locale),
    };
  });

  const exceptionQueue = shipments.flatMap((shipment) =>
    shipment.evaluation.exceptions.map((exception) => ({
      ...exception,
      shipmentId: shipment.packet.id,
      shipmentReference: shipment.packet.shipmentReference,
    })),
  );
  const documentQueue = shipments
    .map((shipment) => ({
      shipmentId: shipment.packet.id,
      shipmentReference: shipment.packet.shipmentReference,
      customerName: shipment.packet.customerName,
      missingLabels: shipment.evaluation.requirements
        .filter((requirement) => requirement.status === "missing")
        .map((requirement) => requirement.label),
    }))
    .filter((shipment) => shipment.missingLabels.length > 0);

  const openShipments = shipments.filter((shipment) => shipment.evaluation.controlTowerStatus !== "ready");

  return {
    shipments,
    metrics: {
      activeShipments: openShipments.length,
      reviewQueue:
        intakeActionQueue.length +
        shipments.filter((shipment) =>
          ["blocked", "needsReview"].includes(shipment.evaluation.controlTowerStatus),
        ).length,
      documentsMissing: documentQueue.length,
      readyToInvoice: shipments.filter((shipment) => shipment.evaluation.controlTowerStatus === "ready").length,
    },
    intakeActionQueue: intakeActionQueue.map((task) => ({
      ...task,
      createdAt: task.createdAt.toISOString(),
    })),
    exceptionQueue,
    documentQueue,
  };
}

export async function getDashboardSnapshot(
  tenantId: string,
  locale = "es-MX",
): Promise<DashboardSnapshot> {
  const read = unstable_cache(
    async () => readDashboardSnapshot(tenantId, locale),
    ["dashboard-snapshot", tenantId, locale],
    {
      revalidate: 20,
      tags: [dashboardSnapshotTag(tenantId)],
    },
  );

  return read();
}

export async function getCurrentShipmentDetail(
  tenantId: string,
  shipmentId: string,
  locale = "es-MX",
): Promise<ShipmentDetail | null> {
  const detail = await getManualShipmentDetail(tenantId, shipmentId);

  if (!detail) {
    return null;
  }

  const shipment = detail.shipment;
  const [rateCards, carrierInvoiceAmounts, folioRequired] = await Promise.all([
    getRateCardsForTenant(tenantId),
    loadCarrierInvoiceAmounts(tenantId, [shipmentId]),
    loadTenantRequiresFolioReturn(tenantId),
  ]);
  const fallbackDate = shipment.createdAt.slice(0, 10);
  const packet: ShipmentPacket = {
    id: shipment.id,
    tenantId,
    shipmentReference: shipment.shipmentReference,
    brokerName: "FleteOps",
    customerName: shipment.customerName ?? "Unassigned customer",
    shipperName: shipment.shipperName ?? "Unassigned shipper",
    destinationName:
      shipment.deliveryLocationName ?? "Unassigned destination",
    routeLabel:
      buildRouteLabel({
        pickupLocationName: shipment.pickupLocationName,
        deliveryLocationName: shipment.deliveryLocationName,
        deliveryStops: shipment.deliveryStops,
      }) || shipment.shipmentReference,
    lifecycle: mapLifecycle(shipment.status),
    poNumber: shipment.purchaseOrderNumber ?? undefined,
    expectedDeliveryDate: dateOrFallback(
      shipment.expectedDeliveryDate,
      shipment.pickupDate ?? fallbackDate,
    ),
    actualDeliveryDate: shipment.actualDeliveryDate ?? undefined,
    expectedQuantity: 1,
    deliveredQuantity:
      shipment.status === "delivered" ||
      shipment.status === "delivered_with_exception"
        ? detail.linkedEvidence.some((document) =>
            ["pod", "retailer_receipt", "photo"].includes(
              document.documentType,
            ),
          )
          ? 1
          : undefined
        : undefined,
    expectedCarrierInvoiceAmount: resolveExpectedCarrierAmount({ rateCards, shipment }),
    carrierInvoiceAmount: carrierInvoiceAmounts.get(shipmentId),
    folioRequired,
    folioStatus: shipment.folio?.status ?? null,
    documents: detail.linkedEvidence.map((document) => ({
      id: document.id,
      type: mapDocumentType(document.documentType),
      title: document.originalFileName ?? document.id,
      sourceChannel: mapSourceChannel(document.sourceChannel),
      uploadedAt: document.createdAt.toISOString(),
      issuingParty:
        document.provenance?.senderLabel ??
        document.provenance?.senderAddress ??
        "Unknown",
      extractedFacts: document.summary.fields
        .map((field) => field.value)
        .filter((value): value is string => Boolean(value)),
    })),
    messages: [],
    decision: shipment.decision,
  };

  return {
    packet,
    evaluation: evaluateShipmentPacket(packet, locale),
  };
}

export async function getShipmentDetail(
  shipmentId: string,
  locale = "es-MX",
): Promise<ShipmentDetail | null> {
  void shipmentId;
  void locale;
  return null;
}
