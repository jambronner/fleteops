import assert from "node:assert/strict";
import test from "node:test";
import { initialState, canApprove, simulateIntake, reviewEvidence, decide, setSourceStatus, importCsv, sampleCsv } from "./model";
import { dictionaries } from "./dictionaries";

test("evidence gaps and quantity discrepancies prevent readiness approval", () => {
  const state = initialState();
  assert.deepEqual(state.packets.map(canApprove), [false, false, true]);
  assert.equal(decide(state, state.packets[0].id, "approved"), state);
  assert.equal(decide(state, state.packets[1].id, "approved"), state);
  assert.equal(decide(state, state.packets[2].id, "approved").packets[2].decision?.verdict, "approved");
});
test("unclaimed and blocked intake cannot mutate route facts or proposals", () => {
  const state = initialState();
  for (const source of state.sources.slice(1)) {
    const next = simulateIntake(state, source.id, state.packets[0].id);
    assert.equal(next.packets, state.packets); assert.deepEqual(next.proposals, []);
    assert.equal(next.events[0].action, "intakeHeld");
  }
});
test("approved intake remains a suggestion until the operator accepts it", () => {
  const state = initialState(); const id = state.packets[0].id;
  const suggested = simulateIntake(state, state.sources[0].id, id);
  assert.equal(suggested.packets, state.packets); assert.equal(canApprove(suggested.packets[0]), false);
  assert.equal(simulateIntake(suggested, state.sources[0].id, id), suggested);
  const reviewed = reviewEvidence(suggested, id);
  assert.equal(canApprove(reviewed.packets[0]), true);
  assert.equal(reviewEvidence(reviewed, id), reviewed);
  const held = decide(reviewed, id, "hold"); assert.equal(held.packets[0].decision?.verdict, "hold");
  const approved = decide(held, id, "approved"); assert.equal(approved.packets[0].decision?.verdict, "approved");
  assert.deepEqual(approved.events.slice(0,4).map(e=>e.action), ["approved","hold","evidenceReviewed","suggested"]);
});
test("source approval and blocking affect subsequent intake", () => {
  const state = initialState(); const id = state.packets[0].id; const source = state.sources[1].id;
  const approved = setSourceStatus(state, source, "approved");
  assert.deepEqual(simulateIntake(approved, source, id).proposals, [id]);
  assert.deepEqual(simulateIntake(setSourceStatus(approved, source, "blocked"), source, id).proposals, []);
});
test("CSV import is bounded, synthetic-only and atomic", () => {
  const state = initialState(); const valid = importCsv(state, sampleCsv);
  assert.equal(valid.count, 2); assert.equal(valid.state.packets.length, 5);
  for (const text of ["reference,quantity\nCUSTOMER-1,5", "reference,quantity\nDEMO-X,0", "reference,quantity\nDEMO-X,4,extra", "reference,quantity\nDEMO-X,4\nDEMO-X,5", "reference,quantity\nDEMO-X,4\nDEMO-001,5", "x".repeat(20001)]) {
    const result = importCsv(state, text); assert.ok(result.error); assert.equal(result.state, state); assert.equal(result.count, 0);
  }
  assert.equal(importCsv(valid.state, sampleCsv).error, "duplicate");
});
test("reset recreates isolated records and bilingual controls have matching keys", () => {
  const state = initialState();state.packets[0].expectedQuantity=999;
  assert.equal(initialState().packets[0].expectedQuantity,100);
  assert.deepEqual(Object.keys(dictionaries.en).sort(),Object.keys(dictionaries["es-MX"]).sort());
});
