import assert from "node:assert/strict";
import test from "node:test";

import { documentLifecycleRequestSchema } from "@/lib/documents/lifecycle";

test("archiving evidence requires a meaningful reason", () => {
  assert.equal(
    documentLifecycleRequestSchema.safeParse({ action: "archive", reason: "Wrong route" }).success,
    true,
  );
  assert.equal(
    documentLifecycleRequestSchema.safeParse({ action: "archive", reason: "  " }).success,
    false,
  );
});

test("restoring evidence never accepts a destructive purge instruction", () => {
  assert.equal(documentLifecycleRequestSchema.safeParse({ action: "restore" }).success, true);
  assert.equal(documentLifecycleRequestSchema.safeParse({ action: "purge" }).success, false);
});
