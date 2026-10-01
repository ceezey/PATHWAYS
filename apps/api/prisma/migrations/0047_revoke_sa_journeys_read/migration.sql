-- cr-pathways-core-rbac-identity-review: System Administrator loses journeys.read (aggregate-only role).
-- Denies the grant in the 0035 matrix and keeps project-level stage reads on journeys.manage.
-- Beneficiary events and participations stay on journeys.read. No business data changes. Not applied by CI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0046_signin_lockout' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0047 requires the verified 0046 state'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

ALTER FUNCTION pathways.p09_role_allows(text,text) RENAME TO p09_role_allows_0035;
CREATE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT NOT ($1='SYSTEM_ADMINISTRATOR' AND $2='journeys.read') AND pathways.p09_role_allows_0035($1,$2)
$matrix$;

-- Carry the EXECUTE grants of the renamed function over so the rules owners keep access.
DO $$ DECLARE g oid; BEGIN
 REVOKE ALL ON FUNCTION pathways.p09_role_allows(text,text) FROM PUBLIC,anon,authenticated,service_role;
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p,aclexplode(p.proacl) a
  WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::regprocedure AND a.grantee NOT IN (0,p.proowner) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION pathways.p09_role_allows(text,text) TO %I',(SELECT rolname FROM pg_roles WHERE oid=g));
 END LOOP;
END $$;

DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='SYSTEM_ADMINISTRATOR' AND p.code='journeys.read';

DROP POLICY p05_stage_select ON pathways.journey_stages;
CREATE POLICY p05_stage_select ON pathways.journey_stages FOR SELECT TO pathways_runtime
USING(organization_id=(SELECT pathways.runtime_context_organization())
 AND ((SELECT pathways.p05_has_project_permission('journeys.read',project_id))
  OR (SELECT pathways.p05_has_project_permission('journeys.manage',project_id))
  OR (SELECT pathways.p05_has_project_permission('participation.record',project_id))));
DROP POLICY p05_mapping_select ON pathways.activity_journey_stage_mappings;
CREATE POLICY p05_mapping_select ON pathways.activity_journey_stage_mappings FOR SELECT TO pathways_runtime
USING(organization_id=(SELECT pathways.runtime_context_organization())
 AND ((SELECT pathways.p05_has_project_permission('journeys.read',project_id))
  OR (SELECT pathways.p05_has_project_permission('journeys.manage',project_id))));

DO $$ BEGIN
 IF pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.read')
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','journeys.read')
 OR NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','journeys.manage')
 THEN RAISE EXCEPTION '0047 verification failed'; END IF;
 IF EXISTS((SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::regprocedure) UNION ALL (SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::regprocedure EXCEPT SELECT a.grantee,a.privilege_type FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pathways.p09_role_allows(text,text)'::regprocedure))
 THEN RAISE EXCEPTION 'p09_role_allows grants differ from the previous function'; END IF;
END $$;
COMMIT;
