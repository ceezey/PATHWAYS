-- P03 secure upload -> map -> validate -> review -> process contract.
-- Append-only migration. Existing migration history is not rewritten.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' OR session_user <> 'prisma' THEN
    RAISE EXCEPTION '0010 must run as the prisma migration role';
  END IF;
  IF to_regclass('pathways.data_import_batches') IS NULL
     OR to_regclass('pathways.data_import_rows') IS NULL
     OR to_regclass('pathways.metadata_mappings') IS NULL THEN
    RAISE EXCEPTION 'P03 import foundation is missing';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'pathways_runtime must remain NOBYPASSRLS';
  END IF;
END
$preflight$;

CREATE TYPE pathways.import_storage_status AS ENUM (
  'RESERVED','STORED','RECOVERY_REQUIRED','FAILED'
);
REVOKE ALL ON TYPE pathways.import_storage_status
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT USAGE ON TYPE pathways.import_storage_status TO pathways_runtime;

-- Retire the pre-P03 workflow triggers before backfilling existing rows. Their
-- deferred events otherwise prevent the following ALTER TABLE operations, and
-- their old state machine cannot represent P03 claims/revisions.
DROP TRIGGER IF EXISTS p2_batch ON pathways.data_import_batches;
DROP TRIGGER IF EXISTS p2_import_row ON pathways.data_import_rows;
DROP TRIGGER IF EXISTS p2_mapping ON pathways.metadata_mappings;
DROP TRIGGER IF EXISTS p2_row_complete ON pathways.data_import_rows;
DROP TRIGGER IF EXISTS p2_batch_complete ON pathways.data_import_batches;
DROP TRIGGER IF EXISTS p2_batch_rows_complete ON pathways.data_import_rows;

ALTER TABLE pathways.data_import_batches
  ADD COLUMN form_version integer,
  ADD COLUMN source_checksum char(64),
  ADD COLUMN client_import_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN storage_bucket text,
  ADD COLUMN storage_object_key text,
  ADD COLUMN storage_status pathways.import_storage_status NOT NULL DEFAULT 'RESERVED',
  ADD COLUMN source_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN reviewed_by_id uuid,
  ADD COLUMN mapping_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN validation_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN validated_mapping_revision integer,
  ADD COLUMN processing_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN processing_claim_id uuid,
  ADD COLUMN processing_claimed_at timestamptz(3),
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN total_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN valid_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN invalid_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN processed_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN unprocessed_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN failed_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN failure_code text;

UPDATE pathways.data_import_batches b
SET form_version=f.version,
    source_checksum=encode(digest(b.id::text,'sha256'),'hex'),
    storage_bucket='legacy-unavailable',
    storage_object_key='legacy/' || b.id::text,
    storage_status='FAILED',
    source_headers=COALESCE((
      SELECT jsonb_agg(m.source_field_name ORDER BY m.source_field_name)
      FROM pathways.metadata_mappings m WHERE m.import_batch_id=b.id
    ),'[]'::jsonb),
    total_rows=(SELECT count(*) FROM pathways.data_import_rows r WHERE r.import_batch_id=b.id),
    valid_rows=(SELECT count(*) FROM pathways.data_import_rows r
      WHERE r.import_batch_id=b.id AND r.status IN ('VALID','PROCESSED')),
    invalid_rows=(SELECT count(*) FROM pathways.data_import_rows r
      WHERE r.import_batch_id=b.id AND r.status='INVALID'),
    processed_rows=(SELECT count(*) FROM pathways.data_import_rows r
      WHERE r.import_batch_id=b.id AND r.status='PROCESSED'),
    failure_code=COALESCE(b.failure_code,'LEGACY_SOURCE_OBJECT_UNAVAILABLE')
FROM pathways.digital_forms f
WHERE f.organization_id=b.organization_id AND f.project_id=b.project_id AND f.id=b.form_id;

