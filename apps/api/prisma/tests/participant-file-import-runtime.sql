-- cr-pathways-participant-file-import (0080): disposable checks for the current-age minor rule, guardian consent details,
-- the guardian approval grant, import value rejections, held-row resolution, parking a resolved row for guardian consent
-- and unchanged participants. Synthetic fixtures only; everything rolls back. Run as a local superuser against a
-- disposable pathways_phase2_* or phase4/phase6 replay database that already has 0080 applied. Success prints PARTICIPANT_FILE_IMPORT_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Participant file import checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('80900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('pfi.passed',(coalesce(nullif(current_setting('pfi.passed',true),''),'0')::integer+1)::text,true);
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

-- The four guards keep prisma ownership, invoker rights, an empty search_path and their enabled triggers.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p04_guard_beneficiary()'::regprocedure,
   'pathways.p04_guard_consent()'::regprocedure,'pathways.p03_guard_import_row()'::regprocedure,
   'pathways.p03_assert_processed_row()'::regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""'])<>4
 OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgenabled='O' AND NOT tgisinternal AND (
   (tgname='p04_beneficiary' AND tgrelid='pathways.beneficiaries'::regclass)
   OR (tgname='p04_consent' AND tgrelid='pathways.beneficiary_consent_records'::regclass)
   OR (tgname='p03_guard_import_row' AND tgrelid='pathways.data_import_rows'::regclass)
   OR (tgname='p03_row_complete' AND tgrelid='pathways.data_import_rows'::regclass)))<>4
 THEN RAISE EXCEPTION 'participant file import guard state differs'; END IF;
END $$;
SELECT pg_temp.count_pass();

-- Fixtures: one organization, a Monitoring and Evaluation Officer, a Project Officer and a Program Manager (no profiles.update).
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PFI_A','Synthetic participant import organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'MONITORING_AND_EVALUATION_OFFICER','Synthetic PFI M&E','pfi-me@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'PROJECT_OFFICER','Synthetic PFI officer','pfi-po@example.invalid'),
 (pg_temp.u(23),pg_temp.u(13),'PROGRAM_MANAGER','Synthetic PFI program manager','pfi-pm@example.invalid')) v(id,auth_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; project fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 (pg_temp.u(41),pg_temp.u(1),'PFI_A_1','Synthetic PFI project A',pg_temp.u(21)),
 (pg_temp.u(42),pg_temp.u(1),'PFI_A_2','Synthetic PFI project B',pg_temp.u(21));
SET LOCAL session_replication_role = origin;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(51),pg_temp.u(1),pg_temp.u(41),pg_temp.u(21),pg_temp.u(21)),
 (pg_temp.u(52),pg_temp.u(1),pg_temp.u(41),pg_temp.u(22),pg_temp.u(21));

-- Profiles are written through the guards as the Monitoring and Evaluation Officer.
SELECT pg_temp.act_as(11,21);

-- Minor rule: an adult may carry guardian consent, a minor must, and minor status may end.
SELECT pg_temp.accepted('adult profile with guardian consent', $$INSERT INTO pathways.beneficiaries(id,organization_id,code,
 subject_type,display_name,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,is_minor,
 guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(61),pg_temp.u(1),'PFI-ADULT','INDIVIDUAL','Synthetic Adult',
 'Synthetic','Adult','1990-05-05',true,true,false,true,pg_temp.u(21))$$);
SELECT pg_temp.refused('minor without guardian consent', $$INSERT INTO pathways.beneficiaries(id,organization_id,code,
 subject_type,display_name,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,is_minor,
 guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(63),pg_temp.u(1),'PFI-NOGUARD','INDIVIDUAL','Synthetic Minor',
 'Synthetic','Minor','2012-01-01',true,true,true,false,pg_temp.u(21))$$,'P0001','requires guardian consent');
