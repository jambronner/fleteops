import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRoutePreviewDraftMetadata,
  readRoutePreviewDraftMetadata,
  routePreviewConfirmationMatches,
  type RoutePreviewDraftPreview,
} from "./route-preview-drafts";

const storedObject = {
  driver: "local" as const,
  key: "tenants/tenant-1/imports/shipment_tracker/batch-1/routes.xlsx",
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: 1234,
  originalFileName: "routes.xlsx",
};

const preview: RoutePreviewDraftPreview = {
  fileName: "routes.xlsx",
  importType: "shipment_tracker",
  sourceFormat: "xlsx",
  sheetName: "Lista completa",
  sheets: [{ name: "Lista completa", nonEmptyRowCount: 3 }],
  sourceHeaders: ["Nombre", "Ruta"],
  acceptedFields: [],
  suggestedMapping: {},
  mapping: {
    routeGroup: { type: "column", header: "Ruta" },
  },
  directoryOptions: {
    locations: [],
    organizations: [],
  },
  result: {
    routeDraftCount: 1,
  },
  warnings: [],
  appliedProfile: null,
};

test("route preview draft metadata preserves enough state to resume and confirm later", () => {
  const metadata = buildRoutePreviewDraftMetadata({
    fileName: "routes.xlsx",
    sourceFormat: "xlsx",
    mappingTemplate: "demo-freight route manifest",
    sheetName: "Lista completa",
    routeManifestMapping: preview.mapping,
    preview,
    stableFileUrl: "/api/storage/objects/tenants/tenant-1/imports/shipment_tracker/batch-1/routes.xlsx",
    storedObject,
  });

  const draft = readRoutePreviewDraftMetadata(metadata);

  assert.ok(draft);
  assert.equal(draft.fileName, "routes.xlsx");
  assert.equal(draft.sourceFormat, "xlsx");
  assert.equal(draft.mappingTemplate, "demo-freight route manifest");
  assert.equal(draft.sheetName, "Lista completa");
  assert.equal(draft.storage.key, storedObject.key);
  assert.deepEqual(draft.routeManifestMapping, preview.mapping);
  assert.deepEqual(draft.routePreviewDraft.preview, preview);
});

test("route preview draft metadata round-trips an auto-applied mapping profile", () => {
  const previewWithProfile: RoutePreviewDraftPreview = {
    ...preview,
    appliedProfile: { id: "profile-1", name: "demo-freight weekly" },
  };

  const metadata = buildRoutePreviewDraftMetadata({
    fileName: "routes.xlsx",
    sourceFormat: "xlsx",
    mappingTemplate: null,
    sheetName: "Lista completa",
    routeManifestMapping: previewWithProfile.mapping,
    preview: previewWithProfile,
    stableFileUrl: "/api/storage/objects/tenants/tenant-1/imports/shipment_tracker/batch-1/routes.xlsx",
    storedObject,
  });

  const draft = readRoutePreviewDraftMetadata(metadata);

  assert.ok(draft);
  assert.deepEqual(draft.routePreviewDraft.preview.appliedProfile, { id: "profile-1", name: "demo-freight weekly" });
});

test("route preview draft metadata ignores non-route import metadata", () => {
  assert.equal(readRoutePreviewDraftMetadata({ importType: "purchase_orders" }), null);
  assert.equal(readRoutePreviewDraftMetadata({ importType: "shipment_tracker" }), null);
});

test("route confirmation is bound to the saved preview inputs", () => {
  const metadata = buildRoutePreviewDraftMetadata({
    fileName: "routes.xlsx",
    sourceFormat: "xlsx",
    mappingTemplate: "demo-freight route manifest",
    sheetName: "Lista completa",
    routeManifestMapping: preview.mapping,
    preview,
    stableFileUrl:
      "/api/storage/objects/tenants/tenant-1/imports/shipment_tracker/batch-1/routes.xlsx",
    storedObject,
  });

  assert.equal(
    routePreviewConfirmationMatches({
      draft: metadata,
      mappingTemplate: "demo-freight route manifest",
      sheetName: "Lista completa",
      routeManifestMapping: {
        routeGroup: { header: "Ruta", type: "column" },
      },
    }),
    true,
  );
  assert.equal(
    routePreviewConfirmationMatches({
      draft: metadata,
      routeManifestMapping: {
        routeGroup: { type: "column", header: "Otra ruta" },
      },
    }),
    false,
  );
  assert.equal(
    routePreviewConfirmationMatches({
      draft: metadata,
      sheetName: "Resumen",
    }),
    false,
  );
});
