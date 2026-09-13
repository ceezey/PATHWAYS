-- Disposable PostgreSQL behavioral checks for the P02 metadata boundary.
-- All identifiers and records are synthetic and the transaction rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port() <> 55448
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'P02 behavioral checks require the guarded disposable replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('72000000-0000-4000-8000-000000000011'),
  ('72000000-0000-4000-8000-000000000012'),
  ('72000000-0000-4000-8000-000000000013');

INSERT INTO pathways.organizations(id,code,name) VALUES
  ('72000000-0000-4000-8000-000000000001','P02_ORG_A','Synthetic P02 organization A'),
  ('72000000-0000-4000-8000-000000000002','P02_ORG_B','Synthetic P02 organization B');

INSERT INTO pathways.roles(id,code,name) VALUES
  ('72000000-0000-4000-8000-000000000021','P02_AUTHOR','Synthetic P02 author'),
  ('72000000-0000-4000-8000-000000000022','P02_REVIEWER','Synthetic P02 reviewer');

INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at
) VALUES
  ('72000000-0000-4000-8000-000000000031','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000011','Synthetic P02 author','p02-author@example.invalid','ACTIVE',now(),now()),
  ('72000000-0000-4000-8000-000000000032','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000012','Synthetic P02 reviewer','p02-reviewer@example.invalid','ACTIVE',now(),now()),
  ('72000000-0000-4000-8000-000000000033','72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000013','Synthetic P02 foreign user','p02-foreign@example.invalid','ACTIVE',now(),now());

INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
  ('72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000001','P02_A_1','Synthetic P02 project A','72000000-0000-4000-8000-000000000031'),
  ('72000000-0000-4000-8000-000000000042','72000000-0000-4000-8000-000000000002','P02_B_1','Synthetic P02 project B','72000000-0000-4000-8000-000000000033');

INSERT INTO pathways.digital_forms(
  id,organization_id,project_id,code,version,name,form_type,status,created_by_id
) VALUES
  ('72000000-0000-4000-8000-000000000061','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','monitoring',1,'Monitoring v1','OUTCOME_MONITORING','DRAFT','72000000-0000-4000-8000-000000000031'),
  ('72000000-0000-4000-8000-000000000062','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','self_review',1,'Self review','OTHER','DRAFT','72000000-0000-4000-8000-000000000031'),
  ('72000000-0000-4000-8000-000000000063','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','concurrent',1,'Concurrent publish','OTHER','DRAFT','72000000-0000-4000-8000-000000000031'),
  ('72000000-0000-4000-8000-000000000064','72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000042','foreign',1,'Foreign form','OTHER','DRAFT','72000000-0000-4000-8000-000000000033'),
  ('72000000-0000-4000-8000-000000000065','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','monitoring',2,'Monitoring v2','OUTCOME_MONITORING','DRAFT','72000000-0000-4000-8000-000000000031');

INSERT INTO pathways.form_fields(
  id,organization_id,project_id,form_id,code,label,data_type,is_required,
  allowed_values,minimum_value,maximum_value,minimum_date,maximum_date,
  minimum_length,maximum_length,sequence_no
) VALUES
  ('72000000-0000-4000-8000-000000000071','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061','score','Score','DECIMAL',true,NULL,0,100,NULL,NULL,NULL,NULL,1),
  ('72000000-0000-4000-8000-000000000072','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000065','score','Score v2','DECIMAL',true,NULL,0,10,NULL,NULL,NULL,NULL,1),
  ('72000000-0000-4000-8000-000000000073','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000063','note','Note','TEXT',false,NULL,NULL,NULL,NULL,NULL,0,2000,1);

UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id='72000000-0000-4000-8000-000000000032',published_at=now()
WHERE id IN ('72000000-0000-4000-8000-000000000061','72000000-0000-4000-8000-000000000065');

