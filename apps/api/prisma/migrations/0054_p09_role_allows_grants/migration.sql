-- 0054 p09_role_allows grants; forward fix (developer decision 2026-10-01).
-- 0047 and 0051 rename and recreate pathways.p09_role_allows, and 0048 recreates it, so the live
-- function and p09_role_allows_0048 carried only the owner ACL while the runtime and the rules owner
-- roles hold EXECUTE on p09_role_allows_0035 (42501 on outcome recording). This restores both ACLs
-- to exactly the non-owner grantees of _0035, without grant option. prisma owns all three
-- functions, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0053_expense_submit_race'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0054 requires the verified 0053 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,4);

REVOKE ALL ON FUNCTION pathways.p09_role_allows_0048(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION pathways.p09_role_allows(text,text) FROM PUBLIC, anon, authenticated, service_role;

DO $$ DECLARE g oid; BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
  WHERE p.oid='pathways.p09_role_allows_0035(text,text)'::pg_catalog.regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner
 LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION pathways.p09_role_allows_0048(text,text) TO %I',pg_catalog.pg_get_userbyid(g));
  EXECUTE format('GRANT EXECUTE ON FUNCTION pathways.p09_role_allows(text,text) TO %I',pg_catalog.pg_get_userbyid(g));
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc w, pg_catalog.pg_proc s
  WHERE s.oid='pathways.p09_role_allows_0035(text,text)'::pg_catalog.regprocedure
  AND w.oid IN('pathways.p09_role_allows_0048(text,text)'::pg_catalog.regprocedure,'pathways.p09_role_allows(text,text)'::pg_catalog.regprocedure)
  AND (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM unnest(w.proacl) x)
   IS DISTINCT FROM (SELECT coalesce(array_agg(x::text ORDER BY x::text),'{}') FROM unnest(s.proacl) x))
 THEN RAISE EXCEPTION '0054 p09_role_allows ACLs do not match p09_role_allows_0035'; END IF;
END $$;
COMMIT;
