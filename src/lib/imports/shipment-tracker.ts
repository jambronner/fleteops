import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import type { AppSession } from "@/lib/auth/session";
import { dashboardSnapshotTag } from "@/lib/cache-tags";
import { db } from "@/lib/db/client";
import { auditLogs, locations, organizations, shipments, shipmentStops } from "@/lib/db/schema";
import {
  buildRouteManifestPreview,
  buildUnmatchedLocationsWarning,
  defaultRouteManifestMapping,
  normalizeRouteCode,
  normalizeStopDeliveryStatus,
  stopIdentityKey,
  type RouteManifestDirectoryLocation,
  type RouteManifestDirectoryOrganization,
  type RouteManifestMapping,
  type RouteManifestPreviewResult,
  type RouteManifestRoutePreview,
  type RouteManifestStopPreview,
} from "@/lib/imports/route-manifest";
import { parseSpreadsheet } from "@/lib/imports/spreadsheet";

type ShipmentStatus = (typeof shipments.$inferSelect)["status"];
type StopStatus = (typeof shipmentStops.$inferSelect)["status"];

export type ShipmentTrackerBuildResult = RouteManifestPreviewResult & {
  rowCount: number;
  previewRows: Array<{
    rowNumber: number;
    routeName: string | null;
    locationName: string | null;
    address: string | null;
    brand: string | null;
    externalReference: string | null;
    organizationMatch: string | null;
    locationMatch: string | null;
    status: ShipmentStatus;
  }>;
};