ALTER TABLE pathways.data_import_batches
  ALTER COLUMN form_version SET NOT NULL,
  ALTER COLUMN source_checksum SET NOT NULL,
  ALTER COLUMN client_import_id SET NOT NULL,
  ALTER COLUMN storage_bucket SET NOT NULL,
  ALTER COLUMN storage_object_key SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'UPLOADING',
  DROP CONSTRAINT data_import_batches_form_fk,
  ADD CONSTRAINT data_import_batches_form_fk
    FOREIGN KEY(organization_id,project_id,form_id,form_version)
    REFERENCES pathways.digital_forms(organization_id,project_id,id,version)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT data_import_batches_reviewed_by_fk
    FOREIGN KEY(organization_id,reviewed_by_id)
    REFERENCES pathways.system_users(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT data_import_batches_checksum_check
    CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT data_import_batches_revision_check
    CHECK (form_version > 0 AND mapping_revision >= 0 AND validation_revision >= 0
      AND processing_revision >= 0 AND processing_attempts BETWEEN 0 AND 3),
  ADD CONSTRAINT data_import_batches_count_check
    CHECK (total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0
      AND processed_rows >= 0 AND unprocessed_rows >= 0 AND failed_rows >= 0
      AND valid_rows + invalid_rows <= total_rows
      AND processed_rows + unprocessed_rows + failed_rows <= total_rows),
  ADD CONSTRAINT data_import_batches_review_check
    CHECK ((validated_mapping_revision IS NULL AND reviewed_by_id IS NULL)
      OR (validated_mapping_revision IS NOT NULL AND reviewed_by_id IS NOT NULL));

ALTER TABLE pathways.data_import_batches DROP CONSTRAINT import_batches_state;
ALTER TABLE pathways.data_import_batches ADD CONSTRAINT import_batches_state CHECK (
  (status='UPLOADING' AND storage_status='RESERVED' AND total_rows=0
    AND validated_at IS NULL AND processed_at IS NULL AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status IN ('UPLOADED','MAPPED')
    AND (storage_status='STORED' OR (storage_status='FAILED' AND storage_bucket='legacy-unavailable'
      AND storage_object_key LIKE 'legacy/%'))
    AND validated_at IS NULL AND processed_at IS NULL AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='VALIDATED'
    AND (storage_status='STORED' OR (storage_status='FAILED' AND storage_bucket='legacy-unavailable'
      AND storage_object_key LIKE 'legacy/%')) AND validated_at IS NOT NULL
    AND validated_at>=uploaded_at AND processed_at IS NULL AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='PROCESSING' AND storage_status='STORED' AND validated_at IS NOT NULL
    AND validated_at>=uploaded_at AND processed_at IS NULL AND processing_claim_id IS NOT NULL
    AND processing_claimed_at IS NOT NULL)
  OR (status='PARTIALLY_PROCESSED' AND storage_status='STORED' AND validated_at IS NOT NULL
    AND validated_at>=uploaded_at AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='PROCESSED'
    AND (storage_status='STORED' OR (storage_status='FAILED' AND storage_bucket='legacy-unavailable'
      AND storage_object_key LIKE 'legacy/%')) AND validated_at IS NOT NULL
    AND processed_at IS NOT NULL AND validated_at>=uploaded_at AND processed_at>=validated_at
    AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
  OR (status='RECOVERY_REQUIRED' AND storage_status='RECOVERY_REQUIRED'
    AND processed_at IS NULL AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
  OR (status='FAILED' AND storage_status IN ('STORED','FAILED') AND processed_at IS NULL
    AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
);

CREATE UNIQUE INDEX data_import_batches_client_key
  ON pathways.data_import_batches(organization_id,uploaded_by_id,client_import_id);
CREATE UNIQUE INDEX data_import_batches_storage_object_key
  ON pathways.data_import_batches(storage_bucket,storage_object_key);
CREATE INDEX data_import_batches_claim_idx
  ON pathways.data_import_batches(organization_id,project_id,status,processing_claimed_at);
CREATE INDEX data_import_batches_project_created_idx
  ON pathways.data_import_batches(organization_id,project_id,created_at DESC,id);
CREATE INDEX data_import_batches_form_version_idx
  ON pathways.data_import_batches(organization_id,project_id,form_id,form_version);
CREATE INDEX data_import_batches_reviewed_by_idx
  ON pathways.data_import_batches(organization_id,reviewed_by_id);

ALTER TABLE pathways.data_import_rows
  ADD COLUMN source_checksum char(64),
  ADD COLUMN normalized_data jsonb,
  ADD COLUMN mapping_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN validation_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN processing_claim_id uuid,
  ADD COLUMN processing_claimed_at timestamptz(3),
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN processing_error_code text;

UPDATE pathways.data_import_rows
SET source_checksum=encode(digest(import_batch_id::text || ':' || row_number::text || ':' || raw_data::text,'sha256'),'hex');

ALTER TABLE pathways.data_import_rows
  ALTER COLUMN source_checksum SET NOT NULL,
  ADD CONSTRAINT data_import_rows_checksum_check CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT data_import_rows_revision_check
    CHECK (mapping_revision >= 0 AND validation_revision >= 0 AND processing_attempts BETWEEN 0 AND 3),
  ADD CONSTRAINT data_import_rows_number_check CHECK (row_number >= 1);

ALTER TABLE pathways.data_import_rows DROP CONSTRAINT import_rows_state;
ALTER TABLE pathways.data_import_rows ADD CONSTRAINT import_rows_state CHECK (
  (status='PENDING' AND normalized_data IS NULL AND validated_by_id IS NULL
    AND validated_at IS NULL AND processed_at IS NULL
    AND jsonb_array_length(validation_errors)=0 AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='INVALID' AND normalized_data IS NULL AND validated_by_id IS NOT NULL
    AND validated_at IS NOT NULL AND processed_at IS NULL
    AND jsonb_array_length(validation_errors)>0 AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='VALID' AND (jsonb_typeof(normalized_data)='object'
      OR (normalized_data IS NULL AND validation_revision=0))
    AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
    AND jsonb_array_length(validation_errors)=0 AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status IN ('UNPROCESSED','FAILED') AND jsonb_typeof(normalized_data)='object'
    AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
    AND jsonb_array_length(validation_errors)=0 AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
  OR (status='PROCESSING' AND jsonb_typeof(normalized_data)='object'
    AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
    AND jsonb_array_length(validation_errors)=0 AND processing_claim_id IS NOT NULL
    AND processing_claimed_at IS NOT NULL)
  OR (status='PROCESSED' AND (jsonb_typeof(normalized_data)='object'
      OR (normalized_data IS NULL AND validation_revision=0))
    AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL
    AND processed_at IS NOT NULL AND processed_at>=validated_at
    AND jsonb_array_length(validation_errors)=0 AND processing_claim_id IS NULL
    AND processing_claimed_at IS NULL)
);
CREATE INDEX data_import_rows_claim_idx
  ON pathways.data_import_rows(import_batch_id,status,processing_claimed_at);

ALTER TABLE pathways.metadata_mappings ADD COLUMN revision integer NOT NULL DEFAULT 0;
DROP INDEX pathways.metadata_mappings_batch_source_key;
CREATE UNIQUE INDEX metadata_mappings_batch_revision_source_key
  ON pathways.metadata_mappings(import_batch_id,revision,source_field_name);
ALTER TABLE pathways.metadata_mappings DROP CONSTRAINT mapping_system_allowlist;
ALTER TABLE pathways.metadata_mappings ADD CONSTRAINT mapping_no_system_target
  CHECK (target_system_field IS NULL);

INSERT INTO pathways.permissions(code,name,description) VALUES
  ('imports.read','Read data imports','Read scoped import batches without executive raw-data access'),
  ('imports.upload','Upload data imports','Upload scoped private import source files'),
  ('imports.review','Review data imports','Map and validate scoped imports as M&E'),
  ('imports.process','Process data imports','Promote reviewed generic rows as M&E')
ON CONFLICT (code) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON (
  (p.code IN ('imports.read','imports.upload') AND r.code IN (
    'SYSTEM_ADMINISTRATOR','PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER'
  ))
  OR (p.code IN ('imports.review','imports.process')
      AND r.code='MONITORING_AND_EVALUATION_OFFICER')
)
ON CONFLICT (role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pathways.p03_guard_import_batch() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
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
$guard$;

CREATE OR REPLACE FUNCTION pathways.p03_guard_import_row() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Raw import rows are immutable'; END IF;
  IF TG_OP='UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.form_id IS DISTINCT FROM OLD.form_id
    OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
    OR NEW.row_number IS DISTINCT FROM OLD.row_number
    OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum
    OR NEW.raw_data IS DISTINCT FROM OLD.raw_data
  ) THEN RAISE EXCEPTION 'Raw import row identity and values are immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('PROCESSED','UNPROCESSED')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Committed import row disposition is immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$guard$;

CREATE OR REPLACE FUNCTION pathways.p03_guard_mapping() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Reviewed mapping revisions are immutable'; END IF;
  IF NEW.target_system_field IS NOT NULL THEN
    RAISE EXCEPTION 'P03 does not accept system-field mappings';
  END IF;
  IF NEW.status='MAPPED' AND NEW.target_field_id IS NULL THEN
    RAISE EXCEPTION 'Mapped source columns require an allowlisted form field';
  END IF;
  IF NEW.status='IGNORED' AND NEW.target_field_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ignored source columns cannot target a field';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS p2_batch ON pathways.data_import_batches;
DROP TRIGGER IF EXISTS p2_import_row ON pathways.data_import_rows;
DROP TRIGGER IF EXISTS p2_mapping ON pathways.metadata_mappings;
DROP TRIGGER IF EXISTS p03_guard_import_batch ON pathways.data_import_batches;
CREATE TRIGGER p03_guard_import_batch BEFORE INSERT OR UPDATE ON pathways.data_import_batches
FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_import_batch();
DROP TRIGGER IF EXISTS p03_guard_import_row ON pathways.data_import_rows;
CREATE TRIGGER p03_guard_import_row BEFORE UPDATE OR DELETE ON pathways.data_import_rows
FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_import_row();
DROP TRIGGER IF EXISTS p03_guard_mapping ON pathways.metadata_mappings;
CREATE TRIGGER p03_guard_mapping BEFORE INSERT OR UPDATE OR DELETE ON pathways.metadata_mappings
FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_mapping();

DROP TRIGGER IF EXISTS p2_submission ON pathways.form_submissions;
DROP TRIGGER IF EXISTS p02_guard_direct_submission ON pathways.form_submissions;

CREATE OR REPLACE FUNCTION pathways.p03_guard_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source='DIRECT_ENCODING' THEN
      IF NEW.status <> 'DRAFT' OR NEW.import_batch_id IS NOT NULL OR NEW.import_row_id IS NOT NULL
         OR NEW.enrollment_id IS NOT NULL OR NEW.submitted_at IS NOT NULL
         OR NEW.validated_by_id IS NOT NULL OR NEW.validated_at IS NOT NULL
         OR NEW.processed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Direct-entry drafts must start in the draft state';
      END IF;
    ELSIF NEW.source='IMPORTED_DATASET' THEN
      IF NEW.status <> 'DRAFT' OR NEW.import_batch_id IS NULL OR NEW.import_row_id IS NULL
         OR NEW.enrollment_id IS NOT NULL OR NEW.submitted_at IS NOT NULL
         OR NEW.validated_by_id IS NOT NULL OR NEW.validated_at IS NOT NULL
         OR NEW.processed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL
         OR NOT EXISTS (
           SELECT FROM pathways.data_import_rows r
           JOIN pathways.data_import_batches b ON b.id=r.import_batch_id
           WHERE r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
             AND r.form_id=NEW.form_id AND r.id=NEW.import_row_id
             AND r.import_batch_id=NEW.import_batch_id AND r.status='PROCESSING'
             AND b.form_version=NEW.form_version AND b.status='PROCESSING'
             AND b.validated_mapping_revision=b.mapping_revision
         ) THEN RAISE EXCEPTION 'Imported submissions require a currently reviewed processing row'; END IF;
    ELSE RAISE EXCEPTION 'Submission source is unsupported';
    END IF;
    IF NOT EXISTS (
      SELECT FROM pathways.digital_forms f WHERE f.organization_id=NEW.organization_id
      AND f.project_id=NEW.project_id AND f.id=NEW.form_id AND f.version=NEW.form_version
      AND f.status IN ('PUBLISHED','ARCHIVED')
    ) THEN RAISE EXCEPTION 'Submission requires a published pinned form version'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'DRAFT'
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.form_version IS DISTINCT FROM OLD.form_version
     OR NEW.client_submission_id IS DISTINCT FROM OLD.client_submission_id
     OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
     OR NEW.import_row_id IS DISTINCT FROM OLD.import_row_id
     OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
     OR NEW.is_dummy_record IS DISTINCT FROM OLD.is_dummy_record
     OR NEW.status NOT IN ('DRAFT','VALIDATED') THEN
    RAISE EXCEPTION 'Submitted records and pinned form versions are immutable';
  END IF;
  IF NEW.status='VALIDATED' AND (
    NEW.submitted_at IS NULL OR NEW.validated_by_id IS NULL OR NEW.validated_at IS NULL
  ) THEN RAISE EXCEPTION 'Final submission requires validation provenance'; END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER p03_guard_submission BEFORE INSERT OR UPDATE ON pathways.form_submissions
FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_submission();

DROP TRIGGER IF EXISTS p2_row_complete ON pathways.data_import_rows;
DROP TRIGGER IF EXISTS p2_batch_complete ON pathways.data_import_batches;
DROP TRIGGER IF EXISTS p2_batch_rows_complete ON pathways.data_import_rows;

CREATE OR REPLACE FUNCTION pathways.p03_assert_processed_row() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $assert$
BEGIN
  IF NEW.status='PROCESSED' AND NOT EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.import_row_id=NEW.id AND s.import_batch_id=NEW.import_batch_id
      AND s.organization_id=NEW.organization_id AND s.project_id=NEW.project_id
      AND s.form_id=NEW.form_id AND s.source='IMPORTED_DATASET'
      AND s.status IN ('VALIDATED','PROCESSED')
  ) THEN
    RAISE EXCEPTION 'Processed generic row requires one normalized submission';
  END IF;
  RETURN NULL;
END
$assert$;

CREATE CONSTRAINT TRIGGER p03_row_complete AFTER INSERT OR UPDATE ON pathways.data_import_rows
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p03_assert_processed_row();

REVOKE ALL ON FUNCTION pathways.p03_guard_import_batch(), pathways.p03_guard_import_row(),
  pathways.p03_guard_mapping(), pathways.p03_guard_submission(),
  pathways.p03_assert_processed_row() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

DROP POLICY p4_runtime_insert ON pathways.data_import_batches;
DROP POLICY p4_runtime_update ON pathways.data_import_batches;
CREATE POLICY p03_runtime_insert ON pathways.data_import_batches FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND uploaded_by_id=(SELECT pathways.runtime_context_user()));
CREATE POLICY p03_runtime_update ON pathways.data_import_batches FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization()))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization()));

