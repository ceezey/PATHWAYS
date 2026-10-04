-- 0062 rules escalated alert list (cr-pathways-escalated-alerts): a read-only page of alerts whose latest recorded
-- outcome is ESCALATE, for Program and Grant Manager dashboards. ESCALATE still records only an outcome and never changes
-- the alert lifecycle (PRD-F10). The function is owned by rules_human_owner, reads only the decisions columns granted to
-- that owner (no note, no actor), and filters every row with p06_can('alerts.read') and rule_exposure_allowed, exactly
-- like f10_alert_list. No table, column, policy or grant outside this function changes.
-- DBA prerequisite: run hosted-rules-escalation-preprovision.sql first and hosted-rules-escalation-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). The schema owner lends CREATE for the one statement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0061_activity_extension_requests'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0062 requires the verified 0061 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET')
 THEN RAISE EXCEPTION '0062 requires the temporary rules_human_owner SET chain (run hosted-rules-escalation-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
 THEN RAISE EXCEPTION '0062 requires the reviewed pathways schema owner'; END IF;
 IF has_schema_privilege('rules_human_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0062 requires rules_human_owner to hold no CREATE on pathways before the loan'; END IF;
 IF pg_catalog.to_regprocedure('pathways.f10_escalated_alert_list(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION '0062 requires the function to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways.f10_alert_list(jsonb)'::pg_catalog.regprocedure)<>'rules_human_owner'
 THEN RAISE EXCEPTION '0062 requires rules_human_owner to own f10_alert_list'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

GRANT CREATE ON SCHEMA pathways TO rules_human_owner;
SET LOCAL ROLE rules_human_owner;
CREATE FUNCTION pathways.f10_escalated_alert_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record; ids uuid[]; times timestamptz[]; items jsonb; next_id uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY[]::text[]);
 IF page.project IS NOT NULL AND pathways.p06_can('alerts.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.array_agg(q.alert_id ORDER BY q.alert_id), pg_catalog.array_agg(q.escalated_at ORDER BY q.alert_id)
  INTO ids, times FROM (
  SELECT latest.alert_id, latest.created_at AS escalated_at FROM (
   SELECT DISTINCT ON (d.alert_id) d.alert_id, d.outcome, d.created_at
   FROM pathways_rules_internal.decisions d
   WHERE d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND (page.project IS NULL OR d.project_id=page.project)
   ORDER BY d.alert_id, d.created_at DESC, d.id DESC) latest
  JOIN pathways.rule_based_alerts a ON a.id=latest.alert_id
  WHERE latest.outcome='ESCALATE' AND a.runtime_contract_version='f10.v1'
   AND (page.after_id IS NULL OR latest.alert_id>page.after_id)
   AND pathways.p06_can('alerts.read',a.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
  ORDER BY latest.alert_id LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.alert_json(x.id)||pg_catalog.jsonb_build_object('escalatedAt',x.at)
   ORDER BY x.at DESC, x.id),'[]'::jsonb)
  INTO items FROM ROWS FROM (pg_catalog.unnest(ids[1:page.page_limit]), pg_catalog.unnest(times[1:page.page_limit])) AS x(id, at);
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;
REVOKE ALL ON FUNCTION pathways.f10_escalated_alert_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_escalated_alert_list(jsonb) TO pathways_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM rules_human_owner;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure)<>'rules_human_owner'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure)
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure) IS DISTINCT FROM ARRAY['search_path=""']
 THEN RAISE EXCEPTION '0062 function shape postcondition failed'; END IF;
 IF NOT has_function_privilege('pathways_runtime','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('anon','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('service_role','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('pathways_rules_worker','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_function_privilege('pathways_rules_sweeper','pathways.f10_escalated_alert_list(jsonb)','EXECUTE')
  OR has_schema_privilege('rules_human_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0062 grant postcondition failed'; END IF;
END $$;
COMMIT;
