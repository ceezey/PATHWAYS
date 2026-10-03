-- cr-pathways-f9-trusted-aggregates section 10 / gate G-F9-10: closed-period survey release freeze.
-- Aggregate-only roles (Program Manager, Grant Manager) could difference successive open-period survey
-- aggregates. They now receive survey totals only for a closed reporting period, released once from a
-- frozen copy in pathways.survey_period_releases; later calls return the frozen payload and never recompute.
-- Additive: one table (no runtime grant, RLS forced), one internal compute function (not executable by
-- pathways_runtime), one release function, and a behavior-preserving rewrite of p10_f9_survey_aggregate.
-- The frozen payload is the unsuppressed group aggregate; the API applies the single reviewed suppression
-- calculator to it, so a frozen release always yields the same suppressed result. The business calendar is
-- fixed to Asia/Manila, as in p06_saddd, so a caller cannot advance release by choosing a time zone.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' THEN RAISE EXCEPTION '0056 must run as prisma'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_class WHERE relnamespace='pathways'::pg_catalog.regnamespace AND relname='survey_period_releases')
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.pronamespace='pathways'::pg_catalog.regnamespace
   AND p.proname IN ('p10_f9_survey_compute','p10_f9_survey_release'))
 THEN RAISE EXCEPTION '0056 requires its table and functions to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p06_can(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)'::pg_catalog.regprocedure)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.assessment_results'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_indicators'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.projects'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0056 requires prisma ownership of p06_can, p10_f9_survey_aggregate and the source tables'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,2);

CREATE TABLE pathways.survey_period_releases (
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_fingerprint char(64) NOT NULL,
  payload jsonb NOT NULL,
  released_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT survey_period_releases_pkey PRIMARY KEY (organization_id, project_id, period_start, period_end),
  CONSTRAINT survey_period_release_period_check CHECK (period_start <= period_end),
  CONSTRAINT survey_period_release_fingerprint_check CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT survey_period_release_org_fk FOREIGN KEY (organization_id) REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT survey_period_release_project_fk FOREIGN KEY (organization_id, project_id) REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE pathways.survey_period_releases OWNER TO prisma;
REVOKE ALL ON TABLE pathways.survey_period_releases FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
ALTER TABLE pathways.survey_period_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.survey_period_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY survey_period_release_owner_select ON pathways.survey_period_releases FOR SELECT TO prisma
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY survey_period_release_owner_insert ON pathways.survey_period_releases FOR INSERT TO prisma
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- Internal computation with no permission check: the period rules and the paired pre/post aggregate
-- moved verbatim from p10_f9_survey_aggregate (0045). Callers must check scope first.
CREATE FUNCTION pathways.p10_f9_survey_compute(wanted_org uuid, wanted_project uuid, start_on date, end_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF start_on IS NULL OR end_on IS NULL THEN
    RAISE EXCEPTION 'A complete reporting period is required' USING ERRCODE='22023';
  END IF;
  -- Defined-period rule: exactly one defined, non-overlapping reporting period of the project.
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
ALTER FUNCTION pathways.p10_f9_survey_compute(uuid, uuid, date, date) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_survey_compute(uuid, uuid, date, date)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

-- Unchanged contract: detail roles still compute live; only the body now delegates.
CREATE OR REPLACE FUNCTION pathways.p10_f9_survey_aggregate(wanted_org uuid, wanted_project uuid, start_on date, end_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
     OR NOT pathways.p06_can('assessments.detail.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;
  RETURN pathways.p10_f9_survey_compute(wanted_org, wanted_project, start_on, end_on);
END
$function$;
ALTER FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p10_f9_survey_aggregate(uuid, uuid, date, date) TO pathways_runtime;

-- Closed-period release for aggregate-only roles: assessments.detail.read is deliberately not required.
-- The first caller after the period closes freezes the aggregate; every later call returns that copy.
CREATE FUNCTION pathways.p10_f9_survey_release(wanted_org uuid, wanted_project uuid, start_on date, end_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  frozen pathways.survey_period_releases%ROWTYPE;
  computed jsonb;
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
  -- The defined-period rules run first so an undefined range is refused before anything is frozen.
  computed := pathways.p10_f9_survey_compute(wanted_org, wanted_project, start_on, end_on);
  IF end_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Survey release requires a closed reporting period' USING ERRCODE='22023';
  END IF;

  SELECT * INTO frozen FROM pathways.survey_period_releases r
  WHERE r.organization_id = wanted_org AND r.project_id = wanted_project
    AND r.period_start = start_on AND r.period_end = end_on;
  IF NOT FOUND THEN
    INSERT INTO pathways.survey_period_releases(organization_id, project_id, period_start, period_end, source_fingerprint, payload)
    VALUES (wanted_org, wanted_project, start_on, end_on,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(computed::text, 'UTF8')), 'hex'), computed)
    ON CONFLICT DO NOTHING;
    SELECT * INTO frozen FROM pathways.survey_period_releases r
    WHERE r.organization_id = wanted_org AND r.project_id = wanted_project
      AND r.period_start = start_on AND r.period_end = end_on;
  END IF;
  RETURN frozen.payload || jsonb_build_object('releaseState', 'FROZEN', 'releasedAt', frozen.released_at);
END
$function$;
ALTER FUNCTION pathways.p10_f9_survey_release(uuid, uuid, date, date) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_survey_release(uuid, uuid, date, date)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p10_f9_survey_release(uuid, uuid, date, date) TO pathways_runtime;

-- Postconditions: exact owner, definer mode, empty search_path, ACL, and no runtime table access.
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['pathways.p10_f9_survey_aggregate(uuid,uuid,date,date)',
   'pathways.p10_f9_survey_compute(uuid,uuid,date,date)','pathways.p10_f9_survey_release(uuid,uuid,date,date)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
  THEN RAISE EXCEPTION '0056 % owner/security/search_path postcondition failed',fn; END IF;
  IF EXISTS(SELECT FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=fn::pg_catalog.regprocedure
   AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))
  OR has_function_privilege('pathways_runtime',fn,'EXECUTE') IS DISTINCT FROM (fn NOT LIKE '%compute%')
  OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
   WHERE has_function_privilege(r.name,fn,'EXECUTE'))
  THEN RAISE EXCEPTION '0056 % ACL postcondition failed',fn; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_class c WHERE c.oid='pathways.survey_period_releases'::pg_catalog.regclass
   AND pg_catalog.pg_get_userbyid(c.relowner)='prisma' AND c.relrowsecurity AND c.relforcerowsecurity)
  OR EXISTS(SELECT FROM (VALUES('pathways_runtime'),('anon'),('authenticated'),('service_role')) r(name)
   WHERE has_table_privilege(r.name,'pathways.survey_period_releases','SELECT,INSERT,UPDATE,DELETE'))
  OR EXISTS(SELECT FROM pg_catalog.pg_class c
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
   WHERE c.oid='pathways.survey_period_releases'::pg_catalog.regclass AND a.grantee<>c.relowner)
 THEN RAISE EXCEPTION '0056 survey_period_releases owner/RLS/ACL postcondition failed'; END IF;
END $$;
COMMIT;
