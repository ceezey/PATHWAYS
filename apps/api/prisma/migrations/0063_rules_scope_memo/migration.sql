-- 0063 rules scope memo: pathways_rules_internal.human_rules_scope is called per row by about 31 RLS policies and ran up
-- to ten p06_can checks each time, so one alert list made about 14,000 p06_can calls and timed out. The function now
-- memoizes its result per project in a transaction-local setting keyed by the acting user, so an actor change
-- recomputes and a forged slot value for another actor is ignored. Semantics are unchanged. No table, column, policy or
-- grant changes: CREATE OR REPLACE keeps the owner (rules_eligibility_owner) and the EXECUTE ACL, asserted below.
-- DBA prerequisite: run hosted-rules-scope-memo-preprovision.sql first and hosted-rules-scope-memo-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). Replacing a function needs ownership only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0062_rules_escalated_alert_list'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0063 requires the verified 0062 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','SET')
 THEN RAISE EXCEPTION '0063 requires the temporary rules_eligibility_owner SET chain (run hosted-rules-scope-memo-preprovision.sql)'; END IF;
 IF pg_catalog.to_regprocedure('pathways_rules_internal.human_rules_scope(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION '0063 requires human_rules_scope to exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)<>'rules_eligibility_owner'
 THEN RAISE EXCEPTION '0063 requires rules_eligibility_owner to own human_rules_scope'; END IF;
 -- Remember the ACL so the postcondition proves it is unchanged.
 PERFORM pg_catalog.set_config('pathways.m0063_acl',
  (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure),true);
END $$;
SELECT pg_advisory_xact_lock(505006,1);

SET LOCAL ROLE rules_eligibility_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.human_rules_scope(org uuid, project uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE actor text := nullif(pg_catalog.current_setting('app.user_id',true),'');
 slot text := 'pathways_rules_scope.p' || pg_catalog.replace(project::text,'-','');
 cached text; result boolean;
BEGIN
 IF session_user<>'pathways_runtime' OR project IS NULL OR actor IS NULL
  OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid THEN RETURN false; END IF;
 cached := pg_catalog.current_setting(slot,true);
 IF cached = actor||':t' THEN RETURN true; END IF;
 IF cached = actor||':f' THEN RETURN false; END IF;
 result := pathways.p06_can('rules.read',project) IS TRUE OR pathways.p06_can('rules.create',project) IS TRUE
    OR pathways.p06_can('rules.update',project) IS TRUE OR pathways.p06_can('rules.activate',project) IS TRUE
    OR pathways.p06_can('alerts.read',project) IS TRUE OR pathways.p06_can('alerts.review',project) IS TRUE
    OR pathways.p06_can('alerts.outcome.record',project) IS TRUE
    OR pathways.p06_can('recommendations.read',project) IS TRUE
    OR pathways.p06_can('recommendations.review',project) IS TRUE
    OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE;
 PERFORM pg_catalog.set_config(slot, actor||CASE WHEN result THEN ':t' ELSE ':f' END, true);
 RETURN result;
END $function$;
RESET ROLE;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)<>'rules_eligibility_owner'
  OR (SELECT l.lanname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)<>'plpgsql'
  OR (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)<>'s'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure) IS DISTINCT FROM ARRAY['search_path=""']
 THEN RAISE EXCEPTION '0063 function shape postcondition failed'; END IF;
 IF (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure)
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0063_acl')
  OR NOT has_function_privilege('rules_eligibility_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('rules_capacity_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('rules_config_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('rules_human_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('rules_outcome_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('rules_runtime_guard_owner','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('service_role','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('pathways_runtime','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('pathways_rules_worker','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR has_function_privilege('pathways_rules_sweeper','pathways_rules_internal.human_rules_scope(uuid,uuid)','EXECUTE')
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure AND a.grantee=0)
 THEN RAISE EXCEPTION '0063 grant postcondition failed'; END IF;
END $$;
COMMIT;
