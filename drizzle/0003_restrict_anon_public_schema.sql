-- Custom SQL migration file, put your code below! --
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA public FROM anon;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
