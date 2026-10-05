-- cr-pathways-beneficiary-reach-kpi-values (migration 0065): runtime checks for the released reach counts,
-- pathways.p06_participation_breakdown (exact counts) and pathways.p06_indicator_values. Synthetic fixtures only; everything rolls
-- back. Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0065.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0065 beneficiary-reach-kpi-values checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE TEMP TABLE brk_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE brk_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON brk_results TO pathways_runtime;
GRANT INSERT, SELECT ON brk_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO brk_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO brk_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer,org integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(org)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT doc FROM brk_out WHERE name=wanted
$$;
-- Enrolls `people` individuals and `grp` groups as beneficiaries u(base+n) with enrollments u(base+500+n).
CREATE FUNCTION pg_temp.enroll(project integer,base integer,people integer,grp integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
  SELECT pg_temp.u(base+n),pg_temp.u(1),'BRK-'||(base+n),
   (CASE WHEN n<=people THEN 'INDIVIDUAL' ELSE 'GROUP' END)::pathways.beneficiary_subject_type,'Synthetic','Person '||(base+n),true,true,pg_temp.u(101)
  FROM generate_series(1,people+grp) n;
  INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
  SELECT pg_temp.u(base+500+n),pg_temp.u(1),pg_temp.u(project),pg_temp.u(base+n),'2026-01-01',pg_temp.u(101)
  FROM generate_series(1,people+grp) n;
$$;
-- Records one participation per beneficiary first_n..last_n, each with its own source submission.
CREATE FUNCTION pg_temp.attend(project integer,activity integer,base integer,first_n integer,last_n integer,on_day date,status text,submission text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer; sid uuid;
BEGIN
 FOR n IN first_n..last_n LOOP
  sid := gen_random_uuid();
  INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,status,validated_by_id,validated_at)
  VALUES(sid,pg_temp.u(1),pg_temp.u(project),pg_temp.u(700),1,gen_random_uuid(),pg_temp.u(101),submission::pathways.submission_status,
   CASE WHEN submission='VALIDATED' THEN pg_temp.u(101) END,CASE WHEN submission='VALIDATED' THEN now() END);
  INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,source_submission_id,recorded_by_id)
  VALUES(pg_temp.u(1),pg_temp.u(project),pg_temp.u(base+500+n),pg_temp.u(activity),status::pathways.attendance_status,on_day,sid,pg_temp.u(101));
 END LOOP;
END $$;

