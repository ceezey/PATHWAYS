-- DBA cleanup for migration 0076_saddd_exact_counts. Revokes the temporary SET memberships that
-- hosted-saddd-exact-preprovision.sql granted. Run after a successful 0076. After a failed attempt run
-- `prisma migrate resolve --rolled-back 0076_saddd_exact_counts` first: this script refuses while a ledger row is unfinished.
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
REVOKE report_projection_owner,rules_store_owner,rules_projection_owner FROM prisma GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND r.rolname IN('report_projection_owner','rules_store_owner','rules_projection_owner'))
 OR pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
 OR pg_catalog.has_schema_privilege('rules_projection_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION 'Temporary 0076 membership or schema CREATE remains'; END IF;
END $$;
COMMIT;
