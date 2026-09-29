-- cr-pathways-f9-trusted-aggregates (migration 0044): behavioral checks for the trusted F9
-- aggregate functions pathways.p10_f9_survey_aggregate and pathways.p10_f9_timeline_aggregate.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that already has 0044 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0044 f9-descriptive-aggregates checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE f9_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE f9_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON f9_results TO pathways_runtime;
GRANT INSERT, SELECT ON f9_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO f9_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO f9_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.near(actual double precision,expected double precision) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT abs(actual-expected)<1e-9
$$;

-- Org A: Program Manager (u101, project A1 only), Grant Manager (u102, projects A1 and A2),
-- Project Officer (u103, A1). Org B: Grant Manager (u105, project B1).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,8) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'F9A_ORG_A','Synthetic F9 org A'),
  (pg_temp.u(2),'F9A_ORG_B','Synthetic F9 org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),
  ('GRANT_MANAGER','Grant Manager'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,pg_temp.u(1),'PROGRAM_MANAGER','F9 Program Manager A','f9-pm-a@example.invalid'),
  (2,pg_temp.u(1),'GRANT_MANAGER','F9 Grant Manager A','f9-gm-a@example.invalid'),
  (3,pg_temp.u(1),'PROJECT_OFFICER','F9 Officer A','f9-po-a@example.invalid'),
  (5,pg_temp.u(2),'GRANT_MANAGER','F9 Grant Manager B','f9-gm-b@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

INSERT INTO pathways.permissions(code,name) VALUES
  ('analytics.descriptive.read','analytics.descriptive.read'),
  ('monitoring.read','monitoring.read')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_OFFICER')
  AND p.code IN ('analytics.descriptive.read','monitoring.read')
ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'F9A-A1','F9 Project A1','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),'F9A-A2','F9 Project A2','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'F9A-B1','F9 Project B1','2026-01-01','2026-12-31',pg_temp.u(105)),
  (pg_temp.u(304),pg_temp.u(1),'F9A-A4','F9 Project A4 adjacent defined periods','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(305),pg_temp.u(1),'F9A-A5','F9 Project A5 overlapping defined periods','2026-01-01','2026-12-31',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(102),pg_temp.u(101)),
  (pg_temp.u(403),pg_temp.u(1),pg_temp.u(302),pg_temp.u(102),pg_temp.u(101)),
  (pg_temp.u(404),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(101)),
  (pg_temp.u(405),pg_temp.u(2),pg_temp.u(303),pg_temp.u(105),pg_temp.u(105)),
  (pg_temp.u(406),pg_temp.u(1),pg_temp.u(304),pg_temp.u(102),pg_temp.u(101)),
  (pg_temp.u(407),pg_temp.u(1),pg_temp.u(305),pg_temp.u(102),pg_temp.u(101));

-- Defined reporting periods (cr-pathways-f9-trusted-aggregates amendment 2026-09-29): the distinct
-- (period_start, period_end) pairs of non-archived, reviewed Indicator definitions.
--   A1, A2, B1: one full-year period.  A4: adjacent, non-overlapping halves H1 and H2.
--   A5: two overlapping periods (Jan-Jun and Jun-Dec), so neither may be released.
--   A1 also holds an ARCHIVED definition for 2026-03-01..2026-03-01, which is not a defined period.
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id,archived_at)
SELECT pg_temp.u(v.n),v.org_id,v.project_id,'F9P-'||v.n,'F9 period '||v.n,'OTHER','points','Synthetic manual','MANUAL','SIGNED_CHANGE','HIGHER_IS_BETTER',4,v.s::date,v.e::date,-5,5,v.by_id,v.archived::timestamptz
FROM (VALUES
  (2101,pg_temp.u(1),pg_temp.u(301),'2026-01-01','2026-12-31',pg_temp.u(101),NULL),
  (2102,pg_temp.u(1),pg_temp.u(301),'2026-03-01','2026-03-01',pg_temp.u(101),'2026-06-01T00:00:00Z'),
  (2103,pg_temp.u(1),pg_temp.u(302),'2026-01-01','2026-12-31',pg_temp.u(101),NULL),
  (2104,pg_temp.u(2),pg_temp.u(303),'2026-01-01','2026-12-31',pg_temp.u(105),NULL),
  (2105,pg_temp.u(1),pg_temp.u(304),'2026-01-01','2026-06-30',pg_temp.u(101),NULL),
  (2106,pg_temp.u(1),pg_temp.u(304),'2026-07-01','2026-12-31',pg_temp.u(101),NULL),
  (2107,pg_temp.u(1),pg_temp.u(305),'2026-01-01','2026-06-30',pg_temp.u(101),NULL),
  (2108,pg_temp.u(1),pg_temp.u(305),'2026-06-01','2026-12-31',pg_temp.u(101),NULL)
) v(n,org_id,project_id,s,e,by_id,archived);

-- Timeline activities, reporting date 2026-06-15. Project A1 population:
--   501 COMPLETED planned end long past      -> eligible, completed, never overdue
--   502 IN_PROGRESS planned end 06-14        -> overdue (1 day)
--   503 IN_PROGRESS planned end 06-15        -> boundary: NOT overdue (0 days)
--   504 NOT_STARTED planned end 06-16        -> not overdue
--   505 NOT_STARTED planned end 05-16        -> overdue (30 days), the maximum
--   506 CANCELLED planned end 2020-01-01     -> excluded (cancelled)
--   507 IN_PROGRESS archived, planned 2020   -> excluded (archived)
-- Project A2: a NOT_STARTED and a COMPLETED activity, neither with a planned end date.
INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,actual_end_date,
  status,created_by_id,reviewed_by_id,reviewed_at,cancelled_at,cancellation_reason,archived_at
) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'F9A-1','Completed long ago','2025-12-01','2026-01-01','2025-12-01','2026-01-02',
   'COMPLETED',pg_temp.u(101),pg_temp.u(102),'2026-01-02T12:00:00Z',NULL,NULL,NULL),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'F9A-2','Overdue by one day','2026-05-01','2026-06-14','2026-05-01',NULL,
   'IN_PROGRESS',pg_temp.u(101),NULL,NULL,NULL,NULL,NULL),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(301),'F9A-3','Due today','2026-05-01','2026-06-15','2026-05-01',NULL,
   'IN_PROGRESS',pg_temp.u(101),NULL,NULL,NULL,NULL,NULL),
  (pg_temp.u(504),pg_temp.u(1),pg_temp.u(301),'F9A-4','Due tomorrow','2026-05-01','2026-06-16',NULL,NULL,
   'NOT_STARTED',pg_temp.u(101),NULL,NULL,NULL,NULL,NULL),
  (pg_temp.u(505),pg_temp.u(1),pg_temp.u(301),'F9A-5','Overdue by thirty days','2026-04-01','2026-05-16',NULL,NULL,
   'NOT_STARTED',pg_temp.u(101),NULL,NULL,NULL,NULL,NULL),
  (pg_temp.u(506),pg_temp.u(1),pg_temp.u(301),'F9A-6','Cancelled long ago','2019-12-01','2020-01-01',NULL,NULL,
   'CANCELLED',pg_temp.u(101),NULL,NULL,'2020-01-05T00:00:00Z','Synthetic cancellation reason',NULL),
  (pg_temp.u(507),pg_temp.u(1),pg_temp.u(301),'F9A-7','Archived overdue','2019-12-01','2020-01-01','2019-12-01',NULL,
   'IN_PROGRESS',pg_temp.u(101),NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z'),
  (pg_temp.u(508),pg_temp.u(1),pg_temp.u(302),'F9A-8','No planned end, open',NULL,NULL,NULL,NULL,
   'NOT_STARTED',pg_temp.u(101),NULL,NULL,NULL,NULL,NULL),
  (pg_temp.u(509),pg_temp.u(1),pg_temp.u(302),'F9A-9','No planned end, completed',NULL,NULL,'2026-01-01','2026-01-05',
   'COMPLETED',pg_temp.u(101),pg_temp.u(102),'2026-01-05T12:00:00Z',NULL,NULL,NULL),
  (pg_temp.u(510),pg_temp.u(2),pg_temp.u(303),'F9A-10','Org B overdue','2026-01-01','2026-02-01','2026-01-01',NULL,
   'IN_PROGRESS',pg_temp.u(105),NULL,NULL,NULL,NULL,NULL);

-- Milestones (project A1): 601 on time, 602 exactly on target (boundary), 603 late, 604 completed
-- without a target date (unrated), 605 pending, 606 cancelled, 607 completed but archived.
INSERT INTO pathways.project_milestones(id,organization_id,project_id,title,target_date,completion_date,status,archived_at) VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),'Early','2026-03-01','2026-02-28','COMPLETED',NULL),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),'On target','2026-03-01','2026-03-01','COMPLETED',NULL),
  (pg_temp.u(603),pg_temp.u(1),pg_temp.u(301),'Late','2026-03-01','2026-03-02','COMPLETED',NULL),
  (pg_temp.u(604),pg_temp.u(1),pg_temp.u(301),'No target',NULL,'2026-03-01','COMPLETED',NULL),
  (pg_temp.u(605),pg_temp.u(1),pg_temp.u(301),'Pending','2026-09-01',NULL,'PENDING',NULL),
  (pg_temp.u(606),pg_temp.u(1),pg_temp.u(301),'Cancelled','2026-01-01',NULL,'CANCELLED',NULL),
  (pg_temp.u(607),pg_temp.u(1),pg_temp.u(301),'Archived','2026-01-01','2026-06-01','COMPLETED','2026-06-02T00:00:00Z'),
  (pg_temp.u(608),pg_temp.u(2),pg_temp.u(303),'Org B late','2026-03-01','2026-04-01','COMPLETED',NULL);

