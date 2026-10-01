-- 0054 restores the EXECUTE grants lost by the 0047/0048/0051 renames on p09_role_allows and p09_role_allows_0048.
-- Run as a local superuser against a disposable replay database with 0054 applied; rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF (current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' AND current_database() <> 'postgres')
 OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'p09 grant checks require a disposable local database'; END IF;
END $$;

DO $$ DECLARE r text; f text; BEGIN
 FOREACH f IN ARRAY ARRAY['p09_role_allows','p09_role_allows_0048'] LOOP
 FOREACH r IN ARRAY ARRAY['pathways_runtime','rules_human_owner','rules_outcome_owner','rules_eligibility_owner','rules_config_owner',
  'rules_capacity_owner','rules_runtime_guard_owner','rules_enqueue_owner','rules_source_proof_owner'] LOOP
  IF NOT has_function_privilege(r,format('pathways.%I(text,text)',f),'EXECUTE') THEN
   RAISE EXCEPTION 'Role % cannot execute %',r,f; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,format('pathways.%I(text,text)',f),'EXECUTE') THEN
   RAISE EXCEPTION 'Role % can execute %',r,f; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p,aclexplode(p.proacl) a
  WHERE p.oid=format('pathways.%I(text,text)',f)::regprocedure AND a.grantee=0) THEN
  RAISE EXCEPTION 'PUBLIC can execute %',f; END IF;
 END LOOP;
END $$;

-- The recommendation preview body runs as rules_outcome_owner and checks these permissions.
SET LOCAL ROLE rules_outcome_owner;
DO $$ BEGIN
 IF pathways.p09_role_allows('PROJECT_MANAGER','recommendations.outcome.record') IS DISTINCT FROM true
 OR pathways.p09_role_allows('PROJECT_MANAGER','alerts.outcome.record') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project Manager outcome authority not visible to the preview owner'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
