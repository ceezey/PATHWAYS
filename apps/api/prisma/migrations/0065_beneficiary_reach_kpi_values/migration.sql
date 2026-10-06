-- 0065 beneficiary reach and KPI values (cr-pathways-beneficiary-reach-kpi-values); forward migration.
-- p06_monitoring and p06_home_dashboard release the four reach counts from p06_compute_monitoring with 1-4 and
-- nested-count complementary suppression instead of SENSITIVE_RELEASE_NOT_ENABLED_V1; the home dashboard keeps the
-- placeholder for callers without monitoring.read on every requested project, since its own gate is projects.read.
-- p06_participation_breakdown releases exact participation counts (no suppression, by developer decision) and
-- p06_indicator_values releases indicator current values, both without journeys.read, beneficiaries.records.read or
-- indicators.read. Every function is owned by prisma, which owns every source table; hosted prisma has no BYPASSRLS,
-- so the only FORCE RLS sources (indicator bindings and measurements) are read through their p06_*_owner_read
-- policies, which need monitoring.read on the project. The reach release also hides participationRecords when it is
-- 1-4 below enrolled individuals or 1-4 above attending individuals, judged on the counts before their own suppression.
-- No table, column, policy, role or permission grant changes (role_permissions stays 314); no DBA preprovision.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0064_evaluation_write_path'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0065 requires the verified 0064 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways'
   AND p.proname IN ('p06_participation_breakdown','p06_indicator_values','p06_complement_cell','p06_release_reach'))
 THEN RAISE EXCEPTION '0065 requires prisma to own pathways and no earlier release functions'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid IN (
   'pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_compute_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure,
   'pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)'::pg_catalog.regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)<>'prisma')
 THEN RAISE EXCEPTION '0065 requires prisma to own the p06 monitoring and indicator functions'; END IF;
 IF NOT (SELECT bool_and(relforcerowsecurity) FROM pg_catalog.pg_class WHERE oid IN (
   'pathways.project_indicator_bindings'::pg_catalog.regclass,'pathways.project_indicator_measurements'::pg_catalog.regclass))
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE (polname,polrelid,polroles) IN (
   ('p06_binding_owner_read','pathways.project_indicator_bindings'::pg_catalog.regclass,ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')]),
   ('p06_measurement_owner_read','pathways.project_indicator_measurements'::pg_catalog.regclass,ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')])))<>2
 THEN RAISE EXCEPTION '0065 requires the prisma owner read policies on indicator bindings and measurements'; END IF;
 -- Remember both replaced ACLs and the grant count so the postcondition proves them unchanged.
 PERFORM pg_catalog.set_config('pathways.m0065_monitoring_acl',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure),true);
 PERFORM pg_catalog.set_config('pathways.m0065_home_acl',(SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure),true);
 PERFORM pg_catalog.set_config('pathways.m0065_grants',(SELECT count(*) FROM pathways.role_permissions)::text,true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- Hides the inner of two nested counts when both are visible and their difference is 1-4.
CREATE FUNCTION pathways.p06_complement_cell(outer_cell jsonb, inner_cell jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN outer_cell->>'value' IS NOT NULL AND inner_cell->>'value' IS NOT NULL
      AND (outer_cell->>'value')::numeric - (inner_cell->>'value')::numeric BETWEEN 1 AND 4
    THEN pathways.p06_cell(NULL, 'COMPLEMENTARY_SUPPRESSION') ELSE inner_cell END
$function$;

-- Applies nested-count suppression to enrolled records, individuals, attending individuals and participation records.
CREATE FUNCTION pathways.p06_release_reach(data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  r jsonb := data->'enrolledBeneficiaryRecords';
  i jsonb := data->'enrolledIndividuals';
  a jsonb := data->'attendingIndividuals';
  p jsonb := data->'participationRecords';
BEGIN
  i := pathways.p06_complement_cell(r, i);
  a := pathways.p06_complement_cell(i, a);
  a := pathways.p06_complement_cell(r, a);
  -- Records are hidden when 1-4 below enrolled individuals or 1-4 above attending individuals, using the incoming counts.
  p := pathways.p06_complement_cell(data->'enrolledIndividuals', p);
  IF p->>'value' IS NOT NULL AND data->'attendingIndividuals'->>'value' IS NOT NULL
     AND (p->>'value')::numeric - (data->'attendingIndividuals'->>'value')::numeric BETWEEN 1 AND 4 THEN
    p := pathways.p06_cell(NULL, 'COMPLEMENTARY_SUPPRESSION');
  END IF;
  RETURN data || jsonb_build_object('enrolledIndividuals', i, 'attendingIndividuals', a, 'participationRecords', p);
END
$function$;

CREATE OR REPLACE FUNCTION pathways.p06_monitoring(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- p06_compute_monitoring asserts monitoring.read and project scope before any count is read.
  RETURN pathways.p06_release_reach(
    pathways.p06_compute_monitoring(wanted_org, wanted_projects, start_on, end_on, zone));
END
$function$;

CREATE OR REPLACE FUNCTION pathways.p06_home_dashboard(wanted_org uuid, wanted_projects uuid[], start_on date, end_on date, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wanted_project uuid;
  missing jsonb;
  result jsonb;
BEGIN
  IF wanted_org IS NULL
     OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR wanted_projects IS NULL
     OR cardinality(wanted_projects) > 100
     OR array_position(wanted_projects, NULL) IS NOT NULL
     OR cardinality(wanted_projects) <> (SELECT count(DISTINCT item) FROM unnest(wanted_projects) item) THEN
    RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
  END IF;

  IF start_on IS NULL OR end_on IS NULL
     OR start_on < DATE '1900-01-01' OR end_on > DATE '2100-12-31'
     OR end_on < start_on OR end_on - start_on > 365
     OR zone IS NULL OR length(zone) > 100
     OR NOT EXISTS (SELECT FROM pg_catalog.pg_timezone_names WHERE name = zone) THEN
    RAISE EXCEPTION 'Invalid bounded dashboard period' USING ERRCODE = '22023';
  END IF;

  -- Empty project scopes still require an active identity whose active role has projects.read.
  IF NOT EXISTS (
    SELECT
    FROM pathways.system_users app_user
    JOIN pathways.roles role ON role.id = app_user.role_id AND role.is_active
    JOIN pathways.role_permissions mapping ON mapping.role_id = role.id
    JOIN pathways.permissions permission ON permission.id = mapping.permission_id
     AND permission.code = 'projects.read' AND permission.is_active
    WHERE app_user.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND app_user.organization_id = wanted_org
      AND app_user.auth_user_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      AND app_user.account_status = 'ACTIVE'
      AND app_user.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Dashboard home permission unavailable' USING ERRCODE = '42501';
  END IF;

  FOREACH wanted_project IN ARRAY wanted_projects
  LOOP
    IF NOT pathways.p05_has_project_permission('projects.read', wanted_project) THEN
      RAISE EXCEPTION 'Dashboard home scope unavailable' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- A monitoring.read holder on every requested project gets the released counts.
  IF pathways.p09_can('monitoring.read') AND NOT EXISTS (
    SELECT FROM unnest(wanted_projects) item WHERE NOT pathways.p06_can('monitoring.read', item)
  ) THEN
    RETURN pathways.p06_release_reach(
      pathways.p06_compute_monitoring(wanted_org, wanted_projects, start_on, end_on, zone));
  END IF;

  missing := pathways.p06_cell(NULL, 'SENSITIVE_RELEASE_NOT_ENABLED_V1');

  WITH activity_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_activities
    WHERE organization_id = wanted_org AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL AND planned_end_date BETWEEN start_on AND end_on
    GROUP BY status
  ), milestone_counts AS (
    SELECT status::text AS key, count(*) AS n
    FROM pathways.project_milestones
    WHERE organization_id = wanted_org AND project_id = ANY(wanted_projects)
      AND archived_at IS NULL AND target_date BETWEEN start_on AND end_on
    GROUP BY status
  )
  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label,
        'metric', pathways.p06_cell(coalesce(counts.n, 0))) ORDER BY v.ord)
      FROM (VALUES ('NOT_STARTED', 'Not started', 1), ('IN_PROGRESS', 'In progress', 2), ('FOR_REVIEW', 'For review', 3),
        ('COMPLETED', 'Completed', 4), ('CANCELLED', 'Cancelled', 5)) v(key, label, ord)
      LEFT JOIN activity_counts counts USING (key)
    ),
    'milestones', (
      SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label,
        'metric', pathways.p06_cell(coalesce(counts.n, 0))) ORDER BY v.ord)
      FROM (VALUES ('PENDING', 'Pending', 1), ('IN_PROGRESS', 'In progress', 2), ('COMPLETED', 'Completed', 3),
        ('CANCELLED', 'Cancelled', 4)) v(key, label, ord)
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

-- Exact participation counts by activity, month and attendance status for one project and an optional period.
CREATE FUNCTION pathways.p06_participation_breakdown(wanted_project uuid, start_on date DEFAULT NULL, end_on date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  result jsonb;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project) THEN
    RAISE EXCEPTION 'Participation breakdown unavailable' USING ERRCODE = '42501';
  END IF;
  IF (start_on IS NULL) <> (end_on IS NULL) OR end_on < start_on
     OR start_on < DATE '1900-01-01' OR end_on > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Invalid participation period' USING ERRCODE = '22023';
  END IF;

  WITH accepted AS MATERIALIZED (
    SELECT p.activity_id, a.title, to_char(p.participation_date, 'YYYY-MM') AS month,
      p.attendance_status::text AS status
    FROM pathways.beneficiary_activity_participations p
    JOIN pathways.beneficiary_project_enrollments e
      ON e.organization_id = p.organization_id AND e.project_id = p.project_id AND e.id = p.enrollment_id
    JOIN pathways.beneficiaries ben ON ben.organization_id = e.organization_id AND ben.id = e.beneficiary_id
    JOIN pathways.project_activities a
      ON a.organization_id = p.organization_id AND a.project_id = p.project_id AND a.id = p.activity_id
    JOIN pathways.form_submissions s
      ON s.organization_id = p.organization_id AND s.project_id = p.project_id AND s.id = p.source_submission_id
    WHERE p.organization_id = org AND p.project_id = wanted_project
      AND (start_on IS NULL OR p.participation_date BETWEEN start_on AND end_on)
      AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
      AND a.archived_at IS NULL AND a.status <> 'CANCELLED'
      AND s.status = 'VALIDATED' AND NOT s.is_dummy_record
  )
  SELECT jsonb_build_object(
    'projectId', wanted_project,
    'total', (SELECT count(*) FROM accepted),
    'totalSuppressed', false,
    'byActivity', (SELECT coalesce(jsonb_agg(jsonb_build_object('activityId', g.activity_id, 'activityName', g.title,
        'count', g.n, 'suppressed', false) ORDER BY g.title, g.activity_id), '[]'::jsonb)
      FROM (SELECT activity_id, min(title) AS title, count(*) AS n FROM accepted GROUP BY activity_id) g),
    'byMonth', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', g.month, 'count', g.n, 'suppressed', false)
        ORDER BY g.month), '[]'::jsonb)
      FROM (SELECT month, count(*) AS n FROM accepted GROUP BY month) g),
    'byAttendanceStatus', (SELECT jsonb_agg(jsonb_build_object('status', v.status, 'count', coalesce(g.n, 0),
        'suppressed', false) ORDER BY v.ord)
      FROM (VALUES ('PRESENT', 1), ('ABSENT', 2), ('COMPLETED', 3), ('NOT_COMPLETED', 4), ('EXCUSED', 5)) v(status, ord)
      LEFT JOIN (SELECT status, count(*) AS n FROM accepted GROUP BY status) g USING (status)))
  INTO result;
  RETURN result;
