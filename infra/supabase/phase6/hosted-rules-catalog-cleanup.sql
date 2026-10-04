-- DBA cleanup for migrations 0059 and 0060 (rules catalog). Revokes the temporary SET chain that
-- hosted-rules-catalog-preprovision.sql granted. Run after a successful 0060. After a failed attempt run
-- `prisma migrate resolve --rolled-back <migration>` first: this script refuses while a ledger row is unfinished.
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
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
  RAISE EXCEPTION 'A migration is still in progress'; END IF;
END $$;
REVOKE rules_store_owner,rules_projection_owner,rules_eligibility_owner,rules_commit_owner,rules_runtime_guard_owner,rules_outcome_owner FROM prisma GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')
 OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'rules\_%\_owner'
  AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
 THEN RAISE EXCEPTION 'Temporary rules catalog membership or schema CREATE remains'; END IF;
END $$;
COMMIT;
