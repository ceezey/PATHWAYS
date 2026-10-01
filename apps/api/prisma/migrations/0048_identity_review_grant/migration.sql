-- cr-pathways-core-rbac-identity-review: grant beneficiaries.identities.review to M&E Officer.
-- Extends the 0047 matrix wrapper; no business data changes. Not applied by CI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0047_revoke_sa_journeys_read' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0048 requires the verified 0047 state'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1='MONITORING_AND_EVALUATION_OFFICER' AND $2='beneficiaries.identities.review')
  OR (NOT ($1='SYSTEM_ADMINISTRATOR' AND $2='journeys.read') AND pathways.p09_role_allows_0035($1,$2))
$matrix$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='beneficiaries.identities.review'
WHERE r.code='MONITORING_AND_EVALUATION_OFFICER'
ON CONFLICT(role_id,permission_id) DO NOTHING;

DO $$ BEGIN
 IF NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.identities.review')
 OR pathways.p09_role_allows('PROJECT_OFFICER','beneficiaries.identities.review')
 OR pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 THEN RAISE EXCEPTION '0048 verification failed'; END IF;
 IF EXISTS((SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::regprocedure) UNION ALL (SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure))
 THEN RAISE EXCEPTION 'p09_role_allows grants differ from the previous function'; END IF;
END $$;
COMMIT;
