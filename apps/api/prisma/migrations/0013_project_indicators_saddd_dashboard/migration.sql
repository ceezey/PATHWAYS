-- P06: append-only indicator authority and bounded aggregate functions.
-- Review and run first through the repository's disposable 0001-0013 replay.
-- No Auth/Storage writes, no runtime-role ownership/BYPASSRLS changes, no legacy-value conversion.
BEGIN;
DO $preflight$
BEGIN
  IF current_user <> 'prisma' THEN RAISE EXCEPTION 'P06 requires the established prisma migration identity'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'Expected NOBYPASSRLS runtime is missing';
  END IF;
  IF to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
    OR NOT EXISTS (SELECT FROM pg_trigger WHERE tgname='p05_journey_snapshot' AND tgenabled='O') THEN
    RAISE EXCEPTION 'P06 requires completed migration 0012';
  END IF;
END $preflight$;

-- =========================================================
-- P06 compatibility correction for P05 activity-monitoring
-- submission finalization.
--
-- Migration 0012 required ACTIVITY_MONITORING submissions to
-- be VALIDATED with processed_at populated. The existing
-- submission_state constraint, however, correctly requires
-- processed_at to remain NULL while status = VALIDATED.
--
-- Preserve VALIDATED as the submission authority and verify
-- the actual participation + journey effects instead.
-- =========================================================

CREATE OR REPLACE FUNCTION pathways.p03_guard_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $guard$
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
$guard$;

ALTER TABLE pathways.project_indicators
  ADD COLUMN measurement_mode text,
  ADD COLUMN numeric_kind text,
  ADD COLUMN direction text,
  ADD COLUMN display_precision integer,
  ADD COLUMN period_start date,
  ADD COLUMN period_end date,
  ADD COLUMN revision integer NOT NULL DEFAULT 1;

