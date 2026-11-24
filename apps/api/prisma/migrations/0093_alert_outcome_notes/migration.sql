-- 0093 alert outcome notes for deciders (cr-pathways-f10-f11-runtime-authority amendment of 2026-11-24, UC018 step 18.5).
-- f10_alert_history (rules_human_owner) adds decision to each entry: the outcome note and the actor's display name from the new
-- rules_outcome_owner definer alert_decision_detail, which returns null unless the caller holds alerts.outcome.record on the
-- project. Every other entry, and every entry for other callers, carries decision null. A new rules_outcome_owner policy on
-- decisions admits only that read. f10_alert_history keeps its signature, owner, ACL, security mode, volatility and empty
-- search_path, and md5(prosrc) is pinned before and after. Existing rows are not touched.
-- DBA prerequisite: run hosted-alert-notes-preprovision.sql first and hosted-alert-notes-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). rules_store_owner lends schema CREATE and prisma lends
-- rules_store_owner USAGE and rules_human_owner CREATE on pathways; every loan is taken back before the postconditions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0092_rules_outcomes_freshness'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0093 requires the verified 0092 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_outcome_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET')
 THEN RAISE EXCEPTION '0093 requires the temporary rules owner SET chain (run hosted-alert-notes-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='pathways_rules_internal' AND c.relname='decisions' AND pg_catalog.pg_get_userbyid(c.relowner)='rules_store_owner')<>1
  OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_outcome_owner')
   AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('rules_human_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0093 requires the reviewed schema and table owners and no earlier schema CREATE'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pathways_rules_internal' AND p.proname='alert_decision_detail')
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='f10_outcome_alert_decision_read')
 THEN RAISE EXCEPTION '0093 requires its new function and policy to not already exist'; END IF;
 -- Only the reviewed 0031 definition may be replaced; its ACL is kept for the postcondition.
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_alert_history(uuid,jsonb)'::pg_catalog.regprocedure;
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_human_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>'e34380351c66674e98ab2c76a4dca2d2'
 THEN RAISE EXCEPTION '0093 requires the reviewed definition of pathways.f10_alert_history(uuid,jsonb)'; END IF;
 PERFORM pg_catalog.set_config('pathways_0093.acl_history',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,93);

-- 0. Loans: rules_store_owner lends rules_outcome_owner CREATE; prisma lends rules_store_owner USAGE on pathways for its policy and
-- rules_human_owner CREATE on pathways for the replace. All are taken back in step 4.
SELECT pg_catalog.set_config('pathways_0093.had_store_usage',pg_catalog.has_schema_privilege('rules_store_owner','pathways','USAGE')::text,true);
GRANT USAGE ON SCHEMA pathways TO rules_store_owner;
GRANT CREATE ON SCHEMA pathways TO rules_human_owner;
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_outcome_owner;

-- 1. rules_store_owner: the outcome owner reads alert decisions, note included, only for a caller who may record alert outcomes.
CREATE POLICY f10_outcome_alert_decision_read ON pathways_rules_internal.decisions FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('alerts.outcome.record',project_id) IS TRUE);
RESET ROLE;