-- Org A: Program Manager u101, Grant Manager u102, Project Officer u103, M&E Officer u104. Org B: Grant Manager u105.
-- Projects: A1 u301 visible counts, A2 u302 unassigned, A3 u303 attending complement, A4 u304 records complement,
-- A5 u305 small cohort, B1 u306 org B, A6 u307 records vs attending, A7 u308 small individuals with visible records,
-- A8 u309 records vs individuals.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,5) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'BRK_ORG_A','Synthetic BRK org A'),(pg_temp.u(2),'BRK_ORG_B','Synthetic BRK org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),('GRANT_MANAGER','Grant Manager'),('PROJECT_OFFICER','Project Officer'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(v.org),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,1,'PROGRAM_MANAGER','BRK Program Manager','brk-pgm@example.invalid'),
  (2,1,'GRANT_MANAGER','BRK Grant Manager A','brk-gm-a@example.invalid'),
  (3,1,'PROJECT_OFFICER','BRK Project Officer','brk-po@example.invalid'),
  (4,1,'MONITORING_AND_EVALUATION_OFFICER','BRK M&E Officer','brk-me@example.invalid'),
  (5,2,'GRANT_MANAGER','BRK Grant Manager B','brk-gm-b@example.invalid')
) v(n,org,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),('monitoring.read','monitoring.read'),
  ('analytics.descriptive.read','analytics.descriptive.read'),
  ('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),('reports.indicator.read','reports.indicator.read')
ON CONFLICT(code) DO NOTHING;
-- Grants follow the RBAC contract exactly, so no pair outside p09_role_allows is added.
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER')
  AND p.code IN ('projects.read','monitoring.read','analytics.descriptive.read','beneficiaries.aggregates.read','reports.indicator.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(CASE WHEN n=6 THEN 2 ELSE 1 END),'BRK-P'||n,'BRK project '||n,'2026-01-01','2026-12-31',pg_temp.u(101)
FROM generate_series(1,9) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(1),pg_temp.u(300+v.p),pg_temp.u(100+n),pg_temp.u(101)
FROM generate_series(1,4) n CROSS JOIN (VALUES (1),(3),(4),(5),(7),(8),(9)) v(p)
UNION ALL SELECT gen_random_uuid(),pg_temp.u(2),pg_temp.u(306),pg_temp.u(105),pg_temp.u(105);
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id)
VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'BRK-A1','Workshop','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'BRK-A2','Visit','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(303),'BRK-A3','Session','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(1),pg_temp.u(303),'BRK-A4','Follow-up','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(505),pg_temp.u(1),pg_temp.u(307),'BRK-A5','Training','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(506),pg_temp.u(1),pg_temp.u(309),'BRK-A6','Clinic','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101));
-- A1: 20 individuals; 9 present at the Workshop in February and 2 of them again in April, 3 absent from the Visit in March, one draft excluded.
SELECT pg_temp.enroll(301,1000,20,0);
SELECT pg_temp.attend(301,501,1000,1,9,'2026-02-10','PRESENT','VALIDATED');
SELECT pg_temp.attend(301,502,1000,10,12,'2026-03-10','ABSENT','VALIDATED');
SELECT pg_temp.attend(301,502,1000,1,1,'2026-03-10','PRESENT','DRAFT');
SELECT pg_temp.attend(301,501,1000,1,2,'2026-04-10','PRESENT','VALIDATED');
-- A3: 8 individuals, 6 present at the Session, and person 1 alone at five Follow-up sessions.
SELECT pg_temp.enroll(303,2000,8,0);
SELECT pg_temp.attend(303,503,2000,1,6,'2026-02-10','PRESENT','VALIDATED');
SELECT pg_temp.attend(303,504,2000,1,1,make_date(2026,2,d),'PRESENT','VALIDATED') FROM generate_series(11,15) d;
-- A4: 6 individuals and 1 group. A5: 3 individuals.
SELECT pg_temp.enroll(304,3000,6,1);
SELECT pg_temp.enroll(305,4000,3,0);
-- A6: 20 individuals, 8 present at the Training and 2 of them again, so records are 2 above attending. A7: 2 individuals and 5 groups.
-- A8: 10 individuals, 7 present at the Clinic, so records and attending are 3 below individuals.
SELECT pg_temp.enroll(307,5000,20,0);
SELECT pg_temp.attend(307,505,5000,1,8,'2026-02-10','PRESENT','VALIDATED');
SELECT pg_temp.attend(307,505,5000,1,2,'2026-02-11','PRESENT','VALIDATED');
SELECT pg_temp.enroll(308,6000,2,5);
SELECT pg_temp.enroll(309,7000,10,0);
SELECT pg_temp.attend(309,506,7000,1,7,'2026-02-10','PRESENT','VALIDATED');
-- A1 indicators: a manual count measured at 12 and a derived count bound to the Visit (3 records from 3 people).
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),'BRK-MANUAL','People trained','Private definition note','COUNT','people','Synthetic manual source','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(104)),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),'BRK-DERIVED','Visit records',NULL,'COUNT','records','Synthetic derived source','DERIVED','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(104));
INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,activity_id,created_by_id)
VALUES (pg_temp.u(1),pg_temp.u(301),pg_temp.u(602),'PARTICIPATION_RECORD_COUNT',pg_temp.u(502),pg_temp.u(104));
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,recorded_by_id)
VALUES (pg_temp.u(701),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',12,'Synthetic field report',pg_temp.u(702),repeat('a',64),pg_temp.u(104));
SET LOCAL session_replication_role = origin;

-- Catalog checks.
SELECT pg_temp.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='prisma'),
  '1 prisma has neither SUPERUSER nor BYPASSRLS, as on hosted');
