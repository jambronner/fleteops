import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import type { AppSession } from "@/lib/auth/session";
import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import {
  auditLogs,
  documentArtifacts,
  documentExtractionRuns,
  documentLinks,
  documents,
  extractedFacts,
  locations,
  organizations,
  purchaseOrders,
  reviewTasks,
  shipmentOrders,
  shipments,
  shipmentStops,
  tenants,
} from "@/lib/db/schema";
import {
  buildExtractionProvenanceSummary,
  type ExtractionProvenanceSummary,
} from "@/lib/documents/extraction-provenance";
import { buildDocumentPresentationSummary, type DocumentPresentationSummary } from "@/lib/documents/presentation";
import { getStorageDriver } from "@/lib/storage";

type StoredDocumentMetadata = {
  storage?: {
    driver: "local" | "s3";
    key: string;
    contentType?: string | null;
    size?: number | null;
    originalFileName?: string | null;
    sha256?: string | null;
    reusedStoredObject?: boolean | null;
    reusedFromDocumentId?: string | null;
  };
  extraction?: {
    status?: string;
    errorMessage?: string | null;
    failedAt?: string | null;
  };
  provenance?: {
    sourceChannel?: string | null;
    provider?: string | null;
    intakeEventId?: string | null;
    inboxId?: string | null;
    recipientAddress?: string | null;
    threadId?: string | null;
    messageId?: string | null;
    fromAddress?: string | null;
    fromName?: string | null;
    subject?: string | null;
    sentAt?: string | null;
    receivedAt?: string | null;
    forwarded?: {
      fromAddress?: string | null;
      fromName?: string | null;
      subject?: string | null;
      sentAt?: string | null;
    } | null;
  };
};

type BaseDocumentRow = {
  id: string;
  documentType: string;
  sourceChannel: string;
  originalFileName: string | null;
  extractionStatus: string;
  createdAt: Date;
  fileUrl: string | null;
  metadata: Record<string, unknown> | null;
  archivedAt?: Date | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
};

type ShipmentContext = {
  shipmentId: string;
  shipmentReference: string;
  internalShipmentNumber: string | null;
  externalShipmentReference: string | null;
  purchaseOrderNumber: string | null;
  pickupDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  customerName: string | null;
  shipperName: string | null;
  carrierName: string | null;
  pickupLocationName: string | null;
  deliveryLocationName: string | null;
};

type ShipmentLinkRow = {
  documentId: string;
  targetId: string;
  confidence: string | null;
  notes: string | null;
  createdAt: Date;
};

type FactRow = {
  documentId: string;
  extractionRunId: string | null;
  sourceArtifactId: string | null;
  sourceProvider: string | null;
  sourceModel: string | null;
  factType: string;
  valueText: string | null;
  valueNumber: string | null;
  valueDate: string | null;
};

type LatestRunRow = {
  id: string;
  documentId: string;
  provider: string;
  status: string;
  errorMessage: string | null;
  confidenceOverall: string | null;
  model: string | null;
  isFallbackRun: boolean;
  fallbackFromRunId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type DocumentSignals = {
  routeReferences: string[];
  purchaseOrderNumbers: string[];
  dates: string[];
  placeNames: string[];
  companyNames: string[];
  corpus: string[];
};

export type EvidenceMatchReason =
  | "route_reference"
  | "purchase_order"
  | "service_date"
  | "delivery_location"
  | "customer_name"
  | "shipper_name"
  | "carrier_name";

export type EvidenceRouteSummary = {
  shipmentId: string;
  shipmentReference: string;
  customerName: string | null;
  carrierName: string | null;
  pickupDate: string | null;
  expectedDeliveryDate: string | null;
  deliveryLocationName: string | null;
  routeLabel: string;
};

export type EvidenceRouteCandidate = EvidenceRouteSummary & {
  confidence: number;
  reasons: EvidenceMatchReason[];
};

export type RecentDocumentRecord = {
  id: string;
  documentType: string;
  sourceChannel: string;
  originalFileName: string;
  mimeType: string | null;
  extractionStatus: string;
  statusDetail: string | null;
  createdAt: Date;
  signedReadUrl: string | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  archiveReason: string | null;
  provenance: {
    provider: string | null;
    inboxAddress: string | null;
    senderLabel: string | null;
    senderAddress: string | null;
    subject: string | null;
    sentAt: string | null;
    receivedAt: string | null;
    originalSenderLabel: string | null;
    originalSenderAddress: string | null;
    originalSubject: string | null;
    originalSentAt: string | null;
  } | null;
  summary: DocumentPresentationSummary;
  linkedShipment: EvidenceRouteSummary | null;
  candidateShipments: EvidenceRouteCandidate[];
  latestRun: {
    provider: string;
    status: string;
    errorMessage: string | null;
    confidenceOverall: string | null;
    model: string | null;
    createdAt: Date;
  } | null;
  extractionProvenance: ExtractionProvenanceSummary | null;
};

export type ShipmentLinkedDocumentRecord = RecentDocumentRecord & {
  linkedAt: Date | null;
  linkConfidence: number | null;
  linkNotes: string | null;
};

export type EvidenceWorkspaceSnapshot = {
  metrics: {
    unlinkedEvidence: number;
    linkedEvidence: number;
    routesWithEvidence: number;
    routesWaitingForEvidence: number;
  };
  shipmentOptions: EvidenceRouteSummary[];
  intakeReviewTasks: EvidenceIntakeReviewTask[];
  unlinkedDocuments: RecentDocumentRecord[];
  recentDocuments: RecentDocumentRecord[];
  archivedDocuments: RecentDocumentRecord[];
};

export type EvidenceIntakeReviewTask = {
  id: string;
  title: string;
  details: string | null;
  priority: string;
  subjectId: string;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
};

function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL is required for document persistence.");
  }

  return db;
}

