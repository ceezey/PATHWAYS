-- cr-pathways-participant-file-import phase 1: the schema under the participant file import.
-- Minor status follows the current age: p04_guard_beneficiary and CHECK beneficiaries_minor_consent no longer lock is_minor
-- or tie it to guardian_consent_recorded (a minor needs guardian consent, an adult may carry it), and p04_guard_consent
-- compares minor status with age on the consent record's own date. beneficiary_consent_records gains optional guardian details
-- (name, consent date, note) allowed on GUARDIAN records only. The permission beneficiaries.guardian_consent.approve is granted
-- to Project Officer only. import_value_rejections remembers a file value a reviewer rejected, per participant and field.
-- data_import_rows gains resolution_data, resolved_by_id and resolved_at (set once while the row is held, then frozen), and
-- registration_outcome and matched_beneficiary_id (an unchanged participant needs no submission). p03_guard_import_row,
-- import_rows_state and p03_assert_processed_row change to match. Only prisma-owned objects are touched, so no preprovision
-- is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0079_import_date_order_and_sheet' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM pathways.permissions WHERE code='beneficiaries.guardian_consent.approve')
 OR pg_catalog.to_regclass('pathways.import_value_rejections') IS NOT NULL
 OR EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE NOT a.attisdropped AND (
   (a.attrelid='pathways.beneficiary_consent_records'::regclass AND a.attname IN('guardian_name','guardian_consent_date','guardian_note'))
   OR (a.attrelid='pathways.data_import_rows'::regclass AND a.attname IN('resolution_data','resolved_by_id','resolved_at','registration_outcome','matched_beneficiary_id'))))
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.beneficiaries'::regclass AND conname='beneficiaries_minor_consent' AND contype='c')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.data_import_rows'::regclass AND conname='import_rows_state' AND contype='c')
 THEN RAISE EXCEPTION '0080 requires the verified 0079 state and migration identity'; END IF;
 -- Each function being replaced still has its reviewed body and is owned by prisma.
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND (
   (p.oid=pg_catalog.to_regprocedure('pathways.p04_guard_beneficiary()') AND p.prosrc LIKE '%Guardian consent must match explicit minor status%')
   OR (p.oid=pg_catalog.to_regprocedure('pathways.p04_guard_consent()') AND p.prosrc LIKE '%Minor status must agree with age at enrollment%')
   OR (p.oid=pg_catalog.to_regprocedure('pathways.p03_guard_import_row()') AND p.prosrc LIKE '%Committed import row disposition is immutable%'
    AND p.prosrc NOT LIKE '%resolution_data%')
   OR (p.oid=pg_catalog.to_regprocedure('pathways.p03_assert_processed_row()') AND p.prosrc LIKE '%Processed row requires one normalized submission%'
    AND p.prosrc NOT LIKE '%registration_outcome%')
   OR (p.oid=pg_catalog.to_regprocedure('pathways.p09_role_allows(text,text)') AND p.prosrc LIKE '%assessments.record%'
    AND p.prosrc NOT LIKE '%guardian_consent%')))<>5
 THEN RAISE EXCEPTION '0080 requires the reviewed bodies and prisma ownership of the functions it replaces'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('beneficiaries','beneficiary_consent_records','data_import_rows','form_fields',
   'organizations','projects','system_users') AND pg_catalog.pg_get_userbyid(c.relowner)='prisma')<>7
 THEN RAISE EXCEPTION '0080 requires prisma ownership of the tables it alters or references'; END IF;
 IF pg_catalog.to_regprocedure('pathways.p09_role_allows_0048(text,text)') IS NULL
  OR pg_catalog.to_regprocedure('pathways.p04_can_read_beneficiary(uuid)') IS NULL
  OR pg_catalog.to_regprocedure('pathways.p09_can(text)') IS NULL
  OR NOT EXISTS(SELECT FROM pathways.roles WHERE code='PROJECT_OFFICER' AND is_active)
 THEN RAISE EXCEPTION '0080 requires the role ceiling chain, the beneficiary read helper and the Project Officer role'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,80);

-- Minor status follows the current age; profiles.update holders may now change it, so the runtime role gets column UPDATE.
-- A minor needs guardian consent and consent_recorded; an adult may carry guardian consent.
ALTER TABLE pathways.beneficiaries DROP CONSTRAINT beneficiaries_minor_consent,
  ADD CONSTRAINT beneficiaries_minor_consent CHECK ((NOT is_minor) OR (guardian_consent_recorded AND consent_recorded));
GRANT UPDATE(is_minor, guardian_consent_recorded) ON TABLE pathways.beneficiaries TO pathways_runtime;