SET LOCAL session_replication_role = replica;
SELECT pg_temp.refused('check refuses a minor without guardian consent', $$INSERT INTO pathways.beneficiaries(id,
 organization_id,code,subject_type,display_name,first_name,last_name,birth_date,consent_recorded,
 data_processing_consent_recorded,is_minor,guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(63),pg_temp.u(1),
 'PFI-NOGUARD','INDIVIDUAL','Synthetic Minor','Synthetic','Minor','2012-01-01',true,true,true,false,pg_temp.u(21))$$,
 '23514','beneficiaries_minor_consent');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.accepted('minor profile for the consent checks', $$INSERT INTO pathways.beneficiaries(id,organization_id,code,
 subject_type,display_name,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,is_minor,
 guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(62),pg_temp.u(1),'PFI-MINOR','INDIVIDUAL','Synthetic Minor',
 'Synthetic','Minor','2005-01-01',true,true,true,true,pg_temp.u(21))$$);
SELECT pg_temp.accepted('minor profile that will come of age', $$INSERT INTO pathways.beneficiaries(id,organization_id,code,
 subject_type,display_name,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,is_minor,
 guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(64),pg_temp.u(1),'PFI-GROWN','INDIVIDUAL','Synthetic Grown',
 'Synthetic','Grown','2005-01-01',true,true,true,true,pg_temp.u(21))$$);
SELECT pg_temp.accepted('adult profile without guardian consent', $$INSERT INTO pathways.beneficiaries(id,organization_id,code,
 subject_type,display_name,first_name,last_name,birth_date,consent_recorded,data_processing_consent_recorded,is_minor,
 guardian_consent_recorded,created_by_id) VALUES (pg_temp.u(65),pg_temp.u(1),'PFI-GUARD','INDIVIDUAL','Synthetic Guarded',
 'Synthetic','Guarded','2005-01-01',true,true,false,false,pg_temp.u(21))$$);
SELECT pg_temp.act_as(13,23);
SELECT pg_temp.refused('minor status change without profiles.update', $$UPDATE pathways.beneficiaries SET is_minor=false
 WHERE id=pg_temp.u(64)$$,'P0001','Profile update authority');
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.accepted('minor status ends with profiles.update', $$UPDATE pathways.beneficiaries SET is_minor=false
 WHERE id=pg_temp.u(64)$$);
SELECT pg_temp.ok('minor status change was stored',
 (SELECT NOT is_minor FROM pathways.beneficiaries WHERE id=pg_temp.u(64)));
SELECT pg_temp.refused('consent facts stay immutable', $$UPDATE pathways.beneficiaries SET consent_recorded=false
 WHERE id=pg_temp.u(64)$$,'P0001','immutable');
SELECT pg_temp.ok('runtime may update minor status and guardian consent',
 has_column_privilege('pathways_runtime','pathways.beneficiaries','is_minor','UPDATE')
 AND has_column_privilege('pathways_runtime','pathways.beneficiaries','guardian_consent_recorded','UPDATE'));

-- Enrollments, submissions, forms and a field are written without triggers or foreign keys; the checks then run with both.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id) VALUES
 (pg_temp.u(31),pg_temp.u(1),pg_temp.u(41),'registration',1,'Synthetic PFI registration','BENEFICIARY_REGISTRATION','DRAFT',pg_temp.u(21)),
 (pg_temp.u(32),pg_temp.u(1),pg_temp.u(41),'monitoring',1,'Synthetic PFI monitoring','ACTIVITY_MONITORING','DRAFT',pg_temp.u(21));
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no)
VALUES (pg_temp.u(33),pg_temp.u(1),pg_temp.u(41),pg_temp.u(31),'first_name','First name','TEXT',true,1);
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES
 (pg_temp.u(71),pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),'2020-06-01',pg_temp.u(21)),
 (pg_temp.u(72),pg_temp.u(1),pg_temp.u(42),pg_temp.u(61),'2026-01-01',pg_temp.u(21)),
 (pg_temp.u(74),pg_temp.u(1),pg_temp.u(41),pg_temp.u(65),'2026-01-01',pg_temp.u(21));
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,enrollment_id,
 submitted_by_id,source,status) VALUES
 (pg_temp.u(81),pg_temp.u(1),pg_temp.u(41),pg_temp.u(31),1,pg_temp.u(91),pg_temp.u(71),pg_temp.u(21),'DIRECT_ENCODING','DRAFT'),
 (pg_temp.u(82),pg_temp.u(1),pg_temp.u(41),pg_temp.u(31),1,pg_temp.u(92),pg_temp.u(71),pg_temp.u(21),'DIRECT_ENCODING','DRAFT');
SET LOCAL session_replication_role = origin;

