import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultRouteManifestMapping,
  normalizeRouteCode,
  stopIdentityKey,
  type RouteManifestRoutePreview,
  type RouteManifestStopPreview,
} from "./route-manifest";
import {
  applyCrossDayDedupe,
  buildDuplicateSkippedWarning,
  buildFinalReferencesForUpsert,
  buildFinalStopStatesForUpsert,
  buildReferenceIdentityDispatchIndex,
  buildShipmentExternalReference,
  buildShipmentTrackerDrafts,
  buildUpdatedImportBatchIds,
  buildUpdatedImportRowHashes,
  buildUpdatedRouteAuditSummary,
  deriveShipmentStatusFromStops,
  deriveUpsertShipmentStatus,
  filterCrossDayDuplicateStops,
  findMatchingImportShipment,
  matchStopsForUpsert,
  mergeStopStatus,
  nextSequenceNumbers,
  type ExistingImportShipmentRow,
  type ExistingImportStopRow,
  type ShipmentTrackerBuildResult,
  type StopMatchResult,
} from "./shipment-tracker";

function makeStop(overrides: Partial<RouteManifestStopPreview> = {}): RouteManifestStopPreview {
  return {
    sourceRowNumber: 2,
    importRowHash: "hash",
    deliveryPointName: "Demo Market A",
    deliveryAddress: "Calle Demo A 10",
    originalDeliveryAddress: null,
    clientAccount: null,
    deliveryWindow: null,
    stopNotes: null,
    deliveryStatus: null,
    orderReference: "DEMO-ORDER-0007",
    invoiceReference: null,
    phoneNumber: null,
    quantityOrBoxes: null,
    productDescription: null,
    invoiceValue: null,
    inventoryRegistration: null,
    locationMatch: null,
    organizationMatch: null,
    needsLocationReview: false,
    sourceColumns: {},
    ...overrides,
  };
}

function makeRoute(overrides: Partial<RouteManifestRoutePreview> = {}): RouteManifestRoutePreview {
  return {
    routeGroup: "Demo North",
    dispatchDate: "2026-01-16",
    operatingEntity: null,
    carrier: null,
    routeStatus: null,
    groupingKey: "demo north::2026-01-16",
    stops: [makeStop()],
    ...overrides,
  };
}

function makeExistingStopRow(overrides: Partial<ExistingImportStopRow> = {}): ExistingImportStopRow {
  return {
    id: "stop-1",
    tenantId: "tenant-a",
    shipmentId: "shipment-1",
    stopType: "delivery",
    sequenceNo: 1,
    status: "planned",
    locationId: null,
    notes: null,
    metadata: { identityKey: "demo order 0002" },
    ...overrides,
  };
}

function makeExistingShipmentRow(overrides: Partial<ExistingImportShipmentRow> = {}): ExistingImportShipmentRow {
  return {
    id: "shipment-1",
    tenantId: "tenant-a",
    operationDate: null,
    routeCode: null,
    metadata: { entryMode: "import", groupingKey: "demo north::2026-01-16" },
    ...overrides,
  };
}

function makeBuildResult(overrides: Partial<ShipmentTrackerBuildResult> = {}): ShipmentTrackerBuildResult {
  const routes = overrides.routes ?? [makeRoute()];
  return {
    routeDraftCount: routes.length,
    deliveryStopCount: routes.reduce((total, route) => total + route.stops.length, 0),
    pickupStopCount: 0,
    matchedLocations: 0,
    unmatchedLocations: 0,
    matchedOrganizations: 0,
    unmatchedOrganizations: 0,
    skipped: 0,
    duplicateSkipped: 0,
    dispatchDate: "2026-01-16",
    pickupOrigin: null,
    warnings: [],
    rowCount: routes.reduce((total, route) => total + route.stops.length, 0),
    previewRows: [],
    ...overrides,
    routes,
  };
}

