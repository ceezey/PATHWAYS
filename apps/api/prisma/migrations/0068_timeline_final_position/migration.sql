-- 0068 timeline final position (fix/timeline-final-position); additive forward migration.
-- Adds pathways.p10_f9_timeline_last_completion, one aggregate date (the latest actual end date of a completed activity,
-- no row or identifier), so a completed project can report its final position. p10_f9_timeline_aggregate is untouched,
-- so the migration is safe whichever API deployment is live; no table, policy or existing grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0067_beneficiary_progress_read'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0068 requires the verified 0067 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways' AND p.proname='p10_f9_timeline_last_completion')
 THEN RAISE EXCEPTION '0068 requires the function to not already exist'; END IF;
 IF to_regprocedure('pathways.p06_can(text,uuid)') IS NULL
  OR pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc
   WHERE oid='pathways.p06_can(text,uuid)'::pg_catalog.regprocedure))<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0068 requires prisma ownership of p06_can and project_activities'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,4);

CREATE FUNCTION pathways.p10_f9_timeline_last_completion(wanted_org uuid, wanted_project uuid)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result date;
BEGIN
  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id', true), '')::uuid
     OR NOT pathways.p06_can('analytics.descriptive.read', wanted_project)
     OR NOT pathways.p06_can('monitoring.read', wanted_project)
  THEN
    RAISE EXCEPTION 'Analytics scope unavailable' USING ERRCODE='42501';
  END IF;

  SELECT max(a.actual_end_date) INTO result
  FROM pathways.project_activities a
  WHERE a.organization_id = wanted_org
    AND a.project_id = wanted_project
    AND a.archived_at IS NULL
    AND a.status <> 'CANCELLED'
    AND a.status = 'COMPLETED'
    AND a.actual_end_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31';
  RETURN result;
END
$function$;
ALTER FUNCTION pathways.p10_f9_timeline_last_completion(uuid, uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p10_f9_timeline_last_completion(uuid, uuid)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p10_f9_timeline_last_completion(uuid, uuid) TO pathways_runtime;

-- Postconditions: exact owner, definer mode, empty search_path, and ACL (runtime only).
DO $$ DECLARE fn constant text := 'pathways.p10_f9_timeline_last_completion(uuid,uuid)'; BEGIN
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
