-- Project and Activity creation contract repair. Additive only; no existing row is rewritten.
DO $preflight$
BEGIN
  IF current_user <> 'prisma' THEN
    RAISE EXCEPTION '0025 requires the established prisma migration identity';
  END IF;
  IF to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
     OR to_regprocedure('pathways.p06_can(text,uuid)') IS NULL
     OR to_regclass('pathways.project_budget_records') IS NULL
     OR to_regclass('pathways.beneficiary_activity_participations') IS NULL THEN
    RAISE EXCEPTION '0025 requires the complete migration history through 0024';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime')
     OR (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime') THEN
    RAISE EXCEPTION '0025 requires non-superuser NOBYPASSRLS pathways_runtime';
  END IF;
  IF EXISTS (
    SELECT FROM pathways.project_budget_records
    WHERE category IN ('PROJECT_PROFILE_TOTAL','ACTIVITY_PROFILE_TOTAL')
  ) THEN
    RAISE EXCEPTION '0025 reserved budget categories already exist; review the collision before continuing';
  END IF;
  IF EXISTS (
    SELECT
    FROM pathways.project_activity_assignments aa
    JOIN pathways.user_project_assignments pa
      ON pa.organization_id=aa.organization_id
     AND pa.project_id=aa.project_id
     AND pa.id=aa.project_assignment_id
    JOIN pathways.system_users u
      ON u.organization_id=pa.organization_id AND u.id=pa.user_id
    JOIN pathways.roles r ON r.id=u.role_id
    WHERE aa.status='ACTIVE' AND aa.ended_at IS NULL AND r.code<>'PROJECT_OFFICER'
  ) THEN
    RAISE EXCEPTION '0025 found an active Activity assignee who is not a Project Officer';
  END IF;
END
$preflight$;

ALTER TABLE pathways.projects
  ADD COLUMN implementing_partners text,
  ADD COLUMN sector text,
  ADD COLUMN target_beneficiaries integer,
  ADD COLUMN program_manager_id uuid;

ALTER TABLE pathways.projects
  ADD CONSTRAINT projects_creation_profile_check CHECK (
    (implementing_partners IS NULL OR length(btrim(implementing_partners)) BETWEEN 1 AND 1000)
    AND (sector IS NULL OR length(btrim(sector)) BETWEEN 1 AND 160)
    AND (target_beneficiaries IS NULL OR target_beneficiaries BETWEEN 0 AND 2147483647)
  ),
  ADD CONSTRAINT projects_program_manager_fk
    FOREIGN KEY (organization_id,program_manager_id)
    REFERENCES pathways.system_users(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX projects_program_manager_idx
  ON pathways.projects(organization_id,program_manager_id);

ALTER TABLE pathways.project_activities
  ADD COLUMN timeline_override_justification text,
  ADD COLUMN target_beneficiaries integer;

ALTER TABLE pathways.project_activities
  ADD CONSTRAINT project_activities_creation_profile_check CHECK (
    (timeline_override_justification IS NULL
      OR length(btrim(timeline_override_justification)) BETWEEN 1 AND 1000)
    AND (target_beneficiaries IS NULL OR target_beneficiaries BETWEEN 0 AND 2147483647)
  );

CREATE FUNCTION pathways.p08_guard_project_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
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
$function$;

CREATE FUNCTION pathways.p08_guard_activity_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
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
$function$;

CREATE TRIGGER p08_project_profile
BEFORE INSERT OR UPDATE OF organization_id,program_manager_id
ON pathways.projects
FOR EACH ROW EXECUTE FUNCTION pathways.p08_guard_project_profile();

CREATE TRIGGER p08_activity_profile
BEFORE INSERT OR UPDATE OF organization_id,project_id,planned_start_date,planned_end_date,timeline_override_justification
ON pathways.project_activities
FOR EACH ROW EXECUTE FUNCTION pathways.p08_guard_activity_profile();

-- Activity assignees are operational Project Officers, not arbitrary project members.
CREATE OR REPLACE FUNCTION pathways.p2_guard_activity_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pathways AS $$
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

CREATE TABLE pathways.activity_indicator_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  indicator_id uuid NOT NULL,
  created_by_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activity_indicator_links_pkey PRIMARY KEY(id),
  CONSTRAINT activity_indicator_links_organization_fk
    FOREIGN KEY(organization_id) REFERENCES pathways.organizations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_indicator_links_project_fk
    FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_indicator_links_activity_fk
    FOREIGN KEY(organization_id,project_id,activity_id)
    REFERENCES pathways.project_activities(organization_id,project_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_indicator_links_indicator_fk
    FOREIGN KEY(organization_id,project_id,indicator_id)
    REFERENCES pathways.project_indicators(organization_id,project_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT activity_indicator_links_created_by_fk
    FOREIGN KEY(organization_id,created_by_id) REFERENCES pathways.system_users(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX activity_indicator_links_scope_key
  ON pathways.activity_indicator_links(organization_id,project_id,id);
CREATE UNIQUE INDEX activity_indicator_links_activity_indicator_key
  ON pathways.activity_indicator_links(organization_id,project_id,activity_id,indicator_id);
CREATE INDEX activity_indicator_links_indicator_idx
  ON pathways.activity_indicator_links(organization_id,project_id,indicator_id);
CREATE INDEX activity_indicator_links_created_by_idx
  ON pathways.activity_indicator_links(organization_id,created_by_id);

CREATE FUNCTION pathways.p08_reject_activity_indicator_link_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
BEGIN
  RAISE EXCEPTION 'Activity indicator links are replaced, not updated' USING ERRCODE='23514';
END
$$;

CREATE TRIGGER p08_no_activity_indicator_link_update
BEFORE UPDATE ON pathways.activity_indicator_links
FOR EACH ROW EXECUTE FUNCTION pathways.p08_reject_activity_indicator_link_update();

ALTER TABLE pathways.activity_indicator_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.activity_indicator_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pathways.activity_indicator_links
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT SELECT,INSERT,DELETE ON TABLE pathways.activity_indicator_links TO pathways_runtime;

CREATE POLICY p08_activity_indicator_select
ON pathways.activity_indicator_links FOR SELECT TO pathways_runtime
USING (pathways.p06_can('monitoring.read',project_id));

CREATE POLICY p08_activity_indicator_insert
ON pathways.activity_indicator_links FOR INSERT TO pathways_runtime
WITH CHECK (
  pathways.p06_can('indicators.update',project_id)
  AND organization_id=pathways.runtime_context_organization()
  AND created_by_id=pathways.runtime_context_user()
);

CREATE POLICY p08_activity_indicator_delete
ON pathways.activity_indicator_links FOR DELETE TO pathways_runtime
USING (pathways.p06_can('indicators.update',project_id));

ALTER TABLE pathways.project_budget_records
  ADD CONSTRAINT project_budget_records_profile_category_check CHECK (
    (category<>'PROJECT_PROFILE_TOTAL' OR activity_id IS NULL)
    AND (category<>'ACTIVITY_PROFILE_TOTAL' OR activity_id IS NOT NULL)
  );

CREATE UNIQUE INDEX project_budget_records_active_project_profile_key
  ON pathways.project_budget_records(organization_id,project_id)
  WHERE category='PROJECT_PROFILE_TOTAL' AND activity_id IS NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX project_budget_records_active_activity_profile_key
  ON pathways.project_budget_records(organization_id,project_id,activity_id)
  WHERE category='ACTIVITY_PROFILE_TOTAL' AND activity_id IS NOT NULL AND archived_at IS NULL;

CREATE FUNCTION pathways.p08_activity_beneficiaries_reached(
  wanted_org uuid,
  wanted_project uuid,
  wanted_activity_ids uuid[]
)
RETURNS TABLE(activity_id uuid,beneficiaries_reached integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION pathways.p08_guard_project_profile(),
  pathways.p08_guard_activity_profile(),
  pathways.p08_reject_activity_indicator_link_update(),
  pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

GRANT EXECUTE ON FUNCTION pathways.p08_guard_project_profile(),
  pathways.p08_guard_activity_profile(),
  pathways.p08_reject_activity_indicator_link_update()
  TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])
  TO pathways_runtime;
