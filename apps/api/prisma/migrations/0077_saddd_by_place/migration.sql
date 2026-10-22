-- 0077 SADDD reach by place (cr-pathways-map-reach-per-pin); forward migration.
-- p06_saddd_by_place releases a project's SADDD population to date, the same individuals p06_compute_saddd counts,
-- grouped by each Beneficiary's recorded city or municipality and province with exact sex and with-disability counts, so the coverage map can show the
-- reach of one pin. Same gates as p06_saddd (organization context, analytics.saddd.read and
-- beneficiaries.aggregates.read on the project, Asia/Manila business calendar); a project that has not started returns
-- an empty array. Counts are live to date and never frozen in the release registry. Owned by prisma, which owns every
-- source table; execute is granted to pathways_runtime only. No table, policy, role or permission changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0076_saddd_exact_counts'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0077 requires the verified 0076 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR pg_catalog.to_regprocedure('pathways.p06_saddd_by_place(uuid,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION '0077 requires prisma to own pathways and no earlier p06_saddd_by_place'; END IF;
END $$;

CREATE FUNCTION pathways.p06_saddd_by_place(wanted_org uuid, wanted_project uuid, zone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  project_start date;
  project_end date;
  business_today date;
  period_end date;
  result jsonb;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.saddd.read', wanted_project)
     OR NOT pathways.p06_can('beneficiaries.aggregates.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;
  IF zone IS DISTINCT FROM 'Asia/Manila' THEN
    RAISE EXCEPTION 'SADDD V1 business time zone unavailable' USING ERRCODE='22023';
  END IF;
  SELECT p.start_date, p.end_date INTO project_start, project_end
  FROM pathways.projects p
  WHERE p.organization_id=wanted_org AND p.id=wanted_project AND p.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monitoring scope unavailable' USING ERRCODE='42501';
  END IF;
  business_today := (CURRENT_TIMESTAMP AT TIME ZONE zone)::date;
  IF project_start IS NULL OR project_end IS NULL OR project_end < project_start OR project_start > business_today THEN
    RETURN '[]'::jsonb;
  END IF;
  period_end := least(project_end, business_today);
  PERFORM pathways.p06_assert_scope(wanted_org, ARRAY[wanted_project], 'analytics.saddd.read', project_start, project_start, zone);
  PERFORM pathways.p06_assert_scope(wanted_org, ARRAY[wanted_project], 'beneficiaries.aggregates.read', project_start, project_start, zone);
  -- The p06_compute_saddd population and eligibility, keyed by the recorded city or municipality and province.
  WITH population AS MATERIALIZED (
    SELECT DISTINCT ben.id, ben.sex::text AS sex, ben.disability_status::text AS disability, nullif(btrim(ben.location_city_municipality), '') AS town,
      nullif(btrim(ben.location_province), '') AS province,
      CASE WHEN ben.birth_date>business_today THEN NULL ELSE pathways.p06_age_band(ben.birth_date, period_end) END AS age
    FROM pathways.beneficiary_project_enrollments e
    JOIN pathways.beneficiaries ben ON ben.organization_id=e.organization_id AND ben.id=e.beneficiary_id
    WHERE e.organization_id=wanted_org AND e.project_id=wanted_project
      AND e.enrollment_date<=period_end AND (e.ended_date IS NULL OR e.ended_date>=project_start)
      AND ben.subject_type='INDIVIDUAL' AND ben.archived_at IS NULL AND NOT ben.is_dummy_record
  ), eligible AS MATERIALIZED (SELECT * FROM population WHERE age IS NOT NULL)
  SELECT coalesce(jsonb_agg(jsonb_build_object('town', t.town, 'province', t.province, 'total', t.total, 'disability', t.disability, 'sex', t.sex)
    ORDER BY t.town NULLS LAST, t.province NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT p.town, p.province, count(*) AS total, count(*) FILTER (WHERE p.disability='WITH_DISABILITY') AS disability,
      (SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label,
         'n', (SELECT count(*) FROM eligible q WHERE q.town IS NOT DISTINCT FROM p.town
           AND q.province IS NOT DISTINCT FROM p.province AND q.sex=v.key)) ORDER BY v.ord)
       FROM (VALUES ('MALE','Male',1),('FEMALE','Female',2),('OTHER','Other',3),('PREFER_NOT_TO_SAY','Prefer not to say',4),
         ('NOT_SPECIFIED','Unknown',5)) v(key,label,ord)) AS sex
    FROM eligible p
    GROUP BY p.town, p.province
    LIMIT 200
  ) t;
  RETURN result;
END
$function$;
ALTER FUNCTION pathways.p06_saddd_by_place(uuid, uuid, text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p06_saddd_by_place(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p06_saddd_by_place(uuid, uuid, text) TO pathways_runtime;

-- Postconditions: owner, definer mode, volatility, empty search_path and runtime-only execute.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p06_saddd_by_place(uuid,uuid,text)'::pg_catalog.regprocedure;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR NOT fn.prosecdef OR fn.provolatile<>'s'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR NOT pg_catalog.has_function_privilege('pathways_runtime', fn.oid, 'EXECUTE')
  OR pg_catalog.has_function_privilege('anon', fn.oid, 'EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated', fn.oid, 'EXECUTE')
 THEN RAISE EXCEPTION '0077 p06_saddd_by_place postcondition failed'; END IF;
END $$;
COMMIT;