-- Survey fixtures (project A1, period 2026-01-01..2026-12-31). The table CHECK that normally
-- rejects a non-positive maximum or a NaN score is dropped inside this rolled-back transaction
-- so the function's own invalid-score handling can be exercised.
ALTER TABLE pathways.assessment_results DROP CONSTRAINT p3_assessment_values;
-- Enrollment ids e1..e10 are u(701..710); assessment ids are explicit so tie-breaks are provable.
INSERT INTO pathways.assessment_results(
  id,organization_id,project_id,activity_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id
) VALUES
  -- e1 improved 40 -> 60 (act 501); a later out-of-period POST of 5 must be ignored
  (pg_temp.u(1001),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(701),'PRE_TEST',40,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1002),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(701),'POST_TEST',60,100,'2026-03-01',pg_temp.u(101)),
  (pg_temp.u(1003),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(701),'POST_TEST',5,100,'2027-01-01',pg_temp.u(101)),
  -- e2 same 50 -> 50 (act 501)
  (pg_temp.u(1004),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(702),'PRE_TEST',50,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1005),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(702),'POST_TEST',50,100,'2026-03-01',pg_temp.u(101)),
  -- e3 declined 70 -> 40 (act 501)
  (pg_temp.u(1006),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(703),'PRE_TEST',70,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1007),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(703),'POST_TEST',40,100,'2026-03-01',pg_temp.u(101)),
  -- e4 same-date PRE tie: higher id (1009, score 80) wins over lower id (1008, score 10);
  -- POST 60 -> declined (it would be improved if the lower id had won). PRE has no activity, POST has 501.
  (pg_temp.u(1008),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(704),'PRE_TEST',10,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1009),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(704),'PRE_TEST',80,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1010),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(704),'POST_TEST',60,100,'2026-03-01',pg_temp.u(101)),
  -- e5 latest PRE by date wins (50 on 02-10 over 20 on 01-10); POST 30 -> declined
  (pg_temp.u(1011),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(705),'PRE_TEST',20,100,'2026-01-10',pg_temp.u(101)),
  (pg_temp.u(1012),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(705),'PRE_TEST',50,100,'2026-02-10',pg_temp.u(101)),
  (pg_temp.u(1013),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(705),'POST_TEST',30,100,'2026-03-01',pg_temp.u(101)),
  -- e6 no-activity group, non-100 maximum: 10/20 (50) -> 15/20 (75) improved
  (pg_temp.u(1014),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(706),'PRE_TEST',10,20,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1015),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(706),'POST_TEST',15,20,'2026-03-01',pg_temp.u(101)),
  -- e7 PRE only: no pair
  (pg_temp.u(1016),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(707),'PRE_TEST',33,100,'2026-02-01',pg_temp.u(101)),
  -- e8 POST has no activity, PRE has 505: pair joins the PRE activity group; 30 -> 60 improved
  (pg_temp.u(1017),pg_temp.u(1),pg_temp.u(301),pg_temp.u(505),pg_temp.u(708),'PRE_TEST',30,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1018),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(708),'POST_TEST',60,100,'2026-03-01',pg_temp.u(101)),
  -- e9 POST with a zero maximum: excluded and counted; e10 PRE with a NaN score: excluded and counted
  (pg_temp.u(1019),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(709),'PRE_TEST',40,100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1020),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(709),'POST_TEST',5,0,'2026-03-01',pg_temp.u(101)),
  (pg_temp.u(1021),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(710),'PRE_TEST','NaN',100,'2026-02-01',pg_temp.u(101)),
  (pg_temp.u(1022),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(710),'POST_TEST',70,100,'2026-03-01',pg_temp.u(101)),
  -- valid PRE without an enrollment: cannot pair, is not counted as excluded
  (pg_temp.u(1023),pg_temp.u(1),pg_temp.u(301),NULL,NULL,'PRE_TEST',40,100,'2026-02-01',pg_temp.u(101)),
  -- other assessment types are ignored entirely
  (pg_temp.u(1024),pg_temp.u(1),pg_temp.u(301),NULL,pg_temp.u(701),'OUTCOME_SURVEY',1,100,'2026-02-01',pg_temp.u(101)),
  -- org B project data must never influence org A results
  (pg_temp.u(1025),pg_temp.u(2),pg_temp.u(303),NULL,pg_temp.u(711),'PRE_TEST',10,100,'2026-02-01',pg_temp.u(105)),
  (pg_temp.u(1026),pg_temp.u(2),pg_temp.u(303),NULL,pg_temp.u(711),'POST_TEST',90,100,'2026-03-01',pg_temp.u(105));