function buildOrganizationLabel(row: { displayName: string | null; legalName: string }) {
  return row.displayName ?? row.legalName;
}

function buildRouteLabel(shipment: Pick<ShipmentContext, "customerName" | "deliveryLocationName" | "expectedDeliveryDate">) {
  return [shipment.customerName, shipment.deliveryLocationName, shipment.expectedDeliveryDate].filter(Boolean).join(" · ");
}

function toRouteSummary(shipment: ShipmentContext): EvidenceRouteSummary {
  return {
    shipmentId: shipment.shipmentId,
    shipmentReference: shipment.shipmentReference,
    customerName: shipment.customerName,
    carrierName: shipment.carrierName,
    pickupDate: shipment.pickupDate,
    expectedDeliveryDate: shipment.expectedDeliveryDate,
    deliveryLocationName: shipment.deliveryLocationName,
    routeLabel: buildRouteLabel(shipment),
  };
}

function normalizeMatchValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulNeedle(value: string | null | undefined) {
  return normalizeMatchValue(value).length >= 4;
}

function normalizedMatches(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeMatchValue(a);
  const right = normalizeMatchValue(b);

  if (left.length < 4 || right.length < 4) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}

function corpusContains(corpus: string[], needle: string | null | undefined) {
  if (!isUsefulNeedle(needle)) {
    return false;
  }

  const normalizedNeedle = normalizeMatchValue(needle);

  return corpus.some((entry) => {
    const normalizedEntry = normalizeMatchValue(entry);

    if (normalizedEntry.length < normalizedNeedle.length) {
      return false;
    }

    return normalizedEntry.includes(normalizedNeedle);
  });
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function dateDistanceInDays(a: string | null | undefined, b: string | null | undefined) {
  const left = parseDateOnly(a);
  const right = parseDateOnly(b);

  if (!left || !right) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs(left.valueOf() - right.valueOf()) / millisecondsPerDay);
}

function numberOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildSenderLabel(args: { name?: string | null; address?: string | null }) {
  const name = args.name?.trim();
  const address = args.address?.trim();

  if (name && address) {
    return `${name} <${address}>`;
  }

  return name || address || null;
}

function extractDocumentProvenance(document: BaseDocumentRow) {
  const metadata = (document.metadata ?? {}) as StoredDocumentMetadata;
  const provenance = metadata.provenance;

  if (!provenance || document.sourceChannel !== "email") {
    return null;
  }

  return {
    provider: provenance.provider ?? null,
    inboxAddress: provenance.recipientAddress ?? provenance.inboxId ?? null,
    senderLabel: buildSenderLabel({
      name: provenance.fromName ?? null,
      address: provenance.fromAddress ?? null,
    }),
    senderAddress: provenance.fromAddress ?? null,
    subject: provenance.subject ?? null,
    sentAt: provenance.sentAt ?? null,
    receivedAt: provenance.receivedAt ?? null,
    originalSenderLabel: provenance.forwarded
      ? buildSenderLabel({
          name: provenance.forwarded.fromName ?? null,
          address: provenance.forwarded.fromAddress ?? null,
        })
      : null,
    originalSenderAddress: provenance.forwarded?.fromAddress ?? null,
    originalSubject: provenance.forwarded?.subject ?? null,
    originalSentAt: provenance.forwarded?.sentAt ?? null,
  };
}

