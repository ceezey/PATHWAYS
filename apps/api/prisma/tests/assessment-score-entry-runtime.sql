-- cr-pathways-assessment-score-entry (migration 0071): behavioral checks for the assessments.record insert policy.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that already has 0071 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0071 assessment-score-entry checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE ase_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON ase_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO ase_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected OR position(needle in SQLERRM)=0 THEN
   RAISE EXCEPTION 'Assertion % expected % mentioning %, got %: %',label,expected,needle,SQLSTATE,SQLERRM; END IF;
  INSERT INTO ase_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
-- Like reject, but also requires the error to be raised from inside the named function.
CREATE FUNCTION pg_temp.reject_in(command text,fn text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE context text;
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS context = PG_EXCEPTION_CONTEXT;
  IF SQLSTATE<>'23514' OR position(needle in SQLERRM)=0 OR position(fn in context)=0 THEN
   RAISE EXCEPTION 'Assertion % expected 23514 from % mentioning %, got %: % (%)',label,fn,needle,SQLSTATE,SQLERRM,context; END IF;
  INSERT INTO ase_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection 23514',label;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(1)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
CREATE FUNCTION pg_temp.run(command text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE command; END $$;
-- Score helper: user by records a result for enrollment 700+enr sourced from submission 600+sub under row id 800+n.
CREATE FUNCTION pg_temp.score_sql(by integer,enr integer,sub integer,kind text,n integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($i$INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,
   type,score,maximum_score,assessment_date,recorded_by_id) VALUES(%L,%L,%L,%L,%L,%L,%L,85.5,100,'2026-10-01',%L)$i$,
   pg_temp.u(800+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(700+enr),pg_temp.u(600+sub),kind,pg_temp.u(100+by))
$$;

-- One org and project 301 with one activity. Users: 1 Project Officer, 2 M&E officer, 3 Project Manager,
-- 5 System Administrator, 6 Program Manager and 8 Grant Manager (all assigned except 5, who is org-wide),
-- and 9 Project Officer with no assignment. Enrollments 711 and 712 each have a VALIDATED submission (611, 612).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,9) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'ASE_ORG_A','Synthetic ASE org A');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),'ASE user '||v.n,'ase-'||v.n||'@example.invalid','ACTIVE',now()
FROM (VALUES (1,'PROJECT_OFFICER'),(2,'MONITORING_AND_EVALUATION_OFFICER'),(3,'PROJECT_MANAGER'),
  (5,'SYSTEM_ADMINISTRATOR'),(6,'PROGRAM_MANAGER'),(8,'GRANT_MANAGER'),(9,'PROJECT_OFFICER')) v(n,role_code)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'ASE-A1','ASE Project A1','2026-01-01','2026-12-31',pg_temp.u(103));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(400+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(100+n),pg_temp.u(103) FROM unnest(ARRAY[1,2,3,6,8]) n;
INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id
) VALUES(pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'ASE-ACT-1','Activity 1','2026-01-01','2026-12-01','2026-01-01',
  'IN_PROGRESS',pg_temp.u(103));
INSERT INTO pathways.beneficiaries(id,organization_id,code,consent_recorded)
SELECT pg_temp.u(700+n),pg_temp.u(1),'ASE_BENEFICIARY_'||n,true FROM generate_series(1,2) n;
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
SELECT pg_temp.u(710+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(700+n),'2026-01-01',pg_temp.u(102) FROM generate_series(1,2) n;
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name,form_type,status,activity_id,published_by_id,published_at)
  VALUES(pg_temp.u(551),pg_temp.u(1),pg_temp.u(301),'ASE_ATTENDANCE','Synthetic attendance form','ACTIVITY_MONITORING','PUBLISHED',
  pg_temp.u(501),pg_temp.u(102),now());
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,enrollment_id,submitted_by_id,status,submitted_at,
  validated_by_id,validated_at,form_version,client_submission_id)
