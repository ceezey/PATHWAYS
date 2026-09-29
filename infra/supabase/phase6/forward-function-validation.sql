-- Compile installed, trusted definitions without changing the persisted catalog.
-- CREATE OR REPLACE retains function identity, owner and ACL; rollback additionally
-- removes catalog tuple changes. Never execute the function bodies themselves.
BEGIN;
SET LOCAL check_function_bodies=on;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $validation$
DECLARE routine record; actual record; checked integer:=0;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
  OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55448
  OR current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_restore','pathways_phase4_core_retry') THEN
  RAISE EXCEPTION 'Only owned disposable forward validation is permitted';
 END IF;
 FOR routine IN
  SELECT p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE l.lanname IN ('plpgsql','sql') AND
   (n.nspname='pathways_rules_internal' OR (n.nspname='pathways' AND p.proname ~ '^(f10_|p34_)'))
  ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
 LOOP
  EXECUTE routine.definition;
  SELECT p.proowner,p.proacl,pg_get_functiondef(p.oid) AS definition INTO STRICT actual
   FROM pg_catalog.pg_proc p WHERE p.oid=routine.oid;
  IF actual.proowner IS DISTINCT FROM routine.proowner OR actual.proacl IS DISTINCT FROM routine.proacl
   OR actual.definition IS DISTINCT FROM routine.definition THEN
   RAISE EXCEPTION 'Forward function compilation changed ownership, ACL or definition';
  END IF;
  checked:=checked+1;
 END LOOP;
 IF checked=0 THEN RAISE EXCEPTION 'No installed forward functions were validated'; END IF;
END
$validation$;
ROLLBACK;
