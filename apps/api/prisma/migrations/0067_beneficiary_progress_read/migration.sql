-- 0067 beneficiary progress read (cr-pathways-beneficiary-progress-read); forward migration.
-- The beneficiary list progress query ran under RLS and evaluated the per-row p05_has_project_permission policies of
-- participations and journey events inside per-enrollment laterals, which timed out on hosted (503). New
-- pathways.p05_beneficiary_progress(org, project, enrollments) checks scope once (journeys.read and
-- beneficiaries.records.read on the project, plus the activity read the old join needed) and then reads the same columns
-- set-based as the owner. Only enrollments of that organization and project are considered. No table, policy or grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0066_beneficiary_reach_kpi_values'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0067 requires the verified 0066 state and migration identity'; END IF;
 IF to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])') IS NOT NULL
  OR to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
 THEN RAISE EXCEPTION '0067 requires the permission helper and no earlier progress function'; END IF;
 -- The function reads as the table owner, so every source must be prisma-owned and not forced.
 IF EXISTS(SELECT FROM pg_catalog.pg_class c WHERE c.oid IN ('pathways.beneficiary_project_enrollments'::pg_catalog.regclass,
   'pathways.beneficiary_activity_participations'::pg_catalog.regclass,'pathways.beneficiary_journey_events'::pg_catalog.regclass,
   'pathways.journey_stages'::pg_catalog.regclass,'pathways.activity_journey_stage_mappings'::pg_catalog.regclass,
   'pathways.project_activities'::pg_catalog.regclass) AND (pg_catalog.pg_get_userbyid(c.relowner)<>'prisma' OR c.relforcerowsecurity))
 THEN RAISE EXCEPTION '0067 requires prisma-owned, unforced progress source tables'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,3);

CREATE FUNCTION pathways.p05_beneficiary_progress(wanted_org uuid, wanted_project uuid, wanted_enrollments uuid[])
 RETURNS TABLE(enrollment_id uuid, activity_id uuid, activity_title text, participation_date date,
  stage_code text, stage_name text, reached integer, at_terminal boolean, path_length integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  can_activity boolean;
BEGIN
  IF wanted_org IS NULL OR wanted_project IS NULL OR wanted_enrollments IS NULL
     OR wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR cardinality(wanted_enrollments) > 1000
     OR NOT pathways.p05_has_project_permission('journeys.read', wanted_project)
     OR NOT pathways.p05_has_project_permission('beneficiaries.records.read', wanted_project) THEN
    RAISE EXCEPTION 'Beneficiary progress scope unavailable' USING ERRCODE = '42501';
  END IF;
  -- The activity title join was readable only with activities.read or participation.record.
  can_activity := pathways.p05_has_project_permission('activities.read', wanted_project)
    OR pathways.p05_has_project_permission('participation.record', wanted_project);

  RETURN QUERY
  WITH en AS (
    SELECT e.id FROM pathways.beneficiary_project_enrollments e
    WHERE e.organization_id = wanted_org AND e.project_id = wanted_project AND e.id = ANY(wanted_enrollments)
  ), st AS (
    SELECT g.id, g.code, g.name, g.stage_order, g.stage_type, g.is_terminal, g.parent_stage_id
    FROM pathways.journey_stages g
    WHERE g.organization_id = wanted_org AND g.project_id = wanted_project AND g.archived_at IS NULL
  ), pl AS (
    SELECT (count(*) FILTER (WHERE stage_type NOT IN ('BRANCH', 'FOLLOW_UP'))
      + count(DISTINCT parent_stage_id) FILTER (WHERE stage_type = 'BRANCH'))::integer AS n FROM st
  ), ev AS (
    SELECT v.id, v.enrollment_id, v.event_date, v.stage_id FROM pathways.beneficiary_journey_events v
    WHERE v.organization_id = wanted_org AND v.project_id = wanted_project AND v.corrects_event_id IS NULL
      AND v.enrollment_id IN (SELECT id FROM en)
  ), pt AS (
    SELECT x.id, x.enrollment_id, x.activity_id, x.participation_date, x.recorded_at
    FROM pathways.beneficiary_activity_participations x
    WHERE x.organization_id = wanted_org AND x.project_id = wanted_project AND x.enrollment_id IN (SELECT id FROM en)
  ), lp AS (
    SELECT DISTINCT ON (x.enrollment_id) x.enrollment_id, x.activity_id, a.title, x.participation_date
    FROM pt x JOIN pathways.project_activities a ON a.id = x.activity_id
    WHERE can_activity
    ORDER BY x.enrollment_id, x.participation_date DESC, x.recorded_at DESC
  ), cand AS (
    -- Current stage: the terminal stage once reached, else the latest participation mapped to a stage, else the first stage.
    SELECT v.enrollment_id, g.code, g.name, 1 AS pri, v.event_date AS day, v.id::text AS tie, g.stage_order
    FROM ev v JOIN st g ON g.id = v.stage_id AND g.is_terminal
    UNION ALL
    SELECT x.enrollment_id, g.code, g.name, 2, x.participation_date, x.id::text, g.stage_order
    FROM pt x
    JOIN pathways.activity_journey_stage_mappings m ON m.organization_id = wanted_org
      AND m.project_id = wanted_project AND m.activity_id = x.activity_id
    JOIN st g ON g.id = m.stage_id
    UNION ALL
    SELECT en.id, g.code, g.name, 3, NULL::date, g.id::text, g.stage_order FROM en CROSS JOIN st g
  ), cs AS (
    SELECT DISTINCT ON (c.enrollment_id) c.enrollment_id, c.code, c.name
    FROM cand c ORDER BY c.enrollment_id, c.pri, c.day DESC NULLS LAST, c.stage_order, c.tie DESC
  ), rc AS (
    SELECT v.enrollment_id,
      count(DISTINCT v.stage_id) FILTER (WHERE g.stage_type NOT IN ('ENTRY', 'FOLLOW_UP'))::integer AS reached,
      coalesce(bool_or(g.is_terminal), false) AS at_terminal
    FROM ev v JOIN st g ON g.id = v.stage_id GROUP BY v.enrollment_id
  )
  SELECT en.id, lp.activity_id, lp.title::text, lp.participation_date, cs.code::text, cs.name::text,
    coalesce(rc.reached, 0), coalesce(rc.at_terminal, false), pl.n
  FROM en CROSS JOIN pl
  LEFT JOIN lp ON lp.enrollment_id = en.id
  LEFT JOIN cs ON cs.enrollment_id = en.id
  LEFT JOIN rc ON rc.enrollment_id = en.id;
END
$function$;
ALTER FUNCTION pathways.p05_beneficiary_progress(uuid, uuid, uuid[]) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p05_beneficiary_progress(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p05_beneficiary_progress(uuid, uuid, uuid[]) TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])')
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""'])
 THEN RAISE EXCEPTION '0067 function shape postcondition failed'; END IF;
 IF NOT pg_catalog.has_function_privilege('pathways_runtime',to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'),'EXECUTE')
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid=to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])')
   AND a.grantee NOT IN ((SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma'),(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))
  OR pg_catalog.has_function_privilege('anon',to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'),'EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated',to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'),'EXECUTE')
  OR pg_catalog.has_function_privilege('service_role',to_regprocedure('pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'),'EXECUTE')
 THEN RAISE EXCEPTION '0067 grant postcondition failed'; END IF;
END $$;
COMMIT;
