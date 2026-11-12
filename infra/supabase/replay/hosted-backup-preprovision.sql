-- DBA prerequisite for migration 0091_backup_recovery (cr-pathways-backup-recovery, per-organization recovery points).
-- Creates pathways_backup_owner, which owns the 0091 capture and restore definers, and the job login pathways_backup_job
-- (no password, CONNECTION LIMIT 0 until hosted-backup-job-login.sql runs). 0091 also widens two provisioning assertions
-- owned by rules_context_owner (in the rules_store_owner schema) and report_projection_owner, so this grants prisma a
-- temporary SET-only membership to exactly those four roles (no ADMIN, no INHERIT). Run hosted-backup-cleanup.sql right
-- after 0091; after a failed attempt run `prisma migrate resolve --rolled-back 0091_backup_recovery` and then the cleanup.
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
 OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0089_project_map_pins'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
 -- Post-cleanup role state: every earlier owner-role membership is already revoked.
 OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner','pathways_backup_owner')))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('report_projection_owner','rules_store_owner','rules_context_owner') AND NOT rolinherit AND NOT rolcanlogin AND NOT rolsuper)<>3
 THEN RAISE EXCEPTION 'Verified 0089 ledger without 0091, clean ledger and post-cleanup prisma role required'; END IF;
END $$;
-- An existing role must have exactly its profile, no membership of its own and no member but the hosted bootstrap ADMIN row.
DO $$ DECLARE role_name text;r record;job boolean; BEGIN
 FOREACH role_name IN ARRAY ARRAY['pathways_backup_owner','pathways_backup_job'] LOOP
  job:=role_name='pathways_backup_job';
  SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname=role_name;
  IF NOT FOUND THEN
   EXECUTE pg_catalog.format('CREATE ROLE %I %s NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION %s',
    role_name,CASE WHEN job THEN 'LOGIN' ELSE 'NOLOGIN' END,CASE WHEN job THEN 'CONNECTION LIMIT 0' ELSE '' END);
  ELSIF r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
   OR r.rolcanlogin IS DISTINCT FROM job OR (job AND r.rolconnlimit<>0)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid AND NOT coalesce(
    m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
     AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper)
     AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option,false)) THEN
   RAISE EXCEPTION 'Unsafe or unreviewed preexisting backup role %',role_name;
  END IF;
 END LOOP;
END $$;
GRANT pathways_backup_owner,rules_store_owner,rules_context_owner,report_projection_owner TO prisma WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;
DO $$ BEGIN
 IF EXISTS(SELECT FROM unnest(ARRAY['pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner']) o
  WHERE NOT pg_catalog.pg_has_role('prisma',o,'SET') OR pg_catalog.pg_has_role('prisma',o,'USAGE'))
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner','pathways_backup_owner')))<>4
 OR EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname IN('pathways_backup_owner','pathways_backup_job')
  AND (rolsuper OR rolbypassrls OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication
   OR rolcanlogin IS DISTINCT FROM (rolname='pathways_backup_job') OR (rolname='pathways_backup_job' AND rolconnlimit<>0)))
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('pathways_backup_owner','pathways_backup_job'))<>2
 THEN RAISE EXCEPTION 'Backup roles or temporary 0091 SET membership postcondition failed'; END IF;
END $$;
COMMIT;
