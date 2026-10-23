import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { timestamps } from "@/lib/db/schema/shared";

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "suspended", "trial"]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);
export const workspaceInviteStatusEnum = pgEnum("workspace_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export const userRoleEnum = pgEnum("user_role", ["admin", "operator", "finance", "viewer"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    defaultLocale: varchar("default_locale", { length: 16 }).default("es-MX").notNull(),
    timezone: varchar("timezone", { length: 64 }).default("America/Mexico_City").notNull(),
    status: workspaceStatusEnum("status").default("trial").notNull(),
    active: boolean("active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    slugIdx: uniqueIndex("tenants_slug_idx").on(table.slug),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authProvider: varchar("auth_provider", { length: 64 }).notNull(),
    authSubject: varchar("auth_subject", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: text("full_name"),
    preferredLocale: varchar("preferred_locale", { length: 16 }).default("es-MX").notNull(),
    active: boolean("active").default(true).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    authSubjectIdx: uniqueIndex("users_provider_subject_idx").on(table.authProvider, table.authSubject),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: userRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").default("invited").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.userId] }),
  }),
);

export const workspaceInvites = pgTable("workspace_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  email: varchar("email", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull(),
  status: workspaceInviteStatusEnum("status").default("pending").notNull(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  actorType: varchar("actor_type", { length: 64 }).default("system").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  summary: text("summary"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
