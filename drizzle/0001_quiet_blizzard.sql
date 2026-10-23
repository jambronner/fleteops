CREATE TYPE "public"."intake_channel_kind" AS ENUM('email_inbox', 'whatsapp_number');--> statement-breakpoint
CREATE TYPE "public"."intake_channel_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."intake_classification" AS ENUM('route_request', 'carrier_invoice', 'delivery_evidence', 'other');--> statement-breakpoint
CREATE TYPE "public"."intake_conversation_status" AS ENUM('unclaimed', 'active', 'ignored', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."intake_event_status" AS ENUM('received', 'routed', 'classified', 'needs_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."intake_provider" AS ENUM('email_routing', 'mailersend', 'agentmail', 'whatsapp');--> statement-breakpoint
ALTER TYPE "public"."extraction_trigger" ADD VALUE 'email_ingest' BEFORE 'manual_retry';--> statement-breakpoint
ALTER TYPE "public"."source_channel" ADD VALUE 'email' BEFORE 'upload';--> statement-breakpoint
CREATE TABLE "inbound_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"provider" "intake_provider" NOT NULL,
	"channel_kind" "intake_channel_kind" NOT NULL,
	"status" "intake_channel_status" DEFAULT 'pending' NOT NULL,
	"label" text,
	"external_channel_id" varchar(255) NOT NULL,
	"address" varchar(255),
	"phone_number" varchar(32),
	"is_shared" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"tenant_id" uuid,
	"external_conversation_id" varchar(255) NOT NULL,
	"external_participant_key" varchar(255),
	"status" "intake_conversation_status" DEFAULT 'unclaimed' NOT NULL,
	"display_name" text,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"channel_id" uuid,
	"conversation_id" uuid,
	"provider" "intake_provider" NOT NULL,
	"status" "intake_event_status" DEFAULT 'received' NOT NULL,
	"classification" "intake_classification",
	"external_event_id" varchar(255) NOT NULL,
	"external_conversation_id" varchar(255),
	"external_participant_key" varchar(255),
	"subject" text,
	"message_text" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"routed_at" timestamp with time zone,
	"classified_at" timestamp with time zone,
	"raw_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_channels" ADD CONSTRAINT "inbound_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_conversations" ADD CONSTRAINT "inbound_conversations_channel_id_inbound_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."inbound_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_conversations" ADD CONSTRAINT "inbound_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_conversations" ADD CONSTRAINT "inbound_conversations_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_events" ADD CONSTRAINT "intake_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_events" ADD CONSTRAINT "intake_events_channel_id_inbound_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."inbound_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_events" ADD CONSTRAINT "intake_events_conversation_id_inbound_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."inbound_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_channels_provider_external_idx" ON "inbound_channels" USING btree ("provider","external_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_conversations_channel_conversation_idx" ON "inbound_conversations" USING btree ("channel_id","external_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_events_provider_event_idx" ON "intake_events" USING btree ("provider","external_event_id");