DO $$
DECLARE original_revision timestamptz; affected integer;
BEGIN
  BEGIN
    UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id=created_by_id,published_at=now()
    WHERE id='72000000-0000-4000-8000-000000000062';
    RAISE EXCEPTION 'Self-publication was not rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Self-publication was not rejected' THEN RAISE; END IF;
  END;

  SELECT updated_at INTO original_revision FROM pathways.digital_forms
  WHERE id='72000000-0000-4000-8000-000000000063';
  UPDATE pathways.digital_forms
  SET status='PUBLISHED',published_by_id='72000000-0000-4000-8000-000000000032',published_at=now(),updated_at=clock_timestamp()
  WHERE id='72000000-0000-4000-8000-000000000063' AND updated_at=original_revision;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'First optimistic publication did not succeed'; END IF;
  UPDATE pathways.digital_forms SET archived_at=now()
  WHERE id='72000000-0000-4000-8000-000000000063' AND updated_at=original_revision;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale concurrent publication was not rejected'; END IF;

  BEGIN
    UPDATE pathways.digital_forms SET name='Mutated published definition'
    WHERE id='72000000-0000-4000-8000-000000000061';
    RAISE EXCEPTION 'Published definition mutation was not rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Published definition mutation was not rejected' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE pathways.form_fields SET maximum_value=999
    WHERE id='72000000-0000-4000-8000-000000000071';
    RAISE EXCEPTION 'Published field mutation was not rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Published field mutation was not rejected' THEN RAISE; END IF;
  END;
END
$$;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000011',true),
       set_config('request.jwt.claims','',true),
       set_config('app.organization_id','72000000-0000-4000-8000-000000000001',true),
       set_config('app.user_id','72000000-0000-4000-8000-000000000031',true);

DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM pathways.digital_forms) <> 4 THEN
    RAISE EXCEPTION 'Runtime organization isolation for form definitions failed';
  END IF;
  BEGIN
    INSERT INTO pathways.form_submissions(
      id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status
    ) VALUES (
      '72000000-0000-4000-8000-000000000081','72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000042','72000000-0000-4000-8000-000000000064',1,'72000000-0000-4000-8000-000000000091','72000000-0000-4000-8000-000000000033','DIRECT_ENCODING','DRAFT'
    );
    RAISE EXCEPTION 'Cross-organization direct entry was not rejected';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
  END;

  INSERT INTO pathways.form_submissions(
    id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status
  ) VALUES (
    '72000000-0000-4000-8000-000000000082','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061',1,'72000000-0000-4000-8000-000000000092','72000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT'
  );
  INSERT INTO pathways.form_response_values(
    id,organization_id,project_id,form_id,submission_id,field_id,value
  ) VALUES (
    '72000000-0000-4000-8000-000000000083','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061','72000000-0000-4000-8000-000000000082','72000000-0000-4000-8000-000000000071','25.5'::jsonb
  );

  INSERT INTO pathways.form_submissions(
    id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status
  ) VALUES (
    '72000000-0000-4000-8000-000000000085','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061',1,'72000000-0000-4000-8000-000000000095','72000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT'
  );
  INSERT INTO pathways.form_response_values(
    id,organization_id,project_id,form_id,submission_id,field_id,value
  ) VALUES (
    '72000000-0000-4000-8000-000000000086','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061','72000000-0000-4000-8000-000000000085','72000000-0000-4000-8000-000000000071','null'::jsonb
  );
  BEGIN
    INSERT INTO pathways.form_submissions(
      organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status
    ) VALUES (
      '72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061',1,'72000000-0000-4000-8000-000000000092','72000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT'
    );
    RAISE EXCEPTION 'Repeat submission identifier was not constrained';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE pathways.form_submissions
  SET status='VALIDATED',submitted_at=now(),validated_by_id='72000000-0000-4000-8000-000000000031',validated_at=now()
  WHERE id='72000000-0000-4000-8000-000000000082';
  UPDATE pathways.form_response_values SET value='99'::jsonb
  WHERE id='72000000-0000-4000-8000-000000000083';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Finalized response remained mutable'; END IF;

  IF NOT EXISTS (
    SELECT FROM pathways.form_submissions
    WHERE id='72000000-0000-4000-8000-000000000082'
      AND form_id='72000000-0000-4000-8000-000000000061' AND form_version=1
  ) THEN RAISE EXCEPTION 'Old submission lost its original version reference'; END IF;

  BEGIN
    INSERT INTO pathways.form_submissions(
      id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,source,status
    ) VALUES (
      '72000000-0000-4000-8000-000000000084','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000041','72000000-0000-4000-8000-000000000061',1,'72000000-0000-4000-8000-000000000094','72000000-0000-4000-8000-000000000031','DIRECT_ENCODING','DRAFT'
    );
    INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id)
    VALUES ('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000032','72000000-0000-4000-8000-000000000041','P02_ROLLBACK','FormSubmission','72000000-0000-4000-8000-000000000084');
    RAISE EXCEPTION 'Audit identity mismatch was not rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT FROM pathways.form_submissions WHERE id='72000000-0000-4000-8000-000000000084') THEN
    RAISE EXCEPTION 'Business write was not rolled back with failed audit';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
