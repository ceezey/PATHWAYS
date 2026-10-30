-- cr-pathways-import-call-time-batch-size (migration 0082): runtime checks for p05_has_project_permission and the
-- p09_role_allows chain in PL/pgSQL. A plan kept per connection must still answer for the current identity and data.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database with 0082.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0082 permission-check checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '0082 assertion failed: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a8200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Sets the API's session identity for a synthetic user.
CREATE FUNCTION pg_temp.act(user_n integer,auth_n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(auth_n)::text,true),set_config('request.jwt.claims','',true),
    set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(user_n)::text,true)
$$;

-- Case 1: the four functions are PL/pgSQL with their reviewed security shape.
SELECT pg_temp.ok((SELECT count(*) FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.pronamespace='pathways'::regnamespace AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='prisma'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND ((p.proname='p05_has_project_permission' AND p.prosecdef AND p.provolatile='s')
    OR (p.proname IN ('p09_role_allows','p09_role_allows_0048','p09_role_allows_0035') AND NOT p.prosecdef AND p.provolatile='i')))=4,
  'case 1 four PL/pgSQL permission functions with their security shape');

INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PCP_A','Synthetic permission check organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'PROJECT_OFFICER','Synthetic PCP officer','pcp-po@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'MONITORING_AND_EVALUATION_OFFICER','Synthetic PCP M&E','pcp-me@example.invalid')) v(id,auth_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; project fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 (pg_temp.u(41),pg_temp.u(1),'PCP_A_1','Synthetic PCP project A',pg_temp.u(22)),
 (pg_temp.u(42),pg_temp.u(1),'PCP_A_2','Synthetic PCP project B',pg_temp.u(22));
SET LOCAL session_replication_role = origin;
-- The officer is assigned to project A only, the M&E officer to project B only.
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(51),pg_temp.u(1),pg_temp.u(41),pg_temp.u(21),pg_temp.u(22)),
 (pg_temp.u(52),pg_temp.u(1),pg_temp.u(42),pg_temp.u(22),pg_temp.u(22));

SET LOCAL ROLE pathways_runtime;
-- Case 2: alternating identities past the generic-plan threshold, each answer follows the current identity.
DO $$ BEGIN
 FOR i IN 1..8 LOOP
  PERFORM pg_temp.act(21,11);
  PERFORM pg_temp.ok(pathways.p05_has_project_permission('projects.read',pg_temp.u(41)),'case 2 officer reads project A, round '||i);
  PERFORM pg_temp.ok(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(42)),'case 2 officer refused project B, round '||i);
  PERFORM pg_temp.act(22,12);
  PERFORM pg_temp.ok(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(41)),'case 2 M&E refused project A, round '||i);
  PERFORM pg_temp.ok(pathways.p05_has_project_permission('projects.read',pg_temp.u(42)),'case 2 M&E reads project B, round '||i);
 END LOOP;
END $$;
-- Case 3: a mismatched auth subject is refused after the plan is cached.
SELECT pg_temp.act(21,12);
SELECT pg_temp.ok(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(41)),'case 3 officer id with another auth subject');
-- Case 4: a role without the permission is refused; the role table answers per role after caching.
SELECT pg_temp.act(21,11);
SELECT pg_temp.ok(NOT pathways.p05_has_project_permission('activities.create',pg_temp.u(41)),'case 4 officer lacks activities.create');
SELECT pg_temp.ok(pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
  AND NOT pathways.p09_role_allows('PROJECT_OFFICER','activities.create')
  AND NOT pathways.p09_role_allows('UNKNOWN_ROLE','projects.read'),'case 4 role table answers');
RESET ROLE;
-- Case 5: an ended assignment is refused in the same connection; the cached plan reads current data.
UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Synthetic reassignment' WHERE id=pg_temp.u(51);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act(21,11);
SELECT pg_temp.ok(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(41)),'case 5 ended assignment refused');
RESET ROLE;

ROLLBACK;
\echo PERMISSION_CHECK_PLPGSQL_RUNTIME=PASS