SET LOCAL session_replication_role = origin;

-- Function shape: prisma-owned definer, empty search_path, runtime-only execute.
SELECT pg_temp.ok(
  (SELECT count(*)=2 FROM pg_catalog.pg_proc p WHERE p.oid IN(
     'pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)'::regprocedure,
     'pathways.p10_f9_timeline_aggregate(uuid,uuid,date)'::regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']),
  'both functions are prisma-owned SECURITY DEFINER with an empty search_path');
SELECT pg_temp.ok(
  has_function_privilege('pathways_runtime','pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)','EXECUTE')
  AND has_function_privilege('pathways_runtime','pathways.p10_f9_timeline_aggregate(uuid,uuid,date)','EXECUTE')
  AND NOT has_function_privilege('anon','pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','pathways.p10_f9_timeline_aggregate(uuid,uuid,date)','EXECUTE')
  AND NOT has_function_privilege('service_role','pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)','EXECUTE'),
  'only pathways_runtime may execute the functions');

-- Access: Program Manager and Grant Manager (no assessments.detail.read / activities.read) succeed.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
INSERT INTO f9_out VALUES
  ('survey_pm',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2026-01-01',DATE '2026-12-31')),
  ('timeline_pm',pathways.p10_f9_timeline_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2026-06-15'));
-- The Program Manager cannot read the underlying rows directly, only the aggregate.
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.assessment_results),
  'Program Manager sees zero assessment rows directly (assessments.detail.read is absent)');
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.project_activities),
  'Program Manager sees zero activity rows directly (activities.read is absent)');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-02-01',DATE '2026-03-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '22023','Program Manager is refused a custom survey range (defined-period rule applies to every role)');
