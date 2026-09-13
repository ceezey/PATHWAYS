-- P04 centralized Beneficiary profiles, exact identifiers, consent provenance,
-- project enrollment and atomic registration promotion.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION 'P04 migration requires prisma or a loopback-only replay administrator';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected NOBYPASSRLS pathways_runtime role is missing';
  END IF;
  IF to_regclass('pathways.beneficiaries') IS NULL
     OR to_regclass('pathways.beneficiary_project_enrollments') IS NULL
     OR to_regclass('pathways.form_submissions') IS NULL
     OR to_regclass('pathways.data_import_rows') IS NULL THEN
    RAISE EXCEPTION 'P04 prerequisites are missing';
  END IF;
END
$preflight$;

CREATE TYPE pathways.beneficiary_subject_type AS ENUM (
  'INDIVIDUAL','GROUP','COMMUNITY','UNSPECIFIED_LEGACY'
);
CREATE TYPE pathways.beneficiary_consent_kind AS ENUM (
  'PARTICIPATION','DATA_PROCESSING','GUARDIAN'
);
CREATE TYPE pathways.beneficiary_record_source AS ENUM (
  'DIRECT_ENTRY','IMPORTED_DATASET'
);

REVOKE ALL ON TYPE pathways.beneficiary_subject_type,
  pathways.beneficiary_consent_kind, pathways.beneficiary_record_source
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT USAGE ON TYPE pathways.beneficiary_subject_type,
  pathways.beneficiary_consent_kind, pathways.beneficiary_record_source
  TO pathways_runtime;

ALTER TABLE pathways.beneficiaries
  ADD COLUMN subject_type pathways.beneficiary_subject_type NOT NULL DEFAULT 'UNSPECIFIED_LEGACY',
  ADD COLUMN display_name text,
  ADD COLUMN data_processing_consent_recorded boolean NOT NULL DEFAULT false;

UPDATE pathways.beneficiaries
SET display_name=COALESCE(
  NULLIF(btrim(concat_ws(' ',first_name,middle_name,last_name)),''), code
);

CREATE INDEX beneficiaries_org_display_name_idx
  ON pathways.beneficiaries(organization_id,display_name,code);

