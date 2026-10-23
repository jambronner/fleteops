CREATE TYPE "public"."rate_card_direction" AS ENUM('customer', 'carrier');--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"direction" "rate_card_direction" NOT NULL,
	"counterparty_org_id" uuid,
	"match_type" varchar(32) DEFAULT 'stop_count' NOT NULL,
	"min_stops" integer,
	"max_stops" integer,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "operation_date" date;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "route_code" varchar(64);--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_counterparty_org_id_organizations_id_fk" FOREIGN KEY ("counterparty_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_tenant_operation_day_route_idx" ON "shipments" USING btree ("tenant_id","operation_date","route_code") WHERE "shipments"."operation_date" is not null and "shipments"."route_code" is not null;--> statement-breakpoint
ALTER TABLE "public"."rate_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."rate_cards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_select_workspace_rows ON "public"."rate_cards";--> statement-breakpoint
CREATE POLICY authenticated_select_workspace_rows ON "public"."rate_cards" FOR SELECT TO authenticated USING (app_private.is_active_workspace_member(tenant_id));--> statement-breakpoint
WITH candidates AS (
  SELECT
    id,
    (metadata->>'dispatchDate')::date AS op_date,
    left(NULLIF(split_part(metadata->>'groupingKey', '::', 1), ''), 64) AS r_code,
    row_number() OVER (
      PARTITION BY tenant_id, metadata->>'groupingKey'
      ORDER BY created_at DESC
    ) AS rn
  FROM "shipments"
  WHERE metadata->>'entryMode' = 'import'
    AND metadata->>'groupingKey' IS NOT NULL
    AND metadata->>'dispatchDate' ~ '^\d{4}-\d{2}-\d{2}$'
)
UPDATE "shipments" s
SET operation_date = c.op_date,
    route_code = c.r_code
FROM candidates c
WHERE s.id = c.id
  AND c.rn = 1
  AND c.op_date IS NOT NULL
  AND c.r_code IS NOT NULL
  AND c.r_code <> 'unassigned';
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."rate_cards" FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."rate_cards" FROM anon;--> statement-breakpoint
GRANT SELECT ON TABLE "public"."rate_cards" TO authenticated;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rate_cards_tenant_id_idx ON "public"."rate_cards" (tenant_id);
