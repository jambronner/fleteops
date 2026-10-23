import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionSigningSecret } from "@/lib/auth/session";

test("session signing requires a dedicated secret in production", () => {
  assert.throws(
    () =>
      resolveSessionSigningSecret({
        authSecret: undefined,
        productionRuntime: true,
      }),
    /AUTH_SECRET is required/,
  );
});

test("session signing keeps an explicit local-only fallback for development", () => {
  assert.equal(
    resolveSessionSigningSecret({
      authSecret: undefined,
      productionRuntime: false,
    }),
    "local-dev-session-secret",
  );
  assert.equal(
    resolveSessionSigningSecret({
      authSecret: " dedicated-secret ",
      productionRuntime: true,
    }),
    "dedicated-secret",
  );
});
