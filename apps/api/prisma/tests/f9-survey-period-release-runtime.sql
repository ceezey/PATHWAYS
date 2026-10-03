-- cr-pathways-f9-trusted-aggregates section 10 (migration 0056): behavioral checks for the closed-period
-- survey release freeze pathways.p10_f9_survey_release and its table pathways.survey_period_releases.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that already has 0056 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0056 survey-period-release checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE sr_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE sr_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON sr_results TO pathways_runtime;
GRANT INSERT, SELECT ON sr_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO sr_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO sr_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.rel(org integer,project integer,s text,e text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format($i$SELECT pathways.p10_f9_survey_release(%L,%L,DATE %L,DATE %L)$i$,pg_temp.u(org),pg_temp.u(project),s,e)
$$;

-- Org A: Program Manager (u101, A1), Grant Manager (u102, A1 A2 A4 A6 A7), Project Officer (u103, A1),
-- Project Manager (u104, A1; holds assessments.detail.read). Org B: Grant Manager (u105, B1).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,6) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'SR_ORG_A','Synthetic release org A'),
  (pg_temp.u(2),'SR_ORG_B','Synthetic release org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),
  ('GRANT_MANAGER','Grant Manager'),
  ('PROJECT_OFFICER','Project Officer'),
  ('PROJECT_MANAGER','Project Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,pg_temp.u(1),'PROGRAM_MANAGER','SR Program Manager A','sr-pm-a@example.invalid'),
  (2,pg_temp.u(1),'GRANT_MANAGER','SR Grant Manager A','sr-gm-a@example.invalid'),
  (3,pg_temp.u(1),'PROJECT_OFFICER','SR Officer A','sr-po-a@example.invalid'),
  (4,pg_temp.u(1),'PROJECT_MANAGER','SR Project Manager A','sr-pjm-a@example.invalid'),
  (5,pg_temp.u(2),'GRANT_MANAGER','SR Grant Manager B','sr-gm-b@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('analytics.descriptive.read','analytics.descriptive.read'),
  ('monitoring.read','monitoring.read'),
  ('assessments.detail.read','assessments.detail.read')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_MANAGER') AND p.code IN ('analytics.descriptive.read','monitoring.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code='PROJECT_MANAGER' AND p.code='assessments.detail.read'
ON CONFLICT DO NOTHING;
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_OFFICER' AND p.code IN ('analytics.descriptive.read');

-- A1 closed 2025 period; A2 open 2026 period; B1 closed 2025; A4 overlapping 2025 periods;
-- A6 period ending yesterday (closed); A7 period ending today (open) in the Asia/Manila calendar.
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'SRA-A1','SR Project A1','2025-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),'SRA-A2','SR Project A2 open period','2025-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'SRA-B1','SR Project B1','2025-01-01','2026-12-31',pg_temp.u(105)),
  (pg_temp.u(304),pg_temp.u(1),'SRA-A4','SR Project A4 overlapping','2025-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(306),pg_temp.u(1),'SRA-A6','SR Project A6 ends yesterday','2025-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(307),pg_temp.u(1),'SRA-A7','SR Project A7 ends today','2025-01-01','2026-12-31',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(400+row_number() OVER ()),v.org_id,pg_temp.u(v.project),pg_temp.u(v.usr),pg_temp.u(101)
FROM (VALUES
  (1,301,101),(1,301,102),(1,302,102),(1,304,102),(1,306,102),(1,307,102),(1,301,103),(1,301,104),(2,303,105)
) v(org_n,project,usr)
CROSS JOIN LATERAL (SELECT pg_temp.u(v.org_n) AS org_id) o;

INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
SELECT pg_temp.u(v.n),v.org_id,pg_temp.u(v.project),'SRP-'||v.n,'SR period '||v.n,'OTHER','points','Synthetic manual','MANUAL','SIGNED_CHANGE','HIGHER_IS_BETTER',4,v.s::date,v.e::date,-5,5,v.by_id
FROM (VALUES
  (2101,pg_temp.u(1),301,'2025-01-01','2025-12-31',pg_temp.u(101)),
  (2102,pg_temp.u(1),302,'2026-01-01','2026-12-31',pg_temp.u(101)),
  (2103,pg_temp.u(2),303,'2025-01-01','2025-12-31',pg_temp.u(105)),
  (2104,pg_temp.u(1),304,'2025-01-01','2025-06-30',pg_temp.u(101)),
  (2105,pg_temp.u(1),304,'2025-06-01','2025-12-31',pg_temp.u(101)),
  (2106,pg_temp.u(1),306,'2026-01-01',((now() AT TIME ZONE 'Asia/Manila')::date-1)::text,pg_temp.u(101)),
  (2107,pg_temp.u(1),307,'2026-01-01',((now() AT TIME ZONE 'Asia/Manila')::date)::text,pg_temp.u(101))
) v(n,org_id,project,s,e,by_id);

INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,status,created_by_id) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'SRA-1','Large group','2025-01-01','2025-12-01','COMPLETED',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'SRA-2','Small group','2025-01-01','2025-12-01','COMPLETED',pg_temp.u(101));

-- A1 2025: five improved pairs in activity 501 (40 -> 60) and one pair in activity 502 (30 -> 90).
INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(1000+e*2+t),pg_temp.u(1),pg_temp.u(301),pg_temp.u(CASE WHEN e<=5 THEN 501 ELSE 502 END),pg_temp.u(700+e),
  CASE t WHEN 0 THEN 'PRE_TEST' ELSE 'POST_TEST' END,
  CASE WHEN e<=5 THEN 40+20*t ELSE 30+60*t END,100,
  CASE t WHEN 0 THEN DATE '2025-02-01' ELSE DATE '2025-03-01' END,pg_temp.u(101)
FROM generate_series(1,6) e CROSS JOIN generate_series(0,1) t;
-- Org B and other-project rows must never reach A1's release.
INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES
  (pg_temp.u(1101),pg_temp.u(2),pg_temp.u(303),NULL,pg_temp.u(751),'PRE_TEST',10,100,'2025-02-01',pg_temp.u(105)),
  (pg_temp.u(1102),pg_temp.u(2),pg_temp.u(303),NULL,pg_temp.u(751),'POST_TEST',90,100,'2025-03-01',pg_temp.u(105));
SET LOCAL session_replication_role = origin;

-- Object shape and privileges.
SELECT pg_temp.ok(
  (SELECT count(*)=3 FROM pg_catalog.pg_proc p WHERE p.oid IN(
     'pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)'::regprocedure,
     'pathways.p10_f9_survey_compute(uuid,uuid,date,date)'::regprocedure,
     'pathways.p10_f9_survey_release(uuid,uuid,date,date)'::regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']),
  'aggregate, compute and release functions are prisma-owned SECURITY DEFINER with an empty search_path');
SELECT pg_temp.ok(
  has_function_privilege('pathways_runtime','pathways.p10_f9_survey_release(uuid,uuid,date,date)','EXECUTE')
  AND has_function_privilege('pathways_runtime','pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)','EXECUTE')
  AND NOT has_function_privilege('pathways_runtime','pathways.p10_f9_survey_compute(uuid,uuid,date,date)','EXECUTE')
  AND NOT has_function_privilege('anon','pathways.p10_f9_survey_release(uuid,uuid,date,date)','EXECUTE')
  AND NOT has_function_privilege('authenticated','pathways.p10_f9_survey_release(uuid,uuid,date,date)','EXECUTE')
  AND NOT has_function_privilege('service_role','pathways.p10_f9_survey_release(uuid,uuid,date,date)','EXECUTE'),
  'runtime executes release and aggregate but not compute; anon, authenticated and service_role execute none');
SELECT pg_temp.ok(
  NOT has_table_privilege('pathways_runtime','pathways.survey_period_releases','SELECT')
  AND NOT has_table_privilege('pathways_runtime','pathways.survey_period_releases','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.survey_period_releases','UPDATE')
  AND NOT has_table_privilege('pathways_runtime','pathways.survey_period_releases','DELETE')
  AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='pathways.survey_period_releases'::regclass),
  'survey_period_releases has RLS forced and no runtime table privilege');

-- Baseline: Project Manager (live path) before any release exists.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(204)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(104)::text,true);
INSERT INTO sr_out VALUES
  ('live_before',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2025-01-01',DATE '2025-12-31'));
RESET ROLE;

-- Direct access and the internal function are closed to the runtime role.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject('SELECT count(*) FROM pathways.survey_period_releases','42501','runtime cannot SELECT survey_period_releases');
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_compute(%L,%L,DATE '2025-01-01',DATE '2025-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','runtime cannot EXECUTE the internal compute function');
-- Program Manager: refused the live aggregate, receives the frozen closed-period release.
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2025-01-01',DATE '2025-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Program Manager is still refused the live survey aggregate');
INSERT INTO sr_out VALUES
  ('pm_first',pathways.p10_f9_survey_release(pg_temp.u(1),pg_temp.u(301),DATE '2025-01-01',DATE '2025-12-31'));
RESET ROLE;

SELECT pg_temp.ok((SELECT doc->>'releaseState'='FROZEN' AND doc ? 'releasedAt' FROM sr_out WHERE name='pm_first'),
  'Program Manager receives a FROZEN release with a release timestamp');
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'groups')=2 AND doc->>'excludedRecords'='0'
    AND (doc->'groups'->0->>'pairs')::int=5 AND (doc->'groups'->1->>'pairs')::int=1
    AND (doc->'groups'->1->>'activityId')=pg_temp.u(502)::text FROM sr_out WHERE name='pm_first'),
  'release carries per-activity pair counts (5 and 1); the small group stays in the payload for the API suppression calculator');
