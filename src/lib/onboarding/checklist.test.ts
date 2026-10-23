import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/pg-proxy";

import {
  CHANNEL_ELIGIBILITY_QUERY_PLAN,
  buildEligibleChannelQuery,
  isChannelRowEligible,
} from "./checklist";

function assertRecursivelyFrozen(value: unknown): void {
  assert.equal(Object.isFrozen(value), true);

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      assertRecursivelyFrozen(nestedValue);
    }
  }
}

test("channel eligibility plan is frozen and contains the supported active pairings", () => {
  assertRecursivelyFrozen(CHANNEL_ELIGIBILITY_QUERY_PLAN);
  assert.deepEqual(CHANNEL_ELIGIBILITY_QUERY_PLAN, {
    status: "active",
    limit: 1,
    pairs: [
      { provider: "email_routing", channelKind: "email_inbox" },
      { provider: "mailersend", channelKind: "email_inbox" },
      { provider: "agentmail", channelKind: "email_inbox" },
      { provider: "whatsapp", channelKind: "whatsapp_number" },
    ],
  });
});

test("isChannelRowEligible enforces tenant, status, and exact provider/channel pairings", () => {
  const tenantId = "tenant-1";
  const baseRow = {
    tenantId,
    status: "active" as const,
    provider: "email_routing" as const,
    channelKind: "email_inbox" as const,
  };

  assert.equal(isChannelRowEligible(baseRow, tenantId), true);
  assert.equal(isChannelRowEligible({ ...baseRow, tenantId: "tenant-2" }, tenantId), false);
  assert.equal(isChannelRowEligible({ ...baseRow, status: "pending" }, tenantId), false);
  assert.equal(
    isChannelRowEligible(
      { ...baseRow, provider: "whatsapp", channelKind: "email_inbox" },
      tenantId,
    ),
    false,
  );
  assert.equal(
    isChannelRowEligible(
      { ...baseRow, provider: "mailersend" },
      tenantId,
      {
        status: "active",
        limit: 1,
        pairs: [{ provider: "whatsapp", channelKind: "whatsapp_number" }],
      },
    ),
    false,
  );
  assert.equal(
    isChannelRowEligible(
      { ...baseRow, provider: "whatsapp", channelKind: "whatsapp_number" },
      tenantId,
      {
        status: "active",
        limit: 1,
        pairs: [{ provider: "whatsapp", channelKind: "whatsapp_number" }],
      },
    ),
    true,
  );
});

test("buildEligibleChannelQuery keeps channel eligibility filtering and the limit in SQL", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const database = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  });

  const selectedPlan = {
    status: "active" as const,
    limit: 1 as const,
    pairs: [{ provider: "whatsapp" as const, channelKind: "whatsapp_number" as const }],
  };

  assert.deepEqual(
    await buildEligibleChannelQuery(database, "tenant-1", selectedPlan),
    [],
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /select "id" from "inbound_channels"/i);
  assert.match(queries[0].sql, /"tenant_id" =/i);
  assert.match(queries[0].sql, /"status" =/i);
  assert.match(queries[0].sql, /"provider" =/i);
  assert.match(queries[0].sql, /"channel_kind" =/i);
  assert.match(queries[0].sql, /limit \$\d+/i);
  assert.deepEqual(queries[0].params, ["tenant-1", "active", "whatsapp", "whatsapp_number", 1]);
});
