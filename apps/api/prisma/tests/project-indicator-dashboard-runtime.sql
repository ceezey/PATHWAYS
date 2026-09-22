-- P06 synthetic behavior/security checks. Run ONLY through Replay-Local.ps1.
-- Candidate tests; execution results must be recorded after the actual Windows replay.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'pathways_phase4_phase6_replay'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR inet_server_port()<>55448 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'P06 checks require the guarded disposable replay target';
  END IF;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('86000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'P06 assertion failed: %',label; END IF; END $$;

INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,7) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
 (pg_temp.u(1),'P06_A','Synthetic P06 A'),(pg_temp.u(2),'P06_B','Synthetic P06 B');
INSERT INTO pathways.roles(code,name) VALUES
 ('SYSTEM_ADMINISTRATOR','System Administrator'),('PROGRAM_MANAGER','Program Manager'),
 ('GRANT_MANAGER','Grant Manager'),('PROJECT_MANAGER','Project Manager'),
 ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
 SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),'Synthetic P06 '||v.n,
 'p06-'||v.n||'@example.invalid','ACTIVE',now()
 FROM (VALUES(1,'SYSTEM_ADMINISTRATOR'),(2,'PROGRAM_MANAGER'),(3,'GRANT_MANAGER'),(4,'PROJECT_MANAGER'),(5,'MONITORING_AND_EVALUATION_OFFICER'),(6,'PROJECT_OFFICER')) v(n,code)
 JOIN pathways.roles r ON r.code=v.code;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
 SELECT pg_temp.u(107),pg_temp.u(2),id,pg_temp.u(207),'Synthetic foreign P06','p06-foreign@example.invalid','ACTIVE',now()
 FROM pathways.roles WHERE code='PROJECT_MANAGER';
-- Deliberately overbroad indicator mapping for administrator proves the immutable role ceiling.
INSERT INTO pathways.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
 WHERE r.code IN ('SYSTEM_ADMINISTRATOR','PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
 AND p.code IN ('projects.read','analytics.read','monitoring.read','beneficiaries.aggregates.read','indicators.create','indicators.update',
   'beneficiaries.records.register','beneficiaries.records.read','beneficiaries.profiles.update','beneficiaries.enrollments.manage','beneficiaries.identities.review','activities.read','activities.create','activities.update','participation.record','journeys.read')
 ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
 set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
 (pg_temp.u(301),pg_temp.u(1),'P06_A1','P06 first project','2026-01-01','2026-07-31',pg_temp.u(101)),
 (pg_temp.u(302),pg_temp.u(1),'P06_A2','P06 overlapping project','2026-01-01','2026-12-31',pg_temp.u(101)),
 (pg_temp.u(303),pg_temp.u(2),'P06_B1','P06 foreign project','2026-01-01','2026-12-31',pg_temp.u(107));
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
 SELECT pg_temp.u(1),pg_temp.u(p),pg_temp.u(100+n),pg_temp.u(101)
 FROM generate_series(1,6) n CROSS JOIN generate_series(301,302) p;

-- 30 individuals; six age buckets of five, sex 15/15, disability 10/20.
-- All records are synthetic but is_dummy_record=false specifically to exercise the operational population.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,sex,birth_date,disability_status,
 consent_recorded,data_processing_consent_recorded,is_minor,guardian_consent_recorded,created_by_id)
 SELECT pg_temp.u(1000+n),pg_temp.u(1),'P06-BEN-'||n,'INDIVIDUAL','Synthetic','Person '||n,
 (CASE WHEN n<=15 THEN 'MALE' ELSE 'FEMALE' END)::pathways.beneficiary_sex,
 CASE WHEN n<=5 THEN DATE '2020-06-30' WHEN n<=10 THEN DATE '2014-06-30' WHEN n<=15 THEN DATE '2010-06-30'
   WHEN n<=20 THEN DATE '2004-06-30' WHEN n<=25 THEN DATE '1990-06-30' ELSE NULL END,
 (CASE WHEN n<=10 THEN 'WITH_DISABILITY' ELSE 'WITHOUT_DISABILITY' END)::pathways.disability_status,
 true,true,n<=15,n<=15,pg_temp.u(101) FROM generate_series(1,30) n;
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 SELECT pg_temp.u(1100+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(1000+n),'2026-01-01',pg_temp.u(101) FROM generate_series(1,30) n;
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 SELECT pg_temp.u(1200+n),pg_temp.u(1),pg_temp.u(302),pg_temp.u(1000+n),'2026-01-01',pg_temp.u(101) FROM generate_series(1,30) n;
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,status,created_by_id) VALUES
 (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'P06-ACT','P06 activity','2026-01-01','2026-06-30','NOT_STARTED',pg_temp.u(101));
