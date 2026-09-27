-- DISPOSABLE EXACT PROPOSAL. No execution or tracked migration authorized here.
-- 0029_core_registration_and_import_support: registration/import support ONLY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE item record;
BEGIN
  IF current_user <> 'prisma'
     OR pg_catalog.current_setting('server_encoding') <> 'UTF8'
     OR pg_catalog.current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'Unexpected migration owner, encoding or PostgreSQL version.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles
      WHERE rolname='pathways_runtime' AND NOT rolsuper AND NOT rolbypassrls)
     OR pg_catalog.pg_has_role('pathways_runtime','prisma','MEMBER')
     OR pg_catalog.has_schema_privilege('pathways_runtime','pathways','CREATE') THEN
    RAISE EXCEPTION 'Unsafe runtime owner or schema authority.';
  END IF;
  IF pg_catalog.to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('pathways.p2_assert_submission()') IS NULL
     OR pg_catalog.to_regprocedure('pathways.p29_auto_map_import(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected supporting-operation migration baseline.';
  END IF;
  FOR item IN SELECT * FROM (VALUES
      ('digital_forms','p09_scoped_select'),('form_fields','p09_scoped_select'),
      ('form_submissions','p09_select'),('form_response_values','p09_select'),
      ('form_submissions','p09_insert'),('form_submissions','p09_update'),
      ('form_response_values','p09_insert'),('form_response_values','p09_update'),
      ('metadata_mappings','p09_insert')
    ) AS baseline(table_name,policy_name)
  LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_policy p ON p.polrelid=c.oid
      WHERE n.nspname='pathways' AND c.relname=item.table_name
        AND p.polname=item.policy_name AND NOT p.polpermissive
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')) THEN
      RAISE EXCEPTION 'Unexpected supporting-operation policy baseline.';
    END IF;
  END LOOP;
END
$preflight$;

-- DISPOSABLE PROPOSAL ONLY. NOT A TRACKED MIGRATION. DO NOT APPLY.
-- Proposed registration section of 0029_core_registration_and_import_support.
-- No table grants, permission seeds, imported-submission or generic collection authority.

-- Boolean-only definer helpers avoid digital_forms/form_fields/submission RLS recursion.
-- Exact trusted runtime scope is checked BEFORE any owner-visible domain lookup.
CREATE FUNCTION pathways.p29_registration_definition(
  wanted_org uuid, wanted_project uuid, wanted_form uuid, wanted_version integer
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project)
  THEN RETURN false; END IF;
  RETURN EXISTS (SELECT FROM pathways.digital_forms f
    WHERE f.organization_id=wanted_org AND f.project_id=wanted_project AND f.id=wanted_form
      AND (wanted_version IS NULL OR f.version=wanted_version)
      AND f.form_type='BENEFICIARY_REGISTRATION' AND f.status='PUBLISHED'
      AND f.archived_at IS NULL);
END $$;
ALTER FUNCTION pathways.p29_registration_definition(uuid,uuid,uuid,integer) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_registration_definition(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_registration_definition(uuid,uuid,uuid,integer)
  TO pathways_runtime;

CREATE FUNCTION pathways.p29_direct_registration(
  wanted_org uuid, wanted_project uuid, wanted_form uuid, wanted_version integer,
  wanted_submitter uuid, wanted_source pathways.submission_source,
  wanted_batch uuid, wanted_row uuid, wanted_enrollment uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR wanted_submitter IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
     OR wanted_source IS DISTINCT FROM 'DIRECT_ENCODING'::pathways.submission_source
     OR wanted_batch IS NOT NULL OR wanted_row IS NOT NULL
     OR wanted_version IS NULL OR wanted_enrollment IS NULL
     OR NOT pathways.p29_registration_definition(wanted_org,wanted_project,wanted_form,wanted_version)
  THEN RETURN false; END IF;
  RETURN EXISTS (SELECT FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=wanted_project AND e.id=wanted_enrollment
      AND e.status='ACTIVE' AND e.ended_date IS NULL
      AND b.archived_at IS NULL AND b.status='ACTIVE');
END $$;
ALTER FUNCTION pathways.p29_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid)
  TO pathways_runtime;

-- Mutation-only lock: do not use this VOLATILE function for supporting reads.
-- Call explicitly from promoteRegistration's DIRECT_ENTRY path after selecting
-- its pinned version and BEFORE Beneficiary/enrollment/submission mutations.
-- That API call is mandatory for PO/M&E too: preserved broader grants can short
-- circuit the appended narrow policy branch and therefore cannot guarantee locking.
CREATE FUNCTION pathways.p29_lock_registration_definition(
  wanted_org uuid, wanted_project uuid, wanted_form uuid, wanted_version integer
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR wanted_version IS NULL
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project)
  THEN RETURN false; END IF;
  PERFORM 1 FROM pathways.digital_forms f
    WHERE f.organization_id=wanted_org AND f.project_id=wanted_project AND f.id=wanted_form
      AND f.version=wanted_version AND f.form_type='BENEFICIARY_REGISTRATION'
      AND f.status='PUBLISHED' AND f.archived_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Recheck live scope after any lock wait. The row lock is transaction-held.
  RETURN wanted_org=nullif(current_setting('app.organization_id',true),'')::uuid
    AND pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project);
END $$;
ALTER FUNCTION pathways.p29_lock_registration_definition(uuid,uuid,uuid,integer) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_lock_registration_definition(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_lock_registration_definition(uuid,uuid,uuid,integer)
  TO pathways_runtime;

CREATE FUNCTION pathways.p29_locked_direct_registration(
  wanted_org uuid, wanted_project uuid, wanted_form uuid, wanted_version integer,
  wanted_submitter uuid, wanted_source pathways.submission_source,
  wanted_batch uuid, wanted_row uuid, wanted_enrollment uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT pathways.p29_direct_registration(wanted_org,wanted_project,wanted_form,wanted_version,
    wanted_submitter,wanted_source,wanted_batch,wanted_row,wanted_enrollment)
  THEN RETURN false; END IF;
  RETURN pathways.p29_lock_registration_definition(wanted_org,wanted_project,wanted_form,wanted_version);
END $$;
ALTER FUNCTION pathways.p29_locked_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_locked_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_locked_direct_registration(uuid,uuid,uuid,integer,uuid,pathways.submission_source,uuid,uuid,uuid)
  TO pathways_runtime;

CREATE FUNCTION pathways.p29_registration_submission(
  wanted_org uuid, wanted_project uuid, wanted_form uuid, wanted_submission uuid, editing boolean
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE parent pathways.form_submissions%ROWTYPE;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR editing IS NULL
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.register',wanted_project)
  THEN RETURN false; END IF;
  SELECT * INTO parent FROM pathways.form_submissions s
    WHERE s.organization_id=wanted_org AND s.project_id=wanted_project
      AND s.form_id=wanted_form AND s.id=wanted_submission
      AND s.submitted_by_id=nullif(current_setting('app.user_id',true),'')::uuid;
  IF parent.id IS NULL OR parent.is_dummy_record
     OR (editing AND parent.status<>'DRAFT')
     OR (NOT editing AND parent.status NOT IN ('DRAFT','VALIDATED'))
  THEN RETURN false; END IF;
  RETURN pathways.p29_direct_registration(parent.organization_id,parent.project_id,parent.form_id,
    parent.form_version,parent.submitted_by_id,parent.source,parent.import_batch_id,
    parent.import_row_id,parent.enrollment_id);
END $$;
ALTER FUNCTION pathways.p29_registration_submission(uuid,uuid,uuid,uuid,boolean) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_registration_submission(uuid,uuid,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_registration_submission(uuid,uuid,uuid,uuid,boolean)
  TO pathways_runtime;

DROP POLICY p09_scoped_select ON pathways.digital_forms;
CREATE POLICY p09_scoped_select ON pathways.digital_forms AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('forms.read',project_id)
  OR pathways.p29_registration_definition(organization_id,project_id,id,version));
DROP POLICY p09_scoped_select ON pathways.form_fields;
CREATE POLICY p09_scoped_select ON pathways.form_fields AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('forms.read',project_id)
  OR pathways.p29_registration_definition(organization_id,project_id,form_id,NULL));

-- Preserve revised-0027 existing SELECT branches exactly; append only own registration branch.
DROP POLICY p09_select ON pathways.form_submissions;
CREATE POLICY p09_select ON pathways.form_submissions AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('assessments.detail.read',project_id)
 OR (pathways.p05_has_project_permission('imports.process',project_id)
     AND import_batch_id IS NOT NULL AND submitted_by_id=pathways.runtime_context_user())
 OR pathways.p29_registration_submission(organization_id,project_id,form_id,id,false));
DROP POLICY p09_select ON pathways.form_response_values;
CREATE POLICY p09_select ON pathways.form_response_values AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('assessments.detail.read',project_id)
 OR (pathways.p05_has_project_permission('imports.process',project_id) AND EXISTS (
     SELECT FROM pathways.form_submissions s WHERE s.id=submission_id
       AND s.project_id=pathways.form_response_values.project_id
       AND s.import_batch_id IS NOT NULL AND s.submitted_by_id=pathways.runtime_context_user()))
 OR pathways.p29_registration_submission(organization_id,project_id,form_id,submission_id,false));

DROP POLICY p09_insert ON pathways.form_submissions;
CREATE POLICY p09_insert ON pathways.form_submissions AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR (pathways.p29_locked_direct_registration(organization_id,project_id,form_id,form_version,
       submitted_by_id,source,import_batch_id,import_row_id,enrollment_id)
     AND status='DRAFT' AND NOT is_dummy_record AND submitted_at IS NULL
     AND validated_by_id IS NULL AND validated_at IS NULL AND processed_at IS NULL
     AND rejection_reason IS NULL));