const headers = [
  "",
  "Nombre",
  "Dirección",
  "Dirección Modificada",
  "Ruta",
  "Marca ",
  "Comentarios",
  "Entrega realizada",
  "Prioridad / Horario",
  "Numero de pedido/ Orden de comra",
  "# Factura o remisión",
  "Teléfono del cliente",
  "Número de orden",
  "Número de cajas",
  "Descripción del producto",
  "Valor Factura",
  "Registro de inventarios",
];

test("buildShipmentTrackerDrafts groups flexible Spanish route tracker rows into route manifests", () => {
  const rows = [
    headers,
    [
      "1",
      "Demo Market A",
      "Calle Demo A 10",
      "Calle Demo A 10",
      "Demo North",
      "Demo Distributor",
      "",
      "",
      "",
      "DEMO-ORDER-0007",
      "DEMO-INVOICE-0004",
      "",
      "",
      "12",
      "",
      "",
      "",
    ],
    [
      "2",
      "Demo Market B",
      "Calle Demo B 11",
      "Calle Demo B 11",
      "Demo North",
      "Demo Distributor",
      "",
      "",
      "",
      "DEMO-ORDER-0006",
      "DEMO-INVOICE-0003",
      "",
      "",
      "8",
      "",
      "",
      "",
    ],
  ];

  const result = buildShipmentTrackerDrafts({
    fileName: "Demo routes 15_01_2026.xlsx",
    locale: "en",
    rows,
    mapping: {
      ...defaultRouteManifestMapping(rows[0]),
      pickupOrigin: { type: "constant", value: "loc-warehouse" },
      dispatchDate: { type: "derived", strategy: "file_date" },
    },
    organizations: [
      {
        id: "org-demo",
        legalName: "Demo Distributor",
        displayName: null,
      },
    ],
    locations: [
      {
        id: "loc-warehouse",
        name: "Demo Freight Warehouse",
        addressLine1: "Demo City",
      },
    ],
    existingImportRowHashes: new Set(),
  });

  assert.equal(result.rowCount, 2);
  assert.equal(result.routeDraftCount, 1);
  assert.equal(result.deliveryStopCount, 2);
  assert.equal(result.pickupStopCount, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.matchedOrganizations, 2);
  assert.equal(result.matchedLocations, 0);
  assert.equal(result.unmatchedLocations, 2);
  assert.equal(result.routes[0].routeGroup, "Demo North");
  assert.equal(result.routes[0].dispatchDate, "2026-01-15");
  assert.equal(result.routes[0].stops.length, 2);
  assert.equal(result.routes[0].stops[0].sourceRowNumber, 2);
  assert.equal(result.routes[0].stops[0].needsLocationReview, true);
});

test("buildShipmentTrackerDrafts skips rows already imported by row hash", () => {
  const firstPass = buildShipmentTrackerDrafts({
    fileName: "routes.xlsx",
    locale: "en",
    rows: [headers, ["1", "FOODSERVICE", "Address", "Address", "Route", "", "", "", "", "PO-1", "", "", "", "", "", "", ""]],
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });

  const secondPass = buildShipmentTrackerDrafts({
    fileName: "routes.xlsx",
    locale: "en",
    rows: [headers, ["1", "FOODSERVICE", "Address", "Address", "Route", "", "", "", "", "PO-1", "", "", "", "", "", "", ""]],
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set([firstPass.routes[0].stops[0].importRowHash]),
  });

  assert.equal(secondPass.deliveryStopCount, 0);
  assert.equal(secondPass.duplicateSkipped, 1);
});

test("buildReferenceIdentityDispatchIndex indexes only order/invoice-based identity keys", () => {
  const index = buildReferenceIdentityDispatchIndex([
    {
      metadata: {
        identityKey: "demo order 0007",
        orderReference: "DEMO-ORDER-0007",
        invoiceReference: null,
        dispatchDate: "2026-01-15",
      },
    },
    {
      metadata: {
        identityKey: "demo restaurant|calle demo c 5",
        orderReference: null,
        invoiceReference: null,
        dispatchDate: "2026-01-15",
      },
    },
    { metadata: null },
  ]);

  assert.deepEqual(index.get("demo order 0007"), new Set(["2026-01-15"]));
  assert.equal(index.has("demo restaurant|calle demo c 5"), false);
});

