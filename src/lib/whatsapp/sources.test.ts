// Synthetic fixtures only: reserved NANP 202-555-01xx contacts; Mexico normalization
// uses deliberately invalid all-zero subscriber prefixes. Never send or dial these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attachWhatsappHeldMessages,
  buildWhatsappHeldMessagePreviews,
  buildWhatsappSourceReviewSnapshot,
  filterWhatsappSourceReviewParticipants,
  shouldAutoTrustWhatsappGroupFromOwner,
  whatsappSenderMatchesPhone,
  whatsappSenderPhoneCandidates,
  type WhatsappSourceRecord,
} from "./sources";

function source(overrides: Partial<WhatsappSourceRecord> & Pick<WhatsappSourceRecord, "id" | "status">): WhatsappSourceRecord {
  return {
    externalConversationId: `${overrides.id}@s.whatsapp.net`,
    displayName: null,
    isGroup: false,
    lastSeenAt: "2026-05-11T12:00:00.000Z",
    participantCount: 1,
    mappedParticipantCount: 0,
    participants: [],
    heldMessageCount: 0,
    heldMessages: [],
    ...overrides,
  };
}

function heldEvent(overrides: {
  id: string;
  conversationId: string | null;
  receivedAt: string;
  messageText?: string | null;
  provider?: string;
  status?: string;
  externalParticipantKey?: string | null;
  metadata?: unknown;
}) {
  return {
    provider: "whatsapp",
    status: "received",
    messageText: null,
    externalParticipantKey: null,
    metadata: {
      messageType: "text",
      senderName: null,
      media: null,
      trustGate: { status: "held_untrusted", reason: "source_untrusted", heldAt: overrides.receivedAt },
    },
    ...overrides,
  };
}

test("buildWhatsappSourceReviewSnapshot keeps decided sources out of the review queue", () => {
  const snapshot = buildWhatsappSourceReviewSnapshot([
    source({ id: "pending", status: "unclaimed" }),
    source({ id: "trusted", status: "active", mappedParticipantCount: 1 }),
    source({ id: "ignored", status: "ignored" }),
    source({ id: "blocked", status: "blocked", isGroup: true, participantCount: 3 }),
  ]);

  assert.deepEqual(
    snapshot.sources.map((item) => item.id),
    ["pending"],
  );
  assert.deepEqual(
    snapshot.directorySources.map((item) => item.id),
    ["trusted", "ignored", "blocked"],
  );
  assert.equal(snapshot.reviewMetrics.totalSources, 1);
  assert.equal(snapshot.reviewMetrics.unclaimedSources, 1);
  assert.equal(snapshot.directoryMetrics.totalSources, 3);
  assert.equal(snapshot.directoryMetrics.activeSources, 1);
  assert.equal(snapshot.metrics.totalSources, 4);
  assert.equal(snapshot.metrics.groupSources, 1);
  assert.equal(snapshot.metrics.observedParticipants, 6);
});

test("filterWhatsappSourceReviewParticipants hides the configured listener number", () => {
  const participants = filterWhatsappSourceReviewParticipants({
    listenerPhoneNumber: "+520000000001",
    participants: [
      {
        participantKey: "90000000000001@lid",
        phoneNumber: "5210000000001",
        normalizedPhoneNumber: "5210000000001",
        displayName: null,
        isAdmin: false,
        isSuperAdmin: false,
        firstSeenAt: null,
        lastSeenAt: null,
      },
      {
        participantKey: "90000000000002@lid",
        phoneNumber: "12025550106",
        normalizedPhoneNumber: "12025550106",
        displayName: null,
        isAdmin: true,
        isSuperAdmin: true,
        firstSeenAt: null,
        lastSeenAt: null,
      },
    ],
  });

  assert.deepEqual(
    participants.map((participant) => participant.normalizedPhoneNumber),
    ["12025550106"],
  );
});

test("shouldAutoTrustWhatsappGroupFromOwner trusts unclaimed groups created by trusted contacts", () => {
  const decision = shouldAutoTrustWhatsappGroupFromOwner({
    status: "unclaimed",
    ownerKey: "90000000000002@lid",
    participants: [
      {
        participantKey: "90000000000002@lid",
        phoneNumber: "12025550106",
        normalizedPhoneNumber: "12025550106",
        displayName: null,
        isAdmin: true,
        isSuperAdmin: true,
        firstSeenAt: null,
        lastSeenAt: null,
      },
    ],
    trustedPhoneNumbers: new Set(["12025550106"]),
  });

  assert.deepEqual(decision, {
    shouldTrust: true,
    ownerPhoneNumber: "12025550106",
  });
});

test("shouldAutoTrustWhatsappGroupFromOwner does not override blocked groups", () => {
  const decision = shouldAutoTrustWhatsappGroupFromOwner({
    status: "blocked",
    ownerKey: "90000000000002@lid",
    participants: [
      {
        participantKey: "90000000000002@lid",
        phoneNumber: "12025550106",
        normalizedPhoneNumber: "12025550106",
        displayName: null,
        isAdmin: true,
        isSuperAdmin: true,
        firstSeenAt: null,
        lastSeenAt: null,
      },
    ],
    trustedPhoneNumbers: new Set(["12025550106"]),
  });

  assert.deepEqual(decision, {
    shouldTrust: false,
    ownerPhoneNumber: "12025550106",
  });
});