CREATE TABLE pathways.beneficiary_identifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL,
  identifier_type text NOT NULL,
  normalized_value text NOT NULL,
  display_value text NOT NULL,
  source pathways.beneficiary_record_source NOT NULL,
  created_by_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT beneficiary_identifiers_pkey PRIMARY KEY(id),
  CONSTRAINT beneficiary_identifiers_format CHECK (
    identifier_type ~ '^[A-Z][A-Z0-9_]{1,31}$'
    AND identifier_type NOT IN ('PATHWAYS_CODE','EMAIL','NAME','BIRTH_DATE')
    AND length(normalized_value) BETWEEN 1 AND 160
    AND normalized_value=btrim(normalized_value)
    AND length(display_value) BETWEEN 1 AND 160
  ),
  CONSTRAINT beneficiary_identifiers_organization_fk FOREIGN KEY(organization_id)
    REFERENCES pathways.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_identifiers_beneficiary_fk FOREIGN KEY(organization_id,beneficiary_id)
    REFERENCES pathways.beneficiaries(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_identifiers_created_by_fk FOREIGN KEY(organization_id,created_by_id)
    REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX beneficiary_identifiers_org_type_value_key
  ON pathways.beneficiary_identifiers(organization_id,identifier_type,normalized_value);
CREATE INDEX beneficiary_identifiers_beneficiary_idx
  ON pathways.beneficiary_identifiers(organization_id,beneficiary_id);
CREATE INDEX beneficiary_identifiers_created_by_idx
  ON pathways.beneficiary_identifiers(organization_id,created_by_id);

CREATE TABLE pathways.beneficiary_consent_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  beneficiary_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  kind pathways.beneficiary_consent_kind NOT NULL,
  source pathways.beneficiary_record_source NOT NULL,
  recorded_by_id uuid NOT NULL,
  recorded_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT beneficiary_consent_records_pkey PRIMARY KEY(id),
  CONSTRAINT beneficiary_consent_records_recorded_check CHECK (recorded_at<=created_at),
  CONSTRAINT beneficiary_consent_records_organization_fk FOREIGN KEY(organization_id)
    REFERENCES pathways.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_consent_records_project_fk FOREIGN KEY(organization_id,project_id)
    REFERENCES pathways.projects(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_consent_records_beneficiary_fk FOREIGN KEY(organization_id,beneficiary_id)
    REFERENCES pathways.beneficiaries(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_consent_records_enrollment_fk
    FOREIGN KEY(organization_id,project_id,enrollment_id)
    REFERENCES pathways.beneficiary_project_enrollments(organization_id,project_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_consent_records_submission_fk
    FOREIGN KEY(organization_id,project_id,submission_id)
    REFERENCES pathways.form_submissions(organization_id,project_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT beneficiary_consent_records_recorded_by_fk FOREIGN KEY(organization_id,recorded_by_id)
    REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX beneficiary_consent_records_submission_kind_key
  ON pathways.beneficiary_consent_records(submission_id,kind);
CREATE INDEX beneficiary_consent_records_project_beneficiary_idx
  ON pathways.beneficiary_consent_records(organization_id,project_id,beneficiary_id,recorded_at);
CREATE INDEX beneficiary_consent_records_recorded_by_idx
  ON pathways.beneficiary_consent_records(organization_id,recorded_by_id);

INSERT INTO pathways.permissions(code,name,description) VALUES
  ('beneficiaries.records.read','Read Beneficiary records','Read scoped Beneficiary detail records'),
  ('beneficiaries.records.register','Register beneficiaries','Create scoped Beneficiary registrations'),
  ('beneficiaries.profiles.update','Update Beneficiary profiles','Update an authorized shared Beneficiary profile'),
  ('beneficiaries.enrollments.manage','Manage Beneficiary enrollments','Link an authorized profile to a scoped project'),
  ('beneficiaries.identities.review','Review Beneficiary identity links','Resolve exact cross-project identity links and conflicts'),
  ('beneficiaries.records.archive','Archive Beneficiary profiles','Archive an authorized Beneficiary profile')
ON CONFLICT(code) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON (
  (r.code='SYSTEM_ADMINISTRATOR' AND p.code IN (
    'beneficiaries.records.read',
    'beneficiaries.records.register','beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage','beneficiaries.identities.review',
    'beneficiaries.records.archive'
  ))
  OR (r.code='PROJECT_MANAGER' AND p.code IN (
    'beneficiaries.records.read',
    'beneficiaries.records.register','beneficiaries.enrollments.manage',
    'beneficiaries.records.archive'
  ))
  OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN (
    'beneficiaries.records.read',
    'beneficiaries.records.register','beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage','beneficiaries.identities.review'
  ))
  OR (r.code='PROJECT_OFFICER' AND p.code IN (
    'beneficiaries.records.read','beneficiaries.records.register'
  ))
)
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pathways.p04_has_project_permission(
  requested_permission text, requested_project uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $permission$
  SELECT COALESCE((
    SELECT true
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id AND p.code=requested_permission
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
      AND (
        r.code='SYSTEM_ADMINISTRATOR'
        OR EXISTS (
          SELECT FROM pathways.user_project_assignments a
          WHERE a.organization_id=u.organization_id AND a.user_id=u.id
            AND a.project_id=requested_project AND a.status='ACTIVE'
            AND a.ended_at IS NULL
        )
      )
    LIMIT 1
  ),false)
$permission$;

CREATE OR REPLACE FUNCTION pathways.p04_can_read_beneficiary(requested_beneficiary uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $read$
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
$read$;

CREATE OR REPLACE FUNCTION pathways.p04_can_mutate_beneficiary(
  requested_permission text, requested_beneficiary uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $mutate$
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
$mutate$;

CREATE OR REPLACE FUNCTION pathways.p04_can_insert_enrollment(
  requested_project uuid, requested_beneficiary uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $enroll$
  SELECT COALESCE(
    (
      pathways.p04_has_project_permission('beneficiaries.enrollments.manage',requested_project)
      AND pathways.p04_has_project_permission('beneficiaries.identities.review',requested_project)
    )
    OR (
      pathways.p04_has_project_permission('beneficiaries.records.register',requested_project)
      AND EXISTS (
        SELECT FROM pathways.beneficiaries b
        WHERE b.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
          AND b.id=requested_beneficiary
          AND b.created_by_id=nullif(current_setting('app.user_id',true),'')::uuid
      )
      AND NOT EXISTS (
        SELECT FROM pathways.beneficiary_project_enrollments prior
        WHERE prior.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
          AND prior.beneficiary_id=requested_beneficiary
      )
    ),false
  )
$enroll$;

CREATE OR REPLACE FUNCTION pathways.p04_guard_beneficiary() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
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
$guard$;

CREATE OR REPLACE FUNCTION pathways.p04_guard_identifier() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
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
$guard$;

CREATE OR REPLACE FUNCTION pathways.p04_guard_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
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
$guard$;

DROP TRIGGER IF EXISTS p04_beneficiary ON pathways.beneficiaries;
CREATE TRIGGER p04_beneficiary BEFORE INSERT OR UPDATE ON pathways.beneficiaries
FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_beneficiary();
CREATE TRIGGER p04_identifier BEFORE INSERT OR UPDATE OR DELETE ON pathways.beneficiary_identifiers
FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_identifier();
CREATE TRIGGER p04_consent BEFORE INSERT OR UPDATE OR DELETE ON pathways.beneficiary_consent_records
FOR EACH ROW EXECUTE FUNCTION pathways.p04_guard_consent();

-- P04 permits an enrollment reference only for a pinned registration form.
CREATE OR REPLACE FUNCTION pathways.p03_guard_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
DECLARE registration_form boolean;
BEGIN
  SELECT f.form_type='BENEFICIARY_REGISTRATION' INTO registration_form
  FROM pathways.digital_forms f WHERE f.organization_id=NEW.organization_id
    AND f.project_id=NEW.project_id AND f.id=NEW.form_id AND f.version=NEW.form_version
    AND f.status IN ('PUBLISHED','ARCHIVED');
  IF registration_form IS NULL THEN
    RAISE EXCEPTION 'Submission requires a published pinned form version';
  END IF;
  IF NOT COALESCE(registration_form,false) AND NEW.enrollment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only registration submissions may reference an enrollment';
  END IF;
  IF COALESCE(registration_form,false) AND NEW.enrollment_id IS NULL THEN
    RAISE EXCEPTION 'Registration submissions require an enrollment';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.source='DIRECT_ENCODING' THEN
      IF NEW.status<>'DRAFT' OR NEW.import_batch_id IS NOT NULL OR NEW.import_row_id IS NOT NULL
         OR NEW.submitted_at IS NOT NULL OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Direct-entry drafts must start in the draft state';
      END IF;
    ELSIF NEW.source='IMPORTED_DATASET' THEN
      IF NEW.status<>'DRAFT' OR NEW.import_batch_id IS NULL OR NEW.import_row_id IS NULL
         OR NEW.submitted_at IS NOT NULL OR NEW.validated_by_id IS NOT NULL
         OR NEW.validated_at IS NOT NULL OR NEW.processed_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL
         OR NOT EXISTS (
           SELECT FROM pathways.data_import_rows r
           JOIN pathways.data_import_batches b ON b.id=r.import_batch_id
           WHERE r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
             AND r.form_id=NEW.form_id AND r.id=NEW.import_row_id
             AND r.import_batch_id=NEW.import_batch_id AND r.status='PROCESSING'
             AND b.form_version=NEW.form_version AND b.status='PROCESSING'
             AND b.validated_mapping_revision=b.mapping_revision
         ) THEN RAISE EXCEPTION 'Imported submissions require a currently reviewed processing row'; END IF;
    ELSE RAISE EXCEPTION 'Submission source is unsupported'; END IF;
    IF registration_form AND NOT EXISTS (
      SELECT FROM pathways.beneficiary_project_enrollments e
      WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
        AND e.id=NEW.enrollment_id
    ) THEN RAISE EXCEPTION 'Registration enrollment is outside submission scope'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'DRAFT'
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

CREATE OR REPLACE FUNCTION pathways.p03_assert_processed_row() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $assert$
DECLARE registration_form boolean; target_submission uuid; target_enrollment uuid; target_beneficiary uuid;
BEGIN
  IF NEW.status<>'PROCESSED' THEN RETURN NULL; END IF;
  SELECT f.form_type='BENEFICIARY_REGISTRATION',s.id,s.enrollment_id,e.beneficiary_id
  INTO registration_form,target_submission,target_enrollment,target_beneficiary
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
    RAISE EXCEPTION 'Processed row requires one normalized submission';
  END IF;
  IF registration_form AND (
    target_enrollment IS NULL OR target_beneficiary IS NULL
    OR NOT EXISTS (
      SELECT FROM pathways.beneficiary_consent_records c
      WHERE c.submission_id=target_submission AND c.kind='PARTICIPATION'
    )
    OR NOT EXISTS (
      SELECT FROM pathways.beneficiary_consent_records c
      WHERE c.submission_id=target_submission AND c.kind='DATA_PROCESSING'
    )
  ) THEN RAISE EXCEPTION 'Processed registration requires profile, enrollment and consent provenance'; END IF;
  RETURN NULL;
END
$assert$;

-- Replace broad organization-only runtime policies with detail-role/project-aware
-- defense in depth. NestJS still applies mandatory query predicates first.
DROP POLICY IF EXISTS p4_runtime_select ON pathways.beneficiaries;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.beneficiaries;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.beneficiaries;
CREATE POLICY p04_runtime_select ON pathways.beneficiaries FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_can_read_beneficiary(id)));
CREATE POLICY p04_runtime_insert ON pathways.beneficiaries FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND created_by_id=(SELECT pathways.runtime_context_user()));
CREATE POLICY p04_runtime_update ON pathways.beneficiaries FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (
    (SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.profiles.update',id))
    OR (SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.records.archive',id))
  ))
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND (
    (SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.profiles.update',id))
    OR (SELECT pathways.p04_can_mutate_beneficiary('beneficiaries.records.archive',id))
  ));

DROP POLICY IF EXISTS p4_runtime_select ON pathways.beneficiary_project_enrollments;
DROP POLICY IF EXISTS p4_runtime_insert ON pathways.beneficiary_project_enrollments;
DROP POLICY IF EXISTS p4_runtime_update ON pathways.beneficiary_project_enrollments;
CREATE POLICY p04_runtime_select ON pathways.beneficiary_project_enrollments FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_has_project_permission('beneficiaries.records.read',project_id)));
CREATE POLICY p04_runtime_insert ON pathways.beneficiary_project_enrollments FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND recorded_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p04_can_insert_enrollment(project_id,beneficiary_id)));

ALTER TABLE pathways.beneficiary_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.beneficiary_identifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways.beneficiary_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.beneficiary_consent_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pathways.beneficiary_identifiers,
  pathways.beneficiary_consent_records
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT SELECT,INSERT ON TABLE pathways.beneficiary_identifiers,
  pathways.beneficiary_consent_records TO pathways_runtime;

CREATE POLICY p04_runtime_select ON pathways.beneficiary_identifiers FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_can_read_beneficiary(beneficiary_id)));
CREATE POLICY p04_runtime_insert ON pathways.beneficiary_identifiers FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND created_by_id=(SELECT pathways.runtime_context_user()));
CREATE POLICY p04_runtime_select ON pathways.beneficiary_consent_records FOR SELECT TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_has_project_permission('beneficiaries.records.read',project_id)));
CREATE POLICY p04_runtime_insert ON pathways.beneficiary_consent_records FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=(SELECT pathways.runtime_context_organization())
  AND recorded_by_id=(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p04_has_project_permission('beneficiaries.records.register',project_id)));