DROP POLICY p2_runtime_insert ON pathways.form_submissions;
CREATE POLICY p03_runtime_insert ON pathways.form_submissions FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND (
    (source='DIRECT_ENCODING' AND status='DRAFT' AND import_batch_id IS NULL
      AND import_row_id IS NULL AND enrollment_id IS NULL)
    OR
    (source='IMPORTED_DATASET' AND status='DRAFT' AND import_batch_id IS NOT NULL
      AND import_row_id IS NOT NULL AND enrollment_id IS NULL)
  )
);

DROP POLICY p2_runtime_update ON pathways.form_submissions;
CREATE POLICY p03_runtime_update ON pathways.form_submissions FOR UPDATE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND status='DRAFT'
)
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND status IN ('DRAFT','VALIDATED')
);

DROP POLICY p2_runtime_insert ON pathways.form_response_values;
CREATE POLICY p03_runtime_insert ON pathways.form_response_values FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.project_id=form_response_values.project_id
      AND s.form_id=form_response_values.form_id
      AND s.id=form_response_values.submission_id
      AND s.submitted_by_id=(SELECT pathways.runtime_context_user())
      AND ((s.source='DIRECT_ENCODING' AND s.status='DRAFT')
        OR (s.source='IMPORTED_DATASET' AND s.status='DRAFT'))
  )
);

COMMIT;
