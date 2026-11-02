-- cr-pathways-participant-file-import (0083): disposable checks for file part batches, the imported survey subject and the
-- assessment source of an imported survey. Synthetic fixtures only; everything rolls back. Run as a local superuser against a
-- disposable pathways_phase2_* or phase4/phase6 replay database that already has 0083 applied. Success prints STAGE_IMPORT_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Stage import checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a8300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('si.passed',(coalesce(nullif(current_setting('si.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must run without error.
CREATE FUNCTION pg_temp.accepted(label text, statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Assertion % was refused with %: %',label,SQLSTATE,SQLERRM;
 END;
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
CREATE FUNCTION pg_temp.act_as(auth_n integer, user_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(auth_n)::text,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),
  set_config('app.user_id',pg_temp.u(user_n)::text,true);
END $$;
-- Child batch insert for the reserved-upload shape the batch guard requires.
CREATE FUNCTION pg_temp.batch_sql(batch_n integer, parent_n integer, part text, form_n integer, version integer, parts text) RETURNS text LANGUAGE sql AS $$
 SELECT format($i$INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,original_file_name,
  uploaded_by_id,source_checksum,storage_bucket,storage_object_key,parent_batch_id,part_code,file_parts)
  VALUES(%L,%L,%L,%L,%s,'synthetic.csv',%L,%L,'imports',%L,%L,%L,%L)$i$,
  pg_temp.u(batch_n),pg_temp.u(1),pg_temp.u(41),pg_temp.u(form_n),version,pg_temp.u(21),repeat('a',64),
  'organizations/'||pg_temp.u(1)||'/projects/'||pg_temp.u(41)||'/imports/'||pg_temp.u(batch_n)||'/'||repeat('a',64)||'.csv',
  CASE WHEN parent_n=0 THEN NULL ELSE pg_temp.u(parent_n) END,part,parts)
$$;
-- Submission insert; row_n is the import row of an imported one, 0 for direct entry.
CREATE FUNCTION pg_temp.sub_sql(sub_n integer, row_n integer, batch_n integer, ben_n integer, form_n integer, user_n integer) RETURNS text LANGUAGE sql AS $$
 SELECT format($i$INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,
  import_batch_id,import_row_id,submitted_by_id,source,status,beneficiary_id) VALUES(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,'DRAFT',%L)$i$,
  pg_temp.u(sub_n),pg_temp.u(1),pg_temp.u(41),pg_temp.u(form_n),pg_temp.u(900+sub_n),
  CASE WHEN row_n=0 THEN NULL ELSE pg_temp.u(batch_n) END,CASE WHEN row_n=0 THEN NULL ELSE pg_temp.u(row_n) END,
  pg_temp.u(user_n),CASE WHEN row_n=0 THEN 'DIRECT_ENCODING' ELSE 'IMPORTED_DATASET' END,pg_temp.u(ben_n))
$$;

-- The three guards keep prisma ownership, their security mode, an empty search_path and their enabled triggers.
SELECT pg_temp.ok('guards keep owner mode search_path and triggers',
 (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p03_guard_import_batch()'::regprocedure,
   'pathways.p34_guard_survey_subject()'::regprocedure) AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""'])=2
 AND (SELECT prosecdef AND pg_catalog.pg_get_userbyid(proowner)='prisma' AND proconfig=ARRAY['search_path=""']
   FROM pg_catalog.pg_proc WHERE oid='pathways.p3_guard_assessment_source()'::regprocedure)
 AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgenabled='O' AND NOT tgisinternal AND (
   (tgname='p03_guard_import_batch' AND tgrelid='pathways.data_import_batches'::regclass)
   OR (tgname='p34_guard_survey_subject' AND tgrelid='pathways.form_submissions'::regclass)
   OR (tgname='p3_30_source' AND tgrelid='pathways.assessment_results'::regclass)))=3);

-- Fixtures. Users: 21 M&E officer and 22 Project Officer (imports.process, records.read, submissions.write), 23 System
-- Administrator (imports.process without records.read), 24 Project Manager (records.read without imports.process or submissions.write).
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13)),(pg_temp.u(14));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'SI_A','Synthetic stage import organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'MONITORING_AND_EVALUATION_OFFICER','Synthetic SI M&E','si-me@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'PROJECT_OFFICER','Synthetic SI officer','si-po@example.invalid'),
 (pg_temp.u(23),pg_temp.u(13),'SYSTEM_ADMINISTRATOR','Synthetic SI administrator','si-sa@example.invalid'),
 (pg_temp.u(24),pg_temp.u(14),'PROJECT_MANAGER','Synthetic SI manager','si-pm@example.invalid')) v(id,auth_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; project and activity fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 (pg_temp.u(41),pg_temp.u(1),'SI_A_1','Synthetic SI project',pg_temp.u(24));
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,activity_type,created_by_id) VALUES
 (pg_temp.u(61),pg_temp.u(1),pg_temp.u(41),'SI-ACT-1','Synthetic stage activity','IMPORTED_SURVEY',pg_temp.u(24));
