-- Synthetic pre-P03 import evidence used only by the guarded disposable replay.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'pathways_phase4_phase6_replay'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR inet_server_port() <> 55448 OR current_user <> 'postgres'
     OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0009_import_state_enums') THEN
    RAISE EXCEPTION 'P03 upgrade fixture requires the guarded post-0008/pre-0009 replay target';
  END IF;
END
$$;

INSERT INTO auth.users(id) VALUES
  ('74000000-0000-4000-8000-000000000011'),
  ('74000000-0000-4000-8000-000000000012');
INSERT INTO pathways.organizations(id,code,name) VALUES
  ('74000000-0000-4000-8000-000000000001','P03_UPGRADE','Synthetic P03 upgrade organization');
INSERT INTO pathways.roles(id,code,name) VALUES
  ('74000000-0000-4000-8000-000000000021','P03_UPGRADE_ROLE','Synthetic P03 upgrade role');
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at
) VALUES
  ('74000000-0000-4000-8000-000000000031','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000011','Synthetic upgrade uploader','upgrade-uploader@example.invalid','ACTIVE',now(),now()),
  ('74000000-0000-4000-8000-000000000032','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000012','Synthetic upgrade reviewer','upgrade-reviewer@example.invalid','ACTIVE',now(),now());
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES (
  '74000000-0000-4000-8000-000000000041','74000000-0000-4000-8000-000000000001',
  'P03_UPGRADE','Synthetic P03 upgrade project','74000000-0000-4000-8000-000000000031'
);
INSERT INTO pathways.digital_forms(
  id,organization_id,project_id,code,version,name,form_type,status,created_by_id
) VALUES (
  '74000000-0000-4000-8000-000000000051','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000041','legacy_import',1,'Synthetic legacy import',
  'OTHER','DRAFT','74000000-0000-4000-8000-000000000031'
);
INSERT INTO pathways.form_fields(
  id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no
) VALUES (
  '74000000-0000-4000-8000-000000000061','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000041','74000000-0000-4000-8000-000000000051',
  'score','Score','INTEGER',false,1
);
UPDATE pathways.digital_forms SET status='PUBLISHED',
  published_by_id='74000000-0000-4000-8000-000000000032',published_at=now()
WHERE id='74000000-0000-4000-8000-000000000051';

INSERT INTO pathways.data_import_batches(
  id,organization_id,project_id,form_id,source_system,original_file_name,file_type,
  uploaded_by_id,status
) VALUES (
  '74000000-0000-4000-8000-000000000071','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000041','74000000-0000-4000-8000-000000000051',
  'SPREADSHEET','legacy.csv','CSV','74000000-0000-4000-8000-000000000031','UPLOADED'
);
INSERT INTO pathways.data_import_rows(
  id,organization_id,project_id,form_id,import_batch_id,row_number,raw_data,status
) VALUES (
  '74000000-0000-4000-8000-000000000072','74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000041','74000000-0000-4000-8000-000000000051',
  '74000000-0000-4000-8000-000000000071',1,'{"Score":"0"}','PENDING'
);
INSERT INTO pathways.metadata_mappings(
  organization_id,project_id,form_id,import_batch_id,source_field_name,target_field_id,status
) VALUES (
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000041',
  '74000000-0000-4000-8000-000000000051','74000000-0000-4000-8000-000000000071',
  'Score','74000000-0000-4000-8000-000000000061','MAPPED'
);
