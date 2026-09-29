-- cr-pathways-activity-overdue-explanation (migration 0043): behavioral checks for
-- pathways.activity_overdue_explanations. Synthetic fixtures only; everything rolls back. Run
-- as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay
-- database that already has 0043 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0043 activity-overdue-explanation checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE aoe_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON aoe_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO aoe_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO aoe_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- Two organizations, each with one project; a second project in org A for cross-project
-- isolation. Triggers are off only while writing the parent fixtures.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,8) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'AOE_ORG_A','Synthetic AOE org A'),
  (pg_temp.u(2),'AOE_ORG_B','Synthetic AOE org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','AOE M&E A','aoe-me-a@example.invalid'),
  (2,pg_temp.u(1),'PROJECT_MANAGER','AOE Project Manager A','aoe-mgr-a@example.invalid'),
  (3,pg_temp.u(1),'PROJECT_OFFICER','AOE Officer A','aoe-officer-a@example.invalid'),
  (5,pg_temp.u(2),'MONITORING_AND_EVALUATION_OFFICER','AOE M&E B','aoe-me-b@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),
  ('activities.read','activities.read'),
  ('monitoring.review','monitoring.review')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN ('MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER','PROJECT_OFFICER')
  AND p.code IN ('projects.read','activities.read','monitoring.review')
  AND NOT (r.code='PROJECT_OFFICER' AND p.code='monitoring.review')
ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'AOE-A1','AOE Project A1','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),'AOE-A2','AOE Project A2','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'AOE-B1','AOE Project B1','2026-01-01','2026-12-31',pg_temp.u(105));

-- A user-project assignment (and a per-activity assignment) is required for the API's
-- monitoring.review check; the RLS policy itself only checks the permission and organization,
-- matching activity_updates' own scoping (per-activity assignment is enforced at the API layer,
-- like activities.progress.update).
INSERT INTO pathways.user_project_assignments(id,organization_id,user_id,project_id,status)
VALUES (pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),'ACTIVE');

INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,status,created_by_id
) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'AOE-ACT-1','Overdue activity',
   '2026-01-01','2026-01-15','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(302),'AOE-ACT-2','Activity in the other project',
   '2026-01-01','2026-01-15','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(2),pg_temp.u(303),'AOE-ACT-3','Activity in the other organization',
   '2026-01-01','2026-01-15','IN_PROGRESS',pg_temp.u(105));
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);

-- Happy path insert under the M&E officer's own organization/project scope.
INSERT INTO pathways.activity_overdue_explanations(
  organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
) VALUES (
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),'WEATHER',
  'Typhoon closed the access road for two weeks.',pg_temp.u(101),pg_temp.u(801)
);
SELECT pg_temp.ok(
  (SELECT count(*)=1 FROM pathways.activity_overdue_explanations
   WHERE organization_id=pg_temp.u(1) AND activity_id=pg_temp.u(501)),
  'The recorded explanation is visible to its own organization/project scope');

-- CHECK constraints: an unrecognized category and an out-of-bounds explanation length are
-- rejected before insert; both surface as a check-constraint violation.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'HURRICANE','Valid length explanation text here.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(802)),
  '23514','An unrecognized category is rejected by the category CHECK constraint');
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'WEATHER','too short',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(803)),
  '23514','An explanation shorter than 10 characters is rejected by the length CHECK constraint');
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'WEATHER',%L,%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),repeat('x',2001),pg_temp.u(101),pg_temp.u(804)),
  '23514','An explanation longer than 2000 characters is rejected by the length CHECK constraint');

-- Idempotency at the database layer: the same (organization_id, client_mutation_id) cannot be
-- inserted twice, even with different content; the application layer is what turns this into an
-- idempotent-replay read versus a 409 conflict.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'SECURITY','A different explanation entirely for this id.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(801)),
  '23505','A reused (organization_id, client_mutation_id) pair is rejected by the unique constraint');

RESET ROLE;

-- Append-only: no UPDATE or DELETE grant reaches pathways_runtime.
SELECT pg_temp.ok(
  has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','UPDATE')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','DELETE'),
  'pathways_runtime holds only SELECT and INSERT on the table (append-only)');

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject(
  format($i$UPDATE pathways.activity_overdue_explanations SET explanation='Edited' WHERE client_mutation_id=%L$i$,
    pg_temp.u(801)),
  '42501','An UPDATE attempt is rejected: no privilege is granted for it');
SELECT pg_temp.reject(
  format($i$DELETE FROM pathways.activity_overdue_explanations WHERE client_mutation_id=%L$i$,
    pg_temp.u(801)),
  '42501','A DELETE attempt is rejected: no privilege is granted for it');
RESET ROLE;

-- Cross-project isolation: a Project Manager scoped to project A2 cannot see or insert rows for
-- project A1's activity through the RLS SELECT/INSERT policies (organization matches, but
-- p05_has_project_permission is evaluated against the row's own project_id, not the caller's).
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.user_project_assignments(id,organization_id,user_id,project_id,status)
VALUES (pg_temp.u(402),pg_temp.u(1),pg_temp.u(102),pg_temp.u(302),'ACTIVE');
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.ok(
  (SELECT count(*)=0 FROM pathways.activity_overdue_explanations WHERE activity_id=pg_temp.u(501)),
  'A Project Manager scoped only to project A2 cannot see project A1''s explanation rows');
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'FUNDING','Attempted cross-project insert for this activity.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(102),pg_temp.u(805)),
  '42501','A Project Manager scoped only to project A2 cannot insert against project A1''s activity');
RESET ROLE;

-- Cross-organization isolation: organization B cannot see or insert against organization A's
-- activity, even naming its own recorded_by_id and a syntactically valid row shape.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),
       set_config('app.organization_id',pg_temp.u(2)::text,true),
       set_config('app.user_id',pg_temp.u(105)::text,true);
SELECT pg_temp.ok(
  (SELECT count(*)=0 FROM pathways.activity_overdue_explanations WHERE activity_id=pg_temp.u(501)),
  'Organization B cannot see organization A''s explanation rows');
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_overdue_explanations(
    organization_id,project_id,activity_id,category,explanation,recorded_by_id,client_mutation_id
  ) VALUES(%L,%L,%L,'LOGISTICS','Attempted cross-organization insert.',%L,%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(105),pg_temp.u(806)),
  '42501','Organization B cannot insert against organization A''s organization/activity id');
RESET ROLE;

-- Ownership, RLS and the exact policy count are unchanged from what 0043 installed.
SELECT pg_temp.ok(
  (SELECT relowner='prisma'::regrole FROM pg_class
   WHERE oid='pathways.activity_overdue_explanations'::regclass),
  'table remains owned by prisma');
SELECT pg_temp.ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
   WHERE oid='pathways.activity_overdue_explanations'::regclass),
  'row level security remains enabled and forced');
SELECT pg_temp.ok(
  (SELECT count(*)=2 FROM pg_policy WHERE polrelid='pathways.activity_overdue_explanations'::regclass),
  'exactly the two reviewed SELECT/INSERT policies remain, no UPDATE or DELETE policy exists');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM aoe_results;
 IF total<>15 THEN RAISE EXCEPTION '0043 activity-overdue-explanation checks expected 15 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_OVERDUE_EXPLANATION_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
