import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { inboundChannels, inboundConversations } from "@/lib/db/schema";

type InboundChannelRecord = typeof inboundChannels.$inferSelect;
type InboundConversationRecord = typeof inboundConversations.$inferSelect;
type IntakeProvider = InboundChannelRecord["provider"];

function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL is required for intake routing persistence.");
  }

  return db;
}

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildInboundConversationId(args: {
  externalConversationId?: string | null;
  externalParticipantKey?: string | null;
}) {
  return cleanNullable(args.externalConversationId) ?? cleanNullable(args.externalParticipantKey) ?? null;
}

export async function findInboundChannelByExternalId(args: {
  provider: IntakeProvider;
  externalChannelId: string;
}) {
  const database = requireDb();
  const [channel] = await database
    .select()
    .from(inboundChannels)
    .where(
      and(
        eq(inboundChannels.provider, args.provider),
        eq(inboundChannels.externalChannelId, args.externalChannelId),
      ),
    )
    .limit(1);

  return channel ?? null;
}

export async function findInboundConversation(args: {
  channelId: string;
  externalConversationId: string;
}) {
  const database = requireDb();
  const [conversation] = await database
    .select()
    .from(inboundConversations)
    .where(
      and(
        eq(inboundConversations.channelId, args.channelId),
        eq(inboundConversations.externalConversationId, args.externalConversationId),
      ),
    )
    .limit(1);

  return conversation ?? null;
}

export async function ensureInboundConversation(args: {
  channel: InboundChannelRecord;
  externalConversationId: string;
  externalParticipantKey?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
  status?: InboundConversationRecord["status"];
}) {
  const database = requireDb();
  const existingConversation = await findInboundConversation({
    channelId: args.channel.id,
    externalConversationId: args.externalConversationId,
  });

  if (existingConversation) {
    await database
      .update(inboundConversations)
      .set({
        externalParticipantKey: cleanNullable(args.externalParticipantKey) ?? existingConversation.externalParticipantKey,
        displayName: cleanNullable(args.displayName) ?? existingConversation.displayName,
        tenantId: existingConversation.tenantId ?? cleanNullable(args.tenantId),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inboundConversations.id, existingConversation.id));

    return {
      ...existingConversation,
      externalParticipantKey: cleanNullable(args.externalParticipantKey) ?? existingConversation.externalParticipantKey,
      displayName: cleanNullable(args.displayName) ?? existingConversation.displayName,
      tenantId: existingConversation.tenantId ?? cleanNullable(args.tenantId),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    } satisfies InboundConversationRecord;
  }

  const [conversation] = await database
    .insert(inboundConversations)
    .values({
      channelId: args.channel.id,
      tenantId: cleanNullable(args.tenantId) ?? args.channel.tenantId,
      externalConversationId: args.externalConversationId,
      externalParticipantKey: cleanNullable(args.externalParticipantKey),
      displayName: cleanNullable(args.displayName),
      status: args.status ?? (args.channel.tenantId || args.tenantId ? "active" : "unclaimed"),
    })
    .returning();

  return conversation;
}

export async function resolveInboundTenant(args: {
  provider: IntakeProvider;
  externalChannelId: string;
  externalConversationId?: string | null;
  externalParticipantKey?: string | null;
  displayName?: string | null;
  newConversationStatus?: InboundConversationRecord["status"];
}) {
  const channel = await findInboundChannelByExternalId({
    provider: args.provider,
    externalChannelId: args.externalChannelId,
  });

  if (!channel) {
    return {
      channel: null,
      conversation: null,
      tenantId: null,
      conversationStatus: "unrouted" as const,
    };
  }

  const derivedConversationId = buildInboundConversationId({
    externalConversationId: args.externalConversationId,
    externalParticipantKey: args.externalParticipantKey,
  });

  if (!derivedConversationId) {
    return {
      channel,
      conversation: null,
      tenantId: channel.tenantId ?? null,
      conversationStatus: channel.tenantId ? ("active" as const) : ("needs_claim" as const),
    };
  }

  const conversation = await ensureInboundConversation({
    channel,
    externalConversationId: derivedConversationId,
    externalParticipantKey: args.externalParticipantKey,
    displayName: args.displayName,
    status: args.newConversationStatus,
  });

  return {
    channel,
    conversation,
    tenantId: conversation.tenantId ?? channel.tenantId ?? null,
    conversationStatus:
      conversation.status === "active" && (conversation.tenantId ?? channel.tenantId)
        ? ("active" as const)
        : ("needs_claim" as const),
  };
}