UPDATE pathways.project_activities SET status='IN_PROGRESS',actual_start_date='2026-01-01' WHERE id=pg_temp.u(501);
INSERT INTO pathways.project_milestones(id,organization_id,project_id,title,target_date) VALUES
 (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),'P06 milestone','2026-06-30');

-- Independent G4 age boundary expectations (not generated by the production function).
SELECT pg_temp.assert_true(pathways.p06_age_band('2016-07-01','2026-06-30')='0-9','day before tenth birthday');
SELECT pg_temp.assert_true(pathways.p06_age_band('2016-06-30','2026-06-30')='10-14','tenth birthday inclusive');
SELECT pg_temp.assert_true(pathways.p06_age_band('2011-06-30','2026-06-30')='15-17','fifteenth birthday');
SELECT pg_temp.assert_true(pathways.p06_age_band('2008-06-30','2026-06-30')='18-24','eighteenth birthday');
SELECT pg_temp.assert_true(pathways.p06_age_band('2001-06-30','2026-06-30')='25+','twenty-fifth birthday');
SELECT pg_temp.assert_true(pathways.p06_age_band('2012-02-29','2027-02-28')='10-14','leap birthday before completed fifteenth year');
SELECT pg_temp.assert_true(pathways.p06_age_band('2012-02-29','2027-03-01')='15-17','leap birthday completed fifteenth year');
SELECT pg_temp.assert_true(pathways.p06_age_band(NULL,'2026-06-30')='Unknown','missing birth date');
SELECT pg_temp.assert_true(pathways.p06_age_band('2027-01-01','2026-06-30') IS NULL,'birth after reporting reference invalid');
SELECT pg_temp.assert_true(pathways.p06_age_band('1899-12-31','2026-06-30') IS NULL,'out-of-range birth date');
SELECT pg_temp.assert_true(pathways.p06_numeric_valid(-2.5,'SIGNED_CHANGE'),'signed measure');
SELECT pg_temp.assert_true(pathways.p06_numeric_valid(2.5,'RATIO'),'uncapped ratio');
SELECT pg_temp.assert_true(NOT pathways.p06_numeric_valid(2.5,'COUNT'),'fractional count rejected');
SELECT pg_temp.assert_true(NOT pathways.p06_numeric_valid(101,'PERCENTAGE'),'invalid percent rejected');
SELECT pg_temp.assert_true(pathways.p06_cell(NULL,'ZERO_DENOMINATOR')->>'state'='NOT_APPLICABLE','zero denominator is not zero');
SELECT pg_temp.assert_true(pathways.p06_cell(0.0000001)->>'state'='MISSING','nonzero below precision is not zero');
DO $$ DECLARE d jsonb; b jsonb;
BEGIN
 d:=pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301),pg_temp.u(302)],'2026-06-01','2026-06-30','Asia/Manila');
 PERFORM pg_temp.assert_true(d#>>'{total,value}'='30','portfolio deduplicates 60 enrollments to 30 individuals');
 FOR b IN SELECT value FROM jsonb_array_elements(d->'age') LOOP
   PERFORM pg_temp.assert_true(b#>>'{metric,value}'='5','each age bucket independently expected five');
 END LOOP;
 PERFORM pg_temp.assert_true(d#>>'{sex,0,metric,value}'='15','male marginal');
 PERFORM pg_temp.assert_true(d#>>'{disability,0,metric,value}'='10','disability marginal');
 PERFORM pg_temp.assert_true(d#>>'{completeness,0,metric,value}'='5','missing DOB completeness count');
END $$;

-- P02 version-pinned monitoring responses; P05 operational promotion shapes.
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,activity_id,created_by_id)
 VALUES(pg_temp.u(702),pg_temp.u(1),pg_temp.u(301),'p06_participation',1,'P06 participation','ACTIVITY_MONITORING',pg_temp.u(501),pg_temp.u(101));
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,allowed_values,sequence_no) VALUES
 (pg_temp.u(801),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),'beneficiary_code','Code','TEXT',true,NULL,1),
 (pg_temp.u(802),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),'participation_date','Date','DATE',true,NULL,2),
 (pg_temp.u(803),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),'attendance_status','Attendance','SELECT',true,'["PRESENT","COMPLETED"]',3),
 (pg_temp.u(804),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),'progress_status','Progress','SELECT',true,'["IN_PROGRESS"]',4),
 (pg_temp.u(805),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),'score','Score','DECIMAL',false,NULL,5);
UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id=pg_temp.u(105),published_at=now() WHERE id=pg_temp.u(702);
DO $$ DECLARE n integer; person integer; date_on date; sid uuid; pid uuid; eid uuid;
BEGIN
 FOR n IN 1..10 LOOP
   person:=1+(n-1)%5; date_on:=DATE '2026-06-15'+((n-1)/5); sid:=pg_temp.u(1300+n); pid:=pg_temp.u(1400+n); eid:=pg_temp.u(1500+n);
   INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status)
    VALUES(sid,pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),1,pg_temp.u(1600+n),pg_temp.u(106),'DIRECT_ENCODING','DRAFT');
   INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value)
    SELECT pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),sid,v.f,v.answer FROM (VALUES
      (pg_temp.u(801),to_jsonb('P06-BEN-'||person)),(pg_temp.u(802),to_jsonb(date_on::text)),
      (pg_temp.u(803),to_jsonb('PRESENT'::text)),(pg_temp.u(804),to_jsonb('IN_PROGRESS'::text)),(pg_temp.u(805),to_jsonb(person))) v(f,answer);
   INSERT INTO pathways.beneficiary_activity_participations(id,organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,progress_status,source_submission_id,recorded_by_id)
    VALUES(pid,pg_temp.u(1),pg_temp.u(301),pg_temp.u(1100+person),pg_temp.u(501),'PRESENT',date_on,'IN_PROGRESS',sid,pg_temp.u(106));
   INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,participation_id,event_type,event_date,recorded_by_id)
    VALUES(eid,pg_temp.u(1),pg_temp.u(301),pg_temp.u(1100+person),pg_temp.u(501),pid,'PARTICIPATION',date_on,pg_temp.u(106));
   UPDATE pathways.form_submissions
    SET
      enrollment_id = pg_temp.u(1100 + person),
      status = 'VALIDATED',
      submitted_at = date_on::timestamp AT TIME ZONE 'Asia/Manila',
      validated_by_id = pg_temp.u(105),
      validated_at = now()
    WHERE id = sid;
 END LOOP;
END $$;
-- One draft numeric response must never feed a derived metric.
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status)
 VALUES(pg_temp.u(1311),pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),1,pg_temp.u(1611),pg_temp.u(106),'DIRECT_ENCODING','DRAFT');
INSERT INTO pathways.form_response_values(organization_id,project_id,form_id,submission_id,field_id,value)
 VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(702),pg_temp.u(1311),pg_temp.u(805),'999');

