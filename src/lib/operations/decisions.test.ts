import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRouteApprovalReadiness,
  parseRouteDecision,
} from "@/lib/operations/decisions";
import type { ReconciliationEvaluation } from "@/lib/reconciliation/types";

test("parseRouteDecision returns null for absent or malformed metadata", () => {
  assert.equal(parseRouteDecision(null), null);
  assert.equal(parseRouteDecision({}), null);
  assert.equal(parseRouteDecision({ decision: "approved" }), null);
  assert.equal(parseRouteDecision({ decision: ["approved"] }), null);
  assert.equal(parseRouteDecision({ decision: { verdict: "maybe" } }), null);
  assert.equal(
    parseRouteDecision({ decision: { verdict: "approved", decidedAt: "2026-07-11T18:00:00Z" } }),
    null,
  );
});

test("parseRouteDecision reads a valid decision and trims the note", () => {
  const decision = parseRouteDecision({
    decision: {
      verdict: "hold",
      note: "  Tarifa en revisión  ",
      decidedByUserId: "11111111-1111-1111-1111-111111111111",
      decidedByName: "JB",
      decidedAt: "2026-07-11T18:00:00Z",
    },
  });

  assert.deepEqual(decision, {
    verdict: "hold",
    note: "Tarifa en revisión",
    decidedByUserId: "11111111-1111-1111-1111-111111111111",
    decidedByName: "JB",
    decidedAt: "2026-07-11T18:00:00Z",
  });
});

test("parseRouteDecision blanks an empty note", () => {
  const decision = parseRouteDecision({
    decision: {
      verdict: "approved",
      note: "   ",
      decidedByUserId: "11111111-1111-1111-1111-111111111111",
      decidedAt: "2026-07-11T18:00:00Z",
    },
  });

  assert.equal(decision?.note, null);
  assert.equal(decision?.decidedByName, null);
});

function evaluation(
  overrides: Partial<ReconciliationEvaluation> = {},
): ReconciliationEvaluation {
  return {
    status: "ready_for_review",
    controlTowerStatus: "needsReview",
    confidenceScore: 0.9,
    requirements: [
      {
        code: "purchase_order",
        label: "Purchase order",
        status: "matched",
        reason: "Present",
        supportingDocumentIds: ["po"],
      },
      {
        code: "delivery_proof",
        label: "Delivery proof",
        status: "matched",
        reason: "Present",
        supportingDocumentIds: ["pod"],
      },
      {
        code: "carrier_invoice",
        label: "Carrier invoice",
        status: "matched",
        reason: "Present",
        supportingDocumentIds: ["invoice"],
      },
    ],
    exceptions: [],
    summary: {
      happened: "Delivered",
      missing: "Nothing",
      wrong: "Nothing",
      nextAction: "Review",
    },
    ...overrides,
  };
}

test("payment approval requires a delivered route", () => {
  assert.deepEqual(
    evaluateRouteApprovalReadiness({
      lifecycle: "in_transit",
      evaluation: evaluation(),
    }),
    {
      canApprove: false,
      blockers: ["route_not_delivered"],
    },
  );
});

test("payment approval rejects missing requirements and blocking exceptions", () => {
  const result = evaluateRouteApprovalReadiness({
    lifecycle: "delivered",
    evaluation: evaluation({
      requirements: [
        {
          code: "carrier_invoice",
          label: "Carrier invoice",
          status: "missing",
          reason: "Missing",
          supportingDocumentIds: [],
        },
      ],
      exceptions: [
        {
          id: "quantity",
          type: "qty_short",
          severity: "high",
          summary: "Quantity mismatch",
          blocking: true,
        },
      ],
    }),
  });

  assert.deepEqual(result, {
    canApprove: false,
    blockers: ["requirement:carrier_invoice", "exception:qty_short"],
  });
});

test("payment approval permits complete evidence with only human review remaining", () => {
  assert.deepEqual(
    evaluateRouteApprovalReadiness({
      lifecycle: "delivered",
      evaluation: evaluation(),
    }),
    {
      canApprove: true,
      blockers: [],
    },
  );
});