SELECT pg_temp.ok((SELECT (doc-'releaseState'-'releasedAt')=(SELECT doc FROM sr_out WHERE name='live_before') FROM sr_out WHERE name='pm_first'),
  'the frozen payload equals the live detail-role aggregate at release time');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(source_fingerprint=encode(sha256(convert_to(payload::text,'UTF8')),'hex'))
    AND bool_and(payload=(SELECT doc-'releaseState'-'releasedAt' FROM sr_out WHERE name='pm_first'))
    FROM pathways.survey_period_releases WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(301)),
  'exactly one release row stored, with the sha256 fingerprint of the frozen payload');

-- New assessment rows after the release must not change what aggregate-only roles see (no differencing).
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES
  (pg_temp.u(1201),pg_temp.u(1),pg_temp.u(301),pg_temp.u(502),pg_temp.u(707),'PRE_TEST',10,100,'2025-04-01',pg_temp.u(101)),
  (pg_temp.u(1202),pg_temp.u(1),pg_temp.u(301),pg_temp.u(502),pg_temp.u(707),'POST_TEST',20,100,'2025-05-01',pg_temp.u(101));
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
INSERT INTO sr_out VALUES
  ('gm_second',pathways.p10_f9_survey_release(pg_temp.u(1),pg_temp.u(301),DATE '2025-01-01',DATE '2025-12-31'));