-- Create exact period-owned definitions, with immutable typed bindings.
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
 VALUES(pg_temp.u(2000),pg_temp.u(1),pg_temp.u(301),'SIGNED','Signed movement','OTHER','points','Authorized synthetic manual measurement','MANUAL','SIGNED_CHANGE','HIGHER_IS_BETTER',4,'2026-06-01','2026-06-30',-5,5,pg_temp.u(105)),
 (pg_temp.u(2002),pg_temp.u(1),pg_temp.u(301),'COUNT','Manual count','COUNT','records','Authorized synthetic manual count','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-06-01','2026-06-30',0,10,pg_temp.u(105));
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,created_by_id)
 SELECT pg_temp.u(v.n),pg_temp.u(1),pg_temp.u(301),'DERIVED-'||v.n,'P06 '||v.recipe,
  (CASE WHEN v.kind='COUNT' THEN 'COUNT' WHEN v.kind='PERCENTAGE' THEN 'PERCENTAGE' ELSE 'OTHER' END)::pathways.indicator_unit,
  v.kind,'P06 committed source contract','DERIVED',v.kind,'DESCRIPTIVE',CASE WHEN v.kind='COUNT' THEN 0 ELSE 4 END,
  '2026-06-01','2026-06-30',pg_temp.u(105)
 FROM (VALUES(2003,'PARTICIPATION_RECORD_COUNT','COUNT'),(2004,'DISTINCT_ATTENDING_INDIVIDUALS','COUNT'),
 (2005,'ATTENDANCE_RECORDS_PER_INDIVIDUAL','RATIO'),(2006,'EFFECTIVE_JOURNEY_EVENT_COUNT','COUNT'),
 (2007,'FORM_NUMERIC_SUM','SIGNED_CHANGE'),(2008,'FORM_NUMERIC_AVERAGE','SIGNED_CHANGE'),(2009,'ACTIVITY_COMPLETION_PERCENTAGE','PERCENTAGE')) v(n,recipe,kind);
INSERT INTO pathways.project_indicator_bindings(organization_id,project_id,indicator_id,recipe,form_id,form_version,field_id,created_by_id)
 SELECT pg_temp.u(1),pg_temp.u(301),pg_temp.u(v.n),v.recipe,
  CASE WHEN v.n IN (2007,2008) THEN pg_temp.u(702) END,CASE WHEN v.n IN (2007,2008) THEN 1 END,
  CASE WHEN v.n IN (2007,2008) THEN pg_temp.u(805) END,pg_temp.u(105)
 FROM (VALUES(2003,'PARTICIPATION_RECORD_COUNT'),(2004,'DISTINCT_ATTENDING_INDIVIDUALS'),(2005,'ATTENDANCE_RECORDS_PER_INDIVIDUAL'),
 (2006,'EFFECTIVE_JOURNEY_EVENT_COUNT'),(2007,'FORM_NUMERIC_SUM'),(2008,'FORM_NUMERIC_AVERAGE'),(2009,'ACTIVITY_COMPLETION_PERCENTAGE')) v(n,recipe);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),set_config('app.user_id',pg_temp.u(105)::text,true);
-- Owner-only calculations with current scoped identity; runtime receives only released contracts.
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2003),'Asia/Manila')#>>'{current,value}'='10','ten accepted participation records');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2004),'Asia/Manila')#>>'{current,value}'='5','five distinct attending individuals');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2005),'Asia/Manila')#>>'{current,value}'='2','ratio may exceed one');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2007),'Asia/Manila')#>>'{current,value}'='30','sum excludes the draft 999');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2008),'Asia/Manila')#>>'{current,value}'='3','numeric average');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2009),'Asia/Manila')#>>'{current,value}'='0','zero completed out of one due activity');

