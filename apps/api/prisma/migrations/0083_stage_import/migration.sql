-- 0083 stage import (cr-pathways-participant-file-import section 10); forward migration.
-- One uploaded client file becomes a parent batch with one child batch per file part, so data_import_batches gains
-- parent_batch_id, part_code and file_parts. An imported Training Survey submission may now name its person, and an
-- assessment may be sourced from such a submission of the same person. No activity, grant, policy or rules object changes.
-- p03_guard_import_batch keeps the 0079 body with the three columns frozen (file_parts settable once, like source_headers),
-- p34_guard_survey_subject keeps the retarget check and the direct-entry branch and gains an IMPORTED_DATASET branch, and
-- p3_guard_assessment_source accepts a submission of the same beneficiary that names no enrollment.
-- p03_assert_processed_row keeps the 0080 body and also accepts an unchanged survey row of a file part whose person is enrolled.
-- form_fields_rule_kind keeps the 0078 kinds and adds TOTAL_SCORE, the answer key of a scored survey.
-- Owner, security mode, search_path, ACL and trigger bindings of the four functions stay unchanged (asserted below).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0082_permission_check_plpgsql'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0083 requires the verified 0082 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.data_import_batches'::pg_catalog.regclass
   AND a.attname IN ('parent_batch_id','part_code','file_parts') AND NOT a.attisdropped)
 THEN RAISE EXCEPTION '0083 file part columns already exist'; END IF;
 -- Only the reviewed definitions (0079, 0034, 0071, 0080) may be replaced.
 FOR fn IN SELECT w.sig, w.secdef, w.md5, p.prosrc, p.proowner, p.prosecdef, p.proconfig
  FROM (VALUES ('pathways.p03_guard_import_batch()',false,'417735450bc904f29cc30659ef259676'),
   ('pathways.p34_guard_survey_subject()',false,'552910dc8f72cb9ccbf1f04d505084f1'),
   ('pathways.p3_guard_assessment_source()',true,'c88ed7ba8074ffa847062e2c0839bdf9'),
   ('pathways.p03_assert_processed_row()',false,'4249c2d269204b3bd68b0e5a4ef9db33')) w(sig,secdef,md5)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef<>fn.secdef
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>fn.md5
  THEN RAISE EXCEPTION '0083 requires the reviewed definition of %',fn.sig; END IF;
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,83);