END
$function$;

-- Current values of a project's active indicators with display fields only; no definition text, binding or measurement ids.
CREATE FUNCTION pathways.p06_indicator_values(wanted_project uuid, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  result jsonb;
BEGIN
  IF org IS NULL OR wanted_project IS NULL
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('reports.indicator.read', wanted_project) THEN
    RAISE EXCEPTION 'Indicator values unavailable' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM pathways.project_indicators
      WHERE organization_id = org AND project_id = wanted_project AND archived_at IS NULL) > 100 THEN
    RAISE EXCEPTION 'Narrow the indicator scope' USING ERRCODE = '22023';
  END IF;
  -- p06_compute_indicator_value is the same computation as the Indicator Summary report (p34_compute_indicator_value).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'projectId', i.project_id, 'code', i.code, 'name', i.name, 'indicatorType', i.indicator_type,
      'unitLabel', i.unit_label, 'numericKind', i.numeric_kind, 'direction', i.direction,
      'displayPrecision', i.display_precision,
      'periodStart', to_char(i.period_start, 'YYYY-MM-DD'), 'periodEnd', to_char(i.period_end, 'YYYY-MM-DD'),
      'baseline', trim_scale(i.baseline_value)::text, 'target', trim_scale(i.target_value)::text,
      'revision', i.revision,
      'status', CASE WHEN i.measurement_mode IS NULL THEN 'LEGACY_REVIEW_REQUIRED' ELSE 'ACTIVE' END,
      'current', pathways.p06_compute_indicator_value(org, wanted_project, i.id, zone)->'current'
    ) ORDER BY i.code, i.id), '[]'::jsonb)
  INTO result
  FROM pathways.project_indicators i
  WHERE i.organization_id = org AND i.project_id = wanted_project AND i.archived_at IS NULL;
  RETURN result;
