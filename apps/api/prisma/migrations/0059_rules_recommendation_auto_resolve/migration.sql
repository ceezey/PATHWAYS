-- 0059 rules recommendation auto-resolve (PRD-F11 G-F11-5, step 2 of 3); forward migration.
-- When the rules runtime auto-resolves an alert, every linked f10 recommendation that is still NEW or REVIEWED
-- and has no recorded decision closes as AUTO_RESOLVED in the same commit transaction, with a SYSTEM audit row.
-- Recommendations with a decision, and RESOLVED or DISMISSED ones, are never touched. Changes:
--  * pathways.decision_recommendations: p3_decision_values admits status AUTO_RESOLVED on the f10 branch (legacy
--    branch unchanged); rules_commit_owner gains UPDATE(status,revision,updated_at) and a lease-scoped update policy;
--  * pathways.rule_based_alerts: rules_runtime_guard_owner gains SELECT(lifecycle) to prove the linked alert state;
--  * pathways_rules_internal.decisions: rules_commit_owner and rules_runtime_guard_owner may read recommendation
--    linkage only while the commit lease is live (SELECT organization_id, project_id, recommendation_id);
--  * assert_runtime_mutation (rules_runtime_guard_owner): the COMMIT write set admits only this recommendation update;
--    AUTO_RESOLVED is terminal and rejected for every human or later write;
--  * commit_rule_snapshot (rules_commit_owner): performs the cascade, alert row locked before recommendation rows;
--  * outcome_preview_operation (rules_outcome_owner): rejects a recommendation that is AUTO_RESOLVED.
-- f10_recommendation_review already requires status NEW, so it needs no change. Each replaced function keeps its
-- signature, owner, ACL, SECURITY DEFINER mode, volatility and empty search_path (checked below). The bodies keep the
-- 0031 CRLF line endings; only the marked lines differ, and md5(prosrc) is pinned before and after.
-- DBA prerequisite: run hosted-rules-catalog-preprovision.sql first (a temporary SET-only chain from prisma to the
-- rules owner roles used here and in 0060) and hosted-rules-catalog-cleanup.sql afterwards (after a failure, run prisma migrate resolve --rolled-back first).
-- The schema owner rules_store_owner lends CREATE for the function statements and takes it back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0058_rules_decision_status_auto_resolved'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0059 requires the verified 0058 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_commit_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_outcome_owner','SET')
 THEN RAISE EXCEPTION '0059 requires the temporary rules_store_owner, rules_commit_owner, rules_runtime_guard_owner and rules_outcome_owner SET chain (run hosted-rules-catalog-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
   WHERE n.nspname='pathways' AND t.typname='decision_status' AND e.enumlabel='AUTO_RESOLVED')
 THEN RAISE EXCEPTION '0059 requires the reviewed schema owners and the 0058 enum value'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.decision_recommendations'::pg_catalog.regclass AND conname='p3_decision_values')<>1
 THEN RAISE EXCEPTION '0059 requires the p3_decision_values constraint'; END IF;
 -- Only the reviewed 0031 definitions, or this migration's own on a rerun, may be replaced.
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) not found'; END IF;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_runtime_guard_owner' OR fn.prosecdef IS DISTINCT FROM true OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.void'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('5203ca58bfe1e72e4f7933e7248637d3','af01cb794a63ddd69450bf402cbdf5ca')
 THEN RAISE EXCEPTION '0059 requires the reviewed 0031 assert_runtime_mutation definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0059.acl_0',coalesce(fn.proacl::text,''),true);
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) not found'; END IF;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_commit_owner' OR fn.prosecdef IS DISTINCT FROM true OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('5bcf64d95c42b9715e4f48ce8b4c9ebd','78bdeafefc3861eba6aeb5fa395296dd')
 THEN RAISE EXCEPTION '0059 requires the reviewed 0031 commit_rule_snapshot definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0059.acl_1',coalesce(fn.proacl::text,''),true);
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean) not found'; END IF;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_outcome_owner' OR fn.prosecdef IS DISTINCT FROM true OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('0df50afc20941efef3a7c543a3544828','0fd80c968fbda9d9add83b3d1c60e53e')
 THEN RAISE EXCEPTION '0059 requires the reviewed 0031 outcome_preview_operation definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0059.acl_2',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 0. The schema owner lends prisma USAGE for the policy statements below and takes it back at the end.
SELECT pg_catalog.set_config('pathways_0059.had_usage',pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text,true);
SET LOCAL ROLE rules_store_owner;
GRANT USAGE ON SCHEMA pathways_rules_internal TO prisma;
RESET ROLE;

-- 1. Tables owned by prisma (decision_recommendations, rule_based_alerts).
ALTER TABLE pathways.decision_recommendations DROP CONSTRAINT p3_decision_values;
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT p3_decision_values CHECK (
  (runtime_contract_version IS NULL AND private_review_id IS NULL AND
(((length(btrim(title)) > 0) AND (length(btrim(text)) > 0) AND (((source_rule_recommendation_id IS NULL) AND (source_snapshot IS NULL)) OR ((source_rule_recommendation_id IS NOT NULL) AND (alert_id IS NOT NULL) AND (jsonb_typeof(source_snapshot) = 'object'::text))) AND (((status = 'NEW'::pathways.decision_status) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_note IS NULL) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = 'REVIEWED'::pathways.decision_status) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = ANY (ARRAY['RESOLVED'::pathways.decision_status, 'DISMISSED'::pathways.decision_status])) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NOT NULL) AND (outcome_by_id IS NOT NULL) AND (outcome_at >= reviewed_at) AND (outcome_note IS NOT NULL) AND (length(btrim(outcome_note)) > 0))) AND ((reviewed_by_id IS NULL) OR (reviewed_by_id <> proposed_by_id)) AND ((outcome_by_id IS NULL) OR (outcome_by_id <> proposed_by_id)) AND ((status <> 'DISMISSED'::pathways.decision_status) OR (outcome = 'DECLINE'::pathways.decision_outcome)) AND ((status <> 'RESOLVED'::pathways.decision_status) OR (outcome <> 'DECLINE'::pathways.decision_outcome)))))
  OR
  (runtime_contract_version IS NOT NULL AND runtime_contract_version='f10.v1'
    AND pg_catalog.length(pg_catalog.btrim(title))>0
    AND pg_catalog.length(pg_catalog.btrim(text))>0
    AND source_rule_recommendation_id IS NOT NULL AND alert_id IS NOT NULL
    AND source_snapshot IS NOT NULL AND pg_catalog.jsonb_typeof(source_snapshot)='object'
    AND review_note IS NULL AND outcome IS NULL AND outcome_by_id IS NULL
    AND outcome_at IS NULL AND outcome_note IS NULL
    AND ((status='NEW' AND reviewed_by_id IS NULL AND reviewed_at IS NULL
      AND private_review_id IS NULL)
      OR (status='REVIEWED' AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL
        AND reviewed_at>=proposed_at AND private_review_id IS NOT NULL)
      OR (status='AUTO_RESOLVED' AND ((reviewed_by_id IS NULL AND reviewed_at IS NULL AND private_review_id IS NULL)
        OR (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_at>=proposed_at AND private_review_id IS NOT NULL))))
    AND (reviewed_by_id IS NULL OR proposed_by_id IS NULL OR reviewed_by_id<>proposed_by_id))
);
GRANT UPDATE(status,revision,updated_at) ON pathways.decision_recommendations TO rules_commit_owner;
CREATE POLICY f10_commit_recommendation_update ON pathways.decision_recommendations FOR UPDATE TO rules_commit_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id))
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(lifecycle) ON pathways.rule_based_alerts TO rules_runtime_guard_owner;

