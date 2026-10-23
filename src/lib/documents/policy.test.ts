import assert from "node:assert/strict";
import test from "node:test";

import {
  canLinkDocumentsToShipments,
  canWriteDocuments,
} from "@/lib/documents/policy";

test("document writes require document.write", () => {
  assert.equal(canWriteDocuments({ permissions: ["document.write"] }), true);
  assert.equal(canWriteDocuments({ permissions: ["document.read"] }), false);
  assert.equal(canWriteDocuments({ permissions: ["finance.write"] }), false);
});

test("shipment writers can connect existing evidence without gaining document upload rights", () => {
  const shipmentWriter = { permissions: ["shipment.write", "document.read"] };

  assert.equal(canLinkDocumentsToShipments(shipmentWriter), true);
  assert.equal(canWriteDocuments(shipmentWriter), false);
});