-- Guardian consent changes need the approval grant on every project the participant is enrolled in, not only profiles.update.
SELECT pg_temp.refused('guardian consent set by a profiles.update holder', $$UPDATE pathways.beneficiaries SET is_minor=true,
 guardian_consent_recorded=true WHERE id=pg_temp.u(65)$$,'P0001','guardian consent approval authority');
SELECT pg_temp.refused('guardian consent revoked by a profiles.update holder', $$UPDATE pathways.beneficiaries SET
 guardian_consent_recorded=false WHERE id=pg_temp.u(61)$$,'P0001','guardian consent approval authority');
SELECT pg_temp.act_as(12,22);
SELECT pg_temp.accepted('guardian consent set by the Project Officer', $$UPDATE pathways.beneficiaries SET is_minor=true,
 guardian_consent_recorded=true WHERE id=pg_temp.u(65)$$);
SELECT pg_temp.act_as(11,21);

-- Guardian consent follows age on the record's own date, not on the enrollment date (2020-06-01, when the profile was 15).
SELECT pg_temp.accepted('guardian record while a minor, with details', $$INSERT INTO pathways.beneficiary_consent_records(
 organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at,guardian_name,
 guardian_consent_date,guardian_note) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(81),'GUARDIAN',
 'DIRECT_ENTRY',pg_temp.u(21),'2020-01-01','Synthetic Guardian','2019-12-30','Offline consent on paper')$$);
SELECT pg_temp.ok('guardian details were stored',
 (SELECT guardian_name='Synthetic Guardian' AND guardian_consent_date='2019-12-30' AND guardian_note='Offline consent on paper'
  FROM pathways.beneficiary_consent_records WHERE submission_id=pg_temp.u(81) AND kind='GUARDIAN'));
SELECT pg_temp.refused('guardian record once the profile is an adult', $$INSERT INTO pathways.beneficiary_consent_records(
 organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at)
 VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(82),'GUARDIAN','DIRECT_ENTRY',pg_temp.u(21),
 '2024-01-02')$$,'P0001','Minor status must agree');
SET LOCAL TIME ZONE 'America/Los_Angeles';
SELECT pg_temp.refused('consent date does not depend on the session time zone', $$INSERT INTO pathways.beneficiary_consent_records(
 organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at)
 VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(82),'GUARDIAN','DIRECT_ENTRY',pg_temp.u(21),
 '2022-12-31 20:00:00+00')$$,'P0001','Minor status must agree');
RESET TIME ZONE;
SELECT pg_temp.refused('guardian details on a participation record', $$INSERT INTO pathways.beneficiary_consent_records(
 organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at,guardian_name)
 VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(82),'PARTICIPATION','DIRECT_ENTRY',pg_temp.u(21),
 '2020-01-01','Synthetic Guardian')$$,'23514','beneficiary_consent_records_guardian_details');
SELECT pg_temp.refused('blank guardian name', $$INSERT INTO pathways.beneficiary_consent_records(organization_id,project_id,
 beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at,guardian_name) VALUES (pg_temp.u(1),
 pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(82),'GUARDIAN','DIRECT_ENTRY',pg_temp.u(21),'2020-01-01','   ')$$,
 '23514','beneficiary_consent_records_guardian_name');
SELECT pg_temp.refused('guardian note over 500 characters', $$INSERT INTO pathways.beneficiary_consent_records(
 organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at,guardian_note)
 VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(71),pg_temp.u(82),'GUARDIAN','DIRECT_ENTRY',pg_temp.u(21),
 '2020-01-01',repeat('n',501))$$,'23514','beneficiary_consent_records_guardian_note');

