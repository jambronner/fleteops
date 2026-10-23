import type { IntakeClassificationResult } from "@/lib/ai/intake";

type JsonRecord = Record<string, unknown>;

export type HeldWhatsappMessageSnapshot = {
  sourceProvider?: "meta_cloud" | "evolution";
  externalMessageId: string;
  externalChannelId?: string | null;
  externalConversationId?: string | null;
  externalParticipantKey?: string | null;
  conversationDisplayName?: string | null;
  senderName?: string | null;
  textBody?: string | null;
  messageType: string;
  sentAt?: string | null;
  media?: {
    kind: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  } | null;
  raw: JsonRecord;
};

export type WhatsappRoutingSnapshot = {
  tenantId: string | null;
  channelId: string | null;
  conversationId: string | null;
  conversationStatus: string;
};

export type HeldWhatsappMetadata = {
  sourceProvider?: "meta_cloud" | "evolution";
  messageType: string;
  media?: HeldWhatsappMessageSnapshot["media"];
  senderName?: string | null;
  conversationDisplayName?: string | null;
  routing: WhatsappRoutingSnapshot;
  trustGate: {
    status: "held_untrusted";
    reason: "source_untrusted" | "sender_untrusted";
    heldAt: string;
  };
  heldWhatsappMessage: HeldWhatsappMessageSnapshot;
};

export type SuppressedWhatsappMetadata = {
  sourceProvider?: "meta_cloud" | "evolution";
  messageType: string;
  media?: Omit<NonNullable<HeldWhatsappMessageSnapshot["media"]>, "caption"> | null;
  senderName?: string | null;
  conversationDisplayName?: string | null;
  routing: WhatsappRoutingSnapshot;
  trustGate: {
    status: "blocked" | "ignored";
    reason: "source_blocked" | "source_ignored";
    suppressedAt: string;
  };
};

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTrustGate(value: unknown) {
  return metadataRecord(metadataRecord(value).trustGate);
}

export function getHeldWhatsappTrustGateStatus(metadata: unknown) {
  const status = readTrustGate(metadata).status;
  return typeof status === "string" ? status : null;
}

export function shouldReplayHeldWhatsappEvent(event: {
  provider: string;
  status: string;
  metadata: unknown;
}) {
  return (
    event.provider === "whatsapp" &&
    event.status === "received" &&
    getHeldWhatsappTrustGateStatus(event.metadata) === "held_untrusted"
  );
}

export function buildHeldWhatsappMessageMetadata(args: {
  heldAt: string;
  message: HeldWhatsappMessageSnapshot;
  routing: WhatsappRoutingSnapshot;
  reason?: "source_untrusted" | "sender_untrusted";
}): HeldWhatsappMetadata {
  return {
    sourceProvider: args.message.sourceProvider,
    messageType: args.message.messageType,
    media: args.message.media,
    senderName: args.message.senderName ?? null,
    conversationDisplayName: args.message.conversationDisplayName ?? null,
    routing: args.routing,
    trustGate: {
      status: "held_untrusted",
      reason: args.reason ?? "source_untrusted",
      heldAt: args.heldAt,
    },
    heldWhatsappMessage: args.message,
  };
}

export function buildReleasedWhatsappMessageMetadata(args: {
  existingMetadata: unknown;
  releasedAt: string;
  classification: IntakeClassificationResult;
}) {
  const existingMetadata = metadataRecord(args.existingMetadata);
  const existingTrustGate = readTrustGate(existingMetadata);
  const metadataWithoutHeldMessage = { ...existingMetadata };
  delete metadataWithoutHeldMessage.heldWhatsappMessage;

  return {
    ...metadataWithoutHeldMessage,
    trustGate: {
      status: "released_after_trust",
      reason: "source_trusted",
      heldAt: typeof existingTrustGate.heldAt === "string" ? existingTrustGate.heldAt : null,
      releasedAt: args.releasedAt,
    },
    classification: args.classification,
  };
}

export function buildDiscardedWhatsappMessageMetadata(args: {
  existingMetadata: unknown;
  status: "blocked" | "ignored";
  discardedAt: string;
}) {
  const existingMetadata = metadataRecord(args.existingMetadata);
  const existingTrustGate = readTrustGate(existingMetadata);
  const metadataWithoutHeldMessage = { ...existingMetadata };
  delete metadataWithoutHeldMessage.heldWhatsappMessage;

  return {
    ...metadataWithoutHeldMessage,
    trustGate: {
      status: args.status,
      reason: `source_${args.status}`,
      heldAt: typeof existingTrustGate.heldAt === "string" ? existingTrustGate.heldAt : null,
      discardedAt: args.discardedAt,
    },
  };
}

export function buildDiscardedWhatsappMessageUpdate(args: {
  existingMetadata: unknown;
  status: "blocked" | "ignored";
  discardedAt: string;
}) {
  return {
    messageText: null,
    rawPayload: null,
    metadata: buildDiscardedWhatsappMessageMetadata(args),
  };
}

export function buildSuppressedWhatsappMessageMetadata(args: {
  suppressedAt: string;
  status: "blocked" | "ignored";
  message: HeldWhatsappMessageSnapshot;
  routing: WhatsappRoutingSnapshot;
}): SuppressedWhatsappMetadata {
  return {
    sourceProvider: args.message.sourceProvider,
    messageType: args.message.messageType,
    media: args.message.media
      ? {
          kind: args.message.media.kind,
          mimeType: args.message.media.mimeType,
          fileName: args.message.media.fileName,
        }
      : null,
    senderName: args.message.senderName ?? null,
    conversationDisplayName: args.message.conversationDisplayName ?? null,
    routing: args.routing,
    trustGate: {
      status: args.status,
      reason: `source_${args.status}`,
      suppressedAt: args.suppressedAt,
    },
  };
}

export function readHeldWhatsappMessage(metadata: unknown): HeldWhatsappMessageSnapshot | null {
  const value = metadataRecord(metadata).heldWhatsappMessage;
  const record = metadataRecord(value);

  if (
    typeof record.externalMessageId !== "string" ||
    typeof record.messageType !== "string" ||
    !isJsonRecord(record.raw)
  ) {
    return null;
  }

  return record as HeldWhatsappMessageSnapshot;
}
