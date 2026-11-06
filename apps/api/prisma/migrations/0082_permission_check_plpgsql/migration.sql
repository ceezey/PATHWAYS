-- 0082 permission check plpgsql (cr-pathways-import-call-time-batch-size); forward migration.
-- p05_has_project_permission and the p09_role_allows chain are LANGUAGE sql with SET search_path (p05 also SECURITY DEFINER),
-- so Postgres 17 cannot inline them and plans them again for every calling statement. Row policies and guard triggers call
-- p05 about 333 times per imported registration row, which made 87% of import processing time.
-- Each body becomes the same expression inside BEGIN RETURN (...); END, so PL/pgSQL keeps its plan per connection.
-- The reviewed bodies are pinned by md5 before and after; the role-by-permission answers are compared across the swap.
-- Owner, security mode, volatility, search_path, parallel safety, strictness, cost and ACL stay unchanged (asserted below).
-- No table, policy, trigger or grant changes, and no temporary objects (the replay prisma role has no TEMPORARY privilege).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE
 names CONSTANT text[] := ARRAY['p05_has_project_permission','p09_role_allows','p09_role_allows_0048','p09_role_allows_0035'];
 volatilities CONSTANT "char"[] := ARRAY['s','i','i','i'];
 definers CONSTANT boolean[] := ARRAY[true,false,false,false];
 sql_md5s CONSTANT text[] := ARRAY['2d88855630e39939d6f4a8375484c226','cb4f88c991eb573eb12ff5fd4d6f7b14',
  '3c6f26ff94154d00eeb187454c64b11b','9ec796d54cbcc2c9ba2a1f61be8fbd0b'];
 plpgsql_md5s CONSTANT text[] := ARRAY['47faa93427caddc28f8d1dd895a5222d','353c4c12fcb3cb69acd36b36cecba8cc',
  '5a25f26409221c0e28c6bced6e88f4e0','9b03af307abc6a71ed35b678564b638f'];
 -- Every role and permission code, plus unknown ones, through each role function.
 answers_sql CONSTANT text := $q$
  SELECT pg_catalog.md5(pg_catalog.string_agg(r.code||'/'||p.code||'='||pathways.p09_role_allows(r.code,p.code)
    ||pathways.p09_role_allows_0048(r.code,p.code)||pathways.p09_role_allows_0035(r.code,p.code),',' ORDER BY r.code,p.code))
  FROM (SELECT code FROM pathways.roles UNION SELECT 'UNKNOWN_ROLE') r
  CROSS JOIN (SELECT code FROM pathways.permissions UNION SELECT 'unknown.permission') p$q$;
 acl_sql CONSTANT text := $q$
  SELECT pg_catalog.string_agg(p.proname||'='||coalesce(p.proacl::text,''),';' ORDER BY p.proname)
  FROM pg_catalog.pg_proc p WHERE p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname=ANY($1)$q$;
 answers_before text; acl_before text; answers_after text; acl_after text; fn record;
BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0081_submission_check_once'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0082 requires the verified 0081 state and migration identity'; END IF;
 -- Only the reviewed SQL bodies, or this migration's own on a rerun, may be replaced.
 IF (SELECT count(*) FROM unnest(names,volatilities,definers,sql_md5s,plpgsql_md5s) w(name,volatility,definer,sql_md5,plpgsql_md5)
   JOIN pg_catalog.pg_proc p ON p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname=w.name
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.definer AND p.provolatile=w.volatility
    AND p.prorettype='pg_catalog.bool'::pg_catalog.regtype AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
    AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.procost=100
    AND pg_catalog.md5(p.prosrc) IN (w.sql_md5,w.plpgsql_md5))<>4
  OR (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname=ANY(names))<>4
 THEN RAISE EXCEPTION '0082 requires the reviewed permission check definitions'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(505005,1);
 EXECUTE answers_sql INTO answers_before;
 EXECUTE acl_sql INTO acl_before USING names;

 FOR fn IN SELECT p.oid, p.proname, p.prosrc, w.volatility, w.definer
   FROM unnest(names,volatilities,definers,sql_md5s) w(name,volatility,definer,sql_md5)
   JOIN pg_catalog.pg_proc p ON p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname=w.name
   WHERE pg_catalog.md5(p.prosrc)=w.sql_md5 LOOP
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION pathways.%I(%s) RETURNS boolean LANGUAGE plpgsql %s %s SET search_path=%L AS %L',
   fn.proname, pg_catalog.pg_get_function_arguments(fn.oid), CASE fn.volatility WHEN 'i' THEN 'IMMUTABLE' ELSE 'STABLE' END,
   CASE WHEN fn.definer THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, '',
   'BEGIN RETURN (' || pg_catalog.regexp_replace(fn.prosrc, '^\s*SELECT\s', '') || '); END');
 END LOOP;

 -- Postconditions: the expected PL/pgSQL bodies, every attribute and ACL kept, the same answers for every role and permission,
 -- and p05 executes (PL/pgSQL resolves names on first use, so a resolution error rolls this migration back).
 EXECUTE answers_sql INTO answers_after;
 EXECUTE acl_sql INTO acl_after USING names;
 IF (SELECT count(*) FROM unnest(names,volatilities,definers,plpgsql_md5s) w(name,volatility,definer,plpgsql_md5)
   JOIN pg_catalog.pg_proc p ON p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname=w.name
   WHERE p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    AND pg_catalog.md5(p.prosrc)=w.plpgsql_md5 AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
    AND p.prosecdef=w.definer AND p.provolatile=w.volatility AND p.prorettype='pg_catalog.bool'::pg_catalog.regtype
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
    AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof AND p.procost=100)<>4
  OR acl_after IS DISTINCT FROM acl_before OR answers_after IS DISTINCT FROM answers_before
  OR pathways.p05_has_project_permission('projects.read',NULL) IS DISTINCT FROM false
 THEN RAISE EXCEPTION '0082 permission check postcondition failed'; END IF;
END $$;
COMMIT;