-- Guardian approval grant: Project Officer only, in the ceiling and in the role grants.
SELECT pg_temp.ok('Project Officer may approve guardian consent',
 pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.guardian_consent.approve'));
SELECT pg_temp.ok('M&E Officer may not approve guardian consent',
 NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.guardian_consent.approve'));
SELECT pg_temp.ok('System Administrator may not approve guardian consent',
 NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','beneficiaries.guardian_consent.approve'));
SELECT pg_temp.ok('only Project Officer holds the grant',
 (SELECT count(*)=1 AND min(r.code)='PROJECT_OFFICER' FROM pathways.role_permissions rp
  JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id
  WHERE p.code='beneficiaries.guardian_consent.approve'));
SELECT pg_temp.ok('existing ceilings are unchanged',
 pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 AND pathways.p09_role_allows('PROJECT_OFFICER','assessments.record')
 AND NOT pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.identities.review'));

-- Value rejections: one per participant, field and value, append-only, written as the current actor.
SELECT pg_temp.accepted('first value rejection', $$INSERT INTO pathways.import_value_rejections(organization_id,project_id,
 beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(33),
 repeat('a',64),pg_temp.u(21))$$);
SELECT pg_temp.refused('same value rejected twice', $$INSERT INTO pathways.import_value_rejections(organization_id,project_id,
 beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(33),
 repeat('a',64),pg_temp.u(21))$$,'23505','import_value_rejections');
SELECT pg_temp.accepted('a different value for the same field', $$INSERT INTO pathways.import_value_rejections(
 organization_id,project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),
 pg_temp.u(62),pg_temp.u(33),repeat('b',64),pg_temp.u(21))$$);
SELECT pg_temp.refused('rejection on a project the actor is not assigned to', $$INSERT INTO pathways.import_value_rejections(
 organization_id,project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(42),
 pg_temp.u(62),pg_temp.u(33),repeat('c',64),pg_temp.u(21))$$,'P0001','import review permission');
SELECT pg_temp.refused('rejection by someone else', $$INSERT INTO pathways.import_value_rejections(organization_id,project_id,
 beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(33),
 repeat('c',64),pg_temp.u(22))$$,'P0001','current actor');
SET LOCAL session_replication_role = replica;
SELECT pg_temp.refused('hash is 64 lowercase hex characters', $$INSERT INTO pathways.import_value_rejections(organization_id,
 project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),pg_temp.u(33),
 repeat('Z',64),pg_temp.u(21))$$,'23514','import_value_rejections_hash');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.refused('rejection update', $$UPDATE pathways.import_value_rejections SET rejected_at=now()$$,'P0001','append-only');
SELECT pg_temp.refused('rejection delete', $$DELETE FROM pathways.import_value_rejections$$,'P0001','append-only');
SELECT pg_temp.ok('runtime reads and inserts rejections but cannot change them',
 has_table_privilege('pathways_runtime','pathways.import_value_rejections','SELECT')
 AND has_table_privilege('pathways_runtime','pathways.import_value_rejections','INSERT')
 AND NOT has_table_privilege('pathways_runtime','pathways.import_value_rejections','UPDATE')
 AND NOT has_table_privilege('pathways_runtime','pathways.import_value_rejections','DELETE')
 AND NOT has_table_privilege('anon','pathways.import_value_rejections','SELECT')
 AND NOT has_table_privilege('authenticated','pathways.import_value_rejections','SELECT'));
SELECT pg_temp.ok('rejections are owned by prisma with forced row security',
 (SELECT pg_catalog.pg_get_userbyid(c.relowner)='prisma' AND c.relrowsecurity AND c.relforcerowsecurity
  FROM pg_catalog.pg_class c WHERE c.oid='pathways.import_value_rejections'::regclass));

-- Import rows are written without triggers or foreign keys; the transitions below then run with both.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,original_file_name,uploaded_by_id,
 source_checksum,storage_bucket,storage_object_key,file_type,status,storage_status)
SELECT pg_temp.u(b),pg_temp.u(1),pg_temp.u(41),pg_temp.u(f),1,'people.xlsx',pg_temp.u(21),repeat('a',64),'uploads','private'||b,'XLSX',
 'UPLOADED','STORED' FROM (VALUES (110,31),(111,32)) v(b,f);
INSERT INTO pathways.data_import_rows(id,organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data,
 status,normalized_data,validation_errors,validated_by_id,validated_at,processed_at,processing_claim_id,processing_claimed_at)
SELECT pg_temp.u(100+n),pg_temp.u(1),pg_temp.u(41),CASE WHEN n=9 THEN pg_temp.u(32) ELSE pg_temp.u(31) END,CASE WHEN n=9 THEN pg_temp.u(111) ELSE pg_temp.u(110) END,n,
 repeat('d',64),'{}'::jsonb,s::pathways.import_row_status,
 CASE WHEN s='INVALID' THEN NULL ELSE '{"first_name":"Synthetic"}'::jsonb END,
 CASE WHEN s='INVALID' THEN '[{"code":"IDENTITY_CONFLICT"}]'::jsonb ELSE '[]'::jsonb END,
 pg_temp.u(21),'2026-01-01'::timestamptz,CASE WHEN s='PROCESSED' THEN '2026-01-02'::timestamptz END,
 CASE WHEN s='PROCESSING' THEN pg_temp.u(120) END,CASE WHEN s='PROCESSING' THEN '2026-01-02'::timestamptz END
FROM (VALUES (1,'UNPROCESSED'),(2,'INVALID'),(3,'VALID'),(4,'PROCESSED'),(5,'PROCESSING'),(6,'PROCESSING'),(7,'PROCESSING'),
 (8,'PROCESSING'),(9,'PROCESSING'),(10,'PROCESSING'),(11,'UNPROCESSED'),(12,'INVALID'),(13,'PROCESSING'),(14,'UNPROCESSED'),
 (15,'INVALID'),(16,'UNPROCESSED'),(17,'PROCESSING')) v(n,s);
SET LOCAL session_replication_role = origin;
-- Completion of a processed row is checked at once instead of at commit.
SET CONSTRAINTS pathways.p03_row_complete IMMEDIATE;

-- Resolution: a held row moves once to PROCESSING with all three resolution columns and nothing else changed.
SELECT pg_temp.accepted('unprocessed row resolves into processing', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at='2026-01-03',processing_claim_id=pg_temp.u(121),
 processing_claimed_at='2026-01-03',processing_attempts=1,updated_at=now() WHERE id=pg_temp.u(101)$$);
SELECT pg_temp.refused('second resolution set', $$UPDATE pathways.data_import_rows SET resolution_data='{"choice":"PATHWAYS"}'
 WHERE id=pg_temp.u(101)$$,'P0001','resolution');
SELECT pg_temp.refused('resolution cleared', $$UPDATE pathways.data_import_rows SET resolution_data=NULL,resolved_by_id=NULL,
 resolved_at=NULL WHERE id=pg_temp.u(101)$$,'P0001','resolution');
SELECT pg_temp.refused('resolved time changed', $$UPDATE pathways.data_import_rows SET resolved_at=now() WHERE id=pg_temp.u(101)$$,
 'P0001','resolution');
SELECT pg_temp.refused('resolution on a processed row', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processing_claim_id=pg_temp.u(121),
 processing_claimed_at=now() WHERE id=pg_temp.u(104)$$,'P0001','resolution');
SELECT pg_temp.refused('resolution on a valid row', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processing_claim_id=pg_temp.u(121),
 processing_claimed_at=now() WHERE id=pg_temp.u(103)$$,'P0001','resolution');
SELECT pg_temp.refused('resolution by someone else', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(22),resolved_at=now(),processing_claim_id=pg_temp.u(121),
 processing_claimed_at=now() WHERE id=pg_temp.u(111)$$,'P0001','current actor');
SELECT pg_temp.refused('resolution that rewrites normalized data', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processing_claim_id=pg_temp.u(121),
 processing_claimed_at=now(),normalized_data='{"first_name":"Other"}' WHERE id=pg_temp.u(111)$$,'P0001','resolution');
SELECT pg_temp.refused('resolution that rewrites raw data', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processing_claim_id=pg_temp.u(121),
 processing_claimed_at=now(),raw_data='{"a":1}' WHERE id=pg_temp.u(111)$$,'P0001','immutable');
SELECT pg_temp.refused('resolution that skips processing', $$UPDATE pathways.data_import_rows SET status='PROCESSED',
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processed_at=now() WHERE id=pg_temp.u(111)$$,
 'P0001','resolution');
SET LOCAL session_replication_role = replica;
SELECT pg_temp.refused('resolution data must be an object', $$UPDATE pathways.data_import_rows SET resolution_data='[]'::jsonb,
 resolved_by_id=pg_temp.u(21),resolved_at=now() WHERE id=pg_temp.u(111)$$,'23514','data_import_rows_resolution_shape');
SELECT pg_temp.refused('resolution columns are all or none', $$UPDATE pathways.data_import_rows SET resolution_data='{}'
 WHERE id=pg_temp.u(111)$$,'23514','data_import_rows_resolution_shape');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.refused('invalid row cannot process without a resolution', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(121),processing_claimed_at=now() WHERE id=pg_temp.u(112)$$,'23514','import_rows_state');
SELECT pg_temp.accepted('invalid row resolves into processing', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"choice":"YOURS"}',resolved_by_id=pg_temp.u(21),resolved_at='2026-01-03',processing_claim_id=pg_temp.u(121),
 processing_claimed_at='2026-01-03',processing_attempts=1 WHERE id=pg_temp.u(102)$$);
