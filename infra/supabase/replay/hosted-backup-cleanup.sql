-- DBA cleanup for migration 0091_backup_recovery. Revokes the temporary SET memberships that
-- hosted-backup-preprovision.sql granted, then, only when 0091 finished, grants pathways_backup_owner its three permanent
-- memberships (prisma, rules_store_owner, report_projection_owner; INHERIT only). Run after a successful 0091. After a failed
-- attempt run `prisma migrate resolve --rolled-back 0091_backup_recovery` first: this script refuses while a ledger row is unfinished.
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
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
  RAISE EXCEPTION 'A migration is still in progress'; END IF;
END $$;
REVOKE pathways_backup_owner,rules_store_owner,rules_context_owner,report_projection_owner FROM prisma GRANTED BY postgres;
-- The backup owner joins prisma only after prisma has left it, since PostgreSQL forbids circular membership.
DO $$ BEGIN
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
  GRANT prisma,rules_store_owner,report_projection_owner TO pathways_backup_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres;
 END IF;
END $$;
DO $$ DECLARE backup_oid oid; BEGIN
 SELECT oid INTO backup_oid FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_owner';
 IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
  AND r.rolname IN('pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner'))
 -- ACL entries, not effective privileges: the backup owner inherits the pathways schema owner prisma.
 OR EXISTS(SELECT FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
  WHERE a.privilege_type='CREATE' AND ((n.nspname='pathways' AND a.grantee IN
   ((SELECT oid FROM pg_catalog.pg_roles WHERE rolname='report_projection_owner'),backup_oid))
   OR (n.nspname='pathways_rules_internal' AND a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_context_owner'))))
 -- The backup owner membership check applies only once 0091 finished; a failed attempt leaves none.
 OR (EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
   AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  AND ((SELECT pg_catalog.jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE m.member=backup_oid
   AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
   AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)
   IS DISTINCT FROM '["prisma","report_projection_owner","rules_store_owner"]'::jsonb
  OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=backup_oid)<>3))
 THEN RAISE EXCEPTION 'Temporary 0091 membership or schema CREATE remains, or backup owner memberships differ'; END IF;
END $$;
COMMIT;
