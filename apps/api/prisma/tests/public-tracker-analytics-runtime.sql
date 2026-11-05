-- cr-pathways-public-tracker-media-analytics (0087): disposable checks for the actor-free analytics cores, the gated functions that
-- call them, the five-view validator and p87_public_view. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0087 applied.
-- Success prints PUBLIC_TRACKER_ANALYTICS_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Public tracker analytics checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE TEMP TABLE pta_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON pta_out TO pathways_runtime;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a8700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$ SELECT doc FROM pta_out WHERE name=wanted $$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('pta.passed',(coalesce(nullif(current_setting('pta.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Two documents must be equal; the failure shows both.
CREATE FUNCTION pg_temp.same(label text, got jsonb, wanted jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF got IS NULL OR got IS DISTINCT FROM wanted THEN RAISE EXCEPTION 'Assertion % gave % not %',label,got,wanted; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must fail with the expected SQLSTATE and a message that mentions the needle.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Staff context for user 21 (A, submits) or 22 (B, approves and publishes); 0 clears every app and jwt setting.
CREATE FUNCTION pg_temp.act_as(user_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(1)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
-- Moves a publication by one UPDATE as the given user.
CREATE FUNCTION pg_temp.move(user_n integer, project_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',
  assignments,pg_temp.u(1),pg_temp.u(project_n));
END $$;
-- A submits revision 1 with these views, then B approves and publishes it.
CREATE FUNCTION pg_temp.publish_first(project_n integer, views jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
 VALUES(pg_temp.u(1),pg_temp.u(project_n),1,'FOR_REVIEW','SUBMIT','Analytics summary',
  jsonb_build_object('media','[]'::jsonb,'views',views),pg_temp.u(21));
 PERFORM pg_temp.move(22,project_n,$s$state='APPROVED'$s$);
 PERFORM pg_temp.move(22,project_n,$s$state='PUBLISHED'$s$);
END $$;
-- The public read of one view, as the API calls it with no app context.
CREATE FUNCTION pg_temp.pv(project_n integer, view_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(0);
 RETURN pathways.p87_public_view(pg_temp.u(project_n),view_name);
END $$;
-- Records one participation per beneficiary first_n..last_n of project 41, each with its own source submission.
CREATE FUNCTION pg_temp.attend(activity_n integer, first_n integer, last_n integer, on_day date, status text, submission text,
 dummy boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer; sid uuid;
BEGIN
 FOR n IN first_n..last_n LOOP
  sid := gen_random_uuid();
  INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,status,
   validated_by_id,validated_at,rejection_reason,is_dummy_record)
  VALUES(sid,pg_temp.u(1),pg_temp.u(41),pg_temp.u(800),1,gen_random_uuid(),pg_temp.u(21),submission::pathways.submission_status,
   CASE WHEN submission='VALIDATED' THEN pg_temp.u(21) END,CASE WHEN submission='VALIDATED' THEN now() END,
   CASE WHEN submission='REJECTED' THEN 'Synthetic rejection' END,dummy);
  INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,
   participation_date,source_submission_id,recorded_by_id)
  VALUES(pg_temp.u(1),pg_temp.u(41),pg_temp.u(500+n),pg_temp.u(activity_n),status::pathways.attendance_status,on_day,sid,pg_temp.u(21));
 END LOOP;
END $$;

-- Fixtures: one organization, staff A (21) and B (22), both Project Managers assigned to projects 41 to 44.
-- 41 ongoing with every view live, 42 closed with saddd live, 43 with map live and saddd pending, 44 never published.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PTA_A','Synthetic public analytics organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'Synthetic PTA submitter','pta-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'Synthetic PTA publisher','pta-b@example.invalid')) v(id,auth_id,full_name,email)
JOIN pathways.roles r ON r.code='PROJECT_MANAGER';
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,status,implementation_area,start_date,end_date,created_by_id)
SELECT pg_temp.u(v.n),pg_temp.u(1),'PTA_'||v.n,'Synthetic PTA project '||v.n,v.status::pathways.project_status,'Eastern Samar',v.s,v.e,pg_temp.u(21)
FROM (VALUES (41,'ONGOING',pg_temp.today()-60,pg_temp.today()+60),(42,'COMPLETED',DATE '2025-01-01',DATE '2025-06-30'),
 (43,'ONGOING',pg_temp.today()-60,pg_temp.today()+60),(44,'ONGOING',pg_temp.today()-60,pg_temp.today()+60)) v(n,status,s,e);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(900+p*2+s),pg_temp.u(1),pg_temp.u(p),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[41,42,43,44]) p, unnest(ARRAY[1,2]) s;
-- Project 41 beneficiaries 1 to 7 (6 archived, 7 dummy) and project 42 beneficiaries 11 to 13, each with enrollment 500+n.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,sex,birth_date,disability_status,first_name,last_name,
 location_city_municipality,location_province,status,archived_at,is_dummy_record,consent_recorded,data_processing_consent_recorded,created_by_id)
SELECT pg_temp.u(v.n),pg_temp.u(1),'PTA-B'||v.n,'INDIVIDUAL',v.sex::pathways.beneficiary_sex,v.born,v.disability::pathways.disability_status,
 'Synthetic','Person '||v.n,v.town,v.province,(CASE WHEN v.archived THEN 'ARCHIVED' ELSE 'ACTIVE' END)::pathways.profile_status,
 CASE WHEN v.archived THEN now() END,v.dummy,true,true,pg_temp.u(21)
FROM (VALUES
 (1,'MALE',DATE '1990-05-01','WITHOUT_DISABILITY','Borongan City','Eastern Samar',false,false),
 (2,'FEMALE',DATE '2012-03-01','WITH_DISABILITY','Borongan City','Eastern Samar',false,false),
 (3,'FEMALE',DATE '1985-01-01','WITHOUT_DISABILITY','Guiuan','Eastern Samar',false,false),
 (4,'MALE',NULL,'NOT_SPECIFIED','Guiuan','Eastern Samar',false,false),
 (5,'NOT_SPECIFIED',DATE '2000-01-01','WITHOUT_DISABILITY',NULL,NULL,false,false),
 (6,'FEMALE',DATE '1995-01-01','WITHOUT_DISABILITY','Borongan City','Eastern Samar',true,false),
 (7,'MALE',DATE '1995-01-01','WITHOUT_DISABILITY','Borongan City','Eastern Samar',false,true),
 (11,'FEMALE',DATE '1980-01-01','WITHOUT_DISABILITY','Tacloban City','Leyte',false,false),
 (12,'MALE',DATE '2015-01-01','WITH_DISABILITY','Tacloban City','Leyte',false,false),
 (13,'FEMALE',DATE '1999-01-01','WITHOUT_DISABILITY','Palo','Leyte',false,false),
 (14,'MALE',DATE '1970-01-01','WITHOUT_DISABILITY','Palo','Leyte',false,false)) v(n,sex,born,disability,town,province,archived,dummy);
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
SELECT pg_temp.u(500+n),pg_temp.u(1),pg_temp.u(CASE WHEN n<10 THEN 41 ELSE 42 END),pg_temp.u(n),
 CASE WHEN n<10 THEN pg_temp.today()-58 ELSE DATE '2025-01-01' END,pg_temp.u(21)
FROM unnest(ARRAY[1,2,3,4,5,6,7,11,12,13]) n;
-- Project 41 activities: an overdue Workshop, a completed Visit, a cancelled and an archived session; one milestone met on time.
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,
 actual_end_date,status,reviewed_by_id,reviewed_at,cancelled_at,cancellation_reason,archived_at,created_by_id)
SELECT pg_temp.u(v.n),pg_temp.u(1),pg_temp.u(41),'PTA-A'||v.n,v.title,pg_temp.today()-58,pg_temp.today()-v.late,v.started,v.ended,
 v.status::pathways.activity_status,CASE WHEN v.ended IS NOT NULL THEN pg_temp.u(22) END,
 CASE WHEN v.ended IS NOT NULL THEN (v.ended::timestamp+interval '12 hours') AT TIME ZONE 'UTC' END,
 CASE WHEN v.status='CANCELLED' THEN now() END,CASE WHEN v.status='CANCELLED' THEN 'Synthetic cancellation' END,
 CASE WHEN v.archived THEN now() END,pg_temp.u(21)
FROM (VALUES (501,'Workshop',10,pg_temp.today()-58,NULL::date,'IN_PROGRESS',false),
 (502,'Visit',20,pg_temp.today()-58,pg_temp.today()-21,'COMPLETED',false),
 (503,'Cancelled session',20,NULL,NULL,'CANCELLED',false),
 (504,'Archived session',20,pg_temp.today()-58,NULL,'IN_PROGRESS',true)) v(n,title,late,started,ended,status,archived);
INSERT INTO pathways.project_milestones(id,organization_id,project_id,title,target_date,completion_date,status)
VALUES (pg_temp.u(601),pg_temp.u(1),pg_temp.u(41),'Kickoff',pg_temp.today()-50,pg_temp.today()-52,'COMPLETED');
-- Counted attendance (start+3 and today-5 fall in different months): Workshop 3 PRESENT and 1 ABSENT, Visit 2 COMPLETED.
SELECT pg_temp.attend(501,1,3,pg_temp.today()-57,'PRESENT','VALIDATED');
SELECT pg_temp.attend(501,4,4,pg_temp.today()-5,'ABSENT','VALIDATED');
SELECT pg_temp.attend(502,1,2,pg_temp.today()-5,'COMPLETED','VALIDATED');
-- Excluded attendance: archived and dummy beneficiaries, cancelled and archived activities, draft, rejected and dummy submissions,
-- and a record from before the project start.
SELECT pg_temp.attend(501,6,7,pg_temp.today()-57,'PRESENT','VALIDATED');
SELECT pg_temp.attend(503,1,1,pg_temp.today()-57,'PRESENT','VALIDATED');
SELECT pg_temp.attend(504,1,1,pg_temp.today()-57,'PRESENT','VALIDATED');
SELECT pg_temp.attend(501,5,5,pg_temp.today()-57,'PRESENT','DRAFT');
SELECT pg_temp.attend(501,5,5,pg_temp.today()-56,'PRESENT','REJECTED');
SELECT pg_temp.attend(501,5,5,pg_temp.today()-5,'PRESENT','VALIDATED',true);
SELECT pg_temp.attend(501,3,3,pg_temp.today()-70,'PRESENT','VALIDATED');
-- Project 41 indicators: a manual count measured in an earlier and in its current period, a derived Workshop record count and a
-- legacy definition. Project 44 holds one measurement and a release row that no prisma read may see without context.
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,
 direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
VALUES
 (pg_temp.u(701),pg_temp.u(1),pg_temp.u(41),'PTA-MANUAL','People reached','COUNT','people','Synthetic source','MANUAL','COUNT',
  'HIGHER_IS_BETTER',0,pg_temp.today()-60,pg_temp.today()+60,0,20,pg_temp.u(21)),
 (pg_temp.u(702),pg_temp.u(1),pg_temp.u(41),'PTA-DERIVED','Workshop records','COUNT','records','Synthetic source','DERIVED','COUNT',
  'HIGHER_IS_BETTER',0,pg_temp.today()-60,pg_temp.today()+60,0,20,pg_temp.u(21)),
 (pg_temp.u(703),pg_temp.u(1),pg_temp.u(41),'PTA-LEGACY','Legacy indicator','COUNT','people','Synthetic source',NULL,NULL,
  'HIGHER_IS_BETTER',0,pg_temp.today()-60,pg_temp.today()+60,0,20,pg_temp.u(21)),
 (pg_temp.u(704),pg_temp.u(1),pg_temp.u(44),'PTA-HIDDEN','Unpublished count','COUNT','people','Synthetic source','MANUAL','COUNT',
  'HIGHER_IS_BETTER',0,pg_temp.today()-60,pg_temp.today()+60,0,20,pg_temp.u(21));
INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,activity_id,created_by_id)
VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(702),'PARTICIPATION_RECORD_COUNT',pg_temp.u(501),pg_temp.u(21));
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,
 client_measurement_id,request_hash,recorded_by_id)
VALUES
 (pg_temp.u(711),pg_temp.u(1),pg_temp.u(41),pg_temp.u(701),pg_temp.today()-120,pg_temp.today()-61,5,'Synthetic report',pg_temp.u(721),repeat('a',64),pg_temp.u(21)),
 (pg_temp.u(712),pg_temp.u(1),pg_temp.u(41),pg_temp.u(701),pg_temp.today()-60,pg_temp.today()+60,12,'Synthetic report',pg_temp.u(722),repeat('a',64),pg_temp.u(21)),
 (pg_temp.u(713),pg_temp.u(1),pg_temp.u(44),pg_temp.u(704),pg_temp.today()-60,pg_temp.today()+60,7,'Synthetic report',pg_temp.u(723),repeat('a',64),pg_temp.u(21));
INSERT INTO pathways.sensitive_aggregate_releases(organization_id,project_id,period_start,period_end,policy_version,source_fingerprint,status)
VALUES (pg_temp.u(1),pg_temp.u(44),pg_temp.today()-60,pg_temp.today()+60,'FIXED_CLOSED_PROJECT_PERIOD_V2',repeat('b',64),'RELEASED');
SET LOCAL session_replication_role = origin;

-- Publications, as the runtime: 41 with every view, 42 with saddd, 43 with map live and saddd only in the pending revision 2.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.publish_first(41,'["saddd","map","kpi","timeline","participation"]');
SELECT pg_temp.publish_first(42,'["saddd"]');
SELECT pg_temp.publish_first(43,'["map"]');
SELECT pg_temp.move(21,43,$$revision=2,state='FOR_REVIEW',snapshot='{"media":[],"views":["map","saddd"]}'$$);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('views kept in snapshot order', (SELECT live_snapshot->'views'='["saddd","map","kpi","timeline","participation"]'::jsonb
 FROM pathways.project_publications WHERE project_id=pg_temp.u(41)));

-- Catalog: the public read is runtime-only, the validator keeps its runtime grant, and every core is internal.
SELECT pg_temp.ok('catalog public view', (SELECT pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s'
  AND p.proconfig=ARRAY['search_path=""'] AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 FROM pg_proc p WHERE p.oid='pathways.p87_public_view(uuid,text)'::regprocedure)
 AND has_function_privilege('pathways_runtime','pathways.p85_publication_views(jsonb)','EXECUTE'));
CREATE FUNCTION pg_temp.internal(sig text) RETURNS boolean LANGUAGE sql AS $$
 SELECT pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
  AND (SELECT array_agg(a.grantee::regrole::text) FROM aclexplode(p.proacl) a)=ARRAY['prisma']
 FROM pg_proc p WHERE p.oid=to_regprocedure(sig)
$$;

-- saddd: the gated release and calculator return the core's JSON for the ongoing project 41.
SELECT pg_temp.ok('catalog saddd core', pg_temp.internal('pathways.p87_saddd_core(uuid,uuid,date,date,text)')
 AND pg_temp.internal('pathways.p87_saddd_fingerprint(uuid,uuid,jsonb)'));
-- With no app context prisma reads a release row only of a project whose live view is saddd: not project 44's.
SET LOCAL ROLE prisma;
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('p87 live policy saddd', NOT EXISTS(SELECT FROM pathways.sensitive_aggregate_releases WHERE organization_id=pg_temp.u(1)));
RESET ROLE;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_saddd', pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(41)],pg_temp.today()-60,pg_temp.today()+60,'Asia/Manila');
INSERT INTO pta_out SELECT 'gated_map', pathways.p06_saddd_by_place(pg_temp.u(1),pg_temp.u(41),'Asia/Manila');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_compute_saddd', pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(41)],pg_temp.today()-60,pg_temp.today(),'Asia/Manila');
SELECT pg_temp.act_as(0);
INSERT INTO pta_out SELECT 'core_saddd', pathways.p87_saddd_core(pg_temp.u(1),pg_temp.u(41),pg_temp.today()-60,pg_temp.today(),'Asia/Manila');
INSERT INTO pta_out SELECT 'core_map', pathways.p87_saddd_by_place_core(pg_temp.u(1),pg_temp.u(41),'Asia/Manila');
SELECT pg_temp.ok('saddd fixture counts', (pg_temp.doc('core_saddd')->'total'->>'value')::int=5
 AND pg_temp.doc('gated_saddd')->>'releaseState'='RELEASED');
SELECT pg_temp.same('gated_equals_core_saddd release', pg_temp.doc('gated_saddd')-'releaseState', pg_temp.doc('core_saddd'));
SELECT pg_temp.same('gated_equals_core_saddd calculator', pg_temp.doc('gated_compute_saddd'), pg_temp.doc('core_saddd'));
SELECT pg_temp.ok('map fixture towns', jsonb_array_length(pg_temp.doc('core_map'))=3
 AND pg_temp.doc('core_map')->0->>'town'='Borongan City' AND (pg_temp.doc('core_map')->0->>'total')::int=2);
SELECT pg_temp.same('gated_equals_core_map', pg_temp.doc('gated_map'), pg_temp.doc('core_map'));

-- saddd and map, public: the same figures with no actor, and the map carries no overview or budget at any depth.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pta_out SELECT 'public_saddd', pg_temp.pv(41,'saddd');
INSERT INTO pta_out SELECT 'public_map', pg_temp.pv(41,'map');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('public_view_needs_no_actor saddd', pg_temp.doc('public_saddd'), jsonb_build_object('total',pg_temp.doc('core_saddd')->'total',
 'sex',pg_temp.doc('core_saddd')->'sex','age',pg_temp.doc('core_saddd')->'age','disability',pg_temp.doc('core_saddd')->'disability'));
SELECT pg_temp.same('public_view_needs_no_actor map', pg_temp.doc('public_map'),
 jsonb_build_object('area','Eastern Samar','towns',pg_temp.doc('core_map')));
SELECT pg_temp.ok('map_has_no_budget', NOT jsonb_path_exists(pg_temp.doc('public_map'),'lax $.**.overview')
 AND NOT jsonb_path_exists(pg_temp.doc('public_map'),'lax $.**.budget')
 AND NOT jsonb_path_exists(pg_temp.doc('public_map'),'lax $.**.budgetUtilization'));

-- saddd on the closed project 42: before any release, after the first release, and after a source change (stale).
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pta_out SELECT 'public_closed_first', pg_temp.pv(42,'saddd');
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_closed', pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(42)],'2025-01-01','2025-06-30','Asia/Manila');
INSERT INTO pta_out SELECT 'public_closed_released', pg_temp.pv(42,'saddd');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('closed release recorded', (pg_temp.doc('gated_closed')->'total'->>'value')::int=3
 AND EXISTS(SELECT FROM pathways.sensitive_aggregate_releases WHERE project_id=pg_temp.u(42) AND status='RELEASED'));
SELECT pg_temp.same('saddd closed before release', pg_temp.doc('public_closed_first'), pg_temp.doc('public_closed_released'));
SELECT pg_temp.same('saddd closed released', pg_temp.doc('public_closed_released'),
 (SELECT jsonb_build_object('total',d->'total','sex',d->'sex','age',d->'age','disability',d->'disability') FROM pg_temp.doc('gated_closed') d));
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
VALUES (pg_temp.u(514),pg_temp.u(1),pg_temp.u(42),pg_temp.u(14),'2025-01-01',pg_temp.u(21));
SET LOCAL session_replication_role = origin;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pta_out SELECT 'public_closed_changed', pg_temp.pv(42,'saddd');
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_closed_stale', pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(42)],'2025-01-01','2025-06-30','Asia/Manila');
INSERT INTO pta_out SELECT 'public_closed_stale', pg_temp.pv(42,'saddd');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('saddd closed changed source', pg_temp.doc('public_closed_changed')->'total'->>'reason'='RESTATEMENT_REVIEW_REQUIRED'
 AND pg_temp.doc('gated_closed_stale')->>'releaseState'='STALE');
SELECT pg_temp.same('saddd closed stale', pg_temp.doc('public_closed_stale'),
 (SELECT jsonb_build_object('total',d->'total','sex',d->'sex','age',d->'age','disability',d->'disability') FROM pg_temp.doc('gated_closed_stale') d));
SELECT pg_temp.same('saddd closed stale before internal read', pg_temp.doc('public_closed_changed'), pg_temp.doc('public_closed_stale'));

-- kpi: the gated list and value return the core's JSON; the public read keeps one ACTIVE row per code, its latest period.
SELECT pg_temp.ok('catalog kpi cores', pg_temp.internal('pathways.p87_indicator_value_core(uuid,uuid,uuid,text)')
 AND pg_temp.internal('pathways.p87_indicator_values_core(uuid,uuid,text)'));
-- With no app context prisma reads the KPI sources only of a project whose live view is kpi: project 41, not 44.
SET LOCAL ROLE prisma;
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('p87 live policy kpi', (SELECT count(*)=2 AND bool_and(project_id=pg_temp.u(41)) FROM pathways.project_indicator_measurements
  WHERE organization_id=pg_temp.u(1))
 AND (SELECT count(*)=1 FROM pathways.project_indicator_bindings WHERE organization_id=pg_temp.u(1)));
RESET ROLE;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_kpi', pathways.p06_indicator_values(pg_temp.u(41),'Asia/Manila');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_kpi_value', pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(41),pg_temp.u(701),'Asia/Manila');
SELECT pg_temp.act_as(0);
INSERT INTO pta_out SELECT 'core_kpi', to_jsonb(pathways.p87_indicator_values_core(pg_temp.u(1),pg_temp.u(41),'Asia/Manila'));
INSERT INTO pta_out SELECT 'core_kpi_value', pathways.p87_indicator_value_core(pg_temp.u(1),pg_temp.u(41),pg_temp.u(701),'Asia/Manila');
SELECT pg_temp.ok('kpi fixture values', jsonb_array_length(pg_temp.doc('core_kpi'))=3
 AND pg_temp.doc('core_kpi_value')->'current'->>'value'='12' AND pg_temp.doc('core_kpi_value')->>'measurementId'=pg_temp.u(712)::text
 AND (SELECT v->'current'->>'value'='4' FROM jsonb_array_elements(pg_temp.doc('core_kpi')) v WHERE v->>'code'='PTA-DERIVED'));
