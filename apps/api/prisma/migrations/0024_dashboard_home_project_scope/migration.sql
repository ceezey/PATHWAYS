-- Dedicated dashboard-home release path. This preserves the analytics-only
-- contract of p06_monitoring/p06_compute_monitoring while allowing the
-- read-only workspace home to use the existing projects.read permission.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION '0024 requires prisma or a loopback-only replay administrator';
  END IF;

  IF to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
     OR to_regprocedure('pathways.p06_cell(numeric,text)') IS NULL
     OR to_regprocedure('pathways.p06_monitoring(uuid,uuid[],date,date,text)') IS NULL
     OR to_regprocedure('pathways.p06_saddd(uuid,uuid[],date,date,text)') IS NULL
     OR to_regclass('pathways.system_users') IS NULL
     OR to_regclass('pathways.roles') IS NULL
     OR to_regclass('pathways.permissions') IS NULL
     OR to_regclass('pathways.role_permissions') IS NULL
     OR to_regclass('pathways.projects') IS NULL
     OR to_regclass('pathways.project_activities') IS NULL
     OR to_regclass('pathways.project_milestones') IS NULL THEN
    RAISE EXCEPTION '0024 requires the reviewed project and dashboard authorization contract';
  END IF;

  IF to_regprocedure('pathways.p06_home_dashboard(uuid,uuid[],date,date,text)') IS NOT NULL THEN
    RAISE EXCEPTION '0024 dashboard-home function already exists outside this migration';
  END IF;

  IF NOT EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND NOT rolsuper
      AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION '0024 requires NOBYPASSRLS non-superuser pathways_runtime';
  END IF;
END
$preflight$;

CREATE FUNCTION pathways.p06_home_dashboard(
  wanted_org uuid,
  wanted_projects uuid[],
  start_on date,
  end_on date,
  zone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
$function$;

ALTER FUNCTION pathways.p06_home_dashboard(uuid, uuid[], date, date, text)
  OWNER TO prisma;

-- New SECURITY DEFINER functions receive PUBLIC execute by default. Close that
-- window explicitly and expose the function only to the NOBYPASSRLS runtime.
REVOKE ALL ON FUNCTION pathways.p06_home_dashboard(uuid, uuid[], date, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p06_home_dashboard(uuid, uuid[], date, date, text)
  TO pathways_runtime;

DO $postflight$
BEGIN
  IF NOT (
    SELECT prosecdef
      AND proowner = 'prisma'::regrole
      AND proconfig = ARRAY['search_path=""']
    FROM pg_proc
    WHERE oid = 'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION '0024 dashboard-home function hardening failed';
  END IF;

  IF NOT has_function_privilege(
    'pathways_runtime',
    'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
    'EXECUTE'
  )
     OR has_function_privilege(
       'anon',
       'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION '0024 dashboard-home execute grants failed';
  END IF;

  IF EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION '0024 changed the runtime role security contract';
  END IF;
END
$postflight$;

COMMIT;
