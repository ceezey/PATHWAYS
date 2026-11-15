-- Committed synthetic fixture for backup-recovery-concurrency.mjs (0091). Disposable local databases only.
-- Run as a local superuser; the races need independent committed sessions.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR to_regclass('pathways.recovery_points') IS NULL THEN
  RAISE EXCEPTION 'Concurrency fixture requires a disposable local database with 0091 applied'; END IF;
END $$;
-- Organization 1 with System Administrator 21 (auth user 11) and one program, so the point holds a restorable row.
INSERT INTO auth.users(id) VALUES('a9170000-0000-4000-8000-000000000011');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('a9170000-0000-4000-8000-000000000001','P91_RACE','Synthetic backup race organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT 'a9170000-0000-4000-8000-000000000021','a9170000-0000-4000-8000-000000000001',r.id,
 'a9170000-0000-4000-8000-000000000011','Synthetic backup race administrator','p91-race@example.invalid','ACTIVE',now(),now()
FROM pathways.roles r WHERE r.code='SYSTEM_ADMINISTRATOR';
INSERT INTO pathways.programs(id,organization_id,code,name) VALUES
 ('a9170000-0000-4000-8000-000000000051','a9170000-0000-4000-8000-000000000001','P91-RACE-1','Synthetic backup race program');
COMMIT;
