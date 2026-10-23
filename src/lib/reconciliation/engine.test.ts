import assert from "node:assert/strict";
import test from "node:test";

import { evaluateShipmentPacket } from "@/lib/reconciliation/engine";
import type { ShipmentPacket } from "@/lib/reconciliation/types";

function packet(overrides: Partial<ShipmentPacket> = {}): ShipmentPacket {
  return {
    id: "s1",
    tenantId: "t1",
    shipmentReference: "RTE-20260711-0001",
    brokerName: "FleteOps",
    customerName: "Cliente Centro",
    shipperName: "Planta Norte",
    destinationName: "CEDIS Sur",
    routeLabel: "Planta Norte → CEDIS Sur",
    lifecycle: "delivered",
    expectedDeliveryDate: "2026-07-01",
    actualDeliveryDate: "2026-07-01",
    expectedQuantity: 1,
    deliveredQuantity: 1,
    documents: [],
    messages: [],
    ...overrides,
  };
}

test("without an operator decision the computed state stands", () => {
  const evaluation = evaluateShipmentPacket(packet(), "es-MX");

  // Delivered with no linked evidence cannot be ready on its own.
  assert.notEqual(evaluation.controlTowerStatus, "ready");
  assert.notEqual(evaluation.status, "approved");
});

test("an approved decision forces the route to ready/approved", () => {
  const evaluation = evaluateShipmentPacket(
    packet({
      decision: { verdict: "approved", decidedAt: "2026-07-11T18:00:00Z", decidedByName: "JB" },
    }),
    "es-MX",
  );

  assert.equal(evaluation.status, "approved");
  assert.equal(evaluation.controlTowerStatus, "ready");
  assert.equal(evaluation.summary.nextAction, "Pago al carrier aprobado — lista para cerrar.");
});

test("a hold decision blocks the route and surfaces the note", () => {
  const evaluation = evaluateShipmentPacket(
    packet({
      decision: {
        verdict: "hold",
        note: "Esperando aclaración de tarifa con el carrier.",
        decidedAt: "2026-07-11T18:00:00Z",
      },
    }),
    "es-MX",
  );

  assert.equal(evaluation.status, "blocked");
  assert.equal(evaluation.controlTowerStatus, "blocked");
  assert.equal(evaluation.summary.nextAction, "Esperando aclaración de tarifa con el carrier.");
});

test("a hold without a note falls back to localized guidance", () => {
  const es = evaluateShipmentPacket(
    packet({ decision: { verdict: "hold", decidedAt: "2026-07-11T18:00:00Z" } }),
    "es-MX",
  );
  const en = evaluateShipmentPacket(
    packet({ decision: { verdict: "hold", decidedAt: "2026-07-11T18:00:00Z" } }),
    "en",
  );

  assert.equal(es.summary.nextAction, "En hold por decisión del equipo hasta nueva revisión.");
  assert.equal(en.summary.nextAction, "Held by the team until the next review.");
});

test("folio_return is absent unless the workspace requires it", () => {
  const evaluation = evaluateShipmentPacket(packet(), "es-MX");

  assert.ok(!evaluation.requirements.some((requirement) => requirement.code === "folio_return"));
});

test("a required folio keeps the route in pending_docs even when delivery proof exists", () => {
  const evaluation = evaluateShipmentPacket(
    packet({
      folioRequired: true,
      documents: [
        {
          id: "doc-pod",
          type: "pod",
          title: "POD Ruta 3",
          sourceChannel: "whatsapp",
          uploadedAt: "2026-07-01T18:00:00Z",
          issuingParty: "Driver",
          extractedFacts: [],
        },
      ],
    }),
    "en",
  );
  const folioRequirement = evaluation.requirements.find(
    (requirement) => requirement.code === "folio_return",
  );

  assert.equal(folioRequirement?.status, "missing");
  assert.equal(evaluation.status, "pending_docs");
});

test("a received or waived folio satisfies the folio_return requirement", () => {
  for (const folioStatus of ["received", "waived"] as const) {
    const evaluation = evaluateShipmentPacket(
      packet({ folioRequired: true, folioStatus }),
      "es-MX",
    );
    const folioRequirement = evaluation.requirements.find(
      (requirement) => requirement.code === "folio_return",
    );

    assert.equal(folioRequirement?.status, "matched", `expected ${folioStatus} -> matched`);
  }
});

test("folio_return is not required before the route is delivered", () => {
  const evaluation = evaluateShipmentPacket(
    packet({ folioRequired: true, lifecycle: "in_transit" }),
    "es-MX",
  );
  const folioRequirement = evaluation.requirements.find(
    (requirement) => requirement.code === "folio_return",
  );

  assert.equal(folioRequirement?.status, "not_required_yet");
});

test("a carrier invoice above tolerance raises the payment_mismatch exception from rate-card expectations", () => {
  const evaluation = evaluateShipmentPacket(
    packet({ expectedCarrierInvoiceAmount: 4900, carrierInvoiceAmount: 5900 }),
    "en",
  );
  const variance = evaluation.exceptions.find((exception) => exception.type === "payment_mismatch");

  assert.ok(variance);
  assert.equal(variance.blocking, true);
});

test("the override keeps requirements and exceptions inspectable", () => {
  const evaluation = evaluateShipmentPacket(
    packet({
      decision: { verdict: "approved", decidedAt: "2026-07-11T18:00:00Z" },
    }),
    "es-MX",
  );

  assert.ok(evaluation.requirements.length > 0);
  assert.ok(evaluation.requirements.some((requirement) => requirement.status === "missing"));
});