SELECT pg_temp.same('gated_equals_core_kpi list', pg_temp.doc('gated_kpi'), pg_temp.doc('core_kpi'));
SELECT pg_temp.same('gated_equals_core_kpi value', pg_temp.doc('gated_kpi_value'), pg_temp.doc('core_kpi_value'));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO pta_out SELECT 'public_kpi', pg_temp.pv(41,'kpi');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.same('public_view_needs_no_actor kpi', pg_temp.doc('public_kpi'),
 (SELECT jsonb_agg(v ORDER BY v->>'code') FROM jsonb_array_elements(pg_temp.doc('gated_kpi')) v WHERE v->>'status'='ACTIVE'));
SELECT pg_temp.ok('kpi_latest_period', (SELECT count(*)=1 AND bool_and(v->'current'->>'value'='12')
  AND bool_and(v->>'periodEnd'=to_char(pg_temp.today()+60,'YYYY-MM-DD')) FROM jsonb_array_elements(pg_temp.doc('public_kpi')) v
  WHERE v->>'code'='PTA-MANUAL')
 AND NOT pg_temp.doc('public_kpi') @> '[{"code":"PTA-LEGACY"}]');

-- timeline: the gated aggregate and last completion return the cores' values; the public read adds the project dates and status.
SELECT pg_temp.ok('catalog timeline cores', pg_temp.internal('pathways.p87_timeline_core(uuid,uuid,date)')
 AND pg_temp.internal('pathways.p87_timeline_last_completion_core(uuid,uuid)'));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_timeline', pathways.p10_f9_timeline_aggregate(pg_temp.u(1),pg_temp.u(41),pg_temp.today());
