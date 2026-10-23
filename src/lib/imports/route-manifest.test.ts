import assert from "node:assert/strict";
import { test } from "node:test";

import * as XLSX from "xlsx";

import {
  buildRouteManifestPreview,
  defaultRouteManifestMapping,
  getRouteManifestAcceptedFields,
  normalizeStopDeliveryStatus,
  parseRouteManifestMappingPayload,
  stopIdentityKey,
  type RouteManifestMapping,
} from "./route-manifest";
import { inspectSpreadsheet, parseSpreadsheet } from "./spreadsheet";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Ignore"], ["x"]]), "Resumen");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Nombre", "Ruta"],
      ["A", "Norte"],
    ]),
    "Lista completa",
  );

  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

test("inspectSpreadsheet lists workbook sheets", () => {
  const result = inspectSpreadsheet({
    body: workbookBuffer(),
    fileName: "routes.xlsx",
    locale: "en",
  });

  assert.deepEqual(result.sheets.map((sheet) => sheet.name), ["Resumen", "Lista completa"]);
  assert.equal(result.sheets[1].nonEmptyRowCount, 2);
});

test("parseSpreadsheet can parse a selected workbook sheet", () => {
  const result = parseSpreadsheet({
    body: workbookBuffer(),
    fileName: "routes.xlsx",
    locale: "en",
    sheetName: "Lista completa",
  });

  assert.deepEqual(result.rows, [
    ["Nombre", "Ruta"],
    ["A", "Norte"],
  ]);
});

test("buildRouteManifestPreview maps demo-freight columns, constants, and filename date", () => {
  const rows = [
    [
      "",
      "Nombre",
      "Dirección",
      "Dirección Modificada",
      "Ruta",
      "Marca ",
      "Prioridad / Horario",
      "# Factura o remisión",
    ],
    [
      "1",
      "Demo Restaurant",
      "Original address",
      "Maps address",
      "Demo South / Route B",
      "Demo Supplier",
      "De 08:00 a 12:00",
      "DEMO-INVOICE-0001",
    ],
  ];
  const mapping: RouteManifestMapping = {
    ...defaultRouteManifestMapping(rows[0]),
    pickupOrigin: { type: "constant", value: "loc-warehouse" },
    dispatchDate: { type: "derived", strategy: "file_date" },
    carrier: { type: "not_provided" },
  };

  const preview = buildRouteManifestPreview({
    fileName: "Demo routes 15_01_2026_cleaned.xlsx",
    locale: "en",
    rows,
    mapping,
    organizations: [],
    locations: [
      {
        id: "loc-warehouse",
        name: "Demo Freight Warehouse",
        addressLine1: "Demo City",
      },
    ],
    existingImportRowHashes: new Set(),
  });

  assert.equal(preview.routeDraftCount, 1);
  assert.equal(preview.deliveryStopCount, 1);
  assert.equal(preview.pickupOrigin?.id, "loc-warehouse");
  assert.equal(preview.dispatchDate, "2026-01-15");
  assert.equal(preview.routes[0].stops[0].deliveryPointName, "Demo Restaurant");
});

test("derived file_date dispatch date resolves from space or underscore separated file names", () => {
  const rows = [
    ["Nombre", "Ruta"],
    ["Demo Restaurant", "Demo South"],
  ];
  const mapping: RouteManifestMapping = {
    ...defaultRouteManifestMapping(rows[0]),
    dispatchDate: { type: "derived", strategy: "file_date" },
  };

  // Google Drive exports name files like "Demo routes 18/01/2026.xlsx"; browsers replace the "/"
  // with a space (or, on some platforms, an underscore) when saving to disk.
  const spaceSeparated = buildRouteManifestPreview({
    fileName: "Demo routes 18 01 2026.xlsx",
    locale: "en",
    rows,
    mapping,
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });
  assert.equal(spaceSeparated.dispatchDate, "2026-01-18");

  const underscoreSeparated = buildRouteManifestPreview({
    fileName: "Demo routes 18_01_2026.xlsx",
    locale: "en",
    rows,
    mapping,
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });
  assert.equal(underscoreSeparated.dispatchDate, "2026-01-18");

  const hyphenSeparated = buildRouteManifestPreview({
    fileName: "Demo routes 18-01-2026.xlsx",
    locale: "en",
    rows,
    mapping,
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });
  assert.equal(hyphenSeparated.dispatchDate, "2026-01-18");
});

test("route manifest groups rows by route group and warns about unmatched stops", () => {
  const rows = [
    ["Nombre", "Dirección Modificada", "Ruta", "Marca "],
    ["Demo Market A", "Address 1", "Demo North", "Demo Distributor"],
    ["Demo Market B", "Address 2", "Demo North", "Demo Distributor"],
  ];

  const preview = buildRouteManifestPreview({
    fileName: "routes.xlsx",
    locale: "en",
    rows,
    mapping: defaultRouteManifestMapping(rows[0]),
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });

  assert.equal(preview.routeDraftCount, 1);
  assert.equal(preview.deliveryStopCount, 2);
  assert.equal(preview.unmatchedLocations, 2);
  assert.equal(preview.routes[0].stops.every((stop) => stop.needsLocationReview), true);
  assert.deepEqual(preview.warnings, ["2 delivery stops need location review before dispatch."]);
});