function collectDocumentSignals(args: {
  document: BaseDocumentRow;
  summary: DocumentPresentationSummary;
  facts: FactRow[];
  normalizedText: string | null;
}) {
  const routeReferences: string[] = [];
  const purchaseOrderNumbers: string[] = [];
  const dates: string[] = [];
  const placeNames: string[] = [];
  const companyNames: string[] = [];
  const corpusValues: string[] = [args.document.originalFileName ?? ""];
  const provenance = extractDocumentProvenance(args.document);

  if (provenance) {
    corpusValues.push(
      provenance.subject ?? "",
      provenance.originalSubject ?? "",
      provenance.senderLabel ?? "",
      provenance.originalSenderLabel ?? "",
      provenance.inboxAddress ?? "",
    );
    companyNames.push(
      provenance.senderLabel ?? "",
      provenance.originalSenderLabel ?? "",
    );
  }

  for (const field of args.summary.fields) {
    corpusValues.push(field.value);

    switch (field.key) {
      case "shipmentReference":
        routeReferences.push(field.value);
        break;
      case "purchaseOrderNumber":
        purchaseOrderNumbers.push(field.value);
        break;
      case "deliveryDate":
      case "invoiceDate":
      case "purchaseDate":
        dates.push(field.value);
        break;
      case "shippingDestination":
      case "receiverName":
        placeNames.push(field.value);
        break;
      case "buyerName":
      case "sellerName":
      case "supplierName":
      case "companyName":
        companyNames.push(field.value);
        break;
      default:
        break;
    }
  }

  for (const fact of args.facts) {
    const value = fact.valueText ?? fact.valueDate ?? fact.valueNumber ?? "";

    if (value) {
      corpusValues.push(value);
    }

    switch (fact.factType) {
      case "shipment_reference":
        if (value) {
          routeReferences.push(value);
        }
        break;
      case "po_number":
        if (value) {
          purchaseOrderNumbers.push(value);
        }
        break;
      case "delivery_date":
        if (fact.valueDate) {
          dates.push(fact.valueDate);
        }
        if (fact.valueText) {
          dates.push(fact.valueText);
        }
        break;
      case "store_name":
      case "receiver_name":
        if (value) {
          placeNames.push(value);
        }
        break;
      default:
        break;
    }
  }

  if (args.normalizedText) {
    corpusValues.push(args.normalizedText.slice(0, 2500));
  }

  return {
    routeReferences: dedupe(routeReferences),
    purchaseOrderNumbers: dedupe(purchaseOrderNumbers),
    dates: dedupe(dates),
    placeNames: dedupe(placeNames),
    companyNames: dedupe(companyNames),
    corpus: dedupe(corpusValues),
  } satisfies DocumentSignals;
}