INSERT INTO pta_out SELECT 'gated_last', to_jsonb(pathways.p10_f9_timeline_last_completion(pg_temp.u(1),pg_temp.u(41)));
INSERT INTO pta_out SELECT 'public_timeline', pg_temp.pv(41,'timeline');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as(0);
INSERT INTO pta_out SELECT 'core_timeline', pathways.p87_timeline_core(pg_temp.u(1),pg_temp.u(41),pg_temp.today());
INSERT INTO pta_out SELECT 'core_last', to_jsonb(pathways.p87_timeline_last_completion_core(pg_temp.u(1),pg_temp.u(41)));
SELECT pg_temp.ok('timeline fixture counts', (pg_temp.doc('core_timeline')->'activities')=
 '{"eligible":2,"completed":1,"overdue":1,"missingDates":0,"maxOverdueDays":10}'::jsonb
 AND (pg_temp.doc('core_timeline')->'milestones')='{"completed":1,"rated":1,"onTime":1}'::jsonb
 AND pg_temp.doc('core_last')=to_jsonb(pg_temp.today()-21));
SELECT pg_temp.same('gated_equals_core_timeline', pg_temp.doc('gated_timeline'), pg_temp.doc('core_timeline'));
SELECT pg_temp.same('gated_equals_core_timeline last completion', pg_temp.doc('gated_last'), pg_temp.doc('core_last'));
SELECT pg_temp.same('public_view_needs_no_actor timeline', pg_temp.doc('public_timeline'), jsonb_build_object(
 'project',jsonb_build_object('status','ONGOING','startDate',to_char(pg_temp.today()-60,'YYYY-MM-DD'),'endDate',to_char(pg_temp.today()+60,'YYYY-MM-DD')),
 'aggregate',pg_temp.doc('core_timeline'),'lastCompletion',NULL));

