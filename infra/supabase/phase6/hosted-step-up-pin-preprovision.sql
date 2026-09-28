-- DBA prerequisite for migration 0037_step_up_pin (cr-pathways-beneficiary-step-up-pin).
-- Grants the migration owner USAGE on the Supabase extensions schema so the SECURITY DEFINER
-- PIN functions it owns can call extensions.crypt and extensions.gen_salt. Nothing else changes.
-- Hosted endpoint must be independently pinned with TLS before invocation.
\set ON_ERROR_STOP on
\if :{?target_project_ref}
\else
\echo 'Explicit independently pinned target_project_ref required'
\quit 2
\endif
\if :{?expected_database}
\else
\echo 'Explicit expected_database required'
\quit 2
\endif
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT current_database()=:'expected_database' AND current_database()='postgres'
 AND :'target_project_ref' IN ('pdqwsknbzkdtiwjjibqt','klbtoqdalmcsfjqophty')
 AND current_user='postgres' AND session_user='postgres'
 AND current_setting('server_version_num')::integer>=160000
 AND EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND NOT rolsuper AND rolcreaterole AND rolcanlogin)
 AND EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper)
 AS target_verified \gset
\if :target_verified
\else
ROLLBACK;
\echo 'Reviewed ordinary hosted postgres profile and pinned target required'
\quit 2
\endif
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND rolinherit AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolreplication)
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0035_admin_read_access'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto' AND n.nspname='extensions')
 -- Post-cleanup role state: the 0031/0034 owner-role memberships are already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 THEN RAISE EXCEPTION 'Verified 0035 ledger, post-cleanup prisma role and pgcrypto in schema extensions required'; END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO prisma;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_namespace n
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
  WHERE n.nspname='extensions' AND a.privilege_type='USAGE' AND a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma'))
 OR has_schema_privilege('prisma','extensions','CREATE')
 OR NOT has_function_privilege('prisma','extensions.crypt(text,text)','EXECUTE')
 OR NOT has_function_privilege('prisma','extensions.gen_salt(text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'extensions USAGE postcondition failed'; END IF;
END $$;
COMMIT;
