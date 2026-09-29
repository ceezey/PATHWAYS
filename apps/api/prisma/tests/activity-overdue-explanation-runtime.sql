-- cr-pathways-activity-overdue-explanation (migration 0043): behavioral checks for
-- pathways.activity_overdue_explanations, the append-only table recording why an overdue
-- activity is overdue. Synthetic fixtures only; everything rolls back. Run as a local
-- superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database that
-- already has 0043 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0043 activity-overdue-explanation checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE oex_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON oex_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO oex_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO oex_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- Two organizations, each with one project. Org A additionally has a second PROJECT_MANAGER
-- with no project assignment, to prove the assignment (not merely the role) gates INSERT.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,8) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'OEX_ORG_A','Synthetic OEX org A'),
  (pg_temp.u(2),'OEX_ORG_B','Synthetic OEX org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  -- pathways.p09_role_allows confirms PROJECT_MANAGER, MONITORING_AND_EVALUATION_OFFICER,
  -- PROGRAM_MANAGER, GRANT_MANAGER and SYSTEM_ADMINISTRATOR hold 'monitoring.review'; this
  -- suite exercises PROJECT_MANAGER as the assigned identity for org A.
  (1,pg_temp.u(1),'PROJECT_MANAGER','OEX Project Manager A (assigned)','oex-pm-a@example.invalid'),
  (2,pg_temp.u(1),'PROJECT_MANAGER','OEX Project Manager A (unassigned)','oex-pm-a2@example.invalid'),
  (3,pg_temp.u(1),'PROJECT_OFFICER','OEX Officer A (no monitoring.review)','oex-officer-a@example.invalid'),
  (5,pg_temp.u(2),'PROJECT_MANAGER','OEX Project Manager B (assigned)','oex-pm-b@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),
  ('monitoring.review','monitoring.review')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN ('PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
  AND p.code IN ('projects.read','monitoring.review')
ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'OEX-A1','OEX Project A1','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'OEX-B1','OEX Project B1','2026-01-01','2026-12-31',pg_temp.u(105));

-- Only the first Project Manager in org A gets an ACTIVE project assignment; the second
-- (u(102)) has the role and the permission grant but no assignment, so
-- pathways.p05_has_project_permission must deny it.
INSERT INTO pathways.user_project_assignments(
  id,organization_id,project_id,user_id,assigned_by_id
) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(403),pg_temp.u(2),pg_temp.u(303),pg_temp.u(105),pg_temp.u(105));

-- One overdue-eligible activity per project. IN_PROGRESS requires actual_start_date to satisfy
-- the activities_lifecycle CHECK constraint (pathways.project_activities).
INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id
) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'OEX-ACT-1','Overdue activity in org A',
   '2026-01-01','2026-02-01','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(2),pg_temp.u(303),'OEX-ACT-2','Overdue activity in org B',
   '2026-01-01','2026-02-01','2026-01-01','IN_PROGRESS',pg_temp.u(105));
SET LOCAL session_replication_role = origin;

-- RLS is enabled and forced on the table.
SELECT pg_temp.ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_catalog.pg_class WHERE oid='pathways.activity_overdue_explanations'::pg_catalog.regclass),
  'RLS is enabled and forced on activity_overdue_explanations');

-- pathways_runtime has SELECT and INSERT but neither UPDATE nor DELETE (append-only).
SELECT pg_temp.ok(
  (has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','SELECT')
   AND has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','INSERT')
   AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','UPDATE')
   AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','DELETE')),
  'pathways_runtime holds only SELECT and INSERT, never UPDATE or DELETE');

-- Successful insert: assigned Project Manager in org A, recording as themself.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);

INSERT INTO pathways.activity_overdue_explanations(
  organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
) VALUES(
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),'WEATHER',
  'Heavy seasonal rains washed out the access road for three weeks.',pg_temp.u(101),pg_temp.u(901)
);
SELECT pg_temp.ok(
  (SELECT count(*)=1 FROM pathways.activity_overdue_explanations
   WHERE activity_id=pg_temp.u(501) AND recorded_by_id=pg_temp.u(101)),
  'Assigned Project Manager with monitoring.review can insert an overdue explanation');
RESET ROLE;

-- Without an ACTIVE assignment, the same role/permission cannot insert.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'WEATHER','Unassigned manager attempting to record an explanation here.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(102),pg_temp.u(902)),
  '42501','A Project Manager without an ACTIVE project assignment is denied by RLS');
RESET ROLE;

-- Cross-organization insert: session is org A, but the row claims org B.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'WEATHER','Cross-organization insert attempt targeting org B''s activity.',%L,%L)$i$,
    pg_temp.u(2),pg_temp.u(303),pg_temp.u(504),pg_temp.u(101),pg_temp.u(903)),
  '42501','A cross-organization insert (row organization differs from session organization) is denied');

-- recorded_by_id spoofing: the row names someone else as the recorder.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'WEATHER','Attempting to record this explanation as a different user.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(103),pg_temp.u(904)),
  '42501','recorded_by_id must equal the session''s own app.user_id, spoofing another user is denied');

-- Bad category value is rejected by the CHECK constraint.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'ALIEN_INVASION','A category outside the allowed enumeration.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(905)),
  '23514','An unrecognized category value is rejected by the category CHECK constraint');

-- Explanation shorter than 10 trimmed characters is rejected.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'OTHER',%L,%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),'   ok   ',pg_temp.u(101),pg_temp.u(906)),
  '23514','An explanation trimming to under 10 characters is rejected by the length CHECK constraint');

-- Explanation longer than 2000 characters is rejected.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'OTHER',%L,%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),repeat('x',2001),pg_temp.u(101),pg_temp.u(907)),
  '23514','An explanation over 2000 characters is rejected by the length CHECK constraint');
RESET ROLE;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM oex_results;
 IF total<>9 THEN RAISE EXCEPTION '0043 activity-overdue-explanation checks expected 9 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_OVERDUE_EXPLANATION_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
