-- Committed synthetic fixture for default-registration-form-concurrency.mjs. Disposable databases only.
-- Run as a local superuser; the race needs independent committed sessions.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR to_regprocedure('pathways.ensure_default_registration_form(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Concurrency fixture requires a disposable database with 0040 applied'; END IF;
END $$;
INSERT INTO auth.users(id) VALUES('7a000000-0000-4000-8000-000000000011'),('7a000000-0000-4000-8000-000000000012');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('7a000000-0000-4000-8000-000000000001','DRF_RACE_ORG','Synthetic default form race organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,'7a000000-0000-4000-8000-000000000001',r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('7a000000-0000-4000-8000-000000000031','PROJECT_OFFICER','7a000000-0000-4000-8000-000000000011','Synthetic race officer','drf-race-po@example.invalid'),
 ('7a000000-0000-4000-8000-000000000032','MONITORING_AND_EVALUATION_OFFICER','7a000000-0000-4000-8000-000000000012','Synthetic race M&E','drf-race-me@example.invalid')
) v(id,role_code,sub,name,email) JOIN pathways.roles r ON r.code=v.role_code;
-- Fixture projects are written directly; the rules source-proof hook only admits runtime sessions.
ALTER TABLE pathways.projects DISABLE TRIGGER f10_prove_project_source;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('7a000000-0000-4000-8000-000000000041','7a000000-0000-4000-8000-000000000001','DRF_RACE','Synthetic race project',
  '7a000000-0000-4000-8000-000000000031'),
 ('7a000000-0000-4000-8000-000000000042','7a000000-0000-4000-8000-000000000001','DRF_RACE_2','Synthetic race project 2',
  '7a000000-0000-4000-8000-000000000031');
ALTER TABLE pathways.projects ENABLE TRIGGER f10_prove_project_source;
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
SELECT '7a000000-0000-4000-8000-000000000001',p,u,u
FROM unnest(ARRAY['7a000000-0000-4000-8000-000000000031','7a000000-0000-4000-8000-000000000032']::uuid[]) u
CROSS JOIN unnest(ARRAY['7a000000-0000-4000-8000-000000000041','7a000000-0000-4000-8000-000000000042']::uuid[]) p;
COMMIT;