SELECT pg_temp.ok('invalid row kept its validation errors and empty normalized data',
 (SELECT normalized_data IS NULL AND jsonb_array_length(validation_errors)=1
  FROM pathways.data_import_rows WHERE id=pg_temp.u(102)));
SELECT pg_temp.accepted('valid row claims as before', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(121),processing_claimed_at='2026-01-03' WHERE id=pg_temp.u(103)$$);
SELECT pg_temp.refused('processed row stays frozen', $$UPDATE pathways.data_import_rows SET processing_error_code='X'
 WHERE id=pg_temp.u(104)$$,'P0001','immutable');

-- Unchanged participants: a processed registration row needs no submission when its matched participant is enrolled in the project.
SELECT pg_temp.accepted('unchanged row with an enrolled participant', $$UPDATE pathways.data_import_rows SET status='PROCESSED',
 processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,registration_outcome='UNCHANGED',
 matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(105)$$);
SELECT pg_temp.accepted('resolved invalid row completes as unchanged', $$UPDATE pathways.data_import_rows SET status='PROCESSED',
 processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,registration_outcome='UNCHANGED',
 matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(102)$$);
SELECT pg_temp.refused('unchanged row whose participant is not enrolled in the project', $$UPDATE pathways.data_import_rows
 SET status='PROCESSED',processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,
 registration_outcome='UNCHANGED',matched_beneficiary_id=pg_temp.u(61) WHERE id=pg_temp.u(106)$$,'P0001','normalized submission');
