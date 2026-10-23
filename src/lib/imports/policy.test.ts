import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageImportType,
  manageableImportTypes,
} from "@/lib/imports/policy";

test("viewer permissions cannot mutate any import domain", () => {
  const viewer = {
    permissions: [
      "counterparty.read",
      "shipment.read",
      "document.read",
      "finance.read",
    ],
  };

  assert.deepEqual(manageableImportTypes(viewer), []);
});

test("operator permissions map to route and directory imports only", () => {
  const operator = {
    permissions: [
      "counterparty.manage",
      "shipment.write",
      "document.write",
    ],
  };

  assert.deepEqual(manageableImportTypes(operator), [
    "shipment_tracker",
    "purchase_orders",
    "directory",
  ]);
});

test("finance writers can import invoice status without gaining route or directory writes", () => {
  const finance = { permissions: ["finance.write", "shipment.read"] };

  assert.equal(canManageImportType(finance, "invoice_status"), true);
  assert.equal(canManageImportType(finance, "shipment_tracker"), false);
  assert.equal(canManageImportType(finance, "directory"), false);
});
