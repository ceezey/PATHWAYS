-- Owned disposable local CI only. Never use on hosted databases.
-- Forward equivalent of hosted-step-up-pin-preprovision.sql for 0037_step_up_pin. The plain
-- PostgreSQL replay cluster has pgcrypto in public; Supabase keeps it in schema extensions, so
-- this recreates that layout, then grants the migration owner only USAGE, as hosted does.
-- Idempotent. Requires the post-0031/0034-cleanup role state.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_fault','pathways_phase4_forward_restore','pathways_phase4_core_fault','pathways_phase4_core_retry','pathways_phase4_pdf_fault','pathways_phase4_pdf_retry','pathways_phase4_pin_fault','pathways_phase4_pin_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int
 OR current_user<>'postgres' OR session_user<>'postgres'
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolsuper)
 THEN RAISE EXCEPTION 'Only owned disposable replay port local superuser profile permitted'; END IF; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND rolinherit AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolreplication)
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0035_admin_read_access'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_extension WHERE extname='pgcrypto')
 -- Post-cleanup role state: the 0031/0034 owner-role memberships are already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 THEN RAISE EXCEPTION 'Verified 0035 ledger, post-cleanup prisma role and pgcrypto required'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION postgres;
DO $$ BEGIN
 IF (SELECT n.nspname FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto')<>'extensions' THEN
  ALTER EXTENSION pgcrypto SET SCHEMA extensions;
 END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO prisma;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto' AND n.nspname='extensions')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_namespace n
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
  WHERE n.nspname='extensions' AND a.privilege_type='USAGE' AND a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma'))
 OR has_schema_privilege('prisma','extensions','CREATE')
 OR NOT has_function_privilege('prisma','extensions.crypt(text,text)','EXECUTE')
 OR NOT has_function_privilege('prisma','extensions.gen_salt(text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'extensions USAGE postcondition failed'; END IF;
END $$;
COMMIT;