SELECT pg_temp.refused('unchanged row without a matched participant', $$UPDATE pathways.data_import_rows SET status='PROCESSED',
 processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,registration_outcome='UNCHANGED'
 WHERE id=pg_temp.u(107)$$,'23514','data_import_rows_matched_beneficiary');
SELECT pg_temp.refused('matched participant without the unchanged outcome', $$UPDATE pathways.data_import_rows SET
 status='PROCESSED',processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,registration_outcome='CREATED',
 matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(107)$$,'23514','data_import_rows_matched_beneficiary');
SELECT pg_temp.refused('processed row with neither submission nor outcome', $$UPDATE pathways.data_import_rows SET status='PROCESSED',
 processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(108)$$,'P0001',
 'normalized submission');
SELECT pg_temp.refused('unchanged outcome on a form that is not a registration', $$UPDATE pathways.data_import_rows SET
 status='PROCESSED',processed_at='2026-01-04',processing_claim_id=NULL,processing_claimed_at=NULL,
 registration_outcome='UNCHANGED',matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(109)$$,'P0001','normalized submission');
SELECT pg_temp.refused('outcome set before the row is processed', $$UPDATE pathways.data_import_rows SET
 registration_outcome='UNCHANGED',matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(110)$$,'P0001','outcome');
SELECT pg_temp.refused('unknown outcome', $$UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at='2026-01-04',
 processing_claim_id=NULL,processing_claimed_at=NULL,registration_outcome='MERGED' WHERE id=pg_temp.u(113)$$,'23514',
 'data_import_rows_registration_outcome');
SELECT pg_temp.refused('outcome changed after processing', $$UPDATE pathways.data_import_rows SET registration_outcome='CREATED',
 matched_beneficiary_id=NULL WHERE id=pg_temp.u(105)$$,'P0001','immutable');

-- A resolved row that needs guardian consent is parked once with its resolution kept, then claimed once more by the approval.
SELECT pg_temp.refused('unresolved held row cannot carry a resolution into the parked state', $$UPDATE pathways.data_import_rows SET
 resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),processing_error_code='GUARDIAN_CONSENT_REQUIRED'
 WHERE id=pg_temp.u(111)$$,'P0001','resolution');
