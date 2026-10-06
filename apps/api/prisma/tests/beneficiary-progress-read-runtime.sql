-- cr-pathways-beneficiary-progress-read (migration 0067): runtime checks for pathways.p05_beneficiary_progress against the
-- previous per-enrollment lateral query read under RLS. Synthetic fixtures only; everything rolls back. Run as a local
-- superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0067.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0067 beneficiary-progress-read checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE TEMP TABLE bpr_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE bpr_old(project uuid, enrollment_id uuid, activity_id uuid, activity_title text,
  participation_date date, stage_code text, stage_name text, reached integer, at_terminal boolean, path_length integer) ON COMMIT DROP;
CREATE TEMP TABLE bpr_new(LIKE bpr_old) ON COMMIT DROP;
CREATE TEMP TABLE bpr_me(LIKE bpr_old) ON COMMIT DROP;
CREATE TEMP TABLE bpr_foreign(n bigint) ON COMMIT DROP;
GRANT INSERT, SELECT ON bpr_results, bpr_old, bpr_new, bpr_me, bpr_foreign TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO bpr_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO bpr_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer,org integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(org)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
-- The query the API ran before 0067, unchanged except that its parameters are function arguments.
CREATE FUNCTION pg_temp.old_progress(org uuid, proj uuid, ids uuid[])
RETURNS TABLE(enrollment_id uuid, activity_id uuid, activity_title text, participation_date date, stage_code text, stage_name text,
  reached integer, at_terminal boolean, path_length integer) LANGUAGE sql AS $$
    SELECT i.id AS enrollment_id, p.activity_id, p.title AS activity_title, p.participation_date,
      s.code AS stage_code, s.name AS stage_name,
      coalesce(r.reached, 0)::int AS reached, coalesce(r.at_terminal, false) AS at_terminal,
      t.path_length::int AS path_length
    FROM unnest(ids) AS i(id)
    CROSS JOIN LATERAL (
      SELECT (count(*) FILTER (WHERE g.stage_type NOT IN ('BRANCH', 'FOLLOW_UP'))
        + count(DISTINCT g.parent_stage_id) FILTER (WHERE g.stage_type = 'BRANCH')) AS path_length
      FROM pathways.journey_stages g
      WHERE g.organization_id = org AND g.project_id = proj
        AND g.archived_at IS NULL) t
    LEFT JOIN LATERAL (
      SELECT x.activity_id, a.title, x.participation_date
      FROM pathways.beneficiary_activity_participations x
      JOIN pathways.project_activities a ON a.id = x.activity_id
      WHERE x.organization_id = org AND x.enrollment_id = i.id
        AND x.project_id = proj
      ORDER BY x.participation_date DESC, x.recorded_at DESC LIMIT 1) p ON true
    LEFT JOIN LATERAL (
      SELECT c.code, c.name FROM (
        SELECT g.code, g.name, 1 AS pri, e.event_date AS day, e.id::text AS tie, g.stage_order
        FROM pathways.beneficiary_journey_events e
        JOIN pathways.journey_stages g ON g.id = e.stage_id AND g.is_terminal AND g.archived_at IS NULL
        WHERE e.organization_id = org AND e.enrollment_id = i.id
          AND e.project_id = proj AND e.corrects_event_id IS NULL
        UNION ALL
        SELECT g.code, g.name, 2, x.participation_date, x.id::text, g.stage_order
        FROM pathways.beneficiary_activity_participations x
        JOIN pathways.activity_journey_stage_mappings m ON m.organization_id = x.organization_id
          AND m.project_id = x.project_id AND m.activity_id = x.activity_id
        JOIN pathways.journey_stages g ON g.id = m.stage_id AND g.archived_at IS NULL
        WHERE x.organization_id = org AND x.enrollment_id = i.id
          AND x.project_id = proj
        UNION ALL
        SELECT g.code, g.name, 3, NULL, g.id::text, g.stage_order
        FROM pathways.journey_stages g
        WHERE g.organization_id = org AND g.project_id = proj
          AND g.archived_at IS NULL) c
      ORDER BY c.pri, c.day DESC NULLS LAST, c.stage_order, c.tie DESC LIMIT 1) s ON true
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT e.stage_id) FILTER (WHERE g.stage_type NOT IN ('ENTRY', 'FOLLOW_UP')) AS reached,
        coalesce(bool_or(g.is_terminal), false) AS at_terminal
      FROM pathways.beneficiary_journey_events e
      JOIN pathways.journey_stages g ON g.id = e.stage_id AND g.archived_at IS NULL
      WHERE e.organization_id = org AND e.enrollment_id = i.id
        AND e.project_id = proj AND e.corrects_event_id IS NULL) r ON true