-- The P04 service never writes consent/account/scope fields through profile update.
REVOKE INSERT,UPDATE ON pathways.beneficiaries FROM pathways_runtime;
GRANT INSERT (id,organization_id,code,subject_type,display_name,first_name,middle_name,last_name,
  sex,birth_date,age_at_registration,disability_status,location_barangay,
  location_city_municipality,location_province,status,consent_recorded,
  data_processing_consent_recorded,is_minor,guardian_consent_recorded,is_dummy_record,
  created_by_id,archived_at)
  ON pathways.beneficiaries TO pathways_runtime;
GRANT UPDATE (subject_type,display_name,first_name,middle_name,last_name,sex,birth_date,
  age_at_registration,disability_status,location_barangay,location_city_municipality,
  location_province,status,archived_at,updated_at)
  ON pathways.beneficiaries TO pathways_runtime;
REVOKE INSERT,UPDATE ON pathways.beneficiary_project_enrollments FROM pathways_runtime;
GRANT INSERT (id,organization_id,project_id,beneficiary_id,enrollment_date,status,
  recorded_by_id) ON pathways.beneficiary_project_enrollments TO pathways_runtime;
-- SELECT ... FOR SHARE in the consent guard needs an UPDATE privilege, while
-- this policy makes every real enrollment update fail closed until P05.
GRANT UPDATE(id) ON pathways.beneficiary_project_enrollments TO pathways_runtime;
CREATE POLICY p04_runtime_lock ON pathways.beneficiary_project_enrollments
FOR UPDATE TO pathways_runtime
USING (organization_id=(SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p04_has_project_permission('beneficiaries.records.read',project_id)))
WITH CHECK (false);

DROP POLICY IF EXISTS p03_runtime_insert ON pathways.form_submissions;
CREATE POLICY p04_runtime_insert ON pathways.form_submissions FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND (
    (source='DIRECT_ENCODING' AND status='DRAFT' AND import_batch_id IS NULL AND import_row_id IS NULL)
    OR (source='IMPORTED_DATASET' AND status='DRAFT' AND import_batch_id IS NOT NULL AND import_row_id IS NOT NULL)
  )
);

REVOKE ALL ON FUNCTION pathways.p04_has_project_permission(text,uuid),
  pathways.p04_can_read_beneficiary(uuid), pathways.p04_can_mutate_beneficiary(text,uuid),
  pathways.p04_can_insert_enrollment(uuid,uuid),
  pathways.p04_guard_beneficiary(),
  pathways.p04_guard_identifier(), pathways.p04_guard_consent(),
  pathways.p03_guard_submission(), pathways.p03_assert_processed_row()
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p04_has_project_permission(text,uuid),
  pathways.p04_can_read_beneficiary(uuid),
  pathways.p04_can_mutate_beneficiary(text,uuid),
  pathways.p04_can_insert_enrollment(uuid,uuid) TO pathways_runtime;

COMMIT;