-- participation: the gated breakdown returns the core's JSON, and the public read has the exact fixture counts.
SELECT pg_temp.ok('catalog participation core', pg_temp.internal('pathways.p87_participation_core(uuid,uuid,date,date)'));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
INSERT INTO pta_out SELECT 'gated_parts', pathways.p06_participation_breakdown(pg_temp.u(41),pg_temp.today()-60,pg_temp.today());
INSERT INTO pta_out SELECT 'gated_parts_all', pathways.p06_participation_breakdown(pg_temp.u(41),NULL,NULL);
INSERT INTO pta_out SELECT 'public_parts', pg_temp.pv(41,'participation');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.act_as(0);
INSERT INTO pta_out SELECT 'core_parts', pathways.p87_participation_core(pg_temp.u(1),pg_temp.u(41),pg_temp.today()-60,pg_temp.today());
INSERT INTO pta_out SELECT 'core_parts_all', pathways.p87_participation_core(pg_temp.u(1),pg_temp.u(41),NULL,NULL);
SELECT pg_temp.same('gated_equals_core_participation', pg_temp.doc('gated_parts'), pg_temp.doc('core_parts'));
SELECT pg_temp.same('gated_equals_core_participation all time', pg_temp.doc('gated_parts_all'), pg_temp.doc('core_parts_all'));
SELECT pg_temp.same('participation exact counts', pg_temp.doc('public_parts'), jsonb_build_object('projectId',pg_temp.u(41),'total',6,
 'totalSuppressed',false,
 'byActivity',jsonb_build_array(
  jsonb_build_object('activityId',pg_temp.u(502),'activityName','Visit','count',2,'suppressed',false),
  jsonb_build_object('activityId',pg_temp.u(501),'activityName','Workshop','count',4,'suppressed',false)),
 'byMonth',jsonb_build_array(
  jsonb_build_object('month',to_char(pg_temp.today()-57,'YYYY-MM'),'count',3,'suppressed',false),
  jsonb_build_object('month',to_char(pg_temp.today()-5,'YYYY-MM'),'count',3,'suppressed',false)),
 'byAttendanceStatus',jsonb_build_array(
  jsonb_build_object('status','PRESENT','count',3,'suppressed',false),jsonb_build_object('status','ABSENT','count',1,'suppressed',false),
  jsonb_build_object('status','COMPLETED','count',2,'suppressed',false),jsonb_build_object('status','NOT_COMPLETED','count',0,'suppressed',false),
  jsonb_build_object('status','EXCUSED','count',0,'suppressed',false))));