SELECT pg_temp.ok(has_function_privilege('pathways_runtime','pathways.p06_participation_breakdown(uuid,date,date)','EXECUTE')
  AND has_function_privilege('pathways_runtime','pathways.p06_indicator_values(uuid,text)','EXECUTE')
  AND NOT EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name), (VALUES
   ('pathways.p06_participation_breakdown(uuid,date,date)'),('pathways.p06_indicator_values(uuid,text)')) f(fn)
   WHERE has_function_privilege(r.name,f.fn,'EXECUTE')),
  '2 only the runtime executes the two release functions');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways.p06_complement_cell(jsonb,jsonb)','EXECUTE')
  AND NOT has_function_privilege('pathways_runtime','pathways.p06_release_reach(jsonb)','EXECUTE'),
  '3 reach helpers are owner only');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='pathways' AND c.relname IN ('beneficiaries','beneficiary_project_enrollments','beneficiary_activity_participations',
    'project_activities','form_submissions','project_milestones','project_indicators')
   AND (pg_get_userbyid(c.relowner)<>'prisma' OR c.relforcerowsecurity))
  AND (SELECT count(*) FROM pg_policy WHERE polname IN ('p06_binding_owner_read','p06_measurement_owner_read')
   AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='prisma')])=2,
  '4 sources are prisma-owned and unforced, or forced with a prisma owner read policy');
SELECT pg_temp.ok(NOT pathways.p09_role_allows('PROJECT_OFFICER','monitoring.read'),
  '5 Project Officer holds no monitoring.read in the contract');

-- Program Manager.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1,1);
INSERT INTO brk_out SELECT 'pm_a'||p, pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(300+p)],'2026-01-01','2026-06-30','Asia/Manila')
 FROM (VALUES (1),(3),(4),(5),(7),(8),(9)) v(p);
INSERT INTO brk_out SELECT 'pm_home_a1', pathways.p06_home_dashboard(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
INSERT INTO brk_out SELECT 'pm_parts', pathways.p06_participation_breakdown(pg_temp.u(301),NULL,NULL);
INSERT INTO brk_out SELECT 'pm_parts_feb', pathways.p06_participation_breakdown(pg_temp.u(301),'2026-02-01','2026-02-28');
INSERT INTO brk_out SELECT 'pm_parts_a3', pathways.p06_participation_breakdown(pg_temp.u(303),NULL,NULL);
INSERT INTO brk_out SELECT 'pm_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(302),'Asia/Manila'),'42501',
  '6a an unassigned project is refused for indicator values');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(302)),'42501',
  '6b an unassigned project is refused for the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,%L::date,NULL)',pg_temp.u(301),'2026-02-01'),'22023',
  '6c a half period is refused');
-- Grant Manager and M&E Officer read through the same functions.
SELECT pg_temp.act_as(2,1);
INSERT INTO brk_out SELECT 'gm_a1', pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
INSERT INTO brk_out SELECT 'gm_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
SELECT pg_temp.act_as(4,1);
INSERT INTO brk_out SELECT 'me_kpi', pathways.p06_indicator_values(pg_temp.u(301),'Asia/Manila');
INSERT INTO brk_out SELECT 'me_parts', pathways.p06_participation_breakdown(pg_temp.u(301),NULL,NULL);
-- Project Officer keeps the home placeholder and is refused every release.
SELECT pg_temp.act_as(3,1);
INSERT INTO brk_out SELECT 'po_home', pathways.p06_home_dashboard(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-06-30','Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p06_monitoring(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
  pg_temp.u(1),pg_temp.u(301),'2026-01-01','2026-06-30','Asia/Manila'),'42501','25 Project Officer is refused monitoring');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(301)),'42501',
  '26 Project Officer is refused the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(301),'Asia/Manila'),'42501',
  '27 Project Officer is refused indicator values');
-- Org B Grant Manager cannot reach org A.
SELECT pg_temp.act_as(5,2);
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_values(%L::uuid,%L)',pg_temp.u(301),'Asia/Manila'),'42501',
  '28 another organization is refused indicator values');
SELECT pg_temp.reject(format('SELECT pathways.p06_participation_breakdown(%L::uuid,NULL,NULL)',pg_temp.u(301)),'42501',
  '29 another organization is refused the participation breakdown');
SELECT pg_temp.reject(format('SELECT pathways.p06_monitoring(%L::uuid,ARRAY[%L::uuid],%L::date,%L::date,%L)',
  pg_temp.u(2),pg_temp.u(301),'2026-01-01','2026-06-30','Asia/Manila'),'42501','30 another organization is refused monitoring');
