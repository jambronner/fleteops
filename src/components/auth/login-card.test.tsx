import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LoginCard } from "./login-card";

test("LoginCard renders a centered invite-only Supabase login surface", () => {
  const html = renderToStaticMarkup(
    <LoginCard
      appHomePath="/dashboard"
      errorMessage={null}
      googleClientId="google-client-id.apps.googleusercontent.com"
      locale="en"
    />,
  );

  assert.match(html, /logo\.svg/);
  assert.match(html, /Workspace sign in/);
  assert.match(html, /action="\/api\/auth\/supabase\/sign-in"/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /\/api\/auth\/supabase\/oauth/);
  assert.doesNotMatch(html, /Continue with Microsoft/);
  assert.match(html, /Send recovery email/);
  assert.match(html, /id="password-reset-email"/);
  assert.doesNotMatch(html, /href="\/auth\/reset-password"/);
  assert.match(html, /Invite-only workspace access/);
  assert.doesNotMatch(html, /Create workspace/);
  assert.doesNotMatch(html, /Sessions stay tied to a single workspace/);
});
