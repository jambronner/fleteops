-- Custom SQL migration file, put your code below! --
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  EXECUTE format('GRANT authenticated TO %I', current_user);
END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app_private FROM anon;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app_private TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.request_auth_subject()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  subject text;
  claims jsonb;
BEGIN
  subject := NULLIF(current_setting('request.jwt.claim.sub', true), '');

  IF subject IS NOT NULL THEN
    RETURN subject;
  END IF;

  BEGIN
    claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN NULLIF(claims ->> 'sub', '');
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT users.id
  FROM public.users
  WHERE users.auth_provider = 'supabase'
    AND users.auth_subject = app_private.request_auth_subject()
    AND users.active IS TRUE
  LIMIT 1
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.is_active_workspace_member(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_memberships.tenant_id = target_tenant_id
      AND tenant_memberships.user_id = app_private.current_app_user_id()
      AND tenant_memberships.status = 'active'
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.has_workspace_role(target_tenant_id uuid, allowed_roles public.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_memberships.tenant_id = target_tenant_id
      AND tenant_memberships.user_id = app_private.current_app_user_id()
      AND tenant_memberships.status = 'active'
      AND tenant_memberships.role = ANY(allowed_roles)
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.shares_active_workspace_with_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id = app_private.current_app_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS mine
      INNER JOIN public.tenant_memberships AS target
        ON target.tenant_id = mine.tenant_id
      WHERE mine.user_id = app_private.current_app_user_id()
        AND mine.status = 'active'
        AND target.user_id = target_user_id
        AND target.status = 'active'
    )
$$;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.request_auth_subject() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_app_user_id() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.is_active_workspace_member(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.has_workspace_role(uuid, public.user_role[]) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.shares_active_workspace_with_user(uuid) TO authenticated;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
  all_rls_tables text[] := ARRAY[
    'audit_logs',
    'document_artifacts',
    'document_extraction_runs',
    'document_links',
    'documents',
    'exceptions',
    'external_participant_phone_numbers',
    'external_participants',
    'extracted_facts',
    'import_batches',
    'inbound_channels',
    'inbound_conversations',
    'intake_events',
    'invoices',
    'locations',
    'message_attachments',
    'messages',
    'organizations',
    'payments',
    'products',
    'rate_cards',
    'purchase_order_lines',
    'purchase_orders',
    'reconciliation_cases',
    'reconciliation_requirements',
    'review_tasks',
    'shipment_line_items',
    'shipment_orders',
    'shipment_stops',
    'shipments',
    'tenant_memberships',
    'tenants',
    'users',
    'whatsapp_thread_participants',
    'whatsapp_threads',
    'workspace_invites'
  ];
BEGIN
  FOREACH table_name IN ARRAY all_rls_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
  tenant_scoped_tables text[] := ARRAY[
    'document_artifacts',
    'document_extraction_runs',
    'document_links',
    'documents',
    'exceptions',
    'external_participant_phone_numbers',
    'external_participants',
    'extracted_facts',
    'import_batches',
    'inbound_channels',
    'inbound_conversations',
    'intake_events',
    'invoices',
    'locations',
    'message_attachments',
    'messages',
    'organizations',
    'payments',
    'products',
    'rate_cards',
    'purchase_order_lines',
    'purchase_orders',
    'reconciliation_cases',
    'reconciliation_requirements',
    'review_tasks',
    'shipment_line_items',
    'shipment_stops',
    'shipments',
    'whatsapp_thread_participants',
    'whatsapp_threads'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_scoped_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_select_workspace_rows ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY authenticated_select_workspace_rows ON public.%I FOR SELECT TO authenticated USING (app_private.is_active_workspace_member(tenant_id))',
      table_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_select_member_tenants ON public.tenants;
--> statement-breakpoint
CREATE POLICY authenticated_select_member_tenants
ON public.tenants
FOR SELECT
TO authenticated
USING (app_private.is_active_workspace_member(id));
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_select_visible_users ON public.users;
--> statement-breakpoint
CREATE POLICY authenticated_select_visible_users
ON public.users
FOR SELECT
TO authenticated
USING (
  id = app_private.current_app_user_id()
  OR app_private.shares_active_workspace_with_user(id)
);
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_select_workspace_memberships ON public.tenant_memberships;
--> statement-breakpoint
CREATE POLICY authenticated_select_workspace_memberships
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (app_private.is_active_workspace_member(tenant_id));
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_admin_select_workspace_invites ON public.workspace_invites;
--> statement-breakpoint
CREATE POLICY authenticated_admin_select_workspace_invites
ON public.workspace_invites
FOR SELECT
TO authenticated
USING (app_private.has_workspace_role(tenant_id, ARRAY['admin']::public.user_role[]));
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_admin_select_audit_logs ON public.audit_logs;
--> statement-breakpoint
CREATE POLICY authenticated_admin_select_audit_logs
ON public.audit_logs
FOR SELECT
TO authenticated
USING (app_private.has_workspace_role(tenant_id, ARRAY['admin']::public.user_role[]));
--> statement-breakpoint
DROP POLICY IF EXISTS authenticated_select_workspace_shipment_orders ON public.shipment_orders;
--> statement-breakpoint
CREATE POLICY authenticated_select_workspace_shipment_orders
ON public.shipment_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shipments
    WHERE shipments.id = shipment_orders.shipment_id
      AND app_private.is_active_workspace_member(shipments.tenant_id)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tenant_memberships_user_status_tenant_idx
ON public.tenant_memberships (user_id, status, tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workspace_invites_tenant_status_email_idx
ON public.workspace_invites (tenant_id, status, email);
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
  tenant_scoped_tables text[] := ARRAY[
    'audit_logs',
    'document_artifacts',
    'document_extraction_runs',
    'document_links',
    'documents',
    'exceptions',
    'external_participant_phone_numbers',
    'external_participants',
    'extracted_facts',
    'import_batches',
    'inbound_channels',
    'inbound_conversations',
    'intake_events',
    'invoices',
    'locations',
    'message_attachments',
    'messages',
    'organizations',
    'payments',
    'products',
    'rate_cards',
    'purchase_order_lines',
    'purchase_orders',
    'reconciliation_cases',
    'reconciliation_requirements',
    'review_tasks',
    'shipment_line_items',
    'shipment_stops',
    'shipments',
    'workspace_invites',
    'whatsapp_thread_participants',
    'whatsapp_threads'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_scoped_tables LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      table_name || '_tenant_id_idx',
      table_name
    );
  END LOOP;
END $$;