RESET ROLE;

-- Reach counts.
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,value}'='20' AND d#>>'{enrolledIndividuals,value}'='20'
  AND d#>>'{attendingIndividuals,value}'='9' AND d#>>'{participationRecords,value}'='14' FROM pg_temp.doc('pm_a1') d),
  '7 A1 releases visible reach counts and excludes the draft submission');
SELECT pg_temp.ok((SELECT d#>>'{enrolledIndividuals,value}'='8' AND d#>>'{attendingIndividuals,state}'='SUPPRESSED'
  AND d#>>'{attendingIndividuals,reason}'='COMPLEMENTARY_SUPPRESSION' AND d#>>'{attendingIndividuals,value}' IS NULL
  FROM pg_temp.doc('pm_a3') d),
  '8 attending individuals are hidden when enrolled minus attending is 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,value}'='7' AND d#>>'{enrolledIndividuals,state}'='SUPPRESSED'
  AND d#>>'{enrolledIndividuals,reason}'='COMPLEMENTARY_SUPPRESSION' FROM pg_temp.doc('pm_a4') d),
  '9 enrolled individuals are hidden when records minus individuals is 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,reason}'='SMALL_COHORT' AND d#>>'{enrolledIndividuals,reason}'='SMALL_COHORT'
  AND d#>>'{enrolledIndividuals,state}'='SUPPRESSED' AND d#>>'{attendingIndividuals,state}'='ZERO' FROM pg_temp.doc('pm_a5') d),
  '10 counts of 1-4 are SUPPRESSED as SMALL_COHORT and zero stays visible');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM brk_out o,
  unnest(ARRAY['participationRecords','attendingIndividuals','enrolledBeneficiaryRecords','enrolledIndividuals']) k
  WHERE o.name LIKE 'pm\_a%' AND o.doc->k->>'value' IN ('1','2','3','4')),
  '11 no released reach cell carries a value of 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledIndividuals,value}'='20' AND d#>>'{participationRecords,value}'='14'
  FROM pg_temp.doc('pm_home_a1') d),
  '12 the home dashboard releases the same counts to a monitoring.read holder');
-- Participation breakdown: exact counts for every cell, including 1-4.
SELECT pg_temp.ok((SELECT d->>'total'='14' AND d->>'totalSuppressed'='false'
  AND d->'byActivity'=jsonb_build_array(
   jsonb_build_object('activityId',pg_temp.u(502),'activityName','Visit','count',3,'suppressed',false),
   jsonb_build_object('activityId',pg_temp.u(501),'activityName','Workshop','count',11,'suppressed',false))
  FROM pg_temp.doc('pm_parts') d),
  '13 the breakdown shows a small activity count of 3 exactly, with no suppression');
SELECT pg_temp.ok((SELECT d->'byMonth'='[{"month":"2026-02","count":9,"suppressed":false},{"month":"2026-03","count":3,"suppressed":false},{"month":"2026-04","count":2,"suppressed":false}]'::jsonb
  AND d->'byAttendanceStatus'='[{"status":"PRESENT","count":11,"suppressed":false},{"status":"ABSENT","count":3,"suppressed":false},{"status":"COMPLETED","count":0,"suppressed":false},{"status":"NOT_COMPLETED","count":0,"suppressed":false},{"status":"EXCUSED","count":0,"suppressed":false}]'::jsonb
  FROM pg_temp.doc('pm_parts') d),
  '14 months and statuses are exact, small cells and zeros included');
SELECT pg_temp.ok((SELECT d->>'total'='9'
  AND d->'byActivity'=jsonb_build_array(jsonb_build_object('activityId',pg_temp.u(501),'activityName','Workshop','count',9,'suppressed',false))
  AND d->'byMonth'='[{"month":"2026-02","count":9,"suppressed":false}]'::jsonb
  FROM pg_temp.doc('pm_parts_feb') d),
  '15 a period keeps only February and shows it');
SELECT pg_temp.ok((SELECT d->>'total'='11'
  AND d->'byActivity'=jsonb_build_array(
   jsonb_build_object('activityId',pg_temp.u(504),'activityName','Follow-up','count',5,'suppressed',false),
   jsonb_build_object('activityId',pg_temp.u(503),'activityName','Session','count',6,'suppressed',false))
  FROM pg_temp.doc('pm_parts_a3') d),
  '16 one person at five sessions shows five records exactly');