SELECT pg_temp.refused('unresolved invalid row cannot carry a resolution into the parked state', $$UPDATE pathways.data_import_rows SET
 status='UNPROCESSED',resolution_data='{"choice":"FILE"}',resolved_by_id=pg_temp.u(21),resolved_at=now(),
 processing_error_code='GUARDIAN_CONSENT_REQUIRED' WHERE id=pg_temp.u(112)$$,'P0001','resolution');
SELECT pg_temp.accepted('processing row is held with its code as before', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(117)$$);
SELECT pg_temp.accepted('held row resolves into processing', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"saveAs":"NEW"}',resolved_by_id=pg_temp.u(21),resolved_at='2026-01-03',processing_claim_id=pg_temp.u(121),
 processing_claimed_at='2026-01-03',processing_attempts=1,processing_error_code=NULL WHERE id=pg_temp.u(114)$$);
SELECT pg_temp.accepted('invalid row resolves into processing for the park', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"saveAs":"NEW"}',resolved_by_id=pg_temp.u(21),resolved_at='2026-01-03',processing_claim_id=pg_temp.u(121),
 processing_claimed_at='2026-01-03',processing_attempts=1,processing_error_code=NULL WHERE id=pg_temp.u(115)$$);
SELECT pg_temp.accepted('third row resolves into processing', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolution_data='{"saveAs":"NEW"}',resolved_by_id=pg_temp.u(21),resolved_at='2026-01-03',processing_claim_id=pg_temp.u(121),
 processing_claimed_at='2026-01-03',processing_attempts=1,processing_error_code=NULL WHERE id=pg_temp.u(116)$$);
SELECT pg_temp.refused('park with another code', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='PROFILE_CHANGED',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(116)$$,
 'P0001','may wait for guardian consent once');
SELECT pg_temp.refused('park that rewrites normalized data', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL,
 normalized_data='{"first_name":"Other"}' WHERE id=pg_temp.u(116)$$,'P0001','only its status and claim columns');
SELECT pg_temp.refused('park that rewrites the resolution', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL,
 resolution_data='{"saveAs":"UPDATE"}' WHERE id=pg_temp.u(116)$$,'P0001','resolution');
SELECT pg_temp.accepted('resolved row parks for guardian consent', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(114)$$);
SELECT pg_temp.accepted('resolved invalid row parks for guardian consent', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(115)$$);
SELECT pg_temp.ok('parked rows keep their resolution and validation state',
 (SELECT count(*)=2 AND bool_and(resolution_data='{"saveAs":"NEW"}' AND resolved_by_id=pg_temp.u(21) AND processing_claim_id IS NULL)
  AND count(*) FILTER (WHERE normalized_data IS NULL AND jsonb_array_length(validation_errors)=1)=1
  FROM pathways.data_import_rows WHERE id IN (pg_temp.u(114),pg_temp.u(115))));
SELECT pg_temp.refused('parked row resolution changed', $$UPDATE pathways.data_import_rows SET resolution_data='{"saveAs":"UPDATE"}'
 WHERE id=pg_temp.u(114)$$,'P0001','resolution');
SELECT pg_temp.refused('parked row claimed by a resolver who cannot approve', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(122),processing_claimed_at=now(),processing_attempts=2 WHERE id=pg_temp.u(114)$$,'P0001',
 'guardian consent approval');
SELECT pg_temp.act_as(12,22);
SELECT pg_temp.refused('parked row claimed with another resolver', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 resolved_by_id=pg_temp.u(22),processing_claim_id=pg_temp.u(122),processing_claimed_at=now(),processing_attempts=2
 WHERE id=pg_temp.u(114)$$,'P0001','resolution');
SELECT pg_temp.refused('parked row claimed with its code cleared', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(122),processing_claimed_at=now(),processing_attempts=2,processing_error_code=NULL
 WHERE id=pg_temp.u(114)$$,'P0001','guardian consent approval');
SELECT pg_temp.accepted('parked row claimed by the guardian approval', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(122),processing_claimed_at=now(),processing_attempts=2 WHERE id=pg_temp.u(114)$$);
SELECT pg_temp.accepted('parked invalid row claimed by the guardian approval', $$UPDATE pathways.data_import_rows SET status='PROCESSING',
 processing_claim_id=pg_temp.u(122),processing_claimed_at=now(),processing_attempts=2 WHERE id=pg_temp.u(115)$$);
