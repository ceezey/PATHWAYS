-- cr-pathways-rbac-v4-grant-migration: RBAC v4 cells V4-C01, C02, C06, C07, C09 and C10.
-- CREATE OR REPLACE keeps the p09_role_allows ACL restored by 0054; the body wraps the 0051 matrix.
-- PO keeps beneficiaries.aggregates.read (re-sourced to v4 rows 112-117) and submissions.write (V4-C11 scoped in the API).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0054_p09_role_allows_grants'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0055 requires the verified 0054 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,5);

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1 IN ('PROGRAM_MANAGER','GRANT_MANAGER') AND $2='activities.read')
  OR (NOT (($1='PROGRAM_MANAGER' AND $2='projects.archive')
   OR ($1='GRANT_MANAGER' AND $2='projects.archive')
   OR ($1='SYSTEM_ADMINISTRATOR' AND $2='budgets.read')
   OR ($1='PROJECT_OFFICER' AND $2='activities.create')
   OR ($1='PROJECT_OFFICER' AND $2='dashboards.customize')
   OR ($1='PROJECT_OFFICER' AND $2='assessments.read')
   OR ($1='PROJECT_OFFICER' AND $2='analytics.saddd.read'))
  AND (($1 IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
    AND $2 IN ('indicators.library.read','indicators.library.create','indicators.library.archive'))
   OR pathways.p09_role_allows_0048($1,$2)))
$matrix$;

DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND (r.code,p.code) IN (
 ('PROGRAM_MANAGER','projects.archive'),('GRANT_MANAGER','projects.archive'),('SYSTEM_ADMINISTRATOR','budgets.read'),
 ('PROJECT_OFFICER','activities.create'),('PROJECT_OFFICER','dashboards.customize'),
 ('PROJECT_OFFICER','assessments.read'),('PROJECT_OFFICER','analytics.saddd.read'));

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='activities.read'
WHERE r.code IN ('PROGRAM_MANAGER','GRANT_MANAGER')
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ BEGIN
 IF pathways.p09_role_allows('PROJECT_OFFICER','activities.create')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.read')
 OR pathways.p09_role_allows('GRANT_MANAGER','projects.archive')
 OR NOT pathways.p09_role_allows('PROGRAM_MANAGER','activities.read')
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','activities.create')
 OR NOT pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.aggregates.read')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 OR NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 OR (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM pg_catalog.pg_proc w, unnest(w.proacl) x
   WHERE w.oid='pathways.p09_role_allows(text,text)'::pg_catalog.regprocedure)
  IS DISTINCT FROM (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM pg_catalog.pg_proc s, unnest(s.proacl) x
   WHERE s.oid='pathways.p09_role_allows_0035(text,text)'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0055 verification failed'; END IF;
END $$;
COMMIT;
