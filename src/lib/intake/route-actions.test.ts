import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractRouteNumberFromText,
  getRouteDraftReviewReason,
  shouldReviewRouteDraftFromIntake,
} from "./route-actions";

const baseClassification = {
  classification: "route_request" as const,
  action: "create_route" as const,
  confidence: 0.75,
  needsReview: false,
  rationale: "Route request.",
  clues: {
    customerName: null,
    serviceDate: "2026-05-19",
    locationName: null,
    carrierName: null,
    invoiceNumber: null,
    amountTotal: null,
    purchaseOrderNumber: "PO-123",
  },
  target: {
    routeReference: null,
    purchaseOrderNumber: "PO-123",
    customerName: null,
    locationName: null,
    serviceDate: "2026-05-19",
  },
  updates: {},
};

test("shouldReviewRouteDraftFromIntake escalates classifier review requests", () => {
  assert.equal(
    shouldReviewRouteDraftFromIntake({
      classification: {
        ...baseClassification,
        needsReview: true,
      },
    }),
    true,
  );
});

test("shouldReviewRouteDraftFromIntake escalates ambiguous create-route dates", () => {
  assert.equal(
    shouldReviewRouteDraftFromIntake({
      messageText:
        "SMOKE-GROUP-CREATE-2026-05-12 Nueva ruta PO PO-123. Entregar en Cliente B el 2026-05-19.",
      classification: baseClassification,
    }),
    true,
  );
});

test("shouldReviewRouteDraftFromIntake allows a confident single-date create route", () => {
  assert.equal(
    shouldReviewRouteDraftFromIntake({
      messageText: "Nueva ruta PO PO-123. Entregar en Cliente B el 2026-05-19.",
      classification: baseClassification,
    }),
    false,
  );
});

test("getRouteDraftReviewReason names ambiguous dates", () => {
  assert.match(
    getRouteDraftReviewReason({
      messageText:
        "SMOKE-GROUP-CREATE-2026-05-12 Nueva ruta PO PO-123. Entregar en Cliente B el 2026-05-19.",
      classification: baseClassification,
    }),
    /multiple dates/i,
  );
});

test("extractRouteNumberFromText finds Spanish and English route numbers", () => {
  assert.equal(extractRouteNumberFromText("Entregado Ruta 3 completo"), 3);
  assert.equal(extractRouteNumberFromText("factura de la RUTA #12 del martes"), 12);
  assert.equal(extractRouteNumberFromText("route 5 done"), 5);
  assert.equal(extractRouteNumberFromText("sin numero de ruta"), null);
  assert.equal(extractRouteNumberFromText(null), null);
  assert.equal(extractRouteNumberFromText("ruta 0"), null);
});
