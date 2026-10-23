import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./partner-directory-workspace.tsx", import.meta.url),
  "utf8",
);

test("directory workspace collapses source review into a horizontal desktop rail", () => {
  assert.match(source, /2xl:grid-cols-\[minmax\(560px,0\.82fr\)_minmax\(0,1\.68fr\)\]/);
  assert.match(source, /2xl:grid-cols-\[64px_minmax\(0,1fr\)\]/);
  assert.match(source, /ChevronLeft/);
  assert.match(source, /ChevronRight/);
  assert.match(source, /2xl:transition-\[grid-template-columns\]/);
});

test("source review shares the full desktop workspace height and owns its scroll", () => {
  assert.match(source, /2xl:h-full/);
  assert.match(source, /2xl:flex-1 2xl:overflow-y-auto/);
  assert.doesNotMatch(source, /100dvh-560px/);
});