-- File parts: a child names its parent and its part, a parent keeps the part list, all set once.
ALTER TABLE pathways.data_import_batches
  ADD COLUMN parent_batch_id uuid,
  ADD COLUMN part_code text,
  ADD COLUMN file_parts jsonb,
  ADD CONSTRAINT data_import_batches_part_shape CHECK((parent_batch_id IS NULL) = (part_code IS NULL)
    AND (part_code IS NULL OR part_code ~ '^[A-Za-z][A-Za-z0-9_]{1,39}$')
    AND (parent_batch_id IS NULL OR file_parts IS NULL)),
  ADD CONSTRAINT data_import_batches_parent_fk FOREIGN KEY(organization_id,project_id,parent_batch_id)
    REFERENCES pathways.data_import_batches(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX data_import_batches_part_key ON pathways.data_import_batches(organization_id,parent_batch_id,part_code,form_version)
  WHERE parent_batch_id IS NOT NULL AND status <> 'FAILED'; -- a failed start is started again as a new child

-- The 0079 body of p03_guard_import_batch with the file part columns frozen (marked 0083).
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
     OR NEW.parent_batch_id IS DISTINCT FROM OLD.parent_batch_id -- 0083
     OR NEW.part_code IS DISTINCT FROM OLD.part_code -- 0083
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
  IF OLD.file_parts IS NOT NULL AND NEW.file_parts IS DISTINCT FROM OLD.file_parts THEN -- 0083
    RAISE EXCEPTION 'Import file parts are immutable after finalization';
  END IF;
  IF NEW.validated_mapping_revision IS NOT NULL
     AND NEW.validated_mapping_revision <> NEW.mapping_revision THEN
    RAISE EXCEPTION 'Validated mapping revision must be current';
  END IF;
  RETURN NEW;
END
$$;

-- An imported survey may name its person as a direct-entry one does.
ALTER TABLE pathways.form_submissions DROP CONSTRAINT p34_survey_subject_shape;
ALTER TABLE pathways.form_submissions ADD CONSTRAINT p34_survey_subject_shape
  CHECK (beneficiary_id IS NULL OR (enrollment_id IS NULL AND source IN ('DIRECT_ENCODING','IMPORTED_DATASET')));

-- A scored survey stores its answer key as a TOTAL_SCORE rule.
ALTER TABLE pathways.form_fields DROP CONSTRAINT form_fields_rule_kind;
ALTER TABLE pathways.form_fields ADD CONSTRAINT form_fields_rule_kind CHECK(rule IS NULL OR (jsonb_typeof(rule)='object'
  AND coalesce(rule ->> 'kind','') IN ('AGE_AT_DATE','MINOR_AT_DATE','WASHINGTON_GROUP_DISABILITY','SAME_ANSWER_AS',
   'AGE_CHECK','FOLLOW_UP_OF','ID_FROM_INITIALS_AND_BIRTH_DATE','TOTAL_SCORE')));

-- The 0034 body with an IMPORTED_DATASET branch placed ahead of the unchanged direct-entry check.
CREATE OR REPLACE FUNCTION pathways.p34_guard_survey_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $survey_subject$
BEGIN
  IF TG_OP='UPDATE' AND NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id THEN
    RAISE EXCEPTION 'Survey contributor cannot be retargeted' USING ERRCODE='23514';
  END IF;
  IF NEW.beneficiary_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.source='IMPORTED_DATASET' THEN -- 0083: imports.process and an enrollment of any status
    IF session_user<>'pathways_runtime'
       OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
       OR NEW.submitted_by_id IS DISTINCT FROM pathways.runtime_context_user()
       OR NEW.enrollment_id IS NOT NULL
       OR NOT pathways.p05_has_project_permission('imports.process',NEW.project_id)
       OR NOT pathways.p05_has_project_permission('beneficiaries.records.read',NEW.project_id)
       OR NOT EXISTS(SELECT FROM pathways.digital_forms f
         WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id
           AND f.id=NEW.form_id AND f.version=NEW.form_version
           AND f.form_type='TRAINING_SURVEY' AND f.status='PUBLISHED')
       OR NOT EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e
         JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
         WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
           AND e.beneficiary_id=NEW.beneficiary_id
           AND b.subject_type='INDIVIDUAL' AND NOT b.is_dummy_record AND b.archived_at IS NULL
           AND b.consent_recorded AND b.data_processing_consent_recorded)
    THEN RAISE EXCEPTION 'Current identified survey contributor unavailable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF session_user<>'pathways_runtime'
     OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
     OR NEW.submitted_by_id IS DISTINCT FROM pathways.runtime_context_user()
     OR NEW.enrollment_id IS NOT NULL OR NEW.source<>'DIRECT_ENCODING'
     OR NOT pathways.p05_has_project_permission('submissions.write',NEW.project_id)
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.read',NEW.project_id)
     OR NOT EXISTS(SELECT FROM pathways.digital_forms f
       WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id
         AND f.id=NEW.form_id AND f.version=NEW.form_version
         AND f.form_type='TRAINING_SURVEY' AND f.status='PUBLISHED')
     OR NOT EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e
       JOIN pathways.beneficiaries b ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
       WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
         AND e.beneficiary_id=NEW.beneficiary_id AND e.status='ACTIVE' AND e.ended_date IS NULL
         AND b.subject_type='INDIVIDUAL' AND NOT b.is_dummy_record AND b.archived_at IS NULL
         AND b.consent_recorded AND b.data_processing_consent_recorded)
  THEN RAISE EXCEPTION 'Current identified survey contributor unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$survey_subject$;