test("filterCrossDayDuplicateStops drops invoice-carryover stops but keeps name-only repeats", () => {
  const referenceIndex = buildReferenceIdentityDispatchIndex([
    {
      metadata: {
        identityKey: "demo order 0007",
        orderReference: "DEMO-ORDER-0007",
        invoiceReference: "DEMO-INVOICE-0004",
        dispatchDate: "2026-01-15",
      },
    },
    {
      metadata: {
        identityKey: "demo restaurant|calle demo c 5",
        orderReference: null,
        invoiceReference: null,
        dispatchDate: "2026-01-15",
      },
    },
  ]);

  const routes = [
    makeRoute({
      stops: [
        makeStop({
          orderReference: "DEMO-ORDER-0007",
          invoiceReference: "DEMO-INVOICE-0004",
          deliveryPointName: "Demo Market A",
        }),
        makeStop({
          orderReference: null,
          invoiceReference: null,
          deliveryPointName: "Demo Restaurant",
          deliveryAddress: "Calle Demo C 5",
        }),
      ],
    }),
  ];

  const result = filterCrossDayDuplicateStops({ routes, referenceIdentityDispatchIndex: referenceIndex });

  assert.equal(result.duplicateSkipped, 1);
  assert.deepEqual(result.duplicateReferences, ["DEMO-ORDER-0007"]);
  assert.equal(result.routes[0].stops.length, 1);
  assert.equal(result.routes[0].stops[0].deliveryPointName, "Demo Restaurant");
});

test("filterCrossDayDuplicateStops keeps same-day matches for the Task 2 upsert", () => {
  const referenceIndex = buildReferenceIdentityDispatchIndex([
    {
      metadata: {
        identityKey: "demo order 0007",
        orderReference: "DEMO-ORDER-0007",
        invoiceReference: null,
        dispatchDate: "2026-01-16",
      },
    },
  ]);

  const routes = [makeRoute({ stops: [makeStop({ orderReference: "DEMO-ORDER-0007" })] })];

  const result = filterCrossDayDuplicateStops({ routes, referenceIdentityDispatchIndex: referenceIndex });

  assert.equal(result.duplicateSkipped, 0);
  assert.equal(result.routes[0].stops.length, 1);
});

test("filterCrossDayDuplicateStops truncates the warning reference list at 5 with a +N more suffix", () => {
  const referenceEntries = Array.from({ length: 7 }, (_, index) => ({
    metadata: {
      identityKey: stopIdentityKey({
        orderReference: `DEMO-ORDER-${index}`,
        invoiceReference: null,
        deliveryPointName: null,
        deliveryAddress: null,
      }),
      orderReference: `DEMO-ORDER-${index}`,
      invoiceReference: null,
      dispatchDate: "2026-01-15",
    },
  }));
  const referenceIndex = buildReferenceIdentityDispatchIndex(referenceEntries);

  const routes = [
    makeRoute({
      stops: referenceEntries.map((entry) =>
        makeStop({ orderReference: entry.metadata.orderReference, invoiceReference: null }),
      ),
    }),
  ];

  const result = filterCrossDayDuplicateStops({ routes, referenceIdentityDispatchIndex: referenceIndex });

  assert.equal(result.duplicateSkipped, 7);
  assert.equal(result.duplicateReferences.length, 7);
});

