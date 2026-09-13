-- Disposable PostgreSQL behavioral checks for P04. Synthetic rows only; rollback at end.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database()<>'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port()<>55448 OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'P04 checks require the guarded disposable replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('75000000-0000-4000-8000-000000000011'),
  ('75000000-0000-4000-8000-000000000012'),
  ('75000000-0000-4000-8000-000000000013'),
  ('75000000-0000-4000-8000-000000000014'),
  ('75000000-0000-4000-8000-000000000015'),
  ('75000000-0000-4000-8000-000000000016');
INSERT INTO pathways.organizations(id,code,name) VALUES
  ('75000000-0000-4000-8000-000000000001','P04_A','Synthetic P04 organization A'),
  ('75000000-0000-4000-8000-000000000002','P04_B','Synthetic P04 organization B');
INSERT INTO pathways.roles(id,code,name) VALUES
  ('75000000-0000-4000-8000-000000000021','MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('75000000-0000-4000-8000-000000000022','PROJECT_OFFICER','Project Officer'),
  ('75000000-0000-4000-8000-000000000023','PROGRAM_MANAGER','Program Manager'),
  ('75000000-0000-4000-8000-000000000024','GRANT_MANAGER','Grant Manager'),
  ('75000000-0000-4000-8000-000000000025','PROJECT_MANAGER','Project Manager');
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at
) VALUES
  ('75000000-0000-4000-8000-000000000031','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000021','75000000-0000-4000-8000-000000000011','Synthetic P04 M&E','p04-me@example.invalid','ACTIVE',now(),now()),
  ('75000000-0000-4000-8000-000000000032','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000022','75000000-0000-4000-8000-000000000012','Synthetic P04 officer','p04-po@example.invalid','ACTIVE',now(),now()),
  ('75000000-0000-4000-8000-000000000033','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000023','75000000-0000-4000-8000-000000000013','Synthetic P04 program manager','p04-pm@example.invalid','ACTIVE',now(),now()),
  ('75000000-0000-4000-8000-000000000034','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000024','75000000-0000-4000-8000-000000000014','Synthetic P04 grant manager','p04-gm@example.invalid','ACTIVE',now(),now()),
  ('75000000-0000-4000-8000-000000000035','75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000021','75000000-0000-4000-8000-000000000015','Synthetic P04 foreign M&E','p04-foreign@example.invalid','ACTIVE',now(),now()),
  ('75000000-0000-4000-8000-000000000036','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000025','75000000-0000-4000-8000-000000000016','Synthetic P04 project manager','p04-project-manager@example.invalid','ACTIVE',now(),now());

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON (
  (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN (
    'beneficiaries.records.read','beneficiaries.records.register','beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage','beneficiaries.identities.review'
  ))
  OR (r.code='PROJECT_OFFICER' AND p.code IN (
    'beneficiaries.records.read','beneficiaries.records.register'
  ))
  OR (r.code='PROJECT_MANAGER' AND p.code IN (
    'beneficiaries.records.read','beneficiaries.enrollments.manage'
  ))
) ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
  ('75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000001','P04_A_1','Synthetic P04 project A1','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000001','P04_A_2','Synthetic P04 project A2','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000043','75000000-0000-4000-8000-000000000002','P04_B_1','Synthetic P04 project B1','75000000-0000-4000-8000-000000000035');
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
  ('75000000-0000-4000-8000-000000000051','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000031','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000052','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000031','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000053','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000032','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000054','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000033','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000055','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000034','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000056','75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000043','75000000-0000-4000-8000-000000000035','75000000-0000-4000-8000-000000000035'),
  ('75000000-0000-4000-8000-000000000057','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000036','75000000-0000-4000-8000-000000000031');

INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id) VALUES
  ('75000000-0000-4000-8000-000000000061','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','registration',1,'Synthetic registration A1','BENEFICIARY_REGISTRATION','DRAFT','75000000-0000-4000-8000-000000000032'),
  ('75000000-0000-4000-8000-000000000062','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','registration',1,'Synthetic registration A2','BENEFICIARY_REGISTRATION','DRAFT','75000000-0000-4000-8000-000000000032');
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no) VALUES
  ('75000000-0000-4000-8000-000000000063','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000061','beneficiary_code','Beneficiary code','TEXT',true,1),
  ('75000000-0000-4000-8000-000000000064','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000062','beneficiary_code','Beneficiary code','TEXT',true,1);
UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id='75000000-0000-4000-8000-000000000031',published_at=now()
WHERE id IN ('75000000-0000-4000-8000-000000000061','75000000-0000-4000-8000-000000000062');

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000011',true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id','75000000-0000-4000-8000-000000000001',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000031',true);

INSERT INTO pathways.beneficiaries(
  id,organization_id,code,subject_type,display_name,first_name,last_name,sex,birth_date,
  age_at_registration,disability_status,consent_recorded,data_processing_consent_recorded,
  is_minor,guardian_consent_recorded,created_by_id
) VALUES (
  '75000000-0000-4000-8000-000000000071','75000000-0000-4000-8000-000000000001',
  'SHARED-001','INDIVIDUAL','Synthetic Shared','Synthetic','Shared','NOT_SPECIFIED','2000-01-01',
  26,'NOT_SPECIFIED',true,true,false,false,'75000000-0000-4000-8000-000000000031'
);
INSERT INTO pathways.beneficiary_project_enrollments(
  id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id
) VALUES
  ('75000000-0000-4000-8000-000000000072','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000071','2026-01-01','75000000-0000-4000-8000-000000000031'),
  ('75000000-0000-4000-8000-000000000073','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000071','2026-02-01','75000000-0000-4000-8000-000000000031');
INSERT INTO pathways.beneficiary_identifiers(
  id,organization_id,beneficiary_id,identifier_type,normalized_value,display_value,source,created_by_id
) VALUES (
  '75000000-0000-4000-8000-000000000074','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000071',
  'PARTNER_CASE_ID','SYNTHETIC-1','SYNTHETIC-1','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031'
);

INSERT INTO pathways.form_submissions(
  id,organization_id,project_id,form_id,form_version,client_submission_id,enrollment_id,
  submitted_by_id,source,status
) VALUES
  ('75000000-0000-4000-8000-000000000075','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000061',1,'75000000-0000-4000-8000-000000000085','75000000-0000-4000-8000-000000000072','75000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT'),
  ('75000000-0000-4000-8000-000000000076','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000062',1,'75000000-0000-4000-8000-000000000086','75000000-0000-4000-8000-000000000073','75000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT');
INSERT INTO pathways.form_response_values(
  organization_id,project_id,form_id,submission_id,field_id,value
) VALUES
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000061','75000000-0000-4000-8000-000000000075','75000000-0000-4000-8000-000000000063','"SHARED-001"'),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000062','75000000-0000-4000-8000-000000000076','75000000-0000-4000-8000-000000000064','"SHARED-001"');
UPDATE pathways.form_submissions SET status='VALIDATED',submitted_at=now(),validated_by_id='75000000-0000-4000-8000-000000000031',validated_at=now()
WHERE id IN ('75000000-0000-4000-8000-000000000075','75000000-0000-4000-8000-000000000076');
INSERT INTO pathways.beneficiary_consent_records(
  organization_id,project_id,beneficiary_id,enrollment_id,submission_id,kind,source,recorded_by_id,recorded_at
) VALUES
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000071','75000000-0000-4000-8000-000000000072','75000000-0000-4000-8000-000000000075','PARTICIPATION','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031',now()),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041','75000000-0000-4000-8000-000000000071','75000000-0000-4000-8000-000000000072','75000000-0000-4000-8000-000000000075','DATA_PROCESSING','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031',now()),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000071','75000000-0000-4000-8000-000000000073','75000000-0000-4000-8000-000000000076','PARTICIPATION','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031',now()),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000071','75000000-0000-4000-8000-000000000073','75000000-0000-4000-8000-000000000076','DATA_PROCESSING','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031',now());

DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.beneficiaries(organization_id,code,subject_type,display_name,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
    VALUES ('75000000-0000-4000-8000-000000000001','SHARED-001','INDIVIDUAL','Duplicate','Synthetic','Duplicate',true,true,'75000000-0000-4000-8000-000000000031');
    RAISE EXCEPTION 'Duplicate organization code was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO pathways.beneficiary_identifiers(organization_id,beneficiary_id,identifier_type,normalized_value,display_value,source,created_by_id)
    VALUES ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000071','PARTNER_CASE_ID','SYNTHETIC-1','SYNTHETIC-1','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031');
    RAISE EXCEPTION 'Duplicate stable identifier was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,display_name,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
    VALUES ('75000000-0000-4000-8000-000000000099','75000000-0000-4000-8000-000000000001','ROLLBACK-1','INDIVIDUAL','Rollback','Synthetic','Rollback',true,true,'75000000-0000-4000-8000-000000000031');
    RAISE EXCEPTION 'synthetic rollback';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF EXISTS(SELECT FROM pathways.beneficiaries WHERE id='75000000-0000-4000-8000-000000000099') THEN
    RAISE EXCEPTION 'Failed transaction retained a profile';
  END IF;
END
$$;

-- Add a profile visible only in project A2 to test non-disclosing exact lookup.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,display_name,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
VALUES ('75000000-0000-4000-8000-000000000081','75000000-0000-4000-8000-000000000001','HIDDEN-001','INDIVIDUAL','Synthetic Hidden','Synthetic','Hidden',true,true,'75000000-0000-4000-8000-000000000031');
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
VALUES ('75000000-0000-4000-8000-000000000082','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000042','75000000-0000-4000-8000-000000000081','2026-01-01','75000000-0000-4000-8000-000000000031');
INSERT INTO pathways.beneficiary_identifiers(organization_id,beneficiary_id,identifier_type,normalized_value,display_value,source,created_by_id)
VALUES ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000081','PARTNER_CASE_ID','HIDDEN-1','HIDDEN-1','DIRECT_ENTRY','75000000-0000-4000-8000-000000000031');

SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000012',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000032',true);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM pathways.beneficiaries)<>1
     OR (SELECT count(*) FROM pathways.beneficiary_project_enrollments)<>1
     OR (SELECT count(*) FROM pathways.beneficiary_consent_records)<>2 THEN
    RAISE EXCEPTION 'Project-limited profile/history visibility failed';
  END IF;
  IF EXISTS(SELECT FROM pathways.beneficiary_identifiers WHERE normalized_value='HIDDEN-1') THEN
    RAISE EXCEPTION 'Denied exact lookup disclosed another project profile';
  END IF;
  UPDATE pathways.beneficiaries SET display_name='Forbidden shared edit'
  WHERE id='75000000-0000-4000-8000-000000000071';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Unauthorized shared-profile update succeeded'; END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000013',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000033',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pathways.beneficiaries) OR EXISTS(SELECT FROM pathways.beneficiary_identifiers) THEN
    RAISE EXCEPTION 'Program Manager received Beneficiary detail';
  END IF;
END $$;

-- Enrollment management does not imply authority to discover and link a hidden profile.
SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000016',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000036',true);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO pathways.beneficiary_project_enrollments(
      organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id
    ) VALUES (
      '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000041',
      '75000000-0000-4000-8000-000000000081','2026-03-01','75000000-0000-4000-8000-000000000036'
    );
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Enrollment authority disclosed and linked a hidden profile'; END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000014',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000034',true);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pathways.beneficiaries) OR EXISTS(SELECT FROM pathways.beneficiary_consent_records) THEN
    RAISE EXCEPTION 'Grant Manager received Beneficiary detail';
  END IF;
END $$;

-- The same stable PATHWAYS code is valid in a different organization.
SELECT set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000015',true),
  set_config('app.organization_id','75000000-0000-4000-8000-000000000002',true),
  set_config('app.user_id','75000000-0000-4000-8000-000000000035',true);
INSERT INTO pathways.beneficiaries(organization_id,code,subject_type,display_name,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
VALUES ('75000000-0000-4000-8000-000000000002','SHARED-001','INDIVIDUAL','Synthetic Foreign','Synthetic','Foreign',true,true,'75000000-0000-4000-8000-000000000035');

ROLLBACK;
