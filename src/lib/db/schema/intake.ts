import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tenants, users } from "@/lib/db/schema/platform";
import { timestamps } from "@/lib/db/schema/shared";

export const intakeProviderEnum = pgEnum("intake_provider", ["email_routing", "mailersend", "agentmail", "whatsapp"]);
export const intakeChannelKindEnum = pgEnum("intake_channel_kind", ["email_inbox", "whatsapp_number"]);
export const intakeChannelStatusEnum = pgEnum("intake_channel_status", ["pending", "active", "disabled"]);
export const intakeConversationStatusEnum = pgEnum("intake_conversation_status", [
  "unclaimed",
  "active",
  "ignored",
  "blocked",
]);
export const intakeEventStatusEnum = pgEnum("intake_event_status", [
  "received",
  "routed",
  "classified",
  "needs_review",
  "failed",
]);
export const intakeClassificationEnum = pgEnum("intake_classification", [
  "route_request",
  "carrier_invoice",
  "delivery_evidence",
  "other",
]);

export const inboundChannels = pgTable(
  "inbound_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    provider: intakeProviderEnum("provider").notNull(),
    channelKind: intakeChannelKindEnum("channel_kind").notNull(),
    status: intakeChannelStatusEnum("status").default("pending").notNull(),
    label: text("label"),
    externalChannelId: varchar("external_channel_id", { length: 255 }).notNull(),
    address: varchar("address", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 32 }),
    isShared: boolean("is_shared").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    providerExternalIdx: uniqueIndex("inbound_channels_provider_external_idx").on(
      table.provider,
      table.externalChannelId,
    ),
  }),
);

export const inboundConversations = pgTable(
  "inbound_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => inboundChannels.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    externalConversationId: varchar("external_conversation_id", { length: 255 }).notNull(),
    externalParticipantKey: varchar("external_participant_key", { length: 255 }),
    status: intakeConversationStatusEnum("status").default("unclaimed").notNull(),
    displayName: text("display_name"),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    channelConversationIdx: uniqueIndex("inbound_conversations_channel_conversation_idx").on(
      table.channelId,
      table.externalConversationId,
    ),
  }),
);

export const intakeEvents = pgTable(
  "intake_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    channelId: uuid("channel_id").references(() => inboundChannels.id),
    conversationId: uuid("conversation_id").references(() => inboundConversations.id),
    provider: intakeProviderEnum("provider").notNull(),
    status: intakeEventStatusEnum("status").default("received").notNull(),
    classification: intakeClassificationEnum("classification"),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    externalConversationId: varchar("external_conversation_id", { length: 255 }),
    externalParticipantKey: varchar("external_participant_key", { length: 255 }),
    subject: text("subject"),
    messageText: text("message_text"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    routedAt: timestamp("routed_at", { withTimezone: true }),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    providerEventIdx: uniqueIndex("intake_events_provider_event_idx").on(
      table.provider,
      table.externalEventId,
    ),
  }),
);