test("applyCrossDayDedupe recomputes unmatchedLocations and the location-review warning from the post-dedupe stop set", () => {
  const carryoverStop = makeStop({
    sourceRowNumber: 2,
    importRowHash: "hash-1",
    orderReference: "DEMO-ORDER-0007",
    invoiceReference: null,
    deliveryPointName: "Demo Market A",
    deliveryAddress: "Calle Demo A 10",
    locationMatch: null,
    needsLocationReview: true,
  });
  const matchedStop = makeStop({
    sourceRowNumber: 3,
    importRowHash: "hash-2",
    orderReference: null,
    invoiceReference: null,
    deliveryPointName: "Demo Restaurant",
    deliveryAddress: "Calle Demo C 5",
    locationMatch: { id: "loc-1", name: "Demo Restaurant", addressLine1: "Calle Demo C 5" },
    needsLocationReview: false,
  });

  const buildResult = makeBuildResult({
    routes: [makeRoute({ stops: [carryoverStop, matchedStop] })],
    matchedLocations: 1,
    unmatchedLocations: 1,
    warnings: ["1 delivery stop need location review before dispatch."],
  });

  // The carryover stop's identity key was already imported on a different dispatch date, so it
  // must be dropped as a cross-day duplicate. It was the only stop needing location review, so
  // the persisted unmatchedLocations count (and its warning) must drop to zero along with it —
  // not stay stuck at the stale pre-dedupe value of 1.
  const referenceIndex = buildReferenceIdentityDispatchIndex([
    {
      metadata: {
        identityKey: "demo order 0007",
        orderReference: "DEMO-ORDER-0007",
        invoiceReference: null,
        dispatchDate: "2026-01-15",
      },
    },
  ]);

  const result = applyCrossDayDedupe({
    buildResult,
    referenceIdentityDispatchIndex: referenceIndex,
    locale: "en",
  });

  assert.equal(result.routes[0].stops.length, 1);
  assert.equal(result.routes[0].stops[0].deliveryPointName, "Demo Restaurant");
  assert.equal(result.unmatchedLocations, 0);
  assert.equal(result.matchedLocations, 1);
  assert.equal(result.deliveryStopCount, 1);
  assert.equal(result.duplicateSkipped, 1);
  assert.equal(result.previewRows.length, 1);
  assert.equal(result.previewRows[0].locationName, "Demo Restaurant");
  assert.deepEqual(result.warnings, ["1 stop skipped as cross-day duplicates: DEMO-ORDER-0007."]);
  assert.equal(
    result.warnings.some((warning) => warning.includes("location review")),
    false,
  );
});

test("buildDuplicateSkippedWarning lists at most 5 references then a +N more suffix", () => {
  const references = ["DEMO-ORDER-0001", "DEMO-ORDER-0002", "DEMO-ORDER-0003", "DEMO-ORDER-0004", "DEMO-ORDER-0005", "DEMO-ORDER-0009", "DEMO-ORDER-0010"];

  assert.equal(
    buildDuplicateSkippedWarning("en", references),
    "7 stops skipped as cross-day duplicates: DEMO-ORDER-0001, DEMO-ORDER-0002, DEMO-ORDER-0003, DEMO-ORDER-0004, DEMO-ORDER-0005, +2 more.",
  );
  assert.equal(buildDuplicateSkippedWarning("en", []), null);
  assert.equal(
    buildDuplicateSkippedWarning("en", ["DEMO-ORDER-0001"]),
    "1 stop skipped as cross-day duplicates: DEMO-ORDER-0001.",
  );
});

test("deriveShipmentStatusFromStops marks a route delivered when every stop is completed", () => {
  const route = makeRoute({
    stops: [makeStop({ deliveryStatus: "Entregado" }), makeStop({ deliveryStatus: "entregados" })],
  });

  assert.equal(deriveShipmentStatusFromStops(route), "delivered");
});

test("deriveShipmentStatusFromStops marks a route in_transit when some stops are completed", () => {
  const route = makeRoute({
    stops: [makeStop({ deliveryStatus: "Entregado" }), makeStop({ deliveryStatus: "Pendiente" })],
  });

  assert.equal(deriveShipmentStatusFromStops(route), "in_transit");
});

test("deriveShipmentStatusFromStops falls back to the existing route status when no stops are completed", () => {
  const plannedRoute = makeRoute({ stops: [makeStop({ deliveryStatus: "Pendiente" })] });
  assert.equal(deriveShipmentStatusFromStops(plannedRoute), "planned");

  const cancelledRoute = makeRoute({ routeStatus: "cancelado", stops: [makeStop({ deliveryStatus: "Pendiente" })] });
  assert.equal(deriveShipmentStatusFromStops(cancelledRoute), "cancelled");
});

