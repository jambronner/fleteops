import assert from "node:assert/strict";
import { test } from "node:test";

import { heuristicIntakeClassifier } from "./intake";

test("heuristic intake marks route requests with multiple distinct dates for review", async () => {
  const result = await heuristicIntakeClassifier.classify({
    locale: "es-MX",
    textBody:
      "SMOKE-GROUP-CREATE-2026-05-12\n\nNueva ruta PO SMOKE-GROUP-CREATE-0512. Recolectar en Planta A CDMX y entregar en Cliente B Queretaro el 2026-05-19.",
  });

  assert.equal(result.classification, "route_request");
  assert.equal(result.action, "create_route");
  assert.equal(result.needsReview, true);
  assert.equal(result.clues.serviceDate, null);
  assert.equal(result.target.serviceDate, null);
});

test("heuristic intake keeps a single explicit route date actionable", async () => {
  const result = await heuristicIntakeClassifier.classify({
    locale: "es-MX",
    textBody:
      "Nueva ruta PO SMOKE-GROUP-CREATE-0512. Recolectar en Planta A CDMX y entregar en Cliente B Queretaro el 2026-05-19.",
  });

  assert.equal(result.classification, "route_request");
  assert.equal(result.action, "create_route");
  assert.equal(result.needsReview, false);
  assert.equal(result.clues.serviceDate, "2026-05-19");
  assert.equal(result.target.serviceDate, "2026-05-19");
});
