import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(app)/routes/[shipmentId]/page.tsx"),
  "utf8",
);
const enSource = readFileSync(
  join(process.cwd(), "src/lib/i18n/dictionaries/en.ts"),
  "utf8",
);
const esSource = readFileSync(
  join(process.cwd(), "src/lib/i18n/dictionaries/es-MX.ts"),
  "utf8",
);
const decisionActionsSource = readFileSync(
  join(process.cwd(), "src/components/routes/route-decision-actions.tsx"),
  "utf8",
);

test("route detail keeps readiness, work, and facts visible as one bounded workspace", () => {
  assert.match(pageSource, /data-route-readiness-region="summary"/);
  assert.match(pageSource, /data-route-readiness-region="work"/);
  assert.match(pageSource, /data-route-readiness-region="facts"/);
  assert.match(pageSource, /xl:grid-cols-\[minmax\(0,1fr\)_20rem\]/);
  assert.doesNotMatch(pageSource, /md:grid-cols-4/);
});

test("route readiness headings stay concise in both dictionaries", () => {
  assert.match(enSource, /readinessTitle: "Readiness"/);
  assert.match(enSource, /factsTitle: "Route facts"/);
  assert.match(enSource, /requirementsTitle: "Required evidence"/);
  assert.match(esSource, /readinessTitle: "Preparación"/);
  assert.match(esSource, /factsTitle: "Datos de ruta"/);
  assert.match(esSource, /requirementsTitle: "Evidencia requerida"/);
});

test("blocked approval has a distinct disabled visual state", () => {
  assert.match(decisionActionsSource, /disabled:bg-emerald-50/);
  assert.match(decisionActionsSource, /disabled:text-emerald-700/);
  assert.match(decisionActionsSource, /disabled:cursor-not-allowed/);
});