SELECT pg_temp.reject(
  format($i$SELECT pathways.p10_f9_survey_aggregate(%L,%L,DATE '2025-01-01',DATE '2025-12-31')$i$,pg_temp.u(1),pg_temp.u(301)),
  '42501','Grant Manager is refused the live survey aggregate');
RESET ROLE;
SELECT pg_temp.ok((SELECT g.doc=p.doc FROM sr_out g, sr_out p WHERE g.name='gm_second' AND p.name='pm_first'),
  'a later call by another aggregate-only role returns the identical frozen payload and release timestamp');
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.survey_period_releases WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(301)),
  'repeat calls never insert a second release row');

-- The live detail-role path is unchanged and does see the new rows.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(204)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(104)::text,true);
INSERT INTO sr_out VALUES
  ('live_after',pathways.p10_f9_survey_aggregate(pg_temp.u(1),pg_temp.u(301),DATE '2025-01-01',DATE '2025-12-31'));
RESET ROLE;
SELECT pg_temp.ok((SELECT (doc->'groups'->1->>'pairs')::int=2 FROM sr_out WHERE name='live_after'),
  'the detail role live aggregate reflects the new rows (2 pairs) while the frozen release still shows 1');
SELECT pg_temp.ok((SELECT (SELECT doc FROM sr_out WHERE name='live_before')-'groups'=doc-'groups'
    AND jsonb_array_length(doc->'groups')=2 FROM sr_out WHERE name='live_after'),
  'detail role output keeps the exact aggregate shape (excludedRecords, groups)');
-- The release function also serves a detail role (permission superset) the same frozen copy.
SET LOCAL ROLE pathways_runtime;
INSERT INTO sr_out VALUES
  ('pjm_release',pathways.p10_f9_survey_release(pg_temp.u(1),pg_temp.u(301),DATE '2025-01-01',DATE '2025-12-31'));
RESET ROLE;
SELECT pg_temp.ok((SELECT doc=(SELECT doc FROM sr_out WHERE name='pm_first') FROM sr_out WHERE name='pjm_release'),
  'the release function returns the same frozen copy for a detail role');

-- Refusals as the Grant Manager.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.reject(pg_temp.rel(1,302,'2026-01-01','2026-12-31'),'22023','open period (ends in the future) is refused');
SELECT pg_temp.reject(pg_temp.rel(1,307,'2026-01-01',((now() AT TIME ZONE 'Asia/Manila')::date)::text),'22023','a period ending today is still open');
INSERT INTO sr_out VALUES
  ('gm_yesterday',pathways.p10_f9_survey_release(pg_temp.u(1),pg_temp.u(306),DATE '2026-01-01',(now() AT TIME ZONE 'Asia/Manila')::date-1));
