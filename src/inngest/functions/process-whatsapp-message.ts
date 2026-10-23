import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { classifyInboundIntake } from "@/lib/ai/intake";
import { db } from "@/lib/db/client";
import { inboundChannels, inboundConversations, intakeEvents } from "@/lib/db/schema";
import { maybeHandleRouteActionFromIntake } from "@/lib/intake/route-actions";
import { resolveInboundTenant } from "@/lib/intake/routing";
import {
  buildDiscardedWhatsappMessageUpdate,
  buildHeldWhatsappMessageMetadata,
  buildReleasedWhatsappMessageMetadata,
  buildSuppressedWhatsappMessageMetadata,
  readHeldWhatsappMessage,
  shouldReplayHeldWhatsappEvent,
} from "@/lib/whatsapp/held-intake";
import { persistWhatsappMediaDocument } from "@/lib/whatsapp/media-intake";
import {
  hasTrustedWhatsappSender,
  normalizeWhatsappIdentifierPhone,
  whatsappPhoneNumberCandidates,
  whatsappSenderMatchesPhone,
} from "@/lib/whatsapp/sources";
import { inngest } from "@/inngest/client";

const whatsappMessageSchema = z.object({
  sourceProvider: z.enum(["meta_cloud", "evolution"]).optional(),
  externalMessageId: z.string(),
  externalChannelId: z.string().optional(),
  externalConversationId: z.string().optional(),
  externalParticipantKey: z.string().optional(),
  conversationDisplayName: z.string().optional(),
  fromPhoneNumber: z.string().optional(),
  displayPhoneNumber: z.string().optional(),
  phoneNumberId: z.string().optional(),
  profileName: z.string().optional(),
  participantName: z.string().optional(),
  groupName: z.string().optional(),
  fromMe: z.boolean().optional(),
  sentAt: z.string().optional(),
  messageType: z.string(),
  textBody: z.string().optional(),
  media: z
    .object({
      kind: z.string(),
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
      caption: z.string().optional(),
    })
    .nullable()
    .optional(),
  raw: z.record(z.string(), z.unknown()),
});

const whatsappEventSchema = z.object({
  messages: z.array(whatsappMessageSchema),
});

type WhatsappEvent = z.infer<typeof whatsappEventSchema>;
type WhatsappMessage = z.infer<typeof whatsappMessageSchema>;
type IntakeEventInsert = typeof intakeEvents.$inferInsert;

