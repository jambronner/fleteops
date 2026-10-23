// Synthetic fixtures only: reserved NANP 202-555-01xx contacts; Mexico normalization
// uses deliberately invalid all-zero subscriber prefixes. Never send or dial these identifiers.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDiscardedWhatsappMessageUpdate,
  buildHeldWhatsappMessageMetadata,
  buildReleasedWhatsappMessageMetadata,
  buildSuppressedWhatsappMessageMetadata,
  shouldReplayHeldWhatsappEvent,
} from "./held-intake";

const heldAt = "2026-05-08T15:00:00.000Z";

test("buildHeldWhatsappMessageMetadata stores an untrusted WhatsApp message for later replay", () => {
  const metadata = buildHeldWhatsappMessageMetadata({
    heldAt,
    message: {
      sourceProvider: "evolution",
      externalMessageId: "evolution:demo-freight-local-01:MSG-1",
      externalChannelId: "evolution:demo-freight-local-01",
      externalConversationId: "5210000000002@s.whatsapp.net",
      externalParticipantKey: "5210000000002@s.whatsapp.net",
      conversationDisplayName: "Demo Contact A",
      senderName: "Demo Contact A",
      textBody: "Nueva ruta PO SMOKE-DM-UNCLAIMED-0508",
      messageType: "conversation",
      sentAt: "12025550104",
      media: null,
      raw: { event: "messages.upsert" },
    },
    routing: {
      tenantId: "tenant-1",
      channelId: "channel-1",
      conversationId: "conversation-1",
      conversationStatus: "needs_claim",
    },
  });

  assert.deepEqual(metadata.trustGate, {
    status: "held_untrusted",
    reason: "source_untrusted",
    heldAt,
  });
  assert.equal(metadata.heldWhatsappMessage.externalMessageId, "evolution:demo-freight-local-01:MSG-1");
  assert.equal(metadata.routing.conversationStatus, "needs_claim");
});

test("shouldReplayHeldWhatsappEvent only replays unreleased held WhatsApp messages", () => {
  assert.equal(
    shouldReplayHeldWhatsappEvent({
      provider: "whatsapp",
      status: "received",
      metadata: {
        trustGate: {
          status: "held_untrusted",
        },
      },
    }),
    true,
  );

  assert.equal(
    shouldReplayHeldWhatsappEvent({
      provider: "whatsapp",
      status: "classified",
      metadata: {
        trustGate: {
          status: "released_after_trust",
        },
      },
    }),
    false,
  );
});

test("buildReleasedWhatsappMessageMetadata preserves the held timestamp and marks replay", () => {
  const metadata = buildReleasedWhatsappMessageMetadata({
    existingMetadata: {
      trustGate: {
        status: "held_untrusted",
        reason: "source_untrusted",
        heldAt,
      },
      heldWhatsappMessage: {
        externalMessageId: "evolution:demo-freight-local-01:MSG-1",
      },
    },
    releasedAt: "2026-05-08T15:02:00.000Z",
    classification: {
      classification: "route_request",
      action: "create_route",
      confidence: 0.91,
      needsReview: false,
      rationale: "Route request.",
      clues: {},
      target: {},
      updates: {},
    },
  });

  assert.deepEqual(metadata.trustGate, {
    status: "released_after_trust",
    reason: "source_trusted",
    heldAt,
    releasedAt: "2026-05-08T15:02:00.000Z",
  });
  assert.equal("heldWhatsappMessage" in metadata, false);
  assert.equal(metadata.classification.action, "create_route");
});

test("buildDiscardedWhatsappMessageUpdate keeps audit metadata but redacts replayable payload", () => {
  const update = buildDiscardedWhatsappMessageUpdate({
    existingMetadata: {
      sourceProvider: "evolution",
      trustGate: {
        status: "held_untrusted",
        reason: "source_untrusted",
        heldAt,
      },
      heldWhatsappMessage: {
        externalMessageId: "evolution:demo-freight-local-01:MSG-1",
        textBody: "Nueva ruta PO SHOULD-NOT-REPLAY",
        raw: { message: { conversation: "Nueva ruta PO SHOULD-NOT-REPLAY" } },
      },
    },
    status: "blocked",
    discardedAt: "2026-05-08T15:03:00.000Z",
  });

  assert.equal(update.messageText, null);
  assert.equal(update.rawPayload, null);
  assert.equal("heldWhatsappMessage" in update.metadata, false);
  assert.deepEqual(update.metadata.trustGate, {
    status: "blocked",
    reason: "source_blocked",
    heldAt,
    discardedAt: "2026-05-08T15:03:00.000Z",
  });
});

test("buildSuppressedWhatsappMessageMetadata audits blocked traffic without storing replay payload", () => {
  const metadata = buildSuppressedWhatsappMessageMetadata({
    suppressedAt: "2026-05-08T15:04:00.000Z",
    status: "ignored",
    message: {
      sourceProvider: "evolution",
      externalMessageId: "evolution:demo-freight-local-01:MSG-2",
      externalChannelId: "evolution:demo-freight-local-01",
      externalConversationId: "5210000000002@s.whatsapp.net",
      externalParticipantKey: "5210000000002@s.whatsapp.net",
      senderName: "Blocked Sender",
      textBody: "Spam route request",
      messageType: "conversation",
      raw: { message: { conversation: "Spam route request" } },
    },
    routing: {
      tenantId: "tenant-1",
      channelId: "channel-1",
      conversationId: "conversation-1",
      conversationStatus: "needs_claim",
    },
  });

  assert.equal("heldWhatsappMessage" in metadata, false);
  assert.equal("textBody" in metadata, false);
  assert.deepEqual(metadata.trustGate, {
    status: "ignored",
    reason: "source_ignored",
    suppressedAt: "2026-05-08T15:04:00.000Z",
  });
});
