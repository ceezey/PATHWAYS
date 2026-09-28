-- Disposable PostgreSQL checks for 0036_import_pdf_file_type. Synthetic rows only.
-- Run as postgres inside the local container against a replayed, disposable database
-- named pathways_phase2_*. Part 1 commits synthetic fixtures into that disposable
-- database; part 2 reconnects as pathways_runtime over loopback and rolls back.
-- Drop the database afterwards.
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() NOT LIKE 'pathways\_phase2\_%'
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION '0036 checks require a disposable pathways_phase2_* database';
  END IF;
END
$$;

SELECT set_config('pathways_test.p36_passed','0',true);

-- Catalog: the ledger row, the six labels in order, and no other enum change.
DO $$
DECLARE labels text[];
BEGIN
  IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0036_import_pdf_file_type'
    AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION '0036 ledger row missing';
  END IF;
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO labels
  FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='import_file_type';
  IF labels IS DISTINCT FROM ARRAY['CSV','XLSX','XLS','JSON','OTHER','PDF'] THEN
    RAISE EXCEPTION 'Unexpected import_file_type labels: %', labels;
  END IF;
  IF (SELECT t.typowner::regrole::text FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='pathways' AND t.typname='import_file_type') <> 'prisma' THEN
    RAISE EXCEPTION 'import_file_type ownership changed';
  END IF;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+2)::text,true);
END
$$;

-- Guard rerun: the predecessor assertion and ADD VALUE IF NOT EXISTS stay idempotent.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='pathways' AND t.typname='import_file_type' AND e.enumlabel='PDF') <> 1 THEN
    RAISE EXCEPTION 'PDF label is not unique';
  END IF;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+1)::text,true);
END
$$;

SELECT 'IMPORT_PDF_FILE_TYPE_CATALOG_ASSERTIONS_PASSED=' || current_setting('pathways_test.p36_passed') AS result;
DO $$ BEGIN
  IF current_setting('pathways_test.p36_passed')::integer <> 3 THEN
    RAISE EXCEPTION 'Expected 3 catalog assertions';
  END IF;
END $$;

-- Fixture projects are created directly, so the F10 source-proof trigger is disabled
-- for the fixture inserts only and re-enabled before commit. Batch writes in part 2
-- run as pathways_runtime under the unchanged import guards.
SET LOCAL ROLE prisma;
ALTER TABLE pathways.projects DISABLE TRIGGER f10_prove_project_source;
RESET ROLE;

INSERT INTO auth.users(id) VALUES
  ('73600000-0000-4000-8000-000000000011'),
  ('73600000-0000-4000-8000-000000000012'),
  ('73600000-0000-4000-8000-000000000013');
INSERT INTO pathways.organizations(id,code,name) VALUES
  ('73600000-0000-4000-8000-000000000001','P36_A','Synthetic 0036 organization A'),
  ('73600000-0000-4000-8000-000000000002','P36_B','Synthetic 0036 organization B');
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at
) VALUES
  ('73600000-0000-4000-8000-000000000031','73600000-0000-4000-8000-000000000001',(SELECT id FROM pathways.roles WHERE code='MONITORING_AND_EVALUATION_OFFICER'),'73600000-0000-4000-8000-000000000011','Synthetic 0036 uploader','p36-a@example.invalid','ACTIVE',now(),now()),
  ('73600000-0000-4000-8000-000000000032','73600000-0000-4000-8000-000000000002',(SELECT id FROM pathways.roles WHERE code='MONITORING_AND_EVALUATION_OFFICER'),'73600000-0000-4000-8000-000000000012','Synthetic 0036 foreign','p36-b@example.invalid','ACTIVE',now(),now()),
  ('73600000-0000-4000-8000-000000000033','73600000-0000-4000-8000-000000000001',(SELECT id FROM pathways.roles WHERE code='MONITORING_AND_EVALUATION_OFFICER'),'73600000-0000-4000-8000-000000000013','Synthetic 0036 author','p36-author@example.invalid','ACTIVE',now(),now());
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
  ('73600000-0000-4000-8000-000000000041','73600000-0000-4000-8000-000000000001','P36_A_1','Synthetic 0036 project A','73600000-0000-4000-8000-000000000031'),
  ('73600000-0000-4000-8000-000000000042','73600000-0000-4000-8000-000000000002','P36_B_1','Synthetic 0036 project B','73600000-0000-4000-8000-000000000032');
INSERT INTO pathways.digital_forms(
  id,organization_id,project_id,code,version,name,form_type,status,created_by_id
) VALUES (
  '73600000-0000-4000-8000-000000000051','73600000-0000-4000-8000-000000000001',
  '73600000-0000-4000-8000-000000000041','pdf_generic',1,'Synthetic PDF import','OTHER','DRAFT',
  '73600000-0000-4000-8000-000000000033'
);
INSERT INTO pathways.form_fields(
  id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no
) VALUES (
  '73600000-0000-4000-8000-000000000061','73600000-0000-4000-8000-000000000001',
  '73600000-0000-4000-8000-000000000041','73600000-0000-4000-8000-000000000051',
  'note','Note','TEXT',false,1
);
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES
  ('73600000-0000-4000-8000-000000000001','73600000-0000-4000-8000-000000000041','73600000-0000-4000-8000-000000000031','73600000-0000-4000-8000-000000000033');