-- The 0071 body with one more accepted source: a submission that names no enrollment but the enrollment's beneficiary.
CREATE OR REPLACE FUNCTION pathways.p3_guard_assessment_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE submission pathways.form_submissions; form pathways.digital_forms;
BEGIN
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recorded assessment provenance is immutable';
 END IF;
 IF NEW.source_submission_id IS NOT NULL THEN
  SELECT * INTO submission FROM pathways.form_submissions WHERE id=NEW.source_submission_id FOR SHARE;
  IF NOT FOUND OR submission.organization_id<>NEW.organization_id OR submission.project_id<>NEW.project_id
   OR submission.status NOT IN ('VALIDATED','PROCESSED') OR submission.is_dummy_record
   OR (submission.enrollment_id IS DISTINCT FROM NEW.enrollment_id
    AND NOT (submission.enrollment_id IS NULL AND submission.beneficiary_id IS NOT NULL -- 0083
     AND submission.beneficiary_id IS NOT DISTINCT FROM (SELECT e.beneficiary_id FROM pathways.beneficiary_project_enrollments e
      WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id AND e.id=NEW.enrollment_id))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Source must be a validated nondummy submission for this scope and enrollment';
  END IF;
  SELECT * INTO form FROM pathways.digital_forms WHERE id=submission.form_id FOR SHARE;
  IF form.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Assessment/evidence activity must agree with its source form';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- The 0080 body of p03_assert_processed_row; an unchanged survey row of a file part also needs no submission (marked 0083).
CREATE OR REPLACE FUNCTION pathways.p03_assert_processed_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE target_form_type pathways.form_type; target_submission uuid; target_enrollment uuid; target_beneficiary uuid;
BEGIN
  IF NEW.status<>'PROCESSED' THEN RETURN NULL; END IF;
  SELECT f.form_type,s.id,s.enrollment_id,e.beneficiary_id
  INTO target_form_type,target_submission,target_enrollment,target_beneficiary
  FROM pathways.form_submissions s
  JOIN pathways.digital_forms f ON f.organization_id=s.organization_id
    AND f.project_id=s.project_id AND f.id=s.form_id AND f.version=s.form_version
  LEFT JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=s.organization_id
    AND e.project_id=s.project_id AND e.id=s.enrollment_id
  WHERE s.import_row_id=NEW.id AND s.import_batch_id=NEW.import_batch_id
    AND s.organization_id=NEW.organization_id AND s.project_id=NEW.project_id
    AND s.form_id=NEW.form_id AND s.source='IMPORTED_DATASET'
    AND s.status IN ('VALIDATED','PROCESSED');
  IF target_submission IS NULL THEN
    IF NEW.registration_outcome='UNCHANGED' AND (EXISTS (
      SELECT FROM pathways.digital_forms f
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=f.organization_id AND e.project_id=f.project_id
      WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id AND f.id=NEW.form_id
        AND f.form_type='BENEFICIARY_REGISTRATION' AND e.beneficiary_id=NEW.matched_beneficiary_id
    ) OR EXISTS ( -- 0083: a row of a file part whose person is enrolled in the batch's project
      SELECT FROM pathways.data_import_batches b
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=b.organization_id AND e.project_id=b.project_id
      WHERE b.id=NEW.import_batch_id AND b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id
        AND b.parent_batch_id IS NOT NULL AND e.beneficiary_id=NEW.matched_beneficiary_id
    )) THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'Processed row requires one normalized submission';
  END IF;
  IF target_form_type='BENEFICIARY_REGISTRATION' AND (
    target_enrollment IS NULL OR target_beneficiary IS NULL
    OR NOT EXISTS (SELECT FROM pathways.beneficiary_consent_records c WHERE c.submission_id=target_submission AND c.kind='PARTICIPATION')
    OR NOT EXISTS (SELECT FROM pathways.beneficiary_consent_records c WHERE c.submission_id=target_submission AND c.kind='DATA_PROCESSING')
  ) THEN RAISE EXCEPTION 'Processed registration requires profile, enrollment and consent provenance'; END IF;
  IF target_form_type='ACTIVITY_MONITORING' AND (
    target_enrollment IS NULL OR NOT EXISTS (
      SELECT FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_journey_events e ON e.participation_id=p.id
        AND e.organization_id=p.organization_id AND e.project_id=p.project_id
        AND e.enrollment_id=p.enrollment_id AND e.activity_id=p.activity_id
      WHERE p.source_submission_id=target_submission AND p.enrollment_id=target_enrollment
    )
  ) THEN RAISE EXCEPTION 'Processed participation requires enrollment, participation and journey effects'; END IF;
  RETURN NULL;
END
$$;

-- Postconditions: columns, constraints, index, the four guards unchanged in shape and still bound to their triggers.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.data_import_batches'::pg_catalog.regclass
   AND NOT a.attisdropped AND NOT a.attnotnull AND ((a.attname='parent_batch_id' AND a.atttypid='uuid'::pg_catalog.regtype)
    OR (a.attname='part_code' AND a.atttypid='text'::pg_catalog.regtype) OR (a.attname='file_parts' AND a.atttypid='jsonb'::pg_catalog.regtype)))<>3
 OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.data_import_batches'::pg_catalog.regclass AND c.convalidated
   AND c.conname IN ('data_import_batches_part_shape','data_import_batches_parent_fk'))<>2
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
   WHERE i.indrelid='pathways.data_import_batches'::pg_catalog.regclass AND c.relname='data_import_batches_part_key'
    AND i.indisunique AND i.indisvalid AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) LIKE '%FAILED%')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.form_submissions'::pg_catalog.regclass
   AND c.conname='p34_survey_subject_shape' AND c.convalidated AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%IMPORTED_DATASET%')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.form_fields'::pg_catalog.regclass
   AND c.conname='form_fields_rule_kind' AND c.convalidated AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TOTAL_SCORE%')
 THEN RAISE EXCEPTION '0083 table postconditions failed'; END IF;
 IF (SELECT count(*) FROM (VALUES ('pathways.p03_guard_import_batch()',false),('pathways.p34_guard_survey_subject()',false),
    ('pathways.p3_guard_assessment_source()',true),('pathways.p03_assert_processed_row()',false)) w(sig,secdef)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.secdef AND p.proconfig=ARRAY['search_path=""']
    AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    AND p.prosrc LIKE '%0083%')<>4
 OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgenabled='O' AND NOT t.tgisinternal AND (
   (t.tgname='p03_guard_import_batch' AND t.tgrelid='pathways.data_import_batches'::pg_catalog.regclass
     AND t.tgfoid='pathways.p03_guard_import_batch()'::pg_catalog.regprocedure)
   OR (t.tgname='p34_guard_survey_subject' AND t.tgrelid='pathways.form_submissions'::pg_catalog.regclass
     AND t.tgfoid='pathways.p34_guard_survey_subject()'::pg_catalog.regprocedure)
   OR (t.tgname='p3_30_source' AND t.tgrelid='pathways.assessment_results'::pg_catalog.regclass
     AND t.tgfoid='pathways.p3_guard_assessment_source()'::pg_catalog.regprocedure)
   OR (t.tgname='p03_row_complete' AND t.tgrelid='pathways.data_import_rows'::pg_catalog.regclass
     AND t.tgfoid='pathways.p03_assert_processed_row()'::pg_catalog.regprocedure AND t.tgdeferrable)))<>4
 THEN RAISE EXCEPTION '0083 guard postconditions failed'; END IF;
END $$;
COMMIT;
