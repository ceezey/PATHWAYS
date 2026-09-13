-- Disposable PostgreSQL behavioral checks for P03. Synthetic rows only; rollback at end.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port() <> 55448 OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'P03 checks require the guarded disposable replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('73000000-0000-4000-8000-000000000011'),
  ('73000000-0000-4000-8000-000000000012'),
  ('73000000-0000-4000-8000-000000000013');
INSERT INTO pathways.organizations(id,code,name) VALUES
  ('73000000-0000-4000-8000-000000000001','P03_A','Synthetic P03 organization A'),
  ('73000000-0000-4000-8000-000000000002','P03_B','Synthetic P03 organization B');
INSERT INTO pathways.roles(id,code,name) VALUES
  ('73000000-0000-4000-8000-000000000021','P03_REVIEWER','Synthetic P03 reviewer');
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at
) VALUES
  ('73000000-0000-4000-8000-000000000031','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000011','Synthetic P03 reviewer','p03-a@example.invalid','ACTIVE',now(),now()),
  ('73000000-0000-4000-8000-000000000032','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000012','Synthetic P03 foreign','p03-b@example.invalid','ACTIVE',now(),now()),
  ('73000000-0000-4000-8000-000000000033','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000013','Synthetic P03 author','p03-author@example.invalid','ACTIVE',now(),now());
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
  ('73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000001','P03_A_1','Synthetic P03 project A','73000000-0000-4000-8000-000000000031'),
  ('73000000-0000-4000-8000-000000000042','73000000-0000-4000-8000-000000000002','P03_B_1','Synthetic P03 project B','73000000-0000-4000-8000-000000000032');
INSERT INTO pathways.digital_forms(
  id,organization_id,project_id,code,version,name,form_type,status,created_by_id
) VALUES (
  '73000000-0000-4000-8000-000000000051','73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000041','generic',1,'Synthetic generic import','OTHER','DRAFT',
  '73000000-0000-4000-8000-000000000033'
);
INSERT INTO pathways.form_fields(
  id,organization_id,project_id,form_id,code,label,data_type,is_required,is_metadata_key,
  minimum_value,maximum_value,sequence_no
) VALUES (
  '73000000-0000-4000-8000-000000000061','73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051',
  'score','Score','DECIMAL',true,true,0,10,1
);
UPDATE pathways.digital_forms SET status='PUBLISHED',
  published_by_id='73000000-0000-4000-8000-000000000031',published_at=now()
WHERE id='73000000-0000-4000-8000-000000000051';

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000011',true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id','73000000-0000-4000-8000-000000000001',true),
  set_config('app.user_id','73000000-0000-4000-8000-000000000031',true);

DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.data_import_batches(
      id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
      file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
    ) VALUES (
      '73000000-0000-4000-8000-000000000070','73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051',1,
      'MANUAL_UPLOAD','unsafe.csv','CSV',repeat('a',64),'73000000-0000-4000-8000-000000000080',
      'uploads','client/controlled.csv','73000000-0000-4000-8000-000000000031'
    );
    RAISE EXCEPTION 'Client-controlled object key was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Client-controlled object key was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO pathways.data_import_batches(
      id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
      file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
    ) VALUES (
      '73000000-0000-4000-8000-000000000071','73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000042','73000000-0000-4000-8000-000000000051',1,
      'MANUAL_UPLOAD','foreign.csv','CSV',repeat('b',64),'73000000-0000-4000-8000-000000000081',
      'uploads','foreign','73000000-0000-4000-8000-000000000032'
    );
    RAISE EXCEPTION 'Cross-organization upload reservation was accepted';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR raise_exception THEN
    IF SQLERRM='Cross-organization upload reservation was accepted' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO pathways.data_import_batches(
  id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
  file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
) VALUES (
  '73000000-0000-4000-8000-000000000072','73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051',1,
  'MANUAL_UPLOAD','mixed.csv','CSV',repeat('c',64),'73000000-0000-4000-8000-000000000082',
  'uploads','organizations/73000000-0000-4000-8000-000000000001/projects/73000000-0000-4000-8000-000000000041/imports/73000000-0000-4000-8000-000000000072/' || repeat('c',64) || '.csv',
  '73000000-0000-4000-8000-000000000031'
);
UPDATE pathways.data_import_batches SET storage_status='STORED',status='UPLOADED',
  source_headers='["score"]',total_rows=2 WHERE id='73000000-0000-4000-8000-000000000072';
