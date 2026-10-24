-- cr-pathways-plug-and-play-import phase 2: the reviewer's date order per mapped column and the chosen workbook sheet.
-- Additive only. metadata_mappings gains date_order (YMD, DMY or MDY; null means the column is read without one), which
-- p03_guard_mapping already freezes with the rest of the insert-only revision. data_import_batches gains source_sheet_name
-- (the worksheet a multi-sheet workbook was read from; null for CSV, PDF and one-sheet workbooks), set when the upload is
-- reserved and frozen by p03_guard_import_batch like the other source columns. The guard keeps its baseline body with
-- that one added comparison; owner, search_path, trigger and grants are unchanged. No table grant, policy, permission or
-- ledger row changes; the table-level runtime grants already cover the new columns.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0078_form_field_intake_metadata' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p03_guard_import_batch()')
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
  AND p.prosrc LIKE '%Import source headers are immutable after finalization%' AND p.prosrc NOT LIKE '%source_sheet_name%')
 OR EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE NOT a.attisdropped AND (
   (a.attrelid='pathways.metadata_mappings'::regclass AND a.attname='date_order')
   OR (a.attrelid='pathways.data_import_batches'::regclass AND a.attname='source_sheet_name')))
 THEN RAISE EXCEPTION '0079 requires the verified 0078 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,79);

ALTER TABLE pathways.metadata_mappings
  ADD COLUMN date_order text,
  ADD CONSTRAINT metadata_mappings_date_order_known CHECK(date_order IS NULL OR date_order IN('YMD','DMY','MDY'));

-- A sheet name is 1-100 characters with a visible one and no control characters.
ALTER TABLE pathways.data_import_batches
  ADD COLUMN source_sheet_name text,
  ADD CONSTRAINT data_import_batches_source_sheet_name_shape CHECK(source_sheet_name IS NULL OR (
    char_length(source_sheet_name) BETWEEN 1 AND 100 AND source_sheet_name ~ '[^[:space:]]'
    AND source_sheet_name !~ '[[:cntrl:]]'));

-- The baseline body of p03_guard_import_batch with source_sheet_name frozen after the reservation.
CREATE OR REPLACE FUNCTION pathways.p03_guard_import_batch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'UPLOADING' OR NEW.storage_status <> 'RESERVED'
       OR NEW.uploaded_by_id IS DISTINCT FROM pathways.runtime_context_user()
       OR NEW.mapping_revision <> 0 OR NEW.validation_revision <> 0
       OR NEW.processing_revision <> 0 OR NEW.total_rows <> 0 THEN
      RAISE EXCEPTION 'Import batches must start as server-owned upload reservations';
    END IF;
    IF NEW.storage_object_key <> 'organizations/' || NEW.organization_id::text
      || '/projects/' || NEW.project_id::text || '/imports/' || NEW.id::text
      || '/' || NEW.source_checksum || '.' || lower(NEW.file_type::text) THEN
      RAISE EXCEPTION 'Import object key is not server-scoped';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.form_version IS DISTINCT FROM OLD.form_version
     OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum
     OR NEW.client_import_id IS DISTINCT FROM OLD.client_import_id
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_object_key IS DISTINCT FROM OLD.storage_object_key
     OR NEW.original_file_name IS DISTINCT FROM OLD.original_file_name
     OR NEW.source_sheet_name IS DISTINCT FROM OLD.source_sheet_name -- 0079
     OR NEW.file_type IS DISTINCT FROM OLD.file_type
     OR NEW.uploaded_by_id IS DISTINCT FROM OLD.uploaded_by_id
     OR NEW.mapping_revision < OLD.mapping_revision
     OR NEW.mapping_revision > OLD.mapping_revision + 1
     OR NEW.validation_revision < OLD.validation_revision
     OR NEW.processing_revision < OLD.processing_revision THEN
    RAISE EXCEPTION 'Import identity, scope, source, or revisions are immutable';
  END IF;
  IF OLD.source_headers <> '[]'::jsonb AND NEW.source_headers IS DISTINCT FROM OLD.source_headers THEN
    RAISE EXCEPTION 'Import source headers are immutable after finalization';
  END IF;
  IF NEW.validated_mapping_revision IS NOT NULL
     AND NEW.validated_mapping_revision <> NEW.mapping_revision THEN
    RAISE EXCEPTION 'Validated mapping revision must be current';
  END IF;
  RETURN NEW;
END
$$;

DO $$ BEGIN
 IF pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p
   WHERE p.oid=pg_catalog.to_regprocedure('pathways.p03_guard_import_batch()')))<>'prisma'
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgname='p03_guard_import_batch' AND tgenabled='O'
   AND tgrelid='pathways.data_import_batches'::regclass)
 THEN RAISE EXCEPTION '0079 left the import batch guard in an unexpected state'; END IF;
END $$;
COMMIT;