test("deriveShipmentStatusFromStops keeps location-review draft gating even when stops are completed", () => {
  const route = makeRoute({
    stops: [makeStop({ deliveryStatus: "Entregado", needsLocationReview: true })],
  });

  assert.equal(deriveShipmentStatusFromStops(route), "draft");
});

test("buildShipmentExternalReference fits the shipment reference column", () => {
  const stops = Array.from({ length: 12 }, (_, index) => ({
    orderReference: `DEMO-ORDER-0008${String(index).padStart(2, "0")}`,
    invoiceReference: `DEMO-INVOICE-0002${String(index).padStart(2, "0")}`,
  })) as Parameters<typeof buildShipmentExternalReference>[0];

  const reference = buildShipmentExternalReference(stops);

  assert.ok(reference);
  assert.ok(reference.length <= 128);
  assert.match(reference, /\.\.\.$/);
});

test("mergeStopStatus preserves the existing status verbatim -- whatever it is -- when the incoming status is null", () => {
  // Controller ruling (final-review fix wave, Finding 2): a blank incoming cell carries no new
  // information, so it must never reset a manually-set status back to planned. This covers every
  // stop status value, not just "completed".
  assert.equal(mergeStopStatus("planned", null), "planned");
  assert.equal(mergeStopStatus("completed", null), "completed");
  assert.equal(mergeStopStatus("missed", null), "missed");
  assert.equal(mergeStopStatus("cancelled", null), "cancelled");
  assert.equal(mergeStopStatus("arrived", null), "arrived");
  assert.equal(mergeStopStatus("completed_with_exception", null), "completed_with_exception");
});

test("mergeStopStatus applies the normalized incoming status when present, even over a completed stop", () => {
  assert.equal(mergeStopStatus("completed", "Pendiente"), "planned");
  assert.equal(mergeStopStatus("planned", "Entregado"), "completed");
});

test("findMatchingImportShipment matches an existing import shipment by groupingKey within the same tenant", () => {
  const route = makeRoute({ groupingKey: "demo north::2026-01-16" });
  const existingShipments = [
    makeExistingShipmentRow({ id: "ship-a", tenantId: "tenant-a" }),
    makeExistingShipmentRow({ id: "ship-b", tenantId: "tenant-b" }),
    makeExistingShipmentRow({
      id: "ship-c",
      tenantId: "tenant-a",
      metadata: { entryMode: "import", groupingKey: "other::2026-01-16" },
    }),
  ];

  const matched = findMatchingImportShipment({ route, existingShipments, tenantId: "tenant-a" });

  assert.equal(matched?.id, "ship-a");
});

test("findMatchingImportShipment never matches shipments from another tenant", () => {
  const route = makeRoute({ groupingKey: "demo north::2026-01-16" });
  const existingShipments = [makeExistingShipmentRow({ id: "ship-b", tenantId: "tenant-b" })];

  assert.equal(findMatchingImportShipment({ route, existingShipments, tenantId: "tenant-a" }), null);
});

test("findMatchingImportShipment ignores shipments that were not created by import", () => {
  const route = makeRoute({ groupingKey: "demo north::2026-01-16" });
  const existingShipments = [
    makeExistingShipmentRow({
      id: "ship-manual",
      tenantId: "tenant-a",
      metadata: { entryMode: "manual", groupingKey: "demo north::2026-01-16" },
    }),
  ];

  assert.equal(findMatchingImportShipment({ route, existingShipments, tenantId: "tenant-a" }), null);
});

test("findMatchingImportShipment prefers the first-class route identity columns over the metadata groupingKey", () => {
  const route = makeRoute({ routeGroup: "Ruta 3", dispatchDate: "2026-01-18", groupingKey: "ruta 3::2026-01-18" });
  const existingShipments = [
    makeExistingShipmentRow({
      id: "ship-columns",
      tenantId: "tenant-a",
      operationDate: "2026-01-18",
      routeCode: "ruta 3",
      metadata: null,
    }),
    makeExistingShipmentRow({
      id: "ship-metadata",
      tenantId: "tenant-a",
      metadata: { entryMode: "import", groupingKey: "ruta 3::2026-01-18" },
    }),
  ];

  const matched = findMatchingImportShipment({ route, existingShipments, tenantId: "tenant-a" });

  assert.equal(matched?.id, "ship-columns");
});