-- The baseline body of p04_guard_beneficiary with is_minor and guardian_consent_recorded no longer immutable or equal;
-- a change to guardian_consent_recorded on UPDATE needs beneficiaries.guardian_consent.approve on every active enrollment project.
CREATE OR REPLACE FUNCTION pathways.p04_guard_beneficiary() RETURNS trigger
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
     OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Beneficiary identity and consent facts are immutable';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.guardian_consent_recorded IS DISTINCT FROM OLD.guardian_consent_recorded
       AND NOT pathways.p04_can_mutate_beneficiary('beneficiaries.guardian_consent.approve',OLD.id) THEN
      RAISE EXCEPTION 'Changing guardian consent requires guardian consent approval authority';
    END IF;
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
  IF NEW.is_minor AND NOT NEW.guardian_consent_recorded THEN
    RAISE EXCEPTION 'A minor profile requires guardian consent';
  END IF;
  RETURN NEW;
END
$_$;

-- Guardian details are optional, 1-160 / 1-500 visible characters, and only on GUARDIAN records.
ALTER TABLE pathways.beneficiary_consent_records
  ADD COLUMN guardian_name text,
  ADD COLUMN guardian_consent_date date,
  ADD COLUMN guardian_note text,
  ADD CONSTRAINT beneficiary_consent_records_guardian_name_shape CHECK(guardian_name IS NULL OR (
    char_length(guardian_name) BETWEEN 1 AND 160 AND guardian_name ~ '[^[:space:]]')),
  ADD CONSTRAINT beneficiary_consent_records_guardian_note_shape CHECK(guardian_note IS NULL OR (
    char_length(guardian_note) BETWEEN 1 AND 500 AND guardian_note ~ '[^[:space:]]')),
  ADD CONSTRAINT beneficiary_consent_records_guardian_details CHECK(kind='GUARDIAN' OR (
    guardian_name IS NULL AND guardian_consent_date IS NULL AND guardian_note IS NULL));

-- The baseline body of p04_guard_consent with the age agreement taken on the record's own Manila date.
CREATE OR REPLACE FUNCTION pathways.p04_guard_consent() RETURNS trigger
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
       EXTRACT(year FROM age((NEW.recorded_at AT TIME ZONE 'Asia/Manila')::date,profile.birth_date))::integer,
       profile.age_at_registration
     ) < 18) THEN
    RAISE EXCEPTION 'Minor status must agree with age on the consent date';
  END IF;
  RETURN NEW;
END
$$;

-- Guardian approval: Project Officer only. The ceiling is the 0071 definition with the new pair added.
INSERT INTO pathways.permissions(code,name) VALUES ('beneficiaries.guardian_consent.approve','beneficiaries.guardian_consent.approve');

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1='PROJECT_OFFICER' AND $2='beneficiaries.guardian_consent.approve')
  OR ($1 IN ('PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER') AND $2='assessments.record')
  OR ($1='MONITORING_AND_EVALUATION_OFFICER' AND $2='evaluations.submit')
  OR ($1='PROJECT_MANAGER' AND $2 IN ('evaluations.approve','evaluations.signoff'))
  OR (NOT ($1='SYSTEM_ADMINISTRATOR' AND $2='evaluations.weights.configure')
   AND (
    ($1 IN ('PROGRAM_MANAGER','GRANT_MANAGER') AND $2='activities.read')
    OR (NOT (($1='PROGRAM_MANAGER' AND $2='projects.archive')
     OR ($1='GRANT_MANAGER' AND $2='projects.archive')
     OR ($1='SYSTEM_ADMINISTRATOR' AND $2='budgets.read')
     OR ($1='PROJECT_OFFICER' AND $2='activities.create')
     OR ($1='PROJECT_OFFICER' AND $2='dashboards.customize')
     OR ($1='PROJECT_OFFICER' AND $2='assessments.read')
     OR ($1='PROJECT_OFFICER' AND $2='analytics.saddd.read'))
    AND (($1 IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
      AND $2 IN ('indicators.library.read','indicators.library.create','indicators.library.archive'))
     OR pathways.p09_role_allows_0048($1,$2)))
   ))