function suggestShipmentCandidates(args: {
  document: BaseDocumentRow;
  summary: DocumentPresentationSummary;
  facts: FactRow[];
  normalizedText: string | null;
  shipments: ShipmentContext[];
}) {
  const signals = collectDocumentSignals(args);

  return args.shipments
    .map((shipment) => {
      let score = 0;
      const reasons: EvidenceMatchReason[] = [];

      const addReason = (reason: EvidenceMatchReason, weight: number) => {
        if (reasons.includes(reason)) {
          return;
        }

        reasons.push(reason);
        score += weight;
      };

      if (
        signals.routeReferences.some((value) =>
          [shipment.shipmentReference, shipment.internalShipmentNumber, shipment.externalShipmentReference].some(
            (candidate) => normalizedMatches(value, candidate),
          ),
        )
      ) {
        addReason("route_reference", 0.62);
      }

      if (
        shipment.purchaseOrderNumber &&
        signals.purchaseOrderNumbers.some((value) => normalizedMatches(value, shipment.purchaseOrderNumber))
      ) {
        addReason("purchase_order", 0.38);
      }

      const dateMatches = [
        shipment.pickupDate,
        shipment.expectedDeliveryDate,
        shipment.actualDeliveryDate,
      ]
        .map((candidateDate) =>
          signals.dates
            .map((signalDate) => dateDistanceInDays(signalDate, candidateDate))
            .filter((distance): distance is number => distance !== null),
        )
        .flat();

      if (dateMatches.some((distance) => distance === 0)) {
        addReason("service_date", 0.18);
      } else if (dateMatches.some((distance) => distance <= 1)) {
        addReason("service_date", 0.1);
      }

      if (
        shipment.deliveryLocationName &&
        (signals.placeNames.some((value) => normalizedMatches(value, shipment.deliveryLocationName)) ||
          corpusContains(signals.corpus, shipment.deliveryLocationName))
      ) {
        addReason("delivery_location", 0.18);
      }

      if (
        shipment.customerName &&
        (signals.companyNames.some((value) => normalizedMatches(value, shipment.customerName)) ||
          corpusContains(signals.corpus, shipment.customerName))
      ) {
        addReason("customer_name", 0.14);
      }

      if (
        shipment.shipperName &&
        (signals.companyNames.some((value) => normalizedMatches(value, shipment.shipperName)) ||
          corpusContains(signals.corpus, shipment.shipperName))
      ) {
        addReason("shipper_name", 0.12);
      }

      if (
        shipment.carrierName &&
        (signals.companyNames.some((value) => normalizedMatches(value, shipment.carrierName)) ||
          corpusContains(signals.corpus, shipment.carrierName))
      ) {
        addReason("carrier_name", 0.12);
      }

      if (score < 0.18 && !reasons.includes("route_reference") && !reasons.includes("purchase_order")) {
        return null;
      }

      return {
        ...toRouteSummary(shipment),
        confidence: Math.min(Number(score.toFixed(2)), 0.98),
        reasons,
      } satisfies EvidenceRouteCandidate;
    })
    .filter((candidate): candidate is EvidenceRouteCandidate => Boolean(candidate))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

async function listShipmentContextsForTenant(tenantId: string) {
  const database = requireDb();
  const shipmentRows = await database
    .select({
      id: shipments.id,
      internalShipmentNumber: shipments.internalShipmentNumber,
      externalShipmentReference: shipments.externalShipmentReference,
      customerOrgId: shipments.customerOrgId,
      shipperOrgId: shipments.shipperOrgId,
      carrierOrgId: shipments.carrierOrgId,
      pickupDate: shipments.pickupDate,
      deliveryDateExpected: shipments.deliveryDateExpected,
      deliveryDateActual: shipments.deliveryDateActual,
      createdAt: shipments.createdAt,
    })
    .from(shipments)
    .where(eq(shipments.tenantId, tenantId))
    .orderBy(desc(shipments.createdAt));

  const shipmentIds = shipmentRows.map((row) => row.id);
  const organizationIds = Array.from(
    new Set(
      shipmentRows.flatMap((row) =>
        [row.customerOrgId, row.shipperOrgId, row.carrierOrgId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  );

  const [organizationRows, stopRows, orderRows] = await Promise.all([
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
    shipmentIds.length
      ? database
          .select({
            shipmentId: shipmentStops.shipmentId,
            stopType: shipmentStops.stopType,
            locationName: locations.name,
          })
          .from(shipmentStops)
          .leftJoin(locations, eq(locations.id, shipmentStops.locationId))
          .where(inArray(shipmentStops.shipmentId, shipmentIds))
      : [],
    shipmentIds.length
      ? database
          .select({
            shipmentId: shipmentOrders.shipmentId,
            poNumber: purchaseOrders.poNumber,
          })
          .from(shipmentOrders)
          .innerJoin(purchaseOrders, eq(purchaseOrders.id, shipmentOrders.purchaseOrderId))
          .where(inArray(shipmentOrders.shipmentId, shipmentIds))
      : [],
  ]);

  const organizationMap = new Map(
    organizationRows.map((row) => [row.id, buildOrganizationLabel(row)]),
  );
  const stopMap = new Map<string, { pickupLocationName: string | null; deliveryLocationName: string | null }>();

  for (const row of stopRows) {
    const current = stopMap.get(row.shipmentId) ?? {
      pickupLocationName: null,
      deliveryLocationName: null,
    };

    if (row.stopType === "pickup" && row.locationName && !current.pickupLocationName) {
      current.pickupLocationName = row.locationName;
    }

    if (row.stopType === "delivery" && row.locationName && !current.deliveryLocationName) {
      current.deliveryLocationName = row.locationName;
    }

    stopMap.set(row.shipmentId, current);
  }

  const orderMap = new Map<string, string>();
  for (const row of orderRows) {
    if (!orderMap.has(row.shipmentId)) {
      orderMap.set(row.shipmentId, row.poNumber);
    }
  }

  return shipmentRows.map((row) => {
    const stopData = stopMap.get(row.id);
    const shipmentReference = row.internalShipmentNumber ?? row.externalShipmentReference ?? row.id;

    return {
      shipmentId: row.id,
      shipmentReference,
      internalShipmentNumber: row.internalShipmentNumber,
      externalShipmentReference: row.externalShipmentReference,
      purchaseOrderNumber: orderMap.get(row.id) ?? null,
      pickupDate: row.pickupDate,
      expectedDeliveryDate: row.deliveryDateExpected,
      actualDeliveryDate: row.deliveryDateActual,
      customerName: row.customerOrgId ? organizationMap.get(row.customerOrgId) ?? null : null,
      shipperName: row.shipperOrgId ? organizationMap.get(row.shipperOrgId) ?? null : null,
      carrierName: row.carrierOrgId ? organizationMap.get(row.carrierOrgId) ?? null : null,
      pickupLocationName: stopData?.pickupLocationName ?? null,
      deliveryLocationName: stopData?.deliveryLocationName ?? null,
    } satisfies ShipmentContext;
  });
}

async function createSignedReadUrl(document: BaseDocumentRow) {
  const metadata = (document.metadata ?? {}) as StoredDocumentMetadata;

  if (!metadata.storage?.key) {
    return document.fileUrl;
  }

  const storageDriver = await getStorageDriver();
  return storageDriver.createSignedReadUrl({
    key: metadata.storage.key,
    fileName: document.originalFileName ?? "document",
  });
}

async function hydrateDocumentRecords(args: {
  tenantId: string;
  rows: BaseDocumentRow[];
  shipmentContexts: ShipmentContext[];
  includeCandidates?: boolean;
}) {
  if (args.rows.length === 0) {
    return [] as RecentDocumentRecord[];
  }

  const database = requireDb();
  const documentIds = args.rows.map((row) => row.id);

  const [latestRunRows, normalizedTextRows, factRows, linkRows] = await Promise.all([
    database
      .select({
        id: documentExtractionRuns.id,
        documentId: documentExtractionRuns.documentId,
        provider: documentExtractionRuns.provider,
        status: documentExtractionRuns.status,
        errorMessage: documentExtractionRuns.errorMessage,
        confidenceOverall: documentExtractionRuns.confidenceOverall,
        model: documentExtractionRuns.model,
        isFallbackRun: documentExtractionRuns.isFallbackRun,
        fallbackFromRunId: documentExtractionRuns.fallbackFromRunId,
        metadata: documentExtractionRuns.metadata,
        createdAt: documentExtractionRuns.createdAt,
      })
      .from(documentExtractionRuns)
      .where(
        and(
          eq(documentExtractionRuns.tenantId, args.tenantId),
          inArray(documentExtractionRuns.documentId, documentIds),
        ),
      )
      .orderBy(desc(documentExtractionRuns.createdAt)),
    database
      .select({
        documentId: documentArtifacts.documentId,
        textContent: documentArtifacts.textContent,
      })
      .from(documentArtifacts)
      .where(
        and(
          eq(documentArtifacts.tenantId, args.tenantId),
          inArray(documentArtifacts.documentId, documentIds),
          eq(documentArtifacts.artifactType, "normalized_text"),
        ),
      )
      .orderBy(desc(documentArtifacts.createdAt)),
    database
      .select({
        documentId: extractedFacts.documentId,
        extractionRunId: extractedFacts.extractionRunId,
        sourceArtifactId: extractedFacts.sourceArtifactId,
        sourceProvider: extractedFacts.sourceProvider,
        sourceModel: extractedFacts.sourceModel,
        factType: extractedFacts.factType,
        valueText: extractedFacts.valueText,
        valueNumber: extractedFacts.valueNumber,
        valueDate: extractedFacts.valueDate,
      })
      .from(extractedFacts)
      .where(
        and(
          eq(extractedFacts.tenantId, args.tenantId),
          inArray(extractedFacts.documentId, documentIds),
        ),
      )
      .orderBy(desc(extractedFacts.createdAt)),
    database
      .select({
        documentId: documentLinks.documentId,
        targetId: documentLinks.targetId,
        confidence: documentLinks.confidence,
        notes: documentLinks.notes,
        createdAt: documentLinks.createdAt,
      })
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.targetType, "shipment"),
          inArray(documentLinks.documentId, documentIds),
        ),
      )
      .orderBy(desc(documentLinks.createdAt)),
  ]);

  const latestRunMap = new Map<string, LatestRunRow>();
  const runMap = new Map<string, LatestRunRow[]>();
  for (const row of latestRunRows) {
    const documentRuns = runMap.get(row.documentId) ?? [];
    documentRuns.push(row);
    runMap.set(row.documentId, documentRuns);

    if (!latestRunMap.has(row.documentId)) {
      latestRunMap.set(row.documentId, row);
    }
  }

  const normalizedTextMap = new Map<string, string | null>();
  for (const row of normalizedTextRows) {
    if (!normalizedTextMap.has(row.documentId)) {
      normalizedTextMap.set(row.documentId, row.textContent);
    }
  }

  const factMap = new Map<string, FactRow[]>();
  for (const row of factRows) {
    const current = factMap.get(row.documentId) ?? [];
    current.push(row);
    factMap.set(row.documentId, current);
  }

  const linkMap = new Map<string, ShipmentLinkRow>();
  for (const row of linkRows) {
    if (!linkMap.has(row.documentId)) {
      linkMap.set(row.documentId, row);
    }
  }

  const shipmentMap = new Map(args.shipmentContexts.map((shipment) => [shipment.shipmentId, shipment]));
  const signedReadUrls = await Promise.all(args.rows.map((row) => createSignedReadUrl(row)));

  return args.rows.map((document, index) => {
    const facts = factMap.get(document.id) ?? [];
    const normalizedText = normalizedTextMap.get(document.id) ?? null;
    const summary = buildDocumentPresentationSummary({
      normalizedText,
      facts: facts.map((fact) => ({
        factType: fact.factType,
        valueText: fact.valueText,
        valueNumber: fact.valueNumber,
        valueDate: fact.valueDate,
      })),
    });
    const link = linkMap.get(document.id) ?? null;
    const linkedShipment = link ? shipmentMap.get(link.targetId) ?? null : null;
    const metadata = (document.metadata ?? {}) as StoredDocumentMetadata;
    const latestRun = latestRunMap.get(document.id) ?? null;

    return {
      id: document.id,
      documentType: document.documentType,
      sourceChannel: document.sourceChannel,
      originalFileName: document.originalFileName ?? "document",
      mimeType: "mimeType" in document ? ((document as { mimeType?: string | null }).mimeType ?? null) : null,
      extractionStatus: document.extractionStatus,
      statusDetail:
        typeof metadata.extraction === "object" &&
        metadata.extraction &&
        "errorMessage" in metadata.extraction &&
        typeof metadata.extraction.errorMessage === "string"
          ? metadata.extraction.errorMessage
          : null,
      createdAt: document.createdAt,
      signedReadUrl: signedReadUrls[index] ?? null,
      archivedAt: document.archivedAt ?? null,
      archivedByUserId: document.archivedByUserId ?? null,
      archiveReason: document.archiveReason ?? null,
      provenance: extractDocumentProvenance(document),
      summary,
      linkedShipment: linkedShipment ? toRouteSummary(linkedShipment) : null,
      candidateShipments:
        !link && args.includeCandidates
          ? suggestShipmentCandidates({
              document,
              summary,
              facts,
              normalizedText,
              shipments: args.shipmentContexts,
            })
          : [],
      latestRun: latestRun
        ? {
            provider: latestRun.provider,
            status: latestRun.status,
            errorMessage: latestRun.errorMessage,
            confidenceOverall: latestRun.confidenceOverall,
            model: latestRun.model,
            createdAt: latestRun.createdAt,
          }
        : null,
      extractionProvenance: latestRun
        ? buildExtractionProvenanceSummary({
            latestRun,
            runs: runMap.get(document.id) ?? [],
            facts,
          })
        : null,
    } satisfies RecentDocumentRecord;
  });
}

async function getShipmentLinkForDocument(args: { tenantId: string; documentId: string }) {
  const database = requireDb();
  const [link] = await database
    .select({
      documentId: documentLinks.documentId,
      targetId: documentLinks.targetId,
      confidence: documentLinks.confidence,
      notes: documentLinks.notes,
      createdAt: documentLinks.createdAt,
    })
    .from(documentLinks)
    .where(
      and(
        eq(documentLinks.tenantId, args.tenantId),
        eq(documentLinks.documentId, args.documentId),
        eq(documentLinks.targetType, "shipment"),
      ),
    )
    .orderBy(desc(documentLinks.createdAt))
    .limit(1);

  return link ?? null;
}

export async function tenantExists(tenantId: string) {
  const database = requireDb();
  const [tenant] = await database
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return Boolean(tenant);
}

export async function getStoredDocumentContext(args: { tenantId: string; documentId: string }) {
  const database = requireDb();
  const [document] = await database
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      documentType: documents.documentType,
      fileUrl: documents.fileUrl,
      originalFileName: documents.originalFileName,
      mimeType: documents.mimeType,
      language: documents.language,
      sourceChannel: documents.sourceChannel,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, args.documentId),
        eq(documents.tenantId, args.tenantId),
        isNull(documents.archivedAt),
      ),
    )
    .limit(1);

  if (!document) {
    return null;
  }

  const metadata = (document.metadata ?? {}) as StoredDocumentMetadata;

  if (!metadata.storage?.key) {
    return {
      ...document,
      signedReadUrl: document.fileUrl,
      storage: null,
    };
  }

  const storageDriver = await getStorageDriver();
  const signedReadUrl = await storageDriver.createSignedReadUrl({
    key: metadata.storage.key,
    fileName: document.originalFileName ?? "document",
  });

  return {
    ...document,
    signedReadUrl,
    storage: metadata.storage,
  };
}