-- Forms: 91 and 94 Training Surveys of the activity (94 is version 2 of the same code), 92 an Activity Monitoring form.
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,activity_id,published_by_id,published_at) VALUES
 (pg_temp.u(91),pg_temp.u(1),pg_temp.u(41),'SI_SURVEY',1,'Synthetic survey','TRAINING_SURVEY','PUBLISHED',pg_temp.u(61),pg_temp.u(22),now()),
 (pg_temp.u(94),pg_temp.u(1),pg_temp.u(41),'SI_SURVEY',2,'Synthetic survey v2','TRAINING_SURVEY','PUBLISHED',pg_temp.u(61),pg_temp.u(22),now()),
 (pg_temp.u(92),pg_temp.u(1),pg_temp.u(41),'SI_MONITOR',1,'Synthetic monitoring','ACTIVITY_MONITORING','PUBLISHED',pg_temp.u(61),pg_temp.u(22),now());
-- Beneficiaries: 71 and 72 eligible; 73 lacks data processing consent; 74 lacks participation consent; 75 is not enrolled; 77 completed.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,consent_recorded,data_processing_consent_recorded) VALUES
 (pg_temp.u(71),pg_temp.u(1),'SI_B71','INDIVIDUAL',true,true),
 (pg_temp.u(72),pg_temp.u(1),'SI_B72','INDIVIDUAL',true,true),
 (pg_temp.u(73),pg_temp.u(1),'SI_B73','INDIVIDUAL',true,false),
 (pg_temp.u(74),pg_temp.u(1),'SI_B74','INDIVIDUAL',false,true),
 (pg_temp.u(75),pg_temp.u(1),'SI_B75','INDIVIDUAL',true,true),
 (pg_temp.u(77),pg_temp.u(1),'SI_B77','INDIVIDUAL',true,true);
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES
 (pg_temp.u(81),pg_temp.u(1),pg_temp.u(41),pg_temp.u(71),'2026-01-01',pg_temp.u(21)),
 (pg_temp.u(82),pg_temp.u(1),pg_temp.u(41),pg_temp.u(72),'2026-01-01',pg_temp.u(21)),
 (pg_temp.u(83),pg_temp.u(1),pg_temp.u(41),pg_temp.u(73),'2026-01-01',pg_temp.u(21)),
 (pg_temp.u(84),pg_temp.u(1),pg_temp.u(41),pg_temp.u(74),'2026-01-01',pg_temp.u(21));
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,status,ended_date,end_reason,recorded_by_id) VALUES
 (pg_temp.u(87),pg_temp.u(1),pg_temp.u(41),pg_temp.u(77),'2026-01-01','COMPLETED','2026-06-30','Synthetic completion',pg_temp.u(21));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(50+n),pg_temp.u(1),pg_temp.u(41),pg_temp.u(20+n),pg_temp.u(24) FROM unnest(ARRAY[1,2,4]) n;
-- Processing batches 100 (form 91) and 105 (form 92) with one processing row per imported submission.
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,original_file_name,uploaded_by_id,status,
 storage_status,validated_at,reviewed_by_id,mapping_revision,validated_mapping_revision,processing_claim_id,processing_claimed_at,
 source_checksum,storage_bucket,storage_object_key) VALUES
 (pg_temp.u(100),pg_temp.u(1),pg_temp.u(41),pg_temp.u(91),1,'synthetic.csv',pg_temp.u(21),'PROCESSING','STORED',now(),pg_temp.u(21),0,0,
  pg_temp.u(990),now(),repeat('b',64),'imports','synthetic/100'),
 (pg_temp.u(105),pg_temp.u(1),pg_temp.u(41),pg_temp.u(92),1,'synthetic.csv',pg_temp.u(21),'PROCESSING','STORED',now(),pg_temp.u(21),0,0,
  pg_temp.u(990),now(),repeat('c',64),'imports','synthetic/105');
INSERT INTO pathways.data_import_rows(id,organization_id,project_id,form_id,import_batch_id,row_number,raw_data,status,normalized_data,
 validated_by_id,validated_at,processing_claim_id,processing_claimed_at,source_checksum)
SELECT pg_temp.u(110+n),pg_temp.u(1),pg_temp.u(41),pg_temp.u(CASE WHEN n=9 THEN 92 ELSE 91 END),
 pg_temp.u(CASE WHEN n=9 THEN 105 ELSE 100 END),n,'{}','PROCESSING','{}',pg_temp.u(21),now(),pg_temp.u(990),now(),repeat('d',64)