-- Out-of-scope project for the Program Manager (assigned to A1 only).
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(302)),
  '42501','Program Manager is denied survey aggregate for an unassigned project');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_timeline_aggregate(%L,%L,DATE '2026-06-15')$i$,pg_temp.u(1),pg_temp.u(302)),
  '42501','Program Manager is denied timeline aggregate for an unassigned project');
-- Cross-organization: org A session targeting org B's organization and project.
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(2),pg_temp.u(303)),
  '42501','A cross-organization survey aggregate request is denied');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_timeline_aggregate(%L,%L,DATE '2026-06-15')$i$,pg_temp.u(2),pg_temp.u(303)),
  '42501','A cross-organization timeline aggregate request is denied');
-- Right organization claimed, but the project belongs to org B.
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(303)),
  '42501','An org B project under an org A claim is denied');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(NULL,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(301)),
  '42501','A null organization is denied');
RESET ROLE;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
INSERT INTO f9_out VALUES
  ('survey_gm',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2026-01-01',DATE '2026-12-31')),
  ('timeline_gm',pathways.p10_f9_timeline_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2026-06-15')),
  ('timeline_gm_a2',pathways.p10_f9_timeline_aggregate(pg_temp.u(1),pg_temp.u(302),DATE '2026-06-15')),
  ('survey_gm_empty',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(302),DATE '2026-01-01',DATE '2026-12-31')),
  ('survey_gm_h1',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(304),DATE '2026-01-01',DATE '2026-06-30')),
  ('survey_gm_h2',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(304),DATE '2026-07-01',DATE '2026-12-31'));
