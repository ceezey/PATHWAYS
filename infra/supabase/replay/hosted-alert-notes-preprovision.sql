-- DBA prerequisite for migration 0093_alert_outcome_notes. It replaces a function owned by rules_human_owner, creates one
-- owned by rules_outcome_owner and adds a rules_store_owner policy under schema loans, so prisma needs a temporary SET-only
-- membership in those three roles (no ADMIN, no INHERIT). Run hosted-alert-notes-cleanup.sql right after 0093; after a failed
-- attempt run `prisma migrate resolve --rolled-back 0093_alert_outcome_notes` first.
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
 AND :'target_project_ref' IN ('mvzxitlbtkkyvubgbcmx','klbtoqdalmcsfjqophty')
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0092_rules_outcomes_freshness'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0093_alert_outcome_notes'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: every earlier owner-role membership is already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('rules_store_owner','rules_outcome_owner','rules_human_owner') AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)<>3
 THEN RAISE EXCEPTION 'Verified 0092 ledger without 0093, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
GRANT rules_store_owner,rules_outcome_owner,rules_human_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_outcome_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET')
 OR pg_catalog.pg_has_role('prisma','rules_store_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_outcome_owner','USAGE') OR pg_catalog.pg_has_role('prisma','rules_human_owner','USAGE')
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')<>3
 THEN RAISE EXCEPTION 'Temporary alert notes SET chain postcondition failed'; END IF;
END $$;
COMMIT;
