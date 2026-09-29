-- cr-pathways-f9-trusted-aggregates: trusted F9 survey improvement and timeline adherence
-- aggregates for aggregate-only roles (Program Manager, Grant Manager) that hold
-- analytics.descriptive.read and monitoring.read but not assessments.detail.read or
-- activities.read. Adds two prisma-owned SECURITY DEFINER functions only (no table, column,
-- policy or grant change), following the pathways.p06_saddd guard pattern from
-- 0028_revised_aggregate_permission_guards.
--
-- Both functions raise 42501 unless wanted_org equals app.organization_id and the session user
-- holds BOTH analytics.descriptive.read AND monitoring.read on wanted_project through
-- pathways.p06_can. They read only the requested organization and project and return group
-- aggregates (counts and sums) only: never a row, enrollment, Beneficiary or assessment
-- identifier. Suppression is intentionally NOT applied here: the API process passes the
-- unsuppressed aggregate through the single reviewed TypeScript suppression implementation
-- before anything reaches a client or CSV (differs from p06_saddd by design).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0044_activity_progress_review'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0045 requires the verified 0044 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways' AND p.proname IN ('p10_f9_survey_aggregate','p10_f9_timeline_aggregate'))
 THEN RAISE EXCEPTION '0045 requires the functions to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_can(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.assessment_results'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_milestones'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0045 requires prisma ownership of p06_can and the source tables'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- Paired pre/post survey improvement, one group per activity plus one no-activity group
-- (activityId null). Each enrollment's latest valid PRE_TEST (assessment_date DESC, id DESC) is
-- paired with its latest valid POST_TEST inside the period. A valid score is non-null, not NaN,
-- with a maximum score above zero. Scores normalize to score / maximum_score * 100 in float8, the
-- same arithmetic the TypeScript calculator used. A pair joins the group of the POST_TEST
-- activity, falling back to the PRE_TEST activity. excludedRecords counts every PRE_TEST/POST_TEST
-- row in the period that is not valid.
CREATE FUNCTION pathways.p10_f9_survey_aggregate(wanted_org uuid, wanted_project uuid, start_on date, end_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;

  IF start_on IS NULL OR end_on IS NULL THEN
    RAISE EXCEPTION 'A complete reporting period is required' USING ERRCODE='22023';
  END IF;
  -- Defined-period rule (cr-pathways-f9-trusted-aggregates, amendment 2026-09-29): results are
  -- released only for exactly one of the project's defined reporting periods, so adjacent or
  -- arbitrary custom ranges cannot be differenced to recover one person's scores. Defined periods
  -- are the distinct (period_start, period_end) pairs of the project's non-archived, reviewed
  -- (measurement_mode set) Indicator definitions that overlap the project dates, the same set the
  -- dashboard period picker offers. The requested range must match one exactly and must not
  -- overlap any other defined period of the project.
  IF NOT EXISTS (
       SELECT FROM pathways.project_indicators i
       JOIN pathways.projects pr ON pr.organization_id = i.organization_id AND pr.id = i.project_id
       WHERE i.organization_id = wanted_org AND i.project_id = wanted_project
         AND i.archived_at IS NULL AND i.measurement_mode IS NOT NULL
         AND i.period_start = start_on AND i.period_end = end_on AND i.period_start <= i.period_end
         AND (pr.start_date IS NULL OR pr.end_date IS NULL
              OR (i.period_end >= pr.start_date AND i.period_start <= pr.end_date)))
  THEN
    RAISE EXCEPTION 'Survey results require a defined reporting period' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
       SELECT FROM pathways.project_indicators i
       JOIN pathways.projects pr ON pr.organization_id = i.organization_id AND pr.id = i.project_id
       WHERE i.organization_id = wanted_org AND i.project_id = wanted_project
         AND i.archived_at IS NULL AND i.measurement_mode IS NOT NULL
         AND i.period_start IS NOT NULL AND i.period_end IS NOT NULL AND i.period_start <= i.period_end
         AND (i.period_start, i.period_end) <> (start_on, end_on)
         AND i.period_start <= end_on AND i.period_end >= start_on
         AND (pr.start_date IS NULL OR pr.end_date IS NULL
              OR (i.period_end >= pr.start_date AND i.period_start <= pr.end_date)))
  THEN
    RAISE EXCEPTION 'Survey results are unavailable for overlapping reporting periods' USING ERRCODE='22023';
  END IF;

  WITH scoped AS (
    SELECT
      ar.id,
      ar.type,
      ar.enrollment_id,
      ar.activity_id,
      ar.assessment_date,
      ar.score,
      ar.maximum_score,
      (ar.score IS NOT NULL
        AND ar.maximum_score IS NOT NULL
        AND ar.score <> 'NaN'::numeric
        AND ar.maximum_score <> 'NaN'::numeric
        AND ar.maximum_score > 0) AS is_valid
    FROM pathways.assessment_results ar
    WHERE ar.organization_id = wanted_org
      AND ar.project_id = wanted_project
      AND ar.type IN ('PRE_TEST', 'POST_TEST')
      AND ar.assessment_date >= start_on
      AND ar.assessment_date <= end_on
  ),
  latest AS (
    SELECT DISTINCT ON (s.enrollment_id, s.type)
      s.enrollment_id,
      s.type,
      s.activity_id,
      (s.score::float8 / s.maximum_score::float8) * 100 AS normalized
    FROM scoped s
    WHERE s.is_valid AND s.enrollment_id IS NOT NULL
    ORDER BY s.enrollment_id, s.type, s.assessment_date DESC, s.id DESC
  ),
  pairs AS (
    SELECT
      coalesce(post.activity_id, pre.activity_id) AS activity_id,
      pre.normalized AS pre_normalized,
      post.normalized AS post_normalized
    FROM latest pre
    JOIN latest post
      ON post.enrollment_id = pre.enrollment_id
     AND pre.type = 'PRE_TEST'
     AND post.type = 'POST_TEST'
  ),
  groups AS (
    SELECT
      p.activity_id,
      count(*) AS pair_count,
      sum(p.pre_normalized) AS sum_pre,
      sum(p.post_normalized) AS sum_post,
      count(*) FILTER (WHERE p.post_normalized - p.pre_normalized > 0) AS improved,
      count(*) FILTER (WHERE p.post_normalized - p.pre_normalized = 0) AS same,
      count(*) FILTER (WHERE p.post_normalized - p.pre_normalized < 0) AS declined
    FROM pairs p
    GROUP BY p.activity_id
  )
  SELECT jsonb_build_object(
    'excludedRecords', (SELECT count(*) FROM scoped WHERE NOT is_valid),
    'groups', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'activityId', g.activity_id,
          'pairs', g.pair_count,
          'sumPre', g.sum_pre,
          'sumPost', g.sum_post,
          'improved', g.improved,
          'same', g.same,
          'declined', g.declined
        )
        ORDER BY g.activity_id NULLS LAST
      )
      FROM groups g
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END
$function$;
ALTER FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date) TO pathways_runtime;