export async function listRecentDocumentsForTenant(args: { tenantId: string; limit?: number }) {
  const database = requireDb();
  const limit = args.limit ?? 12;
  const rows = await database
    .select({
      id: documents.id,
      documentType: documents.documentType,
      sourceChannel: documents.sourceChannel,
      originalFileName: documents.originalFileName,
      extractionStatus: documents.extractionStatus,
      createdAt: documents.createdAt,
      fileUrl: documents.fileUrl,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, args.tenantId), isNull(documents.archivedAt)))
    .orderBy(desc(documents.createdAt))
    .limit(limit);

  const shipmentContexts = await listShipmentContextsForTenant(args.tenantId);
  return hydrateDocumentRecords({
    tenantId: args.tenantId,
    rows,
    shipmentContexts,
    includeCandidates: false,
  });
}

export async function listEvidenceWorkspaceForTenant(args: {
  tenantId: string;
  recentLimit?: number;
  unlinkedLimit?: number;
  archivedLimit?: number;
}) {
  const database = requireDb();
  const recentLimit = args.recentLimit ?? 12;
  const unlinkedLimit = args.unlinkedLimit ?? 8;
  const archivedLimit = args.archivedLimit ?? 12;

  const [rows, archivedRows, shipmentContexts, intakeReviewTasks] = await Promise.all([
    database
      .select({
        id: documents.id,
        documentType: documents.documentType,
        sourceChannel: documents.sourceChannel,
        originalFileName: documents.originalFileName,
        mimeType: documents.mimeType,
        extractionStatus: documents.extractionStatus,
        createdAt: documents.createdAt,
        fileUrl: documents.fileUrl,
        metadata: documents.metadata,
      })
      .from(documents)
      .where(and(eq(documents.tenantId, args.tenantId), isNull(documents.archivedAt)))
      .orderBy(desc(documents.createdAt)),
    database
      .select({
        id: documents.id,
        documentType: documents.documentType,
        sourceChannel: documents.sourceChannel,
        originalFileName: documents.originalFileName,
        mimeType: documents.mimeType,
        extractionStatus: documents.extractionStatus,
        createdAt: documents.createdAt,
        fileUrl: documents.fileUrl,
        metadata: documents.metadata,
        archivedAt: documents.archivedAt,
        archivedByUserId: documents.archivedByUserId,
        archiveReason: documents.archiveReason,
      })
      .from(documents)
      .where(and(eq(documents.tenantId, args.tenantId), sql`${documents.archivedAt} is not null`))
      .orderBy(desc(documents.archivedAt))
      .limit(archivedLimit),
    listShipmentContextsForTenant(args.tenantId),
    database
      .select({
        id: reviewTasks.id,
        title: reviewTasks.title,
        details: reviewTasks.details,
        priority: reviewTasks.priority,
        subjectId: reviewTasks.subjectId,
        createdAt: reviewTasks.createdAt,
        metadata: reviewTasks.metadata,
      })
      .from(reviewTasks)
      .where(
        and(
          eq(reviewTasks.tenantId, args.tenantId),
          inArray(reviewTasks.status, ["open", "assigned"]),
          eq(reviewTasks.subjectType, "intake_event"),
        ),
      )
      .orderBy(desc(reviewTasks.createdAt))
      .limit(6),
  ]);

  const hydratedDocuments = await hydrateDocumentRecords({
    tenantId: args.tenantId,
    rows,
    shipmentContexts,
    includeCandidates: true,
  });
  const hydratedArchivedDocuments = await hydrateDocumentRecords({
    tenantId: args.tenantId,
    rows: archivedRows,
    shipmentContexts,
    includeCandidates: false,
  });

  const linkedShipmentIds = new Set(
    hydratedDocuments
      .map((document) => document.linkedShipment?.shipmentId)
      .filter((shipmentId): shipmentId is string => Boolean(shipmentId)),
  );
  const linkedEvidence = hydratedDocuments.filter((document) => document.linkedShipment).length;
  const unlinkedDocuments = hydratedDocuments.filter((document) => !document.linkedShipment);

  return {
    metrics: {
      unlinkedEvidence: unlinkedDocuments.length,
      linkedEvidence,
      routesWithEvidence: linkedShipmentIds.size,
      routesWaitingForEvidence: Math.max(shipmentContexts.length - linkedShipmentIds.size, 0),
    },
    shipmentOptions: shipmentContexts.map((shipment) => toRouteSummary(shipment)),
    intakeReviewTasks,
    unlinkedDocuments: unlinkedDocuments.slice(0, unlinkedLimit),
    recentDocuments: hydratedDocuments.slice(0, recentLimit),
    archivedDocuments: hydratedArchivedDocuments,
  } satisfies EvidenceWorkspaceSnapshot;
}