FROM generate_series(1,9) n;
-- Validated imported surveys of person 71 (601) and person 72 (602), as the import would leave them.
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,import_batch_id,import_row_id,
 submitted_by_id,source,status,submitted_at,validated_by_id,validated_at,beneficiary_id)
SELECT pg_temp.u(600+n),pg_temp.u(1),pg_temp.u(41),pg_temp.u(91),1,pg_temp.u(700+n),pg_temp.u(100),pg_temp.u(110+n),pg_temp.u(21),
 'IMPORTED_DATASET','VALIDATED',now(),pg_temp.u(21),now(),pg_temp.u(70+n) FROM generate_series(1,2) n;
SET LOCAL session_replication_role = origin;

-- Child batches (batch triggers on): parent 101 with children for parts pre_test and post_test.
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.accepted('parent batch with no part', pg_temp.batch_sql(101,0,NULL,91,1,NULL));
SELECT pg_temp.accepted('child batch with parent and part', pg_temp.batch_sql(102,101,'pre_test',91,1,NULL));
SELECT pg_temp.refused('child with a parent and no part', pg_temp.batch_sql(103,101,NULL,91,1,NULL),'23514','data_import_batches_part_shape');
SELECT pg_temp.refused('part with no parent', pg_temp.batch_sql(103,0,'pre_test',91,1,NULL),'23514','data_import_batches_part_shape');
SELECT pg_temp.refused('part code that starts with a digit', pg_temp.batch_sql(103,101,'1pre',91,1,NULL),'23514','data_import_batches_part_shape');
SELECT pg_temp.refused('child that carries file parts', pg_temp.batch_sql(103,101,'post_test',91,1,'[]'),'23514','data_import_batches_part_shape');
SELECT pg_temp.refused('second child with the same parent part and form version', pg_temp.batch_sql(103,101,'pre_test',91,1,NULL),'23505','data_import_batches_part_key');
SELECT pg_temp.accepted('same part with a new form version', pg_temp.batch_sql(104,101,'pre_test',94,2,NULL));
SELECT pg_temp.accepted('another part with the same form version', pg_temp.batch_sql(106,101,'post_test',91,1,NULL));
SELECT pg_temp.accepted('a part start fails', format('UPDATE pathways.data_import_batches SET status=''FAILED'',storage_status=''FAILED'' WHERE id=%L',pg_temp.u(106)));
SELECT pg_temp.accepted('a failed part is started again as a new child', pg_temp.batch_sql(107,101,'post_test',91,1,NULL));
SELECT pg_temp.refused('a second live child of the restarted part', pg_temp.batch_sql(108,101,'post_test',91,1,NULL),'23505','data_import_batches_part_key');
SELECT pg_temp.refused('child of a parent that does not exist', replace(pg_temp.batch_sql(103,101,'extra',91,1,NULL),pg_temp.u(101)::text,pg_temp.u(999)::text),'23503','data_import_batches_parent_fk');

-- Immutability: parent, part and a set part list cannot change; the part list can be set once.
SELECT pg_temp.refused('parent batch cannot be changed', format('UPDATE pathways.data_import_batches SET parent_batch_id=NULL WHERE id=%L',pg_temp.u(102)),'P0001','immutable');
SELECT pg_temp.refused('part code cannot be changed', format('UPDATE pathways.data_import_batches SET part_code=''other_part'' WHERE id=%L',pg_temp.u(102)),'P0001','immutable');
SELECT pg_temp.refused('a batch cannot gain a parent', format('UPDATE pathways.data_import_batches SET parent_batch_id=%L,part_code=''x1'' WHERE id=%L',pg_temp.u(101),pg_temp.u(100)),'P0001','immutable');
SELECT pg_temp.accepted('file parts are set once', format('UPDATE pathways.data_import_batches SET file_parts=''[{"code":"pre_test"}]'' WHERE id=%L',pg_temp.u(101)));
SELECT pg_temp.refused('a set part list cannot change', format('UPDATE pathways.data_import_batches SET file_parts=''[]'' WHERE id=%L',pg_temp.u(101)),'P0001','file parts are immutable');
SELECT pg_temp.refused('a set part list cannot be cleared', format('UPDATE pathways.data_import_batches SET file_parts=NULL WHERE id=%L',pg_temp.u(101)),'P0001','file parts are immutable');
SELECT pg_temp.accepted('the same part list is a no-op', format('UPDATE pathways.data_import_batches SET file_parts=''[{"code":"pre_test"}]'' WHERE id=%L',pg_temp.u(101)));