test("findMatchingImportShipment matches by route identity columns even for non-import shipments", () => {
  // The route-identity unique index means inserting the same identity would fail,
  // so a manual shipment already holding it is the row this upload must update.
  const route = makeRoute({ routeGroup: "Ruta 5", dispatchDate: "2026-01-18", groupingKey: "ruta 5::2026-01-18" });
  const existingShipments = [
    makeExistingShipmentRow({
      id: "ship-manual",
      tenantId: "tenant-a",
      operationDate: "2026-01-18",
      routeCode: "ruta 5",
      metadata: { entryMode: "manual" },
    }),
  ];

  const matched = findMatchingImportShipment({ route, existingShipments, tenantId: "tenant-a" });

  assert.equal(matched?.id, "ship-manual");
});

test("normalizeRouteCode normalizes labels and rejects blank or unassigned groups", () => {
  assert.equal(normalizeRouteCode("RUTA 3"), "ruta 3");
  assert.equal(normalizeRouteCode("  Ruta   3  "), "ruta 3");
  assert.equal(normalizeRouteCode("Rúta #3"), "ruta 3");
  assert.equal(normalizeRouteCode("unassigned"), null);
  assert.equal(normalizeRouteCode(""), null);
  assert.equal(normalizeRouteCode(null), null);
});

test("matchStopsForUpsert matches incoming stops to existing stops by identityKey and routes the rest to inserts", () => {
  const existingStops = [makeExistingStopRow({ id: "stop-1", metadata: { identityKey: "demo order 0007" } })];
  const matchedIncoming = makeStop({ orderReference: "DEMO-ORDER-0007" });
  const newIncoming = makeStop({ orderReference: "Demo Warehouse B", deliveryPointName: "New client" });

  const result = matchStopsForUpsert({ incomingStops: [matchedIncoming, newIncoming], existingStops });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].existingStop.id, "stop-1");
  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0].deliveryPointName, "New client");
});

test("matchStopsForUpsert leaves an unmatched existing stop out of the result entirely (left untouched)", () => {
  const existingStops = [
    makeExistingStopRow({ id: "stop-untouched", metadata: { identityKey: "not in this file" } }),
  ];
  const result = matchStopsForUpsert({ incomingStops: [], existingStops });

  assert.equal(result.updates.length, 0);
  assert.equal(result.inserts.length, 0);
});

// --- Final-review fix wave, Finding 1: one-to-one matching for duplicate identity keys ---------
//
// Two delivery stops for the same name+address (no order/invoice reference) share an identityKey.
// Matching must pair each incoming stop with a *different* existing stop (FIFO by sequenceNo), not
// collapse them onto the same row.

test("matchStopsForUpsert pairs duplicate-key stops one-to-one, in existing sequenceNo order", () => {
  const existingStops = [
    makeExistingStopRow({
      id: "stop-seq-3",
      sequenceNo: 3,
      metadata: { identityKey: "demo restaurant|calle demo c 5" },
    }),
    makeExistingStopRow({
      id: "stop-seq-2",
      sequenceNo: 2,
      metadata: { identityKey: "demo restaurant|calle demo c 5" },
    }),
  ];
  const firstIncoming = makeStop({
    orderReference: null,
    invoiceReference: null,
    deliveryPointName: "Demo Restaurant",
    deliveryAddress: "Calle Demo C 5",
    stopNotes: "first",
  });
  const secondIncoming = makeStop({
    orderReference: null,
    invoiceReference: null,
    deliveryPointName: "Demo Restaurant",
    deliveryAddress: "Calle Demo C 5",
    stopNotes: "second",
  });

  const result = matchStopsForUpsert({ incomingStops: [firstIncoming, secondIncoming], existingStops });

  assert.equal(result.updates.length, 2);
  // Lowest sequenceNo (stop-seq-2) is consumed first, even though it appears second in the input
  // array -- matching is ordered by sequenceNo, not by input order.
  assert.equal(result.updates[0].existingStop.id, "stop-seq-2");
  assert.equal(result.updates[0].incomingStop.stopNotes, "first");
  assert.equal(result.updates[1].existingStop.id, "stop-seq-3");
  assert.equal(result.updates[1].incomingStop.stopNotes, "second");
  assert.equal(result.inserts.length, 0);
});