function parseWhatsappTimestamp(value?: string | null) {
  if (!value) {
    return new Date();
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return new Date(numericValue > 9999999999 ? numericValue : numericValue * 1000);
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function routingSnapshot(message: {
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
}) {
  return {
    tenantId: message.routing.tenantId,
    channelId: message.routing.channel?.id ?? null,
    conversationId: message.routing.conversation?.id ?? null,
    conversationStatus: message.routing.conversationStatus,
  };
}

function shouldHoldUntrustedWhatsappMessage(message: {
  isTrustedSource: boolean;
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
}) {
  if (message.isTrustedSource || !message.routing.tenantId || !message.routing.channel || !message.routing.conversation) {
    return false;
  }

  return !["blocked", "ignored"].includes(message.routing.conversation.status);
}

function suppressedSourceStatus(message: {
  isTrustedSource: boolean;
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
}) {
  if (message.isTrustedSource || !message.routing.conversation) {
    return null;
  }

  const status = message.routing.conversation.status;
  return status === "blocked" || status === "ignored" ? status : null;
}

function buildHeldWhatsappIntakeEventRow(message: {
  sourceProvider: "meta_cloud" | "evolution";
  externalMessageId: string;
  externalChannelId: string;
  externalConversationId: string | null;
  externalParticipantKey: string | null;
  conversationDisplayName: string | null;
  senderName: string | null;
  textBody: string | null;
  messageType: string;
  sentAt: string | null;
  media: WhatsappMessage["media"] | null;
  raw: Record<string, unknown>;
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
}): IntakeEventInsert {
  const heldAt = new Date().toISOString();

  return {
    tenantId: message.routing.tenantId,
    channelId: message.routing.channel?.id ?? null,
    conversationId: message.routing.conversation?.id ?? null,
    provider: "whatsapp",
    status: "received",
    classification: null,
    externalEventId: message.externalMessageId,
    externalConversationId: message.externalConversationId,
    externalParticipantKey: message.externalParticipantKey,
    messageText: message.textBody,
    receivedAt: parseWhatsappTimestamp(message.sentAt),
    routedAt: message.routing.channel ? new Date() : null,
    classifiedAt: null,
    rawPayload: message.raw,
    metadata: buildHeldWhatsappMessageMetadata({
      heldAt,
      message: {
        sourceProvider: message.sourceProvider,
        externalMessageId: message.externalMessageId,
        externalChannelId: message.externalChannelId,
        externalConversationId: message.externalConversationId,
        externalParticipantKey: message.externalParticipantKey,
        conversationDisplayName: message.conversationDisplayName,
        senderName: message.senderName,
        textBody: message.textBody,
        messageType: message.messageType,
        sentAt: message.sentAt,
        media: message.media,
        raw: message.raw,
      },
      routing: routingSnapshot(message),
      reason: message.routing.conversationStatus === "active" ? "sender_untrusted" : "source_untrusted",
    }),
  };
}

function buildSuppressedWhatsappIntakeEventRow(message: {
  sourceProvider: "meta_cloud" | "evolution";
  externalMessageId: string;
  externalChannelId: string;
  externalConversationId: string | null;
  externalParticipantKey: string | null;
  conversationDisplayName: string | null;
  senderName: string | null;
  textBody: string | null;
  messageType: string;
  sentAt: string | null;
  media: WhatsappMessage["media"] | null;
  raw: Record<string, unknown>;
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
  suppressedStatus: "blocked" | "ignored";
}): IntakeEventInsert {
  return {
    tenantId: message.routing.tenantId,
    channelId: message.routing.channel?.id ?? null,
    conversationId: message.routing.conversation?.id ?? null,
    provider: "whatsapp",
    status: "received",
    classification: null,
    externalEventId: message.externalMessageId,
    externalConversationId: message.externalConversationId,
    externalParticipantKey: message.externalParticipantKey,
    messageText: null,
    receivedAt: parseWhatsappTimestamp(message.sentAt),
    routedAt: message.routing.channel ? new Date() : null,
    classifiedAt: null,
    rawPayload: null,
    metadata: buildSuppressedWhatsappMessageMetadata({
      suppressedAt: new Date().toISOString(),
      status: message.suppressedStatus,
      message: {
        sourceProvider: message.sourceProvider,
        externalMessageId: message.externalMessageId,
        externalChannelId: message.externalChannelId,
        externalConversationId: message.externalConversationId,
        externalParticipantKey: message.externalParticipantKey,
        conversationDisplayName: message.conversationDisplayName,
        senderName: message.senderName,
        textBody: message.textBody,
        messageType: message.messageType,
        sentAt: message.sentAt,
        media: message.media,
        raw: message.raw,
      },
      routing: routingSnapshot(message),
    }),
  };
}

function buildActionableWhatsappIntakeEventRow(message: {
  sourceProvider: "meta_cloud" | "evolution";
  externalMessageId: string;
  externalConversationId: string | null;
  externalParticipantKey: string | null;
  conversationDisplayName: string | null;
  senderName: string | null;
  textBody: string | null;
  messageType: string;
  sentAt: string | null;
  media: WhatsappMessage["media"] | null;
  raw: Record<string, unknown>;
  routing: Awaited<ReturnType<typeof resolveInboundTenant>>;
  classification: NonNullable<Awaited<ReturnType<typeof classifyInboundIntake>>>;
}): IntakeEventInsert {
  return {
    tenantId: message.routing.tenantId,
    channelId: message.routing.channel?.id ?? null,
    conversationId: message.routing.conversation?.id ?? null,
    provider: "whatsapp",
    status:
      message.routing.conversationStatus === "needs_claim"
        ? "needs_review"
        : message.classification.needsReview
          ? "needs_review"
          : "classified",
    classification: message.classification.classification,
    externalEventId: message.externalMessageId,
    externalConversationId: message.externalConversationId,
    externalParticipantKey: message.externalParticipantKey,
    messageText: message.textBody,
    receivedAt: parseWhatsappTimestamp(message.sentAt),
    routedAt: message.routing.channel ? new Date() : null,
    classifiedAt: new Date(),
    rawPayload: message.raw,
    metadata: {
      sourceProvider: message.sourceProvider,
      messageType: message.messageType,
      media: message.media,
      senderName: message.senderName,
      conversationDisplayName: message.conversationDisplayName,
      routing: routingSnapshot(message),
      classification: message.classification,
    },
  };
}

function restoreHeldWhatsappMessage(args: {
  metadata: unknown;
  externalEventId: string;
  externalConversationId: string | null;
  externalParticipantKey: string | null;
  messageText: string | null;
  rawPayload: Record<string, unknown> | null;
}): WhatsappMessage | null {
  const heldMessage = readHeldWhatsappMessage(args.metadata);

  if (heldMessage) {
    return whatsappMessageSchema.parse(heldMessage);
  }

  return whatsappMessageSchema.parse({
    sourceProvider: "evolution",
    externalMessageId: args.externalEventId,
    externalConversationId: args.externalConversationId ?? undefined,
    externalParticipantKey: args.externalParticipantKey ?? undefined,
    fromPhoneNumber: args.externalParticipantKey ?? undefined,
    messageType: "unknown",
    textBody: args.messageText ?? undefined,
    raw: args.rawPayload ?? {},
  });
}

export async function processWhatsappMessages(payload: WhatsappEvent) {
  const preparedMessages = payload.messages
    .filter((message) => !message.fromMe)
    .map((message) => ({
      sourceProvider: message.sourceProvider ?? "meta_cloud",
      externalMessageId: message.externalMessageId,
      externalChannelId:
        message.externalChannelId ??
        message.phoneNumberId ??
        message.displayPhoneNumber ??
        "unbound-whatsapp-channel",
      externalConversationId:
        message.externalConversationId ??
        message.fromPhoneNumber ??
        null,
      externalParticipantKey:
        message.externalParticipantKey ??
        message.fromPhoneNumber ??
        null,
      conversationDisplayName:
        message.conversationDisplayName ??
        message.groupName ??
        message.profileName ??
        null,
      senderName:
        message.participantName ??
        message.profileName ??
        null,
      textBody: message.textBody ?? null,
      messageType: message.messageType,
      sentAt: message.sentAt ?? null,
      media: message.media ?? null,
      raw: message.raw,
    }));

  const classifiedMessages = await Promise.all(
    preparedMessages.map(async (message) => {
      const routing = await resolveInboundTenant({
        provider: "whatsapp",
        externalChannelId: message.externalChannelId,
        externalConversationId: message.externalConversationId,
        externalParticipantKey: message.externalParticipantKey,
        displayName: message.conversationDisplayName,
        newConversationStatus: "unclaimed",
      });

      const isTrustedSource = await hasTrustedWhatsappSender({
        tenantId: routing.tenantId,
        conversationStatus: routing.conversationStatus,
        externalConversationId: message.externalConversationId,
        externalParticipantKey: message.externalParticipantKey,
      });

      if (!isTrustedSource) {
        return {
          ...message,
          routing,
          classification: null,
          isTrustedSource,
        };
      }

      const classification = await classifyInboundIntake({
        locale: routing.tenantId ? "es-MX" : "en",
        textBody: message.textBody,
        senderName: message.senderName,
        senderAddress: message.externalParticipantKey,
        attachmentNames: message.media?.fileName ? [message.media.fileName] : undefined,
      });

      return {
        ...message,
        routing,
        classification,
        isTrustedSource,
      };
    }),
  );

  if (!db || classifiedMessages.length === 0) {
    return {
      persisted: 0,
      ignored: classifiedMessages.filter((message) => message.classification?.action === "ignore").length,
      needsClaim: classifiedMessages.filter((message) => message.routing.conversationStatus === "needs_claim").length,
      classified: classifiedMessages.length,
      untrusted: classifiedMessages.filter((message) => !message.isTrustedSource).length,
    };
  }

  type ClassifiedMessage = (typeof classifiedMessages)[number];
  type TrustedClassifiedMessage = ClassifiedMessage & {
    classification: NonNullable<ClassifiedMessage["classification"]>;
    isTrustedSource: true;
  };

  const trustedMessages = classifiedMessages.filter(
    (message): message is TrustedClassifiedMessage =>
      Boolean(message.isTrustedSource && message.classification),
  );
  const untrustedMessages = classifiedMessages.length - trustedMessages.length;
  const heldMessages = classifiedMessages.filter(shouldHoldUntrustedWhatsappMessage);
  const heldEventRows = heldMessages.map(buildHeldWhatsappIntakeEventRow);
  const suppressedMessages = classifiedMessages
    .map((message) => {
      const status = suppressedSourceStatus(message);
      return status ? { ...message, suppressedStatus: status } : null;
    })
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  const suppressedEventRows = suppressedMessages.map(buildSuppressedWhatsappIntakeEventRow);
  const insertedHeldEvents = heldEventRows.length
    ? await db
        .insert(intakeEvents)
        .values(heldEventRows)
        .onConflictDoNothing({
          target: [intakeEvents.provider, intakeEvents.externalEventId],
        })
        .returning({
          id: intakeEvents.id,
        })
    : [];
  const insertedSuppressedEvents = suppressedEventRows.length
    ? await db
        .insert(intakeEvents)
        .values(suppressedEventRows)
        .onConflictDoNothing({
          target: [intakeEvents.provider, intakeEvents.externalEventId],
        })
        .returning({
          id: intakeEvents.id,
        })
    : [];
  const actionableMessages = trustedMessages.filter((message) => message.classification.action !== "ignore");
  const ignoredMessages = trustedMessages.length - actionableMessages.length;

  if (actionableMessages.length === 0) {
    return {
      persisted: 0,
      held: insertedHeldEvents.length,
      suppressed: insertedSuppressedEvents.length,
      ignored: ignoredMessages,
      needsClaim: classifiedMessages.filter((message) => message.routing.conversationStatus === "needs_claim").length,
      classified: trustedMessages.length,
      untrusted: untrustedMessages,
      routeDraftsCreated: 0,
      routeDraftsUpdated: 0,
      routeUpdatesApplied: 0,
      routeActionsNeedingReview: 0,
    };
  }

  const eventRows = actionableMessages.map(buildActionableWhatsappIntakeEventRow);

  const insertedEvents = await db
    .insert(intakeEvents)
    .values(eventRows)
    .onConflictDoNothing({
      target: [intakeEvents.provider, intakeEvents.externalEventId],
    })
    .returning({
      id: intakeEvents.id,
      externalEventId: intakeEvents.externalEventId,
    });

  const insertedEventIds = new Map(insertedEvents.map((eventRow) => [eventRow.externalEventId, eventRow.id]));
  const eventRowsByExternalId = new Map(eventRows.map((eventRow) => [eventRow.externalEventId, eventRow]));
  const existingEvents = await db
    .select({
      id: intakeEvents.id,
      externalEventId: intakeEvents.externalEventId,
      provider: intakeEvents.provider,
      status: intakeEvents.status,
      metadata: intakeEvents.metadata,
    })
    .from(intakeEvents)
    .where(
      and(
        eq(intakeEvents.provider, "whatsapp"),
        inArray(intakeEvents.externalEventId, actionableMessages.map((message) => message.externalMessageId)),
      ),
    );
  const intakeEventIds = new Map<string, string>();
  let releasedHeldEvents = 0;

  for (const event of existingEvents) {
    const eventRow = eventRowsByExternalId.get(event.externalEventId);

    if (!eventRow) {
      continue;
    }

    const wasInserted = insertedEventIds.has(event.externalEventId);
    const wasHeld = shouldReplayHeldWhatsappEvent(event);

    if (wasHeld) {
      await db
        .update(intakeEvents)
        .set({
          ...eventRow,
          metadata: buildReleasedWhatsappMessageMetadata({
            existingMetadata: event.metadata,
            releasedAt: new Date().toISOString(),
            classification: actionableMessages.find((message) => message.externalMessageId === event.externalEventId)!
              .classification,
          }),
          updatedAt: new Date(),
        })
        .where(eq(intakeEvents.id, event.id));
      releasedHeldEvents += 1;
    }

    if (wasInserted || wasHeld) {
      intakeEventIds.set(event.externalEventId, event.id);
    }
  }
  let routeDraftsCreated = 0;
  let routeDraftsUpdated = 0;
  let routeUpdatesApplied = 0;
  let routeActionsNeedingReview = 0;
  let evidenceCreated = 0;
  let evidenceDuplicates = 0;
  let evidenceFailed = 0;

  for (const message of actionableMessages) {
    const intakeEventId = intakeEventIds.get(message.externalMessageId);

    if (!intakeEventId || !message.routing.tenantId) {
      continue;
    }

    // Media becomes a stored document with extraction, like an email
    // attachment — otherwise a driver's delivery photo or a carrier's invoice
    // PDF only exists as intake metadata and never counts as evidence.
    if (message.media) {
      const mediaOutcome = await persistWhatsappMediaDocument({
        tenantId: message.routing.tenantId,
        intakeEventId,
        message: {
          sourceProvider: message.sourceProvider,
          externalMessageId: message.externalMessageId,
          externalConversationId: message.externalConversationId,
          conversationDisplayName: message.conversationDisplayName,
          senderName: message.senderName,
          externalParticipantKey: message.externalParticipantKey,
          textBody: message.textBody,
          messageType: message.messageType,
          sentAt: message.sentAt,
          media: message.media,
          raw: message.raw,
        },
        classification: message.classification,
      });

      if (mediaOutcome.status === "created") {
        evidenceCreated += 1;
      } else if (mediaOutcome.status === "skipped_duplicate") {
        evidenceDuplicates += 1;
      } else {
        evidenceFailed += 1;
      }
    }

    const routeAction = await maybeHandleRouteActionFromIntake({
      tenantId: message.routing.tenantId,
      intakeEventId,
      externalEventId: message.externalMessageId,
      externalConversationId: message.externalConversationId,
      sourceChannel: "whatsapp",
      messageText: message.textBody,
      senderName: message.senderName,
      senderAddress: message.externalParticipantKey,
      receivedAt: parseWhatsappTimestamp(message.sentAt).toISOString(),
      classification: message.classification!,
    });

    if (routeAction?.action === "created") {
      routeDraftsCreated += 1;
    } else if (routeAction?.action === "updated") {
      if (message.classification.action === "update_route") {
        routeUpdatesApplied += 1;
      } else {
        routeDraftsUpdated += 1;
      }
    } else if (routeAction?.action === "needs_review") {
      routeActionsNeedingReview += 1;
    }
  }

  return {
    persisted: insertedEvents.length,
    held: insertedHeldEvents.length,
    suppressed: insertedSuppressedEvents.length,
    releasedHeld: releasedHeldEvents,
    duplicatesSkipped: actionableMessages.length - insertedEvents.length - releasedHeldEvents,
    ignored: ignoredMessages,
    needsClaim: classifiedMessages.filter((message) => message.routing.conversationStatus === "needs_claim").length,
    classified: trustedMessages.length,
    untrusted: untrustedMessages,
    routeDraftsCreated,
    routeDraftsUpdated,
    routeUpdatesApplied,
    routeActionsNeedingReview,
    evidenceCreated,
    evidenceDuplicates,
    evidenceFailed,
  };
}

async function getHeldWhatsappEventRowsForSource(args: {
  tenantId: string;
  sourceId: string;
  limit?: number;
  requireActiveSource?: boolean;
}) {
  if (!db) {
    return [];
  }

  const [source] = await db
    .select({
      id: inboundConversations.id,
      tenantId: inboundConversations.tenantId,
      channelTenantId: inboundChannels.tenantId,
      status: inboundConversations.status,
    })
    .from(inboundConversations)
    .innerJoin(inboundChannels, eq(inboundChannels.id, inboundConversations.channelId))
    .where(
      and(
        eq(inboundConversations.id, args.sourceId),
        eq(inboundChannels.provider, "whatsapp"),
        or(eq(inboundChannels.tenantId, args.tenantId), eq(inboundConversations.tenantId, args.tenantId)),
      ),
    )
    .limit(1);

  if (!source || (args.requireActiveSource !== false && source.status !== "active")) {
    return [];
  }

  const rows = await db
    .select({
      id: intakeEvents.id,
      provider: intakeEvents.provider,
      status: intakeEvents.status,
      externalEventId: intakeEvents.externalEventId,
      externalConversationId: intakeEvents.externalConversationId,
      externalParticipantKey: intakeEvents.externalParticipantKey,
      messageText: intakeEvents.messageText,
      rawPayload: intakeEvents.rawPayload,
      metadata: intakeEvents.metadata,
    })
    .from(intakeEvents)
    .where(
      and(
        eq(intakeEvents.tenantId, args.tenantId),
        eq(intakeEvents.provider, "whatsapp"),
        eq(intakeEvents.conversationId, source.id),
        eq(intakeEvents.status, "received"),
      ),
    )
    .orderBy(asc(intakeEvents.receivedAt))
    .limit(args.limit ?? 50);

  return rows.filter(shouldReplayHeldWhatsappEvent);
}

async function getHeldWhatsappEventRowsForParticipant(args: {
  tenantId: string;
  phoneNumber: string;
  limit?: number;
}) {
  if (!db) {
    return [];
  }

  const normalizedPhone = normalizeWhatsappIdentifierPhone(args.phoneNumber);
  const trustedPhoneCandidates = new Set(whatsappPhoneNumberCandidates(args.phoneNumber));

  if (!normalizedPhone || trustedPhoneCandidates.size === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: intakeEvents.id,
      provider: intakeEvents.provider,
      status: intakeEvents.status,
      externalEventId: intakeEvents.externalEventId,
      externalConversationId: intakeEvents.externalConversationId,
      externalParticipantKey: intakeEvents.externalParticipantKey,
      conversationId: intakeEvents.conversationId,
      messageText: intakeEvents.messageText,
      rawPayload: intakeEvents.rawPayload,
      metadata: intakeEvents.metadata,
    })
    .from(intakeEvents)
    .where(
      and(
        eq(intakeEvents.tenantId, args.tenantId),
        eq(intakeEvents.provider, "whatsapp"),
        eq(intakeEvents.status, "received"),
      ),
    )
    .orderBy(asc(intakeEvents.receivedAt))
    .limit(args.limit ?? 100);
  const heldRows = rows.filter(shouldReplayHeldWhatsappEvent);
  const conversationIds = [
    ...new Set(
      heldRows
        .map((row) => row.conversationId)
        .filter((conversationId): conversationId is string => Boolean(conversationId)),
    ),
  ];
  const conversations = conversationIds.length
    ? await db
        .select({
          id: inboundConversations.id,
          metadata: inboundConversations.metadata,
        })
        .from(inboundConversations)
        .where(inArray(inboundConversations.id, conversationIds))
    : [];
  const conversationMetadataById = new Map(
    conversations.map((conversation) => [conversation.id, conversation.metadata]),
  );

  return heldRows
    .filter((row) => whatsappSenderMatchesPhone({
      externalParticipantKey: row.externalParticipantKey,
      conversationMetadata: row.conversationId
        ? conversationMetadataById.get(row.conversationId) ?? null
        : null,
      phoneNumber: args.phoneNumber,
    }))
    .slice(0, args.limit ?? 50);
}

async function replayHeldWhatsappEventRows(
  rows: Awaited<ReturnType<typeof getHeldWhatsappEventRowsForSource>>,
) {
  const messages = rows
    .map((row) => restoreHeldWhatsappMessage(row))
    .filter((message): message is WhatsappMessage => Boolean(message));

  if (messages.length === 0) {
    return {
      replayed: 0,
      result: null,
    };
  }

  const result = await processWhatsappMessages({ messages });

  return {
    replayed: messages.length,
    result,
  };
}

export async function processHeldWhatsappMessagesForSource(args: {
  tenantId: string;
  sourceId: string;
  limit?: number;
}) {
  const rows = await getHeldWhatsappEventRowsForSource(args);
  return replayHeldWhatsappEventRows(rows);
}

export async function processHeldWhatsappMessagesForParticipant(args: {
  tenantId: string;
  phoneNumber: string;
  limit?: number;
}) {
  const rows = await getHeldWhatsappEventRowsForParticipant(args);
  return replayHeldWhatsappEventRows(rows);
}

export async function discardHeldWhatsappMessagesForSource(args: {
  tenantId: string;
  sourceId: string;
  status: "blocked" | "ignored";
}) {
  if (!db) {
    return {
      discarded: 0,
    };
  }

  const rows = await getHeldWhatsappEventRowsForSource({
    tenantId: args.tenantId,
    sourceId: args.sourceId,
    requireActiveSource: false,
  });
  let discarded = 0;

  for (const row of rows) {
    await db
      .update(intakeEvents)
      .set({
        ...buildDiscardedWhatsappMessageUpdate({
          existingMetadata: row.metadata,
          status: args.status,
          discardedAt: new Date().toISOString(),
        }),
        updatedAt: new Date(),
      })
      .where(eq(intakeEvents.id, row.id));
    discarded += 1;
  }

  return {
    discarded,
  };
}

export const processWhatsappMessage = inngest.createFunction(
  {
    id: "process-whatsapp-message",
    retries: 2,
    triggers: [{ event: "whatsapp/message.received" }],
  },
  async ({ event, step }) => {
    const payload = whatsappEventSchema.parse(event.data);

    return step.run("process-whatsapp-messages", async () => processWhatsappMessages(payload));
  },
);
