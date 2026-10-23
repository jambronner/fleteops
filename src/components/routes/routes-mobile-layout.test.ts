import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/components/routes/routes-workspace.tsx"),
  "utf8",
);

test("routes render native mobile cards and keep the dense table for larger screens", () => {
  assert.match(source, /data-route-mobile-list="true"/);
  assert.match(source, /data-route-mobile-card=/);
  assert.match(source, /className="[^\"]*md:hidden[^\"]*"/);
  assert.match(source, /<table className="hidden w-full min-w-\[820px\] border-collapse text-sm md:table"/);
});

test("mobile route cards expose status, evidence, date, and the route action", () => {
  assert.match(source, /copy\.table\.status/);
  assert.match(source, /copy\.table\.evidence/);
  assert.match(source, /copy\.table\.date/);
  assert.match(source, /copy\.reviewRoute/);
  assert.match(source, /copy\.openRoute/);
});