test("matchStopsForUpsert inserts overflow incoming stops once a shared key's existing stops are exhausted", () => {
  const existingStops = [
    // stopIdentityKey normalizes "shared-key" (via normalizeForMatch) to "shared key" -- match on
    // the same normalized form the incoming stops below will compute.
    makeExistingStopRow({ id: "stop-only", sequenceNo: 1, metadata: { identityKey: "shared key" } }),
  ];
  const firstIncoming = makeStop({ orderReference: "shared-key", stopNotes: "first" });
  const secondIncoming = makeStop({ orderReference: "shared-key", stopNotes: "second" });

  const result = matchStopsForUpsert({ incomingStops: [firstIncoming, secondIncoming], existingStops });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].existingStop.id, "stop-only");
  assert.equal(result.updates[0].incomingStop.stopNotes, "first");
  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0].stopNotes, "second");
});

test("matchStopsForUpsert leaves extra existing stops for a shared key unconsumed when fewer incoming stops arrive", () => {
  const existingStops = [
    makeExistingStopRow({ id: "stop-seq-1", sequenceNo: 1, metadata: { identityKey: "shared key" } }),
    makeExistingStopRow({ id: "stop-seq-2", sequenceNo: 2, metadata: { identityKey: "shared key" } }),
  ];
  const onlyIncoming = makeStop({ orderReference: "shared-key" });

  const result = matchStopsForUpsert({ incomingStops: [onlyIncoming], existingStops });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].existingStop.id, "stop-seq-1");
  assert.equal(result.inserts.length, 0);
  assert.equal(
    result.updates.some((entry) => entry.existingStop.id === "stop-seq-2"),
    false,
  );
});

test("deriveUpsertShipmentStatus marks delivered when every final stop (untouched + updated + inserted) is completed", () => {
  const existingStops = [makeExistingStopRow({ id: "stop-1", status: "completed", metadata: { identityKey: "a" } })];
  const matches: StopMatchResult = {
    updates: [],
    inserts: [makeStop({ orderReference: "b", deliveryStatus: "Entregado" })],
  };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops, matches });
  const status = deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates });

  assert.equal(status, "delivered");
});

test("deriveUpsertShipmentStatus marks in_transit when only some final stops are completed", () => {
  const existingStops = [
    makeExistingStopRow({ id: "stop-1", status: "completed", metadata: { identityKey: "a" } }),
    makeExistingStopRow({ id: "stop-2", status: "planned", metadata: { identityKey: "b" } }),
  ];
  const matches: StopMatchResult = { updates: [], inserts: [] };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops, matches });
  const status = deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates });

  assert.equal(status, "in_transit");
});

test("deriveUpsertShipmentStatus preserves a completed stop even when the re-uploaded row has no status", () => {
  const existingStop = makeExistingStopRow({ id: "stop-1", status: "completed", metadata: { identityKey: "demo order 0002" } });
  const incomingStop = makeStop({ orderReference: "DEMO-ORDER-0002", deliveryStatus: null });
  const matches: StopMatchResult = { updates: [{ existingStop, incomingStop }], inserts: [] };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops: [existingStop], matches });

  assert.equal(finalStopStates[0].status, "completed");
  assert.equal(deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates }), "delivered");
});

