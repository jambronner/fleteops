// Synthetic fixtures only: reserved NANP 202-555-01xx contacts; Mexico normalization
// uses deliberately invalid all-zero subscriber prefixes. Never send or dial these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatWhatsappIntakePhoneNumberForStorage,
  parseWhatsappIntakeNumberUpdatePayload,
  pickPrimaryWhatsappIntakeChannel,
  resolveWhatsappIntakeInstanceName,
} from "./channels";

test("formatWhatsappIntakePhoneNumberForStorage stores phone numbers with a country code prefix", () => {
  assert.equal(formatWhatsappIntakePhoneNumberForStorage(" +1 (202) 555-0105 "), "+12025550105");
});

test("formatWhatsappIntakePhoneNumberForStorage rejects values without enough digits", () => {
  assert.throws(
    () => formatWhatsappIntakePhoneNumberForStorage("555"),
    /Enter a WhatsApp intake number with country code/,
  );
});

test("parseWhatsappIntakeNumberUpdatePayload returns a normalized update payload", () => {
  assert.deepEqual(
    parseWhatsappIntakeNumberUpdatePayload({
      channelId: "00000002-0002-4000-8000-000000000002",
      phoneNumber: "+1 (202) 555-0105",
    }),
    {
      channelId: "00000002-0002-4000-8000-000000000002",
      phoneNumber: "+12025550105",
    },
  );
});

test("resolveWhatsappIntakeInstanceName prefers the routed external channel id over stale metadata", () => {
  assert.equal(
    resolveWhatsappIntakeInstanceName({
      externalChannelId: "evolution:demo-freight-mx-02",
      metadata: { instanceName: "demo-freight-mx-01" },
    }),
    "demo-freight-mx-02",
  );
});

test("pickPrimaryWhatsappIntakeChannel prefers the active channel with a saved number", () => {
  const selected = pickPrimaryWhatsappIntakeChannel([
    {
      id: "remote",
      label: "demo-freight WhatsApp intake",
      externalChannelId: "evolution:demo-freight-mx-02",
      instanceName: "demo-freight-mx-02",
      phoneNumber: null,
      status: "active",
      updatedAt: "2026-01-15T12:00:00.000Z",
    },
    {
      id: "local",
      label: "demo-freight local WhatsApp intake",
      externalChannelId: "evolution:demo-freight-local-01",
      instanceName: "demo-freight-local-01",
      phoneNumber: "+12025550105",
      status: "active",
      updatedAt: "2026-01-16T12:00:00.000Z",
    },
  ]);

  assert.equal(selected?.id, "local");
});