-- 2. Tables and schema owned by rules_store_owner; the schema owner also lends CREATE for the function statements.
SET LOCAL ROLE rules_store_owner;
GRANT SELECT(organization_id,project_id,recommendation_id) ON pathways_rules_internal.decisions TO rules_commit_owner;
CREATE POLICY f10_commit_decision_exists ON pathways_rules_internal.decisions FOR SELECT TO rules_commit_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_guard_decision_exists ON pathways_rules_internal.decisions FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_commit_owner,rules_runtime_guard_owner,rules_outcome_owner;
RESET ROLE;

-- 3. Functions, each replaced by its own owner.
-- 3.1 assert_runtime_mutation
SET LOCAL ROLE rules_runtime_guard_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.assert_runtime_mutation(
 wanted_relation oid,wanted_action text,old_row jsonb,new_row jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent pathways_rules_internal.runtime_mutation_intents;
 config pathways_rules_internal.configuration_context;
 relation_name text; row_id uuid; org uuid; project uuid; permission text; human_rule uuid;
BEGIN
 IF wanted_action NOT IN ('INSERT','UPDATE') OR new_row IS NULL
  OR pg_catalog.jsonb_typeof(new_row)<>'object'
  OR (wanted_action='INSERT' AND old_row IS NOT NULL)
  OR (wanted_action='UPDATE' AND (old_row IS NULL OR pg_catalog.jsonb_typeof(old_row)<>'object'))
  OR wanted_relation NOT IN ('pathways.alert_rules'::regclass,'pathways.alert_rule_recommendations'::regclass,
    'pathways.rule_based_alerts'::regclass,'pathways.decision_recommendations'::regclass) THEN
  RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 row_id:=(new_row->>'id')::uuid; org:=(new_row->>'organization_id')::uuid;
 project:=(new_row->>'project_id')::uuid;
 IF wanted_relation='pathways.alert_rule_recommendations'::regclass THEN
  SELECT r.project_id INTO project FROM pathways.alert_rules r
   WHERE r.id=(new_row->>'rule_id')::uuid AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'Runtime parent unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF row_id IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 SELECT i.* INTO intent FROM pathways_rules_internal.runtime_mutation_intents i
  WHERE i.transaction_id=pg_catalog.pg_current_xact_id() AND i.backend_pid=pg_catalog.pg_backend_pid()
   AND i.login_name=session_user AND i.relation_oid=wanted_relation AND i.action=wanted_action
   AND i.record_id=row_id AND i.organization_id=org AND NOT i.consumed
  FOR NO KEY UPDATE;
 IF NOT FOUND OR intent.expected_old IS DISTINCT FROM old_row OR intent.expected_new IS DISTINCT FROM new_row
  OR intent.project_id IS DISTINCT FROM project THEN
  RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 IF old_row IS NOT NULL AND ((old_row->'id',old_row->'organization_id',old_row->'project_id')
      IS DISTINCT FROM (new_row->'id',new_row->'organization_id',new_row->'project_id')) THEN
  RAISE EXCEPTION 'Runtime scope is immutable' USING ERRCODE='23514'; END IF;
 IF old_row IS NOT NULL AND new_row->'runtime_contract_version' IS DISTINCT FROM old_row->'runtime_contract_version' THEN
  RAISE EXCEPTION 'Runtime contract is immutable' USING ERRCODE='23514'; END IF;
 relation_name:=CASE wanted_relation WHEN 'pathways.alert_rules'::regclass THEN 'RULE'
  WHEN 'pathways.alert_rule_recommendations'::regclass THEN 'TEMPLATE'
  WHEN 'pathways.rule_based_alerts'::regclass THEN 'ALERT' ELSE 'RECOMMENDATION' END;

 IF intent.purpose='COMMIT' THEN
  IF session_user<>'pathways_rules_worker' OR relation_name NOT IN ('ALERT','RECOMMENDATION')
   OR project IS NULL OR NOT EXISTS(
    SELECT FROM pathways_rules_internal.projection_context c
    JOIN pathways_rules_internal.jobs j ON j.id=c.job_id AND j.organization_id=c.organization_id AND j.project_id=c.project_id
    JOIN pathways_rules_internal.snapshots s ON s.id=c.snapshot_id AND s.job_id=j.id
      AND s.organization_id=j.organization_id AND s.project_id=j.project_id
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.purpose='COMMIT' AND c.snapshot_id=intent.operation_id
     AND c.organization_id=org AND c.project_id=project AND j.state='LEASED'
     AND j.lease_session=session_user AND j.lease_hash=c.lease_hash AND s.lease_hash=c.lease_hash
     AND j.lease_expires_at>pg_catalog.clock_timestamp()+interval '3 seconds'
     AND c.expires_at=j.lease_expires_at) THEN
   RAISE EXCEPTION 'Runtime commit unavailable' USING ERRCODE='42501'; END IF;
  IF wanted_action='INSERT' AND (
    new_row->>'attribution' IS DISTINCT FROM 'SYSTEM'
    OR (relation_name='ALERT' AND new_row->'evaluated_by_id' IS DISTINCT FROM 'null'::jsonb)
    OR (relation_name='RECOMMENDATION' AND new_row->'proposed_by_id' IS DISTINCT FROM 'null'::jsonb)) THEN
   RAISE EXCEPTION 'Runtime system attribution required' USING ERRCODE='23514'; END IF;
  -- An undecided recommendation closes with its auto-resolved alert (0059); no other commit write is permitted.
  IF wanted_action='UPDATE' AND NOT (
   (relation_name='ALERT' AND (new_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at'])
      IS NOT DISTINCT FROM (old_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at']))
   OR (relation_name='RECOMMENDATION'
    AND (new_row-ARRAY['status','revision','updated_at']) IS NOT DISTINCT FROM (old_row-ARRAY['status','revision','updated_at'])
    AND old_row->>'status' IN ('NEW','REVIEWED') AND new_row->>'status'='AUTO_RESOLVED'
    AND EXISTS(SELECT FROM pathways.rule_based_alerts a
     JOIN pathways_rules_internal.evaluations e ON e.id=a.latest_evaluation_id AND e.organization_id=a.organization_id
      AND e.project_id=a.project_id AND e.rule_version_id=a.rule_id
     WHERE a.id=(new_row->>'alert_id')::uuid AND a.organization_id=org AND a.project_id=project
      AND a.lifecycle='AUTO_RESOLVED' AND e.snapshot_id=intent.operation_id AND e.result='FALSE')
    AND NOT EXISTS(SELECT FROM pathways_rules_internal.decisions d WHERE d.organization_id=org AND d.project_id=project
     AND d.recommendation_id=row_id))) THEN
   RAISE EXCEPTION 'Runtime commit write set unavailable' USING ERRCODE='23514'; END IF;
 ELSIF intent.purpose='FEATURE_HUMAN' THEN
  IF session_user<>'pathways_runtime' OR relation_name NOT IN ('ALERT','RECOMMENDATION')
   OR wanted_action<>'UPDATE' OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   OR pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
   OR NOT EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project
     AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_id=intent.operation_id
     AND ((relation_name='ALERT' AND c.alert_id=row_id)
       OR (relation_name='RECOMMENDATION' AND c.recommendation_id=row_id))
     AND (relation_name<>'ALERT' OR c.operation_code='ALERT_REVIEW'
       OR pathways.p06_can('alerts.outcome.record',project) IS TRUE)
     AND (relation_name<>'RECOMMENDATION' OR c.operation_code='RECOMMENDATION_REVIEW'
       OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE)) THEN
   RAISE EXCEPTION 'Runtime human mutation unavailable' USING ERRCODE='42501'; END IF;
  IF relation_name='ALERT' THEN human_rule:=(new_row->>'rule_id')::uuid;
  ELSE SELECT a.rule_id INTO human_rule FROM pathways.rule_based_alerts a
   WHERE a.id=(new_row->>'alert_id')::uuid AND a.organization_id=org AND a.project_id=project
    AND a.runtime_contract_version='f10.v1'; END IF;
  IF human_rule IS NULL OR pathways_rules_internal.rule_exposure_allowed(human_rule) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Runtime human exposure unavailable' USING ERRCODE='42501'; END IF;
  IF (relation_name='ALERT' AND (new_row-ARRAY['lifecycle','revision','updated_at'])
      IS DISTINCT FROM (old_row-ARRAY['lifecycle','revision','updated_at']))
   OR (relation_name='RECOMMENDATION' AND (new_row-ARRAY['status','revision','private_review_id','reviewed_by_id','reviewed_at','updated_at'])
      IS DISTINCT FROM (old_row-ARRAY['status','revision','private_review_id','reviewed_by_id','reviewed_at','updated_at'])) THEN
   RAISE EXCEPTION 'Runtime human write set unavailable' USING ERRCODE='23514'; END IF;
 ELSIF intent.purpose='CONFIGURATION' THEN
  IF session_user<>'pathways_runtime' OR relation_name NOT IN ('RULE','TEMPLATE')
   OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid THEN
   RAISE EXCEPTION 'Runtime configuration context unavailable' USING ERRCODE='42501'; END IF;
  SELECT c.* INTO config FROM pathways_rules_internal.configuration_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.organization_id=org AND c.project_id IS NOT DISTINCT FROM project
    AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_id=intent.operation_id
    AND ((relation_name='RULE' AND (c.target_rule_id=row_id OR
       (c.operation_code='RULE_ACTIVATE' AND wanted_action='UPDATE' AND c.predecessor_rule_id=row_id)))
      OR (relation_name='TEMPLATE' AND c.target_rule_id=(new_row->>'rule_id')::uuid));
  IF NOT FOUND THEN RAISE EXCEPTION 'Runtime configuration context unavailable' USING ERRCODE='42501'; END IF;
  permission:=CASE config.operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END;
  IF pathways.p09_can(permission) IS DISTINCT FROM true
   OR (project IS NOT NULL AND pathways.p06_can(permission,project) IS DISTINCT FROM true) OR
    (project IS NOT NULL AND NOT EXISTS(SELECT FROM pathways_rules_internal.project_state s
      WHERE s.organization_id=org AND s.project_id=project AND s.bootstrap_complete
       AND s.required_generation=config.admitted_generation AND s.source_watermark=config.admitted_watermark)) THEN
   RAISE EXCEPTION 'Runtime configuration authority unavailable' USING ERRCODE='42501'; END IF;
  IF relation_name='RULE' THEN
   IF new_row->>'runtime_contract_version' IS DISTINCT FROM 'f10.v1'
    OR (wanted_action='INSERT' AND (new_row->>'status' IS DISTINCT FROM 'DRAFT'
      OR new_row->>'created_by_id' IS DISTINCT FROM config.actor_id::text
      OR new_row->'activated_at' IS DISTINCT FROM 'null'::jsonb)) THEN
    RAISE EXCEPTION 'Runtime draft origin unavailable' USING ERRCODE='23514'; END IF;
   IF wanted_action='UPDATE' THEN
    IF (new_row-ARRAY['status','activated_by_id','activated_at','archived_at','updated_at'])
       IS DISTINCT FROM (old_row-ARRAY['status','activated_by_id','activated_at','archived_at','updated_at'])
     OR NOT ((config.operation_code='RULE_ACTIVATE' AND old_row->>'status'='DRAFT' AND new_row->>'status'='ACTIVE'
       AND new_row->>'activated_by_id'=config.actor_id::text AND new_row->'activated_at'<>'null'::jsonb)
      OR (config.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE') AND old_row->>'status'='ACTIVE' AND new_row->>'status'='ARCHIVED'
       AND new_row->'activated_by_id'=old_row->'activated_by_id' AND new_row->'activated_at'=old_row->'activated_at'
       AND new_row->'archived_at'<>'null'::jsonb)) THEN
     RAISE EXCEPTION 'Activated runtime rule is immutable' USING ERRCODE='23514'; END IF;
   END IF;
  ELSE
   IF wanted_action<>'INSERT' OR new_row->>'created_by_id' IS DISTINCT FROM config.actor_id::text
    OR NOT EXISTS(SELECT FROM pathways.alert_rules r WHERE r.id=config.target_rule_id
      AND r.organization_id=org AND r.project_id IS NOT DISTINCT FROM project
      AND r.runtime_contract_version='f10.v1' AND r.status='DRAFT' AND r.activated_at IS NULL) THEN
    RAISE EXCEPTION 'Activated runtime templates are immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Runtime purpose unavailable' USING ERRCODE='42501'; END IF;

 IF relation_name='ALERT' THEN
  IF new_row->>'lifecycle' IS NULL OR new_row->>'revision' IS NULL
   OR new_row->>'lifecycle' NOT IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')
   OR (new_row->>'revision')::bigint<=0
   OR (old_row IS NOT NULL AND (new_row->>'revision')::bigint<>(old_row->>'revision')::bigint+1)
   OR (wanted_action='INSERT' AND (new_row->>'lifecycle'<>'NEW' OR (new_row->>'revision')::bigint<>1)) THEN
   RAISE EXCEPTION 'Runtime lifecycle unavailable' USING ERRCODE='23514'; END IF;
  IF old_row IS NOT NULL AND old_row->>'lifecycle' IN ('RESOLVED','DISMISSED','AUTO_RESOLVED')
    AND new_row->>'lifecycle' IS DISTINCT FROM old_row->>'lifecycle' THEN
   RAISE EXCEPTION 'Terminal runtime lifecycle is immutable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='COMMIT' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.evaluations e
   WHERE e.id=(new_row->>'latest_evaluation_id')::uuid AND e.snapshot_id=intent.operation_id
    AND e.organization_id=org AND e.project_id=project
    AND e.rule_version_id=(new_row->>'rule_id')::uuid
    AND (wanted_action<>'INSERT' OR (e.result='TRUE' AND e.evidence=new_row->'evaluated_snapshot'))) THEN
   RAISE EXCEPTION 'Runtime evaluation provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='COMMIT' AND old_row IS NOT NULL
   AND new_row->>'lifecycle' IS DISTINCT FROM old_row->>'lifecycle'
   AND NOT (old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED')
    AND new_row->>'lifecycle'='AUTO_RESOLVED' AND EXISTS(
     SELECT FROM pathways_rules_internal.evaluations e WHERE e.id=(new_row->>'latest_evaluation_id')::uuid
      AND e.snapshot_id=intent.operation_id AND e.organization_id=org AND e.project_id=project AND e.result='FALSE')) THEN
   RAISE EXCEPTION 'Runtime automatic clearance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' THEN
   IF NOT EXISTS(
    SELECT FROM pathways_rules_internal.feature_operation_context c
    JOIN pathways_rules_internal.feature_operation_receipts o ON o.client_operation_id=c.operation_id
     AND o.organization_id=c.organization_id AND o.project_id=c.project_id AND o.actor_id=c.actor_id
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.operation_id=intent.operation_id AND c.alert_id=row_id
     AND c.organization_id=org AND c.project_id=project
     AND o.alert_id=row_id AND o.operation_code=c.operation_code AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
     AND ((c.operation_code='ALERT_REVIEW'
       AND new_row->>'lifecycle'=CASE WHEN old_row->>'lifecycle'='NEW' THEN 'REVIEWED' ELSE old_row->>'lifecycle' END
       AND EXISTS(
       SELECT FROM pathways_rules_internal.alert_reviews r WHERE r.organization_id=org AND r.project_id=project
        AND r.alert_id=row_id AND r.operation_receipt_id=o.id AND r.actor_id=c.actor_id
        AND r.state_before=old_row->>'lifecycle' AND r.state_after=new_row->>'lifecycle'))
      OR (c.operation_code='ALERT_DISPOSITION' AND old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED') AND EXISTS(
       SELECT FROM pathways_rules_internal.lifecycle_events e WHERE e.organization_id=org AND e.project_id=project
        AND e.alert_id=row_id AND e.operation_receipt_id=o.id AND e.actor_id=c.actor_id AND e.actor_kind='HUMAN'
        AND e.state_before=old_row->>'lifecycle' AND e.state_after=new_row->>'lifecycle'
        AND e.state_after IN ('RESOLVED','DISMISSED')))
      OR (c.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM') AND EXISTS(
       SELECT FROM pathways_rules_internal.decisions d WHERE d.organization_id=org AND d.project_id=project
        AND d.alert_id=row_id AND d.operation_receipt_id=o.id AND d.actor_id=c.actor_id
        AND d.client_operation_id=c.operation_id
        AND ((d.outcome IN ('ACCEPT','PARTIALLY_ACCEPT') AND
          ((old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED') AND new_row->>'lifecycle'='ACTIONED')
           OR (old_row->>'lifecycle' IN ('RESOLVED','DISMISSED','AUTO_RESOLVED') AND new_row->>'lifecycle'=old_row->>'lifecycle')))
          OR (d.outcome IN ('DECLINE','ESCALATE') AND new_row->>'lifecycle'=old_row->>'lifecycle')))))) THEN
    RAISE EXCEPTION 'Runtime human event provenance unavailable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSEIF relation_name='RECOMMENDATION' THEN
  IF new_row->>'runtime_contract_version' IS DISTINCT FROM 'f10.v1'
   OR new_row->>'status' IS NULL OR new_row->>'revision' IS NULL OR new_row->>'status' NOT IN ('NEW','REVIEWED','AUTO_RESOLVED')
   OR new_row->'review_note' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'outcome_note' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'outcome' IS DISTINCT FROM 'null'::jsonb
   OR (new_row->>'revision')::bigint<=0
   OR (old_row IS NOT NULL AND (new_row->>'revision')::bigint<>(old_row->>'revision')::bigint+1) THEN
   RAISE EXCEPTION 'Runtime recommendation unavailable' USING ERRCODE='23514'; END IF;
  -- AUTO_RESOLVED is terminal and is written only by the lease-bound commit (0059).
  IF (old_row IS NOT NULL AND old_row->>'status'='AUTO_RESOLVED')
   OR (new_row->>'status'='AUTO_RESOLVED' AND (intent.purpose<>'COMMIT' OR wanted_action<>'UPDATE')) THEN
   RAISE EXCEPTION 'Terminal runtime recommendation is immutable' USING ERRCODE='23514'; END IF;
  IF wanted_action='INSERT' AND (new_row->>'status'<>'NEW' OR (new_row->>'revision')::bigint<>1
   OR new_row->'private_review_id' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'reviewed_by_id' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'reviewed_at' IS DISTINCT FROM 'null'::jsonb) THEN
   RAISE EXCEPTION 'Runtime recommendation origin unavailable' USING ERRCODE='23514'; END IF;
  -- Insert provenance only; the auto-resolve update is proven in the commit write set check above (0059).
  IF intent.purpose='COMMIT' AND wanted_action='INSERT' AND NOT EXISTS(
   SELECT FROM pathways.rule_based_alerts a
   JOIN pathways_rules_internal.evaluations e ON e.id=a.latest_evaluation_id
    AND e.organization_id=a.organization_id AND e.project_id=a.project_id AND e.rule_version_id=a.rule_id
   JOIN pathways.alert_rule_recommendations t ON t.id=(new_row->>'source_rule_recommendation_id')::uuid
    AND t.organization_id=a.organization_id AND t.rule_id=a.rule_id
   WHERE a.id=(new_row->>'alert_id')::uuid AND a.organization_id=org AND a.project_id=project
    AND e.snapshot_id=intent.operation_id AND e.result='TRUE'
    AND new_row->>'title'=t.title AND new_row->>'text'=t.text
    AND new_row->'source_snapshot'->>'evaluationId'=e.id::text) THEN
   RAISE EXCEPTION 'Runtime recommendation provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'='REVIEWED'
   AND (new_row->'private_review_id',new_row->'reviewed_by_id',new_row->'reviewed_at',new_row->'status')
    IS DISTINCT FROM (old_row->'private_review_id',old_row->'reviewed_by_id',old_row->'reviewed_at',old_row->'status') THEN
   RAISE EXCEPTION 'Runtime review event is immutable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'=new_row->>'status'
   AND (new_row->'private_review_id',new_row->'reviewed_by_id',new_row->'reviewed_at')
    IS DISTINCT FROM (old_row->'private_review_id',old_row->'reviewed_by_id',old_row->'reviewed_at') THEN
   RAISE EXCEPTION 'Runtime decision cannot alter review provenance' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'='NEW' AND new_row->>'status'='REVIEWED' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.recommendation_reviews r
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.id=r.operation_receipt_id
    AND o.organization_id=r.organization_id AND o.project_id=r.project_id
   WHERE r.id=(new_row->>'private_review_id')::uuid AND r.organization_id=org AND r.project_id=project
    AND r.recommendation_id=row_id AND r.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
    AND r.actor_id=(new_row->>'reviewed_by_id')::uuid AND r.occurred_at=(new_row->>'reviewed_at')::timestamptz
    AND o.actor_id=r.actor_id AND o.client_operation_id=intent.operation_id
    AND o.operation_code='RECOMMENDATION_REVIEW') THEN
   RAISE EXCEPTION 'Runtime review provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'=new_row->>'status' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.decisions d
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.id=d.operation_receipt_id
    AND o.organization_id=d.organization_id AND o.project_id=d.project_id
   WHERE d.organization_id=org AND d.project_id=project AND d.recommendation_id=row_id
    AND d.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND d.client_operation_id=intent.operation_id
    AND o.actor_id=d.actor_id AND o.client_operation_id=d.client_operation_id
    AND o.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM')) THEN
   RAISE EXCEPTION 'Runtime decision provenance unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE pathways_rules_internal.runtime_mutation_intents i SET consumed=true
  WHERE i.id=intent.id AND NOT i.consumed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime intent already consumed' USING ERRCODE='42501'; END IF;
