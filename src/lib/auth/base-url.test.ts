import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAuthBaseUrl } from "./base-url";

test("resolveAuthBaseUrl prefers the request origin when the configured app URL is localhost and the request is not", () => {
  const result = resolveAuthBaseUrl({
    configuredAppUrl: "http://localhost:3000",
    requestUrl: "https://app.example.invalid/api/auth/supabase/magic-link",
  });

  assert.equal(result, "https://app.example.invalid");
});

test("resolveAuthBaseUrl uses the configured app URL when it is a real https URL", () => {
  const result = resolveAuthBaseUrl({
    configuredAppUrl: "https://app.example.invalid",
    requestUrl: "http://0.0.0.0:3000/api/auth/supabase/magic-link",
  });

  assert.equal(result, "https://app.example.invalid");
});

test("resolveAuthBaseUrl falls back to the configured app URL when both configured and request are localhost", () => {
  const result = resolveAuthBaseUrl({
    configuredAppUrl: "http://localhost:3000",
    requestUrl: "http://localhost:3000/api/auth/supabase/magic-link",
  });

  assert.equal(result, "http://localhost:3000");
});
