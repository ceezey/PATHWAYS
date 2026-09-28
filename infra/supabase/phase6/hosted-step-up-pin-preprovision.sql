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
 AS target_verified \gset
\if :target_verified
\else
ROLLBACK;
\echo 'Reviewed postgres profile and pinned target required'
\quit 2
\endif
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0035_admin_read_access'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto' AND n.nspname='extensions')
 THEN RAISE EXCEPTION 'Verified 0035 ledger, prisma role and pgcrypto in schema extensions required'; END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO prisma;
DO $$ BEGIN
 IF NOT has_schema_privilege('prisma','extensions','USAGE') OR has_schema_privilege('prisma','extensions','CREATE')
 OR NOT has_function_privilege('prisma','extensions.crypt(text,text)','EXECUTE')
 OR NOT has_function_privilege('prisma','extensions.gen_salt(text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'extensions USAGE postcondition failed'; END IF;
END $$;
COMMIT;