export async function listDocumentsLinkedToShipment(args: { tenantId: string; shipmentId: string }) {
  const database = requireDb();
  const [rows, shipmentContexts] = await Promise.all([
    database
      .select({
        id: documents.id,
        documentType: documents.documentType,
        sourceChannel: documents.sourceChannel,
        originalFileName: documents.originalFileName,
        mimeType: documents.mimeType,
        extractionStatus: documents.extractionStatus,
        createdAt: documents.createdAt,
        fileUrl: documents.fileUrl,
        metadata: documents.metadata,
      })
      .from(documentLinks)
      .innerJoin(documents, eq(documents.id, documentLinks.documentId))
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.targetType, "shipment"),
          eq(documentLinks.targetId, args.shipmentId),
          isNull(documents.archivedAt),
        ),
      )
      .orderBy(desc(documentLinks.createdAt)),
    listShipmentContextsForTenant(args.tenantId),
  ]);

  const hydrated = await hydrateDocumentRecords({
    tenantId: args.tenantId,
    rows,
    shipmentContexts,
    includeCandidates: false,
  });

  const linkMap = new Map<string, ShipmentLinkRow>();
  await Promise.all(
    hydrated.map(async (document) => {
      const link = await getShipmentLinkForDocument({
        tenantId: args.tenantId,
        documentId: document.id,
      });

      if (link) {
        linkMap.set(document.id, link);
      }
    }),
  );

  return hydrated.map((document) => {
    const link = linkMap.get(document.id) ?? null;

    return {
      ...document,
      linkedAt: link?.createdAt ?? null,
      linkConfidence: numberOrNull(link?.confidence),
      linkNotes: link?.notes ?? null,
    } satisfies ShipmentLinkedDocumentRecord;
  });
}