END $$;
RESET ROLE;

-- 3.2 commit_rule_snapshot
SET LOCAL ROLE rules_commit_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.commit_rule_snapshot(wanted_job uuid,nonce text,wanted_snapshot uuid,wanted_digest bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE org uuid;project uuid;state pathways_rules_internal.project_state;job pathways_rules_internal.jobs;
 captured pathways_rules_internal.snapshots;ack record;calendar record;entry jsonb;current_rule record;templates jsonb;
 result jsonb;evidence jsonb;leaf jsonb;condition_units jsonb;sequence bigint;moment timestamptz(3);evaluation uuid;
 cursor pathways_rules_internal.episode_cursors;affected_kind text;affected uuid;indicator uuid;activity uuid;
 old_alert pathways.rule_based_alerts;new_alert pathways.rule_based_alerts;recommendation pathways.decision_recommendations;
 template jsonb;rule_id uuid;matched boolean;row_count integer;observed jsonb;auto_rec pathways.decision_recommendations;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR nonce IS NULL OR nonce !~ '^[a-f0-9]{64}$'
  OR wanted_job IS NULL OR wanted_snapshot IS NULL OR wanted_digest IS NULL OR pg_catalog.octet_length(wanted_digest)<>32 THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 -- Derive scope from private job metadata, then take state before queue/resource.
 SELECT j.organization_id,j.project_id INTO org,project FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO state FROM pathways_rules_internal.project_state s WHERE s.organization_id=org AND s.project_id=project FOR NO KEY UPDATE;
 IF NOT FOUND OR NOT state.bootstrap_complete THEN RAISE EXCEPTION 'Rules bootstrap unavailable' USING ERRCODE='55000'; END IF;
 -- Immutable original capability recovery is read-only even after lease expiry,
 -- newer work, terminal human outcomes or another worker has claimed the job.
 SELECT * INTO ack FROM pathways_rules_internal.committed_acknowledgement(wanted_job,nonce,wanted_snapshot,wanted_digest);
 IF FOUND THEN RETURN pg_catalog.jsonb_build_object('requiredGeneration',ack.required_generation::text,
  'sourceWatermark',ack.source_watermark::text,'calendarVersion',ack.calendar_version::text,
  'evaluationSequence',ack.evaluation_sequence::text,'committedAt',pathways_rules_internal.utc_milliseconds(ack.committed_at)); END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job AND j.organization_id=org AND j.project_id=project FOR NO KEY UPDATE;
 PERFORM pathways_rules_internal.install_commit_context(wanted_job,nonce,wanted_snapshot,wanted_digest);
 SELECT s.* INTO captured FROM pathways_rules_internal.snapshots s WHERE s.id=wanted_snapshot AND s.job_id=wanted_job
  AND s.organization_id=org AND s.project_id=project;
 SELECT c.version,c.zone INTO calendar FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND OR captured.id IS NULL OR captured.digest IS DISTINCT FROM wanted_digest
  OR pg_catalog.sha256(pg_catalog.convert_to(captured.canonical_payload::text,'UTF8')) IS DISTINCT FROM captured.digest
  OR captured.required_generation IS DISTINCT FROM state.required_generation OR captured.source_watermark IS DISTINCT FROM state.source_watermark
  OR captured.calendar_version IS DISTINCT FROM calendar.version OR captured.zone IS DISTINCT FROM calendar.zone
  OR job.claim_generation IS DISTINCT FROM state.required_generation OR job.claim_watermark IS DISTINCT FROM state.source_watermark THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 SELECT count(*)::integer INTO row_count FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project
  AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1';
 IF row_count<>pg_catalog.jsonb_array_length(captured.manifest) THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(captured.manifest) LOOP
  rule_id:=(entry->>'ruleId')::uuid;
  SELECT r.version,r.definition_digest,r.conditions_json,r.name,r.severity INTO current_rule FROM pathways.alert_rules r
   WHERE r.id=rule_id AND r.organization_id=org AND r.project_id=project AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND OR current_rule.version IS DISTINCT FROM (entry->>'version')::integer
   OR pg_catalog.encode(current_rule.definition_digest,'hex') IS DISTINCT FROM entry->>'definitionDigest'
   OR current_rule.conditions_json IS DISTINCT FROM entry->'conditions' OR current_rule.name IS DISTINCT FROM entry->>'name'
   OR current_rule.severity::text IS DISTINCT FROM entry->>'severity'
   OR pathways_rules_internal.lease_rule_exposure_allowed(rule_id) IS DISTINCT FROM (entry->>'eligible')::boolean
   OR pg_catalog.encode(pathways_rules_internal.classification_fingerprint(rule_id),'hex') IS DISTINCT FROM entry->>'classificationFingerprint'
   OR pg_catalog.encode(pathways_rules_internal.rule_dependency_fingerprint(rule_id,captured.as_of),'hex')
    IS DISTINCT FROM captured.source_inputs->'resourceFingerprints'->>rule_id::text THEN
   RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text,'type',t.type)
   ORDER BY t.id),'[]'::jsonb) INTO templates FROM pathways.alert_rule_recommendations t WHERE t.organization_id=org AND t.rule_id=rule_id;
  IF templates IS DISTINCT FROM entry->'recommendations' THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 END LOOP;
 -- No writes above. Now each actual evaluation/episode is fixed from the trusted
 -- immutable captured observations and bounded deterministic evaluator.
 sequence:=state.evaluation_sequence+1;moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(captured.manifest) ORDER BY value->>'ruleId' LOOP
  rule_id:=(entry->>'ruleId')::uuid;result:=pathways_rules_internal.evaluate_snapshot_rule(entry->'conditions',captured.observations->rule_id::text);
  condition_units:='[]';observed:='{}';
  FOR leaf IN SELECT value FROM pg_catalog.jsonb_array_elements(result->'conditions') ORDER BY value->>'conditionId' LOOP
   condition_units:=condition_units||pg_catalog.jsonb_build_array(leaf||pg_catalog.jsonb_build_object('unit',
    captured.observations->rule_id::text->(leaf->>'conditionId')->>'unit'));
   observed:=observed||pg_catalog.jsonb_build_object(leaf->>'conditionId',leaf->'cell');
  END LOOP;
  evidence:=result||pg_catalog.jsonb_build_object('conditions',condition_units,'snapshotId',captured.id,
   'asOf',pathways_rules_internal.utc_milliseconds(captured.as_of),'reportingDate',captured.reporting_date,
   'calendar',pg_catalog.jsonb_build_object('zone',captured.zone,'version',captured.calendar_version::text));
  SELECT CASE WHEN count(DISTINCT b.indicator_id)=1 AND bool_and(b.indicator_id IS NOT NULL) THEN min(b.indicator_id::text)::uuid END,
   CASE WHEN count(DISTINCT b.activity_id)=1 AND bool_and(b.activity_id IS NOT NULL) THEN min(b.activity_id::text)::uuid END
   INTO indicator,activity FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=rule_id;
  affected_kind:=CASE WHEN indicator IS NOT NULL THEN 'INDICATOR' WHEN activity IS NOT NULL THEN 'ACTIVITY' ELSE 'PROJECT' END;
  affected:=COALESCE(indicator,activity,project);evaluation:=pg_catalog.gen_random_uuid();
  INSERT INTO pathways_rules_internal.evaluations(id,snapshot_id,organization_id,project_id,rule_version_id,affected_kind,affected_id,
   evaluation_sequence,result,evidence,superseded) VALUES(evaluation,captured.id,org,project,rule_id,affected_kind,affected,sequence,result->>'result',evidence,false);
  INSERT INTO pathways_rules_internal.episode_cursors(organization_id,project_id,rule_version_id,affected_kind,affected_id)
   VALUES(org,project,rule_id,affected_kind,affected) ON CONFLICT DO NOTHING;
  SELECT c.* INTO cursor FROM pathways_rules_internal.episode_cursors c WHERE c.organization_id=org AND c.project_id=project
   AND c.rule_version_id=rule_id AND c.affected_kind=affected_kind AND c.affected_id=affected FOR NO KEY UPDATE;
  IF NOT FOUND OR cursor.last_sequence>=sequence OR (cursor.latched AND cursor.alert_id IS NULL)
   OR (cursor.episode_number>0 AND cursor.alert_id IS NULL) THEN
   RAISE EXCEPTION 'Episode cursor is inconsistent' USING ERRCODE='55000'; END IF;
  old_alert:=NULL;new_alert:=NULL;
  IF result->>'result'='TRUE' AND NOT cursor.latched THEN
   new_alert.id:=pg_catalog.gen_random_uuid();new_alert.organization_id:=org;new_alert.project_id:=project;new_alert.rule_id:=rule_id;
   new_alert.indicator_id:=indicator;new_alert.activity_id:=activity;new_alert.title:=entry->>'name';new_alert.message:='Rule conditions matched.';
   new_alert.severity:=(entry->>'severity')::pathways.alert_severity;new_alert.observed_values:=observed;new_alert.evaluated_snapshot:=evidence;
   new_alert.evaluated_by_id:=NULL;new_alert.evaluated_at:=captured.as_of;new_alert.created_at:=moment;new_alert.updated_at:=moment;
   new_alert.runtime_contract_version:='f10.v1';new_alert.attribution:='SYSTEM';new_alert.lifecycle:='NEW';new_alert.revision:=1;
   new_alert.episode_number:=cursor.episode_number+1;new_alert.affected_kind:=affected_kind;new_alert.affected_id:=affected;new_alert.latest_evaluation_id:=evaluation;new_alert.origin_snapshot_id:=captured.id;
   PERFORM pathways_rules_internal.install_commit_intent('pathways.rule_based_alerts'::regclass,NULL,pg_catalog.to_jsonb(new_alert));
   INSERT INTO pathways.rule_based_alerts SELECT (new_alert).*;
   INSERT INTO pathways_rules_internal.lifecycle_events(organization_id,project_id,alert_id,actor_kind,state_before,state_after,evaluation_id,occurred_at)
    VALUES(org,project,new_alert.id,'SYSTEM',NULL,'NEW',evaluation,moment);
   FOR template IN SELECT value FROM pg_catalog.jsonb_array_elements(entry->'recommendations') LOOP
    recommendation:=NULL;recommendation.id:=pg_catalog.gen_random_uuid();recommendation.organization_id:=org;recommendation.project_id:=project;
    recommendation.alert_id:=new_alert.id;recommendation.source_rule_recommendation_id:=(template->>'id')::uuid;
    recommendation.title:=template->>'title';recommendation.text:=template->>'text';recommendation.type:=(template->>'type')::pathways.recommendation_type;
    recommendation.basis:=CASE affected_kind WHEN 'INDICATOR' THEN 'KPI'::pathways.recommendation_basis ELSE 'COMBINED'::pathways.recommendation_basis END;
    recommendation.source_snapshot:=evidence||pg_catalog.jsonb_build_object('evaluationId',evaluation);recommendation.proposed_by_id:=NULL;
    recommendation.proposed_at:=moment;recommendation.status:='NEW';recommendation.created_at:=moment;recommendation.updated_at:=moment;
    recommendation.revision:=1;recommendation.runtime_contract_version:='f10.v1';recommendation.attribution:='SYSTEM';
    PERFORM pathways_rules_internal.install_commit_intent('pathways.decision_recommendations'::regclass,NULL,pg_catalog.to_jsonb(recommendation));
    INSERT INTO pathways.decision_recommendations SELECT (recommendation).*;
   END LOOP;
  ELSIF cursor.alert_id IS NOT NULL THEN
   SELECT a.* INTO old_alert FROM pathways.rule_based_alerts a WHERE a.id=cursor.alert_id AND a.organization_id=org AND a.project_id=project
    AND a.rule_id=rule_id AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Episode cursor unavailable' USING ERRCODE='55000'; END IF;
   new_alert:=old_alert;new_alert.latest_evaluation_id:=evaluation;new_alert.revision:=old_alert.revision+1;new_alert.updated_at:=moment;
   IF result->>'result'='FALSE' AND old_alert.lifecycle IN ('NEW','REVIEWED','ACTIONED') THEN new_alert.lifecycle:='AUTO_RESOLVED'; END IF;
   PERFORM pathways_rules_internal.install_commit_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
   UPDATE pathways.rule_based_alerts SET latest_evaluation_id=evaluation,revision=new_alert.revision,lifecycle=new_alert.lifecycle,updated_at=moment
    WHERE id=old_alert.id AND organization_id=org AND project_id=project AND revision=old_alert.revision;
   IF NOT FOUND THEN RAISE EXCEPTION 'The rules resource changed.' USING ERRCODE='40001'; END IF;
   IF new_alert.lifecycle IS DISTINCT FROM old_alert.lifecycle THEN
    INSERT INTO pathways_rules_internal.lifecycle_events(organization_id,project_id,alert_id,actor_kind,state_before,state_after,evaluation_id,occurred_at)
     VALUES(org,project,new_alert.id,'SYSTEM',old_alert.lifecycle,new_alert.lifecycle,evaluation,moment);
    -- Undecided recommendations close with the alert, alert row locked first (0059).
    IF new_alert.lifecycle='AUTO_RESOLVED' THEN
     FOR recommendation IN SELECT r.* FROM pathways.decision_recommendations r WHERE r.organization_id=org AND r.project_id=project
      AND r.alert_id=old_alert.id AND r.runtime_contract_version='f10.v1' AND r.status IN ('NEW','REVIEWED')
      AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.decisions d WHERE d.organization_id=org AND d.project_id=project AND d.recommendation_id=r.id)
      ORDER BY r.id FOR NO KEY UPDATE OF r LOOP
      auto_rec:=recommendation;auto_rec.status:='AUTO_RESOLVED';auto_rec.revision:=recommendation.revision+1;auto_rec.updated_at:=moment;
      PERFORM pathways_rules_internal.install_commit_intent('pathways.decision_recommendations'::regclass,pg_catalog.to_jsonb(recommendation),pg_catalog.to_jsonb(auto_rec));
      UPDATE pathways.decision_recommendations SET status='AUTO_RESOLVED',revision=auto_rec.revision,updated_at=moment
       WHERE id=recommendation.id AND organization_id=org AND project_id=project AND revision=recommendation.revision;
      IF NOT FOUND THEN RAISE EXCEPTION 'The rules resource changed.' USING ERRCODE='40001'; END IF;
      INSERT INTO pathways.audit_logs(organization_id,project_id,action,entity_type,entity_id,changes)
       VALUES(org,project,'rules.system.recommendation_auto_resolved','DecisionRecommendation',recommendation.id,
        pg_catalog.jsonb_build_object('attribution','SYSTEM','alertId',old_alert.id,'evaluationId',evaluation,'statusBefore',recommendation.status));
     END LOOP;
    END IF;
   END IF;
  END IF;
  UPDATE pathways_rules_internal.episode_cursors SET last_sequence=sequence,last_result=result->>'result',
   latched=CASE result->>'result' WHEN 'TRUE' THEN true WHEN 'FALSE' THEN false ELSE cursor.latched END,
   episode_number=CASE WHEN result->>'result'='TRUE' AND NOT cursor.latched THEN cursor.episode_number+1 ELSE cursor.episode_number END,
   alert_id=COALESCE(new_alert.id,cursor.alert_id) WHERE organization_id=org AND project_id=project
    AND rule_version_id=rule_id AND episode_cursors.affected_kind=affected_kind AND affected_id=affected AND last_sequence=cursor.last_sequence;
  IF NOT FOUND THEN RAISE EXCEPTION 'Episode sequence changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.acknowledgements(snapshot_id,job_id,organization_id,project_id,snapshot_digest,lease_hash,lease_session,
  required_generation,source_watermark,calendar_version,evaluation_sequence,committed_at)
 VALUES(captured.id,job.id,org,project,captured.digest,job.lease_hash,session_user,captured.required_generation,
  captured.source_watermark,captured.calendar_version,sequence,moment);
 INSERT INTO pathways_rules_internal.work_coverage(work_item_id,organization_id,project_id,acknowledgement_snapshot_id)
  SELECT w.id,w.organization_id,w.project_id,captured.id FROM pathways_rules_internal.work_items w WHERE w.organization_id=org AND w.project_id=project
   AND w.generation<=captured.required_generation AND NOT EXISTS(SELECT FROM pathways_rules_internal.work_coverage coverage WHERE coverage.work_item_id=w.id);
 UPDATE pathways_rules_internal.project_state SET acknowledged_generation=captured.required_generation,evaluation_sequence=sequence
  WHERE organization_id=org AND project_id=project AND required_generation=captured.required_generation AND source_watermark=captured.source_watermark;
 IF NOT FOUND THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,project_id,action,entity_type,entity_id,changes)
  VALUES(org,project,'rules.system.evaluated','RulesSnapshot',captured.id,pg_catalog.jsonb_build_object('attribution','SYSTEM','evaluatedRuleCount',row_count));
 -- Remove live-marker before releasing lease; no later source reads/writes.
 PERFORM pathways_rules_internal.remove_projection_context();
 UPDATE pathways_rules_internal.jobs AS j SET state='IDLE',lease_hash=NULL,lease_session=NULL,lease_expires_at=NULL,claim_generation=NULL,claim_watermark=NULL,
  stale_attempts=0,operational_failures=0 WHERE j.id=job.id AND j.organization_id=org AND j.project_id=project AND j.lease_hash=job.lease_hash AND j.state='LEASED';
 IF NOT FOUND THEN RAISE EXCEPTION 'The rules lease changed.' USING ERRCODE='40001'; END IF;
 RETURN pg_catalog.jsonb_build_object('requiredGeneration',captured.required_generation::text,'sourceWatermark',captured.source_watermark::text,
  'calendarVersion',captured.calendar_version::text,'evaluationSequence',sequence::text,'committedAt',pathways_rules_internal.utc_milliseconds(moment));
