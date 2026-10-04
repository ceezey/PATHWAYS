-- DBA prerequisite for migrations 0059_rules_recommendation_auto_resolve and 0060_rules_budget_beneficiary_survey_metrics.
-- Both replace rules-owned SECURITY DEFINER functions as their owners and change policies on tables owned by
-- rules_store_owner, lending schema CREATE through the schema owner (rules_store_owner for pathways_rules_internal).
-- The earlier cleanups revoked prisma's owner memberships, so this grants prisma a temporary SET-only chain to the
-- six roles used (store, projection, eligibility, commit, runtime_guard, outcome; no ADMIN, no INHERIT). One chain
-- covers 0059 and 0060. Run hosted-rules-catalog-cleanup.sql right after 0060, also after a failed attempt.
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0058_rules_decision_status_auto_resolved'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0060_rules_budget_beneficiary_survey_metrics'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: the 0031/0034 owner-role memberships are already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_store_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_projection_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_eligibility_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_commit_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_runtime_guard_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='rules_outcome_owner' AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)
 THEN RAISE EXCEPTION 'Verified 0058 ledger without 0060, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_projection_owner,rules_eligibility_owner,rules_commit_owner,rules_runtime_guard_owner,rules_outcome_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_commit_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_outcome_owner','SET')
 OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_projection_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_eligibility_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_commit_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_outcome_owner','USAGE')
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')<>6
 THEN RAISE EXCEPTION 'Temporary rules catalog SET chain postcondition failed'; END IF;
END $$;
COMMIT;