CREATE FUNCTION pathways.p06_numeric_valid(v numeric, kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
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
ALTER TABLE pathways.project_indicators ADD CONSTRAINT p06_indicator_contract CHECK (
  revision>0 AND (measurement_mode IS NULL OR (
    measurement_mode IN ('MANUAL','DERIVED')
    AND numeric_kind IS NOT NULL AND numeric_kind IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
    AND direction IS NOT NULL AND direction IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','DESCRIPTIVE')
    AND display_precision IS NOT NULL AND display_precision BETWEEN 0 AND 4
    AND (numeric_kind<>'COUNT' OR display_precision=0)
    AND period_start IS NOT NULL AND period_end IS NOT NULL
    AND period_start BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
    AND period_end BETWEEN period_start AND least(period_start+365,DATE '2100-12-31')
    AND unit_label IS NOT NULL AND length(btrim(unit_label)) BETWEEN 1 AND 80
    AND data_source IS NOT NULL AND length(btrim(data_source)) BETWEEN 1 AND 300
    AND current_value IS NULL AND actual_value IS NULL
    AND pathways.p06_numeric_valid(baseline_value,numeric_kind)
    AND pathways.p06_numeric_valid(target_value,numeric_kind)
    AND (baseline_value IS NULL OR target_value IS NULL OR direction='DESCRIPTIVE'
      OR (direction='HIGHER_IS_BETTER' AND target_value>=baseline_value)
      OR (direction='LOWER_IS_BETTER' AND target_value<=baseline_value))
  ))
);
COMMENT ON COLUMN pathways.project_indicators.current_value IS 'Legacy evidence only; P06 reads measurement authority, never this column.';
COMMENT ON COLUMN pathways.project_indicators.actual_value IS 'Legacy evidence only; P06 does not backfill or maintain competing actual/current values.';

CREATE TABLE pathways.project_indicator_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, project_id uuid NOT NULL,
  indicator_id uuid NOT NULL, recipe text NOT NULL, contract_version text NOT NULL DEFAULT 'p06.v1',
  activity_id uuid, form_id uuid, form_version integer, field_id uuid,
  created_by_id uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT p06_bindings_indicator_key UNIQUE(organization_id,project_id,indicator_id),
  CONSTRAINT p06_bindings_org_fk FOREIGN KEY(organization_id) REFERENCES pathways.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_project_fk FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_indicator_fk FOREIGN KEY(organization_id,project_id,indicator_id) REFERENCES pathways.project_indicators(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_activity_fk FOREIGN KEY(organization_id,project_id,activity_id) REFERENCES pathways.project_activities(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_form_fk FOREIGN KEY(organization_id,project_id,form_id,form_version) REFERENCES pathways.digital_forms(organization_id,project_id,id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_field_fk FOREIGN KEY(organization_id,project_id,form_id,field_id) REFERENCES pathways.form_fields(organization_id,project_id,form_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_creator_fk FOREIGN KEY(organization_id,created_by_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_bindings_recipe_check CHECK (contract_version='p06.v1' AND (
    (recipe IN ('FORM_NUMERIC_SUM','FORM_NUMERIC_AVERAGE') AND form_id IS NOT NULL AND form_version IS NOT NULL
      AND form_version>0 AND field_id IS NOT NULL AND activity_id IS NULL)
    OR (recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS','ATTENDANCE_RECORDS_PER_INDIVIDUAL','EFFECTIVE_JOURNEY_EVENT_COUNT')
      AND form_id IS NULL AND form_version IS NULL AND field_id IS NULL)
    OR (recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND form_id IS NULL AND form_version IS NULL AND field_id IS NULL AND activity_id IS NULL)
  ))
);
CREATE INDEX p06_bindings_source_idx ON pathways.project_indicator_bindings(organization_id,project_id,form_id,field_id);

CREATE TABLE pathways.project_indicator_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, project_id uuid NOT NULL,
  indicator_id uuid NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
  value numeric(18,4) NOT NULL, source text NOT NULL, note text,
  client_measurement_id uuid NOT NULL, request_hash char(64) NOT NULL,
  corrects_measurement_id uuid, correction_reason text,
  recorded_by_id uuid NOT NULL, recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT p06_measurements_scope_key UNIQUE(organization_id,project_id,indicator_id,id),
  CONSTRAINT p06_measurements_successor_key UNIQUE(corrects_measurement_id),
  CONSTRAINT p06_measurements_client_key UNIQUE(organization_id,recorded_by_id,client_measurement_id),
  CONSTRAINT p06_measurements_org_fk FOREIGN KEY(organization_id) REFERENCES pathways.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_measurements_project_fk FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_measurements_indicator_fk FOREIGN KEY(organization_id,project_id,indicator_id) REFERENCES pathways.project_indicators(organization_id,project_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_measurements_recorder_fk FOREIGN KEY(organization_id,recorded_by_id) REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_measurements_correction_fk FOREIGN KEY(organization_id,project_id,indicator_id,corrects_measurement_id) REFERENCES pathways.project_indicator_measurements(organization_id,project_id,indicator_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT p06_measurements_values_check CHECK (
    value NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    AND period_start BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
    AND period_end BETWEEN period_start AND least(period_start+365,DATE '2100-12-31')
    AND length(btrim(source)) BETWEEN 1 AND 300 AND (note IS NULL OR length(note)<=1000)
    AND request_hash ~ '^[a-f0-9]{64}$'
    AND ((corrects_measurement_id IS NULL AND correction_reason IS NULL)
      OR (corrects_measurement_id IS NOT NULL AND corrects_measurement_id<>id AND correction_reason IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 1 AND 1000))
  )
);
CREATE UNIQUE INDEX p06_measurements_root_key ON pathways.project_indicator_measurements(organization_id,project_id,indicator_id,period_start,period_end)
  WHERE corrects_measurement_id IS NULL;
CREATE INDEX p06_measurements_period_idx ON pathways.project_indicator_measurements(organization_id,project_id,indicator_id,period_start,period_end);
CREATE INDEX p06_enrollments_period_idx ON pathways.beneficiary_project_enrollments(organization_id,project_id,enrollment_date,ended_date);

INSERT INTO pathways.permissions (
  code,
  name,
  description
)
VALUES
  (
    'monitoring.read',
    'Read project monitoring',
    'Read scoped project indicator definitions and monitoring information'
  ),
  (
    'analytics.read',
    'Read monitoring analytics',
    'Read scoped aggregate monitoring dashboards'
  ),
  (
    'beneficiaries.aggregates.read',
    'Read Beneficiary aggregates',
    'Read privacy-controlled aggregate Beneficiary monitoring results'
  ),
  (
    'indicators.create',
    'Create project indicators',
    'Create project-owned indicator definitions within authorized project scope'
  ),
  (
    'indicators.update',
    'Update project indicators',
    'Update authorized project indicators and record indicator measurements'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO pathways.role_permissions (
  role_id,
  permission_id
)
SELECT
  r.id,
  p.id
FROM pathways.roles r
JOIN pathways.permissions p
  ON (
    (
      p.code = 'monitoring.read'
      AND r.code IN (
        'SYSTEM_ADMINISTRATOR',
        'PROGRAM_MANAGER',
        'PROJECT_MANAGER',
        'MONITORING_AND_EVALUATION_OFFICER'
      )
    )
    OR
    (
      p.code IN (
        'analytics.read',
        'beneficiaries.aggregates.read'
      )
      AND r.code IN (
        'SYSTEM_ADMINISTRATOR',
        'PROGRAM_MANAGER',
        'GRANT_MANAGER',
        'PROJECT_MANAGER',
        'MONITORING_AND_EVALUATION_OFFICER'
      )
    )
    OR
    (
      p.code IN (
        'indicators.create',
        'indicators.update'
      )
      AND r.code = 'MONITORING_AND_EVALUATION_OFFICER'
    )
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Reuse P05 scope semantics, but enforce the P06 role ceilings even if a mapping is overbroad.
CREATE FUNCTION pathways.p06_can(requested_permission text, requested_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT
    nullif(current_setting('app.organization_id', true), '')::uuid IS NOT NULL
    AND nullif(current_setting('app.user_id', true), '')::uuid IS NOT NULL
    AND nullif(current_setting('request.jwt.claim.sub', true), '')::uuid IS NOT NULL

    AND pathways.p05_has_project_permission(
      requested_permission,
      requested_project
    )

    AND EXISTS (
      SELECT
      FROM pathways.system_users u
      JOIN pathways.roles r
        ON r.id = u.role_id
       AND r.is_active
      WHERE
        u.id =
          nullif(current_setting('app.user_id', true), '')::uuid
        AND u.organization_id =
          nullif(current_setting('app.organization_id', true), '')::uuid
        AND u.auth_user_id =
          nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        AND u.account_status = 'ACTIVE'
        AND u.archived_at IS NULL
        AND CASE
          WHEN requested_permission IN (
            'indicators.create',
            'indicators.update'
          )
            THEN r.code = 'MONITORING_AND_EVALUATION_OFFICER'

          WHEN requested_permission = 'monitoring.read'
            THEN r.code IN (
              'SYSTEM_ADMINISTRATOR',
              'PROGRAM_MANAGER',
              'PROJECT_MANAGER',
              'MONITORING_AND_EVALUATION_OFFICER'
            )

          WHEN requested_permission IN (
            'analytics.read',
            'beneficiaries.aggregates.read'
          )
            THEN r.code IN (
              'SYSTEM_ADMINISTRATOR',
              'PROGRAM_MANAGER',
              'GRANT_MANAGER',
              'PROJECT_MANAGER',
              'MONITORING_AND_EVALUATION_OFFICER'
            )

          ELSE false
        END
    )
$$;

CREATE FUNCTION pathways.p06_guard_indicator() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
CREATE TRIGGER p06_indicator BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_indicators
  FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_indicator();

CREATE FUNCTION pathways.p06_guard_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
CREATE TRIGGER p06_binding BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_indicator_bindings
  FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_binding();

CREATE FUNCTION pathways.p06_guard_measurement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
CREATE TRIGGER p06_measurement BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_indicator_measurements
  FOR EACH ROW EXECUTE FUNCTION pathways.p06_guard_measurement();

-- RLS is mandatory, plus scoped predicates in every NestJS query. No DELETE grant.
ALTER TABLE pathways.project_indicator_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_indicator_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_indicator_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_indicator_measurements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.project_indicator_bindings,pathways.project_indicator_measurements FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT SELECT,INSERT ON pathways.project_indicator_bindings,pathways.project_indicator_measurements TO pathways_runtime;
DROP POLICY p4_runtime_select ON pathways.project_indicators;
DROP POLICY p4_runtime_insert ON pathways.project_indicators;
DROP POLICY p4_runtime_update ON pathways.project_indicators;
CREATE POLICY p06_indicator_select ON pathways.project_indicators FOR SELECT TO pathways_runtime
  USING (organization_id=pathways.runtime_context_organization() AND pathways.p06_can('monitoring.read',project_id));
CREATE POLICY p06_indicator_insert ON pathways.project_indicators FOR INSERT TO pathways_runtime
  WITH CHECK (organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user() AND pathways.p06_can('indicators.create',project_id));
CREATE POLICY p06_indicator_update ON pathways.project_indicators FOR UPDATE TO pathways_runtime
  USING (organization_id=pathways.runtime_context_organization() AND pathways.p06_can('indicators.update',project_id))
  WITH CHECK (organization_id=pathways.runtime_context_organization() AND pathways.p06_can('indicators.update',project_id));
CREATE POLICY p06_binding_select ON pathways.project_indicator_bindings FOR SELECT TO pathways_runtime
  USING (organization_id=pathways.runtime_context_organization() AND pathways.p06_can('monitoring.read',project_id));
CREATE POLICY p06_binding_insert ON pathways.project_indicator_bindings FOR INSERT TO pathways_runtime
  WITH CHECK (organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user() AND pathways.p06_can('indicators.create',project_id));
CREATE POLICY p06_measurement_select ON pathways.project_indicator_measurements FOR SELECT TO pathways_runtime
  USING (organization_id=pathways.runtime_context_organization() AND pathways.p06_can('monitoring.read',project_id));
CREATE POLICY p06_measurement_insert ON pathways.project_indicator_measurements FOR INSERT TO pathways_runtime
  WITH CHECK (organization_id=pathways.runtime_context_organization() AND recorded_by_id=pathways.runtime_context_user() AND pathways.p06_can('indicators.update',project_id));
-- No schema-wide default grants are introduced. Each new object below is explicitly revoked/granted.

CREATE FUNCTION pathways.p06_assert_scope(
  wanted_org uuid,
  wanted_projects uuid[],
  permission text,
  start_on date,
  end_on date,
  zone text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
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

CREATE FUNCTION pathways.p06_cell(v numeric, reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN reason IS NOT NULL THEN jsonb_build_object('state',CASE WHEN reason IN ('SMALL_COHORT','COMPLEMENTARY_SUPPRESSION') THEN 'SUPPRESSED' WHEN reason='ZERO_DENOMINATOR' THEN 'NOT_APPLICABLE' ELSE 'MISSING' END,'value',NULL,'reason',reason)
    WHEN v IS NULL THEN jsonb_build_object('state','MISSING','value',NULL,'reason','NO_MEASUREMENT')
    WHEN v<>0 AND round(v,4)=0 THEN jsonb_build_object('state','MISSING','value',NULL,'reason','BELOW_REPRESENTABLE_PRECISION')
    WHEN v IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR abs(v)>=100000000000000 THEN jsonb_build_object('state','MISSING','value',NULL,'reason','VALUE_OUT_OF_RANGE')
    ELSE jsonb_build_object('state',CASE WHEN v=0 THEN 'ZERO' ELSE 'AVAILABLE' END,'value',trim_scale(round(v,4))::text,'reason',NULL) END
$$;
CREATE FUNCTION pathways.p06_count_cell(v bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT pathways.p06_cell(v::numeric,CASE WHEN v BETWEEN 1 AND 4 THEN 'SMALL_COHORT' ELSE NULL END)
$$;

-- Completed calendar years; registration age is intentionally never consulted.
CREATE FUNCTION pathways.p06_age_band(born_on date, reference_on date) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN reference_on IS NULL OR NOT isfinite(reference_on) THEN NULL
    WHEN born_on IS NULL THEN 'Unknown'
    WHEN NOT isfinite(born_on) OR NOT isfinite(reference_on) OR born_on<DATE '1900-01-01' OR born_on>reference_on THEN NULL
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=9 THEN '0-9'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=14 THEN '10-14'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=17 THEN '15-17'
    WHEN extract(year FROM age(reference_on::timestamp,born_on::timestamp))<=24 THEN '18-24'
    ELSE '25+' END
$$;

CREATE FUNCTION pathways.p06_check_binding_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.measurement_mode='DERIVED' AND NOT EXISTS (
    SELECT FROM pathways.project_indicator_bindings b WHERE b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id AND b.indicator_id=NEW.id
  ) THEN RAISE EXCEPTION 'Derived definition requires its immutable binding in the same transaction' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p06_binding_authority AFTER INSERT OR UPDATE ON pathways.project_indicators
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p06_check_binding_authority();

-- Scoped aggregate helpers run as the established migration owner, never as a new runtime bypass.
-- These SELECT policies also make FORCE-RLS new tables work if that owner is NOBYPASSRLS.
CREATE POLICY p06_binding_owner_read
ON pathways.project_indicator_bindings
FOR SELECT TO prisma
USING (
  organization_id =
    nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p06_can('monitoring.read', project_id)
);

CREATE POLICY p06_measurement_owner_read
ON pathways.project_indicator_measurements
FOR SELECT TO prisma
USING (
  organization_id =
    nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p06_can('monitoring.read', project_id)
);

CREATE FUNCTION pathways.p06_compute_indicator_value(wanted_org uuid, wanted_project uuid, wanted_indicator uuid, zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
END $$;

CREATE FUNCTION pathways.p06_compute_monitoring(wanted_org uuid,wanted_projects uuid[],start_on date,end_on date,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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

CREATE FUNCTION pathways.p06_compute_saddd(wanted_org uuid,wanted_projects uuid[],start_on date,end_on date,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb; result jsonb; suppress boolean; total bigint;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.read',start_on,end_on,zone);
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'beneficiaries.aggregates.read',start_on,end_on,zone);
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

-- G4 settles age and within-release suppression. It does not settle a cross-query
-- release policy. Keep sensitive endpoints non-disclosing until a reviewed,
-- separately approved forward migration supplies that policy. No client/runtime
-- switch, environment-variable override or role bypass can enable this release.
CREATE FUNCTION pathways.p06_indicator_value(wanted_org uuid,wanted_project uuid,wanted_indicator uuid,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE mode text; recipe text; start_on date; end_on date;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
    OR NOT pathways.p06_can('monitoring.read',wanted_project) THEN
    RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501';
  END IF;
  SELECT i.measurement_mode,b.recipe,i.period_start,i.period_end INTO mode,recipe,start_on,end_on
    FROM pathways.project_indicators i LEFT JOIN pathways.project_indicator_bindings b
      ON b.organization_id=i.organization_id AND b.project_id=i.project_id AND b.indicator_id=i.id
    WHERE i.organization_id=wanted_org AND i.project_id=wanted_project AND i.id=wanted_indicator;
  IF NOT FOUND THEN RAISE EXCEPTION 'Indicator unavailable' USING ERRCODE='42501'; END IF;
  IF mode='DERIVED' AND recipe IS DISTINCT FROM 'ACTIVITY_COMPLETION_PERCENTAGE' THEN
    PERFORM pathways.p06_assert_scope(wanted_org,ARRAY[wanted_project],'monitoring.read',start_on,end_on,zone);
    RETURN jsonb_build_object('current',pathways.p06_cell(NULL,'RELEASE_POLICY_REVIEW_REQUIRED'),
      'measurementId',NULL,'measuredAt',NULL,'measurementSource',NULL);
  END IF;
  RETURN pathways.p06_compute_indicator_value(wanted_org,wanted_project,wanted_indicator,zone);
END $$;

CREATE FUNCTION pathways.p06_monitoring(wanted_org uuid,wanted_projects uuid[],start_on date,end_on date,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE data jsonb; missing jsonb;
BEGIN
  data:=pathways.p06_compute_monitoring(wanted_org,wanted_projects,start_on,end_on,zone);
  missing:=pathways.p06_cell(NULL,'RELEASE_POLICY_REVIEW_REQUIRED');
  RETURN data || jsonb_build_object('participationRecords',missing,'attendingIndividuals',missing,
    'enrolledBeneficiaryRecords',missing,'enrolledIndividuals',missing);
END $$;

CREATE FUNCTION pathways.p06_saddd(wanted_org uuid,wanted_projects uuid[],start_on date,end_on date,zone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE missing jsonb;
BEGIN
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'analytics.read',start_on,end_on,zone);
  PERFORM pathways.p06_assert_scope(wanted_org,wanted_projects,'beneficiaries.aggregates.read',start_on,end_on,zone);
  missing:=pathways.p06_cell(NULL,'RELEASE_POLICY_REVIEW_REQUIRED');
  -- Do not even query the demographic population for an unreleased response.
  RETURN jsonb_build_object('total',missing,
    'sex',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',missing) ORDER BY v.ord)
      FROM (VALUES ('MALE','Male',1),('FEMALE','Female',2),('OTHER','Other',3),('PREFER_NOT_TO_SAY','Prefer not to say',4),('NOT_SPECIFIED','Unknown',5)) v(key,label,ord)),
    'age',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.key,'metric',missing) ORDER BY v.ord)
      FROM (VALUES ('0-9',1),('10-14',2),('15-17',3),('18-24',4),('25+',5),('Unknown',6)) v(key,ord)),
    'disability',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',missing) ORDER BY v.ord)
      FROM (VALUES ('WITH_DISABILITY','With disability',1),('WITHOUT_DISABILITY','Without disability',2),('NOT_SPECIFIED','Unknown',3)) v(key,label,ord)),
    'completeness',(SELECT jsonb_agg(jsonb_build_object('key',v.key,'label',v.label,'metric',missing) ORDER BY v.ord)
      FROM (VALUES ('MISSING_BIRTH_DATE','Missing birth date',1),('INVALID_BIRTH_DATE','Excluded invalid birth date',2),('MISSING_SEX','Unspecified sex',3),('MISSING_DISABILITY','Unspecified disability',4)) v(key,label,ord)));
END $$;

-- Functions are not Supabase Data API/RPC endpoints. No PUBLIC execution window survives COMMIT.
REVOKE ALL ON FUNCTION pathways.p06_numeric_valid(numeric,text),pathways.p06_can(text,uuid),
  pathways.p06_guard_indicator(),pathways.p06_guard_binding(),pathways.p06_guard_measurement(),pathways.p06_check_binding_authority(),
  pathways.p06_assert_scope(uuid,uuid[],text,date,date,text),pathways.p06_cell(numeric,text),pathways.p06_count_cell(bigint),pathways.p06_age_band(date,date),
  pathways.p06_indicator_value(uuid,uuid,uuid,text),pathways.p06_monitoring(uuid,uuid[],date,date,text),pathways.p06_saddd(uuid,uuid[],date,date,text)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pathways.p06_compute_indicator_value(uuid,uuid,uuid,text),
  pathways.p06_compute_monitoring(uuid,uuid[],date,date,text),pathways.p06_compute_saddd(uuid,uuid[],date,date,text)
FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_numeric_valid(numeric,text),pathways.p06_can(text,uuid),
  pathways.p06_indicator_value(uuid,uuid,uuid,text),pathways.p06_monitoring(uuid,uuid[],date,date,text),pathways.p06_saddd(uuid,uuid[],date,date,text)
TO pathways_runtime;
COMMIT;