SELECT pg_temp.reject(pg_temp.rel(1,301,'2025-01-02','2025-12-31'),'22023','an undefined (adjacent-day) range is refused');
SELECT pg_temp.reject(pg_temp.rel(1,304,'2025-01-01','2025-06-30'),'22023','a period overlapping another defined period is refused');
SELECT pg_temp.reject(format($i$SELECT pathways.p10_f9_survey_release(%L,%L,NULL,NULL)$i$,pg_temp.u(1),pg_temp.u(301)),'22023','a missing period is refused');
SELECT pg_temp.reject(pg_temp.rel(2,303,'2025-01-01','2025-12-31'),'42501','a cross-organization request is denied');
SELECT pg_temp.reject(pg_temp.rel(1,303,'2025-01-01','2025-12-31'),'42501','an org B project under an org A claim is denied');
SELECT pg_temp.reject(format($i$SELECT pathways.p10_f9_survey_release(NULL,%L,DATE '2025-01-01',DATE '2025-12-31')$i$,pg_temp.u(301)),'42501','a null organization is denied');
RESET ROLE;
SELECT pg_temp.ok((SELECT doc->>'releaseState'='FROZEN' AND doc->'groups'='[]'::jsonb FROM sr_out WHERE name='gm_yesterday'),
  'a period that ended yesterday is released (empty aggregate is a valid frozen release)');
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.survey_period_releases WHERE project_id IN (pg_temp.u(302),pg_temp.u(307),pg_temp.u(304),pg_temp.u(303))),
  'no release row is created for refused requests');

-- Program Manager (assigned to A1 only) cannot release an unassigned project; Project Officer lacks the permission.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject(pg_temp.rel(1,306,'2026-01-01',((now() AT TIME ZONE 'Asia/Manila')::date-1)::text),'42501','Program Manager is denied an unassigned project');
RESET ROLE;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(203)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(103)::text,true);
SELECT pg_temp.reject(pg_temp.rel(1,301,'2025-01-01','2025-12-31'),'42501','Project Officer without analytics.descriptive.read is denied');
RESET ROLE;

-- Both permissions are required: remove each from the Grant Manager role in turn.
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='GRANT_MANAGER' AND p.code='monitoring.read';
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.reject(pg_temp.rel(1,301,'2025-01-01','2025-12-31'),'42501','Grant Manager without monitoring.read is denied');
RESET ROLE;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r,pathways.permissions p WHERE r.code='GRANT_MANAGER' AND p.code='monitoring.read';
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='GRANT_MANAGER' AND p.code='analytics.descriptive.read';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.reject(pg_temp.rel(1,301,'2025-01-01','2025-12-31'),'42501','Grant Manager without analytics.descriptive.read is denied');
RESET ROLE;

-- Org B Grant Manager freezes only its own data.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),
       set_config('app.organization_id',pg_temp.u(2)::text,true),
       set_config('app.user_id',pg_temp.u(105)::text,true);
INSERT INTO sr_out VALUES
  ('gm_b',pathways.p10_f9_survey_release(pg_temp.u(2),pg_temp.u(303),DATE '2025-01-01',DATE '2025-12-31'));
SELECT pg_temp.reject(pg_temp.rel(1,301,'2025-01-01','2025-12-31'),'42501','an org B session is denied org A');
RESET ROLE;
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'groups')=1 AND (doc->'groups'->0->>'pairs')::int=1
    AND (doc->'groups'->0->>'sumPost')::float8=90 FROM sr_out WHERE name='gm_b'),
  'org B release holds only org B data');
SELECT pg_temp.ok((SELECT NOT EXISTS(
    SELECT FROM sr_out o WHERE o.name IN ('pm_first','gm_second','gm_b','gm_yesterday')
    AND o.doc::text LIKE ANY(ARRAY(
      SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(700,760) n
      UNION ALL SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(1000,1210) n
      UNION ALL SELECT '%'||pg_temp.u(n)::text||'%' FROM generate_series(101,105) n)))),
  'no enrollment, assessment or user identifier appears in any release output');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM sr_results;
 IF total<>31 THEN RAISE EXCEPTION '0056 survey-period-release checks expected 31 assertions, recorded %',total; END IF;
 RAISE NOTICE 'F9_SURVEY_PERIOD_RELEASE_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