-- Defined-period rule: only an exact, non-overlapping defined reporting period is released, so
-- adjacent or arbitrary custom ranges cannot be differenced to isolate one person.
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-03-01',DATE '2026-03-01')$i$,pg_temp.u(1),pg_temp.u(301)),
  '22023','A custom one-day range (only an archived definition matches) is refused');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-02',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '22023','A range one day shorter at the start (adjacent-day differencing) is refused');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-30')$i$,pg_temp.u(1),pg_temp.u(301)),
  '22023','A range one day shorter at the end (adjacent-day differencing) is refused');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-06-30')$i$,pg_temp.u(1),pg_temp.u(305)),
  '22023','A defined period overlapping another defined period is refused');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-06-01',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(305)),
  '22023','The other overlapping defined period is refused as well');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,NULL,NULL)$i$,pg_temp.u(1),pg_temp.u(301)),
  '22023','A missing period is refused');
RESET ROLE;

-- Both permissions are required: removing monitoring.read from Grant Manager denies the call.
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='GRANT_MANAGER' AND p.code='monitoring.read';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Grant Manager without monitoring.read is denied the survey aggregate');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_timeline_aggregate(%L,%L,DATE '2026-06-15')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Grant Manager without monitoring.read is denied the timeline aggregate');
RESET ROLE;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r,pathways.permissions p WHERE r.code='GRANT_MANAGER' AND p.code='monitoring.read';

-- Project Officer (assigned to A1) lacks analytics.descriptive.read by role.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(203)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(103)::text,true);
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2026-01-01',DATE '2026-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Project Officer is denied the survey aggregate');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_timeline_aggregate(%L,%L,DATE '2026-06-15')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Project Officer is denied the timeline aggregate');
RESET ROLE;

-- Org B Grant Manager sees only org B data and is denied org A.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),
       set_config('app.organization_id',pg_temp.u(2)::text,true),
       set_config('app.user_id',pg_temp.u(105)::text,true);
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_timeline_aggregate(%L,%L,DATE '2026-06-15')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','An org B session is denied org A timeline aggregate');
INSERT INTO f9_out VALUES
  ('timeline_b',pathways.p10_f9_timeline_aggregate(pg_temp.u(2),pg_temp.u(303),DATE '2026-06-15')),
  ('survey_b',pathways.p10_f9_survey_aggregate(pg_temp.u(2),pg_temp.u(303),DATE '2026-01-01',DATE '2026-12-31'));
RESET ROLE;

-- Survey parity: pairing, same-date tie-break, latest-by-date, invalid scores, no-activity group.
SELECT pg_temp.ok((SELECT doc=(SELECT doc FROM f9_out WHERE name='survey_gm') FROM f9_out WHERE name='survey_pm'),
  'Program Manager and Grant Manager receive identical survey aggregates');