test("whatsappSenderPhoneCandidates resolves a group LID through participant metadata", () => {
  const candidates = whatsappSenderPhoneCandidates({
    externalParticipantKey: "90000000000002@lid",
    conversationMetadata: {
      participants: [
        {
          participantKey: "90000000000002@lid",
          phoneNumber: "12025550106",
          normalizedPhoneNumber: "12025550106",
        },
      ],
    },
  });

  assert.equal(candidates.includes("12025550106"), true);
});

test("buildWhatsappHeldMessagePreviews groups held events by conversation, newest first, with a cap", () => {
  const previews = buildWhatsappHeldMessagePreviews({
    limitPerSource: 2,
    events: [
      heldEvent({ id: "m1", conversationId: "conv-1", receivedAt: "2026-08-01T10:00:00.000Z", messageText: "first" }),
      heldEvent({ id: "m2", conversationId: "conv-1", receivedAt: "2026-08-02T10:00:00.000Z", messageText: "second" }),
      heldEvent({ id: "m3", conversationId: "conv-1", receivedAt: "2026-08-03T10:00:00.000Z", messageText: "third" }),
      heldEvent({ id: "m4", conversationId: "conv-2", receivedAt: "2026-08-01T09:00:00.000Z", messageText: "other" }),
      heldEvent({ id: "m5", conversationId: null, receivedAt: "2026-08-01T09:00:00.000Z", messageText: "orphan" }),
    ],
  });

  const first = previews.get("conv-1");
  assert.equal(first?.count, 3);
  assert.deepEqual(
    first?.messages.map((message) => message.id),
    ["m3", "m2"],
  );
  assert.equal(first?.messages[0]?.textBody, "third");
  assert.equal(previews.get("conv-2")?.count, 1);
  assert.equal(previews.has("null"), false);
  assert.equal(previews.size, 2);
});

test("buildWhatsappHeldMessagePreviews keeps only held-untrusted whatsapp events", () => {
  const previews = buildWhatsappHeldMessagePreviews({
    events: [
      heldEvent({ id: "kept", conversationId: "conv-1", receivedAt: "2026-08-01T10:00:00.000Z", messageText: "hello" }),
      heldEvent({
        id: "released",
        conversationId: "conv-1",
        receivedAt: "2026-08-01T11:00:00.000Z",
        messageText: "released",
        metadata: {
          messageType: "text",
          trustGate: { status: "released_after_trust", reason: "source_trusted" },
        },
      }),
      heldEvent({
        id: "classified",
        conversationId: "conv-1",
        receivedAt: "2026-08-01T12:00:00.000Z",
        messageText: "classified",
        status: "classified",
      }),
      heldEvent({
        id: "email",
        conversationId: "conv-1",
        receivedAt: "2026-08-01T13:00:00.000Z",
        messageText: "email",
        provider: "mailersend",
      }),
    ],
  });

  assert.deepEqual(
    previews.get("conv-1")?.messages.map((message) => message.id),
    ["kept"],
  );
});

test("buildWhatsappHeldMessagePreviews surfaces sender and media details", () => {
  const previews = buildWhatsappHeldMessagePreviews({
    events: [
      heldEvent({
        id: "media-1",
        conversationId: "conv-1",
        receivedAt: "2026-08-01T10:00:00.000Z",
        messageText: null,
        externalParticipantKey: "5210000000000@s.whatsapp.net",
        metadata: {
          messageType: "image",
          senderName: "Demo Driver A",
          media: { kind: "image", caption: "Guia firmada" },
          trustGate: { status: "held_untrusted", reason: "source_untrusted", heldAt: "2026-08-01T10:00:00.000Z" },
        },
      }),
    ],
  });

  const message = previews.get("conv-1")?.messages[0];
  assert.equal(message?.textBody, null);
  assert.equal(message?.senderName, "Demo Driver A");
  assert.equal(message?.senderKey, "5210000000000@s.whatsapp.net");
  assert.equal(message?.messageType, "image");
  assert.equal(message?.mediaKind, "image");
  assert.equal(message?.mediaCaption, "Guia firmada");
  assert.equal(message?.receivedAt, "2026-08-01T10:00:00.000Z");
});

test("attachWhatsappHeldMessages fills matching sources and leaves the rest empty", () => {
  const attached = attachWhatsappHeldMessages(
    [source({ id: "conv-1", status: "unclaimed" }), source({ id: "conv-2", status: "unclaimed" })],
    buildWhatsappHeldMessagePreviews({
      events: [
        heldEvent({ id: "m1", conversationId: "conv-1", receivedAt: "2026-08-01T10:00:00.000Z", messageText: "hola" }),
      ],
    }),
  );

  assert.equal(attached[0]?.heldMessageCount, 1);
  assert.equal(attached[0]?.heldMessages[0]?.textBody, "hola");
  assert.equal(attached[1]?.heldMessageCount, 0);
  assert.deepEqual(attached[1]?.heldMessages, []);
});

test("whatsappSenderMatchesPhone handles 52 and 521 Mexico phone variants", () => {
  assert.equal(
    whatsappSenderMatchesPhone({
      externalParticipantKey: "90000000000002@lid",
      conversationMetadata: {
        participants: [
          {
            participantKey: "90000000000002@lid",
            phoneNumber: "520000000003",
            normalizedPhoneNumber: "520000000003",
          },
        ],
      },
      phoneNumber: "5210000000003",
    }),
    true,
  );
});