INSERT INTO pathways.data_import_rows(
  id,organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data
) VALUES
  ('73000000-0000-4000-8000-000000000073','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051','73000000-0000-4000-8000-000000000072',2,repeat('d',64),'{"score":"2.5"}'),
  ('73000000-0000-4000-8000-000000000074','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051','73000000-0000-4000-8000-000000000072',3,repeat('e',64),'{"score":"not-a-number"}');
INSERT INTO pathways.metadata_mappings(
  organization_id,project_id,form_id,import_batch_id,revision,source_field_name,target_field_id,status
) VALUES (
  '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000041',
  '73000000-0000-4000-8000-000000000051','73000000-0000-4000-8000-000000000072',1,
  'score','73000000-0000-4000-8000-000000000061','MAPPED'
);
UPDATE pathways.data_import_batches SET status='MAPPED',mapping_revision=1
WHERE id='73000000-0000-4000-8000-000000000072';
UPDATE pathways.data_import_rows SET mapping_revision=1
WHERE import_batch_id='73000000-0000-4000-8000-000000000072';

DO $$
BEGIN
  BEGIN
    UPDATE pathways.metadata_mappings SET source_field_name='changed'
    WHERE import_batch_id='73000000-0000-4000-8000-000000000072';
    RAISE EXCEPTION 'Reviewed mapping mutation was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Reviewed mapping mutation was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE pathways.data_import_rows SET raw_data='{"score":"9"}'
    WHERE id='73000000-0000-4000-8000-000000000073';
    RAISE EXCEPTION 'Raw row mutation was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Raw row mutation was accepted' THEN RAISE; END IF;
  END;
END
$$;

UPDATE pathways.data_import_rows AS r
SET status=v.status::pathways.import_row_status,
  normalized_data=v.normalized_data,
  validation_errors=v.validation_errors,
  mapping_revision=1,
  validation_revision=1,
  validated_by_id='73000000-0000-4000-8000-000000000031',
  validated_at=now()
FROM jsonb_to_recordset($rows$[
  {"id":"73000000-0000-4000-8000-000000000073","status":"VALID","normalized_data":{"score":"2.5"},"validation_errors":[]},
  {"id":"73000000-0000-4000-8000-000000000074","status":"INVALID","normalized_data":null,"validation_errors":[{"fieldCode":"score","code":"AMBIGUOUS_DECIMAL","message":"Expected a decimal."}]}
]$rows$::jsonb) AS v(id uuid,status text,normalized_data jsonb,validation_errors jsonb)
WHERE r.id=v.id AND r.organization_id='73000000-0000-4000-8000-000000000001'
  AND r.import_batch_id='73000000-0000-4000-8000-000000000072';
UPDATE pathways.data_import_batches SET status='VALIDATED',validation_revision=1,
  validated_mapping_revision=1,reviewed_by_id='73000000-0000-4000-8000-000000000031',
  valid_rows=1,invalid_rows=1,validated_at=now()
WHERE id='73000000-0000-4000-8000-000000000072';

UPDATE pathways.data_import_batches SET status='PROCESSING',processing_revision=1,
  processing_claim_id='73000000-0000-4000-8000-000000000090',processing_claimed_at=now()
WHERE id='73000000-0000-4000-8000-000000000072';
UPDATE pathways.data_import_rows SET status='PROCESSING',processing_attempts=1,
  processing_claim_id='73000000-0000-4000-8000-000000000090',processing_claimed_at=now()
WHERE id='73000000-0000-4000-8000-000000000073';