SELECT pg_temp.ok((SELECT doc->>'excludedRecords'='2' FROM f9_out WHERE name='survey_pm'),
  'survey excludes exactly the zero-maximum and NaN-score rows (2), not the enrollment-less row');
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'groups')=3 FROM f9_out WHERE name='survey_pm'),
  'survey returns one group per activity plus one no-activity group');
SELECT pg_temp.ok((SELECT doc->'groups'->0->>'activityId'=pg_temp.u(501)::text
    AND (doc->'groups'->1->>'activityId')=pg_temp.u(505)::text
    AND (doc->'groups'->2->'activityId')='null'::jsonb FROM f9_out WHERE name='survey_pm'),
  'survey groups are ordered by activity id with the no-activity group last');
SELECT pg_temp.ok((SELECT (doc->'groups'->0->>'pairs')::int=5
    AND (doc->'groups'->0->>'improved')::int=1 AND (doc->'groups'->0->>'same')::int=1
    AND (doc->'groups'->0->>'declined')::int=3 FROM f9_out WHERE name='survey_pm'),
  'activity group counts: 5 pairs, 1 improved, 1 same, 3 declined (tie-break, latest-date and period rules applied)');
SELECT pg_temp.ok((SELECT pg_temp.near((doc->'groups'->0->>'sumPre')::float8,290)
    AND pg_temp.near((doc->'groups'->0->>'sumPost')::float8,240) FROM f9_out WHERE name='survey_pm'),
  'activity group sums use the winning PRE (80 by higher id, 50 by later date) and the in-period POST');
SELECT pg_temp.ok((SELECT (doc->'groups'->1->>'pairs')::int=1 AND (doc->'groups'->1->>'improved')::int=1
    AND pg_temp.near((doc->'groups'->1->>'sumPre')::float8,30) AND pg_temp.near((doc->'groups'->1->>'sumPost')::float8,60)
    FROM f9_out WHERE name='survey_pm'),
  'a pair with no POST activity joins its PRE activity group');
SELECT pg_temp.ok((SELECT (doc->'groups'->2->>'pairs')::int=1 AND (doc->'groups'->2->>'improved')::int=1
    AND pg_temp.near((doc->'groups'->2->>'sumPre')::float8,50) AND pg_temp.near((doc->'groups'->2->>'sumPost')::float8,75)
    FROM f9_out WHERE name='survey_pm'),
  'the no-activity group normalizes by each maximum score (10/20 -> 15/20)');
SELECT pg_temp.ok((SELECT doc->>'excludedRecords'='0' AND doc->'groups'='[]'::jsonb FROM f9_out WHERE name='survey_gm_empty'),
  'a project with no assessments returns an empty aggregate, not an error');
SELECT pg_temp.ok((SELECT doc->'groups'='[]'::jsonb AND doc->>'excludedRecords'='0' FROM f9_out WHERE name='survey_gm_h1'),
  'an exact defined period (A4 first half) is released even when it holds no data');
SELECT pg_temp.ok((SELECT doc->'groups'='[]'::jsonb AND doc->>'excludedRecords'='0' FROM f9_out WHERE name='survey_gm_h2'),
  'the adjacent non-overlapping defined period (A4 second half) is released as well');
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'groups')=1 AND (doc->'groups'->0->>'pairs')::int=1
    AND pg_temp.near((doc->'groups'->0->>'sumPre')::float8,10) AND pg_temp.near((doc->'groups'->0->>'sumPost')::float8,90)
    AND doc->>'excludedRecords'='0' FROM f9_out WHERE name='survey_b'),
  'org B survey data yields only its own pair and never merges into org A');

-- Timeline parity.
SELECT pg_temp.ok((SELECT doc=(SELECT doc FROM f9_out WHERE name='timeline_gm') FROM f9_out WHERE name='timeline_pm'),
  'Program Manager and Grant Manager receive identical timeline aggregates');
SELECT pg_temp.ok((SELECT (doc->'activities'->>'eligible')::int=5 AND (doc->'activities'->>'completed')::int=1
    FROM f9_out WHERE name='timeline_pm'),
  'timeline eligible excludes cancelled and archived activities (5) and counts 1 completed');