test("deriveUpsertShipmentStatus counts a completed_with_exception stop toward all-completed, surfaced as delivered_with_exception", () => {
  // Controller ruling (final-review fix wave, Finding 2): completed_with_exception counts as
  // completed for the shipment-status derivation tally. When every stop completed but at least
  // one carried an exception (e.g. a rejected delivery), the shipment-level status keeps that
  // exception visible instead of flattening it to plain delivered.
  const existingStops = [
    makeExistingStopRow({ id: "stop-1", status: "completed_with_exception", metadata: { identityKey: "a" } }),
  ];
  const matches: StopMatchResult = { updates: [], inserts: [] };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops, matches });

  assert.equal(finalStopStates[0].status, "completed_with_exception");
  assert.equal(deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates }), "delivered_with_exception");
});

test("deriveUpsertShipmentStatus marks in_transit when a completed_with_exception stop is mixed with a planned stop", () => {
  const existingStops = [
    makeExistingStopRow({ id: "stop-1", status: "completed_with_exception", metadata: { identityKey: "a" } }),
    makeExistingStopRow({ id: "stop-2", status: "planned", metadata: { identityKey: "b" } }),
  ];
  const matches: StopMatchResult = { updates: [], inserts: [] };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops, matches });

  assert.equal(deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates }), "in_transit");
});

test("deriveUpsertShipmentStatus keeps location-review draft gating from untouched and new stops", () => {
  const existingStops = [
    makeExistingStopRow({
      id: "stop-1",
      status: "planned",
      metadata: { identityKey: "a", needsLocationReview: true },
    }),
  ];
  const matches: StopMatchResult = { updates: [], inserts: [] };

  const finalStopStates = buildFinalStopStatesForUpsert({ existingStops, matches });

  assert.equal(deriveUpsertShipmentStatus({ route: makeRoute(), finalStopStates }), "draft");
});

test("buildFinalReferencesForUpsert merges untouched, updated, and inserted stop references for the shipment reference", () => {
  const existingStop = makeExistingStopRow({
    id: "stop-untouched",
    metadata: { identityKey: "untouched-ref", orderReference: "DEMO-ORDER-UNCHANGED", invoiceReference: null },
  });
  const matches: StopMatchResult = {
    updates: [],
    inserts: [makeStop({ orderReference: "DEMO-ORDER-NEW", invoiceReference: null })],
  };

  const references = buildFinalReferencesForUpsert({ existingStops: [existingStop], matches });
  const externalReference = buildShipmentExternalReference(references);

  assert.equal(externalReference, "DEMO-ORDER-UNCHANGED / DEMO-ORDER-NEW");
});

test("buildUpdatedImportBatchIds appends the new batch id while preserving the first-import id", () => {
  assert.deepEqual(
    buildUpdatedImportBatchIds({ existingRouteMetadata: { importBatchId: "batch-1" }, importBatchId: "batch-2" }),
    ["batch-1", "batch-2"],
  );
  assert.deepEqual(
    buildUpdatedImportBatchIds({
      existingRouteMetadata: { importBatchId: "batch-1", importBatchIds: ["batch-1"] },
      importBatchId: "batch-1",
    }),
    ["batch-1"],
  );
});

test("buildUpdatedImportRowHashes unions existing and incoming hashes without duplicates", () => {
  assert.deepEqual(
    buildUpdatedImportRowHashes({
      existingRouteMetadata: { importRowHashes: ["h1", "h2"] },
      incomingImportRowHashes: ["h2", "h3"],
    }),
    ["h1", "h2", "h3"],
  );
});

test("nextSequenceNumbers continues after the highest existing sequence number", () => {
  assert.deepEqual(nextSequenceNumbers([1, 2, 3], 2), [4, 5]);
  assert.deepEqual(nextSequenceNumbers([], 2), [1, 2]);
});

test("buildUpdatedRouteAuditSummary summarizes stops updated and added with correct pluralization", () => {
  assert.equal(
    buildUpdatedRouteAuditSummary({ routeReference: "IMP-20260524-001", stopsUpdated: 1, stopsAdded: 2 }),
    "Updated route IMP-20260524-001: 1 stop updated, 2 stops added.",
  );
  assert.equal(
    buildUpdatedRouteAuditSummary({ routeReference: "IMP-20260524-001", stopsUpdated: 0, stopsAdded: 0 }),
    "Updated route IMP-20260524-001: 0 stops updated, 0 stops added.",
  );
});
