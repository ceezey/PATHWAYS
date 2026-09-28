-- Committed synthetic fixture for step-up-pin-concurrency.mjs. Disposable databases only.
-- Run as a local superuser; the race needs independent committed sessions.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR to_regclass('pathways.user_step_up_pins') IS NULL THEN
  RAISE EXCEPTION 'Concurrency fixture requires a disposable database with 0037 applied'; END IF;
END $$;
INSERT INTO auth.users(id) VALUES('78000000-0000-4000-8000-000000000011');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('78000000-0000-4000-8000-000000000001','PIN_RACE_ORG','Synthetic PIN race organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT '78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000001',r.id,
 '78000000-0000-4000-8000-000000000011','Synthetic race officer','pin-race@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='PROJECT_OFFICER';
INSERT INTO pathways.user_step_up_pins(organization_id,user_id,pin_hash) VALUES
 ('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000031',
  extensions.crypt('482915',extensions.gen_salt('bf',10)));
COMMIT;
