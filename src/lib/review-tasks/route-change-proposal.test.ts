import assert from "node:assert/strict";
import test from "node:test";

import {
  changedRouteDateFields,
  hasProposedRouteDateChanges,
  parseRouteChangeProposal,
  routeDateValuesMatch,
  shouldRequireHumanRouteChangeApproval,
} from "@/lib/review-tasks/route-change-proposal";

const metadata = {
  proposalVersion: 1,
  requiresHumanApproval: true,
  action: "update_route",
  routeResolution: {
    shipmentId: "11111111-1111-4111-8111-111111111111",
    reason: "Matched an explicit route reference.",
  },
  routeReference: "MX-241",
  routeStatus: "in_transit",
  currentValues: {
    pickupDate: "2026-08-01",
    deliveryDateExpected: "2026-08-02",
    deliveryDateActual: null,
  },
  proposedUpdates: {
    pickupDate: null,
    deliveryDateExpected: "2026-08-03",
    deliveryDateActual: null,
  },
  confidence: 0.94,
  classification: { rationale: "The sender explicitly moved the delivery date." },
};

test("only draft routes allow AI date writes without approval", () => {
  assert.equal(shouldRequireHumanRouteChangeApproval("draft"), false);
  assert.equal(shouldRequireHumanRouteChangeApproval("planned"), true);
  assert.equal(shouldRequireHumanRouteChangeApproval("in_transit"), true);
  assert.equal(shouldRequireHumanRouteChangeApproval("delivered"), true);
});

test("parses a complete route change proposal and rejects ordinary review metadata", () => {
  assert.equal(parseRouteChangeProposal(metadata)?.routeReference, "MX-241");
  assert.equal(parseRouteChangeProposal({ action: "update_route" }), null);
});

test("reports only fields whose proposed value changes operational truth", () => {
  const proposal = parseRouteChangeProposal(metadata);
  assert.ok(proposal);
  assert.deepEqual(changedRouteDateFields(proposal), [
    {
      field: "deliveryDateExpected",
      current: "2026-08-02",
      proposed: "2026-08-03",
    },
  ]);
});

test("does not create review work for a no-op suggestion", () => {
  const proposal = parseRouteChangeProposal(metadata);
  assert.ok(proposal);
  assert.equal(hasProposedRouteDateChanges(proposal.currentValues, proposal.proposedUpdates), true);
  assert.equal(
    hasProposedRouteDateChanges(proposal.currentValues, {
      pickupDate: null,
      deliveryDateExpected: proposal.currentValues.deliveryDateExpected,
      deliveryDateActual: null,
    }),
    false,
  );
});

test("detects stale route state before a proposal can be accepted", () => {
  const proposal = parseRouteChangeProposal(metadata);
  assert.ok(proposal);
  assert.equal(routeDateValuesMatch(proposal.currentValues, proposal.currentValues), true);
  assert.equal(
    routeDateValuesMatch(proposal.currentValues, {
      ...proposal.currentValues,
      deliveryDateExpected: "2026-08-04",
    }),
    false,
  );
});