test("route manifest carries accepted route-level fields into route previews", () => {
  const rows = [
    ["Nombre", "Dirección Modificada", "Ruta", "Carrier"],
    ["Demo Market A", "Address 1", "Demo North", "Demo Carrier"],
  ];

  const preview = buildRouteManifestPreview({
    fileName: "routes.xlsx",
    locale: "en",
    rows,
    mapping: {
      ...defaultRouteManifestMapping(rows[0]),
      operatingEntity: { type: "constant", value: "demo-freight MX" },
      routeStatus: { type: "constant", value: "planned" },
    },
    organizations: [],
    locations: [],
    existingImportRowHashes: new Set(),
  });

  assert.equal(preview.routes[0].operatingEntity, "demo-freight MX");
  assert.equal(preview.routes[0].carrier, "Demo Carrier");
  assert.equal(preview.routes[0].routeStatus, "planned");
});

test("getRouteManifestAcceptedFields exposes source capabilities for mapping UI", () => {
  const fields = getRouteManifestAcceptedFields("en");
  const pickupOrigin = fields.find((field) => field.key === "pickupOrigin");
  const deliveryPointName = fields.find((field) => field.key === "deliveryPointName");

  assert.ok(pickupOrigin);
  assert.ok(deliveryPointName);
  assert.equal(pickupOrigin.scope, "route");
  assert.equal(deliveryPointName.scope, "stop");
  assert.equal(pickupOrigin.supportedSources.includes("constant"), true);
  assert.equal(deliveryPointName.supportedSources.includes("column"), true);
});

test("normalizeStopDeliveryStatus maps Spanish and English delivery status vocabulary to canonical stop statuses", () => {
  const completedVariants = ["Entregado", "Entregado ", "entregados", "COMPLETO", "completo", "cOMPLETO", "Completado", "delivered", "Delivered"];
  for (const value of completedVariants) {
    assert.equal(normalizeStopDeliveryStatus(value), "completed", `expected "${value}" -> completed`);
  }

  const plannedVariants = ["Pendiente", "Pendientes", "pending", "PENDIENTE"];
  for (const value of plannedVariants) {
    assert.equal(normalizeStopDeliveryStatus(value), "planned", `expected "${value}" -> planned`);
  }

  const rejectedVariants = ["Rechazado", "Rechazada", "rechazo", "rejected", "Entregado con excepción"];
  for (const value of rejectedVariants) {
    assert.equal(
      normalizeStopDeliveryStatus(value),
      "completed_with_exception",
      `expected "${value}" -> completed_with_exception`,
    );
  }

  const missedVariants = ["No entregado", "not delivered"];
  for (const value of missedVariants) {
    assert.equal(normalizeStopDeliveryStatus(value), "missed", `expected "${value}" -> missed`);
  }

  const cancelledVariants = ["Cancelado", "cancelled", "CANCELADO"];
  for (const value of cancelledVariants) {
    assert.equal(normalizeStopDeliveryStatus(value), "cancelled", `expected "${value}" -> cancelled`);
  }

  assert.equal(normalizeStopDeliveryStatus(null), null);
  assert.equal(normalizeStopDeliveryStatus(""), null);
  assert.equal(normalizeStopDeliveryStatus("   "), null);
  assert.equal(normalizeStopDeliveryStatus("En ruta"), null);
});

test("stopIdentityKey prefers order reference, then invoice reference, then name+address", () => {
  assert.equal(
    stopIdentityKey({
      orderReference: "DEMO-ORDER-0007",
      invoiceReference: "DEMO-INVOICE-0004",
      deliveryPointName: "Demo Market A",
      deliveryAddress: "Calle Demo A 10",
    }),
    "demo order 0007",
  );

  assert.equal(
    stopIdentityKey({
      orderReference: null,
      invoiceReference: "DEMO-INVOICE-0004",
      deliveryPointName: "Demo Market A",
      deliveryAddress: "Calle Demo A 10",
    }),
    "demo invoice 0004",
  );

  assert.equal(
    stopIdentityKey({
      orderReference: "",
      invoiceReference: "  ",
      deliveryPointName: "Demo Market A",
      deliveryAddress: "Calle Demo A 10",
    }),
    "demo market a|calle demo a 10",
  );

  assert.equal(
    stopIdentityKey({
      orderReference: null,
      invoiceReference: null,
      deliveryPointName: null,
      deliveryAddress: null,
    }),
    null,
  );
});

test("parseRouteManifestMappingPayload accepts known field source objects only", () => {
  const mapping = parseRouteManifestMappingPayload({
    deliveryPointName: { type: "column", header: "Nombre" },
    pickupOrigin: { type: "constant", value: "loc-warehouse" },
    dispatchDate: { type: "derived", strategy: "file_date" },
    carrier: { type: "not_provided" },
    unexpected: { type: "column", header: "Nope" },
    routeGroup: { type: "bad", header: "Ruta" },
  });

  assert.deepEqual(mapping, {
    deliveryPointName: { type: "column", header: "Nombre" },
    pickupOrigin: { type: "constant", value: "loc-warehouse" },
    dispatchDate: { type: "derived", strategy: "file_date" },
    carrier: { type: "not_provided" },
  });
});
