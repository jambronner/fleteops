import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLocalAuthAllowed } from "@/lib/auth/local-auth-guard";

test("Supabase auth enabled: always allowed (the prod + transitional Vercel case)", () => {
  assert.equal(
    evaluateLocalAuthAllowed({
      supabaseAuthEnabled: true,
      productionRuntime: true,
      overrideEnabled: false,
    }),
    true,
  );
});

test("local auth in dev (non-production) is allowed", () => {
  assert.equal(
    evaluateLocalAuthAllowed({
      supabaseAuthEnabled: false,
      productionRuntime: false,
      overrideEnabled: false,
    }),
    true,
  );
});

test("local auth in production without Supabase is refused unless overridden", () => {
  assert.equal(
    evaluateLocalAuthAllowed({
      supabaseAuthEnabled: false,
      productionRuntime: true,
      overrideEnabled: false,
    }),
    false,
  );
  assert.equal(
    evaluateLocalAuthAllowed({
      supabaseAuthEnabled: false,
      productionRuntime: true,
      overrideEnabled: true,
    }),
    true,
  );
});