$$;
CREATE FUNCTION pg_temp.snap(who text, proj uuid, ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; t1 timestamptz; t2 timestamptz;
BEGIN
 t0 := clock_timestamp();
 INSERT INTO bpr_old SELECT proj, o.* FROM pg_temp.old_progress(pg_temp.u(1),proj,ids) o;
 t1 := clock_timestamp();
 INSERT INTO bpr_new SELECT proj, n.* FROM pathways.p05_beneficiary_progress(pg_temp.u(1),proj,ids) n;
 t2 := clock_timestamp();
 RAISE NOTICE 'BENEFICIARY_PROGRESS_TIMING % project % rows %: old % ms, new % ms',who,right(proj::text,3),cardinality(ids),
  round(extract(epoch FROM t1-t0)*1000),round(extract(epoch FROM t2-t1)*1000);
END $$;

-- Org A: Grant Manager u102 (no journeys.read), Project Officer u103, M&E Officer u104. Org B: Project Officer u105.
-- Projects: P1 u301 hand-made journeys, P2 u302 other project, P3 u303 bulk (150 enrollments), P4 u304 no stages, B1 u306 org B.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,5) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'BPR_ORG_A','Synthetic BPR org A'),(pg_temp.u(2),'BPR_ORG_B','Synthetic BPR org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('GRANT_MANAGER','Grant Manager'),('PROJECT_OFFICER','Project Officer'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(v.org),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,1,'GRANT_MANAGER','BPR Seed Owner','bpr-owner@example.invalid'),
  (2,1,'GRANT_MANAGER','BPR Grant Manager','bpr-gm@example.invalid'),
  (3,1,'PROJECT_OFFICER','BPR Project Officer','bpr-po@example.invalid'),
  (4,1,'MONITORING_AND_EVALUATION_OFFICER','BPR M&E Officer','bpr-me@example.invalid'),
  (5,2,'PROJECT_OFFICER','BPR Project Officer B','bpr-po-b@example.invalid')
) v(n,org,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('journeys.read','journeys.read'),('beneficiaries.records.read','beneficiaries.records.read'),
  ('activities.read','activities.read'),('participation.record','participation.record')
ON CONFLICT(code) DO NOTHING;
-- Grants follow the RBAC contract exactly, so no pair outside p09_role_allows is added.
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code IN ('GRANT_MANAGER','PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER')
  AND p.code IN ('journeys.read','beneficiaries.records.read','activities.read','participation.record')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(CASE WHEN n=6 THEN 2 ELSE 1 END),'BPR-P'||n,'BPR project '||n,'2026-01-01','2026-12-31',pg_temp.u(101)
FROM (VALUES (1),(2),(3),(4),(6)) v(n);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(1),pg_temp.u(300+p),pg_temp.u(100+n),pg_temp.u(101)
FROM generate_series(2,4) n CROSS JOIN (VALUES (1),(2),(3),(4)) v(p)
UNION ALL SELECT gen_random_uuid(),pg_temp.u(2),pg_temp.u(306),pg_temp.u(105),pg_temp.u(105);
-- P1 stages: ENTRY, two core stages, two branches of the first core stage, a follow-up, a terminal stage and an archived stage.
INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,parent_stage_id,stage_type,is_terminal,archived_at,created_by_id) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),'ENTRY','Entry',1,NULL,'ENTRY',false,NULL,pg_temp.u(101)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),'SKILLS','Skills',2,NULL,'CORE',false,NULL,pg_temp.u(101)),
  (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),'BR_A','Branch A',3,pg_temp.u(402),'BRANCH',false,NULL,pg_temp.u(101)),
  (pg_temp.u(404),pg_temp.u(1),pg_temp.u(301),'BR_B','Branch B',4,pg_temp.u(402),'BRANCH',false,NULL,pg_temp.u(101)),
  (pg_temp.u(405),pg_temp.u(1),pg_temp.u(301),'PLACE','Placement',5,NULL,'CORE',false,NULL,pg_temp.u(101)),
  (pg_temp.u(406),pg_temp.u(1),pg_temp.u(301),'FOLLOW','Follow-up',6,NULL,'FOLLOW_UP',false,NULL,pg_temp.u(101)),
  (pg_temp.u(407),pg_temp.u(1),pg_temp.u(301),'DONE','Completed',7,NULL,'CORE',true,NULL,pg_temp.u(101)),
  (pg_temp.u(408),pg_temp.u(1),pg_temp.u(301),'OLD','Retired stage',8,NULL,'CORE',false,now(),pg_temp.u(101)),
  (pg_temp.u(421),pg_temp.u(1),pg_temp.u(302),'P2_ENTRY','Other entry',1,NULL,'ENTRY',false,NULL,pg_temp.u(101));
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id)
VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'BPR-A1','Skills workshop','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'BPR-A2','Mentoring','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(301),'BPR-A3','Open day','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(1),pg_temp.u(301),'BPR-A4','Retired mapping','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(505),pg_temp.u(1),pg_temp.u(302),'BPR-A5','Other project activity','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101));
INSERT INTO pathways.activity_journey_stage_mappings(organization_id,project_id,activity_id,stage_id,sequence_order,created_by_id) VALUES
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(402),1,pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(502),pg_temp.u(403),2,pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(504),pg_temp.u(408),3,pg_temp.u(101));
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
SELECT pg_temp.u(1000+n),pg_temp.u(CASE WHEN n>=900 THEN 2 ELSE 1 END),'BPR-'||n,'INDIVIDUAL','Synthetic','Person '||n,true,true,pg_temp.u(101)
FROM (SELECT generate_series(1,12) n UNION ALL SELECT generate_series(100,249) UNION ALL SELECT 900) s;
-- Enrollments u(2000+n): 1-8 and 12 in P1, 9 in P2, 100-249 in P3, 10 and 11 in P4, 900 in org B project B1.
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
SELECT pg_temp.u(2000+n),pg_temp.u(CASE WHEN n=900 THEN 2 ELSE 1 END),
  pg_temp.u(CASE WHEN n=900 THEN 306 WHEN n=9 THEN 302 WHEN n IN (10,11) THEN 304 WHEN n>=100 THEN 303 ELSE 301 END),
  pg_temp.u(1000+n),'2026-01-01',pg_temp.u(101)