-- Phase 4 narrow exception: Project Manager may manage indicators only in an
-- assigned project. M&E retains manage; all other roles remain denied even
-- though this synthetic fixture deliberately gives them overbroad mappings.
\if :{?PHASE4_INDICATOR_POLICY}
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(204)::text,true),set_config('app.user_id',pg_temp.u(104)::text,true);
SELECT pg_temp.assert_true(pathways.p06_can('monitoring.read',pg_temp.u(301)),'Project Manager reads assigned indicator scope');
SELECT pg_temp.assert_true(pathways.p06_can('indicators.create',pg_temp.u(301)),'Project Manager creates in assigned project');
SELECT pg_temp.assert_true(pathways.p06_can('indicators.update',pg_temp.u(301)),'Project Manager updates in assigned project');
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.create',pg_temp.u(303)),'Project Manager cannot create in foreign organization');
SAVEPOINT phase4_pm_write;
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
 VALUES(pg_temp.u(2010),pg_temp.u(1),pg_temp.u(301),'PM_SCOPED','PM scoped indicator','COUNT','records','Synthetic PM source','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-06-01','2026-06-30',0,10,pg_temp.u(104));
UPDATE pathways.project_indicators SET name='PM scoped indicator updated',revision=revision+1,updated_at=CURRENT_TIMESTAMP
 WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(301) AND id=pg_temp.u(2010);
SELECT pg_temp.assert_true(
  (SELECT name FROM pathways.project_indicators WHERE id=pg_temp.u(2010))='PM scoped indicator updated',
  'Project Manager indicator write persists under runtime RLS');
ROLLBACK TO SAVEPOINT phase4_pm_write;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),set_config('app.user_id',pg_temp.u(105)::text,true);
SELECT pg_temp.assert_true(pathways.p06_can('indicators.create',pg_temp.u(301)) AND pathways.p06_can('indicators.update',pg_temp.u(301)),'M&E retains indicator manage');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.create',pg_temp.u(301)),'administrator has no indicator workflow bypass');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true),set_config('app.user_id',pg_temp.u(102)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.update',pg_temp.u(301)),'Program Manager indicator manage remains denied');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(203)::text,true),set_config('app.user_id',pg_temp.u(103)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.create',pg_temp.u(301)),'Grant Manager indicator manage remains denied');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(206)::text,true),set_config('app.user_id',pg_temp.u(106)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.update',pg_temp.u(301)),'Project Officer indicator manage remains denied');
RESET ROLE;
UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Synthetic PM revocation'
 WHERE organization_id=pg_temp.u(1) AND user_id=pg_temp.u(104) AND project_id=pg_temp.u(302);
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(204)::text,true),set_config('app.user_id',pg_temp.u(104)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('indicators.update',pg_temp.u(302)),'revoked Project Manager assignment denies indicator manage');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),set_config('app.user_id',pg_temp.u(105)::text,true);
\endif
DO $$ BEGIN
 BEGIN
   INSERT INTO pathways.beneficiary_activity_participations(organization_id,project_id,enrollment_id,activity_id,attendance_status,participation_date,progress_status,source_submission_id,recorded_by_id)
   VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(1101),pg_temp.u(501),'PRESENT','2026-06-15','IN_PROGRESS',pg_temp.u(1301),pg_temp.u(106));
   RAISE EXCEPTION 'Repeated source/attendance was not rejected';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
-- Correcting a journey date does not rewrite attendance or participation_date.
INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,event_type,event_date,corrects_event_id,correction_reason,recorded_by_id)
 VALUES(pg_temp.u(1701),pg_temp.u(1),pg_temp.u(301),pg_temp.u(1101),pg_temp.u(501),'PARTICIPATION','2026-07-01',pg_temp.u(1501),'Date correction',pg_temp.u(106));
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),'Asia/Manila')#>>'{current,value}'='9','effective journey date moves one root outside June');
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2003),'Asia/Manila')#>>'{current,value}'='10','participation retains its original date');
INSERT INTO pathways.beneficiary_journey_events(id,organization_id,project_id,enrollment_id,activity_id,event_type,event_date,corrects_event_id,correction_reason,recorded_by_id)
 VALUES(pg_temp.u(1702),pg_temp.u(1),pg_temp.u(301),pg_temp.u(1101),pg_temp.u(501),'PARTICIPATION','2026-07-02',pg_temp.u(1501),'Second conflicting correction',pg_temp.u(106));
