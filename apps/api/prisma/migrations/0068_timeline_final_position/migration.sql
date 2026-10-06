-- 0068 timeline final position (fix/timeline-final-position); forward migration.
-- pathways.p10_f9_timeline_aggregate also returns activities.lastCompletedOn, the latest actual end date of a completed
-- activity (one aggregate date, no row or identifier), so a completed project can report its final position without
-- the service reading activity rows. Signature, owner, security posture and ACL are unchanged; no table, policy or grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0067_beneficiary_progress_read'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0068 requires the verified 0067 state and migration identity'; END IF;
 IF to_regprocedure('pathways.p10_f9_timeline_aggregate(uuid,uuid,date)') IS NULL
  OR pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc
   WHERE oid='pathways.p10_f9_timeline_aggregate(uuid,uuid,date)'::pg_catalog.regprocedure))<>'prisma'
 THEN RAISE EXCEPTION '0068 requires the prisma-owned timeline aggregate'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,4);

CREATE OR REPLACE FUNCTION pathways.p10_f9_timeline_aggregate(wanted_org uuid, wanted_project uuid, reporting_on date)
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
            AND a.planned_end_date <= DATE '2100-12-31'),
        'lastCompletedOn', max(a.actual_end_date) FILTER (
          WHERE a.status = 'COMPLETED'
            AND a.actual_end_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')
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
DO $$ DECLARE fn constant text := 'pathways.p10_f9_timeline_aggregate(uuid,uuid,date)'; BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=fn::pg_catalog.regprocedure
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
  AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])
 THEN RAISE EXCEPTION '0068 owner/security/search_path postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE p.oid=fn::pg_catalog.regprocedure
  AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))
  OR NOT has_function_privilege('pathways_runtime',fn,'EXECUTE')
  OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
   WHERE has_function_privilege(r.name,fn,'EXECUTE'))
 THEN RAISE EXCEPTION '0068 ACL postcondition failed'; END IF;
END $$;
COMMIT;
