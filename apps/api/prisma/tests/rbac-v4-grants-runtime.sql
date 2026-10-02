-- 0055 applies RBAC v4 cells V4-C01, C02, C06, C07, C09 and C10 and keeps the p09_role_allows ACL.
-- Run as a local superuser against a disposable replay database with 0055 applied; rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF (current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' AND current_database() <> 'postgres')
 OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'rbac v4 checks require a disposable local database'; END IF;
END $$;

DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('PROGRAM_MANAGER','projects.archive',false),('GRANT_MANAGER','projects.archive',false),
  ('SYSTEM_ADMINISTRATOR','budgets.read',false),('PROGRAM_MANAGER','activities.read',true),
  ('GRANT_MANAGER','activities.read',true),('PROJECT_OFFICER','activities.create',false),
  ('PROJECT_OFFICER','dashboards.customize',false),('PROJECT_OFFICER','assessments.read',false),
  ('PROJECT_OFFICER','analytics.saddd.read',false),('PROJECT_OFFICER','beneficiaries.aggregates.read',true),
  ('PROJECT_OFFICER','submissions.write',true),('MONITORING_AND_EVALUATION_OFFICER','submissions.write',true),
  ('PROGRAM_MANAGER','activities.create',false),('GRANT_MANAGER','activities.update',false),
  ('PROJECT_MANAGER','activities.create',true),('PROJECT_MANAGER','projects.archive',true),
  ('SYSTEM_ADMINISTRATOR','activities.read',true),('SYSTEM_ADMINISTRATOR','journeys.read',false),
  ('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review',true),
  ('PROJECT_MANAGER','indicators.library.create',true)) v(role,perm,want)
 LOOP
  IF pathways.p09_role_allows(c.role,c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'p09_role_allows(%,%) expected %',c.role,c.perm,c.want; END IF;
  IF EXISTS(SELECT FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
   JOIN pathways.permissions p ON p.id=rp.permission_id WHERE r.code=c.role AND p.code=c.perm) IS DISTINCT FROM c.want THEN
   RAISE EXCEPTION 'role_permissions(%,%) expected %',c.role,c.perm,c.want; END IF;
 END LOOP;
END $$;

DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['pathways_runtime','rules_human_owner','rules_outcome_owner','rules_eligibility_owner','rules_config_owner',
  'rules_capacity_owner','rules_runtime_guard_owner','rules_enqueue_owner','rules_source_proof_owner'] LOOP
  IF NOT has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % cannot execute p09_role_allows after 0055',r; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'pathways.p09_role_allows(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Role % can execute p09_role_allows after 0055',r; END IF;
 END LOOP;
END $$;

-- Runtime RLS: Program Manager and Grant Manager read activity rows in their assigned projects only.
CREATE TEMP TABLE v4_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON v4_results TO pathways_runtime;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO v4_results VALUES(label);
END $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,2) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'V4A_ORG_A','Synthetic v4 org A'),(pg_temp.u(2),'V4A_ORG_B','Synthetic v4 org B');
INSERT INTO pathways.roles(code,name) VALUES ('PROGRAM_MANAGER','Program Manager'),('GRANT_MANAGER','Grant Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES (1,'PROGRAM_MANAGER','V4 Program Manager','v4-pm@example.invalid'),
  (2,'GRANT_MANAGER','V4 Grant Manager','v4-gm@example.invalid')) v(n,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'V4A-A1','V4 Project A1','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),'V4A-A2','V4 Project A2','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'V4A-B1','V4 Project B1','2026-01-01','2026-12-31',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(102),pg_temp.u(101));
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,status,created_by_id) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'V4A-1','In scope activity','NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(302),'V4A-2','Unassigned project activity','NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(2),pg_temp.u(303),'V4A-3','Other organization activity','NOT_STARTED',pg_temp.u(101));
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(id=pg_temp.u(501)) FROM pathways.project_activities),
  'Program Manager sees only the assigned project activity');
RESET ROLE;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(id=pg_temp.u(501)) FROM pathways.project_activities),
  'Grant Manager sees only the assigned project activity');
RESET ROLE;
DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM v4_results;
 IF total<>2 THEN RAISE EXCEPTION 'v4 activity RLS checks expected 2 assertions, recorded %',total; END IF;
END $$;
ROLLBACK;