export async function linkDocumentToShipment(args: {
  tenantId: string;
  documentId: string;
  shipmentId: string;
  confidence?: number | null;
  notes?: string | null;
  session: AppSession;
}) {
  const database = requireDb();
  const [document, shipment, existingLinks] = await Promise.all([
    database
      .select({
        id: documents.id,
        originalFileName: documents.originalFileName,
        archivedAt: documents.archivedAt,
      })
      .from(documents)
      .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({
        id: shipments.id,
        internalShipmentNumber: shipments.internalShipmentNumber,
        externalShipmentReference: shipments.externalShipmentReference,
      })
      .from(shipments)
      .where(and(eq(shipments.id, args.shipmentId), eq(shipments.tenantId, args.tenantId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({
        id: documentLinks.id,
        targetId: documentLinks.targetId,
      })
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.documentId, args.documentId),
          eq(documentLinks.targetType, "shipment"),
        ),
      ),
  ]);

  if (!document) {
    throw new Error("Document not found in this workspace.");
  }

  if (document.archivedAt) {
    throw new Error("Restore this archived document before linking it to a route.");
  }

  if (!shipment) {
    throw new Error("Route not found in this workspace.");
  }

  const shipmentReference =
    shipment.internalShipmentNumber ?? shipment.externalShipmentReference ?? args.shipmentId;

  await database.transaction(async (tx) => {
    if (existingLinks.length > 0) {
      await tx
        .delete(documentLinks)
        .where(
          and(
            eq(documentLinks.tenantId, args.tenantId),
            eq(documentLinks.documentId, args.documentId),
            eq(documentLinks.targetType, "shipment"),
          ),
        );
    }

    await tx.insert(documentLinks).values({
      tenantId: args.tenantId,
      documentId: args.documentId,
      targetType: "shipment",
      targetId: args.shipmentId,
      linkRole: "evidence_for",
      confidence:
        typeof args.confidence === "number" && Number.isFinite(args.confidence)
          ? args.confidence.toFixed(4)
          : null,
      notes: args.notes?.trim() ? args.notes.trim() : null,
    });

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      actorUserId: args.session.user.id,
      entityType: "document",
      entityId: args.documentId,
      action: existingLinks.length > 0 ? "relinked_to_shipment" : "linked_to_shipment",
      summary: `Linked document ${document.originalFileName ?? args.documentId} to route ${shipmentReference}.`,
      payload: {
        shipmentId: args.shipmentId,
        shipmentReference,
        replacedShipmentIds: existingLinks.map((link) => link.targetId),
        confidence: typeof args.confidence === "number" ? args.confidence : null,
        notes: args.notes?.trim() ? args.notes.trim() : null,
      },
    });
  });

  const shipmentContexts = await listShipmentContextsForTenant(args.tenantId);
  const linkedShipment = shipmentContexts.find((item) => item.shipmentId === args.shipmentId);

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");

  return {
    shipment: linkedShipment ? toRouteSummary(linkedShipment) : null,
  };
}