$matrix$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='beneficiaries.guardian_consent.approve'
WHERE r.code='PROJECT_OFFICER'
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- A rejected file value is remembered per participant and field as a hash, so a resolved hold does not return each cycle.
CREATE TABLE pathways.import_value_rejections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    beneficiary_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_hash character(64) NOT NULL,
    rejected_by_id uuid NOT NULL,
    rejected_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT import_value_rejections_hash_check CHECK (value_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE ONLY pathways.import_value_rejections FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways.import_value_rejections OWNER TO prisma;
ALTER TABLE ONLY pathways.import_value_rejections ADD CONSTRAINT import_value_rejections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_key UNIQUE (organization_id, beneficiary_id, field_id, value_hash);
CREATE INDEX import_value_rejections_project_field_idx ON pathways.import_value_rejections USING btree (organization_id, project_id, field_id);
CREATE INDEX import_value_rejections_rejected_by_idx ON pathways.import_value_rejections USING btree (organization_id, rejected_by_id);
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_organization_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_beneficiary_fk FOREIGN KEY (organization_id, beneficiary_id) REFERENCES pathways.beneficiaries(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_field_fk FOREIGN KEY (organization_id, project_id, field_id) REFERENCES pathways.form_fields(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.import_value_rejections
    ADD CONSTRAINT import_value_rejections_rejected_by_fk FOREIGN KEY (organization_id, rejected_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Runtime insert and select are scoped like beneficiary_identifiers.
ALTER TABLE pathways.import_value_rejections ENABLE ROW LEVEL SECURITY;
CREATE POLICY p04_runtime_insert ON pathways.import_value_rejections FOR INSERT TO pathways_runtime
 WITH CHECK (organization_id = (SELECT pathways.runtime_context_organization())
  AND rejected_by_id = (SELECT pathways.runtime_context_user()));
CREATE POLICY p04_runtime_select ON pathways.import_value_rejections FOR SELECT TO pathways_runtime
 USING (organization_id = (SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_can_read_beneficiary(import_value_rejections.beneficiary_id)));
CREATE POLICY p09_insert ON pathways.import_value_rejections AS RESTRICTIVE FOR INSERT TO pathways_runtime
 WITH CHECK (pathways.p09_can('beneficiaries.records.register'));
CREATE POLICY p09_select ON pathways.import_value_rejections AS RESTRICTIVE FOR SELECT TO pathways_runtime
 USING (pathways.p09_can('beneficiaries.records.read'));

CREATE FUNCTION pathways.p80_guard_value_rejection() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Import value rejections are append-only'; END IF;
  IF NEW.rejected_by_id IS DISTINCT FROM pathways.runtime_context_user() THEN
    RAISE EXCEPTION 'Rejection recorder must be the current actor';
  END IF;
  IF NOT pathways.p04_has_project_permission('imports.review',NEW.project_id) THEN
    RAISE EXCEPTION 'Rejection requires import review permission on the project';
  END IF;
  IF NOT pathways.p04_can_read_beneficiary(NEW.beneficiary_id) THEN
    RAISE EXCEPTION 'Rejection target is outside authorized detail scope';
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION pathways.p80_guard_value_rejection() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p80_guard_value_rejection() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p80_value_rejection BEFORE INSERT OR UPDATE OR DELETE ON pathways.import_value_rejections
 FOR EACH ROW EXECUTE FUNCTION pathways.p80_guard_value_rejection();

REVOKE ALL ON TABLE pathways.import_value_rejections FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON TABLE pathways.import_value_rejections TO pathways_runtime;

-- Held-row resolution and unchanged participants. Resolution is all or none; an outcome other than UNCHANGED needs no match.
ALTER TABLE pathways.data_import_rows
  ADD COLUMN resolution_data jsonb,
  ADD COLUMN resolved_by_id uuid,
  ADD COLUMN resolved_at timestamp(3) with time zone,
  ADD COLUMN registration_outcome text,
  ADD COLUMN matched_beneficiary_id uuid,
  ADD CONSTRAINT data_import_rows_resolution_shape CHECK(
    (resolution_data IS NULL AND resolved_by_id IS NULL AND resolved_at IS NULL)
    OR (resolution_data IS NOT NULL AND jsonb_typeof(resolution_data)='object' AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL)),
  ADD CONSTRAINT data_import_rows_registration_outcome_check CHECK(registration_outcome IS NULL
    OR (registration_outcome IN('CREATED','UPDATED','LINKED','UNCHANGED') AND status='PROCESSED')),
  ADD CONSTRAINT data_import_rows_matched_beneficiary_check CHECK(
    (matched_beneficiary_id IS NOT NULL) = (registration_outcome IS NOT DISTINCT FROM 'UNCHANGED'));
ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_resolved_by_fk FOREIGN KEY (organization_id, resolved_by_id) REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.data_import_rows
    ADD CONSTRAINT data_import_rows_matched_beneficiary_fk FOREIGN KEY (organization_id, matched_beneficiary_id) REFERENCES pathways.beneficiaries(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX data_import_rows_resolved_by_idx ON pathways.data_import_rows USING btree (organization_id, resolved_by_id);
CREATE INDEX data_import_rows_matched_beneficiary_idx ON pathways.data_import_rows USING btree (organization_id, matched_beneficiary_id);

-- The baseline import_rows_state with PROCESSING and PROCESSED also accepting a resolved INVALID row (no normalized data, errors kept).
ALTER TABLE pathways.data_import_rows DROP CONSTRAINT import_rows_state,
  ADD CONSTRAINT import_rows_state CHECK (
    (status = 'PENDING' AND normalized_data IS NULL AND validated_by_id IS NULL AND validated_at IS NULL AND processed_at IS NULL
      AND jsonb_array_length(validation_errors) = 0 AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
    OR (status = 'INVALID' AND normalized_data IS NULL AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
      AND jsonb_array_length(validation_errors) > 0 AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
    OR (status = 'VALID' AND (jsonb_typeof(normalized_data) = 'object' OR (normalized_data IS NULL AND validation_revision = 0))
      AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
      AND jsonb_array_length(validation_errors) = 0 AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
    OR (status IN ('UNPROCESSED','FAILED') AND jsonb_typeof(normalized_data) = 'object' AND validated_by_id IS NOT NULL
      AND validated_at IS NOT NULL AND processed_at IS NULL AND jsonb_array_length(validation_errors) = 0
      AND processing_claim_id IS NULL AND processing_claimed_at IS NULL)
    OR (status = 'PROCESSING'
      AND ((jsonb_typeof(normalized_data) = 'object' AND jsonb_array_length(validation_errors) = 0)
        OR (normalized_data IS NULL AND jsonb_array_length(validation_errors) > 0
          AND resolution_data IS NOT NULL AND jsonb_typeof(resolution_data) = 'object'))
      AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NULL
      AND processing_claim_id IS NOT NULL AND processing_claimed_at IS NOT NULL)
    OR (status = 'PROCESSED'
      AND (((jsonb_typeof(normalized_data) = 'object' OR (normalized_data IS NULL AND validation_revision = 0))
          AND jsonb_array_length(validation_errors) = 0)
        OR (normalized_data IS NULL AND jsonb_array_length(validation_errors) > 0
          AND resolution_data IS NOT NULL AND jsonb_typeof(resolution_data) = 'object'))
      AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND processed_at IS NOT NULL AND processed_at >= validated_at
      AND processing_claim_id IS NULL AND processing_claimed_at IS NULL));

-- The baseline body of p03_guard_import_row. A held row (UNPROCESSED or INVALID, never resolved) moves once to PROCESSING in the
-- UPDATE that sets all three resolution columns, changing only those and its claim columns. Resolution is frozen after that, and
-- the registration outcome is set only on the move to PROCESSED.
CREATE OR REPLACE FUNCTION pathways.p03_guard_import_row() RETURNS trigger
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
  IF TG_OP='UPDATE' AND OLD.status IN ('UNPROCESSED','INVALID') AND OLD.resolved_at IS NULL AND NEW.status='PROCESSING'
     AND NEW.resolution_data IS NOT NULL AND NEW.resolved_by_id IS NOT NULL AND NEW.resolved_at IS NOT NULL THEN
    IF NEW.resolved_by_id IS DISTINCT FROM pathways.runtime_context_user() THEN
      RAISE EXCEPTION 'Resolution recorder must be the current actor';
    END IF;
    IF to_jsonb(NEW)-ARRAY['status','resolution_data','resolved_by_id','resolved_at','processing_claim_id',
         'processing_claimed_at','processing_attempts','processing_error_code','updated_at']
       IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','resolution_data','resolved_by_id','resolved_at','processing_claim_id',
         'processing_claimed_at','processing_attempts','processing_error_code','updated_at'] THEN
      RAISE EXCEPTION 'A held row resolution may change only its resolution and claim columns';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.resolution_data IS DISTINCT FROM OLD.resolution_data
    OR NEW.resolved_by_id IS DISTINCT FROM OLD.resolved_by_id
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
  ) THEN RAISE EXCEPTION 'Import row resolution is set once while the row is held and then frozen'; END IF;
  IF TG_OP='UPDATE' AND (
    NEW.registration_outcome IS DISTINCT FROM OLD.registration_outcome
    OR NEW.matched_beneficiary_id IS DISTINCT FROM OLD.matched_beneficiary_id
  ) AND NOT (NEW.status='PROCESSED' AND OLD.registration_outcome IS NULL AND OLD.matched_beneficiary_id IS NULL) THEN
    RAISE EXCEPTION 'Registration outcome can only be set when the row becomes processed and is immutable after';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('PROCESSED','UNPROCESSED')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Committed import row disposition is immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$$;

-- The baseline body of p03_assert_processed_row; a registration row that matched an enrolled participant unchanged needs no submission.
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
    IF NEW.registration_outcome='UNCHANGED' AND EXISTS (
      SELECT FROM pathways.digital_forms f
      JOIN pathways.beneficiary_project_enrollments e ON e.organization_id=f.organization_id AND e.project_id=f.project_id
      WHERE f.organization_id=NEW.organization_id AND f.project_id=NEW.project_id AND f.id=NEW.form_id
        AND f.form_type='BENEFICIARY_REGISTRATION' AND e.beneficiary_id=NEW.matched_beneficiary_id
    ) THEN RETURN NULL; END IF;
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

-- Postconditions.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (pg_catalog.to_regprocedure('pathways.p04_guard_beneficiary()'),
   pg_catalog.to_regprocedure('pathways.p04_guard_consent()'),pg_catalog.to_regprocedure('pathways.p03_guard_import_row()'),
   pg_catalog.to_regprocedure('pathways.p03_assert_processed_row()'),pg_catalog.to_regprocedure('pathways.p80_guard_value_rejection()'))
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""'])<>5
 OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgenabled='O' AND NOT tgisinternal AND (
   (tgname='p04_beneficiary' AND tgrelid='pathways.beneficiaries'::regclass)
   OR (tgname='p04_consent' AND tgrelid='pathways.beneficiary_consent_records'::regclass)
   OR (tgname='p03_guard_import_row' AND tgrelid='pathways.data_import_rows'::regclass)
   OR (tgname='p03_row_complete' AND tgrelid='pathways.data_import_rows'::regclass)
   OR (tgname='p80_value_rejection' AND tgrelid='pathways.import_value_rejections'::regclass)))<>5
 THEN RAISE EXCEPTION '0080 guard postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE convalidated AND (
   (conrelid='pathways.beneficiaries'::regclass AND conname='beneficiaries_minor_consent')
   OR (conrelid='pathways.beneficiary_consent_records'::regclass AND conname LIKE 'beneficiary_consent_records_guardian_%')
   OR (conrelid='pathways.data_import_rows'::regclass AND conname IN('import_rows_state','data_import_rows_resolution_shape',
     'data_import_rows_registration_outcome_check','data_import_rows_matched_beneficiary_check',
     'data_import_rows_resolved_by_fk','data_import_rows_matched_beneficiary_fk'))
   OR (conrelid='pathways.import_value_rejections'::regclass AND contype<>'n')))<>18
 THEN RAISE EXCEPTION '0080 constraint postcondition failed'; END IF;
 IF NOT (pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.guardian_consent.approve')
  AND NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.guardian_consent.approve')
  AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','beneficiaries.guardian_consent.approve')
  AND pathways.p09_role_allows('PROJECT_OFFICER','assessments.record')
  AND pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review'))
 THEN RAISE EXCEPTION '0080 role ceiling postcondition failed'; END IF;
 IF (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
  JOIN pathways.permissions p ON p.id=rp.permission_id WHERE p.code='beneficiaries.guardian_consent.approve')<>1
 OR NOT EXISTS(SELECT FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
  JOIN pathways.permissions p ON p.id=rp.permission_id WHERE p.code='beneficiaries.guardian_consent.approve' AND r.code='PROJECT_OFFICER')
 THEN RAISE EXCEPTION '0080 grant postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_class c WHERE c.oid='pathways.import_value_rejections'::regclass
   AND pg_catalog.pg_get_userbyid(c.relowner)='prisma' AND c.relrowsecurity AND c.relforcerowsecurity)
 OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.import_value_rejections'::regclass)<>4
 OR NOT has_table_privilege('pathways_runtime','pathways.import_value_rejections','SELECT')
 OR NOT has_table_privilege('pathways_runtime','pathways.import_value_rejections','INSERT')
 OR has_table_privilege('pathways_runtime','pathways.import_value_rejections','UPDATE')
 OR has_table_privilege('pathways_runtime','pathways.import_value_rejections','DELETE')
 OR has_table_privilege('anon','pathways.import_value_rejections','SELECT')
 OR has_table_privilege('authenticated','pathways.import_value_rejections','SELECT')
 OR has_table_privilege('service_role','pathways.import_value_rejections','SELECT')
 THEN RAISE EXCEPTION '0080 rejection table postcondition failed'; END IF;
END $$;
COMMIT;
