-- 0063 rules scope memo: pathways_rules_internal.human_rules_scope is called per row by about 31 RLS policies and ran up
-- to ten p06_can checks each time, so one alert list made about 14,000 p06_can calls and timed out. The function now
-- memoizes its result per project in a transaction-local setting keyed by the acting user, so an actor change
-- recomputes and a forged slot value for another actor is ignored. The memo is transaction-scoped per actor and project. No table, column, policy or
-- grant changes outside a one-statement schema CREATE loan: CREATE OR REPLACE keeps the owner (rules_eligibility_owner) and the EXECUTE ACL, asserted below.
-- DBA prerequisite: run hosted-rules-scope-memo-preprovision.sql first and hosted-rules-scope-memo-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). PostgreSQL checks CREATE on the schema even for a
-- replace, so rules_store_owner, the schema owner, lends CREATE on pathways_rules_internal for the one statement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0062_rules_escalated_alert_list'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0063 requires the verified 0062 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','SET')
 THEN RAISE EXCEPTION '0063 requires the temporary rules_eligibility_owner SET chain (run hosted-rules-scope-memo-preprovision.sql)'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET')
 THEN RAISE EXCEPTION '0063 requires the temporary rules_store_owner SET chain (run hosted-rules-scope-memo-preprovision.sql)'; END IF;
 IF has_schema_privilege('rules_eligibility_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0063 requires rules_eligibility_owner to hold no CREATE on pathways_rules_internal before the loan'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')
 THEN RAISE EXCEPTION '0063 requires human_rules_scope to exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')<>'rules_eligibility_owner'
 THEN RAISE EXCEPTION '0063 requires rules_eligibility_owner to own human_rules_scope'; END IF;
 -- Remember the ACL so the postcondition proves it is unchanged.
 PERFORM pg_catalog.set_config('pathways.m0063_acl',
  (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)'),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_eligibility_owner;
RESET ROLE;
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
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_eligibility_owner;
RESET ROLE;

-- Postconditions; the function oid is resolved by text because prisma holds no USAGE on the schema.
DO $$ DECLARE f oid; BEGIN
 SELECT p.oid INTO f FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)';
 IF f IS NULL THEN RAISE EXCEPTION '0063 function missing after replace'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')<>'rules_eligibility_owner'
  OR (SELECT l.lanname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')<>'plpgsql'
  OR (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')<>'s'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)') IS DISTINCT FROM ARRAY['search_path=""']
 THEN RAISE EXCEPTION '0063 function shape postcondition failed'; END IF;
 IF (SELECT coalesce(proacl::text,'') FROM pg_catalog.pg_proc WHERE oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)')
   IS DISTINCT FROM pg_catalog.current_setting('pathways.m0063_acl')
  OR NOT pg_catalog.has_function_privilege('rules_eligibility_owner',f,'EXECUTE')
  OR NOT pg_catalog.has_function_privilege('rules_capacity_owner',f,'EXECUTE')
  OR NOT pg_catalog.has_function_privilege('rules_config_owner',f,'EXECUTE')
  OR NOT pg_catalog.has_function_privilege('rules_human_owner',f,'EXECUTE')
  OR NOT pg_catalog.has_function_privilege('rules_outcome_owner',f,'EXECUTE')
  OR NOT pg_catalog.has_function_privilege('rules_runtime_guard_owner',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('anon',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('service_role',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('pathways_runtime',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('pathways_rules_worker',f,'EXECUTE')
  OR pg_catalog.has_function_privilege('pathways_rules_sweeper',f,'EXECUTE')
  OR has_schema_privilege('rules_eligibility_owner','pathways_rules_internal','CREATE')
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.human_rules_scope(uuid,uuid)' AND a.grantee=0)
 THEN RAISE EXCEPTION '0063 grant postcondition failed'; END IF;
END $$;
COMMIT;