FROM (SELECT generate_series(1,12) n UNION ALL SELECT generate_series(100,249) UNION ALL SELECT 900) s;
INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,recorded_at,recorded_by_id) VALUES
  -- e2: latest participation is the unmapped open day, latest mapped one is the workshop.
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2002),pg_temp.u(501),'PRESENT','2026-02-01','2026-02-01 08:00+00',pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2002),pg_temp.u(503),'PRESENT','2026-03-01','2026-03-01 08:00+00',pg_temp.u(101)),
  -- e3: two mapped participations on one day pick the lower stage order; recorded_at breaks the latest-participation tie.
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2003),pg_temp.u(502),'PRESENT','2026-02-10','2026-02-10 09:00+00',pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2003),pg_temp.u(501),'PRESENT','2026-02-10','2026-02-10 10:00+00',pg_temp.u(101)),
  -- e4: only a participation mapped to an archived stage.
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2004),pg_temp.u(504),'PRESENT','2026-02-12','2026-02-12 08:00+00',pg_temp.u(101)),
  -- e5: workshop and mentoring on different days.
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2005),pg_temp.u(501),'PRESENT','2026-01-15','2026-01-15 08:00+00',pg_temp.u(101)),
  (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2005),pg_temp.u(502),'PRESENT','2026-04-15','2026-04-15 08:00+00',pg_temp.u(101)),
  -- e9 belongs to P2 and must be ignored when asked for through P1.
  (pg_temp.u(1),pg_temp.u(302),pg_temp.u(2009),pg_temp.u(505),'PRESENT','2026-02-20','2026-02-20 08:00+00',pg_temp.u(101));
INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,stage_id,event_type,event_date,recorded_by_id,corrects_event_id,correction_reason) VALUES
  -- e6: reached the two branches, the core stage twice and a follow-up; a corrected event and an archived-stage event do not count.
  (pg_temp.u(3001),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(402),'PROGRESS_UPDATE','2026-02-01',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3002),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(402),'PROGRESS_UPDATE','2026-02-05',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3003),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(403),'PROGRESS_UPDATE','2026-02-06',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3004),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(404),'PROGRESS_UPDATE','2026-02-07',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3005),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(406),'FOLLOW_UP','2026-02-08',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3006),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(405),'PROGRESS_UPDATE','2026-02-09',pg_temp.u(101),pg_temp.u(3001),'Synthetic correction'),
  (pg_temp.u(3007),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),pg_temp.u(408),'PROGRESS_UPDATE','2026-02-10',pg_temp.u(101),NULL,NULL),
  -- e7: a terminal event beats any participation mapping; e8: a corrected terminal event does not count.
  (pg_temp.u(3011),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2007),pg_temp.u(407),'COMPLETION','2026-03-01',pg_temp.u(101),NULL,NULL),
  (pg_temp.u(3012),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2008),pg_temp.u(407),'COMPLETION','2026-03-02',pg_temp.u(101),pg_temp.u(3011),'Synthetic correction'),
  -- e12: an event of the same enrollment recorded under another project is ignored.
  (pg_temp.u(3021),pg_temp.u(1),pg_temp.u(302),pg_temp.u(2012),pg_temp.u(407),'COMPLETION','2026-03-03',pg_temp.u(101),NULL,NULL);
INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,recorded_at,recorded_by_id)
VALUES (pg_temp.u(1),pg_temp.u(301),pg_temp.u(2007),pg_temp.u(501),'PRESENT','2026-04-01','2026-04-01 08:00+00',pg_temp.u(101));
-- P3: 8 stages, 4 activities mapped to stages, 150 enrollments with 8 participations each and 2 events each.
INSERT INTO pathways.journey_stages(id,organization_id,project_id,code,name,stage_order,parent_stage_id,stage_type,is_terminal,created_by_id)
SELECT pg_temp.u(430+n),pg_temp.u(1),pg_temp.u(303),'S'||n,'Bulk stage '||n,n,
  CASE WHEN n IN (4,5) THEN pg_temp.u(433) END,
  (CASE WHEN n=1 THEN 'ENTRY' WHEN n IN (4,5) THEN 'BRANCH' WHEN n=7 THEN 'FOLLOW_UP' ELSE 'CORE' END)::pathways.journey_stage_type,n=8,pg_temp.u(101)
FROM generate_series(1,8) n;
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id)
SELECT pg_temp.u(510+n),pg_temp.u(1),pg_temp.u(303),'BPR-B'||n,'Bulk activity '||n,'2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)
FROM generate_series(1,4) n;
INSERT INTO pathways.activity_journey_stage_mappings(organization_id,project_id,activity_id,stage_id,sequence_order,created_by_id)
SELECT pg_temp.u(1),pg_temp.u(303),pg_temp.u(510+n),pg_temp.u(430+n+1),n,pg_temp.u(101) FROM generate_series(1,4) n;
INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,recorded_at,recorded_by_id)
SELECT pg_temp.u(1),pg_temp.u(303),pg_temp.u(2000+e),pg_temp.u(510+1+(e+k)%4),'PRESENT',date '2026-01-01'+((e*7+k*11)%150),
  timestamptz '2026-01-01 08:00+00'+make_interval(mins=>e*3+k),pg_temp.u(101)
FROM generate_series(100,249) e CROSS JOIN generate_series(1,8) k;
INSERT INTO pathways.beneficiary_journey_events(organization_id,project_id,enrollment_id,stage_id,event_type,event_date,recorded_by_id)
SELECT pg_temp.u(1),pg_temp.u(303),pg_temp.u(2000+e),pg_temp.u(430+1+(e+k)%8),'PROGRESS_UPDATE',date '2026-02-01'+((e+k*5)%100),pg_temp.u(101)
FROM generate_series(100,249) e CROSS JOIN generate_series(1,2) k;
SET LOCAL session_replication_role = origin;
ANALYZE pathways.beneficiary_activity_participations;
ANALYZE pathways.beneficiary_journey_events;

