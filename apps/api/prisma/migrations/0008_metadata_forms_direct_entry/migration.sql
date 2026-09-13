-- P02: project-owned versioned form definitions and retry-safe direct entry.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION 'P02 migration requires prisma or a loopback-only replay administrator';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected NOBYPASSRLS pathways_runtime role is missing';
  END IF;
  IF to_regclass('pathways.digital_forms') IS NULL
     OR to_regclass('pathways.form_fields') IS NULL
     OR to_regclass('pathways.form_submissions') IS NULL
     OR to_regclass('pathways.form_response_values') IS NULL THEN
    RAISE EXCEPTION 'P02 collection tables are missing';
  END IF;
END
$preflight$;

ALTER TABLE pathways.form_fields
  ADD COLUMN minimum_date date,
  ADD COLUMN maximum_date date,
  ADD COLUMN minimum_length integer,
  ADD COLUMN maximum_length integer,
  ADD CONSTRAINT form_fields_date_bounds CHECK (
    minimum_date IS NULL OR maximum_date IS NULL OR minimum_date <= maximum_date
  ),
  ADD CONSTRAINT form_fields_length_bounds CHECK (
    (minimum_length IS NULL OR minimum_length BETWEEN 0 AND 10000)
    AND (maximum_length IS NULL OR maximum_length BETWEEN 1 AND 10000)
    AND (minimum_length IS NULL OR maximum_length IS NULL OR minimum_length <= maximum_length)
  );

CREATE UNIQUE INDEX digital_forms_version_scope_key
  ON pathways.digital_forms(organization_id,project_id,id,version);

ALTER TABLE pathways.form_submissions
  ADD COLUMN form_version integer,
  ADD COLUMN client_submission_id uuid;

UPDATE pathways.form_submissions AS s
SET form_version=f.version, client_submission_id=gen_random_uuid()
FROM pathways.digital_forms AS f
WHERE f.organization_id=s.organization_id
  AND f.project_id=s.project_id
  AND f.id=s.form_id;

DO $backfill$
BEGIN
  IF EXISTS (
    SELECT FROM pathways.form_submissions
    WHERE form_version IS NULL OR client_submission_id IS NULL
  ) THEN
    RAISE EXCEPTION 'P02 submission backfill could not resolve a form version';
  END IF;
END
$backfill$;

ALTER TABLE pathways.form_submissions
  ALTER COLUMN form_version SET NOT NULL,
  ALTER COLUMN client_submission_id SET NOT NULL,
  ALTER COLUMN submitted_at DROP DEFAULT,
  ALTER COLUMN submitted_at DROP NOT NULL,
  DROP CONSTRAINT form_submissions_form_fk,
  ADD CONSTRAINT form_submissions_form_fk
    FOREIGN KEY (organization_id,project_id,form_id,form_version)
    REFERENCES pathways.digital_forms(organization_id,project_id,id,version)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX form_submissions_client_key
  ON pathways.form_submissions(organization_id,submitted_by_id,client_submission_id);

INSERT INTO pathways.permissions(code,name,description)
VALUES
  ('forms.read','Read form definitions','Read scoped form definitions and versions'),
  ('forms.manage','Manage draft form definitions','Create and edit scoped draft form definitions'),
  ('forms.publish','Publish form definitions','Approve and publish scoped form definitions'),
  ('submissions.write','Enter form submissions','Save, validate and submit scoped direct-entry records')
ON CONFLICT (code) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM pathways.roles r
JOIN pathways.permissions p ON (
  (p.code='forms.read' AND r.code IN (
    'SYSTEM_ADMINISTRATOR','PROGRAM_MANAGER','PROJECT_MANAGER',
    'MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER'
  ))
  OR (p.code='forms.manage' AND r.code IN (
    'SYSTEM_ADMINISTRATOR','PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER'
  ))
  OR (p.code='forms.publish' AND r.code='MONITORING_AND_EVALUATION_OFFICER')
  OR (p.code='submissions.write' AND r.code IN (
    'SYSTEM_ADMINISTRATOR','PROJECT_MANAGER',
    'MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER'
  ))
)
ON CONFLICT (role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pathways.p2_guard_form() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $guard$
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
$guard$;

CREATE OR REPLACE FUNCTION pathways.p2_guard_form_field() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $guard$
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
$guard$;

CREATE OR REPLACE FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $validate$
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
$validate$;

CREATE OR REPLACE FUNCTION pathways.p2_guard_response() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $guard$
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
$guard$;

CREATE FUNCTION pathways.p02_guard_direct_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $guard$
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
$guard$;

CREATE TRIGGER p02_guard_direct_submission
BEFORE INSERT OR UPDATE ON pathways.form_submissions
FOR EACH ROW EXECUTE FUNCTION pathways.p02_guard_direct_submission();

REVOKE ALL ON FUNCTION pathways.p2_guard_form() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p2_guard_form_field() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p2_guard_response() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p02_guard_direct_submission() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

GRANT DELETE ON pathways.form_fields, pathways.form_response_values TO pathways_runtime;

CREATE POLICY p2_runtime_delete ON pathways.form_fields
FOR DELETE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.digital_forms f
    WHERE f.organization_id=form_fields.organization_id
      AND f.project_id=form_fields.project_id
      AND f.id=form_fields.form_id AND f.status='DRAFT'
  )
);

DROP POLICY p4_runtime_insert ON pathways.form_submissions;
DROP POLICY p4_runtime_update ON pathways.form_submissions;
CREATE POLICY p2_runtime_insert ON pathways.form_submissions
FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND source='DIRECT_ENCODING' AND status='DRAFT'
  AND import_batch_id IS NULL AND import_row_id IS NULL AND enrollment_id IS NULL
);
CREATE POLICY p2_runtime_update ON pathways.form_submissions
FOR UPDATE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND source='DIRECT_ENCODING' AND status='DRAFT'
)
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND submitted_by_id=(SELECT pathways.runtime_context_user())
  AND source='DIRECT_ENCODING' AND status IN ('DRAFT','VALIDATED')
);

DROP POLICY p4_runtime_insert ON pathways.form_response_values;
DROP POLICY p4_runtime_update ON pathways.form_response_values;
CREATE POLICY p2_runtime_insert ON pathways.form_response_values
FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.project_id=form_response_values.project_id
      AND s.form_id=form_response_values.form_id
      AND s.id=form_response_values.submission_id
      AND s.submitted_by_id=(SELECT pathways.runtime_context_user())
      AND s.source='DIRECT_ENCODING' AND s.status='DRAFT'
  )
);
CREATE POLICY p2_runtime_update ON pathways.form_response_values
FOR UPDATE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.id=form_response_values.submission_id
      AND s.submitted_by_id=(SELECT pathways.runtime_context_user())
      AND s.source='DIRECT_ENCODING' AND s.status='DRAFT'
  )
)
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.project_id=form_response_values.project_id
      AND s.form_id=form_response_values.form_id
      AND s.id=form_response_values.submission_id
      AND s.submitted_by_id=(SELECT pathways.runtime_context_user())
      AND s.source='DIRECT_ENCODING' AND s.status='DRAFT'
  )
);
CREATE POLICY p2_runtime_delete ON pathways.form_response_values
FOR DELETE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND EXISTS (
    SELECT FROM pathways.form_submissions s
    WHERE s.organization_id=form_response_values.organization_id
      AND s.id=form_response_values.submission_id
      AND s.submitted_by_id=(SELECT pathways.runtime_context_user())
      AND s.source='DIRECT_ENCODING' AND s.status='DRAFT'
  )
);

COMMIT;