SELECT pg_temp.ok('participation all time includes the pre-start record', (pg_temp.doc('core_parts_all')->>'total')::int=7);

-- public_view_requires_live: a view missing from the live snapshot, one only in the pending revision, an unknown view, another session.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('public_view_requires_live not chosen', pg_temp.pv(42,'kpi') IS NULL AND pg_temp.pv(43,'kpi') IS NULL
 AND pg_temp.pv(41,'survey') IS NULL AND pg_temp.pv(44,'saddd') IS NULL AND pg_temp.pv(41,NULL) IS NULL);
SELECT pg_temp.ok('public_view_requires_live pending revision', pg_temp.pv(43,'saddd') IS NULL AND pg_temp.pv(43,'map') IS NOT NULL);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.refused('public_view_requires_live other session', format('SELECT pathways.p87_public_view(%L,%L)',pg_temp.u(41),'kpi'),
 '42501','Public analytics');

-- views_validator: a repeated or unknown view is refused when A submits.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('views_validator repeated', format($s$UPDATE pathways.project_publications SET revision=2,state='FOR_REVIEW',
 snapshot='{"media":[],"views":["kpi","kpi"]}' WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),
 '23514','Public view selection');
SELECT pg_temp.refused('views_validator unknown', format($s$UPDATE pathways.project_publications SET revision=2,state='FOR_REVIEW',
 snapshot='{"media":[],"views":["survey"]}' WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),
 '23514','Public view selection');