-- Catalog checks.
SELECT pg_temp.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='prisma'),
  '1 prisma has neither SUPERUSER nor BYPASSRLS, as on hosted');
SELECT pg_temp.ok((SELECT pg_get_userbyid(proowner)='prisma' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=""']
   FROM pg_proc WHERE oid='pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'::regprocedure),
  '2 the function is a STABLE SECURITY DEFINER owned by prisma with an empty search_path');
SELECT pg_temp.ok(has_function_privilege('pathways_runtime','pathways.p05_beneficiary_progress(uuid,uuid,uuid[])','EXECUTE')
  AND NOT EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
   WHERE has_function_privilege(r.name,'pathways.p05_beneficiary_progress(uuid,uuid,uuid[])','EXECUTE'))
  AND NOT EXISTS(SELECT FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid='pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'::regprocedure
   AND a.grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('prisma','pathways_runtime'))),
  '3 only the owner and the runtime hold EXECUTE');
SELECT pg_temp.ok((SELECT regexp_count(pg_get_functiondef(oid),'p05_has_project_permission')=4
   FROM pg_proc WHERE oid='pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'::regprocedure),
  '4 the function checks its four permissions once and evaluates none per row');

-- Project Officer: new function against the old query, under the runtime role with RLS on.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(3,1);
SELECT pg_temp.snap('po p1',pg_temp.u(301),ARRAY(SELECT pg_temp.u(2000+n) FROM generate_series(1,8) n UNION ALL SELECT pg_temp.u(2012)));
SELECT pg_temp.snap('po p3',pg_temp.u(303),ARRAY(SELECT pg_temp.u(2000+n) FROM generate_series(100,249) n));
SELECT pg_temp.snap('po p4',pg_temp.u(304),ARRAY[pg_temp.u(2010),pg_temp.u(2011)]);
-- Enrollment ids of another project are ignored, and so are unknown ids.
SELECT pg_temp.act_as(4,1);
INSERT INTO bpr_me SELECT pg_temp.u(301),n.* FROM pathways.p05_beneficiary_progress(pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(2006),pg_temp.u(2002)]) n;
-- Enrollment ids of another project or organization and unknown ids are ignored.
INSERT INTO bpr_foreign SELECT count(*) FROM pathways.p05_beneficiary_progress(pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(2009),pg_temp.u(2900),pg_temp.u(2001)]);
INSERT INTO bpr_foreign SELECT count(*) FROM pathways.p05_beneficiary_progress(pg_temp.u(1),pg_temp.u(301),ARRAY[]::uuid[]);
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,ARRAY[%L::uuid])',pg_temp.u(1),pg_temp.u(306),pg_temp.u(2900)),'42501',
  '14 an organization B project is refused for an organization A officer');
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,ARRAY[%L::uuid])',pg_temp.u(2),pg_temp.u(301),pg_temp.u(2001)),'42501',
  '15 an organization argument that differs from the session organization is refused');
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,NULL,ARRAY[%L::uuid])',pg_temp.u(1),pg_temp.u(2001)),'42501',
  '16 a null project is refused');
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,NULL)',pg_temp.u(1),pg_temp.u(301)),'42501',
  '17 a null enrollment list is refused');
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,array_fill(%L::uuid,ARRAY[1001]))',pg_temp.u(1),pg_temp.u(301),pg_temp.u(2001)),'42501',
  '18 more than 1000 enrollment ids are refused');
-- A role without journeys.read is refused.
SELECT pg_temp.act_as(2,1);
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,ARRAY[%L::uuid])',pg_temp.u(1),pg_temp.u(301),pg_temp.u(2001)),'42501',
  '19 a Grant Manager without journeys.read is refused');
-- Organization B officer: own project reads only its own enrollment, organization A is refused.
SELECT pg_temp.act_as(5,2);
INSERT INTO bpr_foreign SELECT count(*) FROM pathways.p05_beneficiary_progress(pg_temp.u(2),pg_temp.u(306),ARRAY[pg_temp.u(2001),pg_temp.u(2900)]);
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,ARRAY[%L::uuid])',pg_temp.u(2),pg_temp.u(301),pg_temp.u(2001)),'42501',
  '20 an organization B officer is refused an organization A project');