-- Imported survey subject (runtime session): imports.process and records.read are both needed.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.accepted('M&E officer imports a survey naming an active enrollee', pg_temp.sub_sql(620,113,100,71,91,21));
SELECT pg_temp.accepted('M&E officer imports a survey naming a completed enrollee', pg_temp.sub_sql(621,114,100,77,91,21));
SELECT pg_temp.act_as(12,22);
SELECT pg_temp.accepted('Project Officer imports a survey naming an enrollee', pg_temp.sub_sql(622,115,100,72,91,22));
SELECT pg_temp.act_as(13,23);
SELECT pg_temp.refused('imports.process without beneficiaries.records.read', pg_temp.sub_sql(623,116,100,71,91,23),'23514','identified survey contributor unavailable');
-- Project Officer without imports.process (the role is reset to the grant it has in the schema afterwards).
RESET SESSION AUTHORIZATION;
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_OFFICER' AND p.code='imports.process';
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(12,22);
SELECT pg_temp.refused('records.read and submissions.write without imports.process', pg_temp.sub_sql(623,116,100,71,91,22),'23514','identified survey contributor unavailable');
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.refused('submitter other than the runtime user', replace(pg_temp.sub_sql(623,116,100,71,91,21),pg_temp.u(21)::text,pg_temp.u(22)::text),'23514','identified survey contributor unavailable');
SELECT pg_temp.refused('form type other than Training Survey', pg_temp.sub_sql(623,119,105,71,92,21),'23514','identified survey contributor unavailable');
SELECT pg_temp.refused('person not enrolled in the project', pg_temp.sub_sql(623,116,100,75,91,21),'23514','identified survey contributor unavailable');
SELECT pg_temp.refused('person without data processing consent', pg_temp.sub_sql(623,116,100,73,91,21),'23514','identified survey contributor unavailable');
SELECT pg_temp.refused('person without participation consent', pg_temp.sub_sql(623,116,100,74,91,21),'23514','identified survey contributor unavailable');
SELECT pg_temp.refused('retargeting an imported survey', format('UPDATE pathways.form_submissions SET beneficiary_id=%L WHERE id=%L',pg_temp.u(72),pg_temp.u(620)),'23514','cannot be retargeted');

-- Direct entry behaves as before: submissions.write and an ACTIVE enrollment.
SELECT pg_temp.accepted('direct entry for an active enrollee', pg_temp.sub_sql(630,0,0,71,91,21));
SELECT pg_temp.refused('direct entry for a completed enrollee', pg_temp.sub_sql(631,0,0,77,91,21),'23514','identified survey contributor unavailable');
-- Project Officer with imports.process back and submissions.write gone: direct entry is refused, an import is still accepted.
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM pathways.roles r, pathways.permissions p WHERE r.code='PROJECT_OFFICER' AND p.code='imports.process';
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_OFFICER' AND p.code='submissions.write';
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(12,22);
SELECT pg_temp.refused('direct entry without submissions.write', pg_temp.sub_sql(631,0,0,71,91,22),'23514','identified survey contributor unavailable');
SELECT pg_temp.accepted('import without submissions.write', pg_temp.sub_sql(624,116,100,71,91,22));
RESET SESSION AUTHORIZATION;

-- Assessment source: a survey of the same person is accepted, another person's is not.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.accepted('OTHER assessment sourced from an imported survey of the same person', format($i$INSERT INTO pathways.assessment_results(
 id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id)
 VALUES(%L,%L,%L,%L,%L,%L,'OTHER',85,100,'2026-10-01',%L)$i$,pg_temp.u(801),pg_temp.u(1),pg_temp.u(41),pg_temp.u(61),pg_temp.u(81),pg_temp.u(601),pg_temp.u(21)));
SELECT pg_temp.refused('OTHER assessment sourced from another person''s survey', format($i$INSERT INTO pathways.assessment_results(
 id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id)
 VALUES(%L,%L,%L,%L,%L,%L,'OTHER',85,100,'2026-10-01',%L)$i$,pg_temp.u(802),pg_temp.u(1),pg_temp.u(41),pg_temp.u(61),pg_temp.u(81),pg_temp.u(602),pg_temp.u(21)),
 '23514','Source must be a validated nondummy submission');

-- Participation on a not started activity sourced from an imported survey.
SELECT pg_temp.accepted('participation on a not started activity sourced from an imported survey', format($i$INSERT INTO pathways.beneficiary_activity_participations(
 id,organization_id,project_id,enrollment_id,activity_id,participation_date,recorded_by_id,source_submission_id)
 VALUES(%L,%L,%L,%L,%L,'2026-10-01',%L,%L)$i$,pg_temp.u(851),pg_temp.u(1),pg_temp.u(41),pg_temp.u(81),pg_temp.u(61),pg_temp.u(21),pg_temp.u(601)));
RESET SESSION AUTHORIZATION;

SELECT 'STAGE_IMPORT_RUNTIME=PASS ('||current_setting('si.passed')||')' AS result \gset
ROLLBACK;
\echo :result
