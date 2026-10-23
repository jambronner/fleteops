import assert from "node:assert/strict";
import { test } from "node:test";

import { getIntakeReviewTaskAction } from "./actions";

test("getIntakeReviewTaskAction sends unresolved route updates to the review task anchor", () => {
  const action = getIntakeReviewTaskAction({
    id: "00000003-0003-4000-8000-000000000003",
    subjectId: "00000004-0004-4000-8000-000000000004",
    metadata: {
      action: "update_route",
      classification: {
        updates: {
          note: "Change delivery completion date to Jan 25, 2025",
        },
      },
    },
  });

  assert.equal(action.href, "/evidence#review-task-00000003-0003-4000-8000-000000000003");
  assert.equal(action.label, "Review route update");
  assert.equal(action.kind, "route_update");
});

test("getIntakeReviewTaskAction opens the matched route when route resolution found one", () => {
  const action = getIntakeReviewTaskAction({
    id: "00000003-0003-4000-8000-000000000003",
    subjectId: "00000004-0004-4000-8000-000000000004",
    metadata: {
      action: "update_route",
      routeResolution: {
        shipmentId: "00000005-0005-4000-8000-000000000005",
      },
    },
  });

  assert.equal(action.href, "/routes/00000005-0005-4000-8000-000000000005");
  assert.equal(action.label, "Open route");
  assert.equal(action.kind, "route_update");
});
