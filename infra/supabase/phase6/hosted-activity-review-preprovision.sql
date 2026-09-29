-- DBA prerequisite for migration 0044_activity_progress_review (progress-only activity review).
-- 0044 replaces pathways.f10_begin_source_operation as its owner rules_enqueue_owner and
-- pathways_rules_internal.prove_source_root_dml as its owner rules_source_proof_owner, lending schema
-- CREATE through the schema owners (prisma for pathways, rules_store_owner for pathways_rules_internal).
-- The 0031/0041 cleanup revoked prisma's owner memberships, so this grants prisma a temporary SET-only
-- chain to exactly those three roles (no ADMIN, no INHERIT). Run hosted-activity-review-cleanup.sql
-- right after 0044, also after a failed attempt. Hosted endpoint must be independently pinned with TLS first.
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0043_activity_overdue_explanation'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0044_activity_progress_review'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: the 0031/0034 owner-role memberships are already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_store_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_enqueue_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_source_proof_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 THEN RAISE EXCEPTION 'Verified 0043 ledger without 0044, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_enqueue_owner,rules_source_proof_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
 OR NOT pg_catalog.pg_has_role('prisma','rules_source_proof_owner','SET') OR pg_catalog.pg_has_role('prisma','rules_source_proof_owner','USAGE')
 OR pg_catalog.pg_has_role('prisma','rules_enqueue_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE')
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')<>3
 THEN RAISE EXCEPTION 'Temporary 0044 SET chain postcondition failed'; END IF;
END $$;
COMMIT;