-- Timeline adherence counts. Activities mirror the rule engine's activityObservation population:
-- non-archived, non-cancelled ("eligible"). A non-completed activity is overdue when its planned
-- end date is a valid calendar date (1900-01-01 to 2100-12-31) strictly before reporting_on; a
-- non-completed activity with a null or out-of-range planned end date is counted as missingDates
-- (the rule engine reports MISSING_DATES when any exists). maxOverdueDays is the largest
-- (reporting_on - planned_end_date) over non-completed activities, floored at zero (null when
-- there is no eligible activity). Milestones (non-archived): completed, completed with both a
-- target and completion date (rated), and rated ones finished on or before their target.
CREATE FUNCTION pathways.p10_f9_timeline_aggregate(wanted_org uuid, wanted_project uuid, reporting_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;
  IF reporting_on IS NULL THEN
    RAISE EXCEPTION 'A reporting date is required' USING ERRCODE='22023';
  END IF;

  SELECT jsonb_build_object(
    'activities', (
      SELECT jsonb_build_object(
        'eligible', count(*),
        'completed', count(*) FILTER (WHERE a.status = 'COMPLETED'),
        'overdue', count(*) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND a.planned_end_date >= DATE '1900-01-01'
            AND a.planned_end_date <= DATE '2100-12-31'
            AND reporting_on > a.planned_end_date),
        'missingDates', count(*) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND (a.planned_end_date IS NULL
              OR a.planned_end_date < DATE '1900-01-01'
              OR a.planned_end_date > DATE '2100-12-31')),
        'maxOverdueDays', max(greatest(0, reporting_on - a.planned_end_date)) FILTER (
          WHERE a.status <> 'COMPLETED'
            AND a.planned_end_date >= DATE '1900-01-01'
            AND a.planned_end_date <= DATE '2100-12-31')
      )
      FROM pathways.project_activities a
      WHERE a.organization_id = wanted_org
        AND a.project_id = wanted_project
        AND a.archived_at IS NULL
        AND a.status <> 'CANCELLED'
    ),
    'milestones', (
      SELECT jsonb_build_object(
        'completed', count(*) FILTER (WHERE m.status = 'COMPLETED'),
        'rated', count(*) FILTER (
          WHERE m.status = 'COMPLETED' AND m.target_date IS NOT NULL AND m.completion_date IS NOT NULL),
        'onTime', count(*) FILTER (
          WHERE m.status = 'COMPLETED' AND m.target_date IS NOT NULL AND m.completion_date IS NOT NULL
            AND m.completion_date <= m.target_date)
      )
      FROM pathways.project_milestones m
      WHERE m.organization_id = wanted_org
        AND m.project_id = wanted_project
        AND m.archived_at IS NULL
    )
  ) INTO result;
  RETURN result;
END
$function$;
ALTER FUNCTION pathways.p10_f9_timeline_aggregate(uuid, uuid, date) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_timeline_aggregate(uuid, uuid, date)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p10_f9_timeline_aggregate(uuid, uuid, date) TO pathways_runtime;

-- Postconditions: exact owner, definer mode, empty search_path, and ACL (runtime only).
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)',
   'pathways.p10_f9_timeline_aggregate(uuid,uuid,date)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
  THEN RAISE EXCEPTION '0045 % owner/security/search_path postcondition failed',fn; END IF;
  IF EXISTS(SELECT FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=fn::pg_catalog.regprocedure
   AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))
  OR NOT has_function_privilege('pathways_runtime',fn,'EXECUTE')
  OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
   WHERE has_function_privilege(r.name,fn,'EXECUTE'))
  THEN RAISE EXCEPTION '0045 % ACL postcondition failed',fn; END IF;
 END LOOP;
END $$;
COMMIT;