export type ShipmentTrackerImportResult = Omit<ShipmentTrackerBuildResult, "routes"> & {
  created: number;
  shipmentIds: string[];
  updated: number;
  updatedShipmentIds: string[];
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseFileDateToken(fileName: string) {
  // Kept in sync with parseFileDate in route-manifest.ts: Google Drive exports name files like
  // "Demo routes 18/01/2026.xlsx", and browsers replace the "/" with a space or underscore.
  const match = fileName.match(/(\d{1,2})[\s_-](\d{1,2})[\s_-](\d{4})/);

  if (!match) {
    return "IMPORT";
  }

  const [, day, month, year] = match;
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

function buildRouteReference(args: { fileName: string; route: RouteManifestRoutePreview; routeIndex: number }) {
  const dateToken = args.route.dispatchDate?.replace(/-/g, "") || parseFileDateToken(args.fileName);
  return `IMP-${dateToken}-${String(args.routeIndex + 1).padStart(3, "0")}`;
}

const shipmentExternalReferenceMaxLength = 128;

export function buildShipmentExternalReference(
  stops: Array<{ orderReference: string | null; invoiceReference: string | null }>,
) {
  const seen = new Set<string>();
  const parts = stops.flatMap((stop) => [stop.orderReference, stop.invoiceReference]).filter(Boolean) as string[];
  const reference = parts
    .filter((part) => {
      const key = part.trim().toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(" / ") || null;

  if (!reference || reference.length <= shipmentExternalReferenceMaxLength) {
    return reference;
  }

  return `${reference.slice(0, shipmentExternalReferenceMaxLength - 4).trimEnd()}...`;
}

function buildRouteNotes(route: RouteManifestRoutePreview) {
  const lines = [
    ["Imported route", route.routeGroup],
    ["Dispatch date", route.dispatchDate],
    ["Operating entity", route.operatingEntity],
    ["Carrier", route.carrier],
    ["Route status", route.routeStatus],
    ["Imported stops", String(route.stops.length)],
  ]
    .filter((entry): entry is [string, string] => Boolean(cleanNullable(entry[1])))
    .map(([label, value]) => `${label}: ${value}`);

  return lines.length ? lines.join("\n") : null;
}

function uniqueMatchedOrganizationId(stops: RouteManifestStopPreview[]) {
  const ids = Array.from(new Set(stops.map((stop) => stop.organizationMatch?.id).filter(Boolean) as string[]));
  return ids.length === 1 ? ids[0] : null;
}

function normalizeForMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function importedShipmentStatus(value: string | null): ShipmentStatus | null {
  const normalized = normalizeForMatch(value);
  const statusByValue: Record<string, ShipmentStatus> = {
    borrador: "draft",
    draft: "draft",
    planeado: "planned",
    planificado: "planned",
    planned: "planned",
    programado: "planned",
    scheduled: "planned",
    en_transito: "in_transit",
    in_transit: "in_transit",
    entregado: "delivered",
    delivered: "delivered",
    delivered_with_exception: "delivered_with_exception",
    entregado_con_excepcion: "delivered_with_exception",
    cancelado: "cancelled",
    cancelled: "cancelled",
    canceled: "cancelled",
  };

  return statusByValue[normalized] ?? null;
}

/**
 * A stop counts toward "completed" in the shipment-status tally if it's either fully `completed`
 * or `completed_with_exception` (controller ruling, final-review fix wave Finding 2: a delivery
 * completed with an exception is still a completed delivery for shipment-status purposes).
 */
function countsAsCompletedForDerivation(status: StopStatus): boolean {
  return status === "completed" || status === "completed_with_exception";
}

/**
 * Aggregates a final set of per-stop delivery statuses (plus whether any of those stops still
 * needs location review) into the shipment-level status. Shared by insert-time derivation
 * (`deriveShipmentStatusFromStops`) and same-day upsert derivation (`deriveUpsertShipmentStatus`),
 * so both paths apply the exact same Task 1 rule: all completed -> delivered, some completed ->
 * in_transit, otherwise fall back to the imported route status (with location-review draft
 * gating taking precedence unless the route was explicitly cancelled).
 */
export function deriveShipmentStatusFromStopStatuses(args: {
  statuses: StopStatus[];
  needsLocationReview: boolean;
  routeStatus: string | null;
}): ShipmentStatus {
  const importedStatus = importedShipmentStatus(args.routeStatus);

  if (args.needsLocationReview && importedStatus !== "cancelled") {
    return "draft";
  }

  const completedCount = args.statuses.filter(countsAsCompletedForDerivation).length;

  if (args.statuses.length > 0 && completedCount === args.statuses.length) {
    return args.statuses.some((status) => status === "completed_with_exception")
      ? "delivered_with_exception"
      : "delivered";
  }

  if (completedCount > 0) {
    return "in_transit";
  }

  return importedStatus ?? (args.needsLocationReview ? "draft" : "planned");
}

export function deriveShipmentStatusFromStops(route: RouteManifestRoutePreview): ShipmentStatus {
  const needsLocationReview = route.stops.some((stop) => stop.needsLocationReview);
  const statuses = route.stops.map((stop) => normalizeStopDeliveryStatus(stop.deliveryStatus) ?? "planned");

  return deriveShipmentStatusFromStopStatuses({ statuses, needsLocationReview, routeStatus: route.routeStatus });
}

function isReferenceBasedIdentityKey(reference: { orderReference: string | null; invoiceReference: string | null }) {
  return (
    stopIdentityKey({
      orderReference: reference.orderReference,
      invoiceReference: reference.invoiceReference,
      deliveryPointName: null,
      deliveryAddress: null,
    }) !== null
  );
}

/**
 * Builds a tenant-scoped index of order/invoice-based stop identity keys -> the set of
 * dispatch dates they were previously imported under. Name+address-only identity keys are
 * excluded because those repeat legitimately across days and must not trigger cross-day dedupe.
 */
export function buildReferenceIdentityDispatchIndex(
  rows: Array<{ metadata: Record<string, unknown> | null | undefined }>,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const row of rows) {
    const metadata = row.metadata;
    if (!metadata) {
      continue;
    }

    const identityKey = typeof metadata.identityKey === "string" ? metadata.identityKey : null;
    if (!identityKey) {
      continue;
    }

    const orderReference = typeof metadata.orderReference === "string" ? metadata.orderReference : null;
    const invoiceReference = typeof metadata.invoiceReference === "string" ? metadata.invoiceReference : null;

    if (!isReferenceBasedIdentityKey({ orderReference, invoiceReference })) {
      continue;
    }

    const dispatchDate = typeof metadata.dispatchDate === "string" ? metadata.dispatchDate : "";
    const dates = index.get(identityKey) ?? new Set<string>();
    dates.add(dispatchDate);
    index.set(identityKey, dates);
  }

  return index;
}

export type CrossDayDuplicateFilterResult = {
  routes: RouteManifestRoutePreview[];
  duplicateSkipped: number;
  duplicateReferences: string[];
};

/**
 * Drops incoming delivery stops whose order/invoice-based identity key already exists on a
 * different dispatch date than the incoming route (a cross-day carryover row). Stops that match
 * on the same dispatch date are left in place for the same-day upsert (Task 2). Name+address-only
 * identity keys are never dropped here since they repeat legitimately across days.
 */
export function filterCrossDayDuplicateStops(args: {
  routes: RouteManifestRoutePreview[];
  referenceIdentityDispatchIndex: Map<string, Set<string>>;
}): CrossDayDuplicateFilterResult {
  let duplicateSkipped = 0;
  const duplicateReferences: string[] = [];

  const routes = args.routes
    .map((route) => {
      const incomingDispatchDate = route.dispatchDate ?? "";
      const stops = route.stops.filter((stop) => {
        if (!isReferenceBasedIdentityKey(stop)) {
          return true;
        }

        const key = stopIdentityKey(stop);
        const priorDispatchDates = key ? args.referenceIdentityDispatchIndex.get(key) : undefined;

        if (!priorDispatchDates || priorDispatchDates.has(incomingDispatchDate)) {
          return true;
        }

        duplicateSkipped += 1;
        duplicateReferences.push(stop.orderReference ?? stop.invoiceReference ?? key ?? "");
        return false;
      });

      return { ...route, stops };
    })
    .filter((route) => route.stops.length > 0);

  return { routes, duplicateSkipped, duplicateReferences };
}

export function buildDuplicateSkippedWarning(locale: string, references: string[]): string | null {
  if (references.length === 0) {
    return null;
  }

  const shown = references.slice(0, 5);
  const remaining = references.length - shown.length;
  const list = remaining > 0 ? `${shown.join(", ")}, +${remaining} more` : shown.join(", ");

  return locale === "en"
    ? `${references.length} stop${references.length === 1 ? "" : "s"} skipped as cross-day duplicates: ${list}.`
    : `${references.length} parada${references.length === 1 ? "" : "s"} omitida${references.length === 1 ? "" : "s"} por duplicado entre días: ${list}.`;
}

function findOrganizationIdByLabel(label: string | null, organizations: RouteManifestDirectoryOrganization[]) {
  const normalizedLabel = normalizeForMatch(label);

  if (!normalizedLabel) {
    return null;
  }

  return (
    organizations.find((organization) =>
      [organization.displayName, organization.legalName]
        .filter(Boolean)
        .some((name) => normalizeForMatch(name) === normalizedLabel),
    )?.id ?? null
  );
}

function routeMetadata(args: {
  importBatchId?: string;
  fileName: string;
  route: RouteManifestRoutePreview;
  routeReference: string;
}) {
  const firstStop = args.route.stops[0];

  return {
    entryMode: "import",
    importBatchId: args.importBatchId ?? null,
    sourceFileName: args.fileName,
    routeReference: args.routeReference,
    routeName: args.route.routeGroup,
    routeGroup: args.route.routeGroup,
    dispatchDate: args.route.dispatchDate,
    groupingKey: args.route.groupingKey,
    routeStopCount: args.route.stops.length,
    operatingEntity: args.route.operatingEntity,
    carrier: args.route.carrier,
    routeStatus: args.route.routeStatus,
    sourceRowNumbers: args.route.stops.map((stop) => stop.sourceRowNumber),
    importRowHashes: args.route.stops.map((stop) => stop.importRowHash),
    brand: firstStop?.clientAccount ?? null,
    locationName: firstStop?.deliveryPointName ?? null,
    address: firstStop?.deliveryAddress ?? null,
    orderNumber: firstStop?.orderReference ?? null,
    invoiceNumber: firstStop?.invoiceReference ?? null,
    needsLocationReview: args.route.stops.some((stop) => stop.needsLocationReview),
    stopIdentityKeys: Array.from(
      new Set(args.route.stops.map((stop) => stopIdentityKey(stop)).filter((key): key is string => key !== null)),
    ),
  };
}

function stopNotes(stop: RouteManifestStopPreview) {
  const lines = [
    ["Delivery window", stop.deliveryWindow],
    ["Delivery status", stop.deliveryStatus],
    ["Comments", stop.stopNotes],
    ["Boxes", stop.quantityOrBoxes],
    ["Product", stop.productDescription],
    ["Phone", stop.phoneNumber],
    ["Invoice value", stop.invoiceValue],
    ["Inventory", stop.inventoryRegistration],
  ]
    .filter((entry): entry is [string, string] => Boolean(cleanNullable(entry[1])))
    .map(([label, value]) => `${label}: ${value}`);

  return lines.length ? lines.join("\n") : null;
}

function stopMetadata(args: {
  importBatchId: string;
  route: RouteManifestRoutePreview;
  stop: RouteManifestStopPreview;
}) {
  return {
    importBatchId: args.importBatchId,
    routeGroup: args.route.routeGroup,
    dispatchDate: args.route.dispatchDate,
    sourceRowNumber: args.stop.sourceRowNumber,
    importRowHash: args.stop.importRowHash,
    deliveryPointName: args.stop.deliveryPointName,
    deliveryAddress: args.stop.deliveryAddress,
    originalDeliveryAddress: args.stop.originalDeliveryAddress,
    clientAccount: args.stop.clientAccount,
    deliveryWindow: args.stop.deliveryWindow,
    stopNotes: args.stop.stopNotes,
    deliveryStatus: args.stop.deliveryStatus,
    orderReference: args.stop.orderReference,
    invoiceReference: args.stop.invoiceReference,
    phoneNumber: args.stop.phoneNumber,
    quantityOrBoxes: args.stop.quantityOrBoxes,
    productDescription: args.stop.productDescription,
    invoiceValue: args.stop.invoiceValue,
    inventoryRegistration: args.stop.inventoryRegistration,
    locationMatch: args.stop.locationMatch
      ? {
          id: args.stop.locationMatch.id,
          label: args.stop.locationMatch.name,
        }
      : null,
    organizationMatch: args.stop.organizationMatch
      ? {
          id: args.stop.organizationMatch.id,
          label: args.stop.organizationMatch.displayName ?? args.stop.organizationMatch.legalName,
        }
      : null,
    needsLocationReview: args.stop.needsLocationReview,
    sourceColumns: args.stop.sourceColumns,
    identityKey: stopIdentityKey(args.stop),
  };
}

// --- Task 2: same-day re-import upsert -------------------------------------------------------
//
// A same-day re-upload of a route file (e.g. the daily workbook re-shared after execution with
// delivery statuses filled in) must UPDATE the shipment and delivery stops created by the first
// import for that route/day, not insert duplicates. The functions below are the pure
// matching/merge decisions extracted so they can be unit-tested without a database; the
// surrounding transaction wiring in `processShipmentTrackerImport` is verified by tsc + review.

export type ExistingImportShipmentRow = {
  id: string;
  tenantId: string;
  operationDate: string | null;
  routeCode: string | null;
  metadata: Record<string, unknown> | null;
};

export type ExistingImportStopRow = {
  id: string;
  tenantId: string;
  shipmentId: string;
  stopType: string;
  sequenceNo: number;
  status: StopStatus;
  locationId: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Finds the previously-imported shipment a route belongs to, so the route can be upserted
 * instead of re-inserted. Matches on the route's groupingKey (normalized routeGroup + dispatch
 * date, the same key used to group incoming rows into routes) against the groupingKey stored on
 * the shipment's metadata at insert time. Only shipments created by import (`entryMode: "import"`)
 * are eligible, and the tenantId is checked explicitly here -- in addition to the tenant-scoped
 * SQL query the caller uses to load `existingShipments` -- so cross-tenant data is never matched
 * even if the caller's query scoping were ever weakened.
 */
export function findMatchingImportShipment(args: {
  route: RouteManifestRoutePreview;
  existingShipments: ExistingImportShipmentRow[];
  tenantId: string;
}): ExistingImportShipmentRow | null {
  const incomingRouteCode = normalizeRouteCode(args.route.routeGroup);
  const incomingOperationDate = args.route.dispatchDate;

  // First-class route identity (operation day + route code) outranks the legacy
  // metadata groupingKey. The column match intentionally does NOT require
  // entryMode "import": the route-identity unique index means a same-identity
  // insert would fail anyway, so any shipment already holding the identity is
  // the row this upload must update.
  if (incomingRouteCode && incomingOperationDate) {
    const columnMatch = args.existingShipments.find(
      (shipment) =>
        shipment.tenantId === args.tenantId &&
        shipment.routeCode === incomingRouteCode &&
        shipment.operationDate === incomingOperationDate,
    );

    if (columnMatch) {
      return columnMatch;
    }
  }

  return (
    args.existingShipments.find((shipment) => {
      if (shipment.tenantId !== args.tenantId) {
        return false;
      }

      const metadata = shipment.metadata;
      return Boolean(
        metadata &&
          metadata.entryMode === "import" &&
          typeof metadata.groupingKey === "string" &&
          metadata.groupingKey === args.route.groupingKey,
      );
    }) ?? null
  );
}

export type StopUpsertMatch = {
  existingStop: ExistingImportStopRow;
  incomingStop: RouteManifestStopPreview;
};

export type StopMatchResult = {
  updates: StopUpsertMatch[];
  inserts: RouteManifestStopPreview[];
};

/**
 * Resolves each incoming delivery stop against a matched shipment's existing delivery stops by
 * `identityKey` (order/invoice reference, falling back to name+address -- the same preference
 * order `stopIdentityKey` already applies). Matching is one-to-one: when several existing stops
 * share the same identity key (e.g. two stops at the same name+address with no order/invoice
 * reference to disambiguate them), each is held in a FIFO queue ordered by `sequenceNo`, and each
 * incoming stop with that key consumes the next queued row -- never the same existing row twice.
 * An incoming stop is an UPDATE if a queued existing stop remains for its key, otherwise it's an
 * INSERT (overflow beyond however many existing stops share that key). Existing stops with no
 * corresponding incoming row are simply absent from both lists, which is what leaves them
 * untouched in the database.
 */
export function matchStopsForUpsert(args: {
  incomingStops: RouteManifestStopPreview[];
  existingStops: ExistingImportStopRow[];
}): StopMatchResult {
  const existingByIdentityKey = new Map<string, ExistingImportStopRow[]>();
  const stopsBySequence = [...args.existingStops].sort((a, b) => a.sequenceNo - b.sequenceNo);

  for (const stop of stopsBySequence) {
    const key = typeof stop.metadata?.identityKey === "string" ? stop.metadata.identityKey : null;
    if (!key) {
      continue;
    }

    const queue = existingByIdentityKey.get(key);
    if (queue) {
      queue.push(stop);
    } else {
      existingByIdentityKey.set(key, [stop]);
    }
  }

  const updates: StopUpsertMatch[] = [];
  const inserts: RouteManifestStopPreview[] = [];

  for (const stop of args.incomingStops) {
    const key = stopIdentityKey(stop);
    const queue = key ? existingByIdentityKey.get(key) : undefined;
    const existingStop = queue?.shift();

    if (existingStop) {
      updates.push({ existingStop, incomingStop: stop });
    } else {
      inserts.push(stop);
    }
  }

  return { updates, inserts };
}

/**
 * Merges an existing stop's status with the incoming row's delivery status. A blank/unrecognized
 * incoming status carries no new information, so it preserves the existing status verbatim --
 * whatever it is (`planned`, `completed`, `missed`, `cancelled`, `arrived`,
 * `completed_with_exception`, ...), not just `completed` (controller ruling, final-review fix
 * wave Finding 2). Any incoming status that *does* normalize to a recognized value wins outright,
 * including downgrading a completed stop if the source data was corrected.
 */
export function mergeStopStatus(existingStatus: StopStatus, incomingDeliveryStatus: string | null): StopStatus {
  const normalizedIncoming = normalizeStopDeliveryStatus(incomingDeliveryStatus);

  if (normalizedIncoming !== null) {
    return normalizedIncoming;
  }

  return existingStatus;
}

export type FinalStopState = {
  status: StopStatus;
  needsLocationReview: boolean;
};

/**
 * Builds the full set of per-stop final states (status + needs-location-review) a matched
 * shipment will have once the upsert applies: existing stops with no incoming match (untouched,
 * read from their stored metadata/status), matched stops (merged via `mergeStopStatus`), and
 * newly inserted stops. Used to recompute the shipment-level status and reference from the
 * complete post-upsert stop set, not just the rows present in this particular upload.
 */
export function buildFinalStopStatesForUpsert(args: {
  existingStops: ExistingImportStopRow[];
  matches: StopMatchResult;
}): FinalStopState[] {
  const updatedExistingIds = new Set(args.matches.updates.map((entry) => entry.existingStop.id));
  const untouched = args.existingStops.filter((stop) => !updatedExistingIds.has(stop.id));

  const untouchedStates: FinalStopState[] = untouched.map((stop) => ({
    status: stop.status,
    needsLocationReview: Boolean(stop.metadata?.needsLocationReview),
  }));

  const updatedStates: FinalStopState[] = args.matches.updates.map(({ existingStop, incomingStop }) => ({
    status: mergeStopStatus(existingStop.status, incomingStop.deliveryStatus),
    needsLocationReview: incomingStop.needsLocationReview,
  }));

  const insertedStates: FinalStopState[] = args.matches.inserts.map((stop) => ({
    status: normalizeStopDeliveryStatus(stop.deliveryStatus) ?? "planned",
    needsLocationReview: stop.needsLocationReview,
  }));

  return [...untouchedStates, ...updatedStates, ...insertedStates];
}

/**
 * Recomputes the matched shipment's status (Task 1 rule) from its complete final stop set rather
 * than only the stops present in this upload, so an untouched already-completed stop still counts
 * toward "all completed -> delivered", and an untouched needs-location-review stop still gates the
 * shipment to draft.
 */
export function deriveUpsertShipmentStatus(args: {
  route: RouteManifestRoutePreview;
  finalStopStates: FinalStopState[];
}): ShipmentStatus {
  const needsLocationReview = args.finalStopStates.some((state) => state.needsLocationReview);
  const statuses = args.finalStopStates.map((state) => state.status);

  return deriveShipmentStatusFromStopStatuses({ statuses, needsLocationReview, routeStatus: args.route.routeStatus });
}

/**
 * Builds the order/invoice reference list the shipment's `externalShipmentReference` is derived
 * from, covering untouched, updated, and newly inserted stops so the reference reflects the full
 * post-upsert stop set.
 */
export function buildFinalReferencesForUpsert(args: {
  existingStops: ExistingImportStopRow[];
  matches: StopMatchResult;
}): Array<{ orderReference: string | null; invoiceReference: string | null }> {
  const updatedExistingIds = new Set(args.matches.updates.map((entry) => entry.existingStop.id));
  const untouched = args.existingStops.filter((stop) => !updatedExistingIds.has(stop.id));

  const untouchedRefs = untouched.map((stop) => ({
    orderReference: typeof stop.metadata?.orderReference === "string" ? stop.metadata.orderReference : null,
    invoiceReference: typeof stop.metadata?.invoiceReference === "string" ? stop.metadata.invoiceReference : null,
  }));

  const updatedRefs = args.matches.updates.map(({ incomingStop }) => ({
    orderReference: incomingStop.orderReference,
    invoiceReference: incomingStop.invoiceReference,
  }));

  const insertedRefs = args.matches.inserts.map((stop) => ({
    orderReference: stop.orderReference,
    invoiceReference: stop.invoiceReference,
  }));

  return [...untouchedRefs, ...updatedRefs, ...insertedRefs];
}

/**
 * Appends the current import batch id to the shipment's `importBatchIds` history, preserving
 * `importBatchId` as the first-import id (never overwritten by a later re-import).
 */
export function buildUpdatedImportBatchIds(args: {
  existingRouteMetadata: Record<string, unknown> | null;
  importBatchId: string;
}): string[] {
  const metadata = args.existingRouteMetadata;
  const existingIds = Array.isArray(metadata?.importBatchIds)
    ? metadata.importBatchIds.filter((value): value is string => typeof value === "string")
    : typeof metadata?.importBatchId === "string"
      ? [metadata.importBatchId]
      : [];

  return existingIds.includes(args.importBatchId) ? existingIds : [...existingIds, args.importBatchId];
}

/**
 * Unions the shipment's previously recorded import row hashes with the hashes of the stops
 * present in this upload, so the dedupe/duplicate-detection index stays complete across re-imports.
 */
export function buildUpdatedImportRowHashes(args: {
  existingRouteMetadata: Record<string, unknown> | null;
  incomingImportRowHashes: string[];
}): string[] {
  const metadata = args.existingRouteMetadata;
  const existingHashes = Array.isArray(metadata?.importRowHashes)
    ? metadata.importRowHashes.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([...existingHashes, ...args.incomingImportRowHashes]));
}

/**
 * Assigns sequence numbers to newly inserted stops on an existing shipment, continuing after the
 * highest sequence number already in use so new stops append at the end of the route.
 */
export function nextSequenceNumbers(existingSequenceNos: number[], count: number): number[] {
  const start = existingSequenceNos.length > 0 ? Math.max(...existingSequenceNos) + 1 : 1;
  return Array.from({ length: count }, (_, index) => start + index);
}

/**
 * Builds the audit log summary for a same-day re-import update, naming the route and counting
 * stops updated vs. newly added.
 */
export function buildUpdatedRouteAuditSummary(args: {
  routeReference: string;
  stopsUpdated: number;
  stopsAdded: number;
}): string {
  return `Updated route ${args.routeReference}: ${args.stopsUpdated} stop${args.stopsUpdated === 1 ? "" : "s"} updated, ${args.stopsAdded} stop${args.stopsAdded === 1 ? "" : "s"} added.`;
}

// --- End Task 2 pure functions ----------------------------------------------------------------

function previewRows(result: RouteManifestPreviewResult): ShipmentTrackerBuildResult["previewRows"] {
  return result.routes
    .flatMap((route) =>
      route.stops.map((stop) => ({
        rowNumber: stop.sourceRowNumber,
        routeName: route.routeGroup,
        locationName: stop.deliveryPointName,
        address: stop.deliveryAddress,
        brand: stop.clientAccount,
        externalReference: buildShipmentExternalReference([stop]),
        organizationMatch: stop.organizationMatch?.displayName ?? stop.organizationMatch?.legalName ?? null,
        locationMatch: stop.locationMatch?.name ?? null,
        status: stop.needsLocationReview ? "draft" as const : "planned" as const,
      })),
    )
    .slice(0, 10);
}

function buildTrackerResult(preview: RouteManifestPreviewResult): ShipmentTrackerBuildResult {
  return {
    ...preview,
    rowCount: preview.deliveryStopCount + preview.skipped + preview.duplicateSkipped,
    previewRows: previewRows(preview),
  };
}

function computeRouteStopAggregates(routes: RouteManifestRoutePreview[]) {
  let deliveryStopCount = 0;
  let matchedLocations = 0;
  let unmatchedLocations = 0;
  let matchedOrganizations = 0;
  let unmatchedOrganizations = 0;

  for (const route of routes) {
    for (const stop of route.stops) {
      deliveryStopCount += 1;

      if (stop.locationMatch) {
        matchedLocations += 1;
      } else {
        unmatchedLocations += 1;
      }

      if (stop.organizationMatch) {
        matchedOrganizations += 1;
      } else if (stop.clientAccount) {
        unmatchedOrganizations += 1;
      }
    }
  }

  return { deliveryStopCount, matchedLocations, unmatchedLocations, matchedOrganizations, unmatchedOrganizations };
}

/**
 * Applies cross-day dedupe to an already-built tracker result and holistically recomputes every
 * aggregate derived from the stop set (matched/unmatched locations & organizations, delivery stop
 * and route counts, the location-review warning, and the preview row sample) from the post-dedupe
 * routes. This avoids carrying stale pre-dedupe counts/warnings forward for stops that were
 * dropped as cross-day duplicates and never inserted.
 */
export function applyCrossDayDedupe(args: {
  buildResult: ShipmentTrackerBuildResult;
  referenceIdentityDispatchIndex: Map<string, Set<string>>;
  locale: string;
}): ShipmentTrackerBuildResult {
  const dedupe = filterCrossDayDuplicateStops({
    routes: args.buildResult.routes,
    referenceIdentityDispatchIndex: args.referenceIdentityDispatchIndex,
  });

  const aggregates = computeRouteStopAggregates(dedupe.routes);
  const unmatchedLocationsWarning = buildUnmatchedLocationsWarning(args.locale, aggregates.unmatchedLocations);
  const duplicateWarning = buildDuplicateSkippedWarning(args.locale, dedupe.duplicateReferences);
  const dedupedPreview: RouteManifestPreviewResult = { ...args.buildResult, routes: dedupe.routes };

  return {
    ...args.buildResult,
    routes: dedupe.routes,
    routeDraftCount: dedupe.routes.length,
    pickupStopCount: args.buildResult.pickupOrigin ? dedupe.routes.length : 0,
    deliveryStopCount: aggregates.deliveryStopCount,
    matchedLocations: aggregates.matchedLocations,
    unmatchedLocations: aggregates.unmatchedLocations,
    matchedOrganizations: aggregates.matchedOrganizations,
    unmatchedOrganizations: aggregates.unmatchedOrganizations,
    duplicateSkipped: args.buildResult.duplicateSkipped + dedupe.duplicateSkipped,
    warnings: [unmatchedLocationsWarning, duplicateWarning].filter((warning): warning is string => Boolean(warning)),
    previewRows: previewRows(dedupedPreview),
  };
}

export function buildShipmentTrackerDrafts(args: {
  fileName: string;
  locale: string;
  rows: string[][];
  organizations: RouteManifestDirectoryOrganization[];
  locations: RouteManifestDirectoryLocation[];
  existingImportRowHashes: Set<string>;
  mapping?: RouteManifestMapping;
}): ShipmentTrackerBuildResult {
  if (args.rows.length < 2) {
    throw new Error(
      args.locale === "en"
        ? "The route file needs a header row and at least one route row."
        : "El archivo de rutas necesita encabezados y al menos una fila de ruta.",
    );
  }

  const [headers] = args.rows;
  const preview = buildRouteManifestPreview({
    fileName: args.fileName,
    locale: args.locale,
    rows: args.rows,
    mapping: args.mapping ?? defaultRouteManifestMapping(headers),
    organizations: args.organizations,
    locations: args.locations,
    existingImportRowHashes: args.existingImportRowHashes,
  });

  return buildTrackerResult(preview);
}

export async function processShipmentTrackerImport(args: {
  body: Uint8Array;
  fileName: string;
  locale: string;
  session: AppSession;
  importBatchId: string;
  mapping?: RouteManifestMapping;
  sheetName?: string;
}) {
  const database = requireDb();
  const parsed = parseSpreadsheet({
    body: args.body,
    fileName: args.fileName,
    locale: args.locale,
    sheetName: args.sheetName,
  });

  const [organizationRows, locationRows, existingShipmentRows, existingStopRows] = await Promise.all([
    database
      .select({
        id: organizations.id,
        legalName: organizations.legalName,
        displayName: organizations.displayName,
      })
      .from(organizations)
      .where(and(eq(organizations.tenantId, args.session.tenant.id), eq(organizations.active, true))),
    database
      .select({
        id: locations.id,
        name: locations.name,
        addressLine1: locations.addressLine1,
      })
      .from(locations)
      .where(eq(locations.tenantId, args.session.tenant.id)),
    database
      .select({
        id: shipments.id,
        tenantId: shipments.tenantId,
        operationDate: shipments.operationDate,
        routeCode: shipments.routeCode,
        metadata: shipments.metadata,
      })
      .from(shipments)
      .where(eq(shipments.tenantId, args.session.tenant.id))
      .orderBy(desc(shipments.createdAt)),
    database
      .select({
        id: shipmentStops.id,
        tenantId: shipmentStops.tenantId,
        shipmentId: shipmentStops.shipmentId,
        stopType: shipmentStops.stopType,
        sequenceNo: shipmentStops.sequenceNo,
        status: shipmentStops.status,
        locationId: shipmentStops.locationId,
        notes: shipmentStops.notes,
        metadata: shipmentStops.metadata,
      })
      .from(shipmentStops)
      .where(eq(shipmentStops.tenantId, args.session.tenant.id)),
  ]);

  const existingImportRowHashes = new Set(
    [...existingShipmentRows, ...existingStopRows]
      .flatMap((row) => {
        const direct = row.metadata?.importRowHash;
        const grouped = row.metadata?.importRowHashes;
        return [
          typeof direct === "string" ? direct : null,
          ...(Array.isArray(grouped) ? grouped.filter((value): value is string => typeof value === "string") : []),
        ];
      })
      .filter((value): value is string => Boolean(value)),
  );

  const buildResult = buildShipmentTrackerDrafts({
    fileName: args.fileName,
    locale: args.locale,
    rows: parsed.rows,
    organizations: organizationRows,
    locations: locationRows,
    existingImportRowHashes,
    mapping: args.mapping ? { ...defaultRouteManifestMapping(parsed.rows[0] ?? []), ...args.mapping } : undefined,
  });

  // Cross-day dedupe: an order/invoice-referenced stop that already exists under a different
  // dispatch date is a carryover duplicate from the source workbook, not a new stop. Same-day
  // matches are intentionally left in place for the Task 2 same-day upsert. Every stop-derived
  // aggregate (matched/unmatched locations & organizations, counts, warnings, preview rows) is
  // recomputed from the post-dedupe route set so dropped stops are never double-counted.
  const referenceIdentityDispatchIndex = buildReferenceIdentityDispatchIndex(existingStopRows);
  const buildResultAfterDedupe = applyCrossDayDedupe({
    buildResult,
    referenceIdentityDispatchIndex,
    locale: args.locale,
  });

  if (buildResultAfterDedupe.routeDraftCount === 0 && buildResultAfterDedupe.duplicateSkipped === 0) {
    throw new Error(
      args.locale === "en"
        ? "No usable route rows were found in this file."
        : "No se encontraron filas de ruta utilizables en este archivo.",
    );
  }

  // Task 2 same-day upsert: a route whose groupingKey (normalized routeGroup + dispatch date)
  // already belongs to a previously-imported shipment is a same-day re-upload and must UPDATE
  // that shipment's stops instead of inserting a duplicate route. Routes with no match insert
  // exactly as before.
  const matchedRouteEntries = buildResultAfterDedupe.routes.map((route) => ({
    route,
    existingShipment: findMatchingImportShipment({
      route,
      existingShipments: existingShipmentRows,
      tenantId: args.session.tenant.id,
    }),
  }));
  const routesToInsert = matchedRouteEntries
    .filter((entry) => !entry.existingShipment)
    .map((entry) => entry.route);
  const routesToUpdate = matchedRouteEntries.filter(
    (entry): entry is { route: RouteManifestRoutePreview; existingShipment: ExistingImportShipmentRow } =>
      Boolean(entry.existingShipment),
  );

  const shipmentIds: string[] = [];
  const updatedShipmentIds: string[] = [];

  if (buildResultAfterDedupe.routes.length > 0) {
    await database.transaction(async (tx) => {
      if (routesToInsert.length > 0) {
        const shipmentValues = routesToInsert.map((route, routeIndex) => {
          const shipmentId = randomUUID();
          const routeReference = buildRouteReference({ fileName: args.fileName, route, routeIndex });
          shipmentIds.push(shipmentId);

          const uniqueOrgId = uniqueMatchedOrganizationId(route.stops);
          const carrierOrgId = findOrganizationIdByLabel(route.carrier, organizationRows);

          return {
            id: shipmentId,
            tenantId: args.session.tenant.id,
            shipperOrgId: uniqueOrgId,
            customerOrgId: uniqueOrgId,
            carrierOrgId,
            internalShipmentNumber: routeReference,
            externalShipmentReference: buildShipmentExternalReference(route.stops),
            operationDate: route.dispatchDate,
            routeCode: normalizeRouteCode(route.routeGroup),
            pickupDate: route.dispatchDate,
            deliveryDateExpected: route.dispatchDate,
            status: deriveShipmentStatusFromStops(route),
            temperatureControlled: false,
            notes: buildRouteNotes(route),
            metadata: routeMetadata({
              importBatchId: args.importBatchId,
              fileName: args.fileName,
              route,
              routeReference,
            }),
          } satisfies typeof shipments.$inferInsert;
        });

        await tx.insert(shipments).values(shipmentValues);

        const stopValues = routesToInsert.flatMap((route, routeIndex) => {
          const shipmentId = shipmentIds[routeIndex];
          const values: Array<typeof shipmentStops.$inferInsert> = [];

          if (buildResultAfterDedupe.pickupOrigin) {
            values.push({
              id: randomUUID(),
              tenantId: args.session.tenant.id,
              shipmentId,
              stopType: "pickup",
              sequenceNo: 1,
              locationId: buildResultAfterDedupe.pickupOrigin.id,
              status: "planned",
              metadata: {
                importBatchId: args.importBatchId,
                routeGroup: route.routeGroup,
                dispatchDate: route.dispatchDate,
                pickupOrigin: {
                  id: buildResultAfterDedupe.pickupOrigin.id,
                  label: buildResultAfterDedupe.pickupOrigin.name,
                },
              },
            });
          }

          for (const [stopIndex, stop] of route.stops.entries()) {
            values.push({
              id: randomUUID(),
              tenantId: args.session.tenant.id,
              shipmentId,
              stopType: "delivery",
              sequenceNo: stopIndex + (buildResultAfterDedupe.pickupOrigin ? 2 : 1),
              locationId: stop.locationMatch?.id ?? null,
              status: normalizeStopDeliveryStatus(stop.deliveryStatus) ?? "planned",
              receiverName: stop.deliveryPointName,
              notes: stopNotes(stop),
              metadata: stopMetadata({
                importBatchId: args.importBatchId,
                route,
                stop,
              }),
            });
          }

          return values;
        });

        if (stopValues.length > 0) {
          await tx.insert(shipmentStops).values(stopValues);
        }

        await tx.insert(auditLogs).values(
          routesToInsert.map((route, index) => ({
            tenantId: args.session.tenant.id,
            actorUserId: args.session.user.id,
            entityType: "shipment",
            entityId: shipmentIds[index],
            action: "created",
            summary: `Imported route ${shipmentValues[index].internalShipmentNumber}.`,
            payload: {
              importBatchId: args.importBatchId,
              routeGroup: route.routeGroup,
              dispatchDate: route.dispatchDate,
              sourceRowNumbers: route.stops.map((stop) => stop.sourceRowNumber),
            },
          })),
        );
      }

      for (const { route, existingShipment } of routesToUpdate) {
        const existingStopsForShipment = existingStopRows.filter((stop) => stop.shipmentId === existingShipment.id);
        const existingDeliveryStops = existingStopsForShipment.filter((stop) => stop.stopType === "delivery");
        const matches = matchStopsForUpsert({ incomingStops: route.stops, existingStops: existingDeliveryStops });

        for (const { existingStop, incomingStop } of matches.updates) {
          await tx
            .update(shipmentStops)
            .set({
              status: mergeStopStatus(existingStop.status, incomingStop.deliveryStatus),
              receiverName: incomingStop.deliveryPointName,
              notes: stopNotes(incomingStop),
              locationId: incomingStop.locationMatch?.id ?? existingStop.locationId ?? null,
              metadata: stopMetadata({
                importBatchId: args.importBatchId,
                route,
                stop: incomingStop,
              }),
              updatedAt: new Date(),
            })
            .where(and(eq(shipmentStops.id, existingStop.id), eq(shipmentStops.tenantId, args.session.tenant.id)));
        }

        const nextSequences = nextSequenceNumbers(
          existingStopsForShipment.map((stop) => stop.sequenceNo),
          matches.inserts.length,
        );

        const insertStopValues = matches.inserts.map((stop, index) => ({
          id: randomUUID(),
          tenantId: args.session.tenant.id,
          shipmentId: existingShipment.id,
          stopType: "delivery",
          sequenceNo: nextSequences[index],
          locationId: stop.locationMatch?.id ?? null,
          status: normalizeStopDeliveryStatus(stop.deliveryStatus) ?? "planned",
          receiverName: stop.deliveryPointName,
          notes: stopNotes(stop),
          metadata: stopMetadata({
            importBatchId: args.importBatchId,
            route,
            stop,
          }),
        })) satisfies Array<typeof shipmentStops.$inferInsert>;

        if (insertStopValues.length > 0) {
          await tx.insert(shipmentStops).values(insertStopValues);
        }

        const finalStopStates = buildFinalStopStatesForUpsert({ existingStops: existingDeliveryStops, matches });
        const newStatus = deriveUpsertShipmentStatus({ route, finalStopStates });
        const finalReferences = buildFinalReferencesForUpsert({ existingStops: existingDeliveryStops, matches });
        const externalShipmentReference = buildShipmentExternalReference(finalReferences);
        const importBatchIds = buildUpdatedImportBatchIds({
          existingRouteMetadata: existingShipment.metadata,
          importBatchId: args.importBatchId,
        });
        const importRowHashes = buildUpdatedImportRowHashes({
          existingRouteMetadata: existingShipment.metadata,
          incomingImportRowHashes: route.stops.map((stop) => stop.importRowHash),
        });

        await tx
          .update(shipments)
          .set({
            status: newStatus,
            externalShipmentReference,
            // Backfill the first-class route identity on legacy rows that only
            // carry it in metadata; undefined leaves the column untouched.
            operationDate: existingShipment.operationDate ?? route.dispatchDate ?? undefined,
            routeCode: existingShipment.routeCode ?? normalizeRouteCode(route.routeGroup) ?? undefined,
            metadata: {
              ...(existingShipment.metadata ?? {}),
              importBatchIds,
              importRowHashes,
            },
            updatedAt: new Date(),
          })
          .where(and(eq(shipments.id, existingShipment.id), eq(shipments.tenantId, args.session.tenant.id)));

        updatedShipmentIds.push(existingShipment.id);

        const routeReference =
          typeof existingShipment.metadata?.routeReference === "string"
            ? existingShipment.metadata.routeReference
            : route.routeGroup;

        await tx.insert(auditLogs).values({
          tenantId: args.session.tenant.id,
          actorUserId: args.session.user.id,
          entityType: "shipment",
          entityId: existingShipment.id,
          action: "updated",
          summary: buildUpdatedRouteAuditSummary({
            routeReference,
            stopsUpdated: matches.updates.length,
            stopsAdded: matches.inserts.length,
          }),
          payload: {
            importBatchId: args.importBatchId,
            routeGroup: route.routeGroup,
            dispatchDate: route.dispatchDate,
            stopsUpdated: matches.updates.length,
            stopsAdded: matches.inserts.length,
            sourceRowNumbers: route.stops.map((stop) => stop.sourceRowNumber),
          },
        });
      }
    });
  }

  revalidateTag(dashboardSnapshotTag(args.session.tenant.id), "max");

  const resultWithoutRoutes = Object.fromEntries(
    Object.entries(buildResultAfterDedupe).filter(([key]) => key !== "routes"),
  ) as Omit<ShipmentTrackerBuildResult, "routes">;

  return {
    ...resultWithoutRoutes,
    created: shipmentIds.length,
    shipmentIds,
    updated: updatedShipmentIds.length,
    updatedShipmentIds,
    warnings: Array.from(new Set([...parsed.warnings, ...buildResultAfterDedupe.warnings])),
  } satisfies ShipmentTrackerImportResult;
}