SELECT pg_temp.u(610+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(551),pg_temp.u(710+n),pg_temp.u(101),'VALIDATED',now(),
  pg_temp.u(102),now(),1,pg_temp.u(650+n) FROM generate_series(1,2) n;
SET LOCAL session_replication_role = origin;

-- Assertion 1: the migration grants assessments.record to exactly the three recording roles and rewires the source guard.
SELECT pg_temp.ok((SELECT array_agg(r.code ORDER BY r.code) FROM pathways.role_permissions rp
  JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id WHERE p.code='assessments.record')
  =ARRAY['MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER','PROJECT_OFFICER']::text[],
  '1a assessments.record is granted to exactly Project Officer, M&E officer and Project Manager');
SELECT pg_temp.ok((SELECT tgfoid='pathways.p3_guard_assessment_source()'::regprocedure FROM pg_trigger
  WHERE tgrelid='pathways.assessment_results'::regclass AND tgname='p3_30_source')
  AND (SELECT tgfoid='pathways.p3_guard_source()'::regprocedure FROM pg_trigger
  WHERE tgrelid='pathways.evidence_media'::regclass AND tgname='p3_30_source')
  AND (SELECT prosecdef AND pg_get_userbyid(proowner)='prisma' FROM pg_proc WHERE oid='pathways.p3_guard_assessment_source()'::regprocedure),
  '1b assessment_results uses the prisma definer source guard and evidence_media keeps p3_guard_source');

-- Assertion 2: each recording role inserts a result sourced from the enrollment's VALIDATED submission.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(2); SELECT pg_temp.run(pg_temp.score_sql(2,11,11,'PRE_TEST',1));
SELECT pg_temp.act_as(1); SELECT pg_temp.run(pg_temp.score_sql(1,11,11,'POST_TEST',2));
SELECT pg_temp.act_as(3); SELECT pg_temp.run(pg_temp.score_sql(3,12,12,'PRE_TEST',3));
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.assessment_results WHERE id=pg_temp.u(801) AND type='PRE_TEST'
  AND enrollment_id=pg_temp.u(711) AND source_submission_id=pg_temp.u(611) AND recorded_by_id=pg_temp.u(102)),
  '2a an M&E officer records a PRE_TEST sourced from a VALIDATED attendance submission');
SELECT pg_temp.ok((SELECT count(*)=2 FROM pathways.assessment_results WHERE id IN (pg_temp.u(802),pg_temp.u(803))),
  '2b a Project Officer and a Project Manager can each record');

-- Assertion 3: roles without assessments.record, or without project scope, are denied by RLS.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(5);
SELECT pg_temp.reject(pg_temp.score_sql(5,11,11,'PRE_TEST',4),'42501','row-level security','3a a System Administrator insert is denied by RLS');
SELECT pg_temp.act_as(6);
SELECT pg_temp.reject(pg_temp.score_sql(6,11,11,'PRE_TEST',4),'42501','row-level security','3b a Program Manager insert is denied by RLS');
SELECT pg_temp.act_as(8);
SELECT pg_temp.reject(pg_temp.score_sql(8,11,11,'PRE_TEST',4),'42501','row-level security','3c a Grant Manager insert is denied by RLS');
SELECT pg_temp.act_as(9);
SELECT pg_temp.reject(pg_temp.score_sql(9,11,11,'PRE_TEST',4),'42501','row-level security','3d an unassigned Project Officer insert is denied by RLS');

-- Assertion 4: provenance is still enforced for a permitted caller.
SELECT pg_temp.act_as(2);
SELECT pg_temp.reject(pg_temp.score_sql(2,11,12,'POST_TEST',5),'23514','Source must be a validated nondummy submission',
  '4a a source submission of another enrollment is rejected');
SELECT pg_temp.reject_in(pg_temp.score_sql(2,11,12,'POST_TEST',5),'p3_guard_assessment_source','Source must be a validated nondummy submission',
  '4b the mismatched enrollment rejection comes from p3_guard_assessment_source');

-- Assertion 5: recorded results stay append-only for the runtime role and the owner.
SELECT pg_temp.reject(format('UPDATE pathways.assessment_results SET score=90 WHERE id=%L',pg_temp.u(801)),'42501','permission denied',
  '5a UPDATE of a recorded result is rejected');
SELECT pg_temp.reject(format('DELETE FROM pathways.assessment_results WHERE id=%L',pg_temp.u(801)),'42501','permission denied',
  '5b DELETE of a recorded result is rejected');
RESET ROLE;
SELECT pg_temp.reject_in(format('UPDATE pathways.assessment_results SET score=90 WHERE id=%L',pg_temp.u(801)),'p3_guard_assessment_source',
  'Recorded assessment provenance is immutable','5c an owner-level UPDATE is still rejected by the new guard');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM ase_results;
 IF total<>13 THEN RAISE EXCEPTION '0071 assessment-score-entry checks expected 13 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ASSESSMENT_SCORE_ENTRY_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