SELECT pg_temp.refused('second park of a claimed row', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processing_claim_id=NULL,processing_claimed_at=NULL WHERE id=pg_temp.u(114)$$,
 'P0001','may wait for guardian consent once');
SELECT pg_temp.accepted('approved row completes', $$UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at='2026-01-04',
 processing_claim_id=NULL,processing_claimed_at=NULL,processing_error_code=NULL,registration_outcome='UNCHANGED',
 matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(114)$$);
SELECT pg_temp.accepted('approved invalid row completes', $$UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at='2026-01-04',
 processing_claim_id=NULL,processing_claimed_at=NULL,processing_error_code=NULL,registration_outcome='UNCHANGED',
 matched_beneficiary_id=pg_temp.u(62) WHERE id=pg_temp.u(115)$$);
SELECT pg_temp.refused('completed row stays frozen', $$UPDATE pathways.data_import_rows SET status='UNPROCESSED',
 processing_error_code='GUARDIAN_CONSENT_REQUIRED',processed_at=NULL WHERE id=pg_temp.u(114)$$,'P0001','immutable');
SELECT pg_temp.act_as(11,21);

-- Under the runtime role, row security keeps rejections inside their organization and the guardian flag keeps its approval gate.
INSERT INTO auth.users(id) VALUES (pg_temp.u(14));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(2),'PFI_B','Synthetic second participant import organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT pg_temp.u(24),pg_temp.u(2),r.id,pg_temp.u(14),'Synthetic PFI other M&E','pfi-other@example.invalid','ACTIVE',now(),now()
FROM pathways.roles r WHERE r.code='MONITORING_AND_EVALUATION_OFFICER';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(11,21);
SELECT pg_temp.ok('runtime reads the rejections of its organization', (SELECT count(*)=2 FROM pathways.import_value_rejections));
SELECT pg_temp.accepted('runtime inserts a rejection in its organization', $$INSERT INTO pathways.import_value_rejections(
 organization_id,project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),
 pg_temp.u(33),repeat('d',64),pg_temp.u(21))$$);
SELECT pg_temp.refused('runtime refuses a guardian flag change without the approval authority', $$UPDATE pathways.beneficiaries
 SET guardian_consent_recorded=false WHERE id=pg_temp.u(65)$$,'P0001','guardian consent approval authority');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(14)::text,true),set_config('app.organization_id',pg_temp.u(2)::text,true),
 set_config('app.user_id',pg_temp.u(24)::text,true);
SELECT pg_temp.ok('another organization reads no rejections', (SELECT count(*)=0 FROM pathways.import_value_rejections));
SELECT pg_temp.refused('another organization cannot insert a rejection', $$INSERT INTO pathways.import_value_rejections(
 organization_id,project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),pg_temp.u(41),pg_temp.u(62),
 pg_temp.u(33),repeat('e',64),pg_temp.u(24))$$,'P0001','import review permission');
RESET ROLE;
-- With the append-only trigger off, row security alone must keep another organization from writing a rejection.
ALTER TABLE pathways.import_value_rejections DISABLE TRIGGER p80_value_rejection;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(14)::text,true),set_config('app.organization_id',pg_temp.u(2)::text,true),
 set_config('app.user_id',pg_temp.u(24)::text,true);
SELECT pg_temp.refused('row security refuses a rejection outside the context organization', $$INSERT INTO
 pathways.import_value_rejections(organization_id,project_id,beneficiary_id,field_id,value_hash,rejected_by_id) VALUES (pg_temp.u(1),
 pg_temp.u(41),pg_temp.u(62),pg_temp.u(33),repeat('e',64),pg_temp.u(24))$$,'42501','row-level security');
RESET ROLE;
ALTER TABLE pathways.import_value_rejections ENABLE TRIGGER p80_value_rejection;
SELECT pg_temp.act_as(11,21);

SELECT 'PARTICIPANT_FILE_IMPORT_ASSERTIONS_PASSED=' || current_setting('pfi.passed') AS result;
DO $$ BEGIN IF current_setting('pfi.passed')::integer<>92 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
SELECT 'PARTICIPANT_FILE_IMPORT_RUNTIME=PASS (' || current_setting('pfi.passed') || ')' AS result;
ROLLBACK;
