import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSupabaseImplicitCallbackBridgeHtml } from "./supabase-callback-bridge";

test("buildSupabaseImplicitCallbackBridgeHtml exchanges URL-fragment tokens through the session endpoint", () => {
  const html = buildSupabaseImplicitCallbackBridgeHtml("/auth/setup");

  assert.match(html, /window\.location\.hash/);
  assert.match(html, /access_token/);
  assert.match(html, /refresh_token/);
  assert.match(html, /\/api\/auth\/supabase\/session/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /"next":"\/auth\/setup"/);
});
