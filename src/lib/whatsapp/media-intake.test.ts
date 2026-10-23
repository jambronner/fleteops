import assert from "node:assert/strict";
import test from "node:test";

import { resolveWhatsappMediaSource } from "@/lib/whatsapp/media-intake";

test("resolves instance and message key from the raw webhook payload", () => {
  const source = resolveWhatsappMediaSource({
    externalMessageId: "evolution:demo-freight-local-01:ABC123",
    raw: {
      instanceName: "demo-freight-local-01",
      data: { key: { id: "ABC123", remoteJid: "123@g.us" } },
    },
  });

  assert.equal(source.instanceName, "demo-freight-local-01");
  assert.equal(source.messageKeyId, "ABC123");
});

test("falls back to parsing the synthetic external message id", () => {
  const source = resolveWhatsappMediaSource({
    externalMessageId: "evolution:demo-freight-local-01:XYZ789",
    raw: {},
  });

  assert.equal(source.instanceName, "demo-freight-local-01");
  assert.equal(source.messageKeyId, "XYZ789");
});

test("returns nulls when the message key cannot be recovered", () => {
  // The timestamp-based fallback id has four parts, so it never parses as a key.
  const source = resolveWhatsappMediaSource({
    externalMessageId: "evolution:demo-freight-local-01:123@g.us:1755500000",
    raw: {},
  });

  assert.equal(source.messageKeyId, null);
});
