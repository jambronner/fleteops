import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveShipmentTrackerImportBatchStatus } from "./shipment-import-status";

test("shipment tracker import status treats all-duplicate imports as partial instead of completed", () => {
  assert.equal(
    resolveShipmentTrackerImportBatchStatus({
      created: 0,
      skipped: 0,
      unmatchedLocations: 0,
      duplicateSkipped: 3,
    }),
    "partially_completed",
  );
});

test("shipment tracker import status only completes when every usable row creates clean routes", () => {
  assert.equal(
    resolveShipmentTrackerImportBatchStatus({
      created: 2,
      skipped: 0,
      unmatchedLocations: 0,
      duplicateSkipped: 0,
    }),
    "completed",
  );
  assert.equal(
    resolveShipmentTrackerImportBatchStatus({
      created: 1,
      skipped: 0,
      unmatchedLocations: 0,
      duplicateSkipped: 1,
    }),
    "partially_completed",
  );
});
