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

import { documents, documentTypeEnum } from "@/lib/db/schema/documents";
import { organizations, purchaseOrders, shipments } from "@/lib/db/schema/logistics";
import { tenants, users } from "@/lib/db/schema/platform";
import { timestamps } from "@/lib/db/schema/shared";

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "ar_customer",
  "ap_vendor",
  "ap_carrier",
  "broker_to_shipper",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "blocked",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "submitted",
  "confirmed",
  "failed",
  "cancelled",
]);

export const reconciliationCaseTypeEnum = pgEnum("reconciliation_case_type", [
  "delivery_completion",
  "invoice_release",
  "carrier_payment_release",
  "quantity_exception",
  "document_packet_review",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "pending_docs",
  "ready_for_review",
  "approved",
  "blocked",
  "resolved",
]);

export const requirementStatusEnum = pgEnum("requirement_status", [
  "missing",
  "matched",
  "waived",
  "rejected",
]);

export const exceptionTypeEnum = pgEnum("exception_type", [
  "missing_pod",
  "qty_short",
  "qty_over",
  "wrong_address",
  "invoice_missing",
  "payment_mismatch",
  "late_delivery",
  "other",
]);

export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const resolutionStatusEnum = pgEnum("resolution_status", [
  "open",
  "in_review",
  "resolved",
  "dismissed",
]);
export const reviewTaskStatusEnum = pgEnum("review_task_status", [
  "open",
  "assigned",
  "resolved",
  "dismissed",
]);
export const reviewTaskPriorityEnum = pgEnum("review_task_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "partially_completed",
]);

export const rateCardDirectionEnum = pgEnum("rate_card_direction", ["customer", "carrier"]);

/**
 * Agreed route pricing, both directions: what the broker charges a customer for
 * a route ("customer") and what a carrier charges the broker ("carrier").
 * Match rules are stop-count tiers today (minStops..maxStops, maxStops null =
 * open-ended); a null counterpartyOrgId row is the direction-wide default and
 * an org-specific row outranks it. Resolved amounts feed the reconciliation
 * engine's expected-amount variance check.
 */
export const rateCards = pgTable("rate_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  direction: rateCardDirectionEnum("direction").notNull(),
  counterpartyOrgId: uuid("counterparty_org_id").references(() => organizations.id),
  matchType: varchar("match_type", { length: 32 }).default("stop_count").notNull(),
  minStops: integer("min_stops"),
  maxStops: integer("max_stops"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("MXN").notNull(),
  active: boolean("active").default(true).notNull(),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  invoiceType: invoiceTypeEnum("invoice_type").notNull(),
  issuerOrgId: uuid("issuer_org_id")
    .notNull()
    .references(() => organizations.id),
  recipientOrgId: uuid("recipient_org_id")
    .notNull()
    .references(() => organizations.id),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  invoiceNumber: varchar("invoice_number", { length: 128 }).notNull(),
  invoiceDate: date("invoice_date"),
  totalAmount: decimal("total_amount", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("MXN").notNull(),
  paymentDueDate: date("payment_due_date"),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  payerOrgId: uuid("payer_org_id")
    .notNull()
    .references(() => organizations.id),
  payeeOrgId: uuid("payee_org_id")
    .notNull()
    .references(() => organizations.id),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paymentDate: date("payment_date"),
  amount: decimal("amount", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("MXN").notNull(),
  reference: varchar("reference", { length: 128 }),
  status: paymentStatusEnum("status").default("pending").notNull(),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const reconciliationCases = pgTable("reconciliation_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  caseType: reconciliationCaseTypeEnum("case_type").notNull(),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  customerInvoiceId: uuid("customer_invoice_id").references(() => invoices.id),
  carrierInvoiceId: uuid("carrier_invoice_id").references(() => invoices.id),
  status: reconciliationStatusEnum("status").default("pending_docs").notNull(),
  blockingReason: text("blocking_reason"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const reconciliationRequirements = pgTable("reconciliation_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  caseId: uuid("case_id")
    .notNull()
    .references(() => reconciliationCases.id),
  requiredDocumentType: documentTypeEnum("required_document_type").notNull(),
  requiredFromOrgId: uuid("required_from_org_id").references(() => organizations.id),
  status: requirementStatusEnum("status").default("missing").notNull(),
  matchedDocumentId: uuid("matched_document_id").references(() => documents.id),
  notes: text("notes"),
  ...timestamps,
});

export const exceptions = pgTable("exceptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  reconciliationCaseId: uuid("reconciliation_case_id").references(() => reconciliationCases.id),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  exceptionType: exceptionTypeEnum("exception_type").notNull(),
  severity: severityEnum("severity").default("medium").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  detectedBy: varchar("detected_by", { length: 64 }).default("system").notNull(),
  summary: text("summary").notNull(),
  resolutionStatus: resolutionStatusEnum("resolution_status").default("open").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  subjectType: varchar("subject_type", { length: 64 }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  status: reviewTaskStatusEnum("status").default("open").notNull(),
  priority: reviewTaskPriorityEnum("priority").default("normal").notNull(),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  title: text("title").notNull(),
  details: text("details"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  fileName: text("file_name"),
  sourceChannel: varchar("source_channel", { length: 64 }).default("spreadsheet_import").notNull(),
  status: importBatchStatusEnum("status").default("pending").notNull(),
  importedByUserId: uuid("imported_by_user_id").references(() => users.id),
  rowCount: decimal("row_count", { precision: 12, scale: 0 }),
  errorSummary: jsonb("error_summary").$type<Record<string, unknown>>(),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});