export async function unlinkDocumentFromShipment(args: {
  tenantId: string;
  documentId: string;
  session: AppSession;
}) {
  const database = requireDb();
  const [document, existingLinks] = await Promise.all([
    database
      .select({
        id: documents.id,
        originalFileName: documents.originalFileName,
      })
      .from(documents)
      .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({
        id: documentLinks.id,
        shipmentId: documentLinks.targetId,
      })
      .from(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.documentId, args.documentId),
          eq(documentLinks.targetType, "shipment"),
        ),
      ),
  ]);

  if (!document) {
    throw new Error("Document not found in this workspace.");
  }

  if (existingLinks.length === 0) {
    return { id: document.id, unlinked: false, previousShipmentIds: [] as string[] };
  }

  await database.transaction(async (tx) => {
    await tx
      .delete(documentLinks)
      .where(
        and(
          eq(documentLinks.tenantId, args.tenantId),
          eq(documentLinks.documentId, args.documentId),
          eq(documentLinks.targetType, "shipment"),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      actorUserId: args.session.user.id,
      entityType: "document",
      entityId: args.documentId,
      action: "unlinked_from_shipment",
      summary: `Removed route link from document ${document.originalFileName ?? args.documentId}.`,
      payload: {
        previousShipmentIds: existingLinks.map((link) => link.shipmentId),
      },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");

  return {
    id: document.id,
    unlinked: true,
    previousShipmentIds: existingLinks.map((link) => link.shipmentId),
  };
}

export async function archiveDocumentForTenant(args: {
  tenantId: string;
  documentId: string;
  reason: string;
  session: AppSession;
}) {
  const database = requireDb();
  const [document] = await database
    .select({
      id: documents.id,
      originalFileName: documents.originalFileName,
      archivedAt: documents.archivedAt,
      archiveReason: documents.archiveReason,
    })
    .from(documents)
    .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)))
    .limit(1);

  if (!document) {
    throw new Error("Document not found in this workspace.");
  }

  if (document.archivedAt) {
    return document;
  }

  const archivedAt = new Date();
  const reason = args.reason.trim();

  await database.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        archivedAt,
        archivedByUserId: args.session.user.id,
        archiveReason: reason,
        updatedAt: archivedAt,
      })
      .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)));

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      actorUserId: args.session.user.id,
      entityType: "document",
      entityId: args.documentId,
      action: "archived",
      summary: `Archived document ${document.originalFileName ?? args.documentId}.`,
      payload: {
        reason,
        retainedOriginal: true,
      },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");

  return {
    id: document.id,
    originalFileName: document.originalFileName ?? "document",
    archivedAt,
    archiveReason: reason,
  };
}

export async function restoreDocumentForTenant(args: {
  tenantId: string;
  documentId: string;
  session: AppSession;
}) {
  const database = requireDb();
  const [document] = await database
    .select({
      id: documents.id,
      originalFileName: documents.originalFileName,
      archivedAt: documents.archivedAt,
      archivedByUserId: documents.archivedByUserId,
      archiveReason: documents.archiveReason,
    })
    .from(documents)
    .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)))
    .limit(1);

  if (!document) {
    throw new Error("Document not found in this workspace.");
  }

  if (!document.archivedAt) {
    return document;
  }

  const restoredAt = new Date();
  const previousArchivedAt = document.archivedAt;

  await database.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
        updatedAt: restoredAt,
      })
      .where(and(eq(documents.id, args.documentId), eq(documents.tenantId, args.tenantId)));

    await tx.insert(auditLogs).values({
      tenantId: args.tenantId,
      actorUserId: args.session.user.id,
      entityType: "document",
      entityId: args.documentId,
      action: "restored",
      summary: `Restored document ${document.originalFileName ?? args.documentId}.`,
      payload: {
        previousArchivedAt: previousArchivedAt.toISOString(),
        previousArchivedByUserId: document.archivedByUserId,
        previousArchiveReason: document.archiveReason,
      },
    });
  });

  revalidateTag(dashboardSnapshotTag(args.tenantId), "max");

  return {
    id: document.id,
    originalFileName: document.originalFileName ?? "document",
    restoredAt,
  };
}
