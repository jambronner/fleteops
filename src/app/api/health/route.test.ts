import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHealthPayload } from "./route";

test("buildHealthPayload passes the commit sha through when present", () => {
  const payload = buildHealthPayload({
    commitSha: "abc1234",
    appUrl: "https://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });

  assert.equal(payload.commit, "abc1234");
});

test("buildHealthPayload reports commit as null when APP_COMMIT_SHA is unset", () => {
  const payload = buildHealthPayload({
    commitSha: null,
    appUrl: "https://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });

  assert.equal(payload.commit, null);
});

test("buildHealthPayload reports authProvider supabase and authConfigured true when fully configured", () => {
  const payload = buildHealthPayload({
    commitSha: "abc1234",
    appUrl: "https://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });

  assert.equal(payload.authProvider, "supabase");
  assert.equal(payload.authConfigured, true);
});

test("buildHealthPayload reports authProvider local and authConfigured false for local auth", () => {
  const payload = buildHealthPayload({
    commitSha: null,
    appUrl: "http://localhost:3000",
    authProviderRaw: "local",
    authConfigured: false,
  });

  assert.equal(payload.authProvider, "local");
  assert.equal(payload.authConfigured, false);
});

test("buildHealthPayload reports authProvider null for an unrecognized provider", () => {
  const payload = buildHealthPayload({
    commitSha: null,
    appUrl: "https://app.example.invalid",
    authProviderRaw: "clerk",
    authConfigured: false,
  });

  assert.equal(payload.authProvider, null);
});

test("buildHealthPayload reports appUrlOk true only for a non-localhost https URL", () => {
  const ok = buildHealthPayload({
    commitSha: null,
    appUrl: "https://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });
  assert.equal(ok.appUrlOk, true);

  const httpNotOk = buildHealthPayload({
    commitSha: null,
    appUrl: "http://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });
  assert.equal(httpNotOk.appUrlOk, false);

  const localhostNotOk = buildHealthPayload({
    commitSha: null,
    appUrl: "https://localhost:3000",
    authProviderRaw: "supabase",
    authConfigured: true,
  });
  assert.equal(localhostNotOk.appUrlOk, false);
});

test("buildHealthPayload keeps ok/service and never includes secret-shaped fields", () => {
  const payload = buildHealthPayload({
    commitSha: "abc1234",
    appUrl: "https://app.example.invalid",
    authProviderRaw: "supabase",
    authConfigured: true,
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.service, "fleteops-ai");
  assert.equal("timestamp" in payload, true);
  assert.equal(Object.keys(payload).some((key) => /key|secret|token/i.test(key)), false);
});
