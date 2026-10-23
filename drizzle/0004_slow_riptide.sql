ALTER TABLE "documents" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;