DROP POLICY p09_update ON pathways.form_submissions;
CREATE POLICY p09_update ON pathways.form_submissions AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR (status='DRAFT' AND NOT is_dummy_record
     AND pathways.p29_locked_direct_registration(organization_id,project_id,form_id,form_version,
       submitted_by_id,source,import_batch_id,import_row_id,enrollment_id)))
WITH CHECK (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR (NOT is_dummy_record AND processed_at IS NULL AND rejection_reason IS NULL
     AND pathways.p29_locked_direct_registration(organization_id,project_id,form_id,form_version,
       submitted_by_id,source,import_batch_id,import_row_id,enrollment_id)
     AND ((status='DRAFT' AND submitted_at IS NULL AND validated_by_id IS NULL AND validated_at IS NULL)
       OR (status='VALIDATED' AND validated_by_id=pathways.runtime_context_user()
         AND submitted_at=pg_catalog.date_trunc('milliseconds',CURRENT_TIMESTAMP)
         AND validated_at=pg_catalog.date_trunc('milliseconds',CURRENT_TIMESTAMP)))));

DROP POLICY p09_insert ON pathways.form_response_values;
CREATE POLICY p09_insert ON pathways.form_response_values AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR pathways.p29_registration_submission(organization_id,project_id,form_id,submission_id,true));
DROP POLICY p09_update ON pathways.form_response_values;
CREATE POLICY p09_update ON pathways.form_response_values AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR pathways.p29_registration_submission(organization_id,project_id,form_id,submission_id,true))
WITH CHECK (pathways.p05_has_project_permission('submissions.write',project_id)
 OR pathways.p05_has_project_permission('imports.process',project_id)
 OR pathways.p29_registration_submission(organization_id,project_id,form_id,submission_id,true));

-- IMPORTANT: existing permissive p03_runtime_update permits only OLD DRAFT.
-- Deferred SELECT FOR UPDATE of a VALIDATED parent can therefore hide that row under RLS.
-- Existing parent mutation / p2_guard_response already holds its row lock until transaction end.
-- Plain scoped SELECT preserves invoker RLS while avoiding implicit UPDATE authority for completeness.
CREATE OR REPLACE FUNCTION pathways.p2_assert_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent pathways.form_submissions%ROWTYPE; sid uuid; wanted_org uuid; wanted_project uuid; wanted_form uuid;
BEGIN
  IF TG_TABLE_NAME='form_submissions' THEN
    sid:=NEW.id; wanted_org:=NEW.organization_id; wanted_project:=NEW.project_id; wanted_form:=NEW.form_id;
  ELSE
    IF TG_OP='DELETE' THEN
      sid:=OLD.submission_id; wanted_org:=OLD.organization_id; wanted_project:=OLD.project_id; wanted_form:=OLD.form_id;
    ELSE
      sid:=NEW.submission_id; wanted_org:=NEW.organization_id; wanted_project:=NEW.project_id; wanted_form:=NEW.form_id;
    END IF;
  END IF;
  SELECT * INTO parent FROM pathways.form_submissions s
    WHERE s.id=sid AND s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=wanted_form;
  IF parent.id IS NULL THEN
    RAISE EXCEPTION 'Submission validation context unavailable' USING ERRCODE='42501';
  END IF;
  IF parent.status IN ('VALIDATED','PROCESSED') AND EXISTS (
    SELECT FROM pathways.form_fields f LEFT JOIN pathways.form_response_values v
      ON v.organization_id=f.organization_id AND v.project_id=f.project_id AND v.form_id=f.form_id
      AND v.field_id=f.id AND v.submission_id=parent.id
    WHERE f.organization_id=parent.organization_id AND f.project_id=parent.project_id AND f.form_id=parent.form_id
      AND ((f.is_required AND v.id IS NULL)
        OR (v.id IS NOT NULL AND NOT pathways.p2_valid_response(f,v.value))))
  THEN RAISE EXCEPTION 'Validated submission is missing required or valid responses' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION pathways.p2_assert_submission() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p2_assert_submission()
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- Existing permissive policies, all other restrictive branches, p03_guard_submission,
-- p2_guard_response, identity/form guards, consent guards and deferred triggers remain.
-- Response DELETE gets NO registration-support branch. No general form writes are added.
-- Helpers are boolean-only; explicit ACLs override inherited defaults atomically in this tx.

-- REVIEW PROPOSAL ONLY. Not a tracked migration; do not execute before C approval
-- and exclusive disposable replay activation. No aliases, evidence SQL or seeds.
-- Install CREATE/OWNER/REVOKE/GRANT atomically under the existing migration runner.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'pathways_runtime'
      AND NOT r.rolsuper AND NOT r.rolbypassrls
  ) OR pg_catalog.pg_has_role('pathways_runtime', 'prisma', 'MEMBER') THEN
    RAISE EXCEPTION 'Runtime must not inherit or assume the migration owner.';
  END IF;
END
$guard$;

-- Deterministic V1: NFKC, trim ASCII whitespace, ASCII A-Z folding only,
-- collapse ASCII whitespace/hyphens to underscore. Preserve other punctuation
-- and non-ASCII letters. The JS canonical validator/preview must use this exact
-- rule; SQL/JS parity cases are a required replay gate. No fuzzy matching.
CREATE FUNCTION pathways.p29_mapping_name_v1(value text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.translate(
      pg_catalog.btrim(normalize(value, NFKC), E' \t\n\r\f\013'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    ),
    E'[ \t\n\r\f\013-]+', '_', 'g'
  )
$fn$;
ALTER FUNCTION pathways.p29_mapping_name_v1(text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_mapping_name_v1(text)
  FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

CREATE FUNCTION pathways.p29_auto_map_import(
  wanted_batch uuid, expected_mapping_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  actor_id uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  org_id uuid := nullif(current_setting('app.organization_id',true),'')::uuid;
  batch pathways.data_import_batches%ROWTYPE;
  source_count integer;
  field_count integer;
  row_count integer;
  bad_rows integer;
  decisions jsonb;
  mapped_count integer;
  pending_count integer;
  required_unmapped integer;
  complete boolean;
  receipt jsonb;
BEGIN
  IF wanted_batch IS NULL OR expected_mapping_revision IS NULL
     OR expected_mapping_revision NOT IN (0, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Automatic mapping input is invalid.';
  END IF;
  IF actor_id IS NULL OR org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Automatic mapping is unavailable.';
  END IF;

  -- Structurally scoped before locking/retrieval. Live authority is rechecked
  -- after the lock; the HTTP caller also uses withAuthorizedOperation.
  SELECT b.* INTO batch
  FROM pathways.data_import_batches b
  WHERE b.id = wanted_batch AND b.organization_id = org_id
    AND b.uploaded_by_id = actor_id
    AND pathways.p05_has_project_permission('imports.upload', b.project_id)
  FOR UPDATE;
  IF NOT FOUND OR NOT pathways.p05_has_project_permission('imports.upload', batch.project_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Automatic mapping is unavailable.';
  END IF;

  IF batch.storage_status <> 'STORED'
     OR batch.status NOT IN ('UPLOADED', 'MAPPED')
     OR batch.mapping_revision NOT IN (0, 1)
     OR batch.validation_revision <> 0
     OR batch.validated_mapping_revision IS NOT NULL
     OR batch.reviewed_by_id IS NOT NULL OR batch.validated_at IS NOT NULL
     OR batch.processing_revision <> 0 OR batch.processing_attempts <> 0
     OR batch.processing_claim_id IS NOT NULL OR batch.processing_claimed_at IS NOT NULL
     OR batch.processed_at IS NOT NULL
     OR batch.valid_rows <> 0 OR batch.invalid_rows <> 0
     OR batch.processed_rows <> 0 OR batch.unprocessed_rows <> 0 OR batch.failed_rows <> 0
     OR batch.total_rows NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Automatic mapping batch is stale or frozen.';
  END IF;
  IF batch.mapping_revision = 0 AND expected_mapping_revision <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Automatic mapping revision conflict.';
  END IF;

  -- This operation never opts an archived or unpublished form into mapping.
  PERFORM 1 FROM pathways.digital_forms f
  WHERE f.id = batch.form_id AND f.organization_id = org_id
    AND f.project_id = batch.project_id AND f.version = batch.form_version
    AND f.status = 'PUBLISHED' AND f.archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Automatic mapping definition is unavailable.';
  END IF;
  -- The form lock can wait independently of the batch lock. Recheck live
  -- authority again before candidate reads and writes, including raw callers.
  IF actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
     OR org_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR NOT pathways.p05_has_project_permission('imports.upload', batch.project_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Automatic mapping is unavailable.';
  END IF;
  IF pg_catalog.jsonb_typeof(batch.source_headers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Stored source columns are invalid.';
  END IF;
  source_count := pg_catalog.jsonb_array_length(batch.source_headers);
  IF source_count NOT BETWEEN 1 AND 500 OR source_count * batch.total_rows > 250000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Stored source columns exceed import bounds.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(batch.source_headers) WITH ORDINALITY AS c(value, n)
    WHERE pg_catalog.jsonb_typeof(c.value) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(c.value -> 'key') IS DISTINCT FROM 'string'
      OR c.value ->> 'key' IS DISTINCT FROM 'column_' || pg_catalog.lpad(c.n::text, 4, '0')
      OR pg_catalog.jsonb_typeof(c.value -> 'columnIndex') IS DISTINCT FROM 'number'
      OR c.value ->> 'columnIndex' IS DISTINCT FROM c.n::text
      OR pg_catalog.jsonb_typeof(c.value -> 'header') IS DISTINCT FROM 'string'
      OR pg_catalog.char_length(c.value ->> 'header') NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Stored source column identity is invalid.';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO field_count
  FROM pathways.form_fields f
  WHERE f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id;
  IF field_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Automatic mapping definition exceeds field bounds.';
  END IF;
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE
      r.status <> 'PENDING' OR r.normalized_data IS NOT NULL
      OR r.validation_revision <> 0 OR r.validated_by_id IS NOT NULL OR r.validated_at IS NOT NULL
      OR r.processing_claim_id IS NOT NULL OR r.processing_claimed_at IS NOT NULL
      OR r.processing_attempts <> 0 OR r.processed_at IS NOT NULL
      OR r.mapping_revision <> batch.mapping_revision
    )::integer INTO row_count, bad_rows
  FROM pathways.data_import_rows r
  WHERE r.organization_id = org_id AND r.project_id = batch.project_id
    AND r.form_id = batch.form_id AND r.import_batch_id = batch.id;
  IF row_count <> batch.total_rows OR bad_rows <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Automatic mapping staged rows are stale or frozen.';
  END IF;

  WITH sources AS (
    SELECT c.n::integer AS column_index, c.value ->> 'key' AS source_key,
      pathways.p29_mapping_name_v1(c.value ->> 'header') AS name
    FROM pg_catalog.jsonb_array_elements(batch.source_headers) WITH ORDINALITY AS c(value, n)
  ), candidate_matches AS (
    SELECT s.column_index, s.source_key, s.name, f.id AS target_id
    FROM sources s
    LEFT JOIN pathways.form_fields f
      ON f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id
      AND s.name <> '' AND (
        s.name = pathways.p29_mapping_name_v1(f.code)
        OR s.name = pathways.p29_mapping_name_v1(f.label)
      )
  ), candidates AS (
    SELECT m.column_index, m.source_key, m.name,
      pg_catalog.count(m.target_id)::integer AS candidate_count,
      (pg_catalog.array_agg(m.target_id ORDER BY m.target_id) FILTER (WHERE m.target_id IS NOT NULL))[1] AS target_id
    FROM candidate_matches m
    GROUP BY m.column_index, m.source_key, m.name
  ), competing AS (
    SELECT m.target_id, pg_catalog.count(DISTINCT m.source_key) AS source_count
    FROM candidate_matches m WHERE m.target_id IS NOT NULL GROUP BY m.target_id
  ), classified AS (
    SELECT c.*, CASE
      WHEN c.name = '' THEN 'EMPTY_NAME'
      WHEN c.candidate_count = 0 THEN 'UNKNOWN_NAME'
      WHEN c.candidate_count > 1 THEN 'AMBIGUOUS_NAME'
      WHEN x.source_count <> 1 THEN 'COMPETING_SOURCE'
      ELSE 'UNIQUE_MATCH' END AS reason,
      CASE
        WHEN c.name = pathways.p29_mapping_name_v1(f.code)
          AND c.name = pathways.p29_mapping_name_v1(f.label) THEN 'CODE_AND_LABEL'
        WHEN c.name = pathways.p29_mapping_name_v1(f.code) THEN 'CODE'
        WHEN c.name = pathways.p29_mapping_name_v1(f.label) THEN 'LABEL'
        ELSE NULL END AS match_kind
    FROM candidates c
    LEFT JOIN competing x ON x.target_id = c.target_id
    LEFT JOIN pathways.form_fields f ON f.id = c.target_id
      AND f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id
  )
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sourceKey', c.source_key, 'columnIndex', c.column_index,
    'targetFieldId', CASE WHEN c.reason = 'UNIQUE_MATCH' THEN c.target_id ELSE NULL END,
    'status', CASE WHEN c.reason = 'UNIQUE_MATCH' THEN 'MAPPED' ELSE 'PENDING' END,
    'reason', c.reason, 'matchKind', CASE WHEN c.reason = 'UNIQUE_MATCH' THEN c.match_kind ELSE NULL END
  ) ORDER BY c.column_index) INTO decisions FROM classified c;

  -- Structural checks mirror canonical mapping validation. Incomplete choices
  -- are recorded as PENDING; they NEVER count as IGNORED or complete mappings.
  IF pg_catalog.jsonb_array_length(decisions) <> source_count OR (
    SELECT pg_catalog.count(DISTINCT d.value ->> 'sourceKey')
    FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
  ) <> source_count OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
    WHERE d.value ->> 'status' = 'MAPPED'
    GROUP BY d.value ->> 'targetFieldId' HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Automatic mapping choices are invalid.';
  END IF;
  SELECT pg_catalog.count(*) FILTER (WHERE d.value ->> 'status' = 'MAPPED')::integer,
    pg_catalog.count(*) FILTER (WHERE d.value ->> 'status' = 'PENDING')::integer
    INTO mapped_count, pending_count
  FROM pg_catalog.jsonb_array_elements(decisions) AS d(value);
  SELECT pg_catalog.count(*)::integer INTO required_unmapped
  FROM pathways.form_fields f
  WHERE f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id
    AND f.is_required AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
      WHERE d.value ->> 'status' = 'MAPPED' AND d.value ->> 'targetFieldId' = f.id::text
    );
  complete := pending_count = 0 AND required_unmapped = 0 AND mapped_count > 0;
  receipt := pg_catalog.jsonb_build_object(
    'batchId', batch.id, 'mappingRevision', 1, 'mapped', mapped_count,
    'pending', pending_count, 'requiredUnmapped', required_unmapped, 'complete', complete
  );

  IF batch.mapping_revision = 1 THEN
    -- Only the immutable V1 result of this operation is an idempotent retry.
    -- A later manual revision, validation or processing always conflicts.
    IF (SELECT pg_catalog.count(*) FROM pathways.metadata_mappings m
      WHERE m.organization_id = org_id AND m.project_id = batch.project_id
        AND m.form_id = batch.form_id AND m.import_batch_id = batch.id AND m.revision = 1) <> source_count
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
        LEFT JOIN pathways.metadata_mappings m
          ON m.organization_id = org_id AND m.project_id = batch.project_id AND m.form_id = batch.form_id
          AND m.import_batch_id = batch.id AND m.revision = 1 AND m.source_field_name = d.value ->> 'sourceKey'
        WHERE m.id IS NULL OR m.status::text IS DISTINCT FROM d.value ->> 'status'
          OR m.target_field_id::text IS DISTINCT FROM d.value ->> 'targetFieldId'
          OR m.target_system_field IS NOT NULL
          OR m.validation_message IS DISTINCT FROM 'AUTO_CODE_LABEL_V1:' || (d.value ->> 'reason')
      ) OR (SELECT pg_catalog.count(*) FROM pathways.audit_logs a
        WHERE a.organization_id = org_id AND a.project_id = batch.project_id AND a.actor_user_id = actor_id
          AND a.entity_type = 'DataImportBatch' AND a.entity_id = batch.id::text
          AND a.action = 'IMPORT_AUTOMATIC_MAPPING_CREATED'
          AND a.changes ->> 'algorithmVersion' = 'AUTO_CODE_LABEL_V1'
          AND a.changes -> 'decisions' = decisions) <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping revision conflict.';
    END IF;
    RETURN receipt;
  END IF;
  IF EXISTS (SELECT 1 FROM pathways.metadata_mappings m
    WHERE m.organization_id = org_id AND m.import_batch_id = batch.id) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping revision conflict.';
  END IF;

  INSERT INTO pathways.metadata_mappings (
    organization_id, project_id, form_id, import_batch_id, revision,
    source_field_name, target_field_id, status, validation_message
  )
  SELECT org_id, batch.project_id, batch.form_id, batch.id, 1,
    d.value ->> 'sourceKey', (d.value ->> 'targetFieldId')::uuid,
    (d.value ->> 'status')::pathways.mapping_status,
    'AUTO_CODE_LABEL_V1:' || (d.value ->> 'reason')
  FROM pg_catalog.jsonb_array_elements(decisions) AS d(value);

  UPDATE pathways.data_import_rows r SET mapping_revision = 1, updated_at = CURRENT_TIMESTAMP
  WHERE r.organization_id = org_id AND r.project_id = batch.project_id
    AND r.form_id = batch.form_id AND r.import_batch_id = batch.id;
  UPDATE pathways.data_import_batches b
  SET mapping_revision = 1,
    status = CASE WHEN complete THEN 'MAPPED'::pathways.import_status ELSE 'UPLOADED'::pathways.import_status END,
    updated_at = CURRENT_TIMESTAMP
  WHERE b.id = batch.id AND b.organization_id = org_id AND b.project_id = batch.project_id;
  INSERT INTO pathways.audit_logs (
    organization_id, actor_user_id, project_id, action, entity_type, entity_id, changes
  ) VALUES (
    org_id, actor_id, batch.project_id, 'IMPORT_AUTOMATIC_MAPPING_CREATED', 'DataImportBatch', batch.id::text,
    pg_catalog.jsonb_build_object('algorithmVersion', 'AUTO_CODE_LABEL_V1', 'aliasRegistry', 'NONE',
      'formId', batch.form_id, 'formVersion', batch.form_version, 'revision', 1,
      'receipt', receipt, 'decisions', decisions)
  );
  RETURN receipt;
END
$fn$;
ALTER FUNCTION pathways.p29_auto_map_import(uuid, integer) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p29_auto_map_import(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p29_auto_map_import(uuid, integer) TO pathways_runtime;

-- No table policy/grant is broadened for automatic mapping. The existing
-- metadata_mappings INSERT policy still requires imports.review; a PO cannot
-- submit arbitrary mapped/ignored/PENDING rows directly. The definer above is
-- the only new write capability and accepts no choices, SQL or actor IDs.

DO $postconditions$
DECLARE fn record; check_role text;
BEGIN
  FOR fn IN SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig,p.proacl
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pathways' AND p.proname IN (
      'p29_registration_definition','p29_direct_registration','p29_registration_submission',
      'p29_lock_registration_definition','p29_locked_direct_registration',
      'p29_mapping_name_v1','p29_auto_map_import','p2_assert_submission')
  LOOP
    IF fn.proowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
       OR NOT ('search_path=""'=ANY(fn.proconfig))
       OR fn.prosecdef<>(fn.proname NOT IN ('p29_mapping_name_v1','p2_assert_submission'))
       OR EXISTS (SELECT FROM pg_catalog.aclexplode(fn.proacl) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected supporting-operation function authority.';
    END IF;
    FOREACH check_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF pg_catalog.has_function_privilege(check_role,fn.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'Unintended role can execute supporting function.';
      END IF;
    END LOOP;
    IF pg_catalog.has_function_privilege('pathways_runtime',fn.oid,'EXECUTE')
       <> (fn.proname NOT IN ('p29_mapping_name_v1','p2_assert_submission')) THEN
      RAISE EXCEPTION 'Unexpected runtime supporting-function EXECUTE privilege.';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='pathways' AND p.proname IN (
        'p29_registration_definition','p29_direct_registration','p29_registration_submission',
        'p29_lock_registration_definition','p29_locked_direct_registration',
        'p29_mapping_name_v1','p29_auto_map_import','p2_assert_submission'))<>8 THEN
    RAISE EXCEPTION 'Unexpected supporting-function inventory.';
  END IF;
END
$postconditions$;
COMMIT;
