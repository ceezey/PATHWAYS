-- cr-pathways-plug-and-play-import (0079): disposable checks for metadata_mappings.date_order,
-- data_import_batches.source_sheet_name and the batch guard that freezes the sheet. Synthetic fixtures only;
-- everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or phase4/phase6 replay
-- database that already has 0079 applied. Success prints IMPORT_DATE_ORDER_RUNTIME=PASS.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'Import date order checks require a disposable local database'; END IF;
END $$;

-- The guard keeps prisma ownership, invoker rights, an empty search_path and its enabled trigger.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p03_guard_import_batch()'::regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef
   AND p.proconfig=ARRAY['search_path=""']
   AND p.prosrc LIKE '%NEW.source_sheet_name IS DISTINCT FROM OLD.source_sheet_name%')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgname='p03_guard_import_batch' AND tgenabled='O'
   AND tgrelid='pathways.data_import_batches'::regclass)
 THEN RAISE EXCEPTION 'import batch guard state differs'; END IF;
END $$;

-- Fixtures skip triggers and foreign keys only while they are written; the checks below run with both.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,original_file_name,
 uploaded_by_id,source_checksum,storage_bucket,storage_object_key,file_type,status,storage_status,source_sheet_name)
VALUES ('79900000-0000-4000-8000-000000000001','79900000-0000-4000-8000-000000000002',
 '79900000-0000-4000-8000-000000000003','79900000-0000-4000-8000-000000000004',1,'people.xlsx',
 '79900000-0000-4000-8000-000000000005',repeat('a',64),'uploads','private','XLSX','UPLOADED','STORED','Two');
INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,source_field_name,
 target_field_id,status,revision,date_order)
VALUES ('79900000-0000-4000-8000-000000000002','79900000-0000-4000-8000-000000000003',
 '79900000-0000-4000-8000-000000000004','79900000-0000-4000-8000-000000000001','column_0001',
 '79900000-0000-4000-8000-000000000006','MAPPED',1,'YMD');
SET LOCAL session_replication_role = origin;

-- Each statement must fail with the expected SQLSTATE; a pass is counted in the setting dateorder.passed.
CREATE FUNCTION pg_temp.refused(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM expected THEN RAISE EXCEPTION '% gave % not %', statement, got, expected; END IF;
 PERFORM set_config('dateorder.passed',(coalesce(nullif(current_setting('dateorder.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- The chosen sheet is frozen once the reservation exists.
SELECT pg_temp.refused($$UPDATE pathways.data_import_batches SET source_sheet_name='One'
 WHERE id='79900000-0000-4000-8000-000000000001'$$,'P0001');
SELECT pg_temp.refused($$UPDATE pathways.data_import_batches SET source_sheet_name=NULL
 WHERE id='79900000-0000-4000-8000-000000000001'$$,'P0001');
-- Constraint cases run with triggers paused, so the insert guards cannot answer first.
SET LOCAL session_replication_role = replica;
-- Sheet names are 1-100 visible characters without control characters.
SELECT pg_temp.refused($$INSERT INTO pathways.data_import_batches(organization_id,project_id,form_id,form_version,
 original_file_name,uploaded_by_id,source_checksum,storage_bucket,storage_object_key,source_sheet_name)
 VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'a.xlsx',gen_random_uuid(),repeat('b',64),'u','k','   ')$$,'23514');
SELECT pg_temp.refused($$INSERT INTO pathways.data_import_batches(organization_id,project_id,form_id,form_version,
 original_file_name,uploaded_by_id,source_checksum,storage_bucket,storage_object_key,source_sheet_name)
 VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'a.xlsx',gen_random_uuid(),repeat('b',64),'u','k',
 'Sheet'||chr(9))$$,'23514');
SELECT pg_temp.refused($$INSERT INTO pathways.data_import_batches(organization_id,project_id,form_id,form_version,
 original_file_name,uploaded_by_id,source_checksum,storage_bucket,storage_object_key,source_sheet_name)
 VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'a.xlsx',gen_random_uuid(),repeat('b',64),'u','k',
 repeat('s',101))$$,'23514');
-- A date order is one of three and only on a mapped column; stored mapping rows stay immutable.
SELECT pg_temp.refused($$INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,
 source_field_name,target_field_id,status,revision,date_order) VALUES (gen_random_uuid(),gen_random_uuid(),
 gen_random_uuid(),gen_random_uuid(),'column_0002',gen_random_uuid(),'MAPPED',1,'YDM')$$,'23514');
SELECT pg_temp.refused($$INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,
 source_field_name,status,revision,date_order) VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
 gen_random_uuid(),'column_0003','IGNORED',1,'DMY')$$,'23514');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.refused($$UPDATE pathways.metadata_mappings SET date_order='DMY'
 WHERE import_batch_id='79900000-0000-4000-8000-000000000001'$$,'P0001');

SELECT 'IMPORT_DATE_ORDER_ASSERTIONS_PASSED=' || current_setting('dateorder.passed') AS result;
DO $$ BEGIN IF current_setting('dateorder.passed')::integer<>8 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
SELECT 'IMPORT_DATE_ORDER_RUNTIME=PASS' AS result;
ROLLBACK;