DO $$
BEGIN
  BEGIN
    INSERT INTO pathways.form_submissions(
      id,organization_id,project_id,form_id,form_version,client_submission_id,import_batch_id,
      import_row_id,submitted_by_id,source,status
    ) VALUES (
      '73000000-0000-4000-8000-000000000092','73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051',1,
      '73000000-0000-4000-8000-000000000073','73000000-0000-4000-8000-000000000072',
      '73000000-0000-4000-8000-000000000073','73000000-0000-4000-8000-000000000031',
      'IMPORTED_DATASET','DRAFT'
    );
    INSERT INTO pathways.audit_logs(
      id,organization_id,actor_user_id,project_id,action,entity_type,entity_id
    ) VALUES (
      '73000000-0000-4000-8000-000000000093','73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000031','73000000-0000-4000-8000-000000000041',
      'SYNTHETIC_FAILED_PROMOTION','FormSubmission','73000000-0000-4000-8000-000000000092'
    );
    RAISE EXCEPTION 'synthetic promotion failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic promotion failure' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT FROM pathways.form_submissions
            WHERE id='73000000-0000-4000-8000-000000000092')
     OR EXISTS(SELECT FROM pathways.audit_logs
               WHERE id='73000000-0000-4000-8000-000000000093') THEN
    RAISE EXCEPTION 'Failed promotion did not roll back submission and audit atomically';
  END IF;
END
$$;

INSERT INTO pathways.form_submissions(
  id,organization_id,project_id,form_id,form_version,client_submission_id,import_batch_id,
  import_row_id,submitted_by_id,source,status
) VALUES (
  '73000000-0000-4000-8000-000000000091','73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000041','73000000-0000-4000-8000-000000000051',1,
  '73000000-0000-4000-8000-000000000073','73000000-0000-4000-8000-000000000072',
  '73000000-0000-4000-8000-000000000073','73000000-0000-4000-8000-000000000031',
  'IMPORTED_DATASET','DRAFT'
);
INSERT INTO pathways.form_response_values(
  organization_id,project_id,form_id,submission_id,field_id,value
) VALUES (
  '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000041',
  '73000000-0000-4000-8000-000000000051','73000000-0000-4000-8000-000000000091',
  '73000000-0000-4000-8000-000000000061','"2.5"'
);
UPDATE pathways.form_submissions SET status='VALIDATED',submitted_at=now(),
  validated_by_id='73000000-0000-4000-8000-000000000031',validated_at=now()
WHERE id='73000000-0000-4000-8000-000000000091';
UPDATE pathways.data_import_rows SET status='PROCESSED',processed_at=now(),
  processing_claim_id=NULL,processing_claimed_at=NULL
WHERE id='73000000-0000-4000-8000-000000000073';
UPDATE pathways.data_import_batches SET status='PARTIALLY_PROCESSED',processed_rows=1,
  processing_claim_id=NULL,processing_claimed_at=NULL,processed_at=now()
WHERE id='73000000-0000-4000-8000-000000000072';

DO $$
BEGIN
  IF (SELECT count(*) FROM pathways.form_submissions
      WHERE import_row_id='73000000-0000-4000-8000-000000000073') <> 1 THEN
    RAISE EXCEPTION 'Valid generic row did not create exactly one submission';
  END IF;
  IF EXISTS(SELECT FROM pathways.form_submissions
            WHERE import_row_id='73000000-0000-4000-8000-000000000074') THEN
    RAISE EXCEPTION 'Invalid row created an operational submission';
  END IF;
  BEGIN
    INSERT INTO pathways.form_submissions(
      organization_id,project_id,form_id,form_version,client_submission_id,import_batch_id,
      import_row_id,submitted_by_id,source,status
    ) SELECT organization_id,project_id,form_id,form_version,gen_random_uuid(),import_batch_id,
      import_row_id,submitted_by_id,source,'DRAFT'
      FROM pathways.form_submissions WHERE id='73000000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'Duplicate imported submission was accepted';
  EXCEPTION WHEN unique_violation OR raise_exception THEN
    IF SQLERRM='Duplicate imported submission was accepted' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
