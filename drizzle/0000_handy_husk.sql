CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'operator', 'finance', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'suspended', 'trial');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('billing', 'pickup', 'delivery', 'warehouse', 'store', 'cedis', 'office', 'other');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('broker', 'shipper', 'carrier', 'retailer', 'vendor', 'warehouse_operator', 'other');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('draft', 'planned', 'in_transit', 'delivered', 'delivered_with_exception', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('planned', 'arrived', 'completed', 'completed_with_exception', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stop_type" AS ENUM('pickup', 'delivery', 'return', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."external_participant_channel" AS ENUM('whatsapp', 'phone', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."external_participant_role" AS ENUM('driver', 'carrier_ops', 'shipper_ops', 'customer_contact', 'retailer_contact', 'other');--> statement-breakpoint
CREATE TYPE "public"."artifact_storage_type" AS ENUM('inline_text', 'inline_json', 'object_storage', 'external_url');--> statement-breakpoint
CREATE TYPE "public"."document_artifact_type" AS ENUM('ocr_text', 'markdown', 'layout_json', 'provider_raw', 'normalized_text', 'preview_image');--> statement-breakpoint
CREATE TYPE "public"."document_input_class" AS ENUM('digital_document', 'scanned_document', 'photo', 'spreadsheet', 'audio', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('customer_po', 'shipper_po', 'retailer_receipt', 'pod', 'carrier_invoice', 'broker_invoice', 'vendor_invoice', 'credit_note', 'photo', 'voice_note', 'pdf', 'spreadsheet_import', 'other');--> statement-breakpoint
CREATE TYPE "public"."extraction_provider" AS ENUM('docling', 'openrouter_vision', 'manual');--> statement-breakpoint
CREATE TYPE "public"."document_extraction_run_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."extraction_strategy" AS ENUM('native_parse', 'ocr_parse', 'vision_extract');--> statement-breakpoint
CREATE TYPE "public"."extraction_trigger" AS ENUM('upload', 'whatsapp_ingest', 'manual_retry', 'operator_request', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."fact_type" AS ENUM('po_number', 'invoice_number', 'shipment_reference', 'delivery_date', 'receiver_name', 'store_name', 'qty_expected', 'qty_delivered', 'qty_rejected', 'amount_total', 'other');--> statement-breakpoint
CREATE TYPE "public"."link_role" AS ENUM('supports', 'generated_from', 'evidence_for', 'supersedes', 'references');--> statement-breakpoint
CREATE TYPE "public"."link_target_type" AS ENUM('purchase_order', 'shipment', 'invoice', 'payment', 'reconciliation_case', 'exception', 'import_batch');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'audio', 'document', 'video', 'template', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_channel" AS ENUM('whatsapp', 'upload', 'manual', 'api', 'spreadsheet_import');--> statement-breakpoint
CREATE TYPE "public"."thread_participant_type" AS ENUM('internal_user', 'external_participant', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."thread_type" AS ENUM('driver_group', 'carrier_ops', 'customer', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('missing_pod', 'qty_short', 'qty_over', 'wrong_address', 'invoice_missing', 'payment_mismatch', 'late_delivery', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'partially_completed');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('ar_customer', 'ap_vendor', 'ap_carrier', 'broker_to_shipper');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_case_type" AS ENUM('delivery_completion', 'invoice_release', 'carrier_payment_release', 'quantity_exception', 'document_packet_review');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('pending_docs', 'ready_for_review', 'approved', 'blocked', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('missing', 'matched', 'waived', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('open', 'in_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."review_task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."review_task_status" AS ENUM('open', 'assigned', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"actor_type" varchar(64) DEFAULT 'system' NOT NULL,
	"actor_user_id" uuid,
	"summary" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(128) NOT NULL,
	"default_locale" varchar(16) DEFAULT 'es-MX' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Mexico_City' NOT NULL,
	"status" "workspace_status" DEFAULT 'trial' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" varchar(64) NOT NULL,
	"auth_subject" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" text,
	"preferred_locale" varchar(16) DEFAULT 'es-MX' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "workspace_invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"location_type" "location_type" NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"state" text,
	"postal_code" varchar(32),
	"country" varchar(2) DEFAULT 'MX',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text,
	"tax_id" varchar(64),
	"organization_type" "organization_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand" text,
	"sku" varchar(128),
	"external_sku" varchar(128),
	"description" text NOT NULL,
	"uom" varchar(32),
	"case_pack" varchar(64),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"line_number" integer,
	"product_id" uuid,
	"external_product_code" varchar(128),
	"description" text NOT NULL,
	"qty_ordered" numeric(14, 3),
	"uom" varchar(32),
	"unit_price" numeric(14, 4),
	"line_total" numeric(14, 2),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issuer_org_id" uuid NOT NULL,
	"supplier_org_id" uuid,
	"ship_to_location_id" uuid,
	"bill_to_location_id" uuid,
	"po_number" varchar(128) NOT NULL,
	"external_po_number" varchar(128),
	"po_date" date,
	"requested_delivery_date" date,
	"status" varchar(64) DEFAULT 'open',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"shipment_stop_id" uuid,
	"purchase_order_line_id" uuid,
	"product_id" uuid,
	"qty_expected" numeric(14, 3),
	"qty_delivered" numeric(14, 3),
	"qty_rejected" numeric(14, 3),
	"condition_status" varchar(64),
	"exception_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_orders" (
	"shipment_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_orders_shipment_id_purchase_order_id_pk" PRIMARY KEY("shipment_id","purchase_order_id")
);
--> statement-breakpoint
CREATE TABLE "shipment_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"stop_type" "stop_type" NOT NULL,
	"sequence_no" integer NOT NULL,
	"location_id" uuid,
	"status" "stop_status" DEFAULT 'planned' NOT NULL,
	"receiver_name" text,
	"receiver_signature_text" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"broker_org_id" uuid,
	"shipper_org_id" uuid,
	"carrier_org_id" uuid,
	"customer_org_id" uuid,
	"internal_shipment_number" varchar(128),
	"external_shipment_reference" varchar(128),
	"pickup_date" date,
	"delivery_date_expected" date,
	"delivery_date_actual" date,
	"status" "shipment_status" DEFAULT 'draft' NOT NULL,
	"temperature_controlled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_participant_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_participant_id" uuid NOT NULL,
	"channel" "external_participant_channel" DEFAULT 'whatsapp' NOT NULL,
	"phone_number" varchar(32) NOT NULL,
	"normalized_phone_number" varchar(32) NOT NULL,
	"label" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid,
	"organization_name" text,
	"full_name" text,
	"display_name" text,
	"phone_number" varchar(32),
	"role" "external_participant_role" DEFAULT 'other' NOT NULL,
	"language" varchar(16) DEFAULT 'es-MX' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extraction_run_id" uuid NOT NULL,
	"artifact_type" "document_artifact_type" NOT NULL,
	"storage_type" "artifact_storage_type" NOT NULL,
	"mime_type" varchar(128),
	"language" varchar(16) DEFAULT 'es-MX',
	"file_url" text,
	"text_content" text,
	"json_content" jsonb,
	"byte_size" integer,
	"page_from" integer,
	"page_to" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"provider" "extraction_provider" NOT NULL,
	"model" varchar(128),
	"status" "document_extraction_run_status" DEFAULT 'queued' NOT NULL,
	"trigger" "extraction_trigger" DEFAULT 'workflow' NOT NULL,
	"strategy" "extraction_strategy" NOT NULL,
	"input_class" "document_input_class" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"is_fallback_run" boolean DEFAULT false NOT NULL,
	"should_fallback_to_vision" boolean DEFAULT false NOT NULL,
	"fallback_from_run_id" uuid,
	"confidence_overall" numeric(5, 4),
	"routing_decision" text,
	"error_code" varchar(64),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"target_type" "link_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"link_role" "link_role" NOT NULL,
	"confidence" numeric(5, 4),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"source_channel" "source_channel" NOT NULL,
	"issuing_org_id" uuid,
	"receiving_org_id" uuid,
	"file_url" text,
	"original_file_name" text,
	"document_number" varchar(128),
	"document_date" date,
	"mime_type" varchar(128),
	"language" varchar(16) DEFAULT 'es-MX',
	"ocr_text" text,
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extraction_run_id" uuid,
	"source_artifact_id" uuid,
	"fact_type" "fact_type" NOT NULL,
	"value_text" text,
	"value_number" numeric(14, 3),
	"value_date" date,
	"confidence" numeric(5, 4),
	"source_provider" "extraction_provider",
	"source_model" varchar(128),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"thread_id" uuid,
	"external_message_id" varchar(255),
	"sender_participant_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_type" "message_type" NOT NULL,
	"text_body" text,
	"language" varchar(16) DEFAULT 'es-MX',
	"raw_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_thread_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"participant_type" "thread_participant_type" DEFAULT 'unknown' NOT NULL,
	"external_participant_id" uuid,
	"user_id" uuid,
	"display_name" text,
	"phone_number" varchar(32),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shipment_id" uuid,
	"counterparty_org_id" uuid,
	"phone_number" varchar(32),
	"external_thread_id" varchar(255),
	"thread_type" "thread_type" DEFAULT 'other' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reconciliation_case_id" uuid,
	"shipment_id" uuid,
	"exception_type" "exception_type" NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detected_by" varchar(64) DEFAULT 'system' NOT NULL,
	"summary" text NOT NULL,
	"resolution_status" "resolution_status" DEFAULT 'open' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" text,
	"source_channel" varchar(64) DEFAULT 'spreadsheet_import' NOT NULL,
	"status" "import_batch_status" DEFAULT 'pending' NOT NULL,
	"imported_by_user_id" uuid,
	"row_count" numeric(12, 0),
	"error_summary" jsonb,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_type" "invoice_type" NOT NULL,
	"issuer_org_id" uuid NOT NULL,
	"recipient_org_id" uuid NOT NULL,
	"shipment_id" uuid,
	"purchase_order_id" uuid,
	"invoice_number" varchar(128) NOT NULL,
	"invoice_date" date,
	"total_amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"payment_due_date" date,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"source_document_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payer_org_id" uuid NOT NULL,
	"payee_org_id" uuid NOT NULL,
	"shipment_id" uuid,
	"invoice_id" uuid,
	"payment_date" date,
	"amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"reference" varchar(128),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"source_document_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_type" "reconciliation_case_type" NOT NULL,
	"shipment_id" uuid,
	"purchase_order_id" uuid,
	"customer_invoice_id" uuid,
	"carrier_invoice_id" uuid,
	"status" "reconciliation_status" DEFAULT 'pending_docs' NOT NULL,
	"blocking_reason" text,
	"confidence_score" numeric(5, 4),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"required_document_type" "document_type" NOT NULL,
	"required_from_org_id" uuid,
	"status" "requirement_status" DEFAULT 'missing' NOT NULL,
	"matched_document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "review_task_status" DEFAULT 'open' NOT NULL,
	"priority" "review_task_priority" DEFAULT 'normal' NOT NULL,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"details" text,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_issuer_org_id_organizations_id_fk" FOREIGN KEY ("issuer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ship_to_location_id_locations_id_fk" FOREIGN KEY ("ship_to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_bill_to_location_id_locations_id_fk" FOREIGN KEY ("bill_to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_line_items" ADD CONSTRAINT "shipment_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_line_items" ADD CONSTRAINT "shipment_line_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_line_items" ADD CONSTRAINT "shipment_line_items_shipment_stop_id_shipment_stops_id_fk" FOREIGN KEY ("shipment_stop_id") REFERENCES "public"."shipment_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_line_items" ADD CONSTRAINT "shipment_line_items_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_line_items" ADD CONSTRAINT "shipment_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_broker_org_id_organizations_id_fk" FOREIGN KEY ("broker_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shipper_org_id_organizations_id_fk" FOREIGN KEY ("shipper_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_org_id_organizations_id_fk" FOREIGN KEY ("carrier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customer_org_id_organizations_id_fk" FOREIGN KEY ("customer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_participant_phone_numbers" ADD CONSTRAINT "external_participant_phone_numbers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_participant_phone_numbers" ADD CONSTRAINT "external_participant_phone_numbers_external_participant_id_external_participants_id_fk" FOREIGN KEY ("external_participant_id") REFERENCES "public"."external_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_participants" ADD CONSTRAINT "external_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_participants" ADD CONSTRAINT "external_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_extraction_run_id_document_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."document_extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extraction_runs" ADD CONSTRAINT "document_extraction_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extraction_runs" ADD CONSTRAINT "document_extraction_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_issuing_org_id_organizations_id_fk" FOREIGN KEY ("issuing_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_receiving_org_id_organizations_id_fk" FOREIGN KEY ("receiving_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_extraction_run_id_document_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."document_extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_source_artifact_id_document_artifacts_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."document_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_whatsapp_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."whatsapp_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_participant_id_whatsapp_thread_participants_id_fk" FOREIGN KEY ("sender_participant_id") REFERENCES "public"."whatsapp_thread_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_thread_participants" ADD CONSTRAINT "whatsapp_thread_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_thread_participants" ADD CONSTRAINT "whatsapp_thread_participants_thread_id_whatsapp_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."whatsapp_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_thread_participants" ADD CONSTRAINT "whatsapp_thread_participants_external_participant_id_external_participants_id_fk" FOREIGN KEY ("external_participant_id") REFERENCES "public"."external_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_thread_participants" ADD CONSTRAINT "whatsapp_thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_threads" ADD CONSTRAINT "whatsapp_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_threads" ADD CONSTRAINT "whatsapp_threads_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_threads" ADD CONSTRAINT "whatsapp_threads_counterparty_org_id_organizations_id_fk" FOREIGN KEY ("counterparty_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_reconciliation_case_id_reconciliation_cases_id_fk" FOREIGN KEY ("reconciliation_case_id") REFERENCES "public"."reconciliation_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuer_org_id_organizations_id_fk" FOREIGN KEY ("issuer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recipient_org_id_organizations_id_fk" FOREIGN KEY ("recipient_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_org_id_organizations_id_fk" FOREIGN KEY ("payer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_org_id_organizations_id_fk" FOREIGN KEY ("payee_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_customer_invoice_id_invoices_id_fk" FOREIGN KEY ("customer_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_carrier_invoice_id_invoices_id_fk" FOREIGN KEY ("carrier_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_requirements" ADD CONSTRAINT "reconciliation_requirements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_requirements" ADD CONSTRAINT "reconciliation_requirements_case_id_reconciliation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."reconciliation_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_requirements" ADD CONSTRAINT "reconciliation_requirements_required_from_org_id_organizations_id_fk" FOREIGN KEY ("required_from_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_requirements" ADD CONSTRAINT "reconciliation_requirements_matched_document_id_documents_id_fk" FOREIGN KEY ("matched_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_subject_idx" ON "users" USING btree ("auth_provider","auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_issuer_po_idx" ON "purchase_orders" USING btree ("tenant_id","issuer_org_id","po_number");--> statement-breakpoint
CREATE UNIQUE INDEX "external_participant_phone_numbers_tenant_phone_idx" ON "external_participant_phone_numbers" USING btree ("tenant_id","normalized_phone_number");