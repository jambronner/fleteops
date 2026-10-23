import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSupabaseAuthCallbackUrl,
  resolveSupabaseAuthRedirectPath,
  resolveSupabaseAuthRedirectPathFromValue,
} from "./redirects";

test("buildSupabaseAuthCallbackUrl targets the dashboard by default", () => {
  const redirectUrl = buildSupabaseAuthCallbackUrl("https://demo.example.invalid");

  assert.equal(
    redirectUrl.toString(),
    "https://demo.example.invalid/auth/callback?next=%2Fdashboard",
  );
});

test("buildSupabaseAuthCallbackUrl supports explicit recovery targets", () => {
  const redirectUrl = buildSupabaseAuthCallbackUrl(
    "https://app.example.invalid",
    "/auth/reset-password",
  );

  assert.equal(
    redirectUrl.toString(),
    "https://app.example.invalid/auth/callback?next=%2Fauth%2Freset-password",
  );
});

test("resolveSupabaseAuthRedirectPath unwraps token-hash links that point back at the callback", () => {
  const requestUrl =
    "https://app.example.invalid/auth/confirm?token_hash=abc&type=email&next=https%3A%2F%2Fapp.example.invalid%2Fauth%2Fcallback%3Fnext%3D%252Fauth%252Fsetup";

  assert.equal(resolveSupabaseAuthRedirectPath(requestUrl, "/dashboard"), "/auth/setup");
});

test("resolveSupabaseAuthRedirectPath rejects external next targets", () => {
  const requestUrl = "https://app.example.invalid/auth/confirm?next=https%3A%2F%2Fother.example.invalid%2Fphish";

  assert.equal(resolveSupabaseAuthRedirectPath(requestUrl, "/dashboard"), "/dashboard");
});

test("resolveSupabaseAuthRedirectPathFromValue safely unwraps callback next values", () => {
  assert.equal(
    resolveSupabaseAuthRedirectPathFromValue(
      "https://app.example.invalid/auth/callback?next=%2Fauth%2Fsetup",
      "https://app.example.invalid",
      "/dashboard",
    ),
    "/auth/setup",
  );
});