-- public_view_requires_live after withdraw: B withdraws 43 under its pending draft and 41 outright; nothing answers afterwards.
SELECT pg_temp.move(22,43,$$live_snapshot=NULL$$);
SELECT pg_temp.move(22,41,$$revision=2,state='FOR_REVIEW',live_snapshot=NULL$$);
SELECT pg_temp.ok('public_view_requires_live withdrawn', pg_temp.pv(43,'map') IS NULL AND pg_temp.pv(41,'kpi') IS NULL
 AND pg_temp.pv(41,'saddd') IS NULL AND pg_temp.pv(41,'map') IS NULL AND pg_temp.pv(41,'timeline') IS NULL
 AND pg_temp.pv(41,'participation') IS NULL);
RESET SESSION AUTHORIZATION;
-- The live policies follow the withdraw: prisma without context no longer sees project 41's KPI sources, only 42's release row.
SET LOCAL ROLE prisma;
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('p87 live policies after withdraw', NOT EXISTS(SELECT FROM pathways.project_indicator_measurements
 WHERE organization_id=pg_temp.u(1)) AND NOT EXISTS(SELECT FROM pathways.project_indicator_bindings WHERE organization_id=pg_temp.u(1))
 AND (SELECT count(*)=1 AND bool_and(project_id=pg_temp.u(42)) FROM pathways.sensitive_aggregate_releases WHERE organization_id=pg_temp.u(1)));
RESET ROLE;

SELECT 'PUBLIC_TRACKER_ANALYTICS_RUNTIME=PASS ('||current_setting('pta.passed')||')' AS result \gset
ROLLBACK;
\echo :result