-- KPI values.
SELECT pg_temp.ok((SELECT x#>>'{current,value}'='12' AND x#>>'{current,state}'='AVAILABLE'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-MANUAL'),
  '17 the manual value is read through the forced-RLS measurements table');
SELECT pg_temp.ok((SELECT x#>>'{current,state}'='SUPPRESSED' AND x#>>'{current,reason}'='SMALL_COHORT'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-DERIVED'),
  '18 a derived count of 1-4 is SUPPRESSED through the forced-RLS binding');
SELECT pg_temp.ok(jsonb_array_length(pg_temp.doc('pm_kpi'))=2 AND NOT EXISTS(SELECT FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x
  WHERE x ?| ARRAY['description','dataSource','mode','binding','measurementId','measuredAt','measurementSource']),
  '19 KPI values carry no definition, binding or measurement fields');
SELECT pg_temp.ok((SELECT x->>'direction'='HIGHER_IS_BETTER' AND x->>'baseline'='0' AND x->>'target'='20'
  AND x->>'periodStart'='2026-01-01' AND x->>'periodEnd'='2026-06-30' AND x->>'status'='ACTIVE'
  FROM jsonb_array_elements(pg_temp.doc('pm_kpi')) x WHERE x->>'code'='BRK-MANUAL'),
  '20 KPI values carry the display fields achievement needs');
SELECT pg_temp.ok(pg_temp.doc('gm_a1')=pg_temp.doc('pm_a1') AND pg_temp.doc('gm_kpi')=pg_temp.doc('pm_kpi'),
  '21 Grant Manager receives the same counts and values as Program Manager');
SELECT pg_temp.ok(pg_temp.doc('me_kpi')=pg_temp.doc('pm_kpi'),
  '22 M&E Officer receives the same KPI values (one code path)');
SELECT pg_temp.ok(pg_temp.doc('me_parts')=pg_temp.doc('pm_parts'),
  '23 M&E Officer receives the same participation breakdown');
SELECT pg_temp.ok((SELECT d#>>'{participationRecords,reason}'='SENSITIVE_RELEASE_NOT_ENABLED_V1'
  AND d#>>'{enrolledIndividuals,reason}'='SENSITIVE_RELEASE_NOT_ENABLED_V1' AND jsonb_array_length(d->'activities')=5
  FROM pg_temp.doc('po_home') d),
  '24 Project Officer home dashboard keeps the withheld placeholder without raising');
-- Records versus people complements.
SELECT pg_temp.ok((SELECT d#>>'{participationRecords,state}'='SUPPRESSED' AND d#>>'{participationRecords,reason}'='COMPLEMENTARY_SUPPRESSION'
  AND d#>>'{attendingIndividuals,value}'='8' AND d#>>'{enrolledIndividuals,value}'='20' FROM pg_temp.doc('pm_a7') d),
  '31 participation records are hidden when records minus attending individuals is 1-4');
SELECT pg_temp.ok((SELECT d#>>'{enrolledBeneficiaryRecords,value}'='7' AND d#>>'{enrolledIndividuals,reason}'='SMALL_COHORT'
  AND d#>>'{participationRecords,value}'='0' FROM pg_temp.doc('pm_a8') d),
  '32 individuals of 1-4 are SMALL_COHORT while the enrolled records stay visible');
SELECT pg_temp.ok((SELECT d#>>'{attendingIndividuals,reason}'='COMPLEMENTARY_SUPPRESSION' AND d#>>'{participationRecords,reason}'='COMPLEMENTARY_SUPPRESSION'
  AND d#>>'{enrolledIndividuals,value}'='10' FROM pg_temp.doc('pm_a9') d),
  '33 participation records are hidden when enrolled individuals minus records is 1-4');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM brk_results;
 IF total<>35 THEN RAISE EXCEPTION '0065 beneficiary-reach-kpi-values checks expected 35 assertions, recorded %',total; END IF;
 RAISE NOTICE 'BENEFICIARY_REACH_KPI_VALUES_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
