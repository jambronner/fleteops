import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { externalParticipants } from "@/lib/db/schema/directory";
import { organizations, shipments } from "@/lib/db/schema/logistics";
import { tenants, users } from "@/lib/db/schema/platform";
import { timestamps } from "@/lib/db/schema/shared";

export const documentTypeEnum = pgEnum("document_type", [
  "customer_po",
  "shipper_po",
  "retailer_receipt",
  "pod",
  "carrier_invoice",
  "broker_invoice",
  "vendor_invoice",
  "credit_note",
  "photo",
  "voice_note",
  "pdf",
  "spreadsheet_import",
  "other",
]);

export const sourceChannelEnum = pgEnum("source_channel", [
  "whatsapp",
  "email",
  "upload",
  "manual",
  "api",
  "spreadsheet_import",
]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "needs_review",
]);

export const extractionRunStatusEnum = pgEnum("document_extraction_run_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "needs_review",
]);

export const extractionProviderEnum = pgEnum("extraction_provider", [
  "docling",
  "openrouter_vision",
  "manual",
]);

export const extractionTriggerEnum = pgEnum("extraction_trigger", [
  "upload",
  "whatsapp_ingest",
  "email_ingest",
  "manual_retry",
  "operator_request",
  "workflow",
]);

export const extractionStrategyEnum = pgEnum("extraction_strategy", [
  "native_parse",
  "ocr_parse",
  "vision_extract",
]);

export const documentInputClassEnum = pgEnum("document_input_class", [
  "digital_document",
  "scanned_document",
  "photo",
  "spreadsheet",
  "audio",
  "other",
]);

export const linkTargetTypeEnum = pgEnum("link_target_type", [
  "purchase_order",
  "shipment",
  "invoice",
  "payment",
  "reconciliation_case",
  "exception",
  "import_batch",
]);

export const linkRoleEnum = pgEnum("link_role", [
  "supports",
  "generated_from",
  "evidence_for",
  "supersedes",
  "references",
]);

export const threadTypeEnum = pgEnum("thread_type", [
  "driver_group",
  "carrier_ops",
  "customer",
  "internal",
  "other",
]);

export const threadParticipantTypeEnum = pgEnum("thread_participant_type", [
  "internal_user",
  "external_participant",
  "unknown",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "audio",
  "document",
  "video",
  "template",
  "other",
]);

export const factTypeEnum = pgEnum("fact_type", [
  "po_number",
  "invoice_number",
  "shipment_reference",
  "delivery_date",
  "receiver_name",
  "store_name",
  "qty_expected",
  "qty_delivered",
  "qty_rejected",
  "amount_total",
  "other",
]);

export const documentArtifactTypeEnum = pgEnum("document_artifact_type", [
  "ocr_text",
  "markdown",
  "layout_json",
  "provider_raw",
  "normalized_text",
  "preview_image",
]);

export const artifactStorageTypeEnum = pgEnum("artifact_storage_type", [
  "inline_text",
  "inline_json",
  "object_storage",
  "external_url",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  documentType: documentTypeEnum("document_type").notNull(),
  sourceChannel: sourceChannelEnum("source_channel").notNull(),
  issuingOrgId: uuid("issuing_org_id").references(() => organizations.id),
  receivingOrgId: uuid("receiving_org_id").references(() => organizations.id),
  fileUrl: text("file_url"),
  originalFileName: text("original_file_name"),
  documentNumber: varchar("document_number", { length: 128 }),
  documentDate: date("document_date"),
  mimeType: varchar("mime_type", { length: 128 }),
  language: varchar("language", { length: 16 }).default("es-MX"),
  ocrText: text("ocr_text"),
  extractionStatus: extractionStatusEnum("extraction_status").default("pending").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
  archiveReason: text("archive_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const documentLinks = pgTable("document_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  targetType: linkTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  linkRole: linkRoleEnum("link_role").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  notes: text("notes"),
  ...timestamps,
});

export const whatsappThreads = pgTable("whatsapp_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  counterpartyOrgId: uuid("counterparty_org_id").references(() => organizations.id),
  phoneNumber: varchar("phone_number", { length: 32 }),
  externalThreadId: varchar("external_thread_id", { length: 255 }),
  threadType: threadTypeEnum("thread_type").default("other").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const whatsappThreadParticipants = pgTable("whatsapp_thread_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => whatsappThreads.id),
  participantType: threadParticipantTypeEnum("participant_type").default("unknown").notNull(),
  externalParticipantId: uuid("external_participant_id").references(() => externalParticipants.id),
  userId: uuid("user_id").references(() => users.id),
  displayName: text("display_name"),
  phoneNumber: varchar("phone_number", { length: 32 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  threadId: uuid("thread_id").references(() => whatsappThreads.id),
  externalMessageId: varchar("external_message_id", { length: 255 }),
  senderParticipantId: uuid("sender_participant_id").references(() => whatsappThreadParticipants.id),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  messageType: messageTypeEnum("message_type").notNull(),
  textBody: text("text_body"),
  language: varchar("language", { length: 16 }).default("es-MX"),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const messageAttachments = pgTable("message_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  ...timestamps,
});

export const documentExtractionRuns = pgTable("document_extraction_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  provider: extractionProviderEnum("provider").notNull(),
  model: varchar("model", { length: 128 }),
  status: extractionRunStatusEnum("status").default("queued").notNull(),
  trigger: extractionTriggerEnum("trigger").default("workflow").notNull(),
  strategy: extractionStrategyEnum("strategy").notNull(),
  inputClass: documentInputClassEnum("input_class").notNull(),
  attempt: integer("attempt").default(1).notNull(),
  isFallbackRun: boolean("is_fallback_run").default(false).notNull(),
  shouldFallbackToVision: boolean("should_fallback_to_vision").default(false).notNull(),
  fallbackFromRunId: uuid("fallback_from_run_id"),
  confidenceOverall: decimal("confidence_overall", { precision: 5, scale: 4 }),
  routingDecision: text("routing_decision"),
  errorCode: varchar("error_code", { length: 64 }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const documentArtifacts = pgTable("document_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  extractionRunId: uuid("extraction_run_id")
    .notNull()
    .references(() => documentExtractionRuns.id),
  artifactType: documentArtifactTypeEnum("artifact_type").notNull(),
  storageType: artifactStorageTypeEnum("storage_type").notNull(),
  mimeType: varchar("mime_type", { length: 128 }),
  language: varchar("language", { length: 16 }).default("es-MX"),
  fileUrl: text("file_url"),
  textContent: text("text_content"),
  jsonContent: jsonb("json_content").$type<Record<string, unknown>>(),
  byteSize: integer("byte_size"),
  pageFrom: integer("page_from"),
  pageTo: integer("page_to"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const extractedFacts = pgTable("extracted_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  extractionRunId: uuid("extraction_run_id").references(() => documentExtractionRuns.id),
  sourceArtifactId: uuid("source_artifact_id").references(() => documentArtifacts.id),
  factType: factTypeEnum("fact_type").notNull(),
  valueText: text("value_text"),
  valueNumber: decimal("value_number", { precision: 14, scale: 3 }),
  valueDate: date("value_date"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  sourceProvider: extractionProviderEnum("source_provider"),
  sourceModel: varchar("source_model", { length: 128 }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});