SELECT pg_temp.assert_true(pathways.p06_compute_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2006),'Asia/Manila')#>>'{current,reason}'='AMBIGUOUS_JOURNEY_CORRECTIONS','ambiguous corrections are not double counted');

SET LOCAL ROLE pathways_runtime;
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,recorded_by_id)
 VALUES(pg_temp.u(2100),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2000),'2026-06-01','2026-06-30',-2,'Synthetic manual source',pg_temp.u(2200),repeat('a',64),pg_temp.u(105));
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,corrects_measurement_id,correction_reason,recorded_by_id)
 VALUES(pg_temp.u(2101),pg_temp.u(1),pg_temp.u(301),pg_temp.u(2000),'2026-06-01','2026-06-30',1,'Corrected synthetic source',pg_temp.u(2201),repeat('b',64),pg_temp.u(2100),'Corrected entry',pg_temp.u(105));
SELECT pg_temp.assert_true(pathways.p06_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2000),'Asia/Manila')#>>'{current,value}'='1','manual current value is the sole leaf');
DO $$ DECLARE before_count bigint;
BEGIN
 BEGIN
   INSERT INTO pathways.project_indicator_measurements(organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,recorded_by_id)
   VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2002),'2026-06-01','2026-06-30',1.5,'Bad fractional count',pg_temp.u(2202),repeat('c',64),pg_temp.u(105));
   RAISE EXCEPTION 'Fractional count was not rejected';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE pathways.project_indicator_measurements SET value=99 WHERE id=pg_temp.u(2100);
   RAISE EXCEPTION 'Append-only measurement unexpectedly updated';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
 SELECT count(*) INTO before_count FROM pathways.project_indicator_measurements;
 BEGIN
   INSERT INTO pathways.project_indicator_measurements(organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,recorded_by_id)
   VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(2002),'2026-06-01','2026-06-30',2,'Rollback example',pg_temp.u(2203),repeat('d',64),pg_temp.u(105));
   RAISE EXCEPTION 'deliberate synthetic transaction failure' USING ERRCODE='P0601';
 EXCEPTION WHEN SQLSTATE 'P0601' THEN NULL; END;
 PERFORM pg_temp.assert_true((SELECT count(*) FROM pathways.project_indicator_measurements)=before_count,'failed transaction leaves no measurement');
 BEGIN
   PERFORM pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-06-01','2026-06-30','Asia/Manila');
   RAISE EXCEPTION 'Runtime accessed owner-only unreleased calculator';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(303)],'2026-06-01','2026-06-30','Asia/Manila');
   RAISE EXCEPTION 'Foreign project was not rejected';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2020-01-01','2026-06-30','Asia/Manila');
   RAISE EXCEPTION 'Unbounded period was not rejected';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM count(*)
    FROM pathways.sensitive_aggregate_releases;

    RAISE EXCEPTION
      'Runtime read the protected release registry';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

-- Every supported aggregate role receives the same protected fixed-project release.
DO $$
DECLARE
  n integer;
  d jsonb;
BEGIN
  FOR n IN 1..5
  LOOP
    PERFORM set_config(
      'request.jwt.claim.sub',
      pg_temp.u(200+n)::text,
      true
    );

    PERFORM set_config(
      'app.user_id',
      pg_temp.u(100+n)::text,
      true
    );

    d :=
      pathways.p06_saddd(
        pg_temp.u(1),
        ARRAY[pg_temp.u(301)],
        DATE '2026-01-01',
        DATE '2026-07-31',
        'Asia/Manila'
      );

    PERFORM pg_temp.assert_true(
      d->>'releaseState'='RELEASED' AND d#>>'{total,value}'='30',
      'fixed closed-project SADDD release returns approved total'
    );

    PERFORM pg_temp.assert_true(
      d#>>'{age,0,label}'='0-9',
      'approved age labels are preserved'
    );
  END LOOP;
  BEGIN
    PERFORM pathways.p06_saddd(
      pg_temp.u(1),
      ARRAY[pg_temp.u(301),pg_temp.u(302)],
      DATE '2026-01-01',
      DATE '2026-07-31',
      'Asia/Manila'
    );

    RAISE EXCEPTION
      'multi-project SADDD release was not rejected';

  EXCEPTION
    WHEN invalid_parameter_value THEN
      NULL;
  END;

  BEGIN
    PERFORM pathways.p06_saddd(
      pg_temp.u(1),
      ARRAY[pg_temp.u(301)],
      DATE '2026-01-02',
      DATE '2026-07-31',
      'Asia/Manila'
    );

    RAISE EXCEPTION
      'custom SADDD period was not rejected';

  EXCEPTION
    WHEN invalid_parameter_value THEN
      NULL;
  END;
