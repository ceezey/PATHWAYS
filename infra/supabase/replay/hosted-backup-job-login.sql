-- Hosted control-plane only, run by a person with psql after 0091_backup_recovery and hosted-backup-cleanup.sql.
-- Sets the daily backup job password through psql \password, which hashes client-side and stores nothing here; the
-- password lives only in Vercel production's BACKUP_JOB_DATABASE_URL.
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
SELECT current_database()=:'expected_database' AND current_database()='postgres'
 AND :'target_project_ref' IN ('mvzxitlbtkkyvubgbcmx','klbtoqdalmcsfjqophty')
 AND current_user='postgres' AND session_user='postgres'
 AND EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 AND EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_job'
  AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit AND NOT rolreplication)
 AS target_verified \gset
\if :target_verified
\else
\echo 'Pinned target, applied 0091 and the reviewed backup job role required'
\quit 2
\endif
\echo 'Enter the backup job password (input hidden)'
\password pathways_backup_job
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER ROLE pathways_backup_job CONNECTION LIMIT 2;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_job' AND rolconnlimit=2) THEN
  RAISE EXCEPTION 'Backup job login postcondition failed';
 END IF;
END $$;
COMMIT;
\echo 'BACKUP_JOB_LOGIN=READY'
