-- Consolidated final state of immutable 0001-0026; provenance: ../history/through-0026.json.
-- FRESH DATABASES ONLY. Existing databases register this baseline; never execute it there.
-- Requires an administrator for portable prisma/postgres object ownership and provider prerequisites.
BEGIN;
DO $$ BEGIN
 IF current_user <> 'postgres' OR to_regnamespace('pathways') IS NOT NULL
 OR to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='prisma') THEN
   RAISE EXCEPTION 'Baseline requires empty domain, administrator, and provider prerequisites'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='pathways_runtime') THEN
   CREATE ROLE pathways_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
 THEN RAISE EXCEPTION 'Runtime role privilege drift'; END IF;
END $$;
SET LOCAL ROLE prisma;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
RESET ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE USAGE ON TYPES FROM PUBLIC;


SET LOCAL statement_timeout = 0;
SET LOCAL lock_timeout = 0;
SET LOCAL idle_in_transaction_session_timeout = 0;
SET LOCAL client_encoding = 'UTF8';
SET LOCAL standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', true);
SET LOCAL check_function_bodies = false;
SET LOCAL xmloption = content;
SET LOCAL client_min_messages = warning;
SET LOCAL row_security = off;

CREATE SCHEMA pathways;

ALTER SCHEMA pathways OWNER TO prisma;

CREATE SCHEMA IF NOT EXISTS public;

ALTER SCHEMA public OWNER TO pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TYPE pathways.account_status AS ENUM (
    'INVITED',
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED',
    'ARCHIVED'
);

ALTER TYPE pathways.account_status OWNER TO prisma;

CREATE TYPE pathways.activity_assignment_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'REMOVED'
);

ALTER TYPE pathways.activity_assignment_status OWNER TO prisma;

CREATE TYPE pathways.activity_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'FOR_REVIEW',
    'COMPLETED',
    'CANCELLED'
);

ALTER TYPE pathways.activity_status OWNER TO prisma;

CREATE TYPE pathways.alert_rule_type AS ENUM (
    'UNDERPERFORMING_INDICATOR',
    'DELAYED_TIMELINE',
    'BUDGET_CONCERN',
    'BENEFICIARY_PROGRESS_ISSUE',
    'SURVEY_IMPROVEMENT',
    'MISSING_FOLLOW_UP',
    'WEAK_OUTCOME_INDICATOR',
    'COMBINED_CONDITION'
);

ALTER TYPE pathways.alert_rule_type OWNER TO prisma;

CREATE TYPE pathways.alert_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

ALTER TYPE pathways.alert_severity OWNER TO prisma;

CREATE TYPE pathways.assessment_type AS ENUM (
    'PRE_TEST',
    'POST_TEST',
    'OUTCOME_SURVEY',
    'FEEDBACK_SURVEY',
    'OTHER'
);

ALTER TYPE pathways.assessment_type OWNER TO prisma;

CREATE TYPE pathways.assignment_status AS ENUM (
    'ACTIVE',
    'ENDED'
);

ALTER TYPE pathways.assignment_status OWNER TO prisma;

CREATE TYPE pathways.attendance_status AS ENUM (
    'PRESENT',
    'ABSENT',
    'COMPLETED',
    'NOT_COMPLETED',
    'EXCUSED'
);

ALTER TYPE pathways.attendance_status OWNER TO prisma;

CREATE TYPE pathways.beneficiary_consent_kind AS ENUM (
    'PARTICIPATION',
    'DATA_PROCESSING',
    'GUARDIAN'
);

ALTER TYPE pathways.beneficiary_consent_kind OWNER TO prisma;

CREATE TYPE pathways.beneficiary_record_source AS ENUM (
    'DIRECT_ENTRY',
    'IMPORTED_DATASET'
);

ALTER TYPE pathways.beneficiary_record_source OWNER TO prisma;

CREATE TYPE pathways.beneficiary_sex AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER',
    'PREFER_NOT_TO_SAY',
    'NOT_SPECIFIED'
);

ALTER TYPE pathways.beneficiary_sex OWNER TO prisma;

CREATE TYPE pathways.beneficiary_subject_type AS ENUM (
    'INDIVIDUAL',
    'GROUP',
    'COMMUNITY',
    'UNSPECIFIED_LEGACY'
);

ALTER TYPE pathways.beneficiary_subject_type OWNER TO prisma;

CREATE TYPE pathways.criterion_type AS ENUM (
    'KPI',
    'TIMELINE_COMPLIANCE',
    'BUDGET_EFFICIENCY',
    'BENEFICIARY_REACH',
    'OTHER'
);

ALTER TYPE pathways.criterion_type OWNER TO prisma;

CREATE TYPE pathways.decision_outcome AS ENUM (
    'ACCEPT',
    'PARTIALLY_ACCEPT',
    'DECLINE',
    'ESCALATE'
);

ALTER TYPE pathways.decision_outcome OWNER TO prisma;

CREATE TYPE pathways.decision_status AS ENUM (
    'NEW',
    'REVIEWED',
    'RESOLVED',
    'DISMISSED'
);

ALTER TYPE pathways.decision_status OWNER TO prisma;

CREATE TYPE pathways.definition_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

ALTER TYPE pathways.definition_status OWNER TO prisma;

CREATE TYPE pathways.disability_status AS ENUM (
    'WITH_DISABILITY',
    'WITHOUT_DISABILITY',
    'NOT_SPECIFIED'
);

ALTER TYPE pathways.disability_status OWNER TO prisma;

CREATE TYPE pathways.enrollment_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'DROPPED',
    'TRANSFERRED',
    'INACTIVE'
);

ALTER TYPE pathways.enrollment_status OWNER TO prisma;

CREATE TYPE pathways.evaluation_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'REVIEWED',
    'SIGNED_OFF',
    'ARCHIVED'
);

ALTER TYPE pathways.evaluation_status OWNER TO prisma;

CREATE TYPE pathways.evidence_type AS ENUM (
    'DOCUMENT',
    'PHOTO',
    'VIDEO',
    'PROGRESS_PROOF',
    'COMPLETION_PROOF',
    'OTHER'
);

ALTER TYPE pathways.evidence_type OWNER TO prisma;

CREATE TYPE pathways.field_data_type AS ENUM (
    'TEXT',
    'INTEGER',
    'DECIMAL',
    'DATE',
    'BOOLEAN',
    'SELECT',
    'MULTIPLE_SELECT',
    'LONG_TEXT'
);

ALTER TYPE pathways.field_data_type OWNER TO prisma;

CREATE TYPE pathways.form_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

ALTER TYPE pathways.form_status OWNER TO prisma;

CREATE TYPE pathways.form_type AS ENUM (
    'BENEFICIARY_REGISTRATION',
    'TRAINING_SURVEY',
    'PRE_TEST',
    'POST_TEST',
    'OUTCOME_MONITORING',
    'ACTIVITY_MONITORING',
    'OTHER'
);

ALTER TYPE pathways.form_type OWNER TO prisma;

CREATE TYPE pathways.import_file_type AS ENUM (
    'CSV',
    'XLSX',
    'XLS',
    'JSON',
    'OTHER'
);

ALTER TYPE pathways.import_file_type OWNER TO prisma;

CREATE TYPE pathways.import_row_status AS ENUM (
    'PENDING',
    'VALID',
    'INVALID',
    'PROCESSING',
    'UNPROCESSED',
    'PROCESSED',
    'FAILED'
);

ALTER TYPE pathways.import_row_status OWNER TO prisma;

CREATE TYPE pathways.import_source AS ENUM (
    'KOBO',
    'SPREADSHEET',
    'MANUAL_UPLOAD',
    'OTHER'
);

ALTER TYPE pathways.import_source OWNER TO prisma;

CREATE TYPE pathways.import_status AS ENUM (
    'UPLOADING',
    'UPLOADED',
    'MAPPED',
    'VALIDATED',
    'PROCESSING',
    'PARTIALLY_PROCESSED',
    'PROCESSED',
    'RECOVERY_REQUIRED',
    'FAILED'
);

ALTER TYPE pathways.import_status OWNER TO prisma;

CREATE TYPE pathways.import_storage_status AS ENUM (
    'RESERVED',
    'STORED',
    'RECOVERY_REQUIRED',
    'FAILED'
);

ALTER TYPE pathways.import_storage_status OWNER TO prisma;

CREATE TYPE pathways.indicator_status AS ENUM (
    'NOT_STARTED',
    'ON_TRACK',
    'AT_RISK',
    'UNDERPERFORMING',
    'ACHIEVED'
);

ALTER TYPE pathways.indicator_status OWNER TO prisma;

CREATE TYPE pathways.indicator_type AS ENUM (
    'OUTPUT',
    'OUTCOME',
    'ACTIVITY',
    'BUDGET',
    'TIMELINE',
    'PARTICIPATION',
    'SURVEY_SCORE'
);

ALTER TYPE pathways.indicator_type OWNER TO prisma;

CREATE TYPE pathways.indicator_unit AS ENUM (
    'COUNT',
    'PERCENTAGE',
    'SCORE',
    'AMOUNT',
    'OTHER'
);

ALTER TYPE pathways.indicator_unit OWNER TO prisma;

CREATE TYPE pathways.journey_event_type AS ENUM (
    'ENROLLMENT',
    'PARTICIPATION',
    'PROGRESS_UPDATE',
    'COMPLETION',
    'FOLLOW_UP',
    'DROPOUT',
    'TRANSFER'
);

ALTER TYPE pathways.journey_event_type OWNER TO prisma;

CREATE TYPE pathways.journey_stage_type AS ENUM (
    'ENTRY',
    'CORE',
    'BRANCH',
    'FOLLOW_UP'
);

ALTER TYPE pathways.journey_stage_type OWNER TO prisma;

CREATE TYPE pathways.mapping_status AS ENUM (
    'PENDING',
    'MAPPED',
    'INVALID',
    'IGNORED'
);

ALTER TYPE pathways.mapping_status OWNER TO prisma;

CREATE TYPE pathways.milestone_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

ALTER TYPE pathways.milestone_status OWNER TO prisma;

CREATE TYPE pathways.organization_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED'
);

ALTER TYPE pathways.organization_status OWNER TO prisma;

CREATE TYPE pathways.profile_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED'
);

ALTER TYPE pathways.profile_status OWNER TO prisma;

CREATE TYPE pathways.program_status AS ENUM (
    'PLANNED',
    'ONGOING',
    'COMPLETED',
    'ON_HOLD',
    'CANCELLED'
);

ALTER TYPE pathways.program_status OWNER TO prisma;

CREATE TYPE pathways.progress_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'NEEDS_FOLLOW_UP'
);

ALTER TYPE pathways.progress_status OWNER TO prisma;

CREATE TYPE pathways.project_status AS ENUM (
    'PLANNED',
    'ONGOING',
    'COMPLETED',
    'ON_HOLD',
    'CANCELLED'
);

ALTER TYPE pathways.project_status OWNER TO prisma;

CREATE TYPE pathways.public_visibility_status AS ENUM (
    'PRIVATE',
    'FOR_REVIEW',
    'APPROVED',
    'PUBLISHED'
);

ALTER TYPE pathways.public_visibility_status OWNER TO prisma;

CREATE TYPE pathways.recommendation_basis AS ENUM (
    'BUDGET',
    'KPI',
    'SURVEY_IMPROVEMENT',
    'TIMELINE',
    'BENEFICIARY_PROGRESS',
    'COMBINED'
);

ALTER TYPE pathways.recommendation_basis OWNER TO prisma;

CREATE TYPE pathways.recommendation_type AS ENUM (
    'SUGGESTED_ACTION',
    'PRIORITY_FLAG',
    'REVIEW_PROMPT',
    'FUTURE_PROJECT_SUGGESTION'
);

ALTER TYPE pathways.recommendation_type OWNER TO prisma;

CREATE TYPE pathways.report_format AS ENUM (
    'PDF',
    'XLSX',
    'CSV'
);

ALTER TYPE pathways.report_format OWNER TO prisma;

CREATE TYPE pathways.report_status AS ENUM (
    'DRAFT',
    'GENERATED',
    'ARCHIVED'
);

ALTER TYPE pathways.report_status OWNER TO prisma;

CREATE TYPE pathways.report_type AS ENUM (
    'PROJECT_SUMMARY',
    'INDICATOR_SUMMARY',
    'BENEFICIARY_SUMMARY',
    'SURVEY_FORM_RESULTS',
    'EVALUATION_REPORT',
    'MONITORING_REPORT',
    'OTHER'
);

ALTER TYPE pathways.report_type OWNER TO prisma;

CREATE TYPE pathways.review_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'APPROVED',
    'REJECTED'
);

ALTER TYPE pathways.review_status OWNER TO prisma;

CREATE TYPE pathways.rule_match_mode AS ENUM (
    'ALL',
    'ANY'
);

ALTER TYPE pathways.rule_match_mode OWNER TO prisma;

CREATE TYPE pathways.rule_metric AS ENUM (
    'KPI_ACHIEVEMENT_PERCENT',
    'TIMELINE_DELAY_DAYS',
    'BUDGET_UTILIZATION_PERCENT',
    'BENEFICIARY_PROGRESS_PERCENT',
    'SURVEY_IMPROVEMENT_PERCENT',
    'MISSING_FOLLOW_UP_COUNT',
    'OUTCOME_SCORE',
    'REMAINING_BUDGET'
);

ALTER TYPE pathways.rule_metric OWNER TO prisma;

CREATE TYPE pathways.rule_operator AS ENUM (
    'LT',
    'LTE',
    'EQ',
    'GTE',
    'GT',
    'BETWEEN'
);

ALTER TYPE pathways.rule_operator OWNER TO prisma;

CREATE TYPE pathways.rule_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);

ALTER TYPE pathways.rule_status OWNER TO prisma;

CREATE TYPE pathways.submission_source AS ENUM (
    'DIRECT_ENCODING',
    'IMPORTED_DATASET'
);

ALTER TYPE pathways.submission_source OWNER TO prisma;

CREATE TYPE pathways.submission_status AS ENUM (
    'DRAFT',
    'VALIDATED',
    'PROCESSED',
    'REJECTED'
);

ALTER TYPE pathways.submission_status OWNER TO prisma;

CREATE FUNCTION pathways.p02_guard_direct_submission() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.source <> 'DIRECT_ENCODING' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.source <> 'DIRECT_ENCODING' OR NEW.status <> 'DRAFT'
       OR NEW.import_batch_id IS NOT NULL OR NEW.import_row_id IS NOT NULL
       OR NEW.enrollment_id IS NOT NULL OR NEW.submitted_at IS NOT NULL
       OR NEW.validated_by_id IS NOT NULL OR NEW.validated_at IS NOT NULL
       OR NEW.processed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Direct-entry drafts must start in the draft state';
    END IF;
    IF NOT EXISTS (
      SELECT FROM pathways.digital_forms f
      WHERE f.organization_id=NEW.organization_id
        AND f.project_id=NEW.project_id
        AND f.id=NEW.form_id AND f.version=NEW.form_version
        AND f.status='PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'Direct-entry drafts require a published form version';
    END IF;
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
  ) THEN
    RAISE EXCEPTION 'Final submission requires validation provenance';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p02_guard_direct_submission() OWNER TO prisma;

CREATE FUNCTION pathways.p03_assert_processed_row() RETURNS trigger
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
  IF target_submission IS NULL THEN RAISE EXCEPTION 'Processed row requires one normalized submission'; END IF;
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

ALTER FUNCTION pathways.p03_assert_processed_row() OWNER TO prisma;

CREATE FUNCTION pathways.p03_guard_import_batch() RETURNS trigger
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

ALTER FUNCTION pathways.p03_guard_import_batch() OWNER TO prisma;

CREATE FUNCTION pathways.p03_guard_import_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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
$$;

ALTER FUNCTION pathways.p03_guard_import_row() OWNER TO prisma;

CREATE FUNCTION pathways.p03_guard_mapping() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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
$$;

ALTER FUNCTION pathways.p03_guard_mapping() OWNER TO prisma;

CREATE FUNCTION pathways.p03_guard_submission() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  target_form_type pathways.form_type;
BEGIN
  SELECT f.form_type
  INTO target_form_type
  FROM pathways.digital_forms f
  WHERE f.organization_id = NEW.organization_id
    AND f.project_id = NEW.project_id
    AND f.id = NEW.form_id
    AND f.version = NEW.form_version
    AND f.status IN ('PUBLISHED', 'ARCHIVED');

  IF target_form_type IS NULL THEN
    RAISE EXCEPTION 'Submission requires a published pinned form version';
  END IF;

  IF target_form_type NOT IN (
    'BENEFICIARY_REGISTRATION',
    'ACTIVITY_MONITORING'
  )
     AND NEW.enrollment_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'This form type cannot reference an enrollment';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'DIRECT_ENCODING' THEN
      IF NEW.status <> 'DRAFT'
         OR NEW.import_batch_id IS NOT NULL
         OR NEW.import_row_id IS NOT NULL
         OR NEW.submitted_at IS NOT NULL
         OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL
         OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL
         OR (
           target_form_type = 'BENEFICIARY_REGISTRATION'
           AND NEW.enrollment_id IS NULL
         )
         OR (
           target_form_type <> 'BENEFICIARY_REGISTRATION'
           AND NEW.enrollment_id IS NOT NULL
         )
      THEN
        RAISE EXCEPTION 'Direct-entry drafts must start in the draft state';
      END IF;

    ELSIF NEW.source = 'IMPORTED_DATASET' THEN
      IF NEW.status <> 'DRAFT'
         OR NEW.import_batch_id IS NULL
         OR NEW.import_row_id IS NULL
         OR NEW.submitted_at IS NOT NULL
         OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL
         OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL
         OR (
           target_form_type = 'BENEFICIARY_REGISTRATION'
           AND NEW.enrollment_id IS NULL
         )
         OR (
           target_form_type <> 'BENEFICIARY_REGISTRATION'
           AND NEW.enrollment_id IS NOT NULL
         )
         OR NOT EXISTS (
           SELECT 1
           FROM pathways.data_import_rows r
           JOIN pathways.data_import_batches b
             ON b.id = r.import_batch_id
           WHERE r.organization_id = NEW.organization_id
             AND r.project_id = NEW.project_id
             AND r.form_id = NEW.form_id
             AND r.id = NEW.import_row_id
             AND r.import_batch_id = NEW.import_batch_id
             AND r.status = 'PROCESSING'
             AND b.form_version = NEW.form_version
             AND b.status = 'PROCESSING'
             AND b.validated_mapping_revision = b.mapping_revision
         )
      THEN
        RAISE EXCEPTION
          'Imported submissions require a currently reviewed processing row';
      END IF;

    ELSE
      RAISE EXCEPTION 'Submission source is unsupported';
    END IF;

    IF target_form_type = 'BENEFICIARY_REGISTRATION'
       AND NOT EXISTS (
         SELECT 1
         FROM pathways.beneficiary_project_enrollments e
         WHERE e.organization_id = NEW.organization_id
           AND e.project_id = NEW.project_id
           AND e.id = NEW.enrollment_id
       )
    THEN
      RAISE EXCEPTION
        'Registration enrollment is outside submission scope';
    END IF;

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
     OR NEW.is_dummy_record IS DISTINCT FROM OLD.is_dummy_record
     OR NEW.status NOT IN ('DRAFT', 'VALIDATED')
     OR (
       NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
       AND NOT (
         target_form_type = 'ACTIVITY_MONITORING'
         AND OLD.enrollment_id IS NULL
         AND NEW.enrollment_id IS NOT NULL
         AND NEW.status = 'VALIDATED'
       )
     )
  THEN
    RAISE EXCEPTION
      'Submitted records and pinned form versions are immutable';
  END IF;

  IF NEW.status = 'VALIDATED'
     AND (
       NEW.submitted_at IS NULL
       OR NEW.validated_by_id IS NULL
       OR NEW.validated_at IS NULL

       OR (
         target_form_type IN (
           'BENEFICIARY_REGISTRATION',
           'ACTIVITY_MONITORING'
         )
         AND NEW.enrollment_id IS NULL
       )

       OR (
         target_form_type = 'ACTIVITY_MONITORING'
         AND NOT EXISTS (
           SELECT 1
           FROM pathways.beneficiary_activity_participations p
           JOIN pathways.beneficiary_journey_events e
             ON e.organization_id = p.organization_id
            AND e.project_id = p.project_id
            AND e.enrollment_id = p.enrollment_id
            AND e.activity_id = p.activity_id
            AND e.participation_id = p.id
           WHERE p.organization_id = NEW.organization_id
             AND p.project_id = NEW.project_id
             AND p.source_submission_id = NEW.id
             AND p.enrollment_id = NEW.enrollment_id
         )
       )
     )
  THEN
    RAISE EXCEPTION
      'Final domain submission requires validation and domain provenance';
  END IF;

  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p03_guard_submission() OWNER TO prisma;

CREATE FUNCTION pathways.p04_can_insert_enrollment(requested_project uuid, requested_beneficiary uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM pathways.beneficiaries b
 WHERE b.id=requested_beneficiary AND b.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid AND b.archived_at IS NULL
 AND ((pathways.p05_has_project_permission('beneficiaries.enrollments.manage',requested_project)
   AND (EXISTS(SELECT FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid AND r.code='SYSTEM_ADMINISTRATOR')
        OR EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=b.organization_id AND e.beneficiary_id=b.id AND pathways.p05_has_project_permission('beneficiaries.enrollments.manage',e.project_id))))
  OR (pathways.p05_has_project_permission('beneficiaries.records.register',requested_project)
      AND b.created_by_id=nullif(current_setting('app.user_id',true),'')::uuid
      AND NOT EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=b.organization_id AND e.beneficiary_id=b.id))))
$$;

ALTER FUNCTION pathways.p04_can_insert_enrollment(requested_project uuid, requested_beneficiary uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p04_can_mutate_beneficiary(requested_permission text, requested_beneficiary uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT r.code='SYSTEM_ADMINISTRATOR' OR NOT EXISTS (
      SELECT FROM pathways.beneficiary_project_enrollments e
      WHERE e.organization_id=u.organization_id AND e.beneficiary_id=requested_beneficiary
        AND e.status='ACTIVE'
        AND NOT pathways.p04_has_project_permission(requested_permission,e.project_id)
    )
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id AND p.code=requested_permission
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
    LIMIT 1
  ),false)
$$;

ALTER FUNCTION pathways.p04_can_mutate_beneficiary(requested_permission text, requested_beneficiary uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p04_can_read_beneficiary(requested_beneficiary uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT true
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id
      AND p.code='beneficiaries.records.read'
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
      AND (
        r.code='SYSTEM_ADMINISTRATOR'
        OR EXISTS (
          SELECT FROM pathways.role_permissions review_rp
          JOIN pathways.permissions review_p ON review_p.id=review_rp.permission_id
          WHERE review_rp.role_id=r.id AND review_p.code='beneficiaries.identities.review'
        )
        OR EXISTS (
          SELECT FROM pathways.beneficiary_project_enrollments e
          JOIN pathways.user_project_assignments a
            ON a.organization_id=e.organization_id AND a.project_id=e.project_id
           AND a.user_id=u.id AND a.status='ACTIVE' AND a.ended_at IS NULL
          WHERE e.organization_id=u.organization_id AND e.beneficiary_id=requested_beneficiary
        )
      )
    LIMIT 1
  ),false)
$$;

ALTER FUNCTION pathways.p04_can_read_beneficiary(requested_beneficiary uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p04_guard_beneficiary() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.subject_type='UNSPECIFIED_LEGACY'
       OR NEW.code !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'
       OR NEW.created_by_id IS DISTINCT FROM pathways.runtime_context_user()
       OR NEW.status<>'ACTIVE' OR NEW.archived_at IS NOT NULL
       OR NOT NEW.consent_recorded OR NOT NEW.data_processing_consent_recorded THEN
      RAISE EXCEPTION 'New Beneficiary requires canonical identity and explicit consent';
    END IF;
    IF NOT EXISTS (
      SELECT FROM pathways.projects p WHERE p.organization_id=NEW.organization_id
        AND pathways.p04_has_project_permission('beneficiaries.records.register',p.id)
    ) THEN RAISE EXCEPTION 'Beneficiary registration permission is missing'; END IF;
  ELSIF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.consent_recorded IS DISTINCT FROM OLD.consent_recorded
     OR NEW.data_processing_consent_recorded IS DISTINCT FROM OLD.data_processing_consent_recorded
     OR NEW.is_minor IS DISTINCT FROM OLD.is_minor
     OR NEW.guardian_consent_recorded IS DISTINCT FROM OLD.guardian_consent_recorded
     OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Beneficiary identity and consent facts are immutable';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status<>'ARCHIVED' AND NEW.status='ARCHIVED' THEN
      IF NOT pathways.p04_can_mutate_beneficiary('beneficiaries.records.archive',OLD.id)
         OR to_jsonb(NEW)-ARRAY['status','archived_at','updated_at']
            IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','archived_at','updated_at'] THEN
        RAISE EXCEPTION 'Archive requires dedicated authority and cannot alter profile fields';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NOT pathways.p04_can_mutate_beneficiary('beneficiaries.profiles.update',OLD.id) THEN
      RAISE EXCEPTION 'Profile update authority is missing or lifecycle mutation is invalid';
    END IF;
  END IF;
  IF NEW.subject_type='INDIVIDUAL' AND (
    NULLIF(btrim(NEW.first_name),'') IS NULL OR NULLIF(btrim(NEW.last_name),'') IS NULL
  ) THEN RAISE EXCEPTION 'Individual profiles require names'; END IF;
  IF NEW.subject_type IN ('GROUP','COMMUNITY') AND (
    NULLIF(btrim(NEW.display_name),'') IS NULL OR NEW.first_name IS NOT NULL
    OR NEW.middle_name IS NOT NULL OR NEW.last_name IS NOT NULL OR NEW.birth_date IS NOT NULL
    OR NEW.age_at_registration IS NOT NULL OR NEW.is_minor OR NEW.guardian_consent_recorded
    OR NEW.sex<>'NOT_SPECIFIED'
  ) THEN RAISE EXCEPTION 'Group/community profiles cannot contain person-only demographics'; END IF;
  IF NEW.is_minor IS DISTINCT FROM NEW.guardian_consent_recorded THEN
    RAISE EXCEPTION 'Guardian consent must match explicit minor status';
  END IF;
  RETURN NEW;
END
$_$;

ALTER FUNCTION pathways.p04_guard_beneficiary() OWNER TO prisma;

CREATE FUNCTION pathways.p04_guard_consent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE profile pathways.beneficiaries%ROWTYPE; enrollment pathways.beneficiary_project_enrollments%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Consent provenance is append-only'; END IF;
  IF NEW.recorded_by_id IS DISTINCT FROM pathways.runtime_context_user() THEN
    RAISE EXCEPTION 'Consent recorder must be the current actor';
  END IF;
  IF NOT pathways.p04_has_project_permission('beneficiaries.records.register',NEW.project_id) THEN
    RAISE EXCEPTION 'Consent recording permission is missing';
  END IF;
  SELECT * INTO profile FROM pathways.beneficiaries
    WHERE organization_id=NEW.organization_id AND id=NEW.beneficiary_id FOR SHARE;
  SELECT * INTO enrollment FROM pathways.beneficiary_project_enrollments
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.enrollment_id AND beneficiary_id=NEW.beneficiary_id FOR SHARE;
  IF profile.id IS NULL OR enrollment.id IS NULL OR NOT profile.consent_recorded
     OR NOT profile.data_processing_consent_recorded
     OR (NEW.kind='GUARDIAN' AND (NOT profile.is_minor OR NOT profile.guardian_consent_recorded)) THEN
    RAISE EXCEPTION 'Consent provenance does not match profile and enrollment';
  END IF;
  IF profile.subject_type='INDIVIDUAL'
     AND (profile.birth_date IS NOT NULL OR profile.age_at_registration IS NOT NULL)
     AND profile.is_minor IS DISTINCT FROM (COALESCE(
       EXTRACT(year FROM age(enrollment.enrollment_date,profile.birth_date))::integer,
       profile.age_at_registration
     ) < 18) THEN
    RAISE EXCEPTION 'Minor status must agree with age at enrollment';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p04_guard_consent() OWNER TO prisma;

CREATE FUNCTION pathways.p04_guard_identifier() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stable Beneficiary identifiers are immutable'; END IF;
  IF NEW.created_by_id IS DISTINCT FROM pathways.runtime_context_user() THEN
    RAISE EXCEPTION 'Identifier creator must be the current actor';
  END IF;
  IF NOT pathways.p04_can_read_beneficiary(NEW.beneficiary_id) THEN
    RAISE EXCEPTION 'Identifier target is outside authorized detail scope';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p04_guard_identifier() OWNER TO prisma;

CREATE FUNCTION pathways.p04_has_project_permission(requested_permission text, requested_project uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT pathways.p05_has_project_permission(requested_permission,requested_project)
$$;

ALTER FUNCTION pathways.p04_has_project_permission(requested_permission text, requested_project uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p05_guard_activity_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Activity update history cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
    OR NEW.client_update_id IS DISTINCT FROM OLD.client_update_id
    OR NEW.progress_percent IS DISTINCT FROM OLD.progress_percent OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status<>'PENDING'
  ) THEN
    RAISE EXCEPTION 'Activity update submission/history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION pathways.p05_guard_activity_update() OWNER TO prisma;

CREATE FUNCTION pathways.p05_guard_mapping_freeze() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE target_row pathways.activity_journey_stage_mappings;
BEGIN
  target_row:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (
    SELECT FROM pathways.beneficiary_journey_events e
    WHERE e.organization_id=target_row.organization_id AND e.project_id=target_row.project_id
  ) THEN RAISE EXCEPTION 'Used activity-stage mappings are frozen history' USING ERRCODE='23514'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

ALTER FUNCTION pathways.p05_guard_mapping_freeze() OWNER TO prisma;

CREATE FUNCTION pathways.p05_guard_stage_freeze() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE target_row pathways.journey_stages;
BEGIN
  target_row:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (
    SELECT FROM pathways.beneficiary_journey_events e
    WHERE e.organization_id=target_row.organization_id AND e.project_id=target_row.project_id
  ) AND (TG_OP<>'UPDATE' OR to_jsonb(NEW)-'updated_at'
      IS DISTINCT FROM to_jsonb(OLD)-'updated_at') THEN
    RAISE EXCEPTION 'Used journey stages are frozen history' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

ALTER FUNCTION pathways.p05_guard_stage_freeze() OWNER TO prisma;

CREATE FUNCTION pathways.p05_has_project_permission(requested_permission text, requested_project uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT true
    FROM pathways.system_users u
    JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id AND p.code=requested_permission AND p.is_active AND pathways.p09_role_allows(r.code,requested_permission)
    JOIN pathways.projects pr ON pr.organization_id=u.organization_id
      AND pr.id=requested_project AND pr.archived_at IS NULL
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
      AND (
        r.code='SYSTEM_ADMINISTRATOR'
        OR EXISTS (
          SELECT FROM pathways.user_project_assignments a
          WHERE a.organization_id=u.organization_id AND a.user_id=u.id
            AND a.project_id=requested_project AND a.status='ACTIVE' AND a.ended_at IS NULL
        )
        OR (r.code='PROGRAM_MANAGER' AND EXISTS (
          SELECT FROM pathways.programs pg
          WHERE pg.organization_id=u.organization_id AND pg.id=pr.program_id
            AND pg.manager_user_id=u.id AND pg.archived_at IS NULL
        ))
      )
    LIMIT 1
  ),false)
$$;

ALTER FUNCTION pathways.p05_has_project_permission(requested_permission text, requested_project uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p05_snapshot_journey_event() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE corrected pathways.beneficiary_journey_events;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT code,name INTO NEW.stage_code_snapshot,NEW.stage_name_snapshot
    FROM pathways.journey_stages
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.stage_id;
    IF NEW.stage_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Journey stage is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.activity_id IS NOT NULL THEN
    SELECT code,title INTO NEW.activity_code_snapshot,NEW.activity_title_snapshot
    FROM pathways.project_activities
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.activity_id AND archived_at IS NULL;
    IF NEW.activity_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Activity is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.corrects_event_id IS NOT NULL THEN
    SELECT * INTO corrected FROM pathways.beneficiary_journey_events
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.corrects_event_id;
    IF corrected.id IS NULL OR corrected.enrollment_id<>NEW.enrollment_id
       OR corrected.corrects_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Correction must reference one original event in the same enrollment' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION pathways.p05_snapshot_journey_event() OWNER TO prisma;

CREATE FUNCTION pathways.p06_age_band(born_on date, reference_on date) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN reference_on IS NULL OR NOT isfinite(reference_on) THEN NULL
    WHEN born_on IS NULL THEN 'Unknown'
    WHEN NOT isfinite(born_on) OR NOT isfinite(reference_on) OR born_on<DATE '1900-01-01' OR born_on>reference_on THEN NULL
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=9 THEN '0-9'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=14 THEN '10-14'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=17 THEN '15-17'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=24 THEN '18-24'
    ELSE '25+' END
$$;

ALTER FUNCTION pathways.p06_age_band(born_on date, reference_on date) OWNER TO prisma;

CREATE FUNCTION pathways.p06_assert_scope(wanted_org uuid, wanted_projects uuid[], permission text, start_on date, end_on date, zone text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  p uuid;
BEGIN
  IF
    wanted_org IS NULL
    OR wanted_org IS DISTINCT FROM
      nullif(current_setting('app.organization_id', true), '')::uuid
    OR wanted_projects IS NULL
    OR cardinality(wanted_projects) > 100
    OR array_position(wanted_projects, NULL) IS NOT NULL
    OR cardinality(wanted_projects) <> (
      SELECT count(DISTINCT item)
      FROM unnest(wanted_projects) item
    )
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable'
      USING ERRCODE='42501';
  END IF;

  IF
    start_on IS NULL
    OR end_on IS NULL
    OR start_on < DATE '1900-01-01'
    OR end_on > DATE '2100-12-31'
    OR end_on < start_on
    OR end_on - start_on > 365
    OR zone IS NULL
    OR length(zone) > 100
    OR NOT EXISTS (
      SELECT
      FROM pg_catalog.pg_timezone_names
      WHERE name = zone
    )
  THEN
    RAISE EXCEPTION 'Invalid bounded monitoring period'
      USING ERRCODE='22023';
  END IF;

  /*
   * Empty project scopes must still represent an authenticated,
   * active application profile with the requested permission.
   */
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users u
    JOIN pathways.roles r
      ON r.id = u.role_id
     AND r.is_active
    JOIN pathways.role_permissions rp
      ON rp.role_id = r.id
    JOIN pathways.permissions pm
      ON pm.id = rp.permission_id
     AND pm.code = permission
    WHERE
      u.id =
        nullif(current_setting('app.user_id', true), '')::uuid
      AND u.organization_id = wanted_org
      AND u.auth_user_id =
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND u.account_status = 'ACTIVE'
      AND u.archived_at IS NULL
      AND r.code IN (
        'SYSTEM_ADMINISTRATOR',
        'PROGRAM_MANAGER',
        'GRANT_MANAGER',
        'PROJECT_MANAGER',
        'MONITORING_AND_EVALUATION_OFFICER'
      )
  ) THEN
    RAISE EXCEPTION 'Monitoring permission unavailable'
      USING ERRCODE='42501';
  END IF;

  FOREACH p IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p06_can(permission, p) THEN
      RAISE EXCEPTION 'Monitoring scope unavailable'
        USING ERRCODE='42501';
    END IF;
  END LOOP;
END
$$;

ALTER FUNCTION pathways.p06_assert_scope(wanted_org uuid, wanted_projects uuid[], permission text, start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_can(requested_permission text, requested_project uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT pathways.p05_has_project_permission(requested_permission,requested_project)
$$;

ALTER FUNCTION pathways.p06_can(requested_permission text, requested_project uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p06_cell(v numeric, reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN reason IS NOT NULL THEN jsonb_build_object('state',CASE WHEN reason IN ('SMALL_COHORT','COMPLEMENTARY_SUPPRESSION') THEN 'SUPPRESSED' WHEN reason='ZERO_DENOMINATOR' THEN 'NOT_APPLICABLE' ELSE 'MISSING' END,'value',NULL,'reason',reason)
    WHEN v IS NULL THEN jsonb_build_object('state','MISSING','value',NULL,'reason','NO_MEASUREMENT')
    WHEN v<>0 AND round(v,4)=0 THEN jsonb_build_object('state','MISSING','value',NULL,'reason','BELOW_REPRESENTABLE_PRECISION')
    WHEN v IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR abs(v)>=100000000000000 THEN jsonb_build_object('state','MISSING','value',NULL,'reason','VALUE_OUT_OF_RANGE')
    ELSE jsonb_build_object('state',CASE WHEN v=0 THEN 'ZERO' ELSE 'AVAILABLE' END,'value',trim_scale(round(v,4))::text,'reason',NULL) END
$$;

ALTER FUNCTION pathways.p06_cell(v numeric, reason text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_check_binding_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.measurement_mode='DERIVED' AND NOT EXISTS (
    SELECT FROM pathways.project_indicator_bindings b WHERE b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id AND b.indicator_id=NEW.id
  ) THEN RAISE EXCEPTION 'Derived definition requires its immutable binding in the same transaction' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

ALTER FUNCTION pathways.p06_check_binding_authority() OWNER TO prisma;

CREATE FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  d pathways.project_indicators; b pathways.project_indicator_bindings; m pathways.project_indicator_measurements;
  value numeric; n bigint; denominator bigint; contributors bigint; bad bigint; result jsonb;
BEGIN
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=wanted_org AND project_id=wanted_project AND id=wanted_indicator;
  IF NOT FOUND OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid OR NOT pathways.p06_can('monitoring.read',wanted_project) THEN
    RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501';
  END IF;
  IF d.measurement_mode IS NULL THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'LEGACY_REVIEW_REQUIRED'),'measurementId',NULL,'measuredAt',NULL); END IF;
  PERFORM pathways.p06_assert_scope(wanted_org,ARRAY[wanted_project],'monitoring.read',d.period_start,d.period_end,zone);
  IF d.measurement_mode='MANUAL' THEN
    SELECT * INTO m FROM pathways.project_indicator_measurements x
      WHERE x.organization_id=wanted_org AND x.project_id=wanted_project AND x.indicator_id=wanted_indicator
        AND x.period_start=d.period_start AND x.period_end=d.period_end
        AND NOT EXISTS (SELECT FROM pathways.project_indicator_measurements y WHERE y.organization_id=wanted_org AND y.project_id=wanted_project AND y.indicator_id=wanted_indicator AND y.corrects_measurement_id=x.id)
      ORDER BY x.recorded_at DESC,x.id DESC LIMIT 1;
    RETURN jsonb_build_object('current',pathways.p06_cell(m.value),'measurementId',m.id,'measuredAt',m.recorded_at,'measurementSource',m.source);
  END IF;
  SELECT * INTO b FROM pathways.project_indicator_bindings WHERE organization_id=wanted_org AND project_id=wanted_project AND indicator_id=wanted_indicator;
  IF NOT FOUND THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'BINDING_UNAVAILABLE'),'measurementId',NULL,'measuredAt',NULL); END IF;

  IF b.recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    WITH accepted AS (
      SELECT p.attendance_status,e.beneficiary_id,ben.subject_type
      FROM pathways.beneficiary_activity_participations p
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
      JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
      WHERE p.organization_id=wanted_org AND p.project_id=wanted_project
        AND p.participation_date BETWEEN d.period_start AND d.period_end
        AND (b.activity_id IS NULL OR p.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND a.archived_at IS NULL AND a.status<>'CANCELLED'
        AND s.status = 'VALIDATED'
        AND NOT s.is_dummy_record
    ) SELECT count(*), count(DISTINCT beneficiary_id),
      count(DISTINCT beneficiary_id) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED')),
      count(*) FILTER (WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))
      INTO n,contributors,denominator,bad FROM accepted;
    IF b.recipe='PARTICIPATION_RECORD_COUNT' THEN result:=pathways.p06_cell(n,CASE WHEN contributors BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END);
    ELSIF b.recipe='DISTINCT_ATTENDING_INDIVIDUALS' THEN result:=pathways.p06_count_cell(denominator);
    ELSE result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') WHEN denominator<5 THEN pathways.p06_cell(NULL,'SMALL_COHORT') ELSE pathways.p06_cell(bad::numeric/denominator) END;
    END IF;
  ELSIF b.recipe='EFFECTIVE_JOURNEY_EVENT_COUNT' THEN
    -- P05 permits multiple single-level correcting events. Do not silently choose
    -- a winner or multiply a root event when those corrections are ambiguous.
    IF EXISTS (
      SELECT r.id FROM pathways.beneficiary_journey_events r
      JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id
        AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
      GROUP BY r.id HAVING count(*)>1
    ) THEN RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'AMBIGUOUS_JOURNEY_CORRECTIONS'),'measurementId',NULL,'measuredAt',NULL); END IF;
    -- Corrections replace the root EVENT date. They do not change participation attendance/date.
    WITH effective AS (
      SELECT e.beneficiary_id,coalesce(c.event_date,r.event_date) AS event_date
      FROM pathways.beneficiary_journey_events r
      LEFT JOIN pathways.beneficiary_journey_events c ON c.organization_id=r.organization_id AND c.project_id=r.project_id AND c.corrects_event_id=r.id
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=r.organization_id AND e.project_id=r.project_id AND e.id=r.enrollment_id
      JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
      WHERE r.organization_id=wanted_org AND r.project_id=wanted_project AND r.corrects_event_id IS NULL
        AND (b.activity_id IS NULL OR r.activity_id=b.activity_id)
        AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        AND (r.participation_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_activity_participations p
          JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
          WHERE p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.id=r.participation_id
            AND s.status = 'VALIDATED'
            AND NOT s.is_dummy_record
        ))
    ) SELECT count(*),count(DISTINCT beneficiary_id) INTO n,contributors FROM effective WHERE event_date BETWEEN d.period_start AND d.period_end;
    result:=pathways.p06_cell(n,CASE WHEN contributors BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END);
  ELSIF b.recipe IN ('FORM_NUMERIC_SUM','FORM_NUMERIC_AVERAGE') THEN
    WITH raw AS (
      SELECT v.value #>> '{}' AS text_value, jsonb_typeof(v.value) AS json_type,
        (SELECT e.beneficiary_id FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id) AS contributor
      FROM pathways.form_submissions s
      JOIN pathways.form_response_values v ON v.organization_id=s.organization_id AND v.project_id=s.project_id AND v.form_id=s.form_id AND v.submission_id=s.id AND v.field_id=b.field_id
      WHERE s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=b.form_id AND s.form_version=b.form_version
        AND s.status='VALIDATED' AND NOT s.is_dummy_record
        AND s.submitted_at >= (d.period_start::timestamp AT TIME ZONE zone)
        AND s.submitted_at < ((d.period_end+1)::timestamp AT TIME ZONE zone)
        AND (s.enrollment_id IS NULL OR EXISTS (
          SELECT FROM pathways.beneficiary_project_enrollments e JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
          WHERE e.organization_id=s.organization_id AND e.project_id=s.project_id AND e.id=s.enrollment_id AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
        ))
    ), parsed AS (
      SELECT contributor,CASE WHEN json_type IN ('number','string') AND text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN text_value::numeric END AS number_value,
        json_type<>'null' AND NOT (json_type IN ('number','string') AND coalesce(text_value ~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$',false)) AS invalid
      FROM raw
    ) SELECT count(number_value),count(*) FILTER(WHERE invalid),
      count(DISTINCT contributor) FILTER(WHERE number_value IS NOT NULL),
      count(*) FILTER(WHERE number_value IS NOT NULL AND contributor IS NULL),
      CASE WHEN b.recipe='FORM_NUMERIC_SUM' THEN sum(number_value) ELSE avg(number_value) END
      INTO n,bad,contributors,denominator,value FROM parsed;
    result:=CASE WHEN bad>0 THEN pathways.p06_cell(NULL,'INVALID_COMMITTED_SOURCE')
      WHEN n=0 THEN pathways.p06_cell(NULL,'NO_NUMERIC_RESPONSES')
      WHEN denominator>0 THEN pathways.p06_cell(NULL,'COHORT_PROVENANCE_UNAVAILABLE')
      WHEN contributors<5 THEN pathways.p06_cell(NULL,'SMALL_COHORT')
      WHEN NOT pathways.p06_numeric_valid(round(value,4),d.numeric_kind) THEN pathways.p06_cell(NULL,'DERIVED_DOMAIN_MISMATCH')
      ELSE pathways.p06_cell(value) END;
  ELSIF b.recipe='ACTIVITY_COMPLETION_PERCENTAGE' THEN
    SELECT count(*),count(*) FILTER(WHERE status='COMPLETED') INTO denominator,n FROM pathways.project_activities
      WHERE organization_id=wanted_org AND project_id=wanted_project AND archived_at IS NULL AND status<>'CANCELLED'
        AND planned_end_date BETWEEN d.period_start AND d.period_end;
    result:=CASE WHEN denominator=0 THEN pathways.p06_cell(NULL,'ZERO_DENOMINATOR') ELSE pathways.p06_cell(100::numeric*n/denominator) END;
  ELSE result:=pathways.p06_cell(NULL,'UNSUPPORTED_RECIPE');
  END IF;
  RETURN jsonb_build_object('current',result,'measurementId',NULL,'measuredAt',NULL);
END $_$;

ALTER FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_compute_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE result jsonb;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.read',start_on,end_on,zone);
  WITH enrolled AS MATERIALIZED (
    SELECT DISTINCT e.beneficiary_id,ben.subject_type
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=ANY(wanted_projects)
      AND e.enrollment_date<=end_on AND (e.ended_date IS NULL OR e.ended_date>=start_on)
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), participation AS MATERIALIZED (
    SELECT p.id,e.beneficiary_id,ben.subject_type,p.attendance_status
    FROM pathways.beneficiary_activity_participations p
    JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.project_id AND e.id=p.enrollment_id
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    JOIN pathways.project_activities a ON a.organization_id=p.organization_id AND a.project_id=p.project_id AND a.id=p.activity_id
    JOIN pathways.form_submissions s ON s.organization_id=p.organization_id AND s.project_id=p.project_id AND s.id=p.source_submission_id
    WHERE p.organization_id=wanted_org AND p.project_id=ANY(wanted_projects) AND p.participation_date BETWEEN start_on AND end_on
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record AND a.archived_at IS NULL AND a.status<>'CANCELLED'
      AND s.status = 'VALIDATED'
      AND NOT s.is_dummy_record
  ), activity_counts AS (
    SELECT status::text AS key,count(*) AS n FROM pathways.project_activities
    WHERE organization_id=wanted_org AND project_id=ANY(wanted_projects) AND archived_at IS NULL AND planned_end_date BETWEEN start_on AND end_on GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key,count(*) AS n FROM pathways.project_milestones
    WHERE organization_id=wanted_org AND project_id=ANY(wanted_projects) AND archived_at IS NULL AND target_date BETWEEN start_on AND end_on GROUP BY status
  ) SELECT jsonb_build_object(
    'activities',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',pathways.p06_cell(coalesce(a.n,0))) ORDER BY v.ord)
      FROM (VALUES ('NOT_STARTED','Not started',1),('IN_PROGRESS','In progress',2),('FOR_REVIEW','For review',3),('COMPLETED','Completed',4),('CANCELLED','Cancelled',5)) v(key,label,ord) LEFT JOIN activity_counts a USING(key)),
    'milestones',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',pathways.p06_cell(coalesce(m.n,0))) ORDER BY v.ord)
      FROM (VALUES ('PENDING','Pending',1),('IN_PROGRESS','In progress',2),('COMPLETED','Completed',3),('CANCELLED','Cancelled',4)) v(key,label,ord) LEFT JOIN milestone_counts m USING(key)),
    'participationRecords',pathways.p06_cell((SELECT count(*) FROM participation),CASE WHEN (SELECT count(DISTINCT beneficiary_id) FROM participation) BETWEEN 1 AND 4 THEN 'SMALL_COHORT' END),
    'attendingIndividuals',pathways.p06_count_cell((SELECT count(DISTINCT beneficiary_id) FROM participation WHERE subject_type='INDIVIDUAL' AND attendance_status IN ('PRESENT','COMPLETED'))),
    'enrolledBeneficiaryRecords',pathways.p06_count_cell((SELECT count(*) FROM enrolled)),
    'enrolledIndividuals',pathways.p06_count_cell((SELECT count(*) FROM enrolled WHERE subject_type='INDIVIDUAL'))
  ) INTO result;
  RETURN result;
END $$;

ALTER FUNCTION pathways.p06_compute_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE raw jsonb; result jsonb; suppress boolean; total bigint;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.read',start_on,start_on,zone);
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'beneficiaries.aggregates.read',start_on,start_on,zone);
  IF end_on IS NULL OR end_on < start_on OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid fixed project period' USING ERRCODE='22023';
  END IF;
  -- DISTINCT at the population boundary, not a sum of project enrollments.
  WITH population AS MATERIALIZED (
    SELECT DISTINCT ben.id,ben.sex::text AS sex,ben.birth_date,ben.disability_status::text AS disability,
      CASE WHEN ben.birth_date>(CURRENT_TIMESTAMP AT TIME ZONE zone)::date THEN NULL ELSE pathways.p06_age_band(ben.birth_date,end_on) END AS age
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=ANY(wanted_projects)
      AND e.enrollment_date<=end_on AND (e.ended_date IS NULL OR e.ended_date>=start_on)
      AND ben.subject_type='INDIVIDUAL' AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), eligible AS MATERIALIZED (SELECT * FROM population WHERE age IS NOT NULL), buckets AS (
    SELECT 'sex' AS dimension, v.key,v.label,v.ord,count(p.id) AS n
      FROM (VALUES ('MALE','Male',1),('FEMALE','Female',2),('OTHER','Other',3),('PREFER_NOT_TO_SAY','Prefer not to say',4),('NOT_SPECIFIED','Unknown',5)) v(key,label,ord)
      LEFT JOIN eligible p ON p.sex=v.key GROUP BY v.key,v.label,v.ord
    UNION ALL
    SELECT 'age',v.key,v.key,v.ord,count(p.id)
      FROM (VALUES ('0-9',1),('10-14',2),('15-17',3),('18-24',4),('25+',5),('Unknown',6)) v(key,ord)
      LEFT JOIN eligible p ON p.age=v.key GROUP BY v.key,v.ord
    UNION ALL
    SELECT 'disability',v.key,v.label,v.ord,count(p.id)
      FROM (VALUES ('WITH_DISABILITY','With disability',1),('WITHOUT_DISABILITY','Without disability',2),('NOT_SPECIFIED','Unknown',3)) v(key,label,ord)
      LEFT JOIN eligible p ON p.disability=v.key GROUP BY v.key,v.label,v.ord
    UNION ALL
    SELECT 'completeness','MISSING_BIRTH_DATE','Missing birth date',1,count(*) FROM eligible WHERE birth_date IS NULL
    UNION ALL
    SELECT 'completeness','INVALID_BIRTH_DATE','Excluded invalid birth date',2,count(*) FROM population WHERE age IS NULL
    UNION ALL
    SELECT 'completeness','MISSING_SEX','Unspecified sex',3,count(*) FROM eligible WHERE sex='NOT_SPECIFIED'
    UNION ALL
    SELECT 'completeness','MISSING_DISABILITY','Unspecified disability',4,count(*) FROM eligible WHERE disability='NOT_SPECIFIED'
  ) SELECT (SELECT count(*) FROM eligible), coalesce(bool_or(n BETWEEN 1 AND 4),false),
    jsonb_agg(jsonb_build_object('dimension',dimension,'key',key,'label',label,'ord',ord,'n',n)) INTO total,suppress,raw FROM buckets;
  suppress:=suppress OR total BETWEEN 1 AND 4;
  -- Conservative complementary suppression: if any cell/completeness count is small,
  -- withhold this ENTIRE release including zeros and totals. Never return hidden raw counts.
  SELECT jsonb_build_object(
    'total',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell(total) END,
    'sex',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='sex'),'[]'::jsonb),
    'age',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='age'),'[]'::jsonb),
    'disability',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='disability'),'[]'::jsonb),
    'completeness',coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','metric',CASE WHEN suppress THEN pathways.p06_cell(NULL,'COMPLEMENTARY_SUPPRESSION') ELSE pathways.p06_cell((v->>'n')::numeric) END) ORDER BY (v->>'ord')::int) FILTER(WHERE v->>'dimension'='completeness'),'[]'::jsonb)
  ) INTO result FROM jsonb_array_elements(raw) v;
  RETURN result;
END $$;

ALTER FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_count_cell(v bigint) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT pathways.p06_cell(v::numeric,CASE WHEN v BETWEEN 1 AND 4 THEN 'SMALL_COHORT' ELSE NULL END)
$$;

ALTER FUNCTION pathways.p06_count_cell(v bigint) OWNER TO prisma;

CREATE FUNCTION pathways.p06_guard_binding() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE d pathways.project_indicators;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Bindings are immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.indicator_id FOR UPDATE;
  IF NOT FOUND OR d.measurement_mode IS DISTINCT FROM 'DERIVED' OR d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active derived definition is required' USING ERRCODE='23514';
  END IF;
  IF (NEW.recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','EFFECTIVE_JOURNEY_EVENT_COUNT') AND d.numeric_kind<>'COUNT')
    OR (NEW.recipe='ATTENDANCE_RECORDS_PER_INDIVIDUAL' AND d.numeric_kind<>'RATIO')
    OR (NEW.recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND d.numeric_kind<>'PERCENTAGE') THEN
    RAISE EXCEPTION 'Recipe and numeric domain differ' USING ERRCODE='23514';
  END IF;
  IF NEW.form_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM pathways.digital_forms f JOIN pathways.form_fields ff ON ff.organization_id=f.organization_id AND ff.project_id=f.project_id AND ff.form_id=f.id
    WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id AND f.id=NEW.form_id
      AND f.version=NEW.form_version AND f.status='PUBLISHED' AND ff.id=NEW.field_id AND ff.data_type IN ('INTEGER','DECIMAL')
  ) THEN RAISE EXCEPTION 'Bind a numeric field of a published exact form version' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION pathways.p06_guard_binding() OWNER TO prisma;

CREATE FUNCTION pathways.p06_guard_indicator() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF current_user='pathways_runtime' AND NEW.measurement_mode IS NULL THEN RAISE EXCEPTION 'A measurement authority is required' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive indicators instead of deleting' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['name','description','archived_at','updated_at','revision']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['name','description','archived_at','updated_at','revision'])
     OR OLD.archived_at IS NOT NULL OR NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'Indicator semantics are immutable; create a new definition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION pathways.p06_guard_indicator() OWNER TO prisma;

CREATE FUNCTION pathways.p06_guard_measurement() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE d pathways.project_indicators; old_value pathways.project_indicator_measurements;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Measurements are append-only' USING ERRCODE='23514'; END IF;
  SELECT * INTO d FROM pathways.project_indicators WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.indicator_id FOR UPDATE;
  IF NOT FOUND OR d.measurement_mode IS DISTINCT FROM 'MANUAL' OR d.archived_at IS NOT NULL
    OR d.period_start IS DISTINCT FROM NEW.period_start OR d.period_end IS DISTINCT FROM NEW.period_end
    OR NOT pathways.p06_numeric_valid(NEW.value,d.numeric_kind) THEN
    RAISE EXCEPTION 'Measurement authority, period or numeric domain is invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.corrects_measurement_id IS NOT NULL THEN
    SELECT * INTO old_value FROM pathways.project_indicator_measurements
      WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND indicator_id=NEW.indicator_id AND id=NEW.corrects_measurement_id;
    IF NOT FOUND OR old_value.period_start<>NEW.period_start OR old_value.period_end<>NEW.period_end
      OR EXISTS (SELECT FROM pathways.project_indicator_measurements WHERE corrects_measurement_id=old_value.id)
      OR NEW.recorded_at<old_value.recorded_at THEN
      RAISE EXCEPTION 'Correct only the latest value in this measurement period' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION pathways.p06_guard_measurement() OWNER TO prisma;

CREATE FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  wanted_project uuid;
  missing jsonb;
  result jsonb;
BEGIN
  IF wanted_org IS NULL
     OR wanted_org IS DISTINCT FROM
       nullif(current_setting('app.organization_id', true), '')::uuid
     OR wanted_projects IS NULL
     OR cardinality(wanted_projects) > 100
     OR array_position(wanted_projects, NULL) IS NOT NULL
     OR cardinality(wanted_projects) <> (
       SELECT count(DISTINCT item)
       FROM unnest(wanted_projects) item
     ) THEN
    RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
  END IF;

  IF start_on IS NULL
     OR end_on IS NULL
     OR start_on < DATE '1900-01-01'
     OR end_on > DATE '2100-12-31'
     OR end_on < start_on
     OR end_on - start_on > 365
     OR zone IS NULL
     OR length(zone) > 100
     OR NOT EXISTS (
       SELECT
       FROM pg_catalog.pg_timezone_names
       WHERE name = zone
     ) THEN
    RAISE EXCEPTION 'Invalid bounded dashboard period' USING ERRCODE = '22023';
  END IF;

  -- Empty project scopes still require a current, active identity whose active
  -- role has the existing projects.read permission.
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users app_user
    JOIN pathways.roles role
      ON role.id = app_user.role_id
     AND role.is_active
    JOIN pathways.role_permissions mapping
      ON mapping.role_id = role.id
    JOIN pathways.permissions permission
      ON permission.id = mapping.permission_id
     AND permission.code = 'projects.read'
     AND permission.is_active
    WHERE app_user.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND app_user.organization_id = wanted_org
      AND app_user.auth_user_id =
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND app_user.account_status = 'ACTIVE'
      AND app_user.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Dashboard home permission unavailable' USING ERRCODE = '42501';
  END IF;

  -- The established project predicate verifies organization, active project,
  -- active permission and assignment/program scope for every requested project.
  FOREACH wanted_project IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p05_has_project_permission('projects.read', wanted_project) THEN
      RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  missing := pathways.p06_cell(NULL, 'SENSITIVE_RELEASE_NOT_ENABLED_V1');

  WITH activity_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_activities
    WHERE organization_id = wanted_org
      AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL
      AND planned_end_date BETWEEN start_on AND end_on
    GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_milestones
    WHERE organization_id = wanted_org
      AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL
      AND target_date BETWEEN start_on AND end_on
    GROUP BY status
  )
  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', v.key,
          'label', v.label,
          'metric', pathways.p06_cell(coalesce(counts.n, 0))
        )
        ORDER BY v.ord
      )
      FROM (
        VALUES
          ('NOT_STARTED', 'Not started', 1),
          ('IN_PROGRESS', 'In progress', 2),
          ('FOR_REVIEW', 'For review', 3),
          ('COMPLETED', 'Completed', 4),
          ('CANCELLED', 'Cancelled', 5)
      ) v(key, label, ord)
      LEFT JOIN activity_counts counts USING (key)
    ),
    'milestones', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', v.key,
          'label', v.label,
          'metric', pathways.p06_cell(coalesce(counts.n, 0))
        )
        ORDER BY v.ord
      )
      FROM (
        VALUES
          ('PENDING', 'Pending', 1),
          ('IN_PROGRESS', 'In progress', 2),
          ('COMPLETED', 'Completed', 3),
          ('CANCELLED', 'Cancelled', 4)
      ) v(key, label, ord)
      LEFT JOIN milestone_counts counts USING (key)
    ),
    'participationRecords', missing,
    'attendingIndividuals', missing,
    'enrolledBeneficiaryRecords', missing,
    'enrolledIndividuals', missing
  ) INTO result;

  RETURN result;
END
$$;

ALTER FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  mode text;
  recipe text;
  start_on date;
  end_on date;
BEGIN
  IF wanted_org IS DISTINCT FROM
       nullif(
         current_setting(
           'app.organization_id',
           true
         ),
         ''
       )::uuid
     OR NOT pathways.p06_can(
       'monitoring.read',
       wanted_project
     )
  THEN
    RAISE EXCEPTION
      'Indicator unavailable'
      USING ERRCODE='42501';
  END IF;

  SELECT
    i.measurement_mode,
    b.recipe,
    i.period_start,
    i.period_end
  INTO
    mode,
    recipe,
    start_on,
    end_on
  FROM pathways.project_indicators i
  LEFT JOIN pathways.project_indicator_bindings b
    ON b.organization_id =
       i.organization_id
   AND b.project_id =
       i.project_id
   AND b.indicator_id =
       i.id
  WHERE i.organization_id =
        wanted_org
    AND i.project_id =
        wanted_project
    AND i.id =
        wanted_indicator;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Indicator unavailable'
      USING ERRCODE='42501';
  END IF;

  IF mode = 'DERIVED'
     AND recipe IS DISTINCT FROM
       'ACTIVITY_COMPLETION_PERCENTAGE'
  THEN
    PERFORM pathways.p06_assert_scope(
      wanted_org,
      ARRAY[wanted_project],
      'monitoring.read',
      start_on,
      end_on,
      zone
    );

    RETURN jsonb_build_object(
      'current',
        pathways.p06_cell(
          NULL,
          'SENSITIVE_RELEASE_NOT_ENABLED_V1'
        ),
      'measurementId',
        NULL,
      'measuredAt',
        NULL,
      'measurementSource',
        NULL
    );
  END IF;

  RETURN pathways.p06_compute_indicator_value(
    wanted_org,
    wanted_project,
    wanted_indicator,
    zone
  );
END
$$;

ALTER FUNCTION pathways.p06_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_missing_saddd(reason text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'releaseState',
      'STALE',
    'total',
      pathways.p06_cell(
        NULL,
        reason
      ),

    'sex',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('MALE', 'Male', 1),
            ('FEMALE', 'Female', 2),
            ('OTHER', 'Other', 3),
            ('PREFER_NOT_TO_SAY', 'Prefer not to say', 4),
            ('NOT_SPECIFIED', 'Unknown', 5)
        ) v(key, label, ord)
      ),

    'age',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.key,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('0-9', 1),
            ('10-14', 2),
            ('15-17', 3),
            ('18-24', 4),
            ('25+', 5),
            ('Unknown', 6)
        ) v(key, ord)
      ),

    'disability',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('WITH_DISABILITY', 'With disability', 1),
            ('WITHOUT_DISABILITY', 'Without disability', 2),
            ('NOT_SPECIFIED', 'Unknown', 3)
        ) v(key, label, ord)
      ),

    'completeness',
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key',
              v.key,
            'label',
              v.label,
            'metric',
              pathways.p06_cell(
                NULL,
                reason
              )
          )
          ORDER BY v.ord
        )
        FROM (
          VALUES
            ('MISSING_BIRTH_DATE', 'Missing birth date', 1),
            ('INVALID_BIRTH_DATE', 'Excluded invalid birth date', 2),
            ('MISSING_SEX', 'Unspecified sex', 3),
            ('MISSING_DISABILITY', 'Unspecified disability', 4)
        ) v(key, label, ord)
      )
  );
$$;

ALTER FUNCTION pathways.p06_missing_saddd(reason text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  data jsonb;
  missing jsonb;
BEGIN
  data :=
    pathways.p06_compute_monitoring(
      wanted_org,
      wanted_projects,
      start_on,
      end_on,
      zone
    );

  missing :=
    pathways.p06_cell(
      NULL,
      'SENSITIVE_RELEASE_NOT_ENABLED_V1'
    );

  RETURN data || jsonb_build_object(
    'participationRecords',
      missing,
    'attendingIndividuals',
      missing,
    'enrolledBeneficiaryRecords',
      missing,
    'enrolledIndividuals',
      missing
  );
END
$$;

ALTER FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_numeric_valid(v numeric, kind text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT v IS NULL OR (v NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    AND abs(v)<100000000000000 AND scale(v)<=4
    AND CASE kind
      WHEN 'COUNT' THEN v>=0 AND v=trunc(v)
      WHEN 'SIGNED_CHANGE' THEN true
      WHEN 'PERCENTAGE' THEN v BETWEEN 0 AND 100
      WHEN 'RATIO' THEN v>=0
      WHEN 'NON_NEGATIVE' THEN v>=0
      ELSE false END)
$$;

ALTER FUNCTION pathways.p06_numeric_valid(v numeric, kind text) OWNER TO prisma;

CREATE FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  wanted_project uuid;

  project_start date;
  project_end date;
  business_today date;

  computed jsonb;
  fingerprint text;

  prior pathways.sensitive_aggregate_releases%ROWTYPE;
BEGIN
  IF wanted_projects IS NULL
     OR cardinality(wanted_projects) <> 1
     OR wanted_projects[1] IS NULL
  THEN
    RAISE EXCEPTION
      'SADDD V1 requires exactly one project'
      USING ERRCODE='22023';
  END IF;

  wanted_project :=
    wanted_projects[1];

  IF wanted_org IS DISTINCT FROM
       nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;

  -- Release decisions for the same project cannot race one another.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(wanted_org::text || ':' || wanted_project::text, 0)
  );

  SELECT
    p.start_date,
    p.end_date
  INTO
    project_start,
    project_end
  FROM pathways.projects p
  WHERE p.organization_id =
        wanted_org
    AND p.id =
        wanted_project
    AND p.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Monitoring scope unavailable'
      USING ERRCODE='42501';
  END IF;

  SELECT *
  INTO prior
  FROM pathways.sensitive_aggregate_releases
  WHERE organization_id =
        wanted_org
    AND project_id =
        wanted_project
  FOR UPDATE;

  /*
   * A project receives one fixed-period release identity.
   * Changing its period later never opens a new release.
   */

  IF prior.id IS NOT NULL
     AND (
       prior.period_start
         IS DISTINCT FROM project_start
       OR prior.period_end
         IS DISTINCT FROM project_end
     )
  THEN
    UPDATE pathways.sensitive_aggregate_releases
    SET
      status =
        'STALE',
      stale_reason =
        'PROJECT_PERIOD_CHANGED',
      stale_at =
        coalesce(
          stale_at,
          CURRENT_TIMESTAMP
        ),
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id =
          prior.id;

    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  IF project_start IS NULL OR project_end IS NULL THEN
    RAISE EXCEPTION 'SADDD V1 requires fixed project dates' USING ERRCODE='22023';
  END IF;

  IF project_end < project_start OR project_end > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'SADDD V1 requires a valid persisted project period' USING ERRCODE='22023';
  END IF;

  IF start_on IS DISTINCT FROM project_start
     OR end_on IS DISTINCT FROM project_end
  THEN
    RAISE EXCEPTION 'SADDD V1 requires the persisted project period' USING ERRCODE='22023';
  END IF;

  PERFORM pathways.p06_assert_scope(
    wanted_org, wanted_projects, 'analytics.read', start_on, start_on, zone
  );
  PERFORM pathways.p06_assert_scope(
    wanted_org, wanted_projects, 'beneficiaries.aggregates.read', start_on, start_on, zone
  );

  -- The V1 business calendar is fixed by the deployed PATHWAYS policy.
  -- A caller cannot advance release by choosing another valid time zone.
  IF zone IS DISTINCT FROM 'Asia/Manila' THEN
    RAISE EXCEPTION 'SADDD V1 business time zone unavailable' USING ERRCODE='22023';
  END IF;

  business_today := (CURRENT_TIMESTAMP AT TIME ZONE zone)::date;
  IF project_end >= business_today THEN
    RAISE EXCEPTION 'SADDD V1 requires a closed project period' USING ERRCODE='22023';
  END IF;

  IF prior.id IS NOT NULL
     AND prior.status =
       'STALE'
  THEN
    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  /*
   * Private calculator remains owner-only.
   *
   * Fingerprint the protected payload and contributing source rows.
   * No Beneficiary identifiers or raw demographic rows are persisted.
   */

  -- Hash the protected result AND the contributing project enrollment/profile
  -- source. A correction inside one age band or a wholly suppressed release
  -- still changes this fingerprint; no source row is persisted in the registry.
  -- Calculate both within one SQL statement so both read one MVCC snapshot.
  SELECT protected.data, encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        protected.data::text || ':' || coalesce((
          SELECT jsonb_agg(
            jsonb_build_array(
              e.id, e.beneficiary_id, e.enrollment_date, e.ended_date,
              e.status, b.subject_type, b.sex, b.birth_date,
              b.disability_status, b.archived_at, b.is_dummy_record
            ) ORDER BY e.id
          )::text
          FROM pathways.beneficiary_project_enrollments e
          JOIN pathways.beneficiaries b
            ON b.organization_id=e.organization_id AND b.id=e.beneficiary_id
          WHERE e.organization_id=wanted_org AND e.project_id=wanted_project
        ), '[]'),
        'UTF8'
      )
    ),
    'hex'
  ) INTO computed, fingerprint
  FROM (
    SELECT pathways.p06_compute_saddd(
      wanted_org,
      ARRAY[wanted_project],
      project_start,
      project_end,
      zone
    ) AS data
  ) protected;

  IF prior.id IS NULL THEN
    INSERT INTO pathways.sensitive_aggregate_releases (
      organization_id,
      project_id,
      period_start,
      period_end,
      policy_version,
      source_fingerprint,
      status
    )
    VALUES (
      wanted_org,
      wanted_project,
      project_start,
      project_end,
      'FIXED_CLOSED_PROJECT_PERIOD_V1',
      fingerprint,
      'RELEASED'
    );

    RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
  END IF;

  IF prior.source_fingerprint
       IS DISTINCT FROM fingerprint
  THEN
    UPDATE pathways.sensitive_aggregate_releases
    SET
      status =
        'STALE',
      stale_reason =
        'SOURCE_CHANGED',
      stale_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id =
          prior.id;

    RETURN pathways.p06_missing_saddd(
      'RESTATEMENT_REVIEW_REQUIRED'
    );
  END IF;

  RETURN computed || jsonb_build_object('releaseState', 'RELEASED');
END
$$;

ALTER FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) OWNER TO prisma;

CREATE FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) RETURNS TABLE(activity_id uuid, beneficiaries_reached integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  requested_count integer;
BEGIN
  requested_count:=cardinality(wanted_activity_ids);
  IF wanted_org IS NULL OR wanted_project IS NULL OR requested_count IS NULL
     OR requested_count<1 OR requested_count>100
     OR array_position(wanted_activity_ids,NULL) IS NOT NULL
     OR (SELECT count(DISTINCT requested_id) FROM unnest(wanted_activity_ids) requested_id)<>requested_count THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR NOT pathways.p05_has_project_permission('activities.read',wanted_project)
     OR NOT pathways.p05_has_project_permission('beneficiaries.aggregates.read',wanted_project) THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  IF (SELECT count(*)
      FROM pathways.project_activities a
      WHERE a.organization_id=wanted_org
        AND a.project_id=wanted_project
        AND a.id=ANY(wanted_activity_ids)
        AND a.archived_at IS NULL)<>requested_count THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    count(DISTINCT CASE
      WHEN a.status<>'CANCELLED'
       AND s.id IS NOT NULL
       AND b.id IS NOT NULL
      THEN b.id
    END)::integer AS beneficiaries_reached
  FROM pathways.project_activities a
  LEFT JOIN pathways.beneficiary_activity_participations participation
    ON participation.organization_id=a.organization_id
   AND participation.project_id=a.project_id
   AND participation.activity_id=a.id
   AND participation.attendance_status IN ('PRESENT','COMPLETED')
  LEFT JOIN pathways.beneficiary_project_enrollments enrollment
    ON enrollment.organization_id=participation.organization_id
   AND enrollment.project_id=participation.project_id
   AND enrollment.id=participation.enrollment_id
  LEFT JOIN pathways.beneficiaries b
    ON b.organization_id=enrollment.organization_id
   AND b.id=enrollment.beneficiary_id
   AND b.subject_type='INDIVIDUAL'
   AND b.archived_at IS NULL
   AND NOT b.is_dummy_record
  LEFT JOIN pathways.form_submissions s
    ON s.organization_id=participation.organization_id
   AND s.project_id=participation.project_id
   AND s.id=participation.source_submission_id
   AND s.status='VALIDATED'
   AND NOT s.is_dummy_record
  WHERE a.organization_id=wanted_org
    AND a.project_id=wanted_project
    AND a.id=ANY(wanted_activity_ids)
    AND a.archived_at IS NULL
  GROUP BY a.id
  ORDER BY a.id;
END
$$;

ALTER FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) OWNER TO prisma;

CREATE FUNCTION pathways.p08_guard_activity_profile() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  project_start date;
  project_end date;
BEGIN
  SELECT p.start_date,p.end_date INTO project_start,project_end
  FROM pathways.projects p
  WHERE p.organization_id=NEW.organization_id AND p.id=NEW.project_id;

  IF ((project_start IS NOT NULL AND NEW.planned_start_date < project_start)
      OR (project_end IS NOT NULL AND NEW.planned_end_date > project_end))
     AND nullif(btrim(NEW.timeline_override_justification),'') IS NULL THEN
    RAISE EXCEPTION 'A timeline override justification is required outside the project dates'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p08_guard_activity_profile() OWNER TO prisma;

CREATE FUNCTION pathways.p08_guard_project_profile() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.program_manager_id IS NOT NULL AND (
    TG_OP='INSERT' OR NEW.program_manager_id IS DISTINCT FROM OLD.program_manager_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    IF NOT EXISTS (
      SELECT
      FROM pathways.system_users u
      JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
      WHERE u.organization_id=NEW.organization_id
        AND u.id=NEW.program_manager_id
        AND u.account_status='ACTIVE'
        AND u.archived_at IS NULL
        AND r.code='PROGRAM_MANAGER'
    ) THEN
      RAISE EXCEPTION 'Project Program Manager must be an active same-organization Program Manager'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p08_guard_project_profile() OWNER TO prisma;

CREATE FUNCTION pathways.p08_reject_activity_indicator_link_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  RAISE EXCEPTION 'Activity indicator links are replaced, not updated' USING ERRCODE='23514';
END
$$;

ALTER FUNCTION pathways.p08_reject_activity_indicator_link_update() OWNER TO prisma;

CREATE FUNCTION pathways.p09_can(wanted_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT FROM pathways.system_users u
 JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
 JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
 JOIN pathways.role_permissions rp ON rp.role_id=r.id
 JOIN pathways.permissions p ON p.id=rp.permission_id AND p.is_active AND p.code=wanted_permission AND pathways.p09_role_allows(r.code,wanted_permission)
 WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
 AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
 AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 AND u.account_status='ACTIVE' AND u.archived_at IS NULL)
$$;

ALTER FUNCTION pathways.p09_can(wanted_permission text) OWNER TO prisma;

CREATE FUNCTION pathways.p09_enroll(wanted_project uuid, wanted_beneficiary uuid, enrolled_on date) RETURNS TABLE(id uuid, enrollment_date date, status pathways.enrollment_status)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid;
 org uuid:=nullif(current_setting('app.organization_id',true),'')::uuid;
BEGIN
 IF NOT pathways.p05_has_project_permission('beneficiaries.enrollments.manage',wanted_project)
 OR enrolled_on IS NULL OR enrolled_on>CURRENT_DATE
 OR NOT EXISTS(SELECT FROM pathways.beneficiaries b WHERE b.id=wanted_beneficiary AND b.organization_id=org AND b.archived_at IS NULL)
 OR NOT (EXISTS(SELECT FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id WHERE u.id=actor AND r.code='SYSTEM_ADMINISTRATOR')
 OR EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=org AND e.beneficiary_id=wanted_beneficiary
 AND pathways.p05_has_project_permission('beneficiaries.enrollments.manage',e.project_id))) THEN
   RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO pathways.beneficiary_project_enrollments AS e(organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 VALUES(org,wanted_project,wanted_beneficiary,enrolled_on,actor)
 ON CONFLICT(organization_id,project_id,beneficiary_id) DO NOTHING;
 RETURN QUERY SELECT e.id,e.enrollment_date,e.status FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=org AND e.project_id=wanted_project AND e.beneficiary_id=wanted_beneficiary;
END $$;

ALTER FUNCTION pathways.p09_enroll(wanted_project uuid, wanted_beneficiary uuid, enrolled_on date) OWNER TO prisma;

CREATE FUNCTION pathways.p09_guard_activity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF NOT pathways.p05_has_project_permission('activities.update',OLD.project_id)
 AND to_jsonb(NEW)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at']
 IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at'] THEN
   RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p09_guard_activity() OWNER TO prisma;

CREATE FUNCTION pathways.p09_guard_archive() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
 AND NOT pathways.p05_has_project_permission(TG_ARGV[0],OLD.project_id) THEN
  RAISE EXCEPTION 'Archive authority unavailable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p09_guard_archive() OWNER TO prisma;

CREATE FUNCTION pathways.p09_guard_expense_review() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND (
  (OLD.status='PENDING' AND NOT pathways.p05_has_project_permission('expenses.verify',OLD.project_id))
  OR (OLD.status='VERIFIED' AND NOT pathways.p05_has_project_permission('expenses.approve',OLD.project_id))) THEN
  RAISE EXCEPTION 'Financial review stage authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p09_guard_expense_review() OWNER TO prisma;

CREATE FUNCTION pathways.p09_guard_project() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF NOT pathways.p05_has_project_permission('projects.update',OLD.id)
 AND (NOT pathways.p05_has_project_permission('projects.archive',OLD.id)
 OR to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','archived_at','updated_at']
 OR NEW.archived_at IS NULL) THEN RAISE EXCEPTION 'Project update authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p09_guard_project() OWNER TO prisma;

CREATE FUNCTION pathways.p09_role_allows(role_code text, wanted_permission text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
 SELECT EXISTS(SELECT FROM (VALUES
('SYSTEM_ADMINISTRATOR','assessments.detail.read'),
('PROJECT_OFFICER','assessments.detail.read'),
('PROJECT_MANAGER','assessments.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.detail.read'),
('SYSTEM_ADMINISTRATOR','projects.read'),
('PROJECT_OFFICER','projects.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.read'),
('PROJECT_MANAGER','projects.read'),
('PROGRAM_MANAGER','projects.read'),
('GRANT_MANAGER','projects.read'),
('PROJECT_MANAGER','projects.create'),
('SYSTEM_ADMINISTRATOR','activities.read'),
('PROJECT_OFFICER','activities.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.read'),
('PROJECT_MANAGER','activities.read'),
('PROJECT_MANAGER','activities.create'),
('PROJECT_OFFICER','activities.create'),
('PROJECT_MANAGER','activities.update'),
('PROJECT_OFFICER','activities.update'),
('PROJECT_MANAGER','activities.proof.submit'),
('PROJECT_OFFICER','activities.proof.submit'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.read'),
('PROJECT_MANAGER','journeys.read'),
('PROJECT_OFFICER','journeys.read'),
('MONITORING_AND_EVALUATION_OFFICER','participation.record'),
('PROJECT_MANAGER','participation.record'),
('PROJECT_OFFICER','participation.record'),
('GRANT_MANAGER','budgets.read'),
('MONITORING_AND_EVALUATION_OFFICER','budgets.read'),
('PROGRAM_MANAGER','budgets.read'),
('PROJECT_MANAGER','budgets.read'),
('SYSTEM_ADMINISTRATOR','budgets.read'),
('GRANT_MANAGER','budgets.create'),
('PROGRAM_MANAGER','budgets.create'),
('PROJECT_MANAGER','budgets.create'),
('GRANT_MANAGER','budgets.update'),
('PROGRAM_MANAGER','budgets.update'),
('PROJECT_MANAGER','budgets.update'),
('GRANT_MANAGER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.read'),
('PROGRAM_MANAGER','expenses.read'),
('PROJECT_MANAGER','expenses.read'),
('PROJECT_OFFICER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.submit'),
('PROJECT_MANAGER','expenses.submit'),
('PROJECT_OFFICER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.verify'),
('PROJECT_MANAGER','expenses.approve'),
('GRANT_MANAGER','monitoring.read'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.read'),
('PROGRAM_MANAGER','monitoring.read'),
('PROJECT_MANAGER','monitoring.read'),
('SYSTEM_ADMINISTRATOR','monitoring.read'),
('GRANT_MANAGER','monitoring.review'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.review'),
('PROGRAM_MANAGER','monitoring.review'),
('PROJECT_MANAGER','monitoring.review'),
('SYSTEM_ADMINISTRATOR','monitoring.review'),
('SYSTEM_ADMINISTRATOR','rules.read'),
('SYSTEM_ADMINISTRATOR','rules.create'),
('SYSTEM_ADMINISTRATOR','rules.update'),
('SYSTEM_ADMINISTRATOR','rules.activate'),
('GRANT_MANAGER','alerts.read'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.read'),
('PROGRAM_MANAGER','alerts.read'),
('PROJECT_MANAGER','alerts.read'),
('SYSTEM_ADMINISTRATOR','alerts.read'),
('GRANT_MANAGER','alerts.review'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.review'),
('PROGRAM_MANAGER','alerts.review'),
('PROJECT_MANAGER','alerts.review'),
('SYSTEM_ADMINISTRATOR','alerts.review'),
('GRANT_MANAGER','alerts.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.outcome.record'),
('PROGRAM_MANAGER','alerts.outcome.record'),
('PROJECT_MANAGER','alerts.outcome.record'),
('SYSTEM_ADMINISTRATOR','alerts.outcome.record'),
('GRANT_MANAGER','recommendations.read'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.read'),
('PROGRAM_MANAGER','recommendations.read'),
('PROJECT_MANAGER','recommendations.read'),
('SYSTEM_ADMINISTRATOR','recommendations.read'),
('GRANT_MANAGER','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.review'),
('PROGRAM_MANAGER','recommendations.review'),
('PROJECT_MANAGER','recommendations.review'),
('SYSTEM_ADMINISTRATOR','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.read'),
('PROJECT_MANAGER','beneficiaries.records.read'),
('PROJECT_OFFICER','beneficiaries.records.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.register'),
('PROJECT_MANAGER','beneficiaries.records.register'),
('PROJECT_OFFICER','beneficiaries.records.register'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.profiles.update'),
('PROJECT_MANAGER','beneficiaries.profiles.update'),
('PROJECT_OFFICER','beneficiaries.profiles.update'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.enrollments.manage'),
('PROJECT_OFFICER','beneficiaries.enrollments.manage'),
('SYSTEM_ADMINISTRATOR','beneficiaries.enrollments.manage'),
('GRANT_MANAGER','beneficiaries.aggregates.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.aggregates.read'),
('PROGRAM_MANAGER','beneficiaries.aggregates.read'),
('PROJECT_MANAGER','beneficiaries.aggregates.read'),
('SYSTEM_ADMINISTRATOR','beneficiaries.aggregates.read'),
('GRANT_MANAGER','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.outcome.record'),
('PROGRAM_MANAGER','recommendations.outcome.record'),
('PROJECT_MANAGER','recommendations.outcome.record'),
('SYSTEM_ADMINISTRATOR','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.submit'),
('PROJECT_MANAGER','evaluations.approve'),
('GRANT_MANAGER','public.preview'),
('PROGRAM_MANAGER','public.preview'),
('PROJECT_MANAGER','public.preview'),
('SYSTEM_ADMINISTRATOR','public.preview'),
('GRANT_MANAGER','public.publish'),
('PROGRAM_MANAGER','public.publish'),
('PROJECT_MANAGER','public.publish'),
('SYSTEM_ADMINISTRATOR','public.publish'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.review'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.create'),
('PROJECT_MANAGER','indicators.create'),
('SYSTEM_ADMINISTRATOR','indicators.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.update'),
('PROJECT_MANAGER','indicators.update'),
('SYSTEM_ADMINISTRATOR','indicators.update'),
('SYSTEM_ADMINISTRATOR','collection.read'),
('PROJECT_OFFICER','collection.read'),
('MONITORING_AND_EVALUATION_OFFICER','collection.read'),
('PROGRAM_MANAGER','forms.read'),
('GRANT_MANAGER','forms.read'),
('SYSTEM_ADMINISTRATOR','forms.read'),
('PROJECT_OFFICER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.read'),
('PROJECT_MANAGER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','submissions.write'),
('PROJECT_OFFICER','submissions.write'),
('SYSTEM_ADMINISTRATOR','imports.read'),
('PROJECT_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.upload'),
('PROJECT_OFFICER','imports.upload'),
('SYSTEM_ADMINISTRATOR','imports.upload'),
('MONITORING_AND_EVALUATION_OFFICER','imports.review'),
('SYSTEM_ADMINISTRATOR','imports.review'),
('PROJECT_OFFICER','imports.process'),
('SYSTEM_ADMINISTRATOR','imports.process'),
('MONITORING_AND_EVALUATION_OFFICER','imports.process'),
('GRANT_MANAGER','analytics.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.read'),
('PROGRAM_MANAGER','analytics.read'),
('PROJECT_MANAGER','analytics.read'),
('SYSTEM_ADMINISTRATOR','analytics.read'),
('GRANT_MANAGER','reports.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.read'),
('PROGRAM_MANAGER','reports.read'),
('PROJECT_MANAGER','reports.read'),
('PROJECT_OFFICER','reports.read'),
('SYSTEM_ADMINISTRATOR','reports.read'),
('GRANT_MANAGER','reports.project.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.project.read'),
('PROGRAM_MANAGER','reports.project.read'),
('PROJECT_MANAGER','reports.project.read'),
('PROJECT_OFFICER','reports.project.read'),
('SYSTEM_ADMINISTRATOR','reports.project.read'),
('GRANT_MANAGER','reports.indicator.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.indicator.read'),
('PROGRAM_MANAGER','reports.indicator.read'),
('PROJECT_MANAGER','reports.indicator.read'),
('PROJECT_OFFICER','reports.indicator.read'),
('SYSTEM_ADMINISTRATOR','reports.indicator.read'),
('PROJECT_OFFICER','reports.beneficiary.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.beneficiary.read'),
('PROJECT_MANAGER','reports.beneficiary.read'),
('PROGRAM_MANAGER','users.authorize'),
('PROJECT_MANAGER','users.authorize'),
('SYSTEM_ADMINISTRATOR','users.authorize'),
('PROGRAM_MANAGER','assignments.manage'),
('PROJECT_MANAGER','assignments.manage'),
('SYSTEM_ADMINISTRATOR','assignments.manage'),
('SYSTEM_ADMINISTRATOR','settings.read'),
('PROJECT_OFFICER','settings.read'),
('MONITORING_AND_EVALUATION_OFFICER','settings.read'),
('PROJECT_MANAGER','settings.read'),
('PROGRAM_MANAGER','settings.read'),
('GRANT_MANAGER','settings.read'),
('GRANT_MANAGER','projects.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.detail.read'),
('PROGRAM_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.update'),
('GRANT_MANAGER','projects.archive'),
('PROGRAM_MANAGER','projects.archive'),
('PROJECT_MANAGER','projects.archive'),
('SYSTEM_ADMINISTRATOR','projects.archive'),
('MONITORING_AND_EVALUATION_OFFICER','activities.complete'),
('PROJECT_MANAGER','activities.complete'),
('PROJECT_OFFICER','activities.complete'),
('SYSTEM_ADMINISTRATOR','activities.complete'),
('PROJECT_OFFICER','expenses.evidence.submit'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.read'),
('PROJECT_MANAGER','indicators.read'),
('SYSTEM_ADMINISTRATOR','indicators.read'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.archive'),
('GRANT_MANAGER','evaluations.signoff'),
('PROGRAM_MANAGER','evaluations.signoff'),
('GRANT_MANAGER','assessments.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.read'),
('PROGRAM_MANAGER','assessments.read'),
('PROJECT_MANAGER','assessments.read'),
('PROJECT_OFFICER','assessments.read'),
('SYSTEM_ADMINISTRATOR','assessments.read'),
('GRANT_MANAGER','public.approve'),
('PROGRAM_MANAGER','public.approve'),
('PROJECT_MANAGER','public.approve'),
('SYSTEM_ADMINISTRATOR','public.approve'),
('GRANT_MANAGER','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.generate'),
('PROGRAM_MANAGER','forms.generate'),
('PROJECT_MANAGER','forms.generate'),
('PROJECT_OFFICER','forms.generate'),
('SYSTEM_ADMINISTRATOR','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.export'),
('PROJECT_OFFICER','forms.export'),
('MONITORING_AND_EVALUATION_OFFICER','forms.import'),
('PROJECT_OFFICER','forms.import'),
('MONITORING_AND_EVALUATION_OFFICER','imports.validate'),
('PROJECT_OFFICER','imports.validate'),
('SYSTEM_ADMINISTRATOR','imports.validate'),
('GRANT_MANAGER','analytics.export'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.export'),
('PROGRAM_MANAGER','analytics.export'),
('PROJECT_MANAGER','analytics.export'),
('SYSTEM_ADMINISTRATOR','analytics.export'),
('GRANT_MANAGER','reports.generate'),
('MONITORING_AND_EVALUATION_OFFICER','reports.generate'),
('PROGRAM_MANAGER','reports.generate'),
('PROJECT_MANAGER','reports.generate'),
('PROJECT_OFFICER','reports.generate'),
('SYSTEM_ADMINISTRATOR','reports.generate'),
('GRANT_MANAGER','reports.export'),
('MONITORING_AND_EVALUATION_OFFICER','reports.export'),
('PROGRAM_MANAGER','reports.export'),
('PROJECT_MANAGER','reports.export'),
('PROJECT_OFFICER','reports.export'),
('SYSTEM_ADMINISTRATOR','reports.export'),
('PROGRAM_MANAGER','audit.read'),
('PROJECT_MANAGER','audit.read'),
('SYSTEM_ADMINISTRATOR','audit.read'),
('SYSTEM_ADMINISTRATOR','settings.configure'),
('SYSTEM_ADMINISTRATOR','backups.create'),
('SYSTEM_ADMINISTRATOR','backups.restore'),
('GRANT_MANAGER','profile.manage'),
('MONITORING_AND_EVALUATION_OFFICER','profile.manage'),
('PROGRAM_MANAGER','profile.manage'),
('PROJECT_MANAGER','profile.manage'),
('PROJECT_OFFICER','profile.manage'),
('SYSTEM_ADMINISTRATOR','profile.manage'),
('PROGRAM_MANAGER','expenses.signoff'),
('GRANT_MANAGER','expenses.signoff')) allowed(role_code,permission_code)
 WHERE allowed.role_code=$1 AND allowed.permission_code=$2)
$_$;

ALTER FUNCTION pathways.p09_role_allows(role_code text, wanted_permission text) OWNER TO prisma;

CREATE FUNCTION pathways.p09_stamp_supporting_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
 IF current_user='pathways_runtime' THEN
  IF TG_TABLE_NAME='projects' THEN NEW.created_at:=transaction_timestamp();
  ELSE NEW.occurred_at:=transaction_timestamp(); END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p09_stamp_supporting_insert() OWNER TO prisma;

CREATE FUNCTION pathways.p1_can_manage_role(target_role_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE((
    SELECT CASE actor_role.code
      WHEN 'SYSTEM_ADMINISTRATOR' THEN target_role.code IN (
        'SYSTEM_ADMINISTRATOR','PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_MANAGER',
        'MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER'
      )
      WHEN 'PROGRAM_MANAGER' THEN target_role.code IN (
        'PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER'
      )
      WHEN 'PROJECT_MANAGER' THEN target_role.code IN (
        'PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER'
      )
      ELSE false
    END
    FROM pathways.system_users actor
    JOIN pathways.roles actor_role ON actor_role.id=actor.role_id AND actor_role.is_active
    JOIN pathways.roles target_role ON target_role.id=target_role_id AND target_role.is_active
    WHERE actor.id=(SELECT pathways.runtime_context_user())
      AND actor.organization_id=(SELECT pathways.runtime_context_organization())
      AND actor.account_status='ACTIVE' AND actor.archived_at IS NULL
  ),false)
$$;

ALTER FUNCTION pathways.p1_can_manage_role(target_role_id uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p1_workspace_for_auth() RETURNS TABLE(user_id uuid, organization_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT u.id, u.organization_id
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    AND u.account_status='ACTIVE' AND u.archived_at IS NULL
    AND o.status='ACTIVE' AND o.archived_at IS NULL AND r.is_active
$$;

ALTER FUNCTION pathways.p1_workspace_for_auth() OWNER TO prisma;

CREATE FUNCTION pathways.p2_assert_batch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE batch pathways.data_import_batches%ROWTYPE; bid uuid;
BEGIN
  IF TG_TABLE_NAME='data_import_batches' THEN bid:=NEW.id;
  ELSE bid:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END; END IF;
  SELECT * INTO batch FROM pathways.data_import_batches WHERE id=bid FOR UPDATE;
  IF batch.status IN ('VALIDATED','PROCESSED') THEN
    IF NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id=bid AND status='MAPPED')
      OR EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id=bid AND status IN ('PENDING','INVALID'))
      OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='PENDING') THEN
      RAISE EXCEPTION 'Batch requires reviewed mappings and no pending rows' USING ERRCODE='23514';
    END IF;
    IF batch.status='VALIDATED' AND NOT EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status IN ('VALID','PROCESSED')) THEN
      RAISE EXCEPTION 'Validated batch requires valid rows' USING ERRCODE='23514';
    END IF;
    IF batch.status='PROCESSED' AND (
      NOT EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='PROCESSED')
      OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='VALID')
    ) THEN
      RAISE EXCEPTION 'Processed batch requires every valid row normalized' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION pathways.p2_assert_batch() OWNER TO prisma;

CREATE FUNCTION pathways.p2_assert_processed_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE row_state pathways.import_row_status;
BEGIN
  SELECT status INTO row_state FROM pathways.data_import_rows WHERE id=NEW.id;
  IF row_state='PROCESSED' AND NOT EXISTS(
    SELECT FROM pathways.form_submissions WHERE import_row_id=NEW.id AND status='PROCESSED'
  ) THEN
    RAISE EXCEPTION 'Processed raw row must have a processed normalized submission' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION pathways.p2_assert_processed_row() OWNER TO prisma;

CREATE FUNCTION pathways.p2_assert_submission() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE parent pathways.form_submissions%ROWTYPE; sid uuid;
BEGIN
  IF TG_TABLE_NAME='form_submissions' THEN sid:=NEW.id;
  ELSE sid:=CASE WHEN TG_OP='DELETE' THEN OLD.submission_id ELSE NEW.submission_id END; END IF;
  SELECT * INTO parent FROM pathways.form_submissions WHERE id=sid FOR UPDATE;
  IF parent.status IN ('VALIDATED','PROCESSED') AND EXISTS(
    SELECT FROM pathways.form_fields f LEFT JOIN pathways.form_response_values v ON v.field_id=f.id AND v.submission_id=parent.id
    WHERE f.form_id=parent.form_id AND ((f.is_required AND v.id IS NULL) OR (v.id IS NOT NULL AND NOT pathways.p2_valid_response(f,v.value)))
  ) THEN
    RAISE EXCEPTION 'Validated submission is missing required or valid responses' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION pathways.p2_assert_submission() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_activity_assignment() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE
  parent pathways.user_project_assignments%ROWTYPE;
  profile_state pathways.account_status;
  profile_role text;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.project_assignment_id<>OLD.project_assignment_id
    OR NEW.assigned_at<>OLD.assigned_at OR OLD.status<>'ACTIVE') THEN
    RAISE EXCEPTION 'Activity assignment history is immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO parent FROM pathways.user_project_assignments
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.project_assignment_id FOR SHARE;
  IF NEW.status='ACTIVE' THEN
    IF parent.id IS NULL OR parent.status<>'ACTIVE' OR NEW.assigned_at<parent.assigned_at THEN
      RAISE EXCEPTION 'Active activity assignment requires active project membership' USING ERRCODE='23514';
    END IF;
    SELECT u.account_status,r.code INTO profile_state,profile_role
    FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id
      WHERE u.organization_id=NEW.organization_id AND u.id=parent.user_id FOR SHARE OF u;
    IF profile_state IS DISTINCT FROM 'ACTIVE'::pathways.account_status THEN
      RAISE EXCEPTION 'Active activity assignment requires an active profile' USING ERRCODE='23514';
    END IF;
    IF profile_role IS DISTINCT FROM 'PROJECT_OFFICER' THEN
      RAISE EXCEPTION 'Active activity assignment requires a Project Officer profile' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_activity_assignment() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_activity_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IN ('COMPLETED','CANCELLED')
     AND to_jsonb(NEW)-ARRAY['archived_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['archived_at','updated_at'] THEN
    RAISE EXCEPTION 'Completed/cancelled activity history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'NOT_STARTED' THEN
      RAISE EXCEPTION 'New activity must start NOT_STARTED' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.status<>OLD.status AND NOT (
    (OLD.status='NOT_STARTED' AND NEW.status IN ('IN_PROGRESS','CANCELLED'))
    OR (OLD.status='IN_PROGRESS' AND NEW.status IN ('FOR_REVIEW','CANCELLED'))
    OR (OLD.status='FOR_REVIEW' AND NEW.status IN ('IN_PROGRESS','COMPLETED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid activity lifecycle transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_activity_lifecycle() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_batch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE form_state pathways.form_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.form_id<>OLD.form_id OR NEW.uploaded_by_id<>OLD.uploaded_by_id OR NEW.uploaded_at<>OLD.uploaded_at
    OR (OLD.status='PROCESSED' AND to_jsonb(NEW)-'updated_at' IS DISTINCT FROM to_jsonb(OLD)-'updated_at')
    OR (OLD.status='VALIDATED' AND NEW.status NOT IN ('VALIDATED','PROCESSED','FAILED'))) THEN
    RAISE EXCEPTION 'Import batch history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT status INTO form_state FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
    IF form_state IS DISTINCT FROM 'PUBLISHED'::pathways.form_status THEN
      RAISE EXCEPTION 'Import requires a published form version' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_batch() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_enrollment_dates() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF NEW.beneficiary_id<>OLD.beneficiary_id OR EXISTS(
    SELECT FROM pathways.beneficiary_activity_participations
      WHERE enrollment_id=OLD.id AND (participation_date<NEW.enrollment_date OR (NEW.ended_date IS NOT NULL AND participation_date>NEW.ended_date))
  ) OR EXISTS(
    SELECT FROM pathways.beneficiary_journey_events
      WHERE enrollment_id=OLD.id AND (event_date<NEW.enrollment_date OR (NEW.ended_date IS NOT NULL AND event_date>NEW.ended_date))
  ) THEN
    RAISE EXCEPTION 'Enrollment update would invalidate participation/journey history' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_enrollment_dates() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_form() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'DRAFT'
       OR NEW.published_by_id IS NOT NULL OR NEW.published_at IS NOT NULL
       OR NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Form definitions must start as drafts';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Published or archived form definitions are immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='ARCHIVED' THEN
    RAISE EXCEPTION 'Archived form definitions are immutable';
  END IF;
  IF OLD.status='PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.form_type IS DISTINCT FROM OLD.form_type
       OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
       OR NEW.journey_stage_id IS DISTINCT FROM OLD.journey_stage_id
       OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
       OR NEW.published_by_id IS DISTINCT FROM OLD.published_by_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Published form definitions are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='PUBLISHED' AND (
    NEW.published_by_id IS NULL OR NEW.published_at IS NULL OR NEW.created_by_id IS NULL
    OR NEW.published_by_id=NEW.created_by_id
  ) THEN
    RAISE EXCEPTION 'Publication requires a different attributable reviewer';
  END IF;
  IF NEW.status='PUBLISHED' AND NOT EXISTS (
    SELECT FROM pathways.form_fields f
    WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id AND f.form_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'Published form must contain fields';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p2_guard_form() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_form_field() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE parent_status pathways.form_status; parent_organization uuid; parent_project uuid; parent_form uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.form_id IS DISTINCT FROM OLD.form_id THEN
    RAISE EXCEPTION 'Form fields cannot move between versions';
  END IF;
  parent_organization:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  parent_project:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  parent_form:=CASE WHEN TG_OP='DELETE' THEN OLD.form_id ELSE NEW.form_id END;
  SELECT status INTO parent_status
  FROM pathways.digital_forms
  WHERE organization_id=parent_organization AND project_id=parent_project AND id=parent_form;
  IF parent_status IS DISTINCT FROM 'DRAFT'::pathways.form_status THEN
    RAISE EXCEPTION 'Fields of published or archived forms are immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION pathways.p2_guard_form_field() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR (to_jsonb(NEW)->'project_id') IS DISTINCT FROM (to_jsonb(OLD)->'project_id') THEN
    RAISE EXCEPTION 'Record identity and organization/project ownership are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_identity() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_import_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE parent_state pathways.import_status; batch_id uuid;
BEGIN
  batch_id:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END;
  SELECT status INTO parent_state FROM pathways.data_import_batches WHERE id=batch_id FOR UPDATE;
  IF parent_state IN ('VALIDATED','PROCESSED') AND (
    TG_OP<>'UPDATE' OR to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
  ) THEN
    RAISE EXCEPTION 'Raw batch contents are frozen after validation' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('VALID','PROCESSED') THEN
      RAISE EXCEPTION 'Validated raw import evidence cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.import_batch_id<>OLD.import_batch_id OR NEW.form_id<>OLD.form_id OR NEW.row_number<>OLD.row_number THEN
      RAISE EXCEPTION 'Import row identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('VALID','PROCESSED') AND (
      to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
      OR NEW.status NOT IN ('VALID','PROCESSED')
      OR (OLD.status='PROCESSED' AND (NEW.status<>'PROCESSED' OR NEW.processed_at IS DISTINCT FROM OLD.processed_at))
    ) THEN
      RAISE EXCEPTION 'Validated raw evidence cannot be rewritten' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_import_row() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_journey_history() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  RAISE EXCEPTION 'Journey events are append-only history' USING ERRCODE='23514';
END;
$$;

ALTER FUNCTION pathways.p2_guard_journey_history() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_mapping() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE batch_id uuid; batch_state pathways.import_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.import_batch_id<>OLD.import_batch_id OR NEW.form_id<>OLD.form_id) THEN
    RAISE EXCEPTION 'Mappings cannot be moved to another batch/form' USING ERRCODE='23514';
  END IF;
  batch_id:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END;
  SELECT status INTO batch_state FROM pathways.data_import_batches WHERE id=batch_id FOR UPDATE;
  IF batch_state IS NULL OR batch_state NOT IN ('UPLOADED','MAPPED','FAILED') THEN
    RAISE EXCEPTION 'Mappings are frozen once the batch is validated' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION pathways.p2_guard_mapping() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_participation_dates() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE enrolled date; ended date; occurred date;
BEGIN
  occurred:=CASE WHEN TG_TABLE_NAME='beneficiary_journey_events' THEN (to_jsonb(NEW)->>'event_date')::date ELSE (to_jsonb(NEW)->>'participation_date')::date END;
  SELECT enrollment_date,ended_date INTO enrolled,ended FROM pathways.beneficiary_project_enrollments
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.enrollment_id FOR SHARE;
  IF enrolled IS NULL OR occurred<enrolled OR (ended IS NOT NULL AND occurred>ended) THEN
    RAISE EXCEPTION 'Participation/journey event must fall inside its enrollment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_participation_dates() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_profile_assignments() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF (NEW.account_status<>'ACTIVE' OR NEW.organization_id<>OLD.organization_id) AND EXISTS(
    SELECT FROM pathways.user_project_assignments WHERE organization_id=OLD.organization_id AND user_id=OLD.id AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'End active project assignments before changing active profile scope/status' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_profile_assignments() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_project_assignment() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE profile_state pathways.account_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR NEW.assigned_at<>OLD.assigned_at OR OLD.status='ENDED') THEN
    RAISE EXCEPTION 'Assignment history is immutable; create a new assignment' USING ERRCODE='23514';
  END IF;
  IF NEW.status='ACTIVE' THEN
    SELECT account_status INTO profile_state FROM pathways.system_users
      WHERE organization_id=NEW.organization_id AND id=NEW.user_id FOR SHARE;
    IF profile_state IS DISTINCT FROM 'ACTIVE'::pathways.account_status THEN
      RAISE EXCEPTION 'Active assignment requires an active profile' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='ENDED' AND EXISTS(SELECT FROM pathways.project_activity_assignments
     WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
       AND project_assignment_id=NEW.id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'End active activity assignments before ending project membership' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_project_assignment() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_public_content() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.public_visibility_status<>'PRIVATE' THEN
      RAISE EXCEPTION 'New project starts private before public review' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.public_visibility_status<>OLD.public_visibility_status AND NOT (
    (OLD.public_visibility_status='PRIVATE' AND NEW.public_visibility_status='FOR_REVIEW')
    OR (OLD.public_visibility_status='FOR_REVIEW' AND NEW.public_visibility_status IN ('PRIVATE','APPROVED'))
    OR (OLD.public_visibility_status='APPROVED' AND NEW.public_visibility_status IN ('FOR_REVIEW','PUBLISHED'))
    OR (OLD.public_visibility_status='PUBLISHED' AND NEW.public_visibility_status='FOR_REVIEW')
  ) THEN
    RAISE EXCEPTION 'Public workflow must pass review, approval, then publication' USING ERRCODE='23514';
  END IF;
  IF OLD.public_visibility_status IN ('APPROVED','PUBLISHED')
    AND NEW.public_visibility_status IN ('APPROVED','PUBLISHED')
    AND (NEW.public_summary IS DISTINCT FROM OLD.public_summary
      OR NEW.title IS DISTINCT FROM OLD.title OR NEW.code IS DISTINCT FROM OLD.code
      OR NEW.public_submitted_by_id IS DISTINCT FROM OLD.public_submitted_by_id
      OR NEW.public_submitted_at IS DISTINCT FROM OLD.public_submitted_at
      OR NEW.public_approved_by_id IS DISTINCT FROM OLD.public_approved_by_id
      OR NEW.public_approved_at IS DISTINCT FROM OLD.public_approved_at) THEN
    RAISE EXCEPTION 'Changed public content requires renewed review/approval' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_public_content() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_response() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE submission_id uuid; parent_status pathways.submission_status; field pathways.form_fields%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.submission_id IS DISTINCT FROM OLD.submission_id
    OR NEW.field_id IS DISTINCT FROM OLD.field_id
    OR NEW.form_id IS DISTINCT FROM OLD.form_id
  ) THEN
    RAISE EXCEPTION 'Response source is immutable';
  END IF;
  submission_id:=CASE WHEN TG_OP='DELETE' THEN OLD.submission_id ELSE NEW.submission_id END;
  SELECT status INTO parent_status FROM pathways.form_submissions s WHERE s.id=submission_id FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'DRAFT'::pathways.submission_status THEN
    RAISE EXCEPTION 'Only draft submission values are editable';
  END IF;
  IF TG_OP<>'DELETE' THEN
    SELECT * INTO field FROM pathways.form_fields
    WHERE id=NEW.field_id AND form_id=NEW.form_id
      AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
    IF field.id IS NULL
       OR (NEW.value IS DISTINCT FROM 'null'::jsonb AND NOT pathways.p2_valid_response(field,NEW.value)) THEN
      RAISE EXCEPTION 'Response does not satisfy its form field type or bounds';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$$;

ALTER FUNCTION pathways.p2_guard_response() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_stage_order() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE parent_order integer; parent_terminal boolean;
BEGIN
  -- Lock one project row for tree writes to prevent concurrent cycle creation.
  PERFORM 1 FROM pathways.projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF NEW.parent_stage_id IS NOT NULL THEN
    SELECT stage_order,is_terminal INTO parent_order,parent_terminal FROM pathways.journey_stages
      WHERE id=NEW.parent_stage_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
    IF parent_order IS NULL OR parent_order>=NEW.stage_order OR parent_terminal THEN
      RAISE EXCEPTION 'Stage parent must precede child and cannot be terminal' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT FROM pathways.journey_stages WHERE parent_stage_id=NEW.id AND (stage_order<=NEW.stage_order OR NEW.is_terminal)) THEN
    RAISE EXCEPTION 'Stage change would invalidate existing children' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_stage_order() OWNER TO prisma;

CREATE FUNCTION pathways.p2_guard_submission() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pathways'
    AS $$
DECLARE form_state pathways.form_status; raw_state pathways.import_row_status;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('VALIDATED','PROCESSED') OR OLD.source='IMPORTED_DATASET' THEN
      RAISE EXCEPTION 'Validated or imported submission history cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.form_id<>OLD.form_id OR NEW.source<>OLD.source OR NEW.import_row_id IS DISTINCT FROM OLD.import_row_id
      OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id THEN
      RAISE EXCEPTION 'Submission source and form are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('VALIDATED','PROCESSED') AND (
      to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
      OR NEW.status NOT IN ('VALIDATED','PROCESSED')
      OR (OLD.status='PROCESSED' AND (NEW.status<>'PROCESSED' OR NEW.processed_at IS DISTINCT FROM OLD.processed_at))
    ) THEN
      RAISE EXCEPTION 'Validated submission content is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT status INTO form_state FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
    IF form_state IS DISTINCT FROM 'PUBLISHED'::pathways.form_status THEN
      RAISE EXCEPTION 'Submission requires a published form version' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.source='IMPORTED_DATASET' THEN
    SELECT status INTO raw_state FROM pathways.data_import_rows WHERE id=NEW.import_row_id
      AND organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND form_id=NEW.form_id AND import_batch_id=NEW.import_batch_id FOR UPDATE;
    IF raw_state IS NULL OR raw_state NOT IN ('VALID','PROCESSED') THEN
      RAISE EXCEPTION 'Unvalidated or invalid import row cannot create a normalized submission' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION pathways.p2_guard_submission() OWNER TO prisma;

CREATE FUNCTION pathways.p2_valid_options(options jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT CASE WHEN jsonb_typeof(options) <> 'array' THEN false
 ELSE jsonb_array_length(options)>0 AND NOT EXISTS(SELECT FROM jsonb_array_elements(options) v WHERE jsonb_typeof(v)<>'string' OR btrim(v#>>'{}')='')
 AND (SELECT count(*)=count(DISTINCT v) FROM jsonb_array_elements(options) v) END;
$$;

ALTER FUNCTION pathways.p2_valid_options(options jsonb) OWNER TO prisma;

SET LOCAL default_tablespace = '';

SET LOCAL default_table_access_method = heap;

CREATE TABLE pathways.form_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    data_type pathways.field_data_type NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_metadata_key boolean DEFAULT false NOT NULL,
    is_saddd_field boolean DEFAULT false NOT NULL,
    allowed_values jsonb,
    minimum_value numeric(18,4),
    maximum_value numeric(18,4),
    sequence_no integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    minimum_date date,
    maximum_date date,
    minimum_length integer,
    maximum_length integer,
    CONSTRAINT fields_allowed_values CHECK ((((data_type = ANY (ARRAY['SELECT'::pathways.field_data_type, 'MULTIPLE_SELECT'::pathways.field_data_type])) AND (allowed_values IS NOT NULL) AND pathways.p2_valid_options(allowed_values)) OR ((data_type <> ALL (ARRAY['SELECT'::pathways.field_data_type, 'MULTIPLE_SELECT'::pathways.field_data_type])) AND (allowed_values IS NULL)))),
    CONSTRAINT fields_numeric_bounds CHECK ((((minimum_value IS NULL) OR ((minimum_value <> 'NaN'::numeric) AND (data_type = ANY (ARRAY['INTEGER'::pathways.field_data_type, 'DECIMAL'::pathways.field_data_type])))) AND ((maximum_value IS NULL) OR ((maximum_value <> 'NaN'::numeric) AND (data_type = ANY (ARRAY['INTEGER'::pathways.field_data_type, 'DECIMAL'::pathways.field_data_type])))) AND ((minimum_value IS NULL) OR (maximum_value IS NULL) OR (maximum_value >= minimum_value)))),
    CONSTRAINT fields_sequence CHECK ((sequence_no > 0)),
    CONSTRAINT form_fields_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT form_fields_date_bounds CHECK (((minimum_date IS NULL) OR (maximum_date IS NULL) OR (minimum_date <= maximum_date))),
    CONSTRAINT form_fields_label_not_blank CHECK ((btrim(label) <> ''::text)),
    CONSTRAINT form_fields_length_bounds CHECK ((((minimum_length IS NULL) OR ((minimum_length >= 0) AND (minimum_length <= 10000))) AND ((maximum_length IS NULL) OR ((maximum_length >= 1) AND (maximum_length <= 10000))) AND ((minimum_length IS NULL) OR (maximum_length IS NULL) OR (minimum_length <= maximum_length))))
);

ALTER TABLE pathways.form_fields OWNER TO prisma;

CREATE FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE text_value text; number_value numeric; element jsonb; item_count integer;
BEGIN
  IF value IS NULL OR value='null'::jsonb THEN RETURN NOT field.is_required; END IF;
  text_value:=value#>>'{}';
  CASE field.data_type
  WHEN 'TEXT','LONG_TEXT' THEN
    RETURN jsonb_typeof(value)='string'
      AND (NOT field.is_required OR btrim(text_value)<>'')
      AND char_length(btrim(text_value)) >= COALESCE(field.minimum_length,0)
      AND char_length(btrim(text_value)) <= COALESCE(
        field.maximum_length,CASE WHEN field.data_type='LONG_TEXT' THEN 10000 ELSE 2000 END
      );
  WHEN 'INTEGER' THEN
    IF jsonb_typeof(value)<>'number' OR text_value !~ '^-?(0|[1-9][0-9]*)$' THEN RETURN false; END IF;
    number_value:=text_value::numeric;
    RETURN number_value BETWEEN -2147483648 AND 2147483647
      AND (field.minimum_value IS NULL OR number_value>=field.minimum_value)
      AND (field.maximum_value IS NULL OR number_value<=field.maximum_value);
  WHEN 'DECIMAL' THEN
    IF jsonb_typeof(value) NOT IN ('number','string')
       OR text_value !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN RETURN false; END IF;
    number_value:=text_value::numeric;
    RETURN (field.minimum_value IS NULL OR number_value>=field.minimum_value)
      AND (field.maximum_value IS NULL OR number_value<=field.maximum_value);
  WHEN 'BOOLEAN' THEN RETURN jsonb_typeof(value)='boolean';
  WHEN 'DATE' THEN
    IF jsonb_typeof(value)<>'string' OR text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
    BEGIN
      RETURN to_char(text_value::date,'YYYY-MM-DD')=text_value
        AND text_value::date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
        AND (field.minimum_date IS NULL OR text_value::date>=field.minimum_date)
        AND (field.maximum_date IS NULL OR text_value::date<=field.maximum_date);
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
  WHEN 'SELECT' THEN
    RETURN jsonb_typeof(value)='string' AND field.allowed_values @> jsonb_build_array(value);
  WHEN 'MULTIPLE_SELECT' THEN
    IF jsonb_typeof(value)<>'array' THEN RETURN false; END IF;
    item_count:=jsonb_array_length(value);
    IF (field.is_required AND item_count=0)
       OR item_count<COALESCE(field.minimum_length,0)
       OR item_count>COALESCE(field.maximum_length,50)
       OR (SELECT count(*)<>count(DISTINCT v) FROM jsonb_array_elements(value) v) THEN RETURN false; END IF;
    FOR element IN SELECT v FROM jsonb_array_elements(value) v LOOP
      IF jsonb_typeof(element)<>'string' OR NOT field.allowed_values @> jsonb_build_array(element) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSE RETURN false;
  END CASE;
END
$_$;

ALTER FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) OWNER TO prisma;

CREATE FUNCTION pathways.p3_budget_totals(budget_id uuid) RETURNS TABLE(planned_budget numeric, actual_spending numeric, remaining_budget numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT b.planned_budget,coalesce(sum(e.amount),0),b.planned_budget-coalesce(sum(e.amount),0)
 FROM pathways.project_budget_records b LEFT JOIN pathways.budget_expense_entries e
 ON e.budget_record_id=b.id AND e.status='APPROVED'
 WHERE b.id=budget_id GROUP BY b.id
$$;

ALTER FUNCTION pathways.p3_budget_totals(budget_id uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT coalesce(CASE op
 WHEN 'LT' THEN value<minimum WHEN 'LTE' THEN value<=minimum
 WHEN 'EQ' THEN value=minimum WHEN 'GTE' THEN value>=minimum
 WHEN 'GT' THEN value>minimum WHEN 'BETWEEN' THEN value BETWEEN minimum AND maximum
 END,false)
$$;

ALTER FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric) OWNER TO prisma;

CREATE FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE rule pathways.alert_rules; condition pathways.alert_rule_conditions; key text; value jsonb;
 conditions jsonb:='[]'::jsonb; templates jsonb; matched boolean; condition_match boolean; observed_number numeric; condition_count integer:=0;
BEGIN
 SELECT * INTO rule FROM pathways.alert_rules WHERE id=rule_id;
 IF NOT FOUND OR rule.status<>'ACTIVE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation requires an active immutable rule version'; END IF;
 IF observed IS NULL OR jsonb_typeof(observed)<>'object' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Observed inputs must be a numeric metric object'; END IF;
 FOR key,value IN SELECT * FROM jsonb_each(observed) LOOP
  IF jsonb_typeof(value)<>'number' OR NOT EXISTS(SELECT FROM pathways.alert_rule_conditions c WHERE c.rule_id=rule.id AND c.metric::text=key) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Only declared numeric rule metrics are accepted';
  END IF;
 END LOOP;
 matched:=rule.match_mode='ALL';
 FOR condition IN SELECT * FROM pathways.alert_rule_conditions c WHERE c.rule_id=rule.id ORDER BY sequence,id LOOP
  condition_count:=condition_count+1;
  observed_number:=(observed->>condition.metric::text)::numeric;
  condition_match:=pathways.p3_condition_matches(condition.operator,observed_number,condition.threshold,condition.threshold_maximum);
  IF rule.match_mode='ALL' THEN matched:=matched AND condition_match; ELSE matched:=matched OR condition_match; END IF;
  conditions:=conditions||jsonb_build_array(jsonb_build_object(
   'id',condition.id,'sequence',condition.sequence,'metric',condition.metric,'operator',condition.operator,
   'threshold',condition.threshold,'threshold_maximum',condition.threshold_maximum,'description',condition.description,
   'observed',observed_number,'matched',condition_match));
 END LOOP;
 IF condition_count=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Empty rules cannot be evaluated'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'text',r.text,'type',r.type) ORDER BY r.id),'[]'::jsonb)
  INTO templates FROM pathways.alert_rule_recommendations r WHERE r.rule_id=rule.id;
 RETURN jsonb_build_object('schema_version',1,'rule',jsonb_build_object('id',rule.id,'organization_id',rule.organization_id,'code',rule.code,'version',rule.version,'name',rule.name,'description',rule.description,'type',rule.type,'match_mode',rule.match_mode,'severity',rule.severity),
  'observed_values',observed,'conditions',conditions,'recommendations',templates,'matched',matched);
END $$;

ALTER FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb) OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_actors() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE field text; value uuid;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  IF TG_OP='INSERT' OR (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN
   value := (to_jsonb(NEW)->>field)::uuid;
   IF value IS NOT NULL THEN
    PERFORM 1 FROM pathways.system_users
     WHERE id=value AND organization_id=NEW.organization_id AND account_status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Workflow actor must be an active profile in the same organization'; END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_actors() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_alert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE rule pathways.alert_rules;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluated rule snapshot is immutable'; END IF;
 SELECT * INTO rule FROM pathways.alert_rules WHERE id=NEW.rule_id FOR SHARE;
 IF NOT FOUND OR rule.organization_id<>NEW.organization_id OR rule.status<>'ACTIVE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Alert requires an active rule in its organization';
 END IF;
 NEW.evaluated_snapshot:=pathways.p3_evaluate_rule(NEW.rule_id,NEW.observed_values);
 IF NOT (NEW.evaluated_snapshot->>'matched')::boolean THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Nonmatching evaluation cannot create an alert'; END IF;
 NEW.severity:=rule.severity;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_alert() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_budget() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF OLD.archived_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['updated_at','archived_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','archived_at']) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Budget provenance is immutable; archive and record a new budget';
 END IF;
 IF NEW.archived_at IS NOT NULL AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE budget_record_id=OLD.id AND status IN ('PENDING','VERIFIED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Resolve open expense reviews before archiving the budget';
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_budget() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_criterion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Criterion version must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published criterion history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status<>'DRAFT' AND NOT (OLD.status='PUBLISHED' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'])=(to_jsonb(OLD)-ARRAY['status','archived_at','updated_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published criterion version is immutable';
  END IF;
  IF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','PUBLISHED') THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid criterion lifecycle';
  END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_criterion() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_decision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE alert pathways.rule_based_alerts; template pathways.alert_rule_recommendations;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'NEW' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must begin unreviewed'; END IF;
  IF NEW.alert_id IS NOT NULL THEN
   SELECT * INTO alert FROM pathways.rule_based_alerts WHERE id=NEW.alert_id FOR SHARE;
   IF NOT FOUND OR alert.organization_id<>NEW.organization_id OR alert.project_id<>NEW.project_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation and alert scope must agree';
   END IF;
  END IF;
  IF NEW.source_rule_recommendation_id IS NOT NULL THEN
   SELECT * INTO template FROM pathways.alert_rule_recommendations WHERE id=NEW.source_rule_recommendation_id FOR SHARE;
   IF NOT FOUND OR alert.id IS NULL OR template.organization_id<>NEW.organization_id OR template.rule_id<>alert.rule_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must come from the evaluated alert rule';
   END IF;
   SELECT x INTO NEW.source_snapshot FROM jsonb_array_elements(alert.evaluated_snapshot->'recommendations') x WHERE x->>'id'=template.id::text;
   IF NEW.source_snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation template is missing from evaluated history'; END IF;
   NEW.title:=NEW.source_snapshot->>'title'; NEW.text:=NEW.source_snapshot->>'text'; NEW.type:=(NEW.source_snapshot->>'type')::pathways.recommendation_type;
  END IF;
 ELSE
  IF NOT ((OLD.status='NEW' AND NEW.status='REVIEWED') OR (OLD.status='REVIEWED' AND NEW.status IN ('RESOLVED','DISMISSED'))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A human review is required before a recommendation outcome';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note']) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation content and evaluated provenance are immutable';
  END IF;
  IF OLD.status='REVIEWED' AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_note) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_note) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation review history is immutable';
  END IF;
 END IF;
 -- This guard records human decisions only. It deliberately performs no DML.
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_decision() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_evaluation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE weights numeric; result numeric; count_scores bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','SUBMITTED') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must be submitted before review'; END IF;
   IF NEW.status='SUBMITTED' THEN
    SELECT sum((criterion_snapshot->>'weight_percentage')::numeric),sum(weighted_score),count(*)
     INTO weights,result,count_scores FROM pathways.project_evaluation_scores WHERE evaluation_id=NEW.id;
    IF count_scores=0 OR weights<>100 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation submission requires criteria weights totaling 100'; END IF;
    NEW.overall_score:=round(result,4);
   END IF;
  ELSE
   IF NOT ((OLD.status='SUBMITTED' AND NEW.status='REVIEWED')
    OR (OLD.status='REVIEWED' AND NEW.status='SIGNED_OFF')
    OR (OLD.status='SIGNED_OFF' AND NEW.status='ARCHIVED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation content is immutable';
   END IF;
   IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation snapshot and evaluator history are immutable';
   END IF;
   IF OLD.status IN ('REVIEWED','SIGNED_OFF') AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_feedback) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_feedback) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation review history is immutable';
   END IF;
   IF OLD.status='SIGNED_OFF' AND ROW(NEW.signed_off_by_id,NEW.signed_off_at) IS DISTINCT FROM ROW(OLD.signed_off_by_id,OLD.signed_off_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Signoff history is immutable';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_evaluation() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id
 OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
 OR (to_jsonb(NEW)->'project_id') IS DISTINCT FROM (to_jsonb(OLD)->'project_id')
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Phase 3 identity, organization, project, and creation time are immutable';
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_identity() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_public_evidence() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.public_visibility_status<>'PRIVATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evidence must start PRIVATE'; END IF;
 ELSE
  IF NEW.public_visibility_status=OLD.public_visibility_status THEN
   IF ROW(NEW.public_submitted_by_id,NEW.public_submitted_at,NEW.public_approved_by_id,NEW.public_approved_at,NEW.published_by_id,NEW.published_at)
    IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at,OLD.public_approved_by_id,OLD.public_approved_at,OLD.published_by_id,OLD.published_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public workflow history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.public_visibility_status='PRIVATE' AND NEW.public_visibility_status='FOR_REVIEW')
    OR (OLD.public_visibility_status='FOR_REVIEW' AND NEW.public_visibility_status='APPROVED')
    OR (OLD.public_visibility_status='APPROVED' AND NEW.public_visibility_status='PUBLISHED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public review, approval, and publication are separate transitions';
   END IF;
   IF OLD.public_visibility_status<>'PRIVATE' AND ROW(NEW.public_submitted_by_id,NEW.public_submitted_at) IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public submission history is immutable';
   END IF;
   IF OLD.public_visibility_status='APPROVED' AND ROW(NEW.public_approved_by_id,NEW.public_approved_at) IS DISTINCT FROM ROW(OLD.public_approved_by_id,OLD.public_approved_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public approval history is immutable';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_public_evidence() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_report() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE form pathways.digital_forms;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Report must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Generated report history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','GENERATED') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid report lifecycle'; END IF;
  ELSIF NOT (OLD.status='GENERATED' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'])=(to_jsonb(OLD)-ARRAY['status','archived_at','updated_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Generated report artifact and context are immutable';
  END IF;
 END IF;
 IF NEW.form_id IS NOT NULL THEN
  SELECT * INTO form FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
  IF NOT FOUND OR form.organization_id<>NEW.organization_id OR form.project_id IS DISTINCT FROM NEW.project_id OR form.status='DRAFT'
   OR form.activity_id IS DISTINCT FROM NEW.activity_id OR form.journey_stage_id IS DISTINCT FROM NEW.journey_stage_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Report must preserve published form version and activity/stage context';
  END IF;
 END IF;
 IF NEW.type='SURVEY_FORM_RESULTS' AND (NEW.form_id IS NULL OR NOT NEW.aggregate_only) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Survey reports require a form version and aggregate-only output';
 END IF;
 IF NEW.type='EVALUATION_REPORT' AND NEW.evaluation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation report requires an evaluation'; END IF;
 IF NEW.evaluation_id IS NOT NULL THEN
  PERFORM 1 FROM pathways.project_evaluations WHERE id=NEW.evaluation_id AND status IN ('SIGNED_OFF','ARCHIVED') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation report requires a signed-off evaluation'; END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_report() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_review() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE allowed text[] := ARRAY['updated_at','status','verified_by_id','verified_at','approved_by_id','approved_at','rejected_by_id','rejected_at','rejection_reason']; proof pathways.evidence_media;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review records must begin PENDING'; END IF;
 ELSE
  IF TG_TABLE_NAME='evidence_media' THEN
   allowed:=allowed||ARRAY['storage_ready','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'];
   IF OLD.storage_ready AND NOT NEW.storage_ready THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Stored evidence cannot be unfinalized'; END IF;
  ELSIF OLD.status='PENDING' THEN allowed:=allowed||ARRAY['receipt_evidence_id']; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted financial/evidence provenance is immutable';
  END IF;
  IF NEW.status=OLD.status THEN
   IF (to_jsonb(NEW)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review actor history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','REJECTED'))) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid review transition';
   END IF;
   IF OLD.status='VERIFIED' AND (NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verification history is immutable';
   END IF;
   IF OLD.status='PENDING' AND NEW.status='REJECTED' AND NEW.verified_by_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cannot manufacture earlier verification';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='budget_expense_entries' THEN
  PERFORM 1 FROM pathways.project_budget_records WHERE id=NEW.budget_record_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense requires a nonarchived budget'; END IF;
  IF NEW.receipt_evidence_id IS NOT NULL THEN
   SELECT * INTO proof FROM pathways.evidence_media WHERE id=NEW.receipt_evidence_id FOR SHARE;
   IF NOT FOUND OR proof.organization_id<>NEW.organization_id OR proof.project_id<>NEW.project_id OR proof.expense_id IS DISTINCT FROM NEW.id
    OR proof.submitted_by_id<>NEW.submitted_by_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt must belong to this expense, scope and submitter';
   END IF;
  END IF;
  IF NEW.status IN ('VERIFIED','APPROVED') AND (NEW.receipt_evidence_id IS NULL OR proof.status NOT IN ('VERIFIED','APPROVED')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verified private receipt evidence is required';
  END IF;
 ELSIF NEW.status='REJECTED' AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE receipt_evidence_id=NEW.id AND status IN ('VERIFIED','APPROVED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt supporting verified financial history cannot be rejected';
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_review() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_rule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule version must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','ACTIVE') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid rule lifecycle'; END IF;
   IF NEW.status='ACTIVE' AND (
    NOT EXISTS(SELECT FROM pathways.alert_rule_conditions WHERE rule_id=NEW.id)
    OR NOT EXISTS(SELECT FROM pathways.alert_rule_recommendations WHERE rule_id=NEW.id)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activation requires conditions and a human-review recommendation template';
   END IF;
  ELSIF NOT (OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['updated_at','status','archived_at'])=(to_jsonb(OLD)-ARRAY['updated_at','status','archived_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule version is immutable; create a new version';
  END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_rule() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_rule_child() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE parent pathways.alert_rules; rule_id uuid;
BEGIN
 rule_id:=CASE WHEN TG_OP='DELETE' THEN OLD.rule_id ELSE NEW.rule_id END;
 SELECT * INTO parent FROM pathways.alert_rules WHERE id=rule_id FOR UPDATE;
 IF NOT FOUND OR parent.status<>'DRAFT' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Conditions and recommendation templates are immutable after activation';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF parent.organization_id<>NEW.organization_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child organization mismatch'; END IF;
 IF TG_OP='UPDATE' AND NEW.rule_id<>OLD.rule_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child cannot be reassigned'; END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_rule_child() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_score() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE evaluation pathways.project_evaluations; criterion pathways.project_evaluation_criteria; evaluation_id uuid;
BEGIN
 evaluation_id:=CASE WHEN TG_OP='DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
 SELECT * INTO evaluation FROM pathways.project_evaluations WHERE id=evaluation_id FOR UPDATE;
 IF NOT FOUND OR evaluation.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Scores may change only while their evaluation is DRAFT'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.evaluation_id,NEW.criterion_id) IS DISTINCT FROM ROW(OLD.evaluation_id,OLD.criterion_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Score ownership and criterion version are immutable';
 END IF;
 SELECT * INTO criterion FROM pathways.project_evaluation_criteria WHERE id=NEW.criterion_id FOR SHARE;
 IF NOT FOUND OR criterion.status<>'PUBLISHED' OR criterion.organization_id<>NEW.organization_id OR criterion.project_id<>NEW.project_id THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Score requires a published criterion in the same project';
 END IF;
 IF evaluation.organization_id<>NEW.organization_id OR evaluation.project_id<>NEW.project_id THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cross-scope evaluation score rejected';
 END IF;
 NEW.maximum_score:=criterion.maximum_score;
 NEW.weighted_score:=round(NEW.score/criterion.maximum_score*criterion.weight_percentage,4);
 NEW.criterion_snapshot:=jsonb_build_object('id',criterion.id,'code',criterion.code,'version',criterion.version,'type',criterion.type,'name',criterion.name,'description',criterion.description,'weight_percentage',criterion.weight_percentage,'maximum_score',criterion.maximum_score);
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_score() OWNER TO prisma;

CREATE FUNCTION pathways.p3_guard_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE submission pathways.form_submissions; form pathways.digital_forms; expense pathways.budget_expense_entries; budget pathways.project_budget_records;
BEGIN
 IF TG_TABLE_NAME='assessment_results' AND TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recorded assessment provenance is immutable';
 END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 IF NEW.source_submission_id IS NOT NULL THEN
  SELECT * INTO submission FROM pathways.form_submissions WHERE id=NEW.source_submission_id FOR SHARE;
  IF NOT FOUND OR submission.organization_id<>NEW.organization_id OR submission.project_id<>NEW.project_id
   OR submission.status NOT IN ('VALIDATED','PROCESSED') OR submission.is_dummy_record
   OR submission.enrollment_id IS DISTINCT FROM NEW.enrollment_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Source must be a validated nondummy submission for this scope and enrollment';
  END IF;
  SELECT * INTO form FROM pathways.digital_forms WHERE id=submission.form_id FOR SHARE;
  IF form.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Assessment/evidence activity must agree with its source form';
  END IF;
 END IF;
 IF TG_TABLE_NAME='evidence_media' THEN
 IF NEW.expense_id IS NOT NULL THEN
  SELECT * INTO expense FROM pathways.budget_expense_entries WHERE id=NEW.expense_id FOR SHARE;
  SELECT * INTO budget FROM pathways.project_budget_records WHERE id=expense.budget_record_id FOR SHARE;
  IF expense.id IS NULL OR expense.organization_id<>NEW.organization_id OR expense.project_id<>NEW.project_id OR expense.submitted_by_id<>NEW.submitted_by_id
   OR budget.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense evidence must agree with its expense and budget provenance';
  END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_source() OWNER TO prisma;

CREATE FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $_$
 SELECT bucket = 'pathways-private'
 AND kind IN ('evidence','reports')
 AND object_key LIKE 'organizations/' || org::text || '/projects/' || coalesce(project::text,'organization') || '/' || kind || '/' || entity::text || '/%'
 AND length(object_key) <= 500
 AND split_part(object_key,'/',7) ~ '^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]{1,10})?$'
 AND array_length(string_to_array(object_key,'/'),1) = 7
$_$;

ALTER FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid) OWNER TO prisma;

CREATE FUNCTION pathways.p3_reject_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Preserve Phase 3 history; deletion is not permitted';
END $$;

ALTER FUNCTION pathways.p3_reject_delete() OWNER TO prisma;

CREATE FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    SET row_security TO 'on'
    AS $$
BEGIN
  -- The API has verified the JWT before setting this transaction-local subject.
  -- auth.uid() supplies a consistency check, not cryptographic authentication.
  -- Runtime credentials/arbitrary SQL must remain inaccessible to end users.
  IF session_user <> 'pathways_runtime' OR p_subject IS NULL OR p_session IS NULL
     OR auth.uid() IS DISTINCT FROM p_subject THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT FROM auth.sessions AS s
    WHERE s.id = p_session AND s.user_id = p_subject
      AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END
$$;

ALTER FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid) OWNER TO postgres;

COMMENT ON FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid) IS 'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1';

CREATE FUNCTION pathways.runtime_context_organization() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  requested_organization uuid;
  requested_user uuid;
  authenticated_user uuid;
  result uuid;
BEGIN
  requested_organization := nullif(current_setting('app.organization_id',true),'')::uuid;
  requested_user := nullif(current_setting('app.user_id',true),'')::uuid;
  authenticated_user := auth.uid();
  IF requested_organization IS NULL OR requested_user IS NULL OR authenticated_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.organization_id INTO result
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.id=requested_user AND u.auth_user_id=authenticated_user
    AND u.organization_id=requested_organization AND u.account_status='ACTIVE'
    AND u.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
    AND r.is_active;
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$$;

ALTER FUNCTION pathways.runtime_context_organization() OWNER TO postgres;

CREATE FUNCTION pathways.runtime_context_user() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  requested_organization uuid;
  requested_user uuid;
  authenticated_user uuid;
  result uuid;
BEGIN
  requested_organization := nullif(current_setting('app.organization_id',true),'')::uuid;
  requested_user := nullif(current_setting('app.user_id',true),'')::uuid;
  authenticated_user := auth.uid();
  IF requested_organization IS NULL OR requested_user IS NULL OR authenticated_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.id INTO result
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.id=requested_user AND u.auth_user_id=authenticated_user
    AND u.organization_id=requested_organization AND u.account_status='ACTIVE'
    AND u.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
    AND r.is_active;
  RETURN result;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$$;

ALTER FUNCTION pathways.runtime_context_user() OWNER TO postgres;

CREATE TABLE pathways.activity_indicator_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    indicator_id uuid NOT NULL,
    created_by_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY pathways.activity_indicator_links FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.activity_indicator_links OWNER TO prisma;

CREATE TABLE pathways.activity_journey_stage_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    sequence_order integer NOT NULL,
    created_by_id uuid,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT stage_mapping_sequence CHECK ((sequence_order > 0))
);

ALTER TABLE pathways.activity_journey_stage_mappings OWNER TO prisma;

CREATE TABLE pathways.activity_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    client_update_id uuid NOT NULL,
    progress_percent integer NOT NULL,
    note text NOT NULL,
    status pathways.review_status DEFAULT 'PENDING'::pathways.review_status NOT NULL,
    submitted_by_id uuid NOT NULL,
    submitted_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_by_id uuid,
    reviewed_at timestamp(3) with time zone,
    review_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT activity_updates_values_check CHECK ((((progress_percent >= 0) AND (progress_percent <= 100)) AND ((length(btrim(note)) >= 1) AND (length(btrim(note)) <= 4000)) AND (((status = 'PENDING'::pathways.review_status) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_reason IS NULL)) OR ((status = ANY (ARRAY['APPROVED'::pathways.review_status, 'REJECTED'::pathways.review_status])) AND (reviewed_by_id IS NOT NULL) AND (reviewed_by_id <> submitted_by_id) AND (reviewed_at >= submitted_at) AND (review_reason IS NOT NULL) AND ((length(btrim(review_reason)) >= 1) AND (length(btrim(review_reason)) <= 1000)))) AND (status <> 'VERIFIED'::pathways.review_status)))
);

ALTER TABLE ONLY pathways.activity_updates FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.activity_updates OWNER TO prisma;

CREATE TABLE pathways.alert_rule_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    sequence integer NOT NULL,
    metric pathways.rule_metric NOT NULL,
    operator pathways.rule_operator NOT NULL,
    threshold numeric(18,4) NOT NULL,
    threshold_maximum numeric(18,4),
    description text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_condition_values CHECK (((sequence > 0) AND (threshold <> 'NaN'::numeric) AND (((operator = 'BETWEEN'::pathways.rule_operator) AND (threshold_maximum IS NOT NULL) AND (threshold_maximum >= threshold) AND (threshold_maximum <> 'NaN'::numeric)) OR ((operator <> 'BETWEEN'::pathways.rule_operator) AND (threshold_maximum IS NULL)))))
);

ALTER TABLE pathways.alert_rule_conditions OWNER TO prisma;

CREATE TABLE pathways.alert_rule_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    title text NOT NULL,
    text text NOT NULL,
    type pathways.recommendation_type DEFAULT 'SUGGESTED_ACTION'::pathways.recommendation_type NOT NULL,
    created_by_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_rule_recommendation_values CHECK (((length(btrim(title)) > 0) AND (length(btrim(text)) > 0)))
);

ALTER TABLE pathways.alert_rule_recommendations OWNER TO prisma;

CREATE TABLE pathways.alert_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    version integer NOT NULL,
    name text NOT NULL,
    description text,
    type pathways.alert_rule_type NOT NULL,
    match_mode pathways.rule_match_mode NOT NULL,
    severity pathways.alert_severity DEFAULT 'MEDIUM'::pathways.alert_severity NOT NULL,
    status pathways.rule_status DEFAULT 'DRAFT'::pathways.rule_status NOT NULL,
    created_by_id uuid NOT NULL,
    activated_by_id uuid,
    activated_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_rule_times CHECK (((status = 'ARCHIVED'::pathways.rule_status) = (archived_at IS NOT NULL))),
    CONSTRAINT p3_rule_values CHECK (((version > 0) AND (length(btrim(code)) > 0) AND (length(btrim(name)) > 0) AND (((status = 'DRAFT'::pathways.rule_status) AND (activated_by_id IS NULL) AND (activated_at IS NULL) AND (archived_at IS NULL)) OR ((status = 'ACTIVE'::pathways.rule_status) AND (activated_by_id IS NOT NULL) AND (activated_at IS NOT NULL) AND (archived_at IS NULL)) OR ((status = 'ARCHIVED'::pathways.rule_status) AND (activated_by_id IS NOT NULL) AND (activated_at IS NOT NULL) AND (archived_at >= activated_at)))))
);

ALTER TABLE pathways.alert_rules OWNER TO prisma;

CREATE TABLE pathways.assessment_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid,
    enrollment_id uuid,
    source_submission_id uuid,
    type pathways.assessment_type NOT NULL,
    score numeric(18,4) NOT NULL,
    maximum_score numeric(18,4) NOT NULL,
    assessment_date date NOT NULL,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_assessment_values CHECK (((maximum_score > (0)::numeric) AND (maximum_score <> 'NaN'::numeric) AND ((score >= (0)::numeric) AND (score <= maximum_score))))
);

ALTER TABLE pathways.assessment_results OWNER TO prisma;

CREATE TABLE pathways.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_user_id uuid,
    project_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    changes jsonb,
    ip_address text,
    occurred_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT audit_logs_action_not_blank_check CHECK ((btrim(action) <> ''::text)),
    CONSTRAINT audit_logs_changes_object_check CHECK (((changes IS NULL) OR (jsonb_typeof(changes) = 'object'::text))),
    CONSTRAINT audit_logs_entity_type_not_blank_check CHECK ((btrim(entity_type) <> ''::text))
);

ALTER TABLE pathways.audit_logs OWNER TO prisma;

CREATE TABLE pathways.beneficiaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    first_name text,
    middle_name text,
    last_name text,
    sex pathways.beneficiary_sex DEFAULT 'NOT_SPECIFIED'::pathways.beneficiary_sex NOT NULL,
    birth_date date,
    age_at_registration integer,
    disability_status pathways.disability_status DEFAULT 'NOT_SPECIFIED'::pathways.disability_status NOT NULL,
    location_barangay text,
    location_city_municipality text,
    location_province text,
    status pathways.profile_status DEFAULT 'ACTIVE'::pathways.profile_status NOT NULL,
    consent_recorded boolean DEFAULT false NOT NULL,
    is_minor boolean DEFAULT false NOT NULL,
    guardian_consent_recorded boolean DEFAULT false NOT NULL,
    is_dummy_record boolean DEFAULT false NOT NULL,
    created_by_id uuid,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    subject_type pathways.beneficiary_subject_type DEFAULT 'UNSPECIFIED_LEGACY'::pathways.beneficiary_subject_type NOT NULL,
    display_name text,
    data_processing_consent_recorded boolean DEFAULT false NOT NULL,
    CONSTRAINT beneficiaries_age CHECK (((age_at_registration IS NULL) OR ((age_at_registration >= 0) AND (age_at_registration <= 130)))),
    CONSTRAINT beneficiaries_archive CHECK (((status = 'ARCHIVED'::pathways.profile_status) = (archived_at IS NOT NULL))),
    CONSTRAINT beneficiaries_birth_date CHECK (((birth_date IS NULL) OR (birth_date <= (created_at)::date))),
    CONSTRAINT beneficiaries_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT beneficiaries_minor_consent CHECK (((NOT guardian_consent_recorded) OR (is_minor AND consent_recorded)))
);

ALTER TABLE pathways.beneficiaries OWNER TO prisma;

CREATE TABLE pathways.beneficiary_activity_participations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    attendance_status pathways.attendance_status DEFAULT 'PRESENT'::pathways.attendance_status NOT NULL,
    participation_date date NOT NULL,
    progress_status pathways.progress_status DEFAULT 'IN_PROGRESS'::pathways.progress_status NOT NULL,
    progress_notes text,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source_submission_id uuid
);

ALTER TABLE pathways.beneficiary_activity_participations OWNER TO prisma;

CREATE TABLE pathways.beneficiary_consent_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    beneficiary_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    kind pathways.beneficiary_consent_kind NOT NULL,
    source pathways.beneficiary_record_source NOT NULL,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT beneficiary_consent_records_recorded_check CHECK ((recorded_at <= created_at))
);

ALTER TABLE ONLY pathways.beneficiary_consent_records FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_consent_records OWNER TO prisma;

CREATE TABLE pathways.beneficiary_identifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    beneficiary_id uuid NOT NULL,
    identifier_type text NOT NULL,
    normalized_value text NOT NULL,
    display_value text NOT NULL,
    source pathways.beneficiary_record_source NOT NULL,
    created_by_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT beneficiary_identifiers_format CHECK (((identifier_type ~ '^[A-Z][A-Z0-9_]{1,31}$'::text) AND (identifier_type <> ALL (ARRAY['PATHWAYS_CODE'::text, 'EMAIL'::text, 'NAME'::text, 'BIRTH_DATE'::text])) AND ((length(normalized_value) >= 1) AND (length(normalized_value) <= 160)) AND (normalized_value = btrim(normalized_value)) AND ((length(display_value) >= 1) AND (length(display_value) <= 160))))
);

ALTER TABLE ONLY pathways.beneficiary_identifiers FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_identifiers OWNER TO prisma;

CREATE TABLE pathways.beneficiary_journey_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    activity_id uuid,
    stage_id uuid,
    participation_id uuid,
    event_type pathways.journey_event_type NOT NULL,
    event_date date NOT NULL,
    description text,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    stage_code_snapshot text,
    stage_name_snapshot text,
    activity_code_snapshot text,
    activity_title_snapshot text,
    corrects_event_id uuid,
    correction_reason text,
    CONSTRAINT beneficiary_journey_events_correction_check CHECK ((((corrects_event_id IS NULL) AND (correction_reason IS NULL)) OR ((corrects_event_id IS NOT NULL) AND (correction_reason IS NOT NULL) AND ((length(btrim(correction_reason)) >= 1) AND (length(btrim(correction_reason)) <= 1000))))),
    CONSTRAINT journey_event_participation CHECK (((participation_id IS NULL) OR (activity_id IS NOT NULL)))
);

ALTER TABLE pathways.beneficiary_journey_events OWNER TO prisma;

CREATE TABLE pathways.beneficiary_project_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    beneficiary_id uuid NOT NULL,
    enrollment_date date NOT NULL,
    status pathways.enrollment_status DEFAULT 'ACTIVE'::pathways.enrollment_status NOT NULL,
    ended_date date,
    end_reason text,
    remarks text,
    recorded_by_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT enrollments_state CHECK ((((status = 'ACTIVE'::pathways.enrollment_status) AND (ended_date IS NULL) AND (end_reason IS NULL)) OR ((status <> 'ACTIVE'::pathways.enrollment_status) AND (ended_date IS NOT NULL) AND (ended_date >= enrollment_date) AND (end_reason IS NOT NULL) AND (btrim(end_reason) <> ''::text))))
);

ALTER TABLE pathways.beneficiary_project_enrollments OWNER TO prisma;

CREATE TABLE pathways.budget_expense_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    budget_record_id uuid NOT NULL,
    description text NOT NULL,
    amount numeric(18,2) NOT NULL,
    expense_date date NOT NULL,
    receipt_evidence_id uuid,
    status pathways.review_status DEFAULT 'PENDING'::pathways.review_status NOT NULL,
    submitted_by_id uuid NOT NULL,
    submitted_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_by_id uuid,
    verified_at timestamp(3) with time zone,
    approved_by_id uuid,
    approved_at timestamp(3) with time zone,
    rejected_by_id uuid,
    rejected_at timestamp(3) with time zone,
    rejection_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_expense_review CHECK ((((verified_by_id IS NULL) = (verified_at IS NULL)) AND ((approved_by_id IS NULL) = (approved_at IS NULL)) AND ((rejected_by_id IS NULL) = (rejected_at IS NULL)) AND ((verified_by_id IS NULL) OR ((verified_by_id <> submitted_by_id) AND (verified_at >= submitted_at))) AND ((approved_by_id IS NULL) OR ((approved_by_id <> submitted_by_id) AND (approved_by_id <> verified_by_id) AND (approved_at >= verified_at))) AND ((rejected_by_id IS NULL) OR ((rejected_by_id <> submitted_by_id) AND (rejected_at >= COALESCE(verified_at, submitted_at)))) AND (((status = 'PENDING'::pathways.review_status) AND (verified_by_id IS NULL) AND (approved_by_id IS NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'VERIFIED'::pathways.review_status) AND (verified_by_id IS NOT NULL) AND (approved_by_id IS NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'APPROVED'::pathways.review_status) AND (verified_by_id IS NOT NULL) AND (approved_by_id IS NOT NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'REJECTED'::pathways.review_status) AND (approved_by_id IS NULL) AND (rejected_by_id IS NOT NULL) AND (rejection_reason IS NOT NULL) AND (length(btrim(rejection_reason)) > 0))))),
    CONSTRAINT p3_expense_values CHECK (((length(btrim(description)) > 0) AND (amount > (0)::numeric) AND (amount <> 'NaN'::numeric)))
);

ALTER TABLE pathways.budget_expense_entries OWNER TO prisma;

CREATE TABLE pathways.data_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    source_system pathways.import_source DEFAULT 'SPREADSHEET'::pathways.import_source NOT NULL,
    original_file_name text NOT NULL,
    file_type pathways.import_file_type DEFAULT 'CSV'::pathways.import_file_type NOT NULL,
    uploaded_by_id uuid NOT NULL,
    status pathways.import_status DEFAULT 'UPLOADING'::pathways.import_status NOT NULL,
    validation_notes text,
    uploaded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    validated_at timestamp(3) with time zone,
    processed_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    form_version integer NOT NULL,
    source_checksum character(64) NOT NULL,
    client_import_id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_bucket text NOT NULL,
    storage_object_key text NOT NULL,
    storage_status pathways.import_storage_status DEFAULT 'RESERVED'::pathways.import_storage_status NOT NULL,
    source_headers jsonb DEFAULT '[]'::jsonb NOT NULL,
    reviewed_by_id uuid,
    mapping_revision integer DEFAULT 0 NOT NULL,
    validation_revision integer DEFAULT 0 NOT NULL,
    validated_mapping_revision integer,
    processing_revision integer DEFAULT 0 NOT NULL,
    processing_claim_id uuid,
    processing_claimed_at timestamp(3) with time zone,
    processing_attempts integer DEFAULT 0 NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    processed_rows integer DEFAULT 0 NOT NULL,
    unprocessed_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    failure_code text,
    CONSTRAINT data_import_batches_checksum_check CHECK ((source_checksum ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT data_import_batches_count_check CHECK (((total_rows >= 0) AND (valid_rows >= 0) AND (invalid_rows >= 0) AND (processed_rows >= 0) AND (unprocessed_rows >= 0) AND (failed_rows >= 0) AND ((valid_rows + invalid_rows) <= total_rows) AND (((processed_rows + unprocessed_rows) + failed_rows) <= total_rows))),
    CONSTRAINT data_import_batches_original_file_name_not_blank CHECK ((btrim(original_file_name) <> ''::text)),
    CONSTRAINT data_import_batches_review_check CHECK ((((validated_mapping_revision IS NULL) AND (reviewed_by_id IS NULL)) OR ((validated_mapping_revision IS NOT NULL) AND (reviewed_by_id IS NOT NULL)))),
    CONSTRAINT data_import_batches_revision_check CHECK (((form_version > 0) AND (mapping_revision >= 0) AND (validation_revision >= 0) AND (processing_revision >= 0) AND ((processing_attempts >= 0) AND (processing_attempts <= 3)))),
    CONSTRAINT import_batches_state CHECK ((((status = 'UPLOADING'::pathways.import_status) AND (storage_status = 'RESERVED'::pathways.import_storage_status) AND (total_rows = 0) AND (validated_at IS NULL) AND (processed_at IS NULL) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = ANY (ARRAY['UPLOADED'::pathways.import_status, 'MAPPED'::pathways.import_status])) AND ((storage_status = 'STORED'::pathways.import_storage_status) OR ((storage_status = 'FAILED'::pathways.import_storage_status) AND (storage_bucket = 'legacy-unavailable'::text) AND (storage_object_key ~~ 'legacy/%'::text))) AND (validated_at IS NULL) AND (processed_at IS NULL) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'VALIDATED'::pathways.import_status) AND ((storage_status = 'STORED'::pathways.import_storage_status) OR ((storage_status = 'FAILED'::pathways.import_storage_status) AND (storage_bucket = 'legacy-unavailable'::text) AND (storage_object_key ~~ 'legacy/%'::text))) AND (validated_at IS NOT NULL) AND (validated_at >= uploaded_at) AND (processed_at IS NULL) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'PROCESSING'::pathways.import_status) AND (storage_status = 'STORED'::pathways.import_storage_status) AND (validated_at IS NOT NULL) AND (validated_at >= uploaded_at) AND (processed_at IS NULL) AND (processing_claim_id IS NOT NULL) AND (processing_claimed_at IS NOT NULL)) OR ((status = 'PARTIALLY_PROCESSED'::pathways.import_status) AND (storage_status = 'STORED'::pathways.import_storage_status) AND (validated_at IS NOT NULL) AND (validated_at >= uploaded_at) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'PROCESSED'::pathways.import_status) AND ((storage_status = 'STORED'::pathways.import_storage_status) OR ((storage_status = 'FAILED'::pathways.import_storage_status) AND (storage_bucket = 'legacy-unavailable'::text) AND (storage_object_key ~~ 'legacy/%'::text))) AND (validated_at IS NOT NULL) AND (processed_at IS NOT NULL) AND (validated_at >= uploaded_at) AND (processed_at >= validated_at) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'RECOVERY_REQUIRED'::pathways.import_status) AND (storage_status = 'RECOVERY_REQUIRED'::pathways.import_storage_status) AND (processed_at IS NULL) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'FAILED'::pathways.import_status) AND (storage_status = ANY (ARRAY['STORED'::pathways.import_storage_status, 'FAILED'::pathways.import_storage_status])) AND (processed_at IS NULL) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL))))
);

ALTER TABLE pathways.data_import_batches OWNER TO prisma;

CREATE TABLE pathways.data_import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    import_batch_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw_data jsonb NOT NULL,
    status pathways.import_row_status DEFAULT 'PENDING'::pathways.import_row_status NOT NULL,
    validation_errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    validated_by_id uuid,
    validated_at timestamp(3) with time zone,
    processed_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source_checksum character(64) NOT NULL,
    normalized_data jsonb,
    mapping_revision integer DEFAULT 0 NOT NULL,
    validation_revision integer DEFAULT 0 NOT NULL,
    processing_claim_id uuid,
    processing_claimed_at timestamp(3) with time zone,
    processing_attempts integer DEFAULT 0 NOT NULL,
    processing_error_code text,
    CONSTRAINT data_import_rows_checksum_check CHECK ((source_checksum ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT data_import_rows_number_check CHECK ((row_number >= 1)),
    CONSTRAINT data_import_rows_revision_check CHECK (((mapping_revision >= 0) AND (validation_revision >= 0) AND ((processing_attempts >= 0) AND (processing_attempts <= 3)))),
    CONSTRAINT import_rows_shape CHECK (((row_number > 0) AND (jsonb_typeof(raw_data) = 'object'::text) AND (jsonb_typeof(validation_errors) = 'array'::text))),
    CONSTRAINT import_rows_state CHECK ((((status = 'PENDING'::pathways.import_row_status) AND (normalized_data IS NULL) AND (validated_by_id IS NULL) AND (validated_at IS NULL) AND (processed_at IS NULL) AND (jsonb_array_length(validation_errors) = 0) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'INVALID'::pathways.import_row_status) AND (normalized_data IS NULL) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (processed_at IS NULL) AND (jsonb_array_length(validation_errors) > 0) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'VALID'::pathways.import_row_status) AND ((jsonb_typeof(normalized_data) = 'object'::text) OR ((normalized_data IS NULL) AND (validation_revision = 0))) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (processed_at IS NULL) AND (jsonb_array_length(validation_errors) = 0) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = ANY (ARRAY['UNPROCESSED'::pathways.import_row_status, 'FAILED'::pathways.import_row_status])) AND (jsonb_typeof(normalized_data) = 'object'::text) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (processed_at IS NULL) AND (jsonb_array_length(validation_errors) = 0) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL)) OR ((status = 'PROCESSING'::pathways.import_row_status) AND (jsonb_typeof(normalized_data) = 'object'::text) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (processed_at IS NULL) AND (jsonb_array_length(validation_errors) = 0) AND (processing_claim_id IS NOT NULL) AND (processing_claimed_at IS NOT NULL)) OR ((status = 'PROCESSED'::pathways.import_row_status) AND ((jsonb_typeof(normalized_data) = 'object'::text) OR ((normalized_data IS NULL) AND (validation_revision = 0))) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (processed_at IS NOT NULL) AND (processed_at >= validated_at) AND (jsonb_array_length(validation_errors) = 0) AND (processing_claim_id IS NULL) AND (processing_claimed_at IS NULL))))
);

ALTER TABLE pathways.data_import_rows OWNER TO prisma;

CREATE TABLE pathways.decision_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    alert_id uuid,
    source_rule_recommendation_id uuid,
    title text NOT NULL,
    text text NOT NULL,
    basis pathways.recommendation_basis NOT NULL,
    type pathways.recommendation_type DEFAULT 'SUGGESTED_ACTION'::pathways.recommendation_type NOT NULL,
    source_snapshot jsonb,
    proposed_by_id uuid NOT NULL,
    proposed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status pathways.decision_status DEFAULT 'NEW'::pathways.decision_status NOT NULL,
    reviewed_by_id uuid,
    reviewed_at timestamp(3) with time zone,
    review_note text,
    outcome pathways.decision_outcome,
    outcome_by_id uuid,
    outcome_at timestamp(3) with time zone,
    outcome_note text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_decision_times CHECK ((((reviewed_by_id IS NULL) = (reviewed_at IS NULL)) AND ((outcome_by_id IS NULL) = (outcome_at IS NULL)))),
    CONSTRAINT p3_decision_values CHECK (((length(btrim(title)) > 0) AND (length(btrim(text)) > 0) AND (((source_rule_recommendation_id IS NULL) AND (source_snapshot IS NULL)) OR ((source_rule_recommendation_id IS NOT NULL) AND (alert_id IS NOT NULL) AND (jsonb_typeof(source_snapshot) = 'object'::text))) AND (((status = 'NEW'::pathways.decision_status) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_note IS NULL) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = 'REVIEWED'::pathways.decision_status) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = ANY (ARRAY['RESOLVED'::pathways.decision_status, 'DISMISSED'::pathways.decision_status])) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NOT NULL) AND (outcome_by_id IS NOT NULL) AND (outcome_at >= reviewed_at) AND (outcome_note IS NOT NULL) AND (length(btrim(outcome_note)) > 0))) AND ((reviewed_by_id IS NULL) OR (reviewed_by_id <> proposed_by_id)) AND ((outcome_by_id IS NULL) OR (outcome_by_id <> proposed_by_id)) AND ((status <> 'DISMISSED'::pathways.decision_status) OR (outcome = 'DECLINE'::pathways.decision_outcome)) AND ((status <> 'RESOLVED'::pathways.decision_status) OR (outcome <> 'DECLINE'::pathways.decision_outcome))))
);

ALTER TABLE pathways.decision_recommendations OWNER TO prisma;

CREATE TABLE pathways.digital_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    description text,
    form_type pathways.form_type DEFAULT 'OTHER'::pathways.form_type NOT NULL,
    status pathways.form_status DEFAULT 'DRAFT'::pathways.form_status NOT NULL,
    activity_id uuid,
    journey_stage_id uuid,
    created_by_id uuid,
    published_by_id uuid,
    published_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT digital_forms_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT digital_forms_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT forms_state CHECK ((((status = 'DRAFT'::pathways.form_status) AND (published_at IS NULL) AND (published_by_id IS NULL) AND (archived_at IS NULL)) OR ((status = 'PUBLISHED'::pathways.form_status) AND (published_at IS NOT NULL) AND (published_by_id IS NOT NULL) AND (archived_at IS NULL)) OR ((status = 'ARCHIVED'::pathways.form_status) AND (archived_at IS NOT NULL) AND (((published_at IS NULL) AND (published_by_id IS NULL)) OR ((published_at IS NOT NULL) AND (published_by_id IS NOT NULL) AND (archived_at >= published_at)))))),
    CONSTRAINT forms_version CHECK ((version > 0))
);

ALTER TABLE pathways.digital_forms OWNER TO prisma;

CREATE TABLE pathways.evidence_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid,
    enrollment_id uuid,
    expense_id uuid,
    source_submission_id uuid,
    type pathways.evidence_type DEFAULT 'DOCUMENT'::pathways.evidence_type NOT NULL,
    file_name text NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    sha256 character(64) NOT NULL,
    byte_size bigint NOT NULL,
    content_type text NOT NULL,
    description text,
    consent_confirmed boolean DEFAULT false NOT NULL,
    is_identifying boolean DEFAULT true NOT NULL,
    status pathways.review_status DEFAULT 'PENDING'::pathways.review_status NOT NULL,
    submitted_by_id uuid NOT NULL,
    submitted_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_by_id uuid,
    verified_at timestamp(3) with time zone,
    approved_by_id uuid,
    approved_at timestamp(3) with time zone,
    rejected_by_id uuid,
    rejected_at timestamp(3) with time zone,
    rejection_reason text,
    public_visibility_status pathways.public_visibility_status DEFAULT 'PRIVATE'::pathways.public_visibility_status NOT NULL,
    public_submitted_by_id uuid,
    public_submitted_at timestamp(3) with time zone,
    public_approved_by_id uuid,
    public_approved_at timestamp(3) with time zone,
    published_by_id uuid,
    published_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    activity_update_id uuid,
    storage_ready boolean DEFAULT false NOT NULL,
    CONSTRAINT evidence_media_activity_update_check CHECK (((activity_update_id IS NULL) OR ((activity_id IS NOT NULL) AND (type = ANY (ARRAY['PROGRESS_PROOF'::pathways.evidence_type, 'COMPLETION_PROOF'::pathways.evidence_type]))))),
    CONSTRAINT p3_evidence_file CHECK ((pathways.p3_private_key(bucket, object_key, organization_id, project_id, 'evidence'::text, id) AND (sha256 ~ '^[0-9a-f]{64}$'::text) AND (byte_size > 0) AND (length(btrim(file_name)) > 0) AND (content_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'::text))),
    CONSTRAINT p3_evidence_public CHECK ((((public_visibility_status = 'PRIVATE'::pathways.public_visibility_status) AND (public_submitted_by_id IS NULL) AND (public_submitted_at IS NULL) AND (public_approved_by_id IS NULL) AND (public_approved_at IS NULL) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((status = 'APPROVED'::pathways.review_status) AND consent_confirmed AND (NOT is_identifying) AND (enrollment_id IS NULL) AND (public_submitted_by_id IS NOT NULL) AND (public_submitted_at >= approved_at) AND (((public_visibility_status = 'FOR_REVIEW'::pathways.public_visibility_status) AND (public_approved_by_id IS NULL) AND (public_approved_at IS NULL) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((public_visibility_status = 'APPROVED'::pathways.public_visibility_status) AND (public_approved_by_id IS NOT NULL) AND (public_approved_by_id <> public_submitted_by_id) AND (public_approved_by_id <> submitted_by_id) AND (public_approved_at >= public_submitted_at) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((public_visibility_status = 'PUBLISHED'::pathways.public_visibility_status) AND (public_approved_by_id IS NOT NULL) AND (public_approved_by_id <> public_submitted_by_id) AND (public_approved_by_id <> submitted_by_id) AND (public_approved_at >= public_submitted_at) AND (published_by_id IS NOT NULL) AND (published_by_id <> public_approved_by_id) AND (published_by_id <> public_submitted_by_id) AND (published_at >= public_approved_at)))))),
    CONSTRAINT p3_evidence_review CHECK ((((verified_by_id IS NULL) = (verified_at IS NULL)) AND ((approved_by_id IS NULL) = (approved_at IS NULL)) AND ((rejected_by_id IS NULL) = (rejected_at IS NULL)) AND ((verified_by_id IS NULL) OR ((verified_by_id <> submitted_by_id) AND (verified_at >= submitted_at))) AND ((approved_by_id IS NULL) OR ((approved_by_id <> submitted_by_id) AND (approved_by_id <> verified_by_id) AND (approved_at >= verified_at))) AND ((rejected_by_id IS NULL) OR ((rejected_by_id <> submitted_by_id) AND (rejected_at >= COALESCE(verified_at, submitted_at)))) AND (((status = 'PENDING'::pathways.review_status) AND (verified_by_id IS NULL) AND (approved_by_id IS NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'VERIFIED'::pathways.review_status) AND (verified_by_id IS NOT NULL) AND (approved_by_id IS NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'APPROVED'::pathways.review_status) AND (verified_by_id IS NOT NULL) AND (approved_by_id IS NOT NULL) AND (rejected_by_id IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'REJECTED'::pathways.review_status) AND (approved_by_id IS NULL) AND (rejected_by_id IS NOT NULL) AND (rejection_reason IS NOT NULL) AND (length(btrim(rejection_reason)) > 0))))),
    CONSTRAINT p3_public_times CHECK ((((public_submitted_by_id IS NULL) = (public_submitted_at IS NULL)) AND ((public_approved_by_id IS NULL) = (public_approved_at IS NULL)) AND ((published_by_id IS NULL) = (published_at IS NULL))))
);

ALTER TABLE pathways.evidence_media OWNER TO prisma;

CREATE TABLE pathways.form_response_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    submission_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE pathways.form_response_values OWNER TO prisma;

CREATE TABLE pathways.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    import_batch_id uuid,
    import_row_id uuid,
    enrollment_id uuid,
    submitted_by_id uuid NOT NULL,
    source pathways.submission_source DEFAULT 'DIRECT_ENCODING'::pathways.submission_source NOT NULL,
    status pathways.submission_status DEFAULT 'DRAFT'::pathways.submission_status NOT NULL,
    is_dummy_record boolean DEFAULT false NOT NULL,
    submitted_at timestamp(3) with time zone,
    validated_by_id uuid,
    validated_at timestamp(3) with time zone,
    processed_at timestamp(3) with time zone,
    rejection_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    form_version integer NOT NULL,
    client_submission_id uuid NOT NULL,
    CONSTRAINT submission_source CHECK ((((source = 'DIRECT_ENCODING'::pathways.submission_source) AND (import_batch_id IS NULL) AND (import_row_id IS NULL)) OR ((source = 'IMPORTED_DATASET'::pathways.submission_source) AND (import_batch_id IS NOT NULL) AND (import_row_id IS NOT NULL)))),
    CONSTRAINT submission_state CHECK ((((status = 'DRAFT'::pathways.submission_status) AND (validated_by_id IS NULL) AND (validated_at IS NULL) AND (processed_at IS NULL) AND (rejection_reason IS NULL)) OR ((status = 'REJECTED'::pathways.submission_status) AND (validated_by_id IS NULL) AND (validated_at IS NULL) AND (processed_at IS NULL) AND (rejection_reason IS NOT NULL) AND (btrim(rejection_reason) <> ''::text)) OR ((status = ANY (ARRAY['VALIDATED'::pathways.submission_status, 'PROCESSED'::pathways.submission_status])) AND (validated_by_id IS NOT NULL) AND (validated_at IS NOT NULL) AND (validated_at >= submitted_at) AND (rejection_reason IS NULL) AND (((status = 'VALIDATED'::pathways.submission_status) AND (processed_at IS NULL)) OR ((status = 'PROCESSED'::pathways.submission_status) AND (processed_at IS NOT NULL) AND (processed_at >= validated_at))))))
);

ALTER TABLE pathways.form_submissions OWNER TO prisma;

CREATE TABLE pathways.journey_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    stage_order integer NOT NULL,
    parent_stage_id uuid,
    stage_type pathways.journey_stage_type DEFAULT 'CORE'::pathways.journey_stage_type NOT NULL,
    is_terminal boolean DEFAULT false NOT NULL,
    description text,
    created_by_id uuid,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT journey_stages_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT journey_stages_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT stages_order CHECK (((stage_order > 0) AND ((parent_stage_id IS NULL) OR (parent_stage_id <> id))))
);

ALTER TABLE pathways.journey_stages OWNER TO prisma;

CREATE TABLE pathways.metadata_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    form_id uuid NOT NULL,
    import_batch_id uuid NOT NULL,
    source_field_name text NOT NULL,
    target_field_id uuid,
    target_system_field text,
    status pathways.mapping_status DEFAULT 'PENDING'::pathways.mapping_status NOT NULL,
    validation_message text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    CONSTRAINT mapping_no_system_target CHECK ((target_system_field IS NULL)),
    CONSTRAINT mapping_target CHECK ((((status = 'MAPPED'::pathways.mapping_status) AND (((target_field_id IS NOT NULL) AND (target_system_field IS NULL)) OR ((target_field_id IS NULL) AND (target_system_field IS NOT NULL)))) OR ((status <> 'MAPPED'::pathways.mapping_status) AND (target_field_id IS NULL) AND (target_system_field IS NULL)))),
    CONSTRAINT metadata_mappings_source_field_name_not_blank CHECK ((btrim(source_field_name) <> ''::text))
);

ALTER TABLE pathways.metadata_mappings OWNER TO prisma;

CREATE TABLE pathways.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    organization_type text DEFAULT 'Humanitarian and Development Organization'::text NOT NULL,
    description text,
    contact_email text,
    contact_number text,
    address text,
    status pathways.organization_status DEFAULT 'ACTIVE'::pathways.organization_status NOT NULL,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT organizations_archival_state_check CHECK ((((status = 'ARCHIVED'::pathways.organization_status) AND (archived_at IS NOT NULL)) OR ((status <> 'ARCHIVED'::pathways.organization_status) AND (archived_at IS NULL)))),
    CONSTRAINT organizations_code_not_blank_check CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT organizations_name_not_blank_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE pathways.organizations OWNER TO prisma;

CREATE TABLE pathways.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT permissions_code_not_blank_check CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT permissions_name_not_blank_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE pathways.permissions OWNER TO prisma;

CREATE TABLE pathways.programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    manager_user_id uuid,
    start_date date,
    end_date date,
    status pathways.program_status DEFAULT 'PLANNED'::pathways.program_status NOT NULL,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT programs_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT programs_completed_date CHECK (((status <> 'COMPLETED'::pathways.program_status) OR (end_date IS NOT NULL))),
    CONSTRAINT programs_date_order CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT programs_name_not_blank CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE pathways.programs OWNER TO prisma;

CREATE TABLE pathways.project_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    activity_type text,
    planned_start_date date,
    planned_end_date date,
    actual_start_date date,
    actual_end_date date,
    status pathways.activity_status DEFAULT 'NOT_STARTED'::pathways.activity_status NOT NULL,
    created_by_id uuid,
    reviewed_by_id uuid,
    reviewed_at timestamp(3) with time zone,
    cancelled_at timestamp(3) with time zone,
    cancellation_reason text,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    progress_percent integer DEFAULT 0 NOT NULL,
    timeline_override_justification text,
    target_beneficiaries integer,
    CONSTRAINT activities_date_order CHECK ((((planned_start_date IS NULL) OR (planned_end_date IS NULL) OR (planned_end_date >= planned_start_date)) AND ((actual_end_date IS NULL) OR ((actual_start_date IS NOT NULL) AND (actual_end_date >= actual_start_date))))),
    CONSTRAINT activities_lifecycle CHECK ((((status = 'NOT_STARTED'::pathways.activity_status) AND (actual_start_date IS NULL) AND (actual_end_date IS NULL) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (cancelled_at IS NULL) AND (cancellation_reason IS NULL)) OR ((status = ANY (ARRAY['IN_PROGRESS'::pathways.activity_status, 'FOR_REVIEW'::pathways.activity_status])) AND (actual_start_date IS NOT NULL) AND (actual_end_date IS NULL) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (cancelled_at IS NULL) AND (cancellation_reason IS NULL)) OR ((status = 'COMPLETED'::pathways.activity_status) AND (actual_start_date IS NOT NULL) AND (actual_end_date IS NOT NULL) AND (created_by_id IS NOT NULL) AND (reviewed_by_id IS NOT NULL) AND (reviewed_by_id <> created_by_id) AND (reviewed_at IS NOT NULL) AND ((actual_end_date >= (((reviewed_at AT TIME ZONE 'UTC'::text))::date - 1)) AND (actual_end_date <= (((reviewed_at AT TIME ZONE 'UTC'::text))::date + 1))) AND (cancelled_at IS NULL) AND (cancellation_reason IS NULL)) OR ((status = 'CANCELLED'::pathways.activity_status) AND (cancelled_at IS NOT NULL) AND (cancellation_reason IS NOT NULL) AND (btrim(cancellation_reason) <> ''::text) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL)))),
    CONSTRAINT project_activities_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT project_activities_creation_profile_check CHECK ((((timeline_override_justification IS NULL) OR ((length(btrim(timeline_override_justification)) >= 1) AND (length(btrim(timeline_override_justification)) <= 1000))) AND ((target_beneficiaries IS NULL) OR ((target_beneficiaries >= 0) AND (target_beneficiaries <= 2147483647))))),
    CONSTRAINT project_activities_progress_check CHECK (((progress_percent >= 0) AND (progress_percent <= 100))),
    CONSTRAINT project_activities_title_not_blank CHECK ((btrim(title) <> ''::text))
);

ALTER TABLE pathways.project_activities OWNER TO prisma;

CREATE TABLE pathways.project_activity_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    project_assignment_id uuid NOT NULL,
    assigned_by_id uuid NOT NULL,
    status pathways.activity_assignment_status DEFAULT 'ACTIVE'::pathways.activity_assignment_status NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp(3) with time zone,
    end_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT paa_state CHECK ((((status = 'ACTIVE'::pathways.activity_assignment_status) AND (ended_at IS NULL) AND (end_reason IS NULL)) OR ((status <> 'ACTIVE'::pathways.activity_assignment_status) AND (ended_at IS NOT NULL) AND (ended_at >= assigned_at) AND (end_reason IS NOT NULL) AND (btrim(end_reason) <> ''::text))))
);

ALTER TABLE pathways.project_activity_assignments OWNER TO prisma;

CREATE TABLE pathways.project_budget_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid,
    category text NOT NULL,
    currency character(3) NOT NULL,
    planned_budget numeric(18,2) DEFAULT 0 NOT NULL,
    remarks text,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_budget_values CHECK (((length(btrim(category)) > 0) AND (currency ~ '^[A-Z]{3}$'::text) AND (planned_budget >= (0)::numeric) AND (planned_budget <> 'NaN'::numeric) AND ((archived_at IS NULL) OR (archived_at >= recorded_at)))),
    CONSTRAINT project_budget_records_profile_category_check CHECK ((((category <> 'PROJECT_PROFILE_TOTAL'::text) OR (activity_id IS NULL)) AND ((category <> 'ACTIVITY_PROFILE_TOTAL'::text) OR (activity_id IS NOT NULL))))
);

ALTER TABLE pathways.project_budget_records OWNER TO prisma;

CREATE TABLE pathways.project_evaluation_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    version integer NOT NULL,
    type pathways.criterion_type NOT NULL,
    name text NOT NULL,
    description text,
    weight_percentage numeric(18,4) NOT NULL,
    maximum_score numeric(18,4) NOT NULL,
    status pathways.definition_status DEFAULT 'DRAFT'::pathways.definition_status NOT NULL,
    created_by_id uuid NOT NULL,
    published_by_id uuid,
    published_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_criterion_times CHECK (((status = 'ARCHIVED'::pathways.definition_status) = (archived_at IS NOT NULL))),
    CONSTRAINT p3_criterion_values CHECK (((version > 0) AND (length(btrim(code)) > 0) AND (length(btrim(name)) > 0) AND (weight_percentage > (0)::numeric) AND (weight_percentage <= (100)::numeric) AND (maximum_score > (0)::numeric) AND (maximum_score <> 'NaN'::numeric) AND (((status = 'DRAFT'::pathways.definition_status) AND (published_by_id IS NULL) AND (published_at IS NULL) AND (archived_at IS NULL)) OR ((status = 'PUBLISHED'::pathways.definition_status) AND (published_by_id IS NOT NULL) AND (published_at IS NOT NULL) AND (archived_at IS NULL)) OR ((status = 'ARCHIVED'::pathways.definition_status) AND (published_by_id IS NOT NULL) AND (published_at IS NOT NULL) AND (archived_at >= published_at)))))
);

ALTER TABLE pathways.project_evaluation_criteria OWNER TO prisma;

CREATE TABLE pathways.project_evaluation_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    evaluation_id uuid NOT NULL,
    criterion_id uuid NOT NULL,
    score numeric(18,4) NOT NULL,
    maximum_score numeric(18,4) NOT NULL,
    weighted_score numeric(18,4) NOT NULL,
    criterion_snapshot jsonb NOT NULL,
    commentary text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_score_values CHECK (((maximum_score > (0)::numeric) AND (maximum_score <> 'NaN'::numeric) AND ((score >= (0)::numeric) AND (score <= maximum_score)) AND ((weighted_score >= (0)::numeric) AND (weighted_score <= (100)::numeric)) AND (jsonb_typeof(criterion_snapshot) = 'object'::text)))
);

ALTER TABLE pathways.project_evaluation_scores OWNER TO prisma;

CREATE TABLE pathways.project_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    period_label text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    overall_score numeric(18,4),
    commentary text,
    status pathways.evaluation_status DEFAULT 'DRAFT'::pathways.evaluation_status NOT NULL,
    evaluated_by_id uuid NOT NULL,
    evaluated_at timestamp(3) with time zone,
    reviewed_by_id uuid,
    reviewed_at timestamp(3) with time zone,
    review_feedback text,
    signed_off_by_id uuid,
    signed_off_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_evaluation_times CHECK ((((reviewed_by_id IS NULL) = (reviewed_at IS NULL)) AND ((reviewed_by_id IS NULL) = (review_feedback IS NULL)) AND ((signed_off_by_id IS NULL) = (signed_off_at IS NULL)) AND ((status = 'ARCHIVED'::pathways.evaluation_status) = (archived_at IS NOT NULL)))),
    CONSTRAINT p3_evaluation_values CHECK (((length(btrim(title)) > 0) AND (period_end >= period_start) AND ((overall_score IS NULL) OR ((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric))) AND (((status = 'DRAFT'::pathways.evaluation_status) AND (evaluated_at IS NULL) AND (overall_score IS NULL) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_feedback IS NULL) AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL)) OR ((status = 'SUBMITTED'::pathways.evaluation_status) AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_feedback IS NULL) AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL)) OR ((status = 'REVIEWED'::pathways.evaluation_status) AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= evaluated_at) AND (length(btrim(review_feedback)) > 0) AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL)) OR ((status = ANY (ARRAY['SIGNED_OFF'::pathways.evaluation_status, 'ARCHIVED'::pathways.evaluation_status])) AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= evaluated_at) AND (length(btrim(review_feedback)) > 0) AND (signed_off_by_id IS NOT NULL) AND (signed_off_at >= reviewed_at) AND (((status = 'SIGNED_OFF'::pathways.evaluation_status) AND (archived_at IS NULL)) OR ((status = 'ARCHIVED'::pathways.evaluation_status) AND (archived_at >= signed_off_at))))) AND ((reviewed_by_id IS NULL) OR (reviewed_by_id <> evaluated_by_id)) AND ((signed_off_by_id IS NULL) OR ((signed_off_by_id <> evaluated_by_id) AND (signed_off_by_id <> reviewed_by_id)))))
);

ALTER TABLE pathways.project_evaluations OWNER TO prisma;

CREATE TABLE pathways.project_indicator_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    indicator_id uuid NOT NULL,
    recipe text NOT NULL,
    contract_version text DEFAULT 'p06.v1'::text NOT NULL,
    activity_id uuid,
    form_id uuid,
    form_version integer,
    field_id uuid,
    created_by_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p06_bindings_recipe_check CHECK (((contract_version = 'p06.v1'::text) AND (((recipe = ANY (ARRAY['FORM_NUMERIC_SUM'::text, 'FORM_NUMERIC_AVERAGE'::text])) AND (form_id IS NOT NULL) AND (form_version IS NOT NULL) AND (form_version > 0) AND (field_id IS NOT NULL) AND (activity_id IS NULL)) OR ((recipe = ANY (ARRAY['PARTICIPATION_RECORD_COUNT'::text, 'DISTINCT_ATTENDING_INDIVIDUALS'::text, 'ATTENDANCE_RECORDS_PER_INDIVIDUAL'::text, 'EFFECTIVE_JOURNEY_EVENT_COUNT'::text])) AND (form_id IS NULL) AND (form_version IS NULL) AND (field_id IS NULL)) OR ((recipe = 'ACTIVITY_COMPLETION_PERCENTAGE'::text) AND (form_id IS NULL) AND (form_version IS NULL) AND (field_id IS NULL) AND (activity_id IS NULL)))))
);

ALTER TABLE ONLY pathways.project_indicator_bindings FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicator_bindings OWNER TO prisma;

CREATE TABLE pathways.project_indicator_measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    indicator_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    value numeric(18,4) NOT NULL,
    source text NOT NULL,
    note text,
    client_measurement_id uuid NOT NULL,
    request_hash character(64) NOT NULL,
    corrects_measurement_id uuid,
    correction_reason text,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p06_measurements_values_check CHECK (((value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])) AND ((period_start >= '1900-01-01'::date) AND (period_start <= '2100-12-31'::date)) AND ((period_end >= period_start) AND (period_end <= LEAST((period_start + 365), '2100-12-31'::date))) AND ((length(btrim(source)) >= 1) AND (length(btrim(source)) <= 300)) AND ((note IS NULL) OR (length(note) <= 1000)) AND (request_hash ~ '^[a-f0-9]{64}$'::text) AND (((corrects_measurement_id IS NULL) AND (correction_reason IS NULL)) OR ((corrects_measurement_id IS NOT NULL) AND (corrects_measurement_id <> id) AND (correction_reason IS NOT NULL) AND ((length(btrim(correction_reason)) >= 1) AND (length(btrim(correction_reason)) <= 1000))))))
);

ALTER TABLE ONLY pathways.project_indicator_measurements FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicator_measurements OWNER TO prisma;

CREATE TABLE pathways.project_indicators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    indicator_type pathways.indicator_type DEFAULT 'OUTPUT'::pathways.indicator_type NOT NULL,
    unit pathways.indicator_unit DEFAULT 'COUNT'::pathways.indicator_unit NOT NULL,
    unit_label text,
    data_source text,
    is_saddd_related boolean DEFAULT false NOT NULL,
    baseline_value numeric(18,4),
    current_value numeric(18,4),
    target_value numeric(18,4),
    actual_value numeric(18,4),
    minimum_value numeric(18,4),
    maximum_value numeric(18,4),
    target_date date,
    status pathways.indicator_status DEFAULT 'NOT_STARTED'::pathways.indicator_status NOT NULL,
    created_by_id uuid,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    measurement_mode text,
    numeric_kind text,
    direction text,
    display_precision integer,
    period_start date,
    period_end date,
    revision integer DEFAULT 1 NOT NULL,
    CONSTRAINT indicators_actual_value_range CHECK (((actual_value IS NULL) OR ((actual_value <> 'NaN'::numeric) AND ((minimum_value IS NULL) OR (actual_value >= minimum_value)) AND ((maximum_value IS NULL) OR (actual_value <= maximum_value)) AND ((unit <> 'PERCENTAGE'::pathways.indicator_unit) OR ((actual_value >= (0)::numeric) AND (actual_value <= (100)::numeric))) AND ((unit <> ALL (ARRAY['COUNT'::pathways.indicator_unit, 'AMOUNT'::pathways.indicator_unit, 'SCORE'::pathways.indicator_unit])) OR (actual_value >= (0)::numeric)) AND ((unit <> 'COUNT'::pathways.indicator_unit) OR (actual_value = trunc(actual_value)))))),
    CONSTRAINT indicators_baseline_value_range CHECK (((baseline_value IS NULL) OR ((baseline_value <> 'NaN'::numeric) AND ((minimum_value IS NULL) OR (baseline_value >= minimum_value)) AND ((maximum_value IS NULL) OR (baseline_value <= maximum_value)) AND ((unit <> 'PERCENTAGE'::pathways.indicator_unit) OR ((baseline_value >= (0)::numeric) AND (baseline_value <= (100)::numeric))) AND ((unit <> ALL (ARRAY['COUNT'::pathways.indicator_unit, 'AMOUNT'::pathways.indicator_unit, 'SCORE'::pathways.indicator_unit])) OR (baseline_value >= (0)::numeric)) AND ((unit <> 'COUNT'::pathways.indicator_unit) OR (baseline_value = trunc(baseline_value)))))),
    CONSTRAINT indicators_bounds CHECK ((((minimum_value IS NULL) OR (minimum_value <> 'NaN'::numeric)) AND ((maximum_value IS NULL) OR (maximum_value <> 'NaN'::numeric)) AND ((minimum_value IS NULL) OR (maximum_value IS NULL) OR (maximum_value >= minimum_value)) AND ((unit <> 'SCORE'::pathways.indicator_unit) OR ((maximum_value IS NOT NULL) AND (maximum_value > COALESCE(minimum_value, (0)::numeric)))))),
    CONSTRAINT indicators_current_value_range CHECK (((current_value IS NULL) OR ((current_value <> 'NaN'::numeric) AND ((minimum_value IS NULL) OR (current_value >= minimum_value)) AND ((maximum_value IS NULL) OR (current_value <= maximum_value)) AND ((unit <> 'PERCENTAGE'::pathways.indicator_unit) OR ((current_value >= (0)::numeric) AND (current_value <= (100)::numeric))) AND ((unit <> ALL (ARRAY['COUNT'::pathways.indicator_unit, 'AMOUNT'::pathways.indicator_unit, 'SCORE'::pathways.indicator_unit])) OR (current_value >= (0)::numeric)) AND ((unit <> 'COUNT'::pathways.indicator_unit) OR (current_value = trunc(current_value)))))),
    CONSTRAINT indicators_target_value_range CHECK (((target_value IS NULL) OR ((target_value <> 'NaN'::numeric) AND ((minimum_value IS NULL) OR (target_value >= minimum_value)) AND ((maximum_value IS NULL) OR (target_value <= maximum_value)) AND ((unit <> 'PERCENTAGE'::pathways.indicator_unit) OR ((target_value >= (0)::numeric) AND (target_value <= (100)::numeric))) AND ((unit <> ALL (ARRAY['COUNT'::pathways.indicator_unit, 'AMOUNT'::pathways.indicator_unit, 'SCORE'::pathways.indicator_unit])) OR (target_value >= (0)::numeric)) AND ((unit <> 'COUNT'::pathways.indicator_unit) OR (target_value = trunc(target_value)))))),
    CONSTRAINT p06_indicator_contract CHECK (((revision > 0) AND ((measurement_mode IS NULL) OR ((measurement_mode = ANY (ARRAY['MANUAL'::text, 'DERIVED'::text])) AND (numeric_kind IS NOT NULL) AND (numeric_kind = ANY (ARRAY['COUNT'::text, 'SIGNED_CHANGE'::text, 'PERCENTAGE'::text, 'RATIO'::text, 'NON_NEGATIVE'::text])) AND (direction IS NOT NULL) AND (direction = ANY (ARRAY['HIGHER_IS_BETTER'::text, 'LOWER_IS_BETTER'::text, 'DESCRIPTIVE'::text])) AND (display_precision IS NOT NULL) AND ((display_precision >= 0) AND (display_precision <= 4)) AND ((numeric_kind <> 'COUNT'::text) OR (display_precision = 0)) AND (period_start IS NOT NULL) AND (period_end IS NOT NULL) AND ((period_start >= '1900-01-01'::date) AND (period_start <= '2100-12-31'::date)) AND ((period_end >= period_start) AND (period_end <= LEAST((period_start + 365), '2100-12-31'::date))) AND (unit_label IS NOT NULL) AND ((length(btrim(unit_label)) >= 1) AND (length(btrim(unit_label)) <= 80)) AND (data_source IS NOT NULL) AND ((length(btrim(data_source)) >= 1) AND (length(btrim(data_source)) <= 300)) AND (current_value IS NULL) AND (actual_value IS NULL) AND pathways.p06_numeric_valid(baseline_value, numeric_kind) AND pathways.p06_numeric_valid(target_value, numeric_kind) AND ((baseline_value IS NULL) OR (target_value IS NULL) OR (direction = 'DESCRIPTIVE'::text) OR ((direction = 'HIGHER_IS_BETTER'::text) AND (target_value >= baseline_value)) OR ((direction = 'LOWER_IS_BETTER'::text) AND (target_value <= baseline_value))))))),
    CONSTRAINT project_indicators_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT project_indicators_name_not_blank CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE pathways.project_indicators OWNER TO prisma;

COMMENT ON COLUMN pathways.project_indicators.current_value IS 'Legacy evidence only; P06 reads measurement authority, never this column.';

COMMENT ON COLUMN pathways.project_indicators.actual_value IS 'Legacy evidence only; P06 does not backfill or maintain competing actual/current values.';

CREATE TABLE pathways.project_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    target_date date,
    completion_date date,
    status pathways.milestone_status DEFAULT 'PENDING'::pathways.milestone_status NOT NULL,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT milestones_completion CHECK ((((status = 'COMPLETED'::pathways.milestone_status) AND (completion_date IS NOT NULL)) OR ((status <> 'COMPLETED'::pathways.milestone_status) AND (completion_date IS NULL)))),
    CONSTRAINT project_milestones_title_not_blank CHECK ((btrim(title) <> ''::text))
);

ALTER TABLE pathways.project_milestones OWNER TO prisma;

CREATE TABLE pathways.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    program_id uuid,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    objectives text,
    implementation_area text,
    start_date date,
    end_date date,
    status pathways.project_status DEFAULT 'PLANNED'::pathways.project_status NOT NULL,
    created_by_id uuid,
    archived_at timestamp(3) with time zone,
    public_visibility_status pathways.public_visibility_status DEFAULT 'PRIVATE'::pathways.public_visibility_status NOT NULL,
    public_summary text,
    public_submitted_by_id uuid,
    public_submitted_at timestamp(3) with time zone,
    public_approved_by_id uuid,
    public_approved_at timestamp(3) with time zone,
    published_by_id uuid,
    published_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    target_goal numeric(7,4),
    implementing_partners text,
    sector text,
    target_beneficiaries integer,
    program_manager_id uuid,
    CONSTRAINT projects_code_not_blank CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT projects_completed_date CHECK (((status <> 'COMPLETED'::pathways.project_status) OR (end_date IS NOT NULL))),
    CONSTRAINT projects_creation_profile_check CHECK ((((implementing_partners IS NULL) OR ((length(btrim(implementing_partners)) >= 1) AND (length(btrim(implementing_partners)) <= 1000))) AND ((sector IS NULL) OR ((length(btrim(sector)) >= 1) AND (length(btrim(sector)) <= 160))) AND ((target_beneficiaries IS NULL) OR ((target_beneficiaries >= 0) AND (target_beneficiaries <= 2147483647))))),
    CONSTRAINT projects_date_order CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT projects_public_state CHECK ((((public_visibility_status = 'PRIVATE'::pathways.public_visibility_status) AND (public_submitted_by_id IS NULL) AND (public_submitted_at IS NULL) AND (public_approved_by_id IS NULL) AND (public_approved_at IS NULL) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((public_visibility_status = 'FOR_REVIEW'::pathways.public_visibility_status) AND (public_summary IS NOT NULL) AND (btrim(public_summary) <> ''::text) AND (public_submitted_by_id IS NOT NULL) AND (public_submitted_at IS NOT NULL) AND (public_approved_by_id IS NULL) AND (public_approved_at IS NULL) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((public_visibility_status = ANY (ARRAY['APPROVED'::pathways.public_visibility_status, 'PUBLISHED'::pathways.public_visibility_status])) AND (public_summary IS NOT NULL) AND (btrim(public_summary) <> ''::text) AND (public_submitted_by_id IS NOT NULL) AND (public_submitted_at IS NOT NULL) AND (public_approved_by_id IS NOT NULL) AND (public_approved_by_id <> public_submitted_by_id) AND (public_approved_at IS NOT NULL) AND (public_approved_at >= public_submitted_at) AND (((public_visibility_status = 'APPROVED'::pathways.public_visibility_status) AND (published_by_id IS NULL) AND (published_at IS NULL)) OR ((public_visibility_status = 'PUBLISHED'::pathways.public_visibility_status) AND (published_by_id IS NOT NULL) AND (published_at IS NOT NULL) AND (published_at >= public_approved_at)))))),
    CONSTRAINT projects_target_goal_check CHECK (((target_goal IS NULL) OR ((target_goal > (0)::numeric) AND (target_goal <= (100)::numeric)))),
    CONSTRAINT projects_title_not_blank CHECK ((btrim(title) <> ''::text))
);

ALTER TABLE pathways.projects OWNER TO prisma;

CREATE TABLE pathways.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    program_id uuid,
    form_id uuid,
    activity_id uuid,
    journey_stage_id uuid,
    evaluation_id uuid,
    name text NOT NULL,
    type pathways.report_type DEFAULT 'OTHER'::pathways.report_type NOT NULL,
    format pathways.report_format,
    status pathways.report_status DEFAULT 'DRAFT'::pathways.report_status NOT NULL,
    location text,
    report_date date,
    period_start date,
    period_end date,
    aggregate_only boolean DEFAULT true NOT NULL,
    bucket text,
    object_key text,
    sha256 character(64),
    created_by_id uuid NOT NULL,
    generated_by_id uuid,
    generated_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_report_times CHECK (((status = 'ARCHIVED'::pathways.report_status) = (archived_at IS NOT NULL))),
    CONSTRAINT p3_report_values CHECK (((length(btrim(name)) > 0) AND ((program_id IS NULL) OR (project_id IS NULL)) AND ((project_id IS NOT NULL) OR ((form_id IS NULL) AND (activity_id IS NULL) AND (journey_stage_id IS NULL) AND (evaluation_id IS NULL))) AND (((period_start IS NULL) AND (period_end IS NULL)) OR ((period_start IS NOT NULL) AND (period_end IS NOT NULL) AND (period_end >= period_start))) AND (((status = 'DRAFT'::pathways.report_status) AND (bucket IS NULL) AND (object_key IS NULL) AND (sha256 IS NULL) AND (generated_by_id IS NULL) AND (generated_at IS NULL) AND (archived_at IS NULL)) OR ((status = ANY (ARRAY['GENERATED'::pathways.report_status, 'ARCHIVED'::pathways.report_status])) AND (format IS NOT NULL) AND (bucket IS NOT NULL) AND (object_key IS NOT NULL) AND (sha256 IS NOT NULL) AND pathways.p3_private_key(bucket, object_key, organization_id, project_id, 'reports'::text, id) AND (sha256 ~ '^[0-9a-f]{64}$'::text) AND (generated_by_id IS NOT NULL) AND (generated_at IS NOT NULL) AND (((status = 'GENERATED'::pathways.report_status) AND (archived_at IS NULL)) OR ((status = 'ARCHIVED'::pathways.report_status) AND (archived_at >= generated_at)))))))
);

ALTER TABLE pathways.reports OWNER TO prisma;

CREATE TABLE pathways.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE pathways.role_permissions OWNER TO prisma;

CREATE TABLE pathways.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT roles_code_not_blank_check CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT roles_name_not_blank_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE pathways.roles OWNER TO prisma;

CREATE TABLE pathways.rule_based_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    indicator_id uuid,
    activity_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    severity pathways.alert_severity NOT NULL,
    observed_values jsonb NOT NULL,
    evaluated_snapshot jsonb NOT NULL,
    evaluated_by_id uuid NOT NULL,
    evaluated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p3_alert_values CHECK (((length(btrim(title)) > 0) AND (length(btrim(message)) > 0) AND (jsonb_typeof(observed_values) = 'object'::text) AND (jsonb_typeof(evaluated_snapshot) = 'object'::text)))
);

ALTER TABLE pathways.rule_based_alerts OWNER TO prisma;

CREATE TABLE pathways.sensitive_aggregate_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    policy_version text DEFAULT 'FIXED_CLOSED_PROJECT_PERIOD_V1'::text NOT NULL,
    source_fingerprint text NOT NULL,
    status text DEFAULT 'RELEASED'::text NOT NULL,
    stale_reason text,
    released_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    stale_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p06_sensitive_release_fingerprint_check CHECK ((source_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT p06_sensitive_release_period_check CHECK ((period_start <= period_end)),
    CONSTRAINT p06_sensitive_release_policy_check CHECK ((policy_version = 'FIXED_CLOSED_PROJECT_PERIOD_V1'::text)),
    CONSTRAINT p06_sensitive_release_stale_reason_check CHECK (((stale_reason IS NULL) OR (stale_reason = ANY (ARRAY['SOURCE_CHANGED'::text, 'PROJECT_PERIOD_CHANGED'::text])))),
    CONSTRAINT p06_sensitive_release_state_check CHECK ((((status = 'RELEASED'::text) AND (stale_at IS NULL) AND (stale_reason IS NULL)) OR ((status = 'STALE'::text) AND (stale_at IS NOT NULL) AND (stale_reason IS NOT NULL)))),
    CONSTRAINT p06_sensitive_release_status_check CHECK ((status = ANY (ARRAY['RELEASED'::text, 'STALE'::text])))
);

ALTER TABLE ONLY pathways.sensitive_aggregate_releases FORCE ROW LEVEL SECURITY;

ALTER TABLE pathways.sensitive_aggregate_releases OWNER TO prisma;

CREATE TABLE pathways.system_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    role_id uuid NOT NULL,
    auth_user_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    position_title text,
    contact_number text,
    account_status pathways.account_status DEFAULT 'INVITED'::pathways.account_status NOT NULL,
    invited_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    activated_at timestamp(3) with time zone,
    suspended_at timestamp(3) with time zone,
    deactivated_at timestamp(3) with time zone,
    archived_at timestamp(3) with time zone,
    last_login_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT system_users_email_not_blank_check CHECK ((btrim(email) <> ''::text)),
    CONSTRAINT system_users_full_name_not_blank_check CHECK ((btrim(full_name) <> ''::text)),
    CONSTRAINT system_users_lifecycle_order_check CHECK ((((activated_at IS NULL) OR (activated_at >= invited_at)) AND ((suspended_at IS NULL) OR ((activated_at IS NOT NULL) AND (suspended_at >= activated_at))) AND ((deactivated_at IS NULL) OR (deactivated_at >= invited_at)) AND ((archived_at IS NULL) OR (archived_at >= invited_at)) AND ((last_login_at IS NULL) OR (activated_at IS NOT NULL)))),
    CONSTRAINT system_users_lifecycle_state_check CHECK ((((account_status = 'INVITED'::pathways.account_status) AND (activated_at IS NULL) AND (suspended_at IS NULL) AND (deactivated_at IS NULL) AND (archived_at IS NULL)) OR ((account_status = 'ACTIVE'::pathways.account_status) AND (activated_at IS NOT NULL) AND (deactivated_at IS NULL) AND (archived_at IS NULL)) OR ((account_status = 'SUSPENDED'::pathways.account_status) AND (activated_at IS NOT NULL) AND (suspended_at IS NOT NULL) AND (deactivated_at IS NULL) AND (archived_at IS NULL)) OR ((account_status = 'DEACTIVATED'::pathways.account_status) AND (deactivated_at IS NOT NULL) AND (archived_at IS NULL)) OR ((account_status = 'ARCHIVED'::pathways.account_status) AND (archived_at IS NOT NULL))))
);

ALTER TABLE pathways.system_users OWNER TO prisma;

CREATE TABLE pathways.user_project_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by_id uuid NOT NULL,
    status pathways.assignment_status DEFAULT 'ACTIVE'::pathways.assignment_status NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp(3) with time zone,
    end_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT upa_state CHECK ((((status = 'ACTIVE'::pathways.assignment_status) AND (ended_at IS NULL) AND (end_reason IS NULL)) OR ((status = 'ENDED'::pathways.assignment_status) AND (ended_at IS NOT NULL) AND (ended_at >= assigned_at) AND (end_reason IS NOT NULL) AND (btrim(end_reason) <> ''::text))))
);

ALTER TABLE pathways.user_project_assignments OWNER TO prisma;

CREATE TABLE public."AuditLog" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "actorId" uuid,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text NOT NULL,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."AuditLog" OWNER TO prisma;

CREATE TABLE public."FormMetadata" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."FormMetadata" OWNER TO prisma;

CREATE TABLE public."MetadataField" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "formMetadataId" uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    "fieldType" text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."MetadataField" OWNER TO prisma;

CREATE TABLE public."Participant" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "externalId" text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    sex text,
    age integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."Participant" OWNER TO prisma;

CREATE TABLE public."ParticipantCard" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "participantId" uuid NOT NULL,
    "cardNumber" text NOT NULL,
    "storagePath" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."ParticipantCard" OWNER TO prisma;

CREATE TABLE public."ParticipantJourney" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "participantId" uuid NOT NULL,
    "programId" uuid NOT NULL,
    "projectId" uuid,
    status text DEFAULT 'active'::text NOT NULL,
    "enrolledAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."ParticipantJourney" OWNER TO prisma;

CREATE TABLE public."Program" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."Program" OWNER TO prisma;

CREATE TABLE public."Project" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "programId" uuid,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."Project" OWNER TO prisma;

CREATE TABLE public."Report" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    "filePath" text,
    "programId" uuid,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."Report" OWNER TO prisma;

CREATE TABLE public."Role" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."Role" OWNER TO prisma;

CREATE TABLE public."UploadBatch" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "fileName" text NOT NULL,
    "storagePath" text,
    status text DEFAULT 'pending'::text NOT NULL,
    "projectId" uuid,
    "formMetadataId" uuid,
    "uploadedById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."UploadBatch" OWNER TO prisma;

CREATE TABLE public."UploadRow" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "uploadBatchId" uuid NOT NULL,
    "participantId" uuid,
    "rowNumber" integer NOT NULL,
    "rawData" jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."UploadRow" OWNER TO prisma;

CREATE TABLE public."UploadRowError" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "uploadRowId" uuid NOT NULL,
    "fieldKey" text,
    message text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."UploadRowError" OWNER TO prisma;

CREATE TABLE public."User" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "supabaseUserId" text,
    email text NOT NULL,
    "fullName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."User" OWNER TO prisma;

CREATE TABLE public."UserRole" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "assignedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE public."UserRole" OWNER TO prisma;

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.alert_rule_conditions
    ADD CONSTRAINT alert_rule_conditions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.alert_rule_recommendations
    ADD CONSTRAINT alert_rule_recommendations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiaries
    ADD CONSTRAINT beneficiaries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiary_identifiers
    ADD CONSTRAINT beneficiary_identifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.beneficiary_project_enrollments
    ADD CONSTRAINT beneficiary_project_enrollments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.form_fields
    ADD CONSTRAINT form_fields_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.journey_stages
    ADD CONSTRAINT journey_stages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_indicator_key UNIQUE (organization_id, project_id, indicator_id);

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_client_key UNIQUE (organization_id, recorded_by_id, client_measurement_id);

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_scope_key UNIQUE (organization_id, project_id, indicator_id, id);

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_successor_key UNIQUE (corrects_measurement_id);

ALTER TABLE ONLY pathways.sensitive_aggregate_releases
    ADD CONSTRAINT p06_sensitive_release_project_key UNIQUE (organization_id, project_id);

ALTER TABLE ONLY pathways.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_activities
    ADD CONSTRAINT project_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_budget_records
    ADD CONSTRAINT project_budget_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_evaluation_criteria
    ADD CONSTRAINT project_evaluation_criteria_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_evaluation_scores
    ADD CONSTRAINT project_evaluation_scores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT project_indicator_bindings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT project_indicator_measurements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_indicators
    ADD CONSTRAINT project_indicators_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.project_milestones
    ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);

ALTER TABLE ONLY pathways.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.sensitive_aggregate_releases
    ADD CONSTRAINT sensitive_aggregate_releases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.system_users
    ADD CONSTRAINT system_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.user_project_assignments
    ADD CONSTRAINT user_project_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."FormMetadata"
    ADD CONSTRAINT "FormMetadata_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."MetadataField"
    ADD CONSTRAINT "MetadataField_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ParticipantCard"
    ADD CONSTRAINT "ParticipantCard_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ParticipantJourney"
    ADD CONSTRAINT "ParticipantJourney_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Participant"
    ADD CONSTRAINT "Participant_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Program"
    ADD CONSTRAINT "Program_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UploadBatch"
    ADD CONSTRAINT "UploadBatch_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UploadRowError"
    ADD CONSTRAINT "UploadRowError_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UploadRow"
    ADD CONSTRAINT "UploadRow_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX activity_indicator_links_activity_indicator_key ON pathways.activity_indicator_links USING btree (organization_id, project_id, activity_id, indicator_id);

CREATE INDEX activity_indicator_links_created_by_idx ON pathways.activity_indicator_links USING btree (organization_id, created_by_id);

CREATE INDEX activity_indicator_links_indicator_idx ON pathways.activity_indicator_links USING btree (organization_id, project_id, indicator_id);

CREATE UNIQUE INDEX activity_indicator_links_scope_key ON pathways.activity_indicator_links USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX activity_journey_stage_mappings_activity_stage_key ON pathways.activity_journey_stage_mappings USING btree (organization_id, project_id, activity_id, stage_id);

CREATE INDEX activity_journey_stage_mappings_created_by_idx ON pathways.activity_journey_stage_mappings USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX activity_journey_stage_mappings_scope_key ON pathways.activity_journey_stage_mappings USING btree (organization_id, project_id, id);

CREATE INDEX activity_journey_stage_mappings_stage_sequence_idx ON pathways.activity_journey_stage_mappings USING btree (organization_id, project_id, stage_id, sequence_order);

CREATE INDEX activity_updates_activity_time_idx ON pathways.activity_updates USING btree (organization_id, project_id, activity_id, submitted_at);

CREATE UNIQUE INDEX activity_updates_client_key ON pathways.activity_updates USING btree (organization_id, submitted_by_id, client_update_id);

CREATE INDEX activity_updates_review_idx ON pathways.activity_updates USING btree (organization_id, project_id, status, submitted_at);

CREATE INDEX activity_updates_reviewed_by_idx ON pathways.activity_updates USING btree (organization_id, reviewed_by_id);

CREATE UNIQUE INDEX activity_updates_scope_key ON pathways.activity_updates USING btree (organization_id, project_id, activity_id, id);

CREATE INDEX activity_updates_submitted_by_idx ON pathways.activity_updates USING btree (organization_id, submitted_by_id);

CREATE INDEX alert_rule_conditions_ref_1_idx ON pathways.alert_rule_conditions USING btree (organization_id, rule_id);

CREATE UNIQUE INDEX alert_rule_conditions_scope_key ON pathways.alert_rule_conditions USING btree (organization_id, id);

CREATE UNIQUE INDEX alert_rule_conditions_unique_1 ON pathways.alert_rule_conditions USING btree (organization_id, rule_id, sequence);

CREATE INDEX alert_rule_recommendations_ref_1_idx ON pathways.alert_rule_recommendations USING btree (organization_id, rule_id);

CREATE INDEX alert_rule_recommendations_ref_2_idx ON pathways.alert_rule_recommendations USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX alert_rule_recommendations_scope_key ON pathways.alert_rule_recommendations USING btree (organization_id, id);

CREATE INDEX alert_rules_ref_1_idx ON pathways.alert_rules USING btree (organization_id, created_by_id);

CREATE INDEX alert_rules_ref_2_idx ON pathways.alert_rules USING btree (organization_id, activated_by_id);

CREATE UNIQUE INDEX alert_rules_scope_key ON pathways.alert_rules USING btree (organization_id, id);

CREATE UNIQUE INDEX alert_rules_unique_1 ON pathways.alert_rules USING btree (organization_id, code, version);

CREATE INDEX assessment_results_ref_1_idx ON pathways.assessment_results USING btree (organization_id, project_id, activity_id);

CREATE INDEX assessment_results_ref_2_idx ON pathways.assessment_results USING btree (organization_id, project_id, enrollment_id);

CREATE INDEX assessment_results_ref_3_idx ON pathways.assessment_results USING btree (organization_id, project_id, source_submission_id);

CREATE INDEX assessment_results_ref_4_idx ON pathways.assessment_results USING btree (organization_id, recorded_by_id);

CREATE UNIQUE INDEX assessment_results_scope_key ON pathways.assessment_results USING btree (organization_id, project_id, id);

CREATE INDEX audit_logs_org_actor_occurred_idx ON pathways.audit_logs USING btree (organization_id, actor_user_id, occurred_at DESC);

CREATE INDEX audit_logs_org_entity_occurred_idx ON pathways.audit_logs USING btree (organization_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX audit_logs_org_occurred_idx ON pathways.audit_logs USING btree (organization_id, occurred_at DESC);

CREATE INDEX audit_logs_org_project_occurred_idx ON pathways.audit_logs USING btree (organization_id, project_id, occurred_at DESC);

CREATE INDEX beneficiaries_created_by_idx ON pathways.beneficiaries USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX beneficiaries_org_code_key ON pathways.beneficiaries USING btree (organization_id, code);

CREATE INDEX beneficiaries_org_display_name_idx ON pathways.beneficiaries USING btree (organization_id, display_name, code);

CREATE INDEX beneficiaries_org_status_idx ON pathways.beneficiaries USING btree (organization_id, status);

CREATE UNIQUE INDEX beneficiaries_scope_key ON pathways.beneficiaries USING btree (organization_id, id);

CREATE INDEX beneficiary_activity_participations_activity_date_idx ON pathways.beneficiary_activity_participations USING btree (organization_id, project_id, activity_id, participation_date);

CREATE UNIQUE INDEX beneficiary_activity_participations_attendance_key ON pathways.beneficiary_activity_participations USING btree (enrollment_id, activity_id, participation_date);

CREATE UNIQUE INDEX beneficiary_activity_participations_event_scope_key ON pathways.beneficiary_activity_participations USING btree (organization_id, project_id, enrollment_id, activity_id, id);

CREATE INDEX beneficiary_activity_participations_recorded_by_idx ON pathways.beneficiary_activity_participations USING btree (organization_id, recorded_by_id);

CREATE UNIQUE INDEX beneficiary_activity_participations_scope_key ON pathways.beneficiary_activity_participations USING btree (organization_id, project_id, id);

CREATE INDEX beneficiary_activity_participations_submission_idx ON pathways.beneficiary_activity_participations USING btree (organization_id, project_id, source_submission_id);

CREATE UNIQUE INDEX beneficiary_activity_participations_submission_key ON pathways.beneficiary_activity_participations USING btree (source_submission_id) WHERE (source_submission_id IS NOT NULL);

CREATE INDEX beneficiary_consent_records_project_beneficiary_idx ON pathways.beneficiary_consent_records USING btree (organization_id, project_id, beneficiary_id, recorded_at);

CREATE INDEX beneficiary_consent_records_recorded_by_idx ON pathways.beneficiary_consent_records USING btree (organization_id, recorded_by_id);

CREATE UNIQUE INDEX beneficiary_consent_records_submission_kind_key ON pathways.beneficiary_consent_records USING btree (submission_id, kind);

CREATE INDEX beneficiary_identifiers_beneficiary_idx ON pathways.beneficiary_identifiers USING btree (organization_id, beneficiary_id);

CREATE INDEX beneficiary_identifiers_created_by_idx ON pathways.beneficiary_identifiers USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX beneficiary_identifiers_org_type_value_key ON pathways.beneficiary_identifiers USING btree (organization_id, identifier_type, normalized_value);

CREATE INDEX beneficiary_journey_events_activity_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, activity_id);

CREATE INDEX beneficiary_journey_events_activity_stage_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, activity_id, stage_id);

CREATE INDEX beneficiary_journey_events_correction_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, corrects_event_id);

CREATE INDEX beneficiary_journey_events_enrollment_date_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, enrollment_id, event_date);

CREATE INDEX beneficiary_journey_events_participation_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, enrollment_id, activity_id, participation_id);

CREATE INDEX beneficiary_journey_events_recorded_by_idx ON pathways.beneficiary_journey_events USING btree (organization_id, recorded_by_id);

CREATE UNIQUE INDEX beneficiary_journey_events_scope_key ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, id);

CREATE INDEX beneficiary_journey_events_stage_idx ON pathways.beneficiary_journey_events USING btree (organization_id, project_id, stage_id);

CREATE INDEX beneficiary_project_enrollments_beneficiary_idx ON pathways.beneficiary_project_enrollments USING btree (organization_id, beneficiary_id);

CREATE UNIQUE INDEX beneficiary_project_enrollments_beneficiary_project_key ON pathways.beneficiary_project_enrollments USING btree (organization_id, project_id, beneficiary_id);

CREATE INDEX beneficiary_project_enrollments_project_status_idx ON pathways.beneficiary_project_enrollments USING btree (organization_id, project_id, status);

CREATE INDEX beneficiary_project_enrollments_recorded_by_idx ON pathways.beneficiary_project_enrollments USING btree (organization_id, recorded_by_id);

CREATE UNIQUE INDEX beneficiary_project_enrollments_scope_key ON pathways.beneficiary_project_enrollments USING btree (organization_id, project_id, id);

CREATE INDEX budget_expense_entries_ref_1_idx ON pathways.budget_expense_entries USING btree (organization_id, project_id, budget_record_id);

CREATE INDEX budget_expense_entries_ref_2_idx ON pathways.budget_expense_entries USING btree (organization_id, project_id, receipt_evidence_id);

CREATE INDEX budget_expense_entries_ref_3_idx ON pathways.budget_expense_entries USING btree (organization_id, submitted_by_id);

CREATE INDEX budget_expense_entries_ref_4_idx ON pathways.budget_expense_entries USING btree (organization_id, verified_by_id);

CREATE INDEX budget_expense_entries_ref_5_idx ON pathways.budget_expense_entries USING btree (organization_id, approved_by_id);

CREATE INDEX budget_expense_entries_ref_6_idx ON pathways.budget_expense_entries USING btree (organization_id, rejected_by_id);

CREATE INDEX budget_expense_entries_ref_7_idx ON pathways.budget_expense_entries USING btree (organization_id, project_id, status, expense_date);

CREATE UNIQUE INDEX budget_expense_entries_scope_key ON pathways.budget_expense_entries USING btree (organization_id, project_id, id);

CREATE INDEX data_import_batches_claim_idx ON pathways.data_import_batches USING btree (organization_id, project_id, status, processing_claimed_at);

CREATE UNIQUE INDEX data_import_batches_client_key ON pathways.data_import_batches USING btree (organization_id, uploaded_by_id, client_import_id);

CREATE UNIQUE INDEX data_import_batches_form_scope_key ON pathways.data_import_batches USING btree (organization_id, project_id, form_id, id);

CREATE INDEX data_import_batches_form_version_idx ON pathways.data_import_batches USING btree (organization_id, project_id, form_id, form_version);

CREATE INDEX data_import_batches_project_created_idx ON pathways.data_import_batches USING btree (organization_id, project_id, created_at DESC, id);

CREATE INDEX data_import_batches_project_status_idx ON pathways.data_import_batches USING btree (organization_id, project_id, status);

CREATE INDEX data_import_batches_reviewed_by_idx ON pathways.data_import_batches USING btree (organization_id, reviewed_by_id);

CREATE UNIQUE INDEX data_import_batches_scope_key ON pathways.data_import_batches USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX data_import_batches_storage_object_key ON pathways.data_import_batches USING btree (storage_bucket, storage_object_key);

CREATE INDEX data_import_batches_uploaded_by_idx ON pathways.data_import_batches USING btree (organization_id, uploaded_by_id);

CREATE UNIQUE INDEX data_import_rows_batch_number_key ON pathways.data_import_rows USING btree (import_batch_id, row_number);

CREATE UNIQUE INDEX data_import_rows_batch_scope_key ON pathways.data_import_rows USING btree (organization_id, project_id, form_id, import_batch_id, id);

CREATE INDEX data_import_rows_batch_status_idx ON pathways.data_import_rows USING btree (import_batch_id, status);

CREATE INDEX data_import_rows_claim_idx ON pathways.data_import_rows USING btree (import_batch_id, status, processing_claimed_at);

CREATE UNIQUE INDEX data_import_rows_scope_key ON pathways.data_import_rows USING btree (organization_id, project_id, id);

CREATE INDEX data_import_rows_validated_by_idx ON pathways.data_import_rows USING btree (organization_id, validated_by_id);

CREATE INDEX decision_recommendations_ref_1_idx ON pathways.decision_recommendations USING btree (organization_id, project_id, alert_id);

CREATE INDEX decision_recommendations_ref_2_idx ON pathways.decision_recommendations USING btree (organization_id, source_rule_recommendation_id);

CREATE INDEX decision_recommendations_ref_3_idx ON pathways.decision_recommendations USING btree (organization_id, proposed_by_id);

CREATE INDEX decision_recommendations_ref_4_idx ON pathways.decision_recommendations USING btree (organization_id, reviewed_by_id);

CREATE INDEX decision_recommendations_ref_5_idx ON pathways.decision_recommendations USING btree (organization_id, outcome_by_id);

CREATE INDEX decision_recommendations_ref_6_idx ON pathways.decision_recommendations USING btree (organization_id, project_id, status);

CREATE UNIQUE INDEX decision_recommendations_scope_key ON pathways.decision_recommendations USING btree (organization_id, project_id, id);

CREATE INDEX digital_forms_activity_idx ON pathways.digital_forms USING btree (organization_id, project_id, activity_id);

CREATE INDEX digital_forms_created_by_idx ON pathways.digital_forms USING btree (organization_id, created_by_id);

CREATE INDEX digital_forms_journey_stage_idx ON pathways.digital_forms USING btree (organization_id, project_id, journey_stage_id);

CREATE INDEX digital_forms_project_status_idx ON pathways.digital_forms USING btree (organization_id, project_id, status);

CREATE UNIQUE INDEX digital_forms_project_version_key ON pathways.digital_forms USING btree (organization_id, project_id, code, version);

CREATE INDEX digital_forms_published_by_idx ON pathways.digital_forms USING btree (organization_id, published_by_id);

CREATE UNIQUE INDEX digital_forms_scope_key ON pathways.digital_forms USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX digital_forms_version_scope_key ON pathways.digital_forms USING btree (organization_id, project_id, id, version);

CREATE INDEX evidence_media_activity_update_idx ON pathways.evidence_media USING btree (organization_id, project_id, activity_id, activity_update_id);

CREATE INDEX evidence_media_ref_10_idx ON pathways.evidence_media USING btree (organization_id, public_approved_by_id);

CREATE INDEX evidence_media_ref_11_idx ON pathways.evidence_media USING btree (organization_id, published_by_id);

CREATE INDEX evidence_media_ref_12_idx ON pathways.evidence_media USING btree (organization_id, project_id, status);

CREATE INDEX evidence_media_ref_13_idx ON pathways.evidence_media USING btree (organization_id, project_id, public_visibility_status);

CREATE INDEX evidence_media_ref_1_idx ON pathways.evidence_media USING btree (organization_id, project_id, activity_id);

CREATE INDEX evidence_media_ref_2_idx ON pathways.evidence_media USING btree (organization_id, project_id, enrollment_id);

CREATE INDEX evidence_media_ref_3_idx ON pathways.evidence_media USING btree (organization_id, project_id, expense_id);

CREATE INDEX evidence_media_ref_4_idx ON pathways.evidence_media USING btree (organization_id, project_id, source_submission_id);

CREATE INDEX evidence_media_ref_5_idx ON pathways.evidence_media USING btree (organization_id, submitted_by_id);

CREATE INDEX evidence_media_ref_6_idx ON pathways.evidence_media USING btree (organization_id, verified_by_id);

CREATE INDEX evidence_media_ref_7_idx ON pathways.evidence_media USING btree (organization_id, approved_by_id);

CREATE INDEX evidence_media_ref_8_idx ON pathways.evidence_media USING btree (organization_id, rejected_by_id);

CREATE INDEX evidence_media_ref_9_idx ON pathways.evidence_media USING btree (organization_id, public_submitted_by_id);

CREATE UNIQUE INDEX evidence_media_scope_key ON pathways.evidence_media USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX evidence_media_unique_1 ON pathways.evidence_media USING btree (bucket, object_key);

CREATE UNIQUE INDEX form_fields_form_code_key ON pathways.form_fields USING btree (form_id, code);

CREATE UNIQUE INDEX form_fields_form_scope_key ON pathways.form_fields USING btree (organization_id, project_id, form_id, id);

CREATE UNIQUE INDEX form_fields_form_sequence_key ON pathways.form_fields USING btree (form_id, sequence_no);

CREATE UNIQUE INDEX form_fields_scope_key ON pathways.form_fields USING btree (organization_id, project_id, id);

CREATE INDEX form_response_values_field_idx ON pathways.form_response_values USING btree (organization_id, project_id, form_id, field_id);

CREATE INDEX form_response_values_form_idx ON pathways.form_response_values USING btree (organization_id, project_id, form_id);

CREATE UNIQUE INDEX form_response_values_scope_key ON pathways.form_response_values USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX form_response_values_submission_field_key ON pathways.form_response_values USING btree (submission_id, field_id);

CREATE INDEX form_response_values_submission_idx ON pathways.form_response_values USING btree (organization_id, project_id, form_id, submission_id);

CREATE UNIQUE INDEX form_submissions_client_key ON pathways.form_submissions USING btree (organization_id, submitted_by_id, client_submission_id);

CREATE INDEX form_submissions_enrollment_idx ON pathways.form_submissions USING btree (organization_id, project_id, enrollment_id);

CREATE UNIQUE INDEX form_submissions_form_scope_key ON pathways.form_submissions USING btree (organization_id, project_id, form_id, id);

CREATE INDEX form_submissions_import_batch_idx ON pathways.form_submissions USING btree (organization_id, project_id, form_id, import_batch_id);

CREATE INDEX form_submissions_import_row_idx ON pathways.form_submissions USING btree (organization_id, project_id, form_id, import_batch_id, import_row_id);

CREATE UNIQUE INDEX form_submissions_import_row_key ON pathways.form_submissions USING btree (import_row_id);

CREATE UNIQUE INDEX form_submissions_scope_key ON pathways.form_submissions USING btree (organization_id, project_id, id);

CREATE INDEX form_submissions_status_submitted_idx ON pathways.form_submissions USING btree (organization_id, project_id, status, submitted_at);

CREATE INDEX form_submissions_submitted_by_idx ON pathways.form_submissions USING btree (organization_id, submitted_by_id);

CREATE INDEX form_submissions_validated_by_idx ON pathways.form_submissions USING btree (organization_id, validated_by_id);

CREATE INDEX journey_stages_created_by_idx ON pathways.journey_stages USING btree (organization_id, created_by_id);

CREATE INDEX journey_stages_parent_stage_idx ON pathways.journey_stages USING btree (organization_id, project_id, parent_stage_id);

CREATE UNIQUE INDEX journey_stages_project_code_key ON pathways.journey_stages USING btree (organization_id, project_id, code);

CREATE UNIQUE INDEX journey_stages_project_order_key ON pathways.journey_stages USING btree (organization_id, project_id, stage_order);

CREATE UNIQUE INDEX journey_stages_scope_key ON pathways.journey_stages USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX metadata_mappings_batch_revision_source_key ON pathways.metadata_mappings USING btree (import_batch_id, revision, source_field_name);

CREATE INDEX metadata_mappings_form_idx ON pathways.metadata_mappings USING btree (organization_id, project_id, form_id);

CREATE INDEX metadata_mappings_import_batch_idx ON pathways.metadata_mappings USING btree (organization_id, project_id, form_id, import_batch_id);

CREATE UNIQUE INDEX metadata_mappings_scope_key ON pathways.metadata_mappings USING btree (organization_id, project_id, id);

CREATE INDEX metadata_mappings_target_field_idx ON pathways.metadata_mappings USING btree (organization_id, project_id, form_id, target_field_id);

CREATE UNIQUE INDEX organizations_code_key ON pathways.organizations USING btree (code);

CREATE INDEX organizations_status_idx ON pathways.organizations USING btree (status);

CREATE INDEX p06_bindings_source_idx ON pathways.project_indicator_bindings USING btree (organization_id, project_id, form_id, field_id);

CREATE INDEX p06_enrollments_period_idx ON pathways.beneficiary_project_enrollments USING btree (organization_id, project_id, enrollment_date, ended_date);

CREATE INDEX p06_measurements_period_idx ON pathways.project_indicator_measurements USING btree (organization_id, project_id, indicator_id, period_start, period_end);

CREATE UNIQUE INDEX p06_measurements_root_key ON pathways.project_indicator_measurements USING btree (organization_id, project_id, indicator_id, period_start, period_end) WHERE (corrects_measurement_id IS NULL);

CREATE INDEX p06_sensitive_release_status_idx ON pathways.sensitive_aggregate_releases USING btree (organization_id, status, project_id);

CREATE UNIQUE INDEX paa_one_active_assignment ON pathways.project_activity_assignments USING btree (organization_id, project_id, activity_id, project_assignment_id) WHERE (status = 'ACTIVE'::pathways.activity_assignment_status);

CREATE UNIQUE INDEX permissions_code_key ON pathways.permissions USING btree (code);

CREATE INDEX programs_manager_user_idx ON pathways.programs USING btree (organization_id, manager_user_id);

CREATE UNIQUE INDEX programs_org_code_key ON pathways.programs USING btree (organization_id, code);

CREATE INDEX programs_org_status_idx ON pathways.programs USING btree (organization_id, status);

CREATE UNIQUE INDEX programs_scope_key ON pathways.programs USING btree (organization_id, id);

CREATE INDEX project_activities_created_by_idx ON pathways.project_activities USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX project_activities_project_code_key ON pathways.project_activities USING btree (organization_id, project_id, code);

CREATE INDEX project_activities_reviewed_by_idx ON pathways.project_activities USING btree (organization_id, reviewed_by_id);

CREATE UNIQUE INDEX project_activities_scope_key ON pathways.project_activities USING btree (organization_id, project_id, id);

CREATE INDEX project_activities_status_due_idx ON pathways.project_activities USING btree (organization_id, project_id, status, planned_end_date);

CREATE INDEX project_activity_assignments_activity_status_idx ON pathways.project_activity_assignments USING btree (organization_id, project_id, activity_id, status);

CREATE INDEX project_activity_assignments_assigned_by_idx ON pathways.project_activity_assignments USING btree (organization_id, assigned_by_id);

CREATE INDEX project_activity_assignments_project_assignment_idx ON pathways.project_activity_assignments USING btree (organization_id, project_id, project_assignment_id);

CREATE UNIQUE INDEX project_activity_assignments_scope_key ON pathways.project_activity_assignments USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX project_budget_records_active_activity_profile_key ON pathways.project_budget_records USING btree (organization_id, project_id, activity_id) WHERE ((category = 'ACTIVITY_PROFILE_TOTAL'::text) AND (activity_id IS NOT NULL) AND (archived_at IS NULL));

CREATE UNIQUE INDEX project_budget_records_active_project_profile_key ON pathways.project_budget_records USING btree (organization_id, project_id) WHERE ((category = 'PROJECT_PROFILE_TOTAL'::text) AND (activity_id IS NULL) AND (archived_at IS NULL));

CREATE INDEX project_budget_records_ref_1_idx ON pathways.project_budget_records USING btree (organization_id, project_id, activity_id);

CREATE INDEX project_budget_records_ref_2_idx ON pathways.project_budget_records USING btree (organization_id, recorded_by_id);

CREATE INDEX project_budget_records_ref_3_idx ON pathways.project_budget_records USING btree (organization_id, project_id, category);

CREATE UNIQUE INDEX project_budget_records_scope_key ON pathways.project_budget_records USING btree (organization_id, project_id, id);

CREATE INDEX project_evaluation_criteria_ref_1_idx ON pathways.project_evaluation_criteria USING btree (organization_id, created_by_id);

CREATE INDEX project_evaluation_criteria_ref_2_idx ON pathways.project_evaluation_criteria USING btree (organization_id, published_by_id);

CREATE UNIQUE INDEX project_evaluation_criteria_scope_key ON pathways.project_evaluation_criteria USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX project_evaluation_criteria_unique_1 ON pathways.project_evaluation_criteria USING btree (organization_id, project_id, code, version);

CREATE INDEX project_evaluation_scores_ref_1_idx ON pathways.project_evaluation_scores USING btree (organization_id, project_id, evaluation_id);

CREATE INDEX project_evaluation_scores_ref_2_idx ON pathways.project_evaluation_scores USING btree (organization_id, project_id, criterion_id);

CREATE UNIQUE INDEX project_evaluation_scores_scope_key ON pathways.project_evaluation_scores USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX project_evaluation_scores_unique_1 ON pathways.project_evaluation_scores USING btree (organization_id, project_id, evaluation_id, criterion_id);

CREATE INDEX project_evaluations_ref_1_idx ON pathways.project_evaluations USING btree (organization_id, evaluated_by_id);

CREATE INDEX project_evaluations_ref_2_idx ON pathways.project_evaluations USING btree (organization_id, reviewed_by_id);

CREATE INDEX project_evaluations_ref_3_idx ON pathways.project_evaluations USING btree (organization_id, signed_off_by_id);

CREATE INDEX project_evaluations_ref_4_idx ON pathways.project_evaluations USING btree (organization_id, project_id, status, period_end);

CREATE UNIQUE INDEX project_evaluations_scope_key ON pathways.project_evaluations USING btree (organization_id, project_id, id);

CREATE INDEX project_indicators_created_by_idx ON pathways.project_indicators USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX project_indicators_project_code_key ON pathways.project_indicators USING btree (organization_id, project_id, code);

CREATE INDEX project_indicators_project_status_idx ON pathways.project_indicators USING btree (organization_id, project_id, status);

CREATE UNIQUE INDEX project_indicators_scope_key ON pathways.project_indicators USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX project_milestones_scope_key ON pathways.project_milestones USING btree (organization_id, project_id, id);

CREATE INDEX project_milestones_status_target_idx ON pathways.project_milestones USING btree (organization_id, project_id, status, target_date);

CREATE INDEX projects_created_by_idx ON pathways.projects USING btree (organization_id, created_by_id);

CREATE UNIQUE INDEX projects_org_code_key ON pathways.projects USING btree (organization_id, code);

CREATE INDEX projects_org_public_idx ON pathways.projects USING btree (organization_id, public_visibility_status);

CREATE INDEX projects_org_status_idx ON pathways.projects USING btree (organization_id, status);

CREATE INDEX projects_program_idx ON pathways.projects USING btree (organization_id, program_id);

CREATE INDEX projects_program_manager_idx ON pathways.projects USING btree (organization_id, program_manager_id);

CREATE INDEX projects_public_approved_by_idx ON pathways.projects USING btree (organization_id, public_approved_by_id);

CREATE INDEX projects_public_submitted_by_idx ON pathways.projects USING btree (organization_id, public_submitted_by_id);

CREATE INDEX projects_published_by_idx ON pathways.projects USING btree (organization_id, published_by_id);

CREATE UNIQUE INDEX projects_scope_key ON pathways.projects USING btree (organization_id, id);

CREATE INDEX reports_ref_1_idx ON pathways.reports USING btree (organization_id, program_id);

CREATE INDEX reports_ref_2_idx ON pathways.reports USING btree (organization_id, project_id, form_id);

CREATE INDEX reports_ref_3_idx ON pathways.reports USING btree (organization_id, project_id, activity_id);

CREATE INDEX reports_ref_4_idx ON pathways.reports USING btree (organization_id, project_id, journey_stage_id);

CREATE INDEX reports_ref_5_idx ON pathways.reports USING btree (organization_id, project_id, evaluation_id);

CREATE INDEX reports_ref_6_idx ON pathways.reports USING btree (organization_id, created_by_id);

CREATE INDEX reports_ref_7_idx ON pathways.reports USING btree (organization_id, generated_by_id);

CREATE INDEX reports_ref_8_idx ON pathways.reports USING btree (organization_id, project_id, type, generated_at);

CREATE UNIQUE INDEX reports_scope_key ON pathways.reports USING btree (organization_id, id);

CREATE UNIQUE INDEX reports_unique_1 ON pathways.reports USING btree (bucket, object_key);

CREATE INDEX role_permissions_permission_id_idx ON pathways.role_permissions USING btree (permission_id);

CREATE UNIQUE INDEX roles_code_key ON pathways.roles USING btree (code);

CREATE UNIQUE INDEX roles_name_key ON pathways.roles USING btree (name);

CREATE INDEX rule_based_alerts_ref_1_idx ON pathways.rule_based_alerts USING btree (organization_id, rule_id);

CREATE INDEX rule_based_alerts_ref_2_idx ON pathways.rule_based_alerts USING btree (organization_id, project_id, indicator_id);

CREATE INDEX rule_based_alerts_ref_3_idx ON pathways.rule_based_alerts USING btree (organization_id, project_id, activity_id);

CREATE INDEX rule_based_alerts_ref_4_idx ON pathways.rule_based_alerts USING btree (organization_id, evaluated_by_id);

CREATE UNIQUE INDEX rule_based_alerts_scope_key ON pathways.rule_based_alerts USING btree (organization_id, project_id, id);

CREATE UNIQUE INDEX system_users_auth_user_id_key ON pathways.system_users USING btree (auth_user_id);

CREATE UNIQUE INDEX system_users_organization_email_key ON pathways.system_users USING btree (organization_id, lower(btrim(email)));

CREATE INDEX system_users_organization_id_account_status_idx ON pathways.system_users USING btree (organization_id, account_status);

CREATE UNIQUE INDEX system_users_organization_id_id_key ON pathways.system_users USING btree (organization_id, id);

CREATE INDEX system_users_role_id_idx ON pathways.system_users USING btree (role_id);

CREATE UNIQUE INDEX upa_one_active_user_project ON pathways.user_project_assignments USING btree (organization_id, project_id, user_id) WHERE (status = 'ACTIVE'::pathways.assignment_status);

CREATE INDEX user_project_assignments_assigned_by_idx ON pathways.user_project_assignments USING btree (organization_id, assigned_by_id);

CREATE INDEX user_project_assignments_project_status_idx ON pathways.user_project_assignments USING btree (organization_id, project_id, status);

CREATE UNIQUE INDEX user_project_assignments_scope_key ON pathways.user_project_assignments USING btree (organization_id, project_id, id);

CREATE INDEX user_project_assignments_user_status_idx ON pathways.user_project_assignments USING btree (organization_id, user_id, status);

CREATE UNIQUE INDEX "ParticipantCard_cardNumber_key" ON public."ParticipantCard" USING btree ("cardNumber");

CREATE UNIQUE INDEX "Participant_externalId_key" ON public."Participant" USING btree ("externalId");

CREATE UNIQUE INDEX "Program_code_key" ON public."Program" USING btree (code);

CREATE UNIQUE INDEX "Project_code_key" ON public."Project" USING btree (code);

CREATE UNIQUE INDEX "Role_name_key" ON public."Role" USING btree (name);

CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON public."UserRole" USING btree ("userId", "roleId");

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

CREATE UNIQUE INDEX "User_supabaseUserId_key" ON public."User" USING btree ("supabaseUserId");

CREATE TRIGGER p03_guard_import_batch BEFORE INSERT OR UPDATE ON pathways.data_import_batches FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_import_batch();

CREATE TRIGGER p03_guard_import_row BEFORE DELETE OR UPDATE ON pathways.data_import_rows FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_import_row();

CREATE TRIGGER p03_guard_mapping BEFORE INSERT OR DELETE OR UPDATE ON pathways.metadata_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_mapping();

CREATE TRIGGER p03_guard_submission BEFORE INSERT OR UPDATE ON pathways.form_submissions FOR EACH ROW EXECUTE FUNCTION pathways.p03_guard_submission();

CREATE CONSTRAINT TRIGGER p03_row_complete AFTER INSERT OR UPDATE ON pathways.data_import_rows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p03_assert_processed_row();

CREATE TRIGGER p04_beneficiary BEFORE INSERT OR UPDATE ON pathways.beneficiaries FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_beneficiary();

CREATE TRIGGER p04_consent BEFORE INSERT OR DELETE OR UPDATE ON pathways.beneficiary_consent_records FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_consent();

CREATE TRIGGER p04_identifier BEFORE INSERT OR DELETE OR UPDATE ON pathways.beneficiary_identifiers FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_identifier();

CREATE TRIGGER p05_activity_update_guard BEFORE DELETE OR UPDATE ON pathways.activity_updates FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_activity_update();

CREATE TRIGGER p05_journey_snapshot BEFORE INSERT ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p05_snapshot_journey_event();

CREATE TRIGGER p05_mapping_freeze BEFORE DELETE OR UPDATE ON pathways.activity_journey_stage_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_mapping_freeze();

CREATE TRIGGER p05_stage_freeze BEFORE INSERT OR DELETE OR UPDATE ON pathways.journey_stages FOR EACH ROW EXECUTE FUNCTION pathways.p05_guard_stage_freeze();

CREATE TRIGGER p06_binding BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_indicator_bindings FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_binding();

CREATE CONSTRAINT TRIGGER p06_binding_authority AFTER INSERT OR UPDATE ON pathways.project_indicators DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p06_check_binding_authority();

CREATE TRIGGER p06_indicator BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_indicator();

CREATE TRIGGER p06_measurement BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_indicator_measurements FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_measurement();

CREATE TRIGGER p08_activity_profile BEFORE INSERT OR UPDATE OF organization_id, project_id, planned_start_date, planned_end_date, timeline_override_justification ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p08_guard_activity_profile();

CREATE TRIGGER p08_no_activity_indicator_link_update BEFORE UPDATE ON pathways.activity_indicator_links FOR EACH ROW EXECUTE FUNCTION pathways.p08_reject_activity_indicator_link_update();

CREATE TRIGGER p08_project_profile BEFORE INSERT OR UPDATE OF organization_id, program_manager_id ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p08_guard_project_profile();

CREATE TRIGGER p09_activity_authority BEFORE UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_activity();

CREATE TRIGGER p09_expense_review BEFORE UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_expense_review();

CREATE TRIGGER p09_form_archive BEFORE UPDATE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_archive('forms.archive');

CREATE TRIGGER p09_indicator_archive BEFORE UPDATE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_archive('indicators.archive');

CREATE TRIGGER p09_project_authority BEFORE UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_project();

CREATE TRIGGER p09_supporting_insert BEFORE INSERT ON pathways.audit_logs FOR EACH ROW EXECUTE FUNCTION pathways.p09_stamp_supporting_insert();

CREATE TRIGGER p09_supporting_insert BEFORE INSERT ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p09_stamp_supporting_insert();

CREATE TRIGGER p2_activity_assignment BEFORE INSERT OR UPDATE ON pathways.project_activity_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_activity_assignment();

CREATE TRIGGER p2_activity_lifecycle BEFORE INSERT OR UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_activity_lifecycle();

CREATE TRIGGER p2_enrollment_dates BEFORE UPDATE ON pathways.beneficiary_project_enrollments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_enrollment_dates();

CREATE TRIGGER p2_form BEFORE INSERT OR DELETE OR UPDATE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_form();

CREATE TRIGGER p2_form_field BEFORE INSERT OR DELETE OR UPDATE ON pathways.form_fields FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_form_field();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.activity_journey_stage_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiaries FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_activity_participations FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_project_enrollments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.data_import_batches FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.data_import_rows FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_fields FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_response_values FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_submissions FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.journey_stages FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.metadata_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.programs FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_activity_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_milestones FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.user_project_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();

CREATE TRIGGER p2_journey_dates BEFORE INSERT ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_participation_dates();

CREATE TRIGGER p2_journey_history BEFORE DELETE OR UPDATE ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_journey_history();

CREATE TRIGGER p2_participation_dates BEFORE INSERT OR UPDATE ON pathways.beneficiary_activity_participations FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_participation_dates();

CREATE TRIGGER p2_profile_assignments BEFORE UPDATE OF account_status, organization_id ON pathways.system_users FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_profile_assignments();

CREATE TRIGGER p2_project_assignment BEFORE INSERT OR UPDATE ON pathways.user_project_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_project_assignment();

CREATE TRIGGER p2_public_content BEFORE INSERT OR UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_public_content();

CREATE TRIGGER p2_response BEFORE INSERT OR DELETE OR UPDATE ON pathways.form_response_values FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_response();

CREATE CONSTRAINT TRIGGER p2_response_complete AFTER INSERT OR DELETE OR UPDATE ON pathways.form_response_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_submission();

CREATE TRIGGER p2_stage_order BEFORE INSERT OR UPDATE ON pathways.journey_stages FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_stage_order();

CREATE CONSTRAINT TRIGGER p2_submission_complete AFTER INSERT OR UPDATE ON pathways.form_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_submission();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rule_conditions FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluation_scores FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id', 'activated_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('recorded_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('submitted_by_id', 'verified_by_id', 'approved_by_id', 'rejected_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('proposed_by_id', 'reviewed_by_id', 'outcome_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('submitted_by_id', 'verified_by_id', 'approved_by_id', 'rejected_by_id', 'public_submitted_by_id', 'public_approved_by_id', 'published_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('recorded_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id', 'published_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('evaluated_by_id', 'reviewed_by_id', 'signed_off_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id', 'generated_by_id');

CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('evaluated_by_id');

CREATE TRIGGER p3_20_alert BEFORE INSERT OR UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_alert();

CREATE TRIGGER p3_20_budget BEFORE UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_budget();

CREATE TRIGGER p3_20_criterion BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_criterion();

CREATE TRIGGER p3_20_decision BEFORE INSERT OR UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_decision();

CREATE TRIGGER p3_20_evaluation BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_evaluation();

CREATE TRIGGER p3_20_report BEFORE INSERT OR DELETE OR UPDATE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_report();

CREATE TRIGGER p3_20_review BEFORE INSERT OR UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_review();

CREATE TRIGGER p3_20_review BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_review();

CREATE TRIGGER p3_20_rule BEFORE INSERT OR DELETE OR UPDATE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule();

CREATE TRIGGER p3_20_rule_child BEFORE INSERT OR DELETE OR UPDATE ON pathways.alert_rule_conditions FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule_child();

CREATE TRIGGER p3_20_rule_child BEFORE INSERT OR DELETE OR UPDATE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule_child();

CREATE TRIGGER p3_20_score BEFORE INSERT OR DELETE OR UPDATE ON pathways.project_evaluation_scores FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_score();

CREATE TRIGGER p3_30_source BEFORE INSERT OR UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_source();

CREATE TRIGGER p3_30_source BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_source();

CREATE TRIGGER p3_40_public BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_public_evidence();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_indicator_fk FOREIGN KEY (organization_id, project_id, indicator_id) REFERENCES pathways.project_indicators(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_indicator_links
    ADD CONSTRAINT activity_indicator_links_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_journey_stage_mappings
    ADD CONSTRAINT activity_journey_stage_mappings_stage_fk FOREIGN KEY (organization_id, project_id, stage_id) REFERENCES pathways.journey_stages(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_reviewed_by_fk FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_updates
    ADD CONSTRAINT activity_updates_submitted_by_fk FOREIGN KEY (organization_id, submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rule_conditions
    ADD CONSTRAINT alert_rule_conditions_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rule_conditions
    ADD CONSTRAINT alert_rule_conditions_rule_fkey FOREIGN KEY (organization_id, rule_id) REFERENCES pathways.alert_rules(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rule_recommendations
    ADD CONSTRAINT alert_rule_recommendations_created_by_fkey FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rule_recommendations
    ADD CONSTRAINT alert_rule_recommendations_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rule_recommendations
    ADD CONSTRAINT alert_rule_recommendations_rule_fkey FOREIGN KEY (organization_id, rule_id) REFERENCES pathways.alert_rules(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rules
    ADD CONSTRAINT alert_rules_activated_by_fkey FOREIGN KEY (organization_id, activated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rules
    ADD CONSTRAINT alert_rules_created_by_fkey FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.alert_rules
    ADD CONSTRAINT alert_rules_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_activity_fkey FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_enrollment_fkey FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_recorded_by_fkey FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.assessment_results
    ADD CONSTRAINT assessment_results_source_submission_fkey FOREIGN KEY (organization_id, project_id, source_submission_id) REFERENCES pathways.form_submissions(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_actor_user_id_fkey FOREIGN KEY (organization_id, actor_user_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiaries
    ADD CONSTRAINT beneficiaries_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiaries
    ADD CONSTRAINT beneficiaries_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_enrollment_fk FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_recorded_by_fk FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_activity_participations
    ADD CONSTRAINT beneficiary_activity_participations_submission_fk FOREIGN KEY (organization_id, project_id, source_submission_id) REFERENCES pathways.form_submissions(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_beneficiary_fk FOREIGN KEY (organization_id, beneficiary_id) REFERENCES pathways.beneficiaries(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_enrollment_fk FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_recorded_by_fk FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_consent_records
    ADD CONSTRAINT beneficiary_consent_records_submission_fk FOREIGN KEY (organization_id, project_id, submission_id) REFERENCES pathways.form_submissions(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_identifiers
    ADD CONSTRAINT beneficiary_identifiers_beneficiary_fk FOREIGN KEY (organization_id, beneficiary_id) REFERENCES pathways.beneficiaries(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_identifiers
    ADD CONSTRAINT beneficiary_identifiers_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_identifiers
    ADD CONSTRAINT beneficiary_identifiers_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_activity_stage_fk FOREIGN KEY (organization_id, project_id, activity_id, stage_id) REFERENCES pathways.activity_journey_stage_mappings(organization_id, project_id, activity_id, stage_id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_correction_fk FOREIGN KEY (organization_id, project_id, corrects_event_id) REFERENCES pathways.beneficiary_journey_events(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_enrollment_fk FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_participation_fk FOREIGN KEY (organization_id, project_id, enrollment_id, activity_id, participation_id) REFERENCES pathways.beneficiary_activity_participations(organization_id, project_id, enrollment_id, activity_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_recorded_by_fk FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_journey_events
    ADD CONSTRAINT beneficiary_journey_events_stage_fk FOREIGN KEY (organization_id, project_id, stage_id) REFERENCES pathways.journey_stages(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_project_enrollments
    ADD CONSTRAINT beneficiary_project_enrollments_beneficiary_fk FOREIGN KEY (organization_id, beneficiary_id) REFERENCES pathways.beneficiaries(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_project_enrollments
    ADD CONSTRAINT beneficiary_project_enrollments_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_project_enrollments
    ADD CONSTRAINT beneficiary_project_enrollments_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.beneficiary_project_enrollments
    ADD CONSTRAINT beneficiary_project_enrollments_recorded_by_fk FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_approved_by_fkey FOREIGN KEY (organization_id, approved_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_budget_record_fkey FOREIGN KEY (organization_id, project_id, budget_record_id) REFERENCES pathways.project_budget_records(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_receipt_evidence_fkey FOREIGN KEY (organization_id, project_id, receipt_evidence_id) REFERENCES pathways.evidence_media(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_rejected_by_fkey FOREIGN KEY (organization_id, rejected_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_submitted_by_fkey FOREIGN KEY (organization_id, submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.budget_expense_entries
    ADD CONSTRAINT budget_expense_entries_verified_by_fkey FOREIGN KEY (organization_id, verified_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_form_fk FOREIGN KEY (organization_id, project_id, form_id, form_version) REFERENCES pathways.digital_forms(organization_id, project_id, id, version) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_reviewed_by_fk FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_batches
    ADD CONSTRAINT data_import_batches_uploaded_by_fk FOREIGN KEY (organization_id, uploaded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_form_fk FOREIGN KEY (organization_id, project_id, form_id) REFERENCES pathways.digital_forms(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_import_batch_fk FOREIGN KEY (organization_id, project_id, form_id, import_batch_id) REFERENCES pathways.data_import_batches(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_validated_by_fk FOREIGN KEY (organization_id, validated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_alert_fkey FOREIGN KEY (organization_id, project_id, alert_id) REFERENCES pathways.rule_based_alerts(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_outcome_by_fkey FOREIGN KEY (organization_id, outcome_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_proposed_by_fkey FOREIGN KEY (organization_id, proposed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_reviewed_by_fkey FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.decision_recommendations
    ADD CONSTRAINT decision_recommendations_source_rule_recommendation_fkey FOREIGN KEY (organization_id, source_rule_recommendation_id) REFERENCES pathways.alert_rule_recommendations(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_journey_stage_fk FOREIGN KEY (organization_id, project_id, journey_stage_id) REFERENCES pathways.journey_stages(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.digital_forms
    ADD CONSTRAINT digital_forms_published_by_fk FOREIGN KEY (organization_id, published_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_activity_fkey FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_activity_update_fk FOREIGN KEY (organization_id, project_id, activity_id, activity_update_id) REFERENCES pathways.activity_updates(organization_id, project_id, activity_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_approved_by_fkey FOREIGN KEY (organization_id, approved_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_enrollment_fkey FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_expense_fkey FOREIGN KEY (organization_id, project_id, expense_id) REFERENCES pathways.budget_expense_entries(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_public_approved_by_fkey FOREIGN KEY (organization_id, public_approved_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_public_submitted_by_fkey FOREIGN KEY (organization_id, public_submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_published_by_fkey FOREIGN KEY (organization_id, published_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_rejected_by_fkey FOREIGN KEY (organization_id, rejected_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_source_submission_fkey FOREIGN KEY (organization_id, project_id, source_submission_id) REFERENCES pathways.form_submissions(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_submitted_by_fkey FOREIGN KEY (organization_id, submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.evidence_media
    ADD CONSTRAINT evidence_media_verified_by_fkey FOREIGN KEY (organization_id, verified_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_fields
    ADD CONSTRAINT form_fields_form_fk FOREIGN KEY (organization_id, project_id, form_id) REFERENCES pathways.digital_forms(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_fields
    ADD CONSTRAINT form_fields_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_fields
    ADD CONSTRAINT form_fields_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_field_fk FOREIGN KEY (organization_id, project_id, form_id, field_id) REFERENCES pathways.form_fields(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_form_fk FOREIGN KEY (organization_id, project_id, form_id) REFERENCES pathways.digital_forms(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_response_values
    ADD CONSTRAINT form_response_values_submission_fk FOREIGN KEY (organization_id, project_id, form_id, submission_id) REFERENCES pathways.form_submissions(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_enrollment_fk FOREIGN KEY (organization_id, project_id, enrollment_id) REFERENCES pathways.beneficiary_project_enrollments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_form_fk FOREIGN KEY (organization_id, project_id, form_id, form_version) REFERENCES pathways.digital_forms(organization_id, project_id, id, version) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_import_batch_fk FOREIGN KEY (organization_id, project_id, form_id, import_batch_id) REFERENCES pathways.data_import_batches(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_import_row_fk FOREIGN KEY (organization_id, project_id, form_id, import_batch_id, import_row_id) REFERENCES pathways.data_import_rows(organization_id, project_id, form_id, import_batch_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_submitted_by_fk FOREIGN KEY (organization_id, submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.form_submissions
    ADD CONSTRAINT form_submissions_validated_by_fk FOREIGN KEY (organization_id, validated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.journey_stages
    ADD CONSTRAINT journey_stages_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.journey_stages
    ADD CONSTRAINT journey_stages_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.journey_stages
    ADD CONSTRAINT journey_stages_parent_stage_fk FOREIGN KEY (organization_id, project_id, parent_stage_id) REFERENCES pathways.journey_stages(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.journey_stages
    ADD CONSTRAINT journey_stages_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_form_fk FOREIGN KEY (organization_id, project_id, form_id) REFERENCES pathways.digital_forms(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_import_batch_fk FOREIGN KEY (organization_id, project_id, form_id, import_batch_id) REFERENCES pathways.data_import_batches(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.metadata_mappings
    ADD CONSTRAINT metadata_mappings_target_field_fk FOREIGN KEY (organization_id, project_id, form_id, target_field_id) REFERENCES pathways.form_fields(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_creator_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_field_fk FOREIGN KEY (organization_id, project_id, form_id, field_id) REFERENCES pathways.form_fields(organization_id, project_id, form_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_form_fk FOREIGN KEY (organization_id, project_id, form_id, form_version) REFERENCES pathways.digital_forms(organization_id, project_id, id, version) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_indicator_fk FOREIGN KEY (organization_id, project_id, indicator_id) REFERENCES pathways.project_indicators(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_org_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_bindings
    ADD CONSTRAINT p06_bindings_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_correction_fk FOREIGN KEY (organization_id, project_id, indicator_id, corrects_measurement_id) REFERENCES pathways.project_indicator_measurements(organization_id, project_id, indicator_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_indicator_fk FOREIGN KEY (organization_id, project_id, indicator_id) REFERENCES pathways.project_indicators(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_org_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicator_measurements
    ADD CONSTRAINT p06_measurements_recorder_fk FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.sensitive_aggregate_releases
    ADD CONSTRAINT p06_sensitive_release_org_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.sensitive_aggregate_releases
    ADD CONSTRAINT p06_sensitive_release_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.programs
    ADD CONSTRAINT programs_manager_user_fk FOREIGN KEY (organization_id, manager_user_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.programs
    ADD CONSTRAINT programs_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activities
    ADD CONSTRAINT project_activities_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activities
    ADD CONSTRAINT project_activities_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activities
    ADD CONSTRAINT project_activities_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activities
    ADD CONSTRAINT project_activities_reviewed_by_fk FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_activity_fk FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_assigned_by_fk FOREIGN KEY (organization_id, assigned_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_project_assignment_fk FOREIGN KEY (organization_id, project_id, project_assignment_id) REFERENCES pathways.user_project_assignments(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_activity_assignments
    ADD CONSTRAINT project_activity_assignments_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_budget_records
    ADD CONSTRAINT project_budget_records_activity_fkey FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_budget_records
    ADD CONSTRAINT project_budget_records_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_budget_records
    ADD CONSTRAINT project_budget_records_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_budget_records
    ADD CONSTRAINT project_budget_records_recorded_by_fkey FOREIGN KEY (organization_id, recorded_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_criteria
    ADD CONSTRAINT project_evaluation_criteria_created_by_fkey FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_criteria
    ADD CONSTRAINT project_evaluation_criteria_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_criteria
    ADD CONSTRAINT project_evaluation_criteria_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_criteria
    ADD CONSTRAINT project_evaluation_criteria_published_by_fkey FOREIGN KEY (organization_id, published_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_scores
    ADD CONSTRAINT project_evaluation_scores_criterion_fkey FOREIGN KEY (organization_id, project_id, criterion_id) REFERENCES pathways.project_evaluation_criteria(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_scores
    ADD CONSTRAINT project_evaluation_scores_evaluation_fkey FOREIGN KEY (organization_id, project_id, evaluation_id) REFERENCES pathways.project_evaluations(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_scores
    ADD CONSTRAINT project_evaluation_scores_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluation_scores
    ADD CONSTRAINT project_evaluation_scores_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_evaluated_by_fkey FOREIGN KEY (organization_id, evaluated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_reviewed_by_fkey FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_evaluations
    ADD CONSTRAINT project_evaluations_signed_off_by_fkey FOREIGN KEY (organization_id, signed_off_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicators
    ADD CONSTRAINT project_indicators_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicators
    ADD CONSTRAINT project_indicators_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_indicators
    ADD CONSTRAINT project_indicators_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_milestones
    ADD CONSTRAINT project_milestones_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.project_milestones
    ADD CONSTRAINT project_milestones_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_created_by_fk FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES pathways.programs(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_program_manager_fk FOREIGN KEY (organization_id, program_manager_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_public_approved_by_fk FOREIGN KEY (organization_id, public_approved_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_public_submitted_by_fk FOREIGN KEY (organization_id, public_submitted_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.projects
    ADD CONSTRAINT projects_published_by_fk FOREIGN KEY (organization_id, published_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_activity_fkey FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_created_by_fkey FOREIGN KEY (organization_id, created_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_evaluation_fkey FOREIGN KEY (organization_id, project_id, evaluation_id) REFERENCES pathways.project_evaluations(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_form_fkey FOREIGN KEY (organization_id, project_id, form_id) REFERENCES pathways.digital_forms(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_generated_by_fkey FOREIGN KEY (organization_id, generated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_journey_stage_fkey FOREIGN KEY (organization_id, project_id, journey_stage_id) REFERENCES pathways.journey_stages(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_program_fkey FOREIGN KEY (organization_id, program_id) REFERENCES pathways.programs(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.reports
    ADD CONSTRAINT reports_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES pathways.permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY pathways.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES pathways.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_activity_fkey FOREIGN KEY (organization_id, project_id, activity_id) REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_evaluated_by_fkey FOREIGN KEY (organization_id, evaluated_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_indicator_fkey FOREIGN KEY (organization_id, project_id, indicator_id) REFERENCES pathways.project_indicators(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_organization_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_project_fkey FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.rule_based_alerts
    ADD CONSTRAINT rule_based_alerts_rule_fkey FOREIGN KEY (organization_id, rule_id) REFERENCES pathways.alert_rules(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.system_users
    ADD CONSTRAINT system_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE ONLY pathways.system_users
    ADD CONSTRAINT system_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.system_users
    ADD CONSTRAINT system_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES pathways.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.user_project_assignments
    ADD CONSTRAINT user_project_assignments_assigned_by_fk FOREIGN KEY (organization_id, assigned_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.user_project_assignments
    ADD CONSTRAINT user_project_assignments_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.user_project_assignments
    ADD CONSTRAINT user_project_assignments_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.user_project_assignments
    ADD CONSTRAINT user_project_assignments_user_fk FOREIGN KEY (organization_id, user_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."MetadataField"
    ADD CONSTRAINT "MetadataField_formMetadataId_fkey" FOREIGN KEY ("formMetadataId") REFERENCES public."FormMetadata"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ParticipantCard"
    ADD CONSTRAINT "ParticipantCard_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."Participant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ParticipantJourney"
    ADD CONSTRAINT "ParticipantJourney_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."Participant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ParticipantJourney"
    ADD CONSTRAINT "ParticipantJourney_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ParticipantJourney"
    ADD CONSTRAINT "ParticipantJourney_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_programId_fkey" FOREIGN KEY ("programId") REFERENCES public."Program"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadBatch"
    ADD CONSTRAINT "UploadBatch_formMetadataId_fkey" FOREIGN KEY ("formMetadataId") REFERENCES public."FormMetadata"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadBatch"
    ADD CONSTRAINT "UploadBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadBatch"
    ADD CONSTRAINT "UploadBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadRowError"
    ADD CONSTRAINT "UploadRowError_uploadRowId_fkey" FOREIGN KEY ("uploadRowId") REFERENCES public."UploadRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."UploadRow"
    ADD CONSTRAINT "UploadRow_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."Participant"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadRow"
    ADD CONSTRAINT "UploadRow_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES public."UploadBatch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE pathways.activity_indicator_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.activity_journey_stage_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.activity_updates ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.alert_rule_conditions ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.alert_rule_recommendations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.alert_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.assessment_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_activity_participations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_consent_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_identifiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_journey_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_project_enrollments ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.budget_expense_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.data_import_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.data_import_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.decision_recommendations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.digital_forms ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.evidence_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_fields ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_response_values ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.journey_stages ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.metadata_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY p03_runtime_insert ON pathways.data_import_batches FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (uploaded_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user))));

CREATE POLICY p03_runtime_insert ON pathways.form_response_values FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (EXISTS ( SELECT
   FROM pathways.form_submissions s
  WHERE ((s.organization_id = form_response_values.organization_id) AND (s.project_id = form_response_values.project_id) AND (s.form_id = form_response_values.form_id) AND (s.id = form_response_values.submission_id) AND (s.submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (((s.source = 'DIRECT_ENCODING'::pathways.submission_source) AND (s.status = 'DRAFT'::pathways.submission_status)) OR ((s.source = 'IMPORTED_DATASET'::pathways.submission_source) AND (s.status = 'DRAFT'::pathways.submission_status))))))));

CREATE POLICY p03_runtime_update ON pathways.data_import_batches FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p03_runtime_update ON pathways.form_submissions FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (status = 'DRAFT'::pathways.submission_status))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (status = ANY (ARRAY['DRAFT'::pathways.submission_status, 'VALIDATED'::pathways.submission_status]))));

CREATE POLICY p04_runtime_insert ON pathways.beneficiaries FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (created_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user))));

CREATE POLICY p04_runtime_insert ON pathways.beneficiary_consent_records FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (recorded_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p04_has_project_permission('beneficiaries.records.register'::text, beneficiary_consent_records.project_id) AS p04_has_project_permission)));

CREATE POLICY p04_runtime_insert ON pathways.beneficiary_identifiers FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (created_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user))));

CREATE POLICY p04_runtime_insert ON pathways.beneficiary_project_enrollments FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (recorded_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p04_can_insert_enrollment(beneficiary_project_enrollments.project_id, beneficiary_project_enrollments.beneficiary_id) AS p04_can_insert_enrollment)));

CREATE POLICY p04_runtime_insert ON pathways.form_submissions FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (((source = 'DIRECT_ENCODING'::pathways.submission_source) AND (status = 'DRAFT'::pathways.submission_status) AND (import_batch_id IS NULL) AND (import_row_id IS NULL)) OR ((source = 'IMPORTED_DATASET'::pathways.submission_source) AND (status = 'DRAFT'::pathways.submission_status) AND (import_batch_id IS NOT NULL) AND (import_row_id IS NOT NULL)))));

CREATE POLICY p04_runtime_select ON pathways.beneficiaries FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p04_can_read_beneficiary(beneficiaries.id) AS p04_can_read_beneficiary)));

CREATE POLICY p04_runtime_select ON pathways.beneficiary_consent_records FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p04_has_project_permission('beneficiaries.records.read'::text, beneficiary_consent_records.project_id) AS p04_has_project_permission)));

CREATE POLICY p04_runtime_select ON pathways.beneficiary_identifiers FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p04_can_read_beneficiary(beneficiary_identifiers.beneficiary_id) AS p04_can_read_beneficiary)));

CREATE POLICY p04_runtime_select ON pathways.beneficiary_project_enrollments FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p04_has_project_permission('beneficiaries.records.read'::text, beneficiary_project_enrollments.project_id) AS p04_has_project_permission)));

CREATE POLICY p04_runtime_update ON pathways.beneficiaries FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (( SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.profiles.update'::text, beneficiaries.id) AS p04_can_mutate_beneficiary) OR ( SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.records.archive'::text, beneficiaries.id) AS p04_can_mutate_beneficiary)))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (( SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.profiles.update'::text, beneficiaries.id) AS p04_can_mutate_beneficiary) OR ( SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.records.archive'::text, beneficiaries.id) AS p04_can_mutate_beneficiary))));

CREATE POLICY p05_activity_insert ON pathways.project_activities FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (created_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('activities.create'::text, project_activities.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_activity_select ON pathways.project_activities FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (( SELECT pathways.p05_has_project_permission('activities.read'::text, project_activities.project_id) AS p05_has_project_permission) OR ( SELECT pathways.p05_has_project_permission('participation.record'::text, project_activities.project_id) AS p05_has_project_permission))));

CREATE POLICY p05_activity_update ON pathways.project_activities FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('activities.update'::text, project_id) OR pathways.p05_has_project_permission('activities.complete'::text, project_id) OR pathways.p05_has_project_permission('activities.proof.submit'::text, project_id) OR pathways.p05_has_project_permission('evidence.review'::text, project_id))) WITH CHECK ((organization_id = pathways.runtime_context_organization()));

CREATE POLICY p05_activity_updates_insert ON pathways.activity_updates FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('activities.proof.submit'::text, activity_updates.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_activity_updates_select ON pathways.activity_updates FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (( SELECT pathways.p05_has_project_permission('activities.read'::text, activity_updates.project_id) AS p05_has_project_permission) OR ( SELECT pathways.p05_has_project_permission('evidence.review'::text, activity_updates.project_id) AS p05_has_project_permission))));

CREATE POLICY p05_activity_updates_update ON pathways.activity_updates FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (status = 'PENDING'::pathways.review_status) AND ( SELECT pathways.p05_has_project_permission('evidence.review'::text, activity_updates.project_id) AS p05_has_project_permission))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (reviewed_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('evidence.review'::text, activity_updates.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_actor_lock ON pathways.system_users FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)))) WITH CHECK (false);

CREATE POLICY p05_enrollment_update ON pathways.beneficiary_project_enrollments FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('beneficiaries.enrollments.manage'::text, beneficiary_project_enrollments.project_id) AS p05_has_project_permission))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('beneficiaries.enrollments.manage'::text, beneficiary_project_enrollments.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_journey_event_insert ON pathways.beneficiary_journey_events FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (recorded_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('participation.record'::text, beneficiary_journey_events.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_journey_event_select ON pathways.beneficiary_journey_events FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('journeys.read'::text, beneficiary_journey_events.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_mapping_delete ON pathways.activity_journey_stage_mappings FOR DELETE TO pathways_runtime USING (pathways.p05_has_project_permission('activities.update'::text, project_id));

CREATE POLICY p05_mapping_insert ON pathways.activity_journey_stage_mappings FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND (created_by_id = pathways.runtime_context_user()) AND (pathways.p05_has_project_permission('activities.create'::text, project_id) OR pathways.p05_has_project_permission('activities.update'::text, project_id))));

CREATE POLICY p05_mapping_select ON pathways.activity_journey_stage_mappings FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('journeys.read'::text, activity_journey_stage_mappings.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_mapping_update ON pathways.activity_journey_stage_mappings FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('journeys.manage'::text, activity_journey_stage_mappings.project_id) AS p05_has_project_permission))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p05_participation_enrollment_lock ON pathways.beneficiary_project_enrollments FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('participation.record'::text, beneficiary_project_enrollments.project_id) AS p05_has_project_permission))) WITH CHECK (false);

CREATE POLICY p05_participation_insert ON pathways.beneficiary_activity_participations FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (recorded_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('participation.record'::text, beneficiary_activity_participations.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_participation_select ON pathways.beneficiary_activity_participations FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('journeys.read'::text, beneficiary_activity_participations.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_stage_insert ON pathways.journey_stages FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (created_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p05_has_project_permission('journeys.manage'::text, journey_stages.project_id) AS p05_has_project_permission)));

CREATE POLICY p05_stage_select ON pathways.journey_stages FOR SELECT TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (( SELECT pathways.p05_has_project_permission('journeys.read'::text, journey_stages.project_id) AS p05_has_project_permission) OR ( SELECT pathways.p05_has_project_permission('participation.record'::text, journey_stages.project_id) AS p05_has_project_permission))));

CREATE POLICY p05_stage_update ON pathways.journey_stages FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND ( SELECT pathways.p05_has_project_permission('journeys.manage'::text, journey_stages.project_id) AS p05_has_project_permission))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p06_binding_insert ON pathways.project_indicator_bindings FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND (created_by_id = pathways.runtime_context_user()) AND pathways.p06_can('indicators.create'::text, project_id)));

CREATE POLICY p06_binding_owner_read ON pathways.project_indicator_bindings FOR SELECT TO prisma USING (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('monitoring.read'::text, project_id)));

CREATE POLICY p06_binding_select ON pathways.project_indicator_bindings FOR SELECT TO pathways_runtime USING (((organization_id = pathways.runtime_context_organization()) AND pathways.p06_can('monitoring.read'::text, project_id)));

CREATE POLICY p06_indicator_insert ON pathways.project_indicators FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND (created_by_id = pathways.runtime_context_user()) AND pathways.p06_can('indicators.create'::text, project_id)));

CREATE POLICY p06_indicator_select ON pathways.project_indicators FOR SELECT TO pathways_runtime USING (((organization_id = pathways.runtime_context_organization()) AND pathways.p06_can('monitoring.read'::text, project_id)));

CREATE POLICY p06_indicator_update ON pathways.project_indicators FOR UPDATE TO pathways_runtime USING (((organization_id = pathways.runtime_context_organization()) AND pathways.p06_can('indicators.update'::text, project_id))) WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND pathways.p06_can('indicators.update'::text, project_id)));

CREATE POLICY p06_measurement_insert ON pathways.project_indicator_measurements FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND (recorded_by_id = pathways.runtime_context_user()) AND pathways.p06_can('indicators.update'::text, project_id)));

CREATE POLICY p06_measurement_owner_read ON pathways.project_indicator_measurements FOR SELECT TO prisma USING (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('monitoring.read'::text, project_id)));

CREATE POLICY p06_measurement_select ON pathways.project_indicator_measurements FOR SELECT TO pathways_runtime USING (((organization_id = pathways.runtime_context_organization()) AND pathways.p06_can('monitoring.read'::text, project_id)));

CREATE POLICY p06_sensitive_release_owner_insert ON pathways.sensitive_aggregate_releases FOR INSERT TO prisma WITH CHECK (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('beneficiaries.aggregates.read'::text, project_id)));

CREATE POLICY p06_sensitive_release_owner_select ON pathways.sensitive_aggregate_releases FOR SELECT TO prisma USING (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('beneficiaries.aggregates.read'::text, project_id)));

CREATE POLICY p06_sensitive_release_owner_update ON pathways.sensitive_aggregate_releases FOR UPDATE TO prisma USING (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('beneficiaries.aggregates.read'::text, project_id))) WITH CHECK (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND pathways.p06_can('beneficiaries.aggregates.read'::text, project_id)));

CREATE POLICY p08_activity_indicator_delete ON pathways.activity_indicator_links FOR DELETE TO pathways_runtime USING (pathways.p06_can('indicators.update'::text, project_id));

CREATE POLICY p08_activity_indicator_insert ON pathways.activity_indicator_links FOR INSERT TO pathways_runtime WITH CHECK ((pathways.p06_can('indicators.update'::text, project_id) AND (organization_id = pathways.runtime_context_organization()) AND (created_by_id = pathways.runtime_context_user())));

CREATE POLICY p08_activity_indicator_select ON pathways.activity_indicator_links FOR SELECT TO pathways_runtime USING (pathways.p06_can('monitoring.read'::text, project_id));

CREATE POLICY p09_assignment_insert ON pathways.user_project_assignments AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND ((pathways.p09_can('assignments.manage'::text) AND (pathways.p05_has_project_permission('projects.read'::text, project_id) OR (pathways.p09_can('projects.create'::text) AND (EXISTS ( SELECT
   FROM pathways.projects p
  WHERE ((p.id = user_project_assignments.project_id) AND (p.created_by_id = pathways.runtime_context_user()) AND (p.created_at = (transaction_timestamp())::timestamp(3) with time zone)))))) AND (EXISTS ( SELECT
   FROM pathways.system_users u
  WHERE ((u.id = user_project_assignments.user_id) AND (u.organization_id = user_project_assignments.organization_id) AND pathways.p1_can_manage_role(u.role_id))))) OR ((user_id = pathways.runtime_context_user()) AND pathways.p09_can('projects.create'::text) AND (EXISTS ( SELECT
   FROM pathways.projects p
  WHERE ((p.id = user_project_assignments.project_id) AND (p.created_by_id = pathways.runtime_context_user()) AND (p.created_at = (transaction_timestamp())::timestamp(3) with time zone))))))));

CREATE POLICY p09_assignment_update ON pathways.user_project_assignments AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p09_can('assignments.manage'::text) AND pathways.p05_has_project_permission('projects.read'::text, project_id) AND (EXISTS ( SELECT
   FROM pathways.system_users u
  WHERE ((u.id = user_project_assignments.user_id) AND (u.organization_id = user_project_assignments.organization_id) AND pathways.p1_can_manage_role(u.role_id)))))) WITH CHECK ((organization_id = pathways.runtime_context_organization()));

CREATE POLICY p09_delete ON pathways.form_fields AS RESTRICTIVE FOR DELETE TO pathways_runtime USING (pathways.p05_has_project_permission('forms.manage'::text, project_id));

CREATE POLICY p09_delete ON pathways.form_response_values AS RESTRICTIVE FOR DELETE TO pathways_runtime USING (pathways.p05_has_project_permission('submissions.write'::text, project_id));

CREATE POLICY p09_delete ON pathways.metadata_mappings AS RESTRICTIVE FOR DELETE TO pathways_runtime USING (pathways.p05_has_project_permission('imports.review'::text, project_id));

CREATE POLICY p09_expense_insert ON pathways.budget_expense_entries AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('expenses.submit'::text, project_id));

CREATE POLICY p09_expense_update ON pathways.budget_expense_entries AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('expenses.verify'::text, project_id) OR pathways.p05_has_project_permission('expenses.approve'::text, project_id))) WITH CHECK ((pathways.p05_has_project_permission('expenses.verify'::text, project_id) OR pathways.p05_has_project_permission('expenses.approve'::text, project_id)));

CREATE POLICY p09_insert ON pathways.alert_rule_conditions AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('rules.create'::text));

CREATE POLICY p09_insert ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('rules.create'::text));

CREATE POLICY p09_insert ON pathways.alert_rules AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('rules.create'::text));

CREATE POLICY p09_insert ON pathways.beneficiaries AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('beneficiaries.records.register'::text));

CREATE POLICY p09_insert ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('participation.record'::text, project_id));

CREATE POLICY p09_insert ON pathways.beneficiary_consent_records AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('beneficiaries.records.register'::text));

CREATE POLICY p09_insert ON pathways.beneficiary_identifiers AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('beneficiaries.records.register'::text));

CREATE POLICY p09_insert ON pathways.beneficiary_journey_events AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('participation.record'::text, project_id));

CREATE POLICY p09_insert ON pathways.data_import_batches AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('imports.upload'::text, project_id));

CREATE POLICY p09_insert ON pathways.data_import_rows AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('imports.upload'::text, project_id));

CREATE POLICY p09_insert ON pathways.decision_recommendations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (false);

CREATE POLICY p09_insert ON pathways.digital_forms AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('forms.manage'::text, project_id));

CREATE POLICY p09_insert ON pathways.form_fields AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('forms.manage'::text, project_id));

CREATE POLICY p09_insert ON pathways.form_response_values AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_insert ON pathways.form_submissions AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_insert ON pathways.metadata_mappings AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('imports.review'::text, project_id));

CREATE POLICY p09_insert ON pathways.programs AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('programs.create'::text));

CREATE POLICY p09_insert ON pathways.project_activities AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('activities.create'::text, project_id));

CREATE POLICY p09_insert ON pathways.project_budget_records AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('budgets.create'::text, project_id));

CREATE POLICY p09_insert ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('settings.configure'::text, project_id));

CREATE POLICY p09_insert ON pathways.project_evaluation_scores AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('evaluations.submit'::text, project_id));

CREATE POLICY p09_insert ON pathways.project_evaluations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('evaluations.submit'::text, project_id));

CREATE POLICY p09_insert ON pathways.project_milestones AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('milestones.manage'::text, project_id));

CREATE POLICY p09_insert ON pathways.reports AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p05_has_project_permission('reports.generate'::text, project_id));

CREATE POLICY p09_insert ON pathways.rule_based_alerts AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (false);

CREATE POLICY p09_project_insert ON pathways.projects AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = pathways.runtime_context_organization()) AND (created_by_id = pathways.runtime_context_user()) AND pathways.p09_can('projects.create'::text)));

CREATE POLICY p09_project_select ON pathways.projects AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('projects.read'::text, id) OR (pathways.p09_can('projects.create'::text) AND (created_by_id = pathways.runtime_context_user()) AND (created_at = (transaction_timestamp())::timestamp(3) with time zone))));

CREATE POLICY p09_project_update ON pathways.projects AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('projects.update'::text, id) OR pathways.p05_has_project_permission('projects.archive'::text, id))) WITH CHECK ((organization_id = pathways.runtime_context_organization()));

CREATE POLICY p09_scoped_select ON pathways.budget_expense_entries AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('expenses.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.data_import_batches AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.data_import_rows AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.digital_forms AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('forms.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.form_fields AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('forms.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.metadata_mappings AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.project_budget_records AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('budgets.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('evaluations.submit'::text, project_id) OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id) OR pathways.p05_has_project_permission('evaluations.signoff'::text, project_id) OR pathways.p05_has_project_permission('monitoring.read'::text, project_id)));

CREATE POLICY p09_scoped_select ON pathways.project_evaluation_scores AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('evaluations.submit'::text, project_id) OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id) OR pathways.p05_has_project_permission('evaluations.signoff'::text, project_id) OR pathways.p05_has_project_permission('monitoring.read'::text, project_id)));

CREATE POLICY p09_scoped_select ON pathways.project_evaluations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('evaluations.submit'::text, project_id) OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id) OR pathways.p05_has_project_permission('evaluations.signoff'::text, project_id) OR pathways.p05_has_project_permission('monitoring.read'::text, project_id)));

CREATE POLICY p09_scoped_select ON pathways.project_indicator_bindings AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('indicators.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.project_indicator_measurements AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('indicators.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.project_indicators AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('indicators.read'::text, project_id));

CREATE POLICY p09_scoped_select ON pathways.project_milestones AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('activities.read'::text, project_id) OR pathways.p05_has_project_permission('monitoring.read'::text, project_id) OR pathways.p05_has_project_permission('reports.read'::text, project_id)));

CREATE POLICY p09_select ON pathways.alert_rule_conditions AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p09_can('rules.read'::text) OR (EXISTS ( SELECT
   FROM pathways.rule_based_alerts a
  WHERE ((a.rule_id = alert_rule_conditions.rule_id) AND pathways.p05_has_project_permission('alerts.read'::text, a.project_id))))));

CREATE POLICY p09_select ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p09_can('rules.read'::text) OR (EXISTS ( SELECT
   FROM pathways.rule_based_alerts a
  WHERE ((a.rule_id = alert_rule_recommendations.rule_id) AND pathways.p05_has_project_permission('alerts.read'::text, a.project_id))))));

CREATE POLICY p09_select ON pathways.alert_rules AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p09_can('rules.read'::text));

CREATE POLICY p09_select ON pathways.assessment_results AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('assessments.detail.read'::text, project_id));

CREATE POLICY p09_select ON pathways.audit_logs AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p09_can('audit.read'::text) OR ((actor_user_id = pathways.runtime_context_user()) AND (occurred_at = (transaction_timestamp())::timestamp(3) with time zone))));

CREATE POLICY p09_select ON pathways.beneficiaries AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p09_can('beneficiaries.records.read'::text));

CREATE POLICY p09_select ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('journeys.read'::text, project_id));

CREATE POLICY p09_select ON pathways.beneficiary_consent_records AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p09_can('beneficiaries.records.read'::text));

CREATE POLICY p09_select ON pathways.beneficiary_identifiers AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p09_can('beneficiaries.records.read'::text));

CREATE POLICY p09_select ON pathways.beneficiary_journey_events AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('journeys.read'::text, project_id));

CREATE POLICY p09_select ON pathways.beneficiary_project_enrollments AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('beneficiaries.records.read'::text, project_id));

CREATE POLICY p09_select ON pathways.decision_recommendations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('recommendations.read'::text, project_id));

CREATE POLICY p09_select ON pathways.form_response_values AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id) OR pathways.p05_has_project_permission('assessments.detail.read'::text, project_id)));

CREATE POLICY p09_select ON pathways.form_submissions AS RESTRICTIVE FOR SELECT TO pathways_runtime USING ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id) OR pathways.p05_has_project_permission('assessments.detail.read'::text, project_id)));

CREATE POLICY p09_select ON pathways.reports AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('reports.read'::text, project_id));

CREATE POLICY p09_select ON pathways.rule_based_alerts AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('alerts.read'::text, project_id));

CREATE POLICY p09_update ON pathways.alert_rule_conditions AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p09_can('rules.update'::text)) WITH CHECK (pathways.p09_can('rules.update'::text));

CREATE POLICY p09_update ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p09_can('rules.update'::text)) WITH CHECK (pathways.p09_can('rules.update'::text));

CREATE POLICY p09_update ON pathways.alert_rules AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p09_can('rules.update'::text)) WITH CHECK (pathways.p09_can('rules.update'::text));

CREATE POLICY p09_update ON pathways.beneficiaries AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p09_can('beneficiaries.profiles.update'::text) OR pathways.p09_can('beneficiaries.records.archive'::text))) WITH CHECK ((pathways.p09_can('beneficiaries.profiles.update'::text) OR pathways.p09_can('beneficiaries.records.archive'::text)));

CREATE POLICY p09_update ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('participation.record'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('participation.record'::text, project_id));

CREATE POLICY p09_update ON pathways.data_import_batches AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('imports.upload'::text, project_id) OR pathways.p05_has_project_permission('imports.validate'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id))) WITH CHECK ((pathways.p05_has_project_permission('imports.upload'::text, project_id) OR pathways.p05_has_project_permission('imports.validate'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_update ON pathways.data_import_rows AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('imports.validate'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id))) WITH CHECK ((pathways.p05_has_project_permission('imports.validate'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_update ON pathways.decision_recommendations AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('recommendations.review'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('recommendations.review'::text, project_id));

CREATE POLICY p09_update ON pathways.digital_forms AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('forms.manage'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('forms.manage'::text, project_id));

CREATE POLICY p09_update ON pathways.form_fields AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('forms.manage'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('forms.manage'::text, project_id));

CREATE POLICY p09_update ON pathways.form_response_values AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id))) WITH CHECK ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_update ON pathways.form_submissions AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id))) WITH CHECK ((pathways.p05_has_project_permission('submissions.write'::text, project_id) OR pathways.p05_has_project_permission('imports.process'::text, project_id)));

CREATE POLICY p09_update ON pathways.metadata_mappings AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('imports.review'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('imports.review'::text, project_id));

CREATE POLICY p09_update ON pathways.programs AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p09_can('programs.create'::text)) WITH CHECK (pathways.p09_can('programs.create'::text));

CREATE POLICY p09_update ON pathways.project_budget_records AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('budgets.update'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('budgets.update'::text, project_id));

CREATE POLICY p09_update ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('settings.configure'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('settings.configure'::text, project_id));

CREATE POLICY p09_update ON pathways.project_evaluation_scores AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('evaluations.submit'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('evaluations.submit'::text, project_id));

CREATE POLICY p09_update ON pathways.project_evaluations AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING ((pathways.p05_has_project_permission('evaluations.submit'::text, project_id) OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id) OR pathways.p05_has_project_permission('evaluations.signoff'::text, project_id) OR pathways.p05_has_project_permission('evaluations.archive'::text, project_id))) WITH CHECK (pathways.p05_has_project_permission(
CASE status
    WHEN 'REVIEWED'::pathways.evaluation_status THEN 'evaluations.approve'::text
    WHEN 'SIGNED_OFF'::pathways.evaluation_status THEN 'evaluations.signoff'::text
    WHEN 'ARCHIVED'::pathways.evaluation_status THEN 'evaluations.archive'::text
    ELSE 'evaluations.submit'::text
END, project_id));

CREATE POLICY p09_update ON pathways.project_milestones AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('milestones.manage'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('milestones.manage'::text, project_id));

CREATE POLICY p09_update ON pathways.reports AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p05_has_project_permission('reports.generate'::text, project_id)) WITH CHECK (pathways.p05_has_project_permission('reports.generate'::text, project_id));

CREATE POLICY p09_user_insert ON pathways.system_users AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (pathways.p09_can('users.authorize'::text));

CREATE POLICY p09_user_update ON pathways.system_users AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING (pathways.p09_can('users.authorize'::text)) WITH CHECK (pathways.p09_can('users.authorize'::text));

CREATE POLICY p1_runtime_insert ON pathways.system_users FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (account_status = 'ACTIVE'::pathways.account_status) AND (archived_at IS NULL) AND (auth_user_id IS NOT NULL) AND ( SELECT pathways.p1_can_manage_role(system_users.role_id) AS p1_can_manage_role)));

CREATE POLICY p1_runtime_update ON pathways.system_users FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (id <> ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p1_can_manage_role(system_users.role_id) AS p1_can_manage_role))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (id <> ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND ( SELECT pathways.p1_can_manage_role(system_users.role_id) AS p1_can_manage_role)));

CREATE POLICY p2_runtime_delete ON pathways.form_fields FOR DELETE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (EXISTS ( SELECT
   FROM pathways.digital_forms f
  WHERE ((f.organization_id = form_fields.organization_id) AND (f.project_id = form_fields.project_id) AND (f.id = form_fields.form_id) AND (f.status = 'DRAFT'::pathways.form_status))))));

CREATE POLICY p2_runtime_delete ON pathways.form_response_values FOR DELETE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (EXISTS ( SELECT
   FROM pathways.form_submissions s
  WHERE ((s.organization_id = form_response_values.organization_id) AND (s.id = form_response_values.submission_id) AND (s.submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (s.source = 'DIRECT_ENCODING'::pathways.submission_source) AND (s.status = 'DRAFT'::pathways.submission_status))))));

CREATE POLICY p2_runtime_update ON pathways.form_response_values FOR UPDATE TO pathways_runtime USING (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (EXISTS ( SELECT
   FROM pathways.form_submissions s
  WHERE ((s.organization_id = form_response_values.organization_id) AND (s.id = form_response_values.submission_id) AND (s.submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (s.source = 'DIRECT_ENCODING'::pathways.submission_source) AND (s.status = 'DRAFT'::pathways.submission_status)))))) WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (EXISTS ( SELECT
   FROM pathways.form_submissions s
  WHERE ((s.organization_id = form_response_values.organization_id) AND (s.project_id = form_response_values.project_id) AND (s.form_id = form_response_values.form_id) AND (s.id = form_response_values.submission_id) AND (s.submitted_by_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user)) AND (s.source = 'DIRECT_ENCODING'::pathways.submission_source) AND (s.status = 'DRAFT'::pathways.submission_status))))));

CREATE POLICY p4_runtime_insert ON pathways.alert_rule_conditions FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.alert_rule_recommendations FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.alert_rules FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.assessment_results FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.audit_logs FOR INSERT TO pathways_runtime WITH CHECK (((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)) AND (actor_user_id = ( SELECT pathways.runtime_context_user() AS runtime_context_user))));

CREATE POLICY p4_runtime_insert ON pathways.budget_expense_entries FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.data_import_rows FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.decision_recommendations FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.digital_forms FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.evidence_media FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.form_fields FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.metadata_mappings FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.programs FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_activity_assignments FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_budget_records FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_evaluation_criteria FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_evaluation_scores FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_evaluations FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.project_milestones FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.projects FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.reports FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.rule_based_alerts FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_insert ON pathways.user_project_assignments FOR INSERT TO pathways_runtime WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_lock ON pathways.rule_based_alerts FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK (false);

CREATE POLICY p4_runtime_select ON pathways.alert_rule_conditions FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.alert_rule_recommendations FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.alert_rules FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.assessment_results FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.audit_logs FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.budget_expense_entries FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.data_import_batches FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.data_import_rows FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.decision_recommendations FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.digital_forms FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.evidence_media FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.form_fields FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.form_response_values FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.form_submissions FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.metadata_mappings FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.organizations FOR SELECT TO pathways_runtime USING ((id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.permissions FOR SELECT TO pathways_runtime USING ((( SELECT pathways.runtime_context_organization() AS runtime_context_organization) IS NOT NULL));

CREATE POLICY p4_runtime_select ON pathways.programs FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_activity_assignments FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_budget_records FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_evaluation_criteria FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_evaluation_scores FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_evaluations FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.project_milestones FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.projects FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.reports FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.role_permissions FOR SELECT TO pathways_runtime USING ((( SELECT pathways.runtime_context_organization() AS runtime_context_organization) IS NOT NULL));

CREATE POLICY p4_runtime_select ON pathways.roles FOR SELECT TO pathways_runtime USING ((( SELECT pathways.runtime_context_organization() AS runtime_context_organization) IS NOT NULL));

CREATE POLICY p4_runtime_select ON pathways.rule_based_alerts FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.system_users FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_select ON pathways.user_project_assignments FOR SELECT TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.alert_rule_conditions FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.alert_rule_recommendations FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.alert_rules FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.budget_expense_entries FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.data_import_rows FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.decision_recommendations FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.digital_forms FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.evidence_media FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.form_fields FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.metadata_mappings FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.programs FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_activity_assignments FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_budget_records FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_evaluation_criteria FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_evaluation_scores FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_evaluations FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.project_milestones FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.projects FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.reports FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

CREATE POLICY p4_runtime_update ON pathways.user_project_assignments FOR UPDATE TO pathways_runtime USING ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization))) WITH CHECK ((organization_id = ( SELECT pathways.runtime_context_organization() AS runtime_context_organization)));

ALTER TABLE pathways.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.programs ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_activity_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_budget_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_evaluation_criteria ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_evaluation_scores ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_evaluations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicator_bindings ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicator_measurements ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicators ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_milestones ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.rule_based_alerts ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.sensitive_aggregate_releases ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.system_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.user_project_assignments ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA pathways TO pathways_runtime;

GRANT ALL ON SCHEMA public TO prisma;

REVOKE ALL ON TYPE pathways.account_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.account_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.activity_assignment_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.activity_assignment_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.activity_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.activity_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.alert_rule_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.alert_rule_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.alert_severity FROM PUBLIC;
GRANT ALL ON TYPE pathways.alert_severity TO pathways_runtime;

REVOKE ALL ON TYPE pathways.assessment_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.assessment_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.assignment_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.assignment_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.attendance_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.attendance_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.beneficiary_consent_kind FROM PUBLIC;
GRANT ALL ON TYPE pathways.beneficiary_consent_kind TO pathways_runtime;

REVOKE ALL ON TYPE pathways.beneficiary_record_source FROM PUBLIC;
GRANT ALL ON TYPE pathways.beneficiary_record_source TO pathways_runtime;

REVOKE ALL ON TYPE pathways.beneficiary_sex FROM PUBLIC;
GRANT ALL ON TYPE pathways.beneficiary_sex TO pathways_runtime;

REVOKE ALL ON TYPE pathways.beneficiary_subject_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.beneficiary_subject_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.criterion_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.criterion_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.decision_outcome FROM PUBLIC;
GRANT ALL ON TYPE pathways.decision_outcome TO pathways_runtime;

REVOKE ALL ON TYPE pathways.decision_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.decision_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.definition_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.definition_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.disability_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.disability_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.enrollment_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.enrollment_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.evaluation_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.evaluation_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.evidence_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.evidence_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.field_data_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.field_data_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.form_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.form_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.form_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.form_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.import_file_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.import_file_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.import_row_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.import_row_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.import_source FROM PUBLIC;
GRANT ALL ON TYPE pathways.import_source TO pathways_runtime;

REVOKE ALL ON TYPE pathways.import_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.import_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.import_storage_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.import_storage_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.indicator_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.indicator_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.indicator_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.indicator_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.indicator_unit FROM PUBLIC;
GRANT ALL ON TYPE pathways.indicator_unit TO pathways_runtime;

REVOKE ALL ON TYPE pathways.journey_event_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.journey_event_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.journey_stage_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.journey_stage_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.mapping_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.mapping_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.milestone_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.milestone_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.organization_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.organization_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.profile_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.profile_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.program_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.program_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.progress_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.progress_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.project_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.project_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.public_visibility_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.public_visibility_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.recommendation_basis FROM PUBLIC;
GRANT ALL ON TYPE pathways.recommendation_basis TO pathways_runtime;

REVOKE ALL ON TYPE pathways.recommendation_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.recommendation_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.report_format FROM PUBLIC;
GRANT ALL ON TYPE pathways.report_format TO pathways_runtime;

REVOKE ALL ON TYPE pathways.report_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.report_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.report_type FROM PUBLIC;
GRANT ALL ON TYPE pathways.report_type TO pathways_runtime;

REVOKE ALL ON TYPE pathways.review_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.review_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.rule_match_mode FROM PUBLIC;
GRANT ALL ON TYPE pathways.rule_match_mode TO pathways_runtime;

REVOKE ALL ON TYPE pathways.rule_metric FROM PUBLIC;
GRANT ALL ON TYPE pathways.rule_metric TO pathways_runtime;

REVOKE ALL ON TYPE pathways.rule_operator FROM PUBLIC;
GRANT ALL ON TYPE pathways.rule_operator TO pathways_runtime;

REVOKE ALL ON TYPE pathways.rule_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.rule_status TO pathways_runtime;

REVOKE ALL ON TYPE pathways.submission_source FROM PUBLIC;
GRANT ALL ON TYPE pathways.submission_source TO pathways_runtime;

REVOKE ALL ON TYPE pathways.submission_status FROM PUBLIC;
GRANT ALL ON TYPE pathways.submission_status TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p02_guard_direct_submission() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p03_assert_processed_row() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p03_guard_import_batch() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p03_guard_import_row() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p03_guard_mapping() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p03_guard_submission() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p04_can_insert_enrollment(requested_project uuid, requested_beneficiary uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p04_can_insert_enrollment(requested_project uuid, requested_beneficiary uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p04_can_mutate_beneficiary(requested_permission text, requested_beneficiary uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p04_can_mutate_beneficiary(requested_permission text, requested_beneficiary uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p04_can_read_beneficiary(requested_beneficiary uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p04_can_read_beneficiary(requested_beneficiary uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p04_guard_beneficiary() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p04_guard_consent() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p04_guard_identifier() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p04_has_project_permission(requested_permission text, requested_project uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p04_has_project_permission(requested_permission text, requested_project uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p05_guard_activity_update() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p05_guard_mapping_freeze() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p05_guard_stage_freeze() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p05_has_project_permission(requested_permission text, requested_project uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p05_has_project_permission(requested_permission text, requested_project uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p05_snapshot_journey_event() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_age_band(born_on date, reference_on date) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_assert_scope(wanted_org uuid, wanted_projects uuid[], permission text, start_on date, end_on date, zone text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_can(requested_permission text, requested_project uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_can(requested_permission text, requested_project uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p06_cell(v numeric, reason text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_check_binding_authority() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_compute_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_compute_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_count_cell(v bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_guard_binding() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_guard_indicator() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_guard_measurement() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p06_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p06_missing_saddd(reason text) FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p06_numeric_valid(v numeric, kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_numeric_valid(v numeric, kind text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p06_saddd(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p08_guard_activity_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p08_guard_activity_profile() TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p08_guard_project_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p08_guard_project_profile() TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p08_reject_activity_indicator_link_update() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p08_reject_activity_indicator_link_update() TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p09_can(wanted_permission text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p09_can(wanted_permission text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p09_enroll(wanted_project uuid, wanted_beneficiary uuid, enrolled_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p09_enroll(wanted_project uuid, wanted_beneficiary uuid, enrolled_on date) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p09_guard_activity() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p09_guard_archive() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p09_guard_expense_review() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p09_guard_project() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p09_role_allows(role_code text, wanted_permission text) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p09_role_allows(role_code text, wanted_permission text) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p09_stamp_supporting_insert() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p1_can_manage_role(target_role_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p1_can_manage_role(target_role_id uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p1_workspace_for_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p1_workspace_for_auth() TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p2_assert_batch() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_assert_processed_row() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_assert_submission() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_activity_assignment() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_activity_lifecycle() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_batch() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_enrollment_dates() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_form() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_form_field() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_identity() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_import_row() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_journey_history() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_mapping() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_participation_dates() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_profile_assignments() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_project_assignment() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_public_content() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_response() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_stage_order() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_guard_submission() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p2_valid_options(options jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p2_valid_options(options jsonb) TO pathways_runtime;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE pathways.form_fields TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p3_budget_totals(budget_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p3_budget_totals(budget_id uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p3_guard_actors() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_alert() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_budget() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_criterion() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_decision() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_evaluation() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_identity() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_public_evidence() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_report() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_review() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_rule() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_rule_child() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_score() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_guard_source() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.p3_reject_delete() FROM PUBLIC;

REVOKE ALL ON FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid) TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.runtime_context_organization() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.runtime_context_organization() TO pathways_runtime;

REVOKE ALL ON FUNCTION pathways.runtime_context_user() FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.runtime_context_user() TO pathways_runtime;

GRANT SELECT,INSERT,DELETE ON TABLE pathways.activity_indicator_links TO pathways_runtime;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE pathways.activity_journey_stage_mappings TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT UPDATE(status) ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT UPDATE(reviewed_by_id) ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT UPDATE(reviewed_at) ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT UPDATE(review_reason) ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT UPDATE(updated_at) ON TABLE pathways.activity_updates TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.alert_rule_conditions TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.alert_rule_recommendations TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.alert_rules TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.assessment_results TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.audit_logs TO pathways_runtime;

GRANT SELECT ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(id) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(organization_id) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(code) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(first_name),UPDATE(first_name) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(middle_name),UPDATE(middle_name) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(last_name),UPDATE(last_name) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(sex),UPDATE(sex) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(birth_date),UPDATE(birth_date) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(age_at_registration),UPDATE(age_at_registration) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(disability_status),UPDATE(disability_status) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(location_barangay),UPDATE(location_barangay) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(location_city_municipality),UPDATE(location_city_municipality) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(location_province),UPDATE(location_province) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(status),UPDATE(status) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(consent_recorded) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(is_minor) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(guardian_consent_recorded) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(is_dummy_record) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(created_by_id) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(archived_at),UPDATE(archived_at) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(created_at) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(updated_at),UPDATE(updated_at) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(subject_type),UPDATE(subject_type) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(display_name),UPDATE(display_name) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT INSERT(data_processing_consent_recorded) ON TABLE pathways.beneficiaries TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.beneficiary_activity_participations TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.beneficiary_consent_records TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.beneficiary_identifiers TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.beneficiary_journey_events TO pathways_runtime;

GRANT SELECT ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(id),UPDATE(id) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(organization_id) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(project_id) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(beneficiary_id) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(enrollment_date) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(status),UPDATE(status) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT UPDATE(ended_date) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT UPDATE(end_reason) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT UPDATE(remarks) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(recorded_by_id) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(created_at) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT INSERT(updated_at),UPDATE(updated_at) ON TABLE pathways.beneficiary_project_enrollments TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.budget_expense_entries TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.data_import_batches TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.data_import_rows TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.decision_recommendations TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.digital_forms TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.evidence_media TO pathways_runtime;

GRANT UPDATE(updated_at) ON TABLE pathways.evidence_media TO pathways_runtime;

GRANT UPDATE(storage_ready) ON TABLE pathways.evidence_media TO pathways_runtime;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE pathways.form_response_values TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.form_submissions TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.journey_stages TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.metadata_mappings TO pathways_runtime;

GRANT SELECT ON TABLE pathways.organizations TO pathways_runtime;

GRANT SELECT ON TABLE pathways.permissions TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.programs TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_activities TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_activity_assignments TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_budget_records TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_evaluation_criteria TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_evaluation_scores TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_evaluations TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.project_indicator_bindings TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.project_indicator_measurements TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_indicators TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.project_milestones TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.projects TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.reports TO pathways_runtime;

GRANT SELECT ON TABLE pathways.role_permissions TO pathways_runtime;

GRANT SELECT ON TABLE pathways.roles TO pathways_runtime;

GRANT SELECT,INSERT ON TABLE pathways.rule_based_alerts TO pathways_runtime;

GRANT UPDATE(id) ON TABLE pathways.rule_based_alerts TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.system_users TO pathways_runtime;

GRANT UPDATE(id) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(organization_id) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(role_id),UPDATE(role_id) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(auth_user_id) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(full_name),UPDATE(full_name) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(email) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(position_title),UPDATE(position_title) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(contact_number),UPDATE(contact_number) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(account_status),UPDATE(account_status) ON TABLE pathways.system_users TO pathways_runtime;

GRANT INSERT(activated_at),UPDATE(activated_at) ON TABLE pathways.system_users TO pathways_runtime;

GRANT UPDATE(suspended_at) ON TABLE pathways.system_users TO pathways_runtime;

GRANT UPDATE(deactivated_at) ON TABLE pathways.system_users TO pathways_runtime;

GRANT UPDATE(archived_at) ON TABLE pathways.system_users TO pathways_runtime;

GRANT UPDATE(updated_at) ON TABLE pathways.system_users TO pathways_runtime;

GRANT SELECT,INSERT,UPDATE ON TABLE pathways.user_project_assignments TO pathways_runtime;


-- Canonical authorization reference data only; no domain/provider records.
INSERT INTO pathways.roles(code,name) VALUES
('SYSTEM_ADMINISTRATOR','System Administrator'),
('PROJECT_OFFICER','Project Officer'),
('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
('PROJECT_MANAGER','Project Manager'),
('PROGRAM_MANAGER','Program Manager'),
('GRANT_MANAGER','Grant Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.permissions(code,name) VALUES
('forms.archive','forms.archive'),
('indicators.archive','indicators.archive'),
('milestones.manage','milestones.manage'),
('assessments.detail.read','assessments.detail.read'),
('projects.read','projects.read'),
('projects.create','projects.create'),
('activities.read','activities.read'),
('activities.create','activities.create'),
('activities.update','activities.update'),
('activities.proof.submit','activities.proof.submit'),
('journeys.read','journeys.read'),
('journeys.manage','journeys.manage'),
('participation.record','participation.record'),
('budgets.read','budgets.read'),
('budgets.create','budgets.create'),
('budgets.update','budgets.update'),
('expenses.read','expenses.read'),
('expenses.submit','expenses.submit'),
('expenses.verify','expenses.verify'),
('expenses.approve','expenses.approve'),
('monitoring.read','monitoring.read'),
('monitoring.review','monitoring.review'),
('rules.read','rules.read'),
('rules.create','rules.create'),
('rules.update','rules.update'),
('rules.activate','rules.activate'),
('alerts.read','alerts.read'),
('alerts.review','alerts.review'),
('alerts.outcome.record','alerts.outcome.record'),
('recommendations.read','recommendations.read'),
('recommendations.review','recommendations.review'),
('beneficiaries.records.read','beneficiaries.records.read'),
('beneficiaries.records.register','beneficiaries.records.register'),
('beneficiaries.profiles.update','beneficiaries.profiles.update'),
('beneficiaries.enrollments.manage','beneficiaries.enrollments.manage'),
('beneficiaries.identities.review','beneficiaries.identities.review'),
('beneficiaries.records.archive','beneficiaries.records.archive'),
('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),
('recommendations.outcome.record','recommendations.outcome.record'),
('evaluations.submit','evaluations.submit'),
('evaluations.approve','evaluations.approve'),
('public.preview','public.preview'),
('public.publish','public.publish'),
('evidence.review','evidence.review'),
('indicators.create','indicators.create'),
('indicators.update','indicators.update'),
('collection.read','collection.read'),
('forms.read','forms.read'),
('forms.manage','forms.manage'),
('forms.publish','forms.publish'),
('submissions.write','submissions.write'),
('imports.read','imports.read'),
('imports.upload','imports.upload'),
('imports.review','imports.review'),
('imports.process','imports.process'),
('analytics.read','analytics.read'),
('reports.read','reports.read'),
('reports.project.read','reports.project.read'),
('reports.indicator.read','reports.indicator.read'),
('reports.beneficiary.read','reports.beneficiary.read'),
('users.authorize','users.authorize'),
('assignments.manage','assignments.manage'),
('settings.read','settings.read'),
('projects.detail.read','projects.detail.read'),
('projects.update','projects.update'),
('projects.archive','projects.archive'),
('activities.complete','activities.complete'),
('expenses.evidence.submit','expenses.evidence.submit'),
('indicators.read','indicators.read'),
('evaluations.archive','evaluations.archive'),
('evaluations.signoff','evaluations.signoff'),
('assessments.read','assessments.read'),
('public.approve','public.approve'),
('forms.generate','forms.generate'),
('forms.export','forms.export'),
('forms.import','forms.import'),
('imports.validate','imports.validate'),
('analytics.export','analytics.export'),
('reports.generate','reports.generate'),
('reports.export','reports.export'),
('audit.read','audit.read'),
('settings.configure','settings.configure'),
('backups.create','backups.create'),
('backups.restore','backups.restore'),
('profile.manage','profile.manage'),
('expenses.signoff','expenses.signoff'),
('programs.create','programs.create'),
('settings.labels.manage','settings.labels.manage')
ON CONFLICT(code) DO NOTHING;
DO $definitions$
BEGIN
 -- Historical migrations use both human labels and code-shaped names.
 -- Normalize reference labels explicitly below, preserving IDs and history.
 IF EXISTS(SELECT FROM pathways.roles WHERE NOT is_active) OR EXISTS(SELECT FROM pathways.permissions WHERE NOT is_active) THEN
   RAISE EXCEPTION '0026 inactive reference definitions require separate review';
 END IF;
END $definitions$;
UPDATE pathways.permissions SET name=code WHERE name IS DISTINCT FROM code;
UPDATE pathways.roles r SET name=canonical.name FROM (VALUES
 ('SYSTEM_ADMINISTRATOR','System Administrator'),
 ('PROGRAM_MANAGER','Program Manager'),
 ('GRANT_MANAGER','Grant Manager'),
 ('PROJECT_MANAGER','Project Manager'),
 ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
 ('PROJECT_OFFICER','Project Officer')
) canonical(code,name) WHERE r.code=canonical.code AND r.name IS DISTINCT FROM canonical.name;
CREATE TEMP TABLE rbac_expected(role_code text, permission_code text, PRIMARY KEY(role_code,permission_code)) ON COMMIT DROP;
INSERT INTO rbac_expected VALUES
('SYSTEM_ADMINISTRATOR','assessments.detail.read'),
('PROJECT_OFFICER','assessments.detail.read'),
('PROJECT_MANAGER','assessments.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.detail.read'),
('SYSTEM_ADMINISTRATOR','projects.read'),
('PROJECT_OFFICER','projects.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.read'),
('PROJECT_MANAGER','projects.read'),
('PROGRAM_MANAGER','projects.read'),
('GRANT_MANAGER','projects.read'),
('PROJECT_MANAGER','projects.create'),
('SYSTEM_ADMINISTRATOR','activities.read'),
('PROJECT_OFFICER','activities.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.read'),
('PROJECT_MANAGER','activities.read'),
('PROJECT_MANAGER','activities.create'),
('PROJECT_OFFICER','activities.create'),
('PROJECT_MANAGER','activities.update'),
('PROJECT_OFFICER','activities.update'),
('PROJECT_MANAGER','activities.proof.submit'),
('PROJECT_OFFICER','activities.proof.submit'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.read'),
('PROJECT_MANAGER','journeys.read'),
('PROJECT_OFFICER','journeys.read'),
('MONITORING_AND_EVALUATION_OFFICER','participation.record'),
('PROJECT_MANAGER','participation.record'),
('PROJECT_OFFICER','participation.record'),
('GRANT_MANAGER','budgets.read'),
('MONITORING_AND_EVALUATION_OFFICER','budgets.read'),
('PROGRAM_MANAGER','budgets.read'),
('PROJECT_MANAGER','budgets.read'),
('SYSTEM_ADMINISTRATOR','budgets.read'),
('GRANT_MANAGER','budgets.create'),
('PROGRAM_MANAGER','budgets.create'),
('PROJECT_MANAGER','budgets.create'),
('GRANT_MANAGER','budgets.update'),
('PROGRAM_MANAGER','budgets.update'),
('PROJECT_MANAGER','budgets.update'),
('GRANT_MANAGER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.read'),
('PROGRAM_MANAGER','expenses.read'),
('PROJECT_MANAGER','expenses.read'),
('PROJECT_OFFICER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.submit'),
('PROJECT_MANAGER','expenses.submit'),
('PROJECT_OFFICER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.verify'),
('PROJECT_MANAGER','expenses.approve'),
('GRANT_MANAGER','monitoring.read'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.read'),
('PROGRAM_MANAGER','monitoring.read'),
('PROJECT_MANAGER','monitoring.read'),
('SYSTEM_ADMINISTRATOR','monitoring.read'),
('GRANT_MANAGER','monitoring.review'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.review'),
('PROGRAM_MANAGER','monitoring.review'),
('PROJECT_MANAGER','monitoring.review'),
('SYSTEM_ADMINISTRATOR','monitoring.review'),
('SYSTEM_ADMINISTRATOR','rules.read'),
('SYSTEM_ADMINISTRATOR','rules.create'),
('SYSTEM_ADMINISTRATOR','rules.update'),
('SYSTEM_ADMINISTRATOR','rules.activate'),
('GRANT_MANAGER','alerts.read'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.read'),
('PROGRAM_MANAGER','alerts.read'),
('PROJECT_MANAGER','alerts.read'),
('SYSTEM_ADMINISTRATOR','alerts.read'),
('GRANT_MANAGER','alerts.review'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.review'),
('PROGRAM_MANAGER','alerts.review'),
('PROJECT_MANAGER','alerts.review'),
('SYSTEM_ADMINISTRATOR','alerts.review'),
('GRANT_MANAGER','alerts.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.outcome.record'),
('PROGRAM_MANAGER','alerts.outcome.record'),
('PROJECT_MANAGER','alerts.outcome.record'),
('SYSTEM_ADMINISTRATOR','alerts.outcome.record'),
('GRANT_MANAGER','recommendations.read'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.read'),
('PROGRAM_MANAGER','recommendations.read'),
('PROJECT_MANAGER','recommendations.read'),
('SYSTEM_ADMINISTRATOR','recommendations.read'),
('GRANT_MANAGER','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.review'),
('PROGRAM_MANAGER','recommendations.review'),
('PROJECT_MANAGER','recommendations.review'),
('SYSTEM_ADMINISTRATOR','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.read'),
('PROJECT_MANAGER','beneficiaries.records.read'),
('PROJECT_OFFICER','beneficiaries.records.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.register'),
('PROJECT_MANAGER','beneficiaries.records.register'),
('PROJECT_OFFICER','beneficiaries.records.register'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.profiles.update'),
('PROJECT_MANAGER','beneficiaries.profiles.update'),
('PROJECT_OFFICER','beneficiaries.profiles.update'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.enrollments.manage'),
('PROJECT_OFFICER','beneficiaries.enrollments.manage'),
('SYSTEM_ADMINISTRATOR','beneficiaries.enrollments.manage'),
('GRANT_MANAGER','beneficiaries.aggregates.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.aggregates.read'),
('PROGRAM_MANAGER','beneficiaries.aggregates.read'),
('PROJECT_MANAGER','beneficiaries.aggregates.read'),
('SYSTEM_ADMINISTRATOR','beneficiaries.aggregates.read'),
('GRANT_MANAGER','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.outcome.record'),
('PROGRAM_MANAGER','recommendations.outcome.record'),
('PROJECT_MANAGER','recommendations.outcome.record'),
('SYSTEM_ADMINISTRATOR','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.submit'),
('PROJECT_MANAGER','evaluations.approve'),
('GRANT_MANAGER','public.preview'),
('PROGRAM_MANAGER','public.preview'),
('PROJECT_MANAGER','public.preview'),
('SYSTEM_ADMINISTRATOR','public.preview'),
('GRANT_MANAGER','public.publish'),
('PROGRAM_MANAGER','public.publish'),
('PROJECT_MANAGER','public.publish'),
('SYSTEM_ADMINISTRATOR','public.publish'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.review'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.create'),
('PROJECT_MANAGER','indicators.create'),
('SYSTEM_ADMINISTRATOR','indicators.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.update'),
('PROJECT_MANAGER','indicators.update'),
('SYSTEM_ADMINISTRATOR','indicators.update'),
('SYSTEM_ADMINISTRATOR','collection.read'),
('PROJECT_OFFICER','collection.read'),
('MONITORING_AND_EVALUATION_OFFICER','collection.read'),
('PROGRAM_MANAGER','forms.read'),
('GRANT_MANAGER','forms.read'),
('SYSTEM_ADMINISTRATOR','forms.read'),
('PROJECT_OFFICER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.read'),
('PROJECT_MANAGER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','submissions.write'),
('PROJECT_OFFICER','submissions.write'),
('SYSTEM_ADMINISTRATOR','imports.read'),
('PROJECT_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.upload'),
('PROJECT_OFFICER','imports.upload'),
('SYSTEM_ADMINISTRATOR','imports.upload'),
('MONITORING_AND_EVALUATION_OFFICER','imports.review'),
('SYSTEM_ADMINISTRATOR','imports.review'),
('PROJECT_OFFICER','imports.process'),
('SYSTEM_ADMINISTRATOR','imports.process'),
('MONITORING_AND_EVALUATION_OFFICER','imports.process'),
('GRANT_MANAGER','analytics.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.read'),
('PROGRAM_MANAGER','analytics.read'),
('PROJECT_MANAGER','analytics.read'),
('SYSTEM_ADMINISTRATOR','analytics.read'),
('GRANT_MANAGER','reports.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.read'),
('PROGRAM_MANAGER','reports.read'),
('PROJECT_MANAGER','reports.read'),
('PROJECT_OFFICER','reports.read'),
('SYSTEM_ADMINISTRATOR','reports.read'),
('GRANT_MANAGER','reports.project.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.project.read'),
('PROGRAM_MANAGER','reports.project.read'),
('PROJECT_MANAGER','reports.project.read'),
('PROJECT_OFFICER','reports.project.read'),
('SYSTEM_ADMINISTRATOR','reports.project.read'),
('GRANT_MANAGER','reports.indicator.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.indicator.read'),
('PROGRAM_MANAGER','reports.indicator.read'),
('PROJECT_MANAGER','reports.indicator.read'),
('PROJECT_OFFICER','reports.indicator.read'),
('SYSTEM_ADMINISTRATOR','reports.indicator.read'),
('PROJECT_OFFICER','reports.beneficiary.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.beneficiary.read'),
('PROJECT_MANAGER','reports.beneficiary.read'),
('PROGRAM_MANAGER','users.authorize'),
('PROJECT_MANAGER','users.authorize'),
('SYSTEM_ADMINISTRATOR','users.authorize'),
('PROGRAM_MANAGER','assignments.manage'),
('PROJECT_MANAGER','assignments.manage'),
('SYSTEM_ADMINISTRATOR','assignments.manage'),
('SYSTEM_ADMINISTRATOR','settings.read'),
('PROJECT_OFFICER','settings.read'),
('MONITORING_AND_EVALUATION_OFFICER','settings.read'),
('PROJECT_MANAGER','settings.read'),
('PROGRAM_MANAGER','settings.read'),
('GRANT_MANAGER','settings.read'),
('GRANT_MANAGER','projects.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.detail.read'),
('PROGRAM_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.update'),
('GRANT_MANAGER','projects.archive'),
('PROGRAM_MANAGER','projects.archive'),
('PROJECT_MANAGER','projects.archive'),
('SYSTEM_ADMINISTRATOR','projects.archive'),
('MONITORING_AND_EVALUATION_OFFICER','activities.complete'),
('PROJECT_MANAGER','activities.complete'),
('PROJECT_OFFICER','activities.complete'),
('SYSTEM_ADMINISTRATOR','activities.complete'),
('PROJECT_OFFICER','expenses.evidence.submit'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.read'),
('PROJECT_MANAGER','indicators.read'),
('SYSTEM_ADMINISTRATOR','indicators.read'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.archive'),
('GRANT_MANAGER','evaluations.signoff'),
('PROGRAM_MANAGER','evaluations.signoff'),
('GRANT_MANAGER','assessments.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.read'),
('PROGRAM_MANAGER','assessments.read'),
('PROJECT_MANAGER','assessments.read'),
('PROJECT_OFFICER','assessments.read'),
('SYSTEM_ADMINISTRATOR','assessments.read'),
('GRANT_MANAGER','public.approve'),
('PROGRAM_MANAGER','public.approve'),
('PROJECT_MANAGER','public.approve'),
('SYSTEM_ADMINISTRATOR','public.approve'),
('GRANT_MANAGER','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.generate'),
('PROGRAM_MANAGER','forms.generate'),
('PROJECT_MANAGER','forms.generate'),
('PROJECT_OFFICER','forms.generate'),
('SYSTEM_ADMINISTRATOR','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.export'),
('PROJECT_OFFICER','forms.export'),
('MONITORING_AND_EVALUATION_OFFICER','forms.import'),
('PROJECT_OFFICER','forms.import'),
('MONITORING_AND_EVALUATION_OFFICER','imports.validate'),
('PROJECT_OFFICER','imports.validate'),
('SYSTEM_ADMINISTRATOR','imports.validate'),
('GRANT_MANAGER','analytics.export'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.export'),
('PROGRAM_MANAGER','analytics.export'),
('PROJECT_MANAGER','analytics.export'),
('SYSTEM_ADMINISTRATOR','analytics.export'),
('GRANT_MANAGER','reports.generate'),
('MONITORING_AND_EVALUATION_OFFICER','reports.generate'),
('PROGRAM_MANAGER','reports.generate'),
('PROJECT_MANAGER','reports.generate'),
('PROJECT_OFFICER','reports.generate'),
('SYSTEM_ADMINISTRATOR','reports.generate'),
('GRANT_MANAGER','reports.export'),
('MONITORING_AND_EVALUATION_OFFICER','reports.export'),
('PROGRAM_MANAGER','reports.export'),
('PROJECT_MANAGER','reports.export'),
('PROJECT_OFFICER','reports.export'),
('SYSTEM_ADMINISTRATOR','reports.export'),
('PROGRAM_MANAGER','audit.read'),
('PROJECT_MANAGER','audit.read'),
('SYSTEM_ADMINISTRATOR','audit.read'),
('SYSTEM_ADMINISTRATOR','settings.configure'),
('SYSTEM_ADMINISTRATOR','backups.create'),
('SYSTEM_ADMINISTRATOR','backups.restore'),
('GRANT_MANAGER','profile.manage'),
('MONITORING_AND_EVALUATION_OFFICER','profile.manage'),
('PROGRAM_MANAGER','profile.manage'),
('PROJECT_MANAGER','profile.manage'),
('PROJECT_OFFICER','profile.manage'),
('SYSTEM_ADMINISTRATOR','profile.manage'),
('PROGRAM_MANAGER','expenses.signoff'),
('GRANT_MANAGER','expenses.signoff');
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id
  AND NOT EXISTS(SELECT FROM rbac_expected e WHERE e.role_code=r.code AND e.permission_code=p.code);
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM rbac_expected e JOIN pathways.roles r ON r.code=e.role_code JOIN pathways.permissions p ON p.code=e.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;


COMMIT;