END
$$;
RESET ROLE;

-- The runtime cannot read the registry directly; inspect its persisted state only
-- after restoring the replay owner identity.
SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM pathways.sensitive_aggregate_releases
    WHERE organization_id=pg_temp.u(1)
      AND project_id=pg_temp.u(301)
      AND status='RELEASED'
  )=1,
  'repeated release reads create one registry row'
);

-- A source correction inside the same published bucket leaves every aggregate
-- unchanged, but still requires review before a second release.
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
CREATE TEMP TABLE pg_temp.saddd_before AS
 SELECT pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-07-31','Asia/Manila') AS data;
UPDATE pathways.beneficiaries SET birth_date='2020-07-01' WHERE id=pg_temp.u(1001);
SELECT pg_temp.assert_true(
  (SELECT data FROM pg_temp.saddd_before)=pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-07-31','Asia/Manila'),
  'same-band birth-date correction leaves protected aggregates unchanged'
);
SET LOCAL ROLE pathways_runtime;
DO $$ DECLARE d jsonb;
BEGIN
 d:=pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-01-01','2026-07-31','Asia/Manila');
 PERFORM pg_temp.assert_true(d->>'releaseState'='STALE' AND d#>>'{total,reason}'='RESTATEMENT_REVIEW_REQUIRED' AND d#>>'{total,value}' IS NULL,
   'same-bucket contributing correction is non-disclosing stale');
END $$;
RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT status='STALE' AND stale_reason='SOURCE_CHANGED' FROM pathways.sensitive_aggregate_releases WHERE project_id=pg_temp.u(301)),
 'same-bucket source correction persists stale state'
);

-- A distinct, small project receives a wholly suppressed protected release.
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
 VALUES(pg_temp.u(304),pg_temp.u(1),'P06_SMALL','P06 small project','2026-01-01','2026-07-31',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
 VALUES(pg_temp.u(1),pg_temp.u(304),pg_temp.u(101),pg_temp.u(101));
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 VALUES(pg_temp.u(1301),pg_temp.u(1),pg_temp.u(304),pg_temp.u(1001),'2026-01-01',pg_temp.u(101));
SET LOCAL ROLE pathways_runtime;
DO $$ DECLARE d jsonb; b jsonb;
BEGIN
 d:=pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(304)],'2026-01-01','2026-07-31','Asia/Manila');
 PERFORM pg_temp.assert_true(d->>'releaseState'='RELEASED' AND d#>>'{total,state}'='SUPPRESSED' AND d#>>'{total,value}' IS NULL,
   'small project has a released but wholly suppressed result');
 FOR b IN SELECT value FROM jsonb_array_elements(d->'age') LOOP
   PERFORM pg_temp.assert_true(b#>>'{metric,state}'='SUPPRESSED' AND b#>>'{metric,value}' IS NULL,
     'small release hides every age cell');
 END LOOP;
END $$;
RESET ROLE;

