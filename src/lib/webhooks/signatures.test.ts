import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  isFreshUnixTimestamp,
  verifySha256Hmac,
  verifyTimestampedSha256Hmac,
} from "@/lib/webhooks/signatures";

test("verifies provider HMAC signatures with or without the sha256 prefix", () => {
  const body = '{"event":"received"}';
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(verifySha256Hmac({ body, secret, signature }), true);
  assert.equal(
    verifySha256Hmac({ body, secret, signature: `sha256=${signature}` }),
    true,
  );
  assert.equal(
    verifySha256Hmac({ body: `${body} `, secret, signature }),
    false,
  );
  assert.equal(verifySha256Hmac({ body, secret, signature: "not-hex" }), false);
});

test("verifies timestamped signatures and rejects stale timestamps", () => {
  const body = '{"event":"received"}';
  const timestamp = "1800000000";
  const secret = "test-secret";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  assert.equal(
    verifyTimestampedSha256Hmac({ body, timestamp, secret, signature }),
    true,
  );
  assert.equal(
    isFreshUnixTimestamp(timestamp, 300, 1_800_000_120_000),
    true,
  );
  assert.equal(
    isFreshUnixTimestamp(timestamp, 300, 1_800_000_301_000),
    false,
  );
});
