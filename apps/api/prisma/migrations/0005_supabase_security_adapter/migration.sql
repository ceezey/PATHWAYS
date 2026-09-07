-- Phase 4: the only Supabase-specific migration. Run through the approved
-- administrator connection; portable table ownership remains with prisma.
-- No passwords, seed data, Auth/Storage writes, database ACL changes or Phase 5
-- business authorization are performed here.
BEGIN;

DO $preflight$
DECLARE
  is_disposable_local boolean := current_database() ~ '^pathways_phase4_[a-z0-9_]+$'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1');
  runtime_role record;
  helper_oid oid := to_regprocedure('public.rls_auto_enable()');
  helper_trigger record;
  expected_tables text[] := ARRAY[
    'organizations','roles','permissions','role_permissions','system_users','audit_logs',
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','beneficiary_journey_events',
    'project_budget_records','budget_expense_entries','assessment_results',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'rule_based_alerts','decision_recommendations','evidence_media','reports'
  ];
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION '0005 requires the approved postgres administrator session';
  END IF;
  IF current_database() <> 'postgres' AND NOT coalesce(is_disposable_local,false) THEN
    RAISE EXCEPTION '0005 database is outside the approved live/local boundary';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname='pathways'
                 AND nspowner='prisma'::regrole)
     OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='pathways' AND c.relkind IN ('r','p')) <> 39
     OR EXISTS (
       SELECT FROM unnest(expected_tables) AS target(name)
       WHERE NOT EXISTS (
         SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='pathways' AND c.relname=target.name
           AND c.relkind='r' AND c.relowner='prisma'::regrole
       )
     ) THEN
    RAISE EXCEPTION '0005 requires exactly the 39 approved prisma-owned target tables';
  END IF;
  IF EXISTS (SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways') THEN
    RAISE EXCEPTION 'Unexpected existing PATHWAYS policies; do not replace them';
  END IF;
  IF EXISTS (SELECT FROM pg_constraint c WHERE c.conrelid='pathways.system_users'::regclass
             AND c.contype='f' AND c.confrelid='auth.users'::regclass) THEN
    RAISE EXCEPTION 'Unexpected existing Auth adapter foreign key';
  END IF;

  SELECT * INTO runtime_role FROM pg_roles WHERE rolname='pathways_runtime';
  IF FOUND THEN
    -- Roles are cluster-wide, so independent local replay databases can reuse
    -- this exact unprovisioned role. Never adopt a pre-existing live role.
    IF NOT coalesce(is_disposable_local,false)
       OR runtime_role.rolcanlogin OR runtime_role.rolsuper OR runtime_role.rolinherit
       OR runtime_role.rolcreatedb OR runtime_role.rolcreaterole
       OR runtime_role.rolreplication OR runtime_role.rolbypassrls
       OR runtime_role.rolconfig IS NOT NULL OR runtime_role.rolvaliduntil IS NOT NULL
       OR EXISTS (SELECT FROM pg_auth_members WHERE member=runtime_role.oid)
       OR EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
                  AND refobjid=runtime_role.oid AND deptype='o') THEN
      RAISE EXCEPTION 'Unexpected pre-existing runtime role; no role changes made';
    END IF;
  END IF;

  SELECT * INTO helper_trigger FROM pg_event_trigger WHERE evtname='ensure_rls';
  IF FOUND THEN
    IF helper_oid IS NULL OR helper_trigger.evtfoid <> helper_oid
       OR helper_trigger.evtowner <> 'postgres'::regrole
       OR helper_trigger.evtevent <> 'ddl_command_end'
       OR helper_trigger.evtenabled <> 'O'
       OR ARRAY(SELECT tag FROM unnest(helper_trigger.evttags) AS item(tag) ORDER BY tag)
          <> ARRAY['CREATE TABLE','CREATE TABLE AS','SELECT INTO']
       OR md5(pg_get_functiondef(helper_oid)) <> '6998ea6b4c2480f5d2e34b5dcf3f8d36'
       OR (SELECT proowner FROM pg_proc WHERE oid=helper_oid) <> 'postgres'::regrole THEN
      RAISE EXCEPTION 'Custom ensure_rls capture differs; retirement forbidden';
    END IF;
  ELSIF helper_oid IS NOT NULL OR NOT coalesce(is_disposable_local,false) THEN
    RAISE EXCEPTION 'Custom ensure_rls capture absent or incomplete outside local replay';
  END IF;
END
$preflight$;

DO $runtime$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime') THEN
    CREATE ROLE pathways_runtime NOLOGIN NOSUPERUSER NOINHERIT
      NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$runtime$;