SELECT pg_temp.reject(format('SELECT * FROM pathways.p05_beneficiary_progress(%L::uuid,%L::uuid,ARRAY[%L::uuid])',pg_temp.u(1),pg_temp.u(301),pg_temp.u(2001)),'42501',
  '21 an organization B officer cannot name organization A');
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*) FROM bpr_old)=161 AND (SELECT count(*) FROM bpr_new)=161,
  '5 old and new return 161 rows across the three projects');
SELECT pg_temp.ok(NOT EXISTS((SELECT * FROM bpr_old EXCEPT ALL SELECT * FROM bpr_new) UNION ALL (SELECT * FROM bpr_new EXCEPT ALL SELECT * FROM bpr_old)),
  '6 the function returns exactly the old query result on every fixture row, including the 150-enrollment project');
SELECT pg_temp.ok((SELECT count(*) FROM bpr_new WHERE project=pg_temp.u(303) AND stage_code IS NOT NULL AND activity_id IS NOT NULL)=150
  AND (SELECT count(DISTINCT stage_code) FROM bpr_new WHERE project=pg_temp.u(303))>3,
  '7 the bulk project exercises several current stages');
SELECT pg_temp.ok((SELECT stage_code='ENTRY' AND activity_id IS NULL AND reached=0 AND NOT at_terminal AND path_length=5
   FROM bpr_new WHERE enrollment_id=pg_temp.u(2001)),
  '8 an enrollment with nothing recorded sits at the first stage over a 5-step path');
SELECT pg_temp.ok((SELECT activity_title='Open day' AND participation_date='2026-03-01' AND stage_code='SKILLS'
   FROM bpr_new WHERE enrollment_id=pg_temp.u(2002)),
  '9 the latest participation and the latest mapped stage can differ');
SELECT pg_temp.ok((SELECT activity_id=pg_temp.u(501) AND stage_code='SKILLS' FROM bpr_new WHERE enrollment_id=pg_temp.u(2003)),
  '10 same-day ties resolve by recorded time for the participation and by stage order for the stage');
SELECT pg_temp.ok((SELECT stage_code='ENTRY' AND activity_id=pg_temp.u(504) FROM bpr_new WHERE enrollment_id=pg_temp.u(2004))
  AND (SELECT stage_code='BR_A' AND activity_id=pg_temp.u(502) FROM bpr_new WHERE enrollment_id=pg_temp.u(2005)),
  '11 an archived mapped stage is skipped and the latest mapped participation wins');
SELECT pg_temp.ok((SELECT reached=3 AND NOT at_terminal AND stage_code='ENTRY' FROM bpr_new WHERE enrollment_id=pg_temp.u(2006))
  AND (SELECT at_terminal AND stage_code='DONE' FROM bpr_new WHERE enrollment_id=pg_temp.u(2007))
  AND (SELECT NOT at_terminal AND stage_code='ENTRY' FROM bpr_new WHERE enrollment_id=pg_temp.u(2008))
  AND (SELECT reached=0 AND NOT at_terminal FROM bpr_new WHERE enrollment_id=pg_temp.u(2012)),
  '12 reached counts distinct journey stages only, corrections, archived stages and other projects are ignored, a terminal event wins');
SELECT pg_temp.ok((SELECT count(*) FROM bpr_me)=2 AND NOT EXISTS(SELECT * FROM bpr_me EXCEPT SELECT * FROM bpr_new),
  '13 the M&E Officer receives the same rows as the Project Officer');
SELECT pg_temp.ok((SELECT array_agg(n ORDER BY ctid) FROM bpr_foreign)=ARRAY[1,0,1]::bigint[],
  '22 foreign-project, foreign-organization and unknown ids are ignored');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM bpr_results;
 IF total<>22 THEN RAISE EXCEPTION '0067 beneficiary-progress-read checks expected 22 assertions, recorded %',total; END IF;
 RAISE NOTICE 'BENEFICIARY_PROGRESS_READ_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
