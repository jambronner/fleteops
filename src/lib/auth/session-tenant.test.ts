import assert from "node:assert/strict";
import test from "node:test";

import { selectSessionTenantId } from "@/lib/auth/session";

test("session tenant selection keeps the operator's active workspace when the membership still holds", () => {
  assert.equal(
    selectSessionTenantId({
      memberships: [{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }],
      preferredTenantId: "tenant-b",
    }),
    "tenant-b",
  );
});

test("session tenant selection falls back to the first membership when the preference no longer applies", () => {
  assert.equal(
    selectSessionTenantId({
      memberships: [{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }],
      preferredTenantId: "tenant-removed",
    }),
    "tenant-a",
  );
  assert.equal(
    selectSessionTenantId({ memberships: [{ tenantId: "tenant-a" }], preferredTenantId: null }),
    "tenant-a",
  );
  assert.equal(
    selectSessionTenantId({ memberships: [{ tenantId: "tenant-a" }], preferredTenantId: "   " }),
    "tenant-a",
  );
});

test("session tenant selection returns null when the user has no active memberships", () => {
  assert.equal(selectSessionTenantId({ memberships: [], preferredTenantId: "tenant-a" }), null);
});
