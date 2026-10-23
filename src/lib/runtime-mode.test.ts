import assert from "node:assert/strict";
import test from "node:test";
import { isDemoMode } from "./runtime-mode";
test("only explicit connected enables real services", () => {
  assert.equal(isDemoMode("demo"), true);
  assert.equal(isDemoMode(""), true);
  assert.equal(isDemoMode("production"), true);
  assert.equal(isDemoMode("connected"), false);
});
