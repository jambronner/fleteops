// Synthetic fixtures only: reserved NANP 202-555-01xx contacts; Mexico normalization
// uses deliberately invalid all-zero subscriber prefixes. Never send or dial these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeEvolutionGroupParticipant } from "./webhook";

test("normalizeEvolutionGroupParticipant uses Evolution phoneNumber when participant id is a WhatsApp LID", () => {
  const participant = normalizeEvolutionGroupParticipant({
    id: "90000000000002@lid",
    admin: "superadmin",
    phoneNumber: "12025550106@s.whatsapp.net",
  });

  assert.equal(participant?.participantKey, "90000000000002@lid");
  assert.equal(participant?.phoneNumber, "12025550106");
  assert.equal(participant?.normalizedPhoneNumber, "12025550106");
  assert.equal(participant?.isSuperAdmin, true);
});