SELECT pg_temp.ok((SELECT (doc->'activities'->>'overdue')::int=2 AND (doc->'activities'->>'missingDates')::int=0
    AND (doc->'activities'->>'maxOverdueDays')::int=30 FROM f9_out WHERE name='timeline_pm'),
  'overdue counts 06-14 and 05-16 but not the boundary 06-15 or completed; maximum overdue is 30 days');
SELECT pg_temp.ok((SELECT (doc->'milestones'->>'completed')::int=4 AND (doc->'milestones'->>'rated')::int=3
    AND (doc->'milestones'->>'onTime')::int=2 FROM f9_out WHERE name='timeline_pm'),
  'milestones: 4 completed, 3 rated, 2 on time (boundary counts, archived/cancelled/pending excluded)');
SELECT pg_temp.ok((SELECT (doc->'activities'->>'eligible')::int=2 AND (doc->'activities'->>'completed')::int=1
    AND (doc->'activities'->>'overdue')::int=0 AND (doc->'activities'->>'missingDates')::int=1
    AND (doc->'activities'->'maxOverdueDays')='null'::jsonb FROM f9_out WHERE name='timeline_gm_a2'),
  'an open activity with no planned end counts as missingDates; a completed one does not');
SELECT pg_temp.ok((SELECT (doc->'milestones'->>'completed')::int=0 AND (doc->'milestones'->>'rated')::int=0
    FROM f9_out WHERE name='timeline_gm_a2'),
  'a project without milestones returns zero milestone counts');
SELECT pg_temp.ok((SELECT (doc->'activities'->>'eligible')::int=1 AND (doc->'activities'->>'overdue')::int=1
    AND (doc->'milestones'->>'onTime')::int=0 AND (doc->'milestones'->>'rated')::int=1
    FROM f9_out WHERE name='timeline_b'),
  'org B timeline counts only org B rows');

-- Privacy: outputs carry only the documented count/sum keys and no fixture identifier.
SELECT pg_temp.ok((SELECT NOT EXISTS(
    SELECT FROM f9_out o, jsonb_object_keys(o.doc) k
    WHERE o.name LIKE 'survey%' AND k NOT IN ('excludedRecords','groups'))
  AND NOT EXISTS(
    SELECT FROM f9_out o, jsonb_array_elements(o.doc->'groups') g, jsonb_object_keys(g) k
    WHERE o.name LIKE 'survey%' AND k NOT IN ('activityId','pairs','sumPre','sumPost','improved','same','declined'))),
  'survey output has only the aggregate keys');
SELECT pg_temp.ok((SELECT NOT EXISTS(
    SELECT FROM f9_out o, jsonb_object_keys(o.doc) k
    WHERE o.name LIKE 'timeline%' AND k NOT IN ('activities','milestones'))
  AND NOT EXISTS(
    SELECT FROM f9_out o, jsonb_object_keys(o.doc->'activities') k
    WHERE o.name LIKE 'timeline%' AND k NOT IN ('eligible','completed','overdue','missingDates','maxOverdueDays'))
  AND NOT EXISTS(
    SELECT FROM f9_out o, jsonb_object_keys(o.doc->'milestones') k
    WHERE o.name LIKE 'timeline%' AND k NOT IN ('completed','rated','onTime'))),
  'timeline output has only the aggregate keys');
SELECT pg_temp.ok((SELECT NOT EXISTS(
    SELECT FROM f9_out o
    WHERE o.doc::text LIKE ANY(ARRAY(
      SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(700,712) n
      UNION ALL SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(1001,1026) n
      UNION ALL SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(601,608) n
      UNION ALL SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(101,105) n)))),
  'no enrollment, assessment, milestone, or user identifier appears in any output');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM f9_results;
 IF total<>44 THEN RAISE EXCEPTION '0044 f9-descriptive-aggregates checks expected 44 assertions, recorded %',total; END IF;
 RAISE NOTICE 'F9_DESCRIPTIVE_AGGREGATES_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
