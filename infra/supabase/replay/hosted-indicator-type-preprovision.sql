-- DBA prerequisite for migration 0056_indicator_type. 0056 replaces canonical_source_request and
-- f10_begin_source_operation as their owner rules_enqueue_owner, lending schema CREATE through the schema
-- owners. This grants prisma a temporary SET-only chain to rules_store_owner and rules_enqueue_owner (no
-- ADMIN, no INHERIT). Run hosted-indicator-type-cleanup.sql right after 0056, also after a failed attempt.
-- Hosted endpoint must be independently pinned with TLS first.
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0055_rbac_v4_grants'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0056_indicator_type'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: no owner-role membership remains.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_store_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_enqueue_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways','CREATE')
 OR pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways_rules_internal','CREATE')
 -- Fail before granting unless the reviewed 0041 and 0044 bodies are installed (catalog join, no schema USAGE needed).
 OR (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways_rules_internal' AND p.proname='canonical_source_request') IS DISTINCT FROM '26392f4284b21e3b751063c39901628d'
 OR (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways' AND p.proname='f10_begin_source_operation') IS DISTINCT FROM 'f43ddcc77120d4c068c604ddbba96b7b'
 THEN RAISE EXCEPTION 'Verified 0055 ledger without 0056, reviewed 0041/0044 bodies, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_enqueue_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
 OR pg_catalog.pg_has_role('prisma','rules_enqueue_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE')
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')<>2
 THEN RAISE EXCEPTION 'Temporary 0056 SET chain postcondition failed'; END IF;
END $$;
COMMIT;
