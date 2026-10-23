import assert from "node:assert/strict";
import { test } from "node:test";

import { readActionResponse } from "./action-response";

test("readActionResponse reads JSON action errors", async () => {
  const response = Response.json({ ok: false, error: "email rate limit exceeded" }, { status: 400 });

  assert.deepEqual(await readActionResponse(response, "Unable to send email."), {
    ok: false,
    error: "email rate limit exceeded",
  });
});

test("readActionResponse hides HTML parser details behind a fallback", async () => {
  const response = new Response("<!DOCTYPE html><html></html>", {
    status: 400,
    headers: { "content-type": "text/html" },
  });

  assert.deepEqual(await readActionResponse(response, "Unable to send email."), {
    ok: false,
    error: "Unable to send email.",
  });
});