-- The persisted period is part of one project release identity.
UPDATE pathways.projects SET end_date='2026-07-31' WHERE id=pg_temp.u(302);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(
 pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(302)],'2026-01-01','2026-07-31','Asia/Manila')->>'releaseState'='RELEASED',
 'second project first closed-period release succeeds'
);
RESET ROLE;
UPDATE pathways.projects SET end_date='2026-08-31' WHERE id=pg_temp.u(302);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(
 pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(302)],'2026-01-01','2026-08-31','Asia/Manila')#>>'{total,reason}'='RESTATEMENT_REVIEW_REQUIRED',
 'authoritative period change is stale without changed count'
);
RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT status='STALE' AND stale_reason='PROJECT_PERIOD_CHANGED' FROM pathways.sensitive_aggregate_releases WHERE project_id=pg_temp.u(302)),
 'period change persists stale state on original release identity'
);

-- Revocation is observed on the next request; never grant a stale assignment from a lead column.
UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Synthetic revocation'
 WHERE organization_id=pg_temp.u(1) AND user_id=pg_temp.u(105) AND project_id=pg_temp.u(301);
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),set_config('app.user_id',pg_temp.u(105)::text,true);
SELECT pg_temp.assert_true(NOT pathways.p06_can('monitoring.read',pg_temp.u(301)),'revoked assignment denies next check');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
-- A legacy invalid DOB admitted by an older database range is flagged, not changed to Unknown.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,created_by_id)
 VALUES(pg_temp.u(1099),pg_temp.u(1),'P06-INVALID','INDIVIDUAL','Synthetic','Invalid date','1899-12-31',true,true,pg_temp.u(101));
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 VALUES(pg_temp.u(1199),pg_temp.u(1),pg_temp.u(301),pg_temp.u(1099),'2026-01-01',pg_temp.u(101));
DO $$ DECLARE d jsonb; b jsonb;
BEGIN
 d:=pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-06-01','2026-06-30','Asia/Manila');
 PERFORM pg_temp.assert_true(d#>>'{total,state}'='SUPPRESSED','small completeness count triggers complementary total suppression');
 FOR b IN SELECT value FROM jsonb_array_elements(d->'age') LOOP
   PERFORM pg_temp.assert_true(b#>>'{metric,state}'='SUPPRESSED' AND b#>>'{metric,value}' IS NULL,'whole-release complement has no hidden numeric value');
 END LOOP;
END $$;

DO $$
DECLARE
  d jsonb;
BEGIN
  d :=
    pathways.p06_saddd(
      pg_temp.u(1),
      ARRAY[pg_temp.u(301)],
      DATE '2026-01-01',
      DATE '2026-07-31',
      'Asia/Manila'
    );

  PERFORM pg_temp.assert_true(
    d#>>'{total,state}'='MISSING'
      AND d#>>'{total,value}' IS NULL
      AND d#>>'{total,reason}'='RESTATEMENT_REVIEW_REQUIRED',
    'changed released population becomes non-disclosing stale release'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT
      FROM pathways.sensitive_aggregate_releases
      WHERE organization_id=pg_temp.u(1)
        AND project_id=pg_temp.u(301)
        AND status='STALE'
        AND stale_reason='SOURCE_CHANGED'
        AND stale_at IS NOT NULL
    ),
    'source change is persisted as stale release state'
  );

  d :=
    pathways.p06_saddd(
      pg_temp.u(1),
      ARRAY[pg_temp.u(301)],
      DATE '2026-01-01',
      DATE '2026-07-31',
      'Asia/Manila'
    );

  PERFORM pg_temp.assert_true(
    d#>>'{total,state}'='MISSING'
      AND d#>>'{total,value}' IS NULL
      AND d#>>'{total,reason}'='RESTATEMENT_REVIEW_REQUIRED',
    'stale release remains non-disclosing on repeated reads'
  );
END
$$;

SET CONSTRAINTS ALL IMMEDIATE;
-- Capture actual local helper execution/planning evidence. This is NOT an HTTP latency claim.
\timing on
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
 SELECT pathways.p06_compute_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(301),pg_temp.u(302)],'2026-06-01','2026-06-30','Asia/Manila');
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
 SELECT pathways.p06_compute_saddd(pg_temp.u(1),ARRAY[pg_temp.u(301)],'2026-06-01','2026-06-30','Asia/Manila');
\timing off
ROLLBACK;