END
$function$;

ALTER FUNCTION pathways.p06_complement_cell(jsonb, jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p06_release_reach(jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p06_participation_breakdown(uuid, date, date) OWNER TO prisma;
ALTER FUNCTION pathways.p06_indicator_values(uuid, text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p06_complement_cell(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_release_reach(jsonb) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_participation_breakdown(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
REVOKE ALL ON FUNCTION pathways.p06_indicator_values(uuid, text) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_participation_breakdown(uuid, date, date) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_indicator_values(uuid, text) TO pathways_runtime;

-- Postconditions: owner, definer mode, volatility, empty search_path and ACL for every touched function.
DO $$ DECLARE fn text; runtime oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime'); BEGIN
 FOREACH fn IN ARRAY ARRAY['pathways.p06_monitoring(uuid,uuid[],date,date,text)','pathways.p06_home_dashboard(uuid,uuid[],date,date,text)',
   'pathways.p06_participation_breakdown(uuid,date,date)','pathways.p06_indicator_values(uuid,text)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
  THEN RAISE EXCEPTION '0065 % owner/security/search_path postcondition failed',fn; END IF;
  IF NOT has_function_privilege('pathways_runtime',fn,'EXECUTE')
   OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE has_function_privilege(r.name,fn,'EXECUTE'))
  THEN RAISE EXCEPTION '0065 % runtime ACL postcondition failed',fn; END IF;
 END LOOP;
 IF (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways.p06_monitoring(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure)
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0065_monitoring_acl')
  OR (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'::pg_catalog.regprocedure)
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0065_home_acl')
 THEN RAISE EXCEPTION '0065 replaced function ACL changed'; END IF;
 FOREACH fn IN ARRAY ARRAY['pathways.p06_participation_breakdown(uuid,date,date)','pathways.p06_indicator_values(uuid,text)'] LOOP
  IF EXISTS(SELECT FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=fn::pg_catalog.regprocedure AND a.grantee NOT IN (p.proowner, runtime))
  THEN RAISE EXCEPTION '0065 % ACL postcondition failed',fn; END IF;
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['pathways.p06_complement_cell(jsonb,jsonb)','pathways.p06_release_reach(jsonb)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
    AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.provolatile='i'
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
   OR EXISTS(SELECT FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE p.oid=fn::pg_catalog.regprocedure AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION '0065 helper % postcondition failed',fn; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pathways.role_permissions)::text IS DISTINCT FROM pg_catalog.current_setting('pathways.m0065_grants')
 THEN RAISE EXCEPTION '0065 must not change role_permissions'; END IF;
END $$;
COMMIT;