-- Administrator-only REFERENCES authority is used without transferring table
-- ownership or granting access to the managed auth schema to the migration role.
ALTER TABLE pathways.system_users
  ADD CONSTRAINT system_users_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;

-- Reviewed security-adapter exception: these two read-only helpers are owned by
-- postgres because auth.uid() is unavailable to prisma. They live in unexposed
-- pathways, have no public/API-role EXECUTE, and never change Auth or profiles.
-- The helper bypasses recursive profile RLS only for this identity lookup.
--
-- TRUST BOUNDARY: auth.uid() reads session claims; it does not validate a JWT.
-- NestJS must verify Auth then SET LOCAL app.organization_id, app.user_id and
-- the verified Auth subject in the same transaction. Phase 5 implements atomic
-- permissions/assignment/aggregate-only authorization. Runtime credentials and
-- arbitrary SQL must never be exposed to end users.
CREATE FUNCTION pathways.runtime_context_organization()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $context$
DECLARE
  requested_organization uuid;
  requested_user uuid;
  authenticated_user uuid;
  result uuid;
BEGIN
  requested_organization := nullif(current_setting('app.organization_id',true),'')::uuid;
  requested_user := nullif(current_setting('app.user_id',true),'')::uuid;
  authenticated_user := auth.uid();
  IF requested_organization IS NULL OR requested_user IS NULL OR authenticated_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.organization_id INTO result
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.id=requested_user AND u.auth_user_id=authenticated_user
    AND u.organization_id=requested_organization AND u.account_status='ACTIVE'
    AND u.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
    AND r.is_active;
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$context$;

CREATE FUNCTION pathways.runtime_context_user()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $context$
DECLARE
  requested_organization uuid;
  requested_user uuid;
  authenticated_user uuid;
  result uuid;
BEGIN
  requested_organization := nullif(current_setting('app.organization_id',true),'')::uuid;
  requested_user := nullif(current_setting('app.user_id',true),'')::uuid;
  authenticated_user := auth.uid();
  IF requested_organization IS NULL OR requested_user IS NULL OR authenticated_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.id INTO result
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.id=requested_user AND u.auth_user_id=authenticated_user
    AND u.organization_id=requested_organization AND u.account_status='ACTIVE'
    AND u.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
    AND r.is_active;
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$context$;

-- REVOKE immediately, in this transaction, including any managed postgres
-- default ACLs that might have been inherited at function creation.
REVOKE ALL ON FUNCTION pathways.runtime_context_organization(),
  pathways.runtime_context_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.runtime_context_organization(),
  pathways.runtime_context_user() TO pathways_runtime;

SET LOCAL ROLE prisma;

REVOKE ALL ON SCHEMA pathways FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT USAGE ON SCHEMA pathways TO pathways_runtime;

-- Harden only the domain object creator. Global PUBLIC function/type defaults
-- cannot be canceled by a schema-local REVOKE; both levels must be addressed.
-- No default runtime grants: future objects require an explicit review/grant.
ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma IN SCHEMA pathways
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma IN SCHEMA pathways
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma IN SCHEMA pathways
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma IN SCHEMA pathways
  REVOKE ALL ON TYPES FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

DO $table_security$
DECLARE
  target text;
  approved_tables text[] := ARRAY[
    'organizations','roles','permissions','role_permissions','system_users','audit_logs',
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','beneficiary_journey_events',
    'project_budget_records','budget_expense_entries','assessment_results',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'rule_based_alerts','decision_recommendations','evidence_media','reports'
  ];