-- 2. rules_outcome_owner: the note and actor name of one decision, for permitted callers only.
SET LOCAL ROLE rules_outcome_owner;
CREATE FUNCTION pathways_rules_internal.alert_decision_detail(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('note',d.note,'actorName',u.full_name)
 FROM pathways_rules_internal.decisions d
 LEFT JOIN pathways.system_users u ON u.organization_id=d.organization_id AND u.id=d.actor_id
 WHERE d.id=wanted AND d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND session_user='pathways_runtime' AND pathways.p06_can('alerts.outcome.record',d.project_id) IS TRUE
$$;
REVOKE ALL ON FUNCTION pathways_rules_internal.alert_decision_detail(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.alert_decision_detail(uuid) TO rules_human_owner;
RESET ROLE;

-- 3. rules_human_owner: outcome entries in the alert history carry the decision detail.
SET LOCAL ROLE rules_human_owner;
CREATE OR REPLACE FUNCTION pathways.f10_alert_history(wanted uuid,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record;page record;items jsonb;next_id uuid;cursor_at timestamptz;next_episode timestamptz;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT a.organization_id,a.project_id,a.rule_id,a.affected_kind,a.affected_id,a.episode_number,a.evaluated_at
  INTO target FROM pathways.rule_based_alerts a WHERE a.id=wanted
  AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1'
  AND pathways.p06_can('alerts.read',a.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY[]::text[]);
 SELECT min(a.evaluated_at) INTO next_episode FROM pathways.rule_based_alerts a WHERE a.organization_id=target.organization_id
  AND a.project_id=target.project_id AND a.rule_id=target.rule_id AND a.affected_kind=target.affected_kind
  AND a.affected_id=target.affected_id AND a.episode_number>target.episode_number AND a.runtime_contract_version='f10.v1';
 -- Cursor resolves only within this authorized episode's exact history.
 WITH history AS (
  SELECT e.id,s.as_of AS occurred_at,'SYSTEM'::text AS actor_kind,
   CASE WHEN e.superseded THEN 'SUPERSEDED' ELSE 'EVALUATED' END::text AS kind,
   NULL::text AS lifecycle,NULL::text AS outcome,r.version,
   CASE e.result WHEN 'TRUE' THEN 'Rule conditions matched.' WHEN 'FALSE' THEN 'Rule conditions did not match.' ELSE 'A required metric was unavailable.' END::text AS explanation,
   e.result,pathways_rules_internal.safe_evidence(e.evidence) AS evidence
  FROM pathways_rules_internal.evaluations e JOIN pathways_rules_internal.snapshots s
   ON s.id=e.snapshot_id AND s.organization_id=e.organization_id AND s.project_id=e.project_id
  JOIN pathways.alert_rules r ON r.id=e.rule_version_id AND r.organization_id=e.organization_id
  WHERE e.organization_id=target.organization_id AND e.project_id=target.project_id AND e.rule_version_id=target.rule_id
   AND e.affected_kind=target.affected_kind AND e.affected_id=target.affected_id AND s.as_of>=target.evaluated_at
   AND (next_episode IS NULL OR s.as_of<next_episode)
  UNION ALL
  SELECT h.id,h.occurred_at,h.actor_kind,CASE WHEN h.state_after='NEW' THEN 'CREATED' ELSE h.state_after END,h.state_after,NULL,r.version,
   'Alert lifecycle changed.'::text,NULL,'[]'::jsonb FROM pathways_rules_internal.lifecycle_events h
  JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE h.organization_id=target.organization_id AND h.project_id=target.project_id AND h.alert_id=wanted
  UNION ALL
  SELECT h.id,h.occurred_at,'HUMAN','REVIEWED',h.state_after,NULL,r.version,'Alert reviewed.',NULL,'[]'::jsonb
  FROM pathways_rules_internal.alert_reviews h JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE h.organization_id=target.organization_id AND h.project_id=target.project_id AND h.alert_id=wanted
  UNION ALL
  SELECT d.id,d.created_at,'HUMAN','OUTCOME',NULL,d.outcome,r.version,'A management outcome was recorded.',NULL,'[]'::jsonb
  FROM pathways_rules_internal.decisions d JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE d.organization_id=target.organization_id AND d.project_id=target.project_id AND d.alert_id=wanted
 ), cursor_row AS (SELECT occurred_at FROM history WHERE id=page.after_id), selected AS (
  SELECT h.*,row_number() OVER(ORDER BY h.occurred_at DESC,h.id DESC) AS position FROM history h
  WHERE page.after_id IS NULL OR (h.occurred_at,h.id)<((SELECT occurred_at FROM cursor_row),page.after_id)
  ORDER BY h.occurred_at DESC,h.id DESC LIMIT page.page_limit+1
 ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'occurredAt',occurred_at,
  'actorKind',actor_kind,'kind',kind,'lifecycle',lifecycle,'outcome',outcome,'ruleVersion',version,
  'explanation',explanation,'result',result,'evidence',evidence,
  -- Outcome notes and actor names reach only callers who may record alert outcomes (0093).
  'decision',CASE WHEN kind='OUTCOME' THEN pathways_rules_internal.alert_decision_detail(id) END)
  ORDER BY occurred_at DESC,id DESC)
  FILTER(WHERE position<=page.page_limit),'[]'::jsonb),
  CASE WHEN count(*)>page.page_limit THEN (array_agg(id ORDER BY occurred_at DESC,id DESC))[page.page_limit] ELSE NULL END,
  (SELECT occurred_at FROM cursor_row) INTO items,next_id,cursor_at FROM selected;
 IF page.after_id IS NOT NULL AND cursor_at IS NULL THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_array_length(items)<page.page_limit THEN next_id:=NULL; END IF;
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;
RESET ROLE;

-- 4. Every loan from step 0 is taken back.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_outcome_owner;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM rules_human_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0093.had_store_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways FROM rules_store_owner; END IF;
END $$;

-- 5. Postconditions: the history's kept owner, mode, search_path and ACL with its new body, the new function's owner, mode, body
-- and single EXECUTE holder, the policy and no loan left.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_alert_history(uuid,jsonb)'::pg_catalog.regprocedure;
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_human_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>'433af300db68e0895da3a055712f9baf'
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0093.acl_history')
 THEN RAISE EXCEPTION '0093 f10_alert_history postcondition failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.alert_decision_detail(uuid)';
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_outcome_owner' OR NOT fn.prosecdef OR fn.provolatile<>'s'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>'21c27ebcbed6ef6393dd262234d26448'
  OR NOT pg_catalog.has_function_privilege('rules_human_owner',fn.oid,'EXECUTE')
  OR EXISTS(SELECT FROM pg_catalog.aclexplode(fn.proacl) a WHERE a.grantee=0)
  OR EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker',
   'pathways_rules_sweeper']) r WHERE pg_catalog.has_function_privilege(r,fn.oid,'EXECUTE'))
 THEN RAISE EXCEPTION '0093 alert_decision_detail postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE p.polname='f10_outcome_alert_decision_read' AND n.nspname='pathways_rules_internal' AND c.relname='decisions' AND p.polcmd='r'
    AND p.polpermissive AND p.polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_outcome_owner')])
 THEN RAISE EXCEPTION '0093 policy postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('rules_outcome_owner','pathways_rules_internal','CREATE')
  OR pg_catalog.has_schema_privilege('rules_human_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_store_owner','pathways','USAGE')::text<>pg_catalog.current_setting('pathways_0093.had_store_usage')
 THEN RAISE EXCEPTION '0093 lent schema privilege remains'; END IF;
END $$;
COMMIT;
