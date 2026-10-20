-- DBA prerequisite for migration 0072_severity_classification. It replaces functions owned by rules_projection_owner,
-- rules_config_owner and rules_human_owner (part 2 also rules_commit_owner and rules_runtime_guard_owner) under a
-- rules_store_owner schema loan, so prisma needs a temporary SET-only membership in those six roles (no ADMIN, no INHERIT).
-- Run hosted-rules-severity-cleanup.sql right after 0072; after a failed attempt run
-- `prisma migrate resolve --rolled-back 0072_severity_classification` first.
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0071_assessment_score_entry'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0072_severity_classification'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: every earlier owner-role membership is already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('rules_store_owner','rules_projection_owner','rules_config_owner','rules_human_owner','rules_commit_owner','rules_runtime_guard_owner') AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)<>6
 THEN RAISE EXCEPTION 'Verified 0071 ledger without 0072, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_projection_owner,rules_config_owner,rules_human_owner,rules_commit_owner,rules_runtime_guard_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_config_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_commit_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','SET')
 OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_projection_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_config_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_human_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_commit_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','USAGE')
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')<>6
 THEN RAISE EXCEPTION 'Temporary rules severity SET chain postcondition failed'; END IF;
END $$;
COMMIT;