UPDATE pathways.digital_forms SET status='PUBLISHED',
  published_by_id='73600000-0000-4000-8000-000000000031',published_at=now()
WHERE id='73600000-0000-4000-8000-000000000051';
SET LOCAL ROLE prisma;
ALTER TABLE pathways.projects ENABLE TRIGGER f10_prove_project_source;
RESET ROLE;
COMMIT;

\connect - pathways_runtime 127.0.0.1
BEGIN;
DO $$
BEGIN
  IF current_database() NOT LIKE 'pathways\_phase2\_%' OR session_user <> 'pathways_runtime' THEN
    RAISE EXCEPTION 'Runtime checks require the disposable database and runtime login';
  END IF;
END
$$;
SELECT set_config('pathways_test.p36_passed','0',true);
SELECT set_config('request.jwt.claim.sub','73600000-0000-4000-8000-000000000011',true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id','73600000-0000-4000-8000-000000000001',true),
  set_config('app.user_id','73600000-0000-4000-8000-000000000031',true);

-- Happy: the runtime role reserves a PDF batch under the server-derived .pdf object key.
INSERT INTO pathways.data_import_batches(
  id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
  file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
) VALUES (
  '73600000-0000-4000-8000-000000000070','73600000-0000-4000-8000-000000000001',
  '73600000-0000-4000-8000-000000000041','73600000-0000-4000-8000-000000000051',1,
  'MANUAL_UPLOAD','register.pdf','PDF',repeat('a',64),'73600000-0000-4000-8000-000000000080',
  'uploads','organizations/73600000-0000-4000-8000-000000000001/projects/73600000-0000-4000-8000-000000000041/imports/73600000-0000-4000-8000-000000000070/' || repeat('a',64) || '.pdf',
  '73600000-0000-4000-8000-000000000031'
);
UPDATE pathways.data_import_batches SET storage_status='STORED',status='UPLOADED',
  source_headers='[{"key":"column_0001","header":"note","columnIndex":1}]',total_rows=1
WHERE id='73600000-0000-4000-8000-000000000070';

DO $$
BEGIN
  IF (SELECT file_type::text FROM pathways.data_import_batches
      WHERE id='73600000-0000-4000-8000-000000000070') <> 'PDF' THEN
    RAISE EXCEPTION 'PDF batch was not stored';
  END IF;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+1)::text,true);

  -- Sad: the storage guard still binds the object extension to lower(file_type).
  BEGIN
    INSERT INTO pathways.data_import_batches(
      id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
      file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
    ) VALUES (
      '73600000-0000-4000-8000-000000000071','73600000-0000-4000-8000-000000000001',
      '73600000-0000-4000-8000-000000000041','73600000-0000-4000-8000-000000000051',1,
      'MANUAL_UPLOAD','register.pdf','PDF',repeat('b',64),'73600000-0000-4000-8000-000000000081',
      'uploads','organizations/73600000-0000-4000-8000-000000000001/projects/73600000-0000-4000-8000-000000000041/imports/73600000-0000-4000-8000-000000000071/' || repeat('b',64) || '.csv',
      '73600000-0000-4000-8000-000000000031'
    );
    RAISE EXCEPTION 'PDF batch with a .csv object key was accepted';
  EXCEPTION WHEN raise_exception OR check_violation OR insufficient_privilege THEN
    IF SQLERRM='PDF batch with a .csv object key was accepted' THEN RAISE; END IF;
  END;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+1)::text,true);

  -- Abuse: a PDF reservation cannot target another organization's project.
  BEGIN
    INSERT INTO pathways.data_import_batches(
      id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
      file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id
    ) VALUES (
      '73600000-0000-4000-8000-000000000072','73600000-0000-4000-8000-000000000002',
      '73600000-0000-4000-8000-000000000042','73600000-0000-4000-8000-000000000051',1,
      'MANUAL_UPLOAD','foreign.pdf','PDF',repeat('c',64),'73600000-0000-4000-8000-000000000082',
      'uploads','organizations/73600000-0000-4000-8000-000000000002/projects/73600000-0000-4000-8000-000000000042/imports/73600000-0000-4000-8000-000000000072/' || repeat('c',64) || '.pdf',
      '73600000-0000-4000-8000-000000000032'
    );
    RAISE EXCEPTION 'Cross-organization PDF reservation was accepted';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR raise_exception THEN
    IF SQLERRM='Cross-organization PDF reservation was accepted' THEN RAISE; END IF;
  END;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+1)::text,true);

  -- The file type of a stored batch stays immutable.
  BEGIN
    UPDATE pathways.data_import_batches SET file_type='CSV'
    WHERE id='73600000-0000-4000-8000-000000000070';
    RAISE EXCEPTION 'Stored PDF batch file type changed';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM='Stored PDF batch file type changed' THEN RAISE; END IF;
  END;
  PERFORM set_config('pathways_test.p36_passed',(current_setting('pathways_test.p36_passed')::integer+1)::text,true);
END
$$;

SELECT 'IMPORT_PDF_FILE_TYPE_RUNTIME_ASSERTIONS_PASSED=' || current_setting('pathways_test.p36_passed') AS result;
DO $$
BEGIN
  IF current_setting('pathways_test.p36_passed')::integer <> 4 THEN
    RAISE EXCEPTION 'Expected 4 runtime assertions';
  END IF;
END
$$;

ROLLBACK;
