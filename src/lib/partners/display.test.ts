// Synthetic fixtures only: reserved NANP 202-555-01xx contacts; Mexico normalization
// uses deliberately invalid all-zero subscriber prefixes. Never send or dial these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDirectoryContactLabel,
  getWhatsappParticipantDisplayName,
  sortPartnerLocationsByName,
  sortPartnerOrganizationsByName,
} from "./display";

test("getWhatsappParticipantDisplayName prefers the mapped contact name", () => {
  assert.equal(
    getWhatsappParticipantDisplayName({
      unknownLabel: "Unknown participant",
      participant: {
        displayName: null,
        phoneNumber: "12025550106",
        participantKey: "12025550106@s.whatsapp.net",
        contact: {
          label: "Demo Contact A",
        },
      },
    }),
    "Demo Contact A",
  );
});

test("getWhatsappParticipantDisplayName falls back to observed name, then unknown copy", () => {
  assert.equal(
    getWhatsappParticipantDisplayName({
      unknownLabel: "Unknown participant",
      participant: {
        displayName: "Driver One",
        phoneNumber: "12025550106",
        participantKey: "12025550106@s.whatsapp.net",
        contact: null,
      },
    }),
    "Driver One",
  );

  assert.equal(
    getWhatsappParticipantDisplayName({
      unknownLabel: "Unknown participant",
      participant: {
        displayName: null,
        phoneNumber: "12025550106",
        participantKey: "12025550106@s.whatsapp.net",
        contact: null,
      },
    }),
    "Unknown participant",
  );
});

test("getDirectoryContactLabel uses display name before full name", () => {
  assert.equal(
    getDirectoryContactLabel({
      fullName: "Legal Name",
      displayName: "Preferred Name",
    }),
    "Preferred Name",
  );
});

test("sortPartnerOrganizationsByName sorts by visible name", () => {
  const sorted = sortPartnerOrganizationsByName([
    { id: "3", legalName: "Zeta", displayName: null },
    { id: "1", legalName: "Bravo Legal", displayName: "Alpha Display" },
    { id: "2", legalName: "Bravo", displayName: null },
  ]);

  assert.deepEqual(
    sorted.map((organization) => organization.id),
    ["1", "2", "3"],
  );
});

test("sortPartnerLocationsByName sorts by location name", () => {
  const sorted = sortPartnerLocationsByName([
    { id: "3", name: "Zeta Demo Warehouse" },
    { id: "1", name: "Alpha Demo Warehouse" },
    { id: "2", name: "Beta Demo Cafe" },
  ]);

  assert.deepEqual(
    sorted.map((location) => location.id),
    ["1", "2", "3"],
  );
});
