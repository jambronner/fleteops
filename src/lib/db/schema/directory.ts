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

import { organizations } from "@/lib/db/schema/logistics";
import { tenants } from "@/lib/db/schema/platform";
import { timestamps } from "@/lib/db/schema/shared";

export const externalParticipantRoleEnum = pgEnum("external_participant_role", [
  "driver",
  "carrier_ops",
  "shipper_ops",
  "customer_contact",
  "retailer_contact",
  "other",
]);

export const externalParticipantChannelEnum = pgEnum("external_participant_channel", [
  "whatsapp",
  "phone",
  "email",
  "other",
]);

export const externalParticipants = pgTable("external_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  organizationName: text("organization_name"),
  fullName: text("full_name"),
  displayName: text("display_name"),
  phoneNumber: varchar("phone_number", { length: 32 }),
  role: externalParticipantRoleEnum("role").default("other").notNull(),
  language: varchar("language", { length: 16 }).default("es-MX").notNull(),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const externalParticipantPhoneNumbers = pgTable(
  "external_participant_phone_numbers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    externalParticipantId: uuid("external_participant_id")
      .notNull()
      .references(() => externalParticipants.id),
    channel: externalParticipantChannelEnum("channel").default("whatsapp").notNull(),
    phoneNumber: varchar("phone_number", { length: 32 }).notNull(),
    normalizedPhoneNumber: varchar("normalized_phone_number", { length: 32 }).notNull(),
    label: varchar("label", { length: 64 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    normalizedPhoneIdx: uniqueIndex("external_participant_phone_numbers_tenant_phone_idx").on(
      table.tenantId,
      table.normalizedPhoneNumber,
    ),
  }),
);
