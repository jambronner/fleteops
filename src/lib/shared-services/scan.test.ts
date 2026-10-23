import assert from "node:assert/strict";
import test from "node:test";

import { evaluateScanPolicy } from "@/lib/shared-services/scan";

test("no gateway configured: allow unless scanning is required", () => {
  assert.equal(
    evaluateScanPolicy({ required: false, configured: false, outcome: "skipped" }),
    "allow",
  );
  assert.equal(
    evaluateScanPolicy({ required: true, configured: false, outcome: "skipped" }),
    "block",
  );
});

test("definitive verdicts always block once a gateway is wired", () => {
  for (const required of [false, true]) {
    assert.equal(
      evaluateScanPolicy({ required, configured: true, outcome: "infected" }),
      "block",
      `infected should block (required=${required})`,
    );
    assert.equal(
      evaluateScanPolicy({ required, configured: true, outcome: "rejected" }),
      "block",
      `rejected should block (required=${required})`,
    );
  }
});

test("clean always allows", () => {
  assert.equal(evaluateScanPolicy({ required: true, configured: true, outcome: "clean" }), "allow");
  assert.equal(evaluateScanPolicy({ required: false, configured: true, outcome: "clean" }), "allow");
});

test("transient failures block only when scanning is required", () => {
  assert.equal(
    evaluateScanPolicy({ required: true, configured: true, outcome: "failed" }),
    "block",
  );
  assert.equal(
    evaluateScanPolicy({ required: false, configured: true, outcome: "failed" }),
    "allow",
  );
  assert.equal(
    evaluateScanPolicy({ required: true, configured: true, outcome: "error" }),
    "block",
  );
  assert.equal(
    evaluateScanPolicy({ required: false, configured: true, outcome: "error" }),
    "allow",
  );
});
