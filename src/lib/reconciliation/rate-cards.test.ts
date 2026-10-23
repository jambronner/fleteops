import assert from "node:assert/strict";
import test from "node:test";

import { resolveRateCardAmount, type RateCardRecord } from "@/lib/reconciliation/rate-cards";

function card(overrides: Partial<RateCardRecord> = {}): RateCardRecord {
  return {
    id: "rc-default",
    direction: "carrier",
    counterpartyOrgId: null,
    matchType: "stop_count",
    minStops: null,
    maxStops: null,
    amount: 1000,
    currency: "MXN",
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

test("resolves the stop-count tier that contains the route's stop count", () => {
  const rateCards = [
    card({ id: "one-stop", minStops: 1, maxStops: 1, amount: 2000 }),
    card({ id: "multi-stop", minStops: 2, maxStops: 6, amount: 4900 }),
  ];

  assert.equal(
    resolveRateCardAmount({ rateCards, direction: "carrier", stopCount: 1 })?.amount,
    2000,
  );
  assert.equal(
    resolveRateCardAmount({ rateCards, direction: "carrier", stopCount: 4 })?.amount,
    4900,
  );
  assert.equal(resolveRateCardAmount({ rateCards, direction: "carrier", stopCount: 9 }), null);
});

test("an org-specific card outranks the direction-wide default", () => {
  const rateCards = [
    card({ id: "default", minStops: 2, maxStops: 6, amount: 4900 }),
    card({ id: "driver-x", counterpartyOrgId: "org-x", minStops: 2, maxStops: 6, amount: 3500 }),
  ];

  assert.equal(
    resolveRateCardAmount({
      rateCards,
      direction: "carrier",
      counterpartyOrgId: "org-x",
      stopCount: 3,
    })?.rateCardId,
    "driver-x",
  );
  assert.equal(
    resolveRateCardAmount({
      rateCards,
      direction: "carrier",
      counterpartyOrgId: "org-y",
      stopCount: 3,
    })?.rateCardId,
    "default",
  );
});

test("direction, activity, and validity windows filter candidates", () => {
  const rateCards = [
    card({ id: "customer-side", direction: "customer", minStops: 1, maxStops: 6, amount: 4900 }),
    card({ id: "inactive", active: false, minStops: 1, maxStops: 6, amount: 100 }),
    card({
      id: "expired",
      minStops: 1,
      maxStops: 6,
      amount: 4200,
      validTo: "2026-01-31",
    }),
    card({
      id: "current",
      minStops: 1,
      maxStops: 6,
      amount: 4500,
      validFrom: "2026-02-01",
    }),
  ];

  const resolved = resolveRateCardAmount({
    rateCards,
    direction: "carrier",
    stopCount: 3,
    serviceDate: "2026-08-18",
  });

  assert.equal(resolved?.rateCardId, "current");
});

test("no stop count means no resolved amount — an agreement is never invented", () => {
  const rateCards = [card({ minStops: 1, maxStops: 6, amount: 4900 })];

  assert.equal(resolveRateCardAmount({ rateCards, direction: "carrier", stopCount: null }), null);
  assert.equal(resolveRateCardAmount({ rateCards, direction: "carrier", stopCount: 0 }), null);
});