BEGIN
  FOREACH target IN ARRAY approved_tables LOOP
    EXECUTE format('ALTER TABLE pathways.%I ENABLE ROW LEVEL SECURITY',target);
    EXECUTE format('REVOKE ALL ON TABLE pathways.%I FROM PUBLIC, anon, authenticated, service_role, pathways_runtime',target);
    EXECUTE format('GRANT SELECT ON TABLE pathways.%I TO pathways_runtime',target);
    IF target='organizations' THEN
      EXECUTE format('CREATE POLICY p4_runtime_select ON pathways.%I FOR SELECT TO pathways_runtime USING (id=(SELECT pathways.runtime_context_organization()))',target);
    ELSIF target IN ('roles','permissions','role_permissions') THEN
      EXECUTE format('CREATE POLICY p4_runtime_select ON pathways.%I FOR SELECT TO pathways_runtime USING ((SELECT pathways.runtime_context_organization()) IS NOT NULL)',target);
    ELSE
      EXECUTE format('CREATE POLICY p4_runtime_select ON pathways.%I FOR SELECT TO pathways_runtime USING (organization_id=(SELECT pathways.runtime_context_organization()))',target);
    END IF;
  END LOOP;

  FOREACH target IN ARRAY ARRAY[
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','project_budget_records','budget_expense_entries',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'decision_recommendations','evidence_media','reports'
  ] LOOP
    EXECUTE format('GRANT INSERT, UPDATE ON TABLE pathways.%I TO pathways_runtime',target);
    EXECUTE format('CREATE POLICY p4_runtime_insert ON pathways.%I FOR INSERT TO pathways_runtime WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()))',target);
    EXECUTE format('CREATE POLICY p4_runtime_update ON pathways.%I FOR UPDATE TO pathways_runtime USING (organization_id=(SELECT pathways.runtime_context_organization())) WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()))',target);
  END LOOP;

  FOREACH target IN ARRAY ARRAY['beneficiary_journey_events','assessment_results','rule_based_alerts'] LOOP
    EXECUTE format('GRANT INSERT ON TABLE pathways.%I TO pathways_runtime',target);
    EXECUTE format('CREATE POLICY p4_runtime_insert ON pathways.%I FOR INSERT TO pathways_runtime WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()))',target);
  END LOOP;
END
$table_security$;

GRANT INSERT ON TABLE pathways.audit_logs TO pathways_runtime;
CREATE POLICY p4_runtime_insert ON pathways.audit_logs FOR INSERT TO pathways_runtime
  WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
              AND actor_user_id=(SELECT pathways.runtime_context_user()));

-- Existing invoker guards lock actor profiles and evaluated alerts FOR SHARE.
-- PostgreSQL requires UPDATE on at least one column for row locks. This grants
-- only that prerequisite; WITH CHECK(false) forbids every actual row update.
GRANT UPDATE(id) ON TABLE pathways.system_users, pathways.rule_based_alerts TO pathways_runtime;
CREATE POLICY p4_runtime_lock ON pathways.system_users FOR UPDATE TO pathways_runtime
  USING (organization_id=(SELECT pathways.runtime_context_organization()))
  WITH CHECK (false);
CREATE POLICY p4_runtime_lock ON pathways.rule_based_alerts FOR UPDATE TO pathways_runtime
  USING (organization_id=(SELECT pathways.runtime_context_organization()))
  WITH CHECK (false);

-- Inventory-bounded enum and existing domain-function hardening. Table-valued
-- row types keep their table ownership; no managed/public objects are altered.
DO $supporting_objects$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='pathways' AND t.typtype='e' AND t.typowner='prisma'::regrole
    ORDER BY t.typname
  LOOP
    EXECUTE format('REVOKE USAGE ON TYPE pathways.%I FROM PUBLIC, anon, authenticated, service_role, pathways_runtime',item.typname);
    EXECUTE format('GRANT USAGE ON TYPE pathways.%I TO pathways_runtime',item.typname);
  END LOOP;
  FOR item IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pathways' AND p.proowner='prisma'::regrole
      AND left(p.proname,3) IN ('p2_','p3_')
    ORDER BY p.proname
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, pathways_runtime',item.signature);
  END LOOP;
END
$supporting_objects$;

-- Only functions used by CHECK/nested invoker guards and the reviewed
-- read-only budget aggregation helper are directly callable by runtime.
-- Existing trigger functions remain SECURITY INVOKER and are not exposed.
GRANT EXECUTE ON FUNCTION
  pathways.p2_valid_options(jsonb),
  pathways.p2_valid_response(pathways.form_fields,jsonb),
  pathways.p3_private_key(text,text,uuid,uuid,text,uuid),
  pathways.p3_condition_matches(pathways.rule_operator,numeric,numeric,numeric),
  pathways.p3_evaluate_rule(uuid,jsonb),
  pathways.p3_budget_totals(uuid)
TO pathways_runtime;

RESET ROLE;

-- The exact custom event trigger/function was checked before any mutation.
-- RESTRICT preserves evidence by failing the transaction on an extra dependency.
-- Eight managed event triggers are deliberately not addressed here.
DO $retire_custom_helper$
BEGIN
  IF EXISTS (SELECT FROM pg_event_trigger WHERE evtname='ensure_rls') THEN
    DROP EVENT TRIGGER ensure_rls;
    DROP FUNCTION public.rls_auto_enable() RESTRICT;
  END IF;
END
$retire_custom_helper$;

COMMIT;
