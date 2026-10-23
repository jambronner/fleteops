import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildImportReviewPath,
  coerceImportReviewReturnPath,
} from "./route-review-navigation";

test("buildImportReviewPath creates the generic import review URL", () => {
  assert.equal(
    buildImportReviewPath("00000001-0001-4000-8000-000000000001"),
    "/imports/00000001-0001-4000-8000-000000000001/review",
  );
});

test("coerceImportReviewReturnPath only allows internal app paths", () => {
  assert.equal(coerceImportReviewReturnPath("/routes"), "/routes");
  assert.equal(coerceImportReviewReturnPath("/imports"), "/imports");
  assert.equal(coerceImportReviewReturnPath("https://example.invalid"), "/routes");
  assert.equal(coerceImportReviewReturnPath("//example.invalid"), "/routes");
  assert.equal(coerceImportReviewReturnPath(null), "/routes");
});