END $$;
RESET ROLE;

-- 3.3 outcome_preview_operation
SET LOCAL ROLE rules_outcome_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.outcome_preview_operation(wanted uuid,input jsonb,recommendation_route boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;alert uuid;recommendation uuid;op uuid;hash bytea;operation text;
 alert_row pathways.rule_based_alerts;rec_row pathways.decision_recommendations;
 receipt pathways_rules_internal.feature_operation_receipts;preview pathways_rules_internal.outcome_previews;
 write_alert boolean;write_recommendation boolean;recipients jsonb;moment timestamptz(3);message text;result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 operation:=CASE WHEN recommendation_route THEN 'RECOMMENDATION_PREVIEW' ELSE 'ALERT_PREVIEW' END;
 IF recommendation_route THEN
  SELECT r.project_id,r.alert_id INTO project,alert FROM pathways.decision_recommendations r
   WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  recommendation:=wanted;
 ELSE
  SELECT a.project_id,a.id INTO project,alert FROM pathways.rule_based_alerts a
   WHERE a.id=wanted AND a.organization_id=org AND a.runtime_contract_version='f10.v1';
  recommendation:=(input->>'recommendationId')::uuid;
 END IF;
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR pathways.p06_can(CASE WHEN recommendation_route THEN 'recommendations.outcome.record' ELSE 'alerts.outcome.record' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.validate_preview_input(input,recommendation_route);
 write_alert:=NOT recommendation_route OR input->>'outcome' IN ('ACCEPT','PARTIALLY_ACCEPT');
 write_recommendation:=recommendation IS NOT NULL;
 IF (write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,operation,alert,recommendation,NULL,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.alert_id IS DISTINCT FROM alert
   OR receipt.recommendation_id IS DISTINCT FROM recommendation OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result;PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 -- Deterministic resource lock order under already protected state: alert, rec.
 SELECT a.* INTO alert_row FROM pathways.rule_based_alerts a WHERE a.id=alert AND a.organization_id=org
  AND a.project_id=project AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF recommendation IS NOT NULL THEN
  SELECT r.* INTO rec_row FROM pathways.decision_recommendations r WHERE r.id=recommendation AND r.organization_id=org
   AND r.project_id=project AND r.alert_id=alert AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
  -- An auto-resolved recommendation is terminal and accepts no outcome (0059).
  IF rec_row.status='AUTO_RESOLVED' THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 END IF;
 IF (write_alert AND alert_row.revision<>CASE WHEN recommendation_route THEN (input->>'expectedAlertRevision')::bigint ELSE (input->>'expectedRevision')::bigint END)
  OR (write_recommendation AND rec_row.revision<>CASE WHEN recommendation_route THEN (input->>'expectedRevision')::bigint ELSE (input->>'expectedRecommendationRevision')::bigint END) THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(alert_row.rule_id) IS DISTINCT FROM true
  OR (write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 recipients:=pathways_rules_internal.outcome_recipients(org,project,actor);
 IF pg_catalog.jsonb_array_length(recipients)>1000 THEN
  RAISE EXCEPTION 'Notification recipient capacity exceeded.' USING ERRCODE='40001'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());preview.id:=pg_catalog.gen_random_uuid();
 message:='Management outcome: '||pg_catalog.lower(pg_catalog.replace(input->>'outcome','_',' '))||'. Alert: "'||pg_catalog.left(alert_row.title,160)||'".';
 preview.operation_kind:=CASE WHEN write_alert AND write_recommendation THEN 'COMBINED_OUTCOME' WHEN write_alert THEN 'ALERT_OUTCOME' ELSE 'RECOMMENDATION_OUTCOME' END;
 INSERT INTO pathways_rules_internal.outcome_previews
 (id,organization_id,project_id,actor_id,alert_id,recommendation_id,operation_kind,creating_operation_code,write_alert,write_recommendation,
 expected_alert_revision,expected_recommendation_revision,outcome,private_note,classification_fingerprint,recipient_fingerprint,
 request_digest,message,recipients,created_at,expires_at)
 VALUES(preview.id,org,project,actor,alert,recommendation,preview.operation_kind,operation,write_alert,write_recommendation,
 CASE WHEN write_alert THEN alert_row.revision ELSE NULL END,CASE WHEN write_recommendation THEN rec_row.revision ELSE NULL END,
 input->>'outcome',pg_catalog.btrim(input->>'note'),pathways_rules_internal.classification_fingerprint(alert_row.rule_id),
 pg_catalog.sha256(pg_catalog.convert_to(recipients::text,'UTF8')),hash,message,recipients,moment,moment+interval '5 minutes');
 result:=pg_catalog.jsonb_build_object('previewId',preview.id,'expiresAt',moment+interval '5 minutes','operationKind',preview.operation_kind,
  'alertRevision',CASE WHEN write_alert THEN alert_row.revision::text ELSE NULL END,
  'recommendationRevision',CASE WHEN write_recommendation THEN rec_row.revision::text ELSE NULL END,
  'outcome',input->>'outcome','message',message,'recipientCount',pg_catalog.jsonb_array_length(recipients));
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(org,project,actor,op,operation,alert,recommendation,preview.id,hash,result,moment);
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
RESET ROLE;

SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_commit_owner,rules_runtime_guard_owner,rules_outcome_owner;
DO $$ BEGIN IF pg_catalog.current_setting('pathways_0059.had_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways_rules_internal FROM prisma; END IF; END $$;
RESET ROLE;

-- Postconditions.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) not found'; END IF;
 IF pg_catalog.md5(fn.prosrc)<>'af01cb794a63ddd69450bf402cbdf5ca' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_runtime_guard_owner' OR fn.prosecdef IS DISTINCT FROM true
  OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0059.acl_0')
 THEN RAISE EXCEPTION '0059 assert_runtime_mutation postcondition failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) not found'; END IF;
 IF pg_catalog.md5(fn.prosrc)<>'78bdeafefc3861eba6aeb5fa395296dd' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_commit_owner' OR fn.prosecdef IS DISTINCT FROM true
  OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0059.acl_1')
 THEN RAISE EXCEPTION '0059 commit_rule_snapshot postcondition failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean)';
 IF NOT FOUND THEN RAISE EXCEPTION 'Function pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean) not found'; END IF;
 IF pg_catalog.md5(fn.prosrc)<>'0fd80c968fbda9d9add83b3d1c60e53e' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_outcome_owner' OR fn.prosecdef IS DISTINCT FROM true
  OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0059.acl_2')
 THEN RAISE EXCEPTION '0059 outcome_preview_operation postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('rules_commit_owner','pathways_rules_internal','CREATE')
  OR pg_catalog.has_schema_privilege('rules_runtime_guard_owner','pathways_rules_internal','CREATE')
  OR pg_catalog.has_schema_privilege('rules_outcome_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0059 lent schema CREATE remains'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.decision_recommendations'::pg_catalog.regclass
   AND conname='p3_decision_values' AND convalidated AND pg_catalog.pg_get_constraintdef(oid) LIKE '%AUTO_RESOLVED%')
  OR NOT pg_catalog.has_column_privilege('rules_commit_owner','pathways.decision_recommendations','status','UPDATE')
  OR pg_catalog.has_column_privilege('rules_commit_owner','pathways.decision_recommendations','review_note','UPDATE')
  OR NOT pg_catalog.has_column_privilege('rules_runtime_guard_owner','pathways.rule_based_alerts','lifecycle','SELECT')
  OR NOT pg_catalog.has_column_privilege('rules_commit_owner',(SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways_rules_internal' AND c.relname='decisions'),'recommendation_id','SELECT')
  OR pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text<>pg_catalog.current_setting('pathways_0059.had_usage')
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_commit_recommendation_update','f10_commit_decision_exists','f10_guard_decision_exists'))<>3
 THEN RAISE EXCEPTION '0059 recommendation auto-resolve postcondition failed'; END IF;
END $$;
COMMIT;
