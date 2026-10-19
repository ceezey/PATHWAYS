-- 0072 severity classification (cr-pathways-severity-classification 3.2 to 3.7, severity-guide-v0.2).
-- Storage: alert_rules.severity becomes nullable with no default (null lets the system decide, CRITICAL is the author's
-- manual mark) and gains two optional expectations (expected score improvement and manageable follow-up level, 0 to 100);
-- rule_based_alerts.severity becomes nullable (only when the basis needs context) and gains severity_basis and
-- severity_change. Earlier rows are not touched.
-- Replaced, each by its own owner, keeping signature, owner, ACL, security mode, volatility and empty search_path:
--  * rules_config_owner: validate_configuration_input (severity is null or CRITICAL, optional expectations) and
--    configuration_operation (stores expectations; they join the definition digest only when set);
--  * rules_human_owner: rule_json (severity may be null, adds expectations);
--  * rules_projection_owner: project_metric_observation (adds the planning facts severity needs) and
--    capture_rule_snapshot (manifest entries carry expectations).
-- New prisma-owned IMMUTABLE invoker functions: classify_alert_severity and its four helpers, the SQL twin of the shared
-- classifyAlertSeverity, executable only by rules_commit_owner. Column SELECT for the new rule columns and indicator target_date.
-- Part 2, again each by its own owner:
--  * rules_commit_owner: commit_rule_snapshot classifies every matched evaluation into its evidence, sets a new alert's
--    severity (CRITICAL when the rule is marked, otherwise the suggested level) and, on a matched re-evaluation of an
--    open alert that has a basis, moves the basis and, when status or level changed, the severity with a change record;
--  * rules_runtime_guard_owner: assert_runtime_mutation lets the commit write those columns, only with that basis;
--  * rules_human_owner: alert_json adds severityBasis and severityChange.
-- Lifecycle, notifications and recommendations are never changed by a severity change; alerts without a basis keep theirs.
-- DBA prerequisite: run hosted-rules-severity-preprovision.sql first and hosted-rules-severity-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). rules_store_owner lends schema USAGE and CREATE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; wanted record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0071_assessment_score_entry'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0072 requires the verified 0071 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_config_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_commit_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','SET')
 THEN RAISE EXCEPTION '0072 requires the temporary rules owner SET chain (run hosted-rules-severity-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.alert_rules'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.rule_based_alerts'::pg_catalog.regclass)<>'prisma'
  OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_config_owner','rules_human_owner',
   'rules_commit_owner','rules_runtime_guard_owner') AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
 THEN RAISE EXCEPTION '0072 requires the reviewed schema and table owners and no earlier schema CREATE'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_attribute WHERE NOT attisdropped AND attnum>0
   AND ((attrelid='pathways.alert_rules'::pg_catalog.regclass AND attname IN ('expected_score_improvement','manageable_follow_up_percent'))
    OR (attrelid='pathways.rule_based_alerts'::pg_catalog.regclass AND attname IN ('severity_basis','severity_change'))))
  OR EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pathways_rules_internal' AND p.proname IN ('classify_alert_severity','severity_shown','severity_calendar_date',
    'severity_node_result','severity_condition_basis'))
 THEN RAISE EXCEPTION '0072 requires the severity columns and classifier to not already exist'; END IF;
 -- Only the reviewed latest definitions may be replaced; their ACLs are kept for the postcondition.
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.validate_configuration_input(jsonb,text)','rules_config_owner',false,'i','9907d1ba98c5fe890b8220f9ecf4e8f2'),
  (1,'pathways_rules_internal.configuration_operation(uuid,jsonb,text)','rules_config_owner',true,'v','edbaf221645a04c039d494097b73c4fd'),
  (2,'pathways_rules_internal.rule_json(uuid)','rules_human_owner',false,'s','519d441502e52ba1e9a403fd99215901'),
  (3,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s','5dba57ac3d29beaeb201db5d51cb5e6e'),
  (4,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','0ed70417ea4783a8972f7a882c977560'),
  (5,'pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)','rules_runtime_guard_owner',true,'v','5471c4a385d7bef25f59b068fa95c6e8'),
  (6,'pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea)','rules_commit_owner',true,'v','78bdeafefc3861eba6aeb5fa395296dd'),
  (7,'pathways_rules_internal.alert_json(uuid)','rules_human_owner',false,'v','34642b36d3ff722a7686417c83cbff89')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
  THEN RAISE EXCEPTION '0072 requires the reviewed definition of %',wanted.signature; END IF;
  PERFORM pg_catalog.set_config('pathways_0072.acl_'||wanted.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 0. The schema owner lends prisma USAGE and CREATE, and the five function owners CREATE, until step 7.
SELECT pg_catalog.set_config('pathways_0072.had_usage',pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text,true);
SET LOCAL ROLE rules_store_owner;
GRANT USAGE,CREATE ON SCHEMA pathways_rules_internal TO prisma;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_projection_owner,rules_config_owner,rules_human_owner,
 rules_commit_owner,rules_runtime_guard_owner;
RESET ROLE;

-- 1. Storage on the prisma-owned tables; existing rows keep their values and no row is backfilled.
ALTER TABLE pathways.alert_rules ALTER COLUMN severity DROP DEFAULT, ALTER COLUMN severity DROP NOT NULL,
 ADD COLUMN expected_score_improvement numeric(18,4), ADD COLUMN manageable_follow_up_percent numeric(18,4),
 ADD CONSTRAINT alert_rules_expected_score_improvement_range CHECK (expected_score_improvement>=0 AND expected_score_improvement<=100),
 ADD CONSTRAINT alert_rules_manageable_follow_up_percent_range CHECK (manageable_follow_up_percent>=0 AND manageable_follow_up_percent<=100);
ALTER TABLE pathways.rule_based_alerts ALTER COLUMN severity DROP NOT NULL,
 ADD COLUMN severity_basis jsonb, ADD COLUMN severity_change jsonb,
 ADD CONSTRAINT rule_based_alerts_severity_basis_check
  CHECK (severity IS NOT NULL OR (severity_basis->>'status') IS NOT DISTINCT FROM 'CONTEXT_REQUIRED');
-- The commit writes the severity columns and the human read model shows the basis and its change.
GRANT UPDATE(severity,severity_basis,severity_change) ON pathways.rule_based_alerts TO rules_commit_owner;
GRANT SELECT(severity_basis,severity_change) ON pathways.rule_based_alerts TO rules_human_owner;
GRANT SELECT(expected_score_improvement,manageable_follow_up_percent) ON pathways.alert_rules
 TO rules_projection_owner,rules_commit_owner,rules_human_owner;
GRANT SELECT(target_date) ON pathways.project_indicators TO rules_projection_owner;

-- 2. rules_config_owner: configuration input validation and the configuration operation.
SET LOCAL ROLE rules_config_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.validate_configuration_input(input jsonb,operation text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[]; pending jsonb[]; current_node jsonb; children jsonb[]; count_nodes integer:=0;
 observations jsonb:='{}'; item jsonb; ids uuid[]:=ARRAY[]::uuid[]; item_id uuid;
BEGIN
 allowed:=CASE operation
  WHEN 'RULE_CREATE' THEN ARRAY['name','severity','expectations','conditions','recommendations','code','projectId','templateId','clientOperationId']
  WHEN 'RULE_DRAFT' THEN ARRAY['name','severity','expectations','conditions','recommendations','expectedVersion','clientOperationId']
  WHEN 'RULE_ACTIVATE' THEN ARRAY['expectedVersion','clientOperationId']
  WHEN 'RULE_ARCHIVE' THEN ARRAY['expectedVersion','clientOperationId','note'] ELSE NULL END;
 IF allowed IS NULL OR input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object' OR (input-allowed)<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'clientOperationId') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 PERFORM (input->>'clientOperationId')::uuid;
 IF operation<>'RULE_CREATE' AND (pg_catalog.jsonb_typeof(input->'expectedVersion') IS DISTINCT FROM 'number'
  OR (input->>'expectedVersion') !~ '^[1-9][0-9]{0,9}$' OR (input->>'expectedVersion')::numeric>2147483647) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF operation='RULE_CREATE' THEN
  IF pg_catalog.jsonb_typeof(input->'code') IS DISTINCT FROM 'string' OR (input->>'code') !~ '^[A-Z][A-Z0-9_-]{1,79}$'
   OR (input ? 'templateId' AND NOT input ? 'projectId') THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  IF input ? 'projectId' THEN
   IF pg_catalog.jsonb_typeof(input->'projectId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   PERFORM (input->>'projectId')::uuid;
  END IF;
  IF input ? 'templateId' THEN
   IF pg_catalog.jsonb_typeof(input->'templateId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   PERFORM (input->>'templateId')::uuid;
  END IF;
 END IF;
 IF operation='RULE_ARCHIVE' AND (pg_catalog.jsonb_typeof(input->'note') IS DISTINCT FROM 'string'
  OR pg_catalog.length(pg_catalog.btrim(input->>'note')) NOT BETWEEN 1 AND 2000) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF operation IN ('RULE_CREATE','RULE_DRAFT') THEN
  IF pg_catalog.jsonb_typeof(input->'name') IS DISTINCT FROM 'string'
   OR pg_catalog.length(pg_catalog.btrim(input->>'name')) NOT BETWEEN 1 AND 160
   OR COALESCE(input->'severity' NOT IN ('null'::jsonb,'"CRITICAL"'::jsonb),true)
   OR pg_catalog.jsonb_typeof(input->'conditions') IS DISTINCT FROM 'object'
   OR pg_catalog.jsonb_typeof(input->'recommendations') IS DISTINCT FROM 'array'
   OR pg_catalog.jsonb_array_length(input->'recommendations') NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  -- Expectations are an optional object of two decimals from 0 to 100, each possibly null (0072).
  IF input ? 'expectations' AND (pg_catalog.jsonb_typeof(input->'expectations') IS DISTINCT FROM 'object'
   OR ((input->'expectations')-ARRAY['expectedScoreImprovement','manageableFollowUpPercent'])<>'{}'::jsonb
   OR EXISTS(SELECT FROM pg_catalog.jsonb_each(input->'expectations') e WHERE pg_catalog.jsonb_typeof(e.value)<>'null'
    AND (pg_catalog.jsonb_typeof(e.value)<>'string' OR e.value#>>'{}' !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$'
     OR (e.value#>>'{}')::numeric NOT BETWEEN 0 AND 100))) THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(input->'recommendations') LOOP
   IF pg_catalog.jsonb_typeof(item)<>'object' OR (item-ARRAY['id','title','text'])<>'{}'::jsonb
    OR pg_catalog.jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(item->'title') IS DISTINCT FROM 'string'
    OR pg_catalog.length(pg_catalog.btrim(item->>'title')) NOT BETWEEN 1 AND 160
    OR pg_catalog.jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
    OR pg_catalog.length(pg_catalog.btrim(item->>'text')) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   item_id:=(item->>'id')::uuid;
   IF item_id=ANY(ids) THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   ids:=pg_catalog.array_append(ids,item_id);
  END LOOP;
  -- Bounded iterative traversal constructs only unavailable synthetic cells;
  -- complete shared native evaluator performs strict shape/domain/depth checks.
  pending:=ARRAY[input->'conditions'];
  WHILE pg_catalog.cardinality(pending)>0 LOOP
   current_node:=pending[pg_catalog.cardinality(pending)];pending:=pending[1:pg_catalog.cardinality(pending)-1];
   count_nodes:=count_nodes+1;
   IF count_nodes>160 OR pg_catalog.jsonb_typeof(current_node) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid bounded tree.' USING ERRCODE='22023'; END IF;
   IF current_node->>'kind'='CONDITION' AND current_node->>'id' IS NOT NULL THEN
    observations:=observations||pg_catalog.jsonb_build_object(current_node->>'id',pg_catalog.jsonb_build_object(
     'metric',current_node->>'metric','cell',pg_catalog.jsonb_build_object('state','MISSING','value',NULL,'reason','NO_MEASUREMENT')));
   ELSIF current_node->>'kind'='GROUP' AND pg_catalog.jsonb_typeof(current_node->'children')='array'
    AND pg_catalog.jsonb_array_length(current_node->'children') BETWEEN 1 AND 32 THEN
    SELECT pg_catalog.array_agg(value) INTO children FROM pg_catalog.jsonb_array_elements(current_node->'children');
    pending:=pending||children;
   ELSE RAISE EXCEPTION 'Invalid bounded tree.' USING ERRCODE='22023'; END IF;
  END LOOP;
  PERFORM pathways_rules_internal.evaluate_snapshot_rule(input->'conditions',observations);
 END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.configuration_operation(wanted uuid,input jsonb,operation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;permission text;admitted record;target uuid;logical uuid;
 old_rule pathways.alert_rules;new_rule pathways.alert_rules;predecessor pathways.alert_rules;
 receipt pathways_rules_internal.configuration_receipts;moment timestamptz(3);op uuid;hash bytea;result jsonb;
 recommendation jsonb;templates jsonb:='[]';template pathways.alert_rule_recommendations;capacity integer;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 permission:=CASE operation WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_ACTIVATE' THEN 'rules.activate'
  WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ARCHIVE' THEN 'rules.update' ELSE NULL END;
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR permission IS NULL
  OR pathways.p09_can(permission) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 IF operation='RULE_CREATE' THEN project:=(input->>'projectId')::uuid;
 ELSE SELECT r.project_id INTO project FROM pathways.alert_rules r WHERE r.id=wanted
  AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 END IF;
 -- This must precede all candidate validation, capacity and receipt behavior.
 IF project IS NOT NULL THEN
  PERFORM pathways.f10_bootstrap_project(project,operation);
  SELECT * INTO admitted FROM pathways_rules_internal.configuration_admission(org,project,operation);
 END IF;
 PERFORM pathways_rules_internal.validate_configuration_input(input,operation);
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object('resourceId',wanted,'body',input)::text,'UTF8'));
 SELECT o.* INTO receipt FROM pathways_rules_internal.configuration_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.project_id IS DISTINCT FROM project
   OR (operation<>'RULE_CREATE' AND receipt.rule_id IS DISTINCT FROM wanted AND operation<>'RULE_DRAFT')
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  -- Current resource exposure is still required before returning old response.
  IF project IS NOT NULL AND pathways_rules_internal.rule_exposure_allowed(receipt.rule_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
  RETURN receipt.safe_result;
 END IF;
 IF operation<>'RULE_CREATE' THEN
  SELECT r.* INTO old_rule FROM pathways.alert_rules r WHERE r.id=wanted AND r.organization_id=org
   AND r.project_id IS NOT DISTINCT FROM project AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND OR old_rule.version<>(input->>'expectedVersion')::integer THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());target:=CASE WHEN operation IN ('RULE_CREATE','RULE_DRAFT') THEN pg_catalog.gen_random_uuid() ELSE wanted END;
 logical:=CASE WHEN operation='RULE_CREATE' THEN pg_catalog.gen_random_uuid() ELSE old_rule.logical_rule_id END;
 IF operation='RULE_CREATE' AND input ? 'templateId' AND NOT EXISTS(SELECT FROM pathways.alert_rules r
  WHERE r.id=(input->>'templateId')::uuid AND r.organization_id=org AND r.project_id IS NULL AND r.runtime_contract_version='f10.v1') THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF operation IN ('RULE_ACTIVATE','RULE_ARCHIVE') AND project IS NULL THEN
  RAISE EXCEPTION 'Copy an organization template into a project before activation.' USING ERRCODE='22023'; END IF;
 IF operation='RULE_ACTIVATE' THEN
  IF old_rule.status<>'DRAFT' OR old_rule.activated_at IS NOT NULL THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  SELECT r.* INTO predecessor FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project
   AND r.logical_rule_id=logical AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  SELECT count(*)::integer INTO capacity FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project AND r.status='ACTIVE';
  IF capacity>20 OR (capacity=20 AND predecessor.id IS NULL) THEN
   RAISE EXCEPTION 'The project already has20 active rules.' USING ERRCODE='40001'; END IF;
  IF pathways_rules_internal.rule_exposure_allowed(wanted) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The rule source changed. Create a new draft.' USING ERRCODE='40001'; END IF;
 ELSIF operation='RULE_ARCHIVE' AND old_rule.status<>'ACTIVE' THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 END IF;
 INSERT INTO pathways_rules_internal.configuration_context
 (transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,operation_id,operation_code,
 target_rule_id,predecessor_rule_id,canonical_request_hash,admitted_generation,admitted_watermark)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,org,project,actor,op,operation,
  target,predecessor.id,hash,CASE WHEN project IS NULL THEN NULL ELSE admitted.admitted_generation END,
  CASE WHEN project IS NULL THEN NULL ELSE admitted.admitted_watermark END);
 IF operation IN ('RULE_CREATE','RULE_DRAFT') THEN
  new_rule.id:=target;new_rule.organization_id:=org;new_rule.project_id:=project;new_rule.logical_rule_id:=logical;
  new_rule.runtime_contract_version:='f10.v1';new_rule.code:=CASE WHEN project IS NULL THEN 'F10T:'||logical::text ELSE 'F10P:'||project::text||':'||logical::text END;
  new_rule.display_code:=CASE WHEN operation='RULE_CREATE' THEN input->>'code' ELSE old_rule.display_code END;
  new_rule.version:=CASE WHEN operation='RULE_CREATE' THEN 1 ELSE old_rule.version+1 END;
  new_rule.template_origin_id:=CASE WHEN operation='RULE_CREATE' THEN (input->>'templateId')::uuid ELSE old_rule.template_origin_id END;
  new_rule.name:=pg_catalog.btrim(input->>'name');new_rule.type:='COMBINED_CONDITION';
  new_rule.match_mode:=CASE WHEN input->'conditions'->>'mode'='OR' THEN 'ANY' ELSE 'ALL' END;
  new_rule.severity:=(input->>'severity')::pathways.alert_severity;new_rule.status:='DRAFT';new_rule.conditions_json:=input->'conditions';
  new_rule.expected_score_improvement:=(input->'expectations'->>'expectedScoreImprovement')::numeric;
  new_rule.manageable_follow_up_percent:=(input->'expectations'->>'manageableFollowUpPercent')::numeric;
  new_rule.created_by_id:=actor;new_rule.created_at:=moment;new_rule.updated_at:=moment;
  FOR recommendation IN SELECT value FROM pg_catalog.jsonb_array_elements(input->'recommendations') LOOP
   templates:=templates||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
    'title',pg_catalog.btrim(recommendation->>'title'),'text',pg_catalog.btrim(recommendation->>'text')));
  END LOOP;
  new_rule.definition_digest:=pg_catalog.sha256(pg_catalog.convert_to((pg_catalog.jsonb_build_object(
   'name',new_rule.name,'severity',new_rule.severity,'conditions',new_rule.conditions_json,'recommendations',templates)
   -- Expectations join the digest only when set, so a digest without them keeps its pre-0072 form.
   ||CASE WHEN new_rule.expected_score_improvement IS NOT NULL OR new_rule.manageable_follow_up_percent IS NOT NULL
    THEN pg_catalog.jsonb_build_object('expectations',pg_catalog.jsonb_build_object(
     'expectedScoreImprovement',pg_catalog.trim_scale(new_rule.expected_score_improvement)::text,
     'manageableFollowUpPercent',pg_catalog.trim_scale(new_rule.manageable_follow_up_percent)::text))
    ELSE '{}'::jsonb END)::text,'UTF8'));
  PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,NULL,pg_catalog.to_jsonb(new_rule));
  INSERT INTO pathways.alert_rules SELECT (new_rule).*;
  FOR recommendation IN SELECT value FROM pg_catalog.jsonb_array_elements(templates) LOOP
   template.id:=(recommendation->>'id')::uuid;template.organization_id:=org;template.rule_id:=target;
   template.title:=recommendation->>'title';template.text:=recommendation->>'text';template.type:='SUGGESTED_ACTION';
   template.created_by_id:=actor;template.created_at:=moment;template.updated_at:=moment;
   PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rule_recommendations'::regclass,NULL,pg_catalog.to_jsonb(template));
   INSERT INTO pathways.alert_rule_recommendations SELECT (template).*;
  END LOOP;
  IF project IS NOT NULL THEN PERFORM pathways_rules_internal.build_configuration_bindings(); END IF;
 ELSE
  IF predecessor.id IS NOT NULL THEN
   new_rule:=predecessor;new_rule.status:='ARCHIVED';new_rule.archived_at:=moment;new_rule.updated_at:=moment;
   PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,pg_catalog.to_jsonb(predecessor),pg_catalog.to_jsonb(new_rule));
   UPDATE pathways.alert_rules SET status='ARCHIVED',archived_at=moment,updated_at=moment
    WHERE id=predecessor.id AND organization_id=org AND project_id=project AND status='ACTIVE';
   IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  END IF;
  new_rule:=old_rule;new_rule.updated_at:=moment;
  IF operation='RULE_ACTIVATE' THEN new_rule.status:='ACTIVE';new_rule.activated_by_id:=actor;new_rule.activated_at:=moment;
  ELSE new_rule.status:='ARCHIVED';new_rule.archived_at:=moment; END IF;
  PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,pg_catalog.to_jsonb(old_rule),pg_catalog.to_jsonb(new_rule));
  UPDATE pathways.alert_rules SET status=new_rule.status,activated_by_id=new_rule.activated_by_id,
   activated_at=new_rule.activated_at,archived_at=new_rule.archived_at,updated_at=moment
   WHERE id=target AND organization_id=org AND project_id=project AND status=old_rule.status;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 END IF;
 result:=pathways_rules_internal.rule_json(target);
 INSERT INTO pathways_rules_internal.configuration_receipts
 (organization_id,project_id,actor_id,client_operation_id,operation_code,rule_id,canonical_request_hash,safe_result,private_note,occurred_at)
 VALUES(org,project,actor,op,operation,target,hash,result,CASE WHEN operation='RULE_ARCHIVE' THEN pg_catalog.btrim(input->>'note') ELSE NULL END,moment);
 IF operation IN ('RULE_ACTIVATE','RULE_ARCHIVE') THEN
  PERFORM pathways_rules_internal.enqueue_configuration_work();
  IF predecessor.id IS NOT NULL THEN PERFORM pathways_rules_internal.supersede_rule_evaluations(predecessor.id); END IF;
  IF operation='RULE_ARCHIVE' THEN PERFORM pathways_rules_internal.supersede_rule_evaluations(target); END IF;
 END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,'rule.'||pg_catalog.lower(pg_catalog.substring(operation,6)),'AlertRule',target,
  pg_catalog.jsonb_build_object('version',new_rule.version,'status',new_rule.status,'templateOriginId',new_rule.template_origin_id));
 IF pathways.p09_can(permission) IS DISTINCT FROM true OR (project IS NOT NULL AND pathways.p06_can(permission,project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Configuration context unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways_rules_internal.configuration_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.actor_id=actor AND c.operation_id=op;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configuration context unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 WHEN object_not_in_prerequisite_state THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
RESET ROLE;

-- 3. rules_human_owner: the rule read model.
SET LOCAL ROLE rules_human_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.rule_json(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',r.id,'projectId',r.project_id,'logicalRuleId',r.logical_rule_id,
  'templateOriginId',r.template_origin_id,'code',r.display_code,'version',r.version,'name',r.name,'severity',r.severity,
  'expectations',pg_catalog.jsonb_build_object('expectedScoreImprovement',pg_catalog.trim_scale(r.expected_score_improvement)::text,
   'manageableFollowUpPercent',pg_catalog.trim_scale(r.manageable_follow_up_percent)::text),
  'conditions',r.conditions_json,'recommendations',COALESCE((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text) ORDER BY t.id)
   FROM pathways.alert_rule_recommendations t WHERE t.organization_id=r.organization_id AND t.rule_id=r.id),'[]'::jsonb),
  'status',r.status,'activatedAt',r.activated_at,'archivedAt',r.archived_at)
 FROM pathways.alert_rules r WHERE r.id=wanted AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND r.runtime_contract_version='f10.v1'
$$;
RESET ROLE;

-- 4. rules_projection_owner: observation facts and manifest expectations.
SET LOCAL ROLE rules_projection_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.project_metric_observation(
 org uuid,project uuid,metric text,indicator uuid,activity uuid,as_of timestamptz,day date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cell jsonb;current_cell jsonb;unit text;start_on date;end_on date;project_status text;archived timestamptz;
 definition record;actual numeric;population bigint;completed bigint;missing bigint;overdue bigint;days integer;
 planned numeric;approved numeric;currencies bigint;follow bigint;mean numeric;
 facts jsonb:='{}';due bigint;no_end bigint;bound_start date;bound_end date;
BEGIN
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true OR as_of IS NULL OR day IS NULL
  OR metric NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT',
   'PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
   'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS')
  OR ((metric LIKE 'INDICATOR_%') IS DISTINCT FROM (indicator IS NOT NULL))
  OR ((metric='ACTIVITY_OVERDUE_DAYS') IS DISTINCT FROM (activity IS NOT NULL)) THEN
  RAISE EXCEPTION 'Metric projection unavailable' USING ERRCODE='42501'; END IF;
 IF metric LIKE 'INDICATOR_%' THEN
  unit:=CASE WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN 'PERCENT' ELSE 'VALUE' END;
  IF pathways_rules_internal.lease_indicator_allowed(org,project,indicator) IS DISTINCT FROM true THEN
   cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
  ELSE
   SELECT i.measurement_mode,i.numeric_kind,i.direction,i.unit_label,i.baseline_value,i.target_value,i.period_start,i.period_end,
    i.target_date INTO definition FROM pathways.project_indicators i WHERE i.id=indicator AND i.organization_id=org AND i.project_id=project;
   IF NOT FOUND THEN RAISE EXCEPTION 'Indicator projection unavailable' USING ERRCODE='42501'; END IF;
   IF metric='INDICATOR_CURRENT_VALUE' THEN unit:=COALESCE(definition.unit_label,'VALUE'); END IF;
   IF definition.measurement_mode='MANUAL' THEN
    SELECT m.value INTO actual FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
     AND m.indicator_id=indicator AND m.period_start=definition.period_start AND m.period_end=definition.period_end AND m.recorded_at<=as_of
     AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements next_measurement WHERE next_measurement.organization_id=org
      AND next_measurement.project_id=project AND next_measurement.indicator_id=indicator AND next_measurement.corrects_measurement_id=m.id
      AND next_measurement.recorded_at<=as_of) ORDER BY m.recorded_at DESC,m.id DESC LIMIT 1;
    current_cell:=CASE WHEN actual IS NULL THEN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT')
     ELSE pathways_rules_internal.numeric_cell(actual) END;
   ELSE
    SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED') INTO population,completed FROM pathways.project_activities a
     WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
      AND a.planned_end_date BETWEEN definition.period_start AND definition.period_end;
    IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
    current_cell:=CASE WHEN population=0 THEN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR')
     ELSE pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER') END;
   END IF;
   IF current_cell->>'value' IS NOT NULL AND (
    definition.numeric_kind NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
    OR (definition.numeric_kind<>'SIGNED_CHANGE' AND (current_cell->>'value')::numeric<0)
    OR (definition.numeric_kind='COUNT' AND (current_cell->>'value')::numeric<>pg_catalog.trunc((current_cell->>'value')::numeric))
    OR (definition.numeric_kind='PERCENTAGE' AND (current_cell->>'value')::numeric>100)) THEN
    current_cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC'); END IF;
   cell:=CASE WHEN metric='INDICATOR_CURRENT_VALUE' OR current_cell->>'value' IS NULL THEN current_cell
    ELSE pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
     definition.target_value::text,definition.direction) END;
   -- Severity facts (0072): converted progress and the dates that set when full progress is expected.
   facts:=pg_catalog.jsonb_build_object('progress',CASE WHEN current_cell->>'value' IS NULL THEN NULL
     WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN cell->>'value'
     ELSE pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
      definition.target_value::text,definition.direction)->>'value' END,
    'targetDate',CASE WHEN definition.target_date BETWEEN date '1900-01-01' AND date '2100-12-31' THEN definition.target_date END,
    'periodEnd',CASE WHEN definition.period_end BETWEEN date '1900-01-01' AND date '2100-12-31' THEN definition.period_end END);
  END IF;
 ELSIF metric LIKE 'PROJECT_%' THEN
  unit:=CASE WHEN metric='PROJECT_TIMELINE_ELAPSED_PERCENT' THEN 'PERCENT' ELSE 'DAYS' END;
  SELECT p.start_date,p.end_date,p.status::text,p.archived_at INTO start_on,end_on,project_status,archived
   FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF start_on IS NULL OR end_on IS NULL THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSIF start_on>end_on OR start_on<date '1900-01-01' OR end_on>date '2100-12-31' THEN
   cell:=pathways_rules_internal.unavailable_cell('INVALID_DATES');
  ELSIF metric='PROJECT_REMAINING_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(end_on-day);
  ELSIF metric='PROJECT_OVERDUE_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(GREATEST(0,day-end_on));
  ELSIF end_on=start_on THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
  ELSE cell:=pathways_rules_internal.progress_cell(GREATEST(0,day-start_on)::text,'0',(end_on-start_on)::text,'HIGHER_IS_BETTER'); END IF;
  facts:=pg_catalog.jsonb_build_object('startDate',CASE WHEN start_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN start_on END,
   'endDate',CASE WHEN end_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN end_on END);
 ELSIF metric IN ('BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS') THEN
  -- Project-level aggregates (0060): no bindings, no per-row output, every read is lease and family scoped.
  unit:=CASE WHEN metric='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN 'POINTS' ELSE 'PERCENT' END;
  SELECT p.status::text,p.archived_at INTO project_status,archived FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF pathways_rules_internal.lease_family_allowed(org,project,CASE metric WHEN 'BUDGET_UTILIZATION_PERCENT' THEN 'BUDGET'
   WHEN 'BENEFICIARY_FOLLOW_UP_PERCENT' THEN 'BENEFICIARY' ELSE 'SURVEY' END) IS DISTINCT FROM true THEN
   cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
  ELSIF metric='BUDGET_UTILIZATION_PERCENT' THEN
   -- Approved expense total over the planned total of non-archived records; range is checked before any decimal parse.
   SELECT count(*),count(DISTINCT r.currency),COALESCE(sum(r.planned_budget),0) INTO population,currencies,planned
    FROM pathways.project_budget_records r WHERE r.organization_id=org AND r.project_id=project AND r.archived_at IS NULL;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF currencies>1 THEN cell:=pathways_rules_internal.unavailable_cell('UNSUPPORTED_SOURCE');
   ELSIF planned=0 THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
   ELSE
    SELECT COALESCE(sum(e.amount),0) INTO approved FROM pathways.budget_expense_entries e
     JOIN pathways.project_budget_records r ON r.organization_id=e.organization_id AND r.project_id=e.project_id AND r.id=e.budget_record_id
     WHERE e.organization_id=org AND e.project_id=project AND e.status='APPROVED' AND r.archived_at IS NULL;
    IF planned<0 OR approved<0 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
    ELSIF planned>=100000000000000 OR approved>=100000000000000 THEN cell:=pathways_rules_internal.unavailable_cell('PROGRESS_OUT_OF_RANGE');
    ELSE cell:=pathways_rules_internal.progress_cell(approved::text,'0',planned::text,'HIGHER_IS_BETTER'); END IF;
   END IF;
  ELSIF metric='BENEFICIARY_FOLLOW_UP_PERCENT' THEN
   -- Share of ACTIVE enrollments whose latest participation needs follow-up; small cells and complements are suppressed.
   WITH latest AS (SELECT DISTINCT ON (en.id) pa.progress_status FROM pathways.beneficiary_project_enrollments en
     JOIN pathways.beneficiary_activity_participations pa ON pa.organization_id=en.organization_id AND pa.project_id=en.project_id
      AND pa.enrollment_id=en.id
     WHERE en.organization_id=org AND en.project_id=project AND en.status='ACTIVE'
     ORDER BY en.id,pa.participation_date DESC,pa.recorded_at DESC,pa.id DESC)
   SELECT count(*),count(*) FILTER(WHERE l.progress_status='NEEDS_FOLLOW_UP') INTO population,follow FROM latest l;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF population<5 OR follow BETWEEN 1 AND 4 OR population-follow BETWEEN 1 AND 4 THEN
    cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
   ELSE cell:=pathways_rules_internal.progress_cell(follow::text,'0',population::text,'HIGHER_IS_BETTER'); END IF;
  ELSE
   -- Mean of post minus pre percentage points over each enrollment's latest valid PRE_TEST and POST_TEST (0045 validity).
   WITH valid AS (SELECT ar.id,ar.enrollment_id,ar.type,ar.assessment_date,ar.score,ar.maximum_score FROM pathways.assessment_results ar
     WHERE ar.organization_id=org AND ar.project_id=project AND ar.type IN ('PRE_TEST','POST_TEST') AND ar.enrollment_id IS NOT NULL
      AND ar.score<>'NaN'::numeric AND ar.maximum_score<>'NaN'::numeric AND ar.maximum_score>0),
    latest AS (SELECT DISTINCT ON (v.enrollment_id,v.type) v.enrollment_id,v.type,v.score*100/v.maximum_score AS pct FROM valid v
     ORDER BY v.enrollment_id,v.type,v.assessment_date DESC,v.id DESC)
   SELECT count(*),pg_catalog.round(avg(post.pct-pre.pct),4) INTO population,mean FROM latest pre
    JOIN latest post ON post.enrollment_id=pre.enrollment_id AND pre.type='PRE_TEST' AND post.type='POST_TEST';
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF population<5 THEN cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
   ELSIF mean IS NULL OR mean<-100 OR mean>100 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
   ELSE cell:=pathways_rules_internal.numeric_cell(mean); END IF;
  END IF;
 ELSE
  unit:=CASE WHEN metric='ACTIVITY_COMPLETION_PERCENT' THEN 'PERCENT' WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END;
  SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED'),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND (a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31')),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND a.planned_end_date<day),
   max(CASE WHEN a.status='COMPLETED' THEN 0 ELSE GREATEST(0,day-a.planned_end_date) END),
   count(*) FILTER(WHERE a.planned_end_date BETWEEN date '1900-01-01' AND date '2100-12-31' AND a.planned_end_date<=day),
   count(*) FILTER(WHERE a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31'),
   min(a.planned_start_date),min(a.planned_end_date)
   INTO population,completed,missing,overdue,days,due,no_end,bound_start,bound_end FROM pathways.project_activities a
   WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
    AND (activity IS NULL OR a.id=activity);
  IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
  IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
  ELSIF metric='ACTIVITY_COMPLETION_PERCENT' THEN cell:=pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER');
  ELSIF missing>0 THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSE cell:=pathways_rules_internal.numeric_cell(CASE WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN overdue ELSE days END); END IF;
  -- Every included activity counts toward the totals, completed ones too; a bound activity also gives its planned dates.
  facts:=pg_catalog.jsonb_build_object('included',population,'dueByDate',due,'missingEnd',no_end)
   ||CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN pg_catalog.jsonb_build_object(
    'activityStart',CASE WHEN bound_start BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_start END,
    'activityEnd',CASE WHEN bound_end BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_end END) ELSE '{}'::jsonb END;
 END IF;
 PERFORM pathways_rules_internal.validate_metric_cell(cell);
 RETURN pg_catalog.jsonb_build_object('metric',metric,'cell',cell,'unit',unit,
  'facts',pg_catalog.jsonb_build_object('metric',metric,'value',cell->'value','reportingDate',day)||facts);
END $$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.capture_rule_snapshot(wanted_job uuid,nonce text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context pathways_rules_internal.projection_context;state pathways_rules_internal.project_state;calendar record;
 rule record;binding record;observations jsonb:='{}';rule_observations jsonb;manifest jsonb:='[]';source_inputs jsonb;
 fingerprints jsonb:='{}';observation jsonb;recommendations jsonb;classification bytea;canonical jsonb;digest bytea;
 snapshot uuid:=pg_catalog.gen_random_uuid();as_of timestamptz(3);day date;rules_seen integer:=0;eligible boolean;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 PERFORM pathways_rules_internal.install_capture_context(wanted_job,nonce);
 SELECT c.* INTO context FROM pathways_rules_internal.projection_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.purpose='CAPTURE';
 IF NOT FOUND THEN RAISE EXCEPTION 'Capture context unavailable' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO state FROM pathways_rules_internal.project_state s WHERE s.organization_id=context.organization_id AND s.project_id=context.project_id;
 SELECT c.version,c.zone INTO calendar FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND OR state.organization_id IS NULL OR NOT state.bootstrap_complete THEN
  RAISE EXCEPTION 'Capture source unavailable' USING ERRCODE='55000'; END IF;
 as_of:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());day:=(as_of AT TIME ZONE calendar.zone)::date;
 FOR rule IN SELECT r.id,r.logical_rule_id,r.version,r.conditions_json,r.definition_digest,r.name,r.severity,
  r.expected_score_improvement,r.manageable_follow_up_percent
  FROM pathways.alert_rules r WHERE r.organization_id=context.organization_id AND r.project_id=context.project_id
   AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE' ORDER BY r.id LOOP
  rules_seen:=rules_seen+1;
  IF rules_seen>20 THEN RAISE EXCEPTION 'Active rules exceed approved bound' USING ERRCODE='54000'; END IF;
  rule_observations:='{}';eligible:=pathways_rules_internal.lease_rule_exposure_allowed(rule.id);
  FOR binding IN SELECT b.condition_id,b.metric_key,b.indicator_id,b.activity_id FROM pathways_rules_internal.rule_bindings b
   WHERE b.organization_id=context.organization_id AND b.project_id=context.project_id AND b.rule_version_id=rule.id ORDER BY b.condition_id LOOP
   IF eligible THEN
    observation:=pathways_rules_internal.project_metric_observation(context.organization_id,context.project_id,
     binding.metric_key,binding.indicator_id,binding.activity_id,as_of,day);
   ELSE
    observation:=pg_catalog.jsonb_build_object('metric',binding.metric_key,'cell',pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED'),
     'unit',CASE WHEN binding.metric_key='INDICATOR_CURRENT_VALUE' THEN 'VALUE'
      WHEN binding.metric_key IN ('INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT','ACTIVITY_COMPLETION_PERCENT',
       'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT') THEN 'PERCENT'
      WHEN binding.metric_key='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN 'POINTS'
      WHEN binding.metric_key='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END,
     'facts',pg_catalog.jsonb_build_object('metric',binding.metric_key,'value',NULL,'reportingDate',day));
   END IF;
   rule_observations:=rule_observations||pg_catalog.jsonb_build_object(binding.condition_id,observation);
  END LOOP;
  -- Validates the complete bounded tree, bindings, cells and domains now; no
  -- partial or substituted leaf may reach the immutable captured manifest.
  PERFORM pathways_rules_internal.evaluate_snapshot_rule(rule.conditions_json,rule_observations);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text,'type',t.type)
   ORDER BY t.id),'[]'::jsonb) INTO recommendations FROM pathways.alert_rule_recommendations t
   WHERE t.organization_id=context.organization_id AND t.rule_id=rule.id;
  IF pg_catalog.jsonb_array_length(recommendations) NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Predefined recommendations unavailable' USING ERRCODE='55000'; END IF;
  classification:=pathways_rules_internal.classification_fingerprint(rule.id);
  manifest:=manifest||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('ruleId',rule.id,'logicalRuleId',rule.logical_rule_id,
   'version',rule.version,'conditions',rule.conditions_json,'definitionDigest',pg_catalog.encode(rule.definition_digest,'hex'),
   'name',rule.name,'severity',rule.severity,
   'expectations',pg_catalog.jsonb_build_object('expectedScoreImprovement',pg_catalog.trim_scale(rule.expected_score_improvement)::text,
    'manageableFollowUpPercent',pg_catalog.trim_scale(rule.manageable_follow_up_percent)::text),'recommendations',recommendations,'eligible',eligible,'classificationFingerprint',pg_catalog.encode(classification,'hex')));
  observations:=observations||pg_catalog.jsonb_build_object(rule.id::text,rule_observations);
  fingerprints:=fingerprints||pg_catalog.jsonb_build_object(rule.id::text,
   pg_catalog.encode(pathways_rules_internal.rule_dependency_fingerprint(rule.id,as_of),'hex'));
 END LOOP;
 source_inputs:=pg_catalog.jsonb_build_object('resourceFingerprints',fingerprints);
 canonical:=pg_catalog.jsonb_build_object('organizationId',context.organization_id,'projectId',context.project_id,'jobId',context.job_id,
  'requiredGeneration',state.required_generation::text,'sourceWatermark',state.source_watermark::text,
  'calendar',pg_catalog.jsonb_build_object('version',calendar.version::text,'zone',calendar.zone),
  'asOf',pathways_rules_internal.utc_milliseconds(as_of),'reportingDate',day,'manifest',manifest,
  'observations',observations,'sourceInputs',source_inputs);
 digest:=pg_catalog.sha256(pg_catalog.convert_to(canonical::text,'UTF8'));
 IF pathways_rules_internal.lease_metric_scope(context.organization_id,context.project_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.snapshots(id,job_id,organization_id,project_id,lease_hash,lease_session,
  required_generation,source_watermark,calendar_version,as_of,reporting_date,zone,manifest,observations,source_inputs,canonical_payload,digest)
 VALUES(snapshot,context.job_id,context.organization_id,context.project_id,context.lease_hash,session_user,
  state.required_generation,state.source_watermark,calendar.version,as_of,day,calendar.zone,manifest,observations,source_inputs,canonical,digest);
 PERFORM pathways_rules_internal.remove_projection_context();
 RETURN pg_catalog.jsonb_build_object('snapshotId',snapshot,'digest',pg_catalog.encode(digest,'hex'),
  'requiredGeneration',state.required_generation::text,'sourceWatermark',state.source_watermark::text,'calendarVersion',calendar.version::text,
  'asOf',pathways_rules_internal.utc_milliseconds(as_of),'reportingDate',day,'zone',calendar.zone);
END $$;
RESET ROLE;

-- 5. prisma: the SQL classifier, the twin of packages/shared/src/rules/severity/severity-classify.ts.
-- Exact ratio n/d rounded once to four places, half away from zero, as fixed text.
CREATE FUNCTION pathways_rules_internal.severity_shown(n numeric,d numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q numeric;
BEGIN
 IF n IS NULL OR d IS NULL OR d=0 THEN RAISE EXCEPTION 'Invalid severity ratio' USING ERRCODE='22023'; END IF;
 q:=pg_catalog.div(pg_catalog.abs(n)*10000,pg_catalog.abs(d));
 IF pg_catalog.mod(pg_catalog.abs(n)*10000,pg_catalog.abs(d))*2>=pg_catalog.abs(d) THEN q:=q+1; END IF;
 IF (n<0)<>(d<0) THEN q:=-q; END IF;
 RETURN pg_catalog.round(q*0.0001,4)::text;
END $$;

-- A YYYY-MM-DD calendar date from 1900 to 2100, or null when the text is anything else.
CREATE FUNCTION pathways_rules_internal.severity_calendar_date(value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE y integer;m integer;dd integer;
BEGIN
 IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR value COLLATE pg_catalog."C"<'1900-01-01' OR value COLLATE pg_catalog."C">'2100-12-31' THEN RETURN NULL; END IF;
 y:=pg_catalog.substr(value,1,4)::integer;m:=pg_catalog.substr(value,6,2)::integer;dd:=pg_catalog.substr(value,9,2)::integer;
 IF m NOT BETWEEN 1 AND 12 OR dd<1
  OR dd>pg_catalog.date_part('day',pg_catalog.make_date(y,m,1)+interval '1 month'-interval '1 day') THEN RETURN NULL; END IF;
 RETURN pg_catalog.make_date(y,m,dd);
END $$;

-- Three-valued result of a rule node, as in the rule engine; a leaf without a result is UNAVAILABLE.
CREATE FUNCTION pathways_rules_internal.severity_node_result(node jsonb,results jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE child jsonb;r text;saw_true boolean:=false;saw_false boolean:=false;saw_unknown boolean:=false;
BEGIN
 IF node->>'kind'='CONDITION' THEN RETURN COALESCE(results->>(node->>'id'),'UNAVAILABLE'); END IF;
 FOR child IN SELECT v.value FROM pg_catalog.jsonb_array_elements(node->'children') v LOOP
  r:=pathways_rules_internal.severity_node_result(child,results);
  saw_true:=saw_true OR r='TRUE';saw_false:=saw_false OR r='FALSE';saw_unknown:=saw_unknown OR r='UNAVAILABLE';
 END LOOP;
 RETURN CASE WHEN node->>'mode'='AND' AND saw_false THEN 'FALSE' WHEN node->>'mode'='OR' AND saw_true THEN 'TRUE'
  WHEN saw_unknown THEN 'UNAVAILABLE' WHEN node->>'mode'='AND' THEN 'TRUE' ELSE 'FALSE' END;
END $$;

-- Judges one counted condition against its facts and the rule expectations (severity-guide-v0.2 sections 5.1 to 5.11).
CREATE FUNCTION pathways_rules_internal.severity_condition_basis(node jsonb,f jsonb,e jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE metric text:=node->>'metric';outcome text:='LEVEL';missing text;kind text;lvl text;
 an numeric;ad numeric:=10000;en numeric;ed numeric;vn numeric;vd numeric;v numeric;
 progress text;due text;start_text text;end_text text;start_on date;end_on date;low numeric;medium numeric;
BEGIN
 IF metric IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT') THEN
  progress:=CASE WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN f->>'value' ELSE f->>'progress' END;
  due:=COALESCE(f->>'targetDate',f->>'periodEnd');
  IF progress IS NULL THEN outcome:='CONTEXT_REQUIRED';missing:='INDICATOR_BASELINE_TARGET_DIRECTION';
  ELSIF pathways_rules_internal.severity_calendar_date(due) IS NULL
   OR (f->>'reportingDate') COLLATE pg_catalog."C"<due COLLATE pg_catalog."C" THEN
   outcome:='CONTEXT_REQUIRED';missing:='EXPECTED_PROGRESS_FOR_DATE';
  ELSE kind:='BEHIND_PERCENT';an:=pathways_rules_internal.decimal_value(progress)*10000;en:=100;ed:=1;
  END IF;
 ELSIF metric='ACTIVITY_COMPLETION_PERCENT' THEN
  IF f->>'included' IS NULL OR (f->>'included')::numeric<=0 OR f->>'dueByDate' IS NULL THEN
   outcome:='CONTEXT_REQUIRED';missing:='ACTIVITY_TOTAL';
  ELSIF f->>'missingEnd' IS NULL OR (f->>'missingEnd')::numeric<>0 THEN
   outcome:='CONTEXT_REQUIRED';missing:='ACTIVITY_PLANNED_END_DATES';
  ELSE kind:='BEHIND_PERCENT';an:=pathways_rules_internal.decimal_value(f->>'value')*10000;
   en:=(f->>'dueByDate')::numeric*100;ed:=(f->>'included')::numeric;
  END IF;
 ELSIF metric='ACTIVITY_OVERDUE_COUNT' THEN
  -- An available count dates every unfinished activity, so a completed one without an end is ignored.
  IF f->>'included' IS NULL OR (f->>'included')::numeric<=0 THEN outcome:='CONTEXT_REQUIRED';missing:='ACTIVITY_TOTAL';
  ELSE kind:='OVERDUE_SHARE';an:=pathways_rules_internal.decimal_value(f->>'value')*10000;
   en:=(f->>'included')::numeric;ed:=1;vn:=an*100;vd:=10000*en;
  END IF;
 ELSIF metric='PROJECT_TIMELINE_ELAPSED_PERCENT' THEN outcome:='EXPLANATORY';
 ELSIF metric IN ('PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS','ACTIVITY_OVERDUE_DAYS') THEN
  v:=pathways_rules_internal.decimal_value(f->>'value')*10000;
  IF metric='PROJECT_REMAINING_DAYS' AND v>=0 THEN outcome:='EXPLANATORY';
  ELSE
   -- A delay is judged as a share of the planned duration in whole days.
   start_text:=CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN f->>'activityStart' ELSE f->>'startDate' END;
   end_text:=CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN f->>'activityEnd' ELSE f->>'endDate' END;
   start_on:=pathways_rules_internal.severity_calendar_date(start_text);end_on:=pathways_rules_internal.severity_calendar_date(end_text);
   IF start_on IS NULL OR end_on IS NULL OR end_on<start_on THEN outcome:='CONTEXT_REQUIRED';
    missing:=CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN 'ACTIVITY_DATES' ELSE 'PROJECT_DATES' END;
   ELSIF end_on=start_on THEN outcome:='CONTEXT_REQUIRED';
    missing:=CASE WHEN metric='ACTIVITY_OVERDUE_DAYS' THEN 'SAME_DAY_ACTIVITY' ELSE 'SAME_DAY_PROJECT' END;
   ELSE kind:='DELAY_SHARE';an:=CASE WHEN metric='PROJECT_REMAINING_DAYS' THEN -v ELSE v END;
    en:=end_on-start_on;ed:=1;vn:=an*100;vd:=10000*en;
   END IF;
  END IF;
 ELSIF metric='BUDGET_UTILIZATION_PERCENT' THEN
  kind:='BUDGET_PERCENT';an:=pathways_rules_internal.decimal_value(f->>'value')*10000;vn:=an;vd:=10000;
  IF an<=100*10000 THEN outcome:='EXPLANATORY'; END IF;
 ELSIF metric='BENEFICIARY_FOLLOW_UP_PERCENT' THEN
  IF e->>'manageableFollowUpPercent' IS NULL THEN outcome:='CONTEXT_REQUIRED';missing:='MANAGEABLE_FOLLOW_UP_LEVEL';
  ELSE kind:='POINTS_ABOVE';an:=pathways_rules_internal.decimal_value(f->>'value')*10000;
   en:=pathways_rules_internal.decimal_value(e->>'manageableFollowUpPercent')*10000;ed:=10000;vn:=an-en;vd:=10000;
  END IF;
 ELSIF metric='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN
  IF e->>'expectedScoreImprovement' IS NULL THEN outcome:='CONTEXT_REQUIRED';missing:='EXPECTED_SCORE_IMPROVEMENT';
  ELSE kind:='POINTS_BELOW';an:=pathways_rules_internal.decimal_value(f->>'value')*10000;
   en:=pathways_rules_internal.decimal_value(e->>'expectedScoreImprovement')*10000;ed:=10000;vn:=en-an;vd:=10000;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid severity metric' USING ERRCODE='22023';
 END IF;
 -- Behind plan is (expected - actual) / expected * 100; a zero expectation has no shortfall.
 IF kind='BEHIND_PERCENT' THEN
  IF en=0 THEN vn:=0;vd:=1; ELSE vn:=(en*10000-an*ed)*100;vd:=10000*en; END IF;
 END IF;
 IF outcome='LEVEL' THEN
  -- Inclusive upper bounds of Low and Medium, compared by cross-multiplication so nothing is rounded first.
  low:=CASE kind WHEN 'BEHIND_PERCENT' THEN 10 WHEN 'DELAY_SHARE' THEN 5 WHEN 'OVERDUE_SHARE' THEN 5
   WHEN 'BUDGET_PERCENT' THEN 100 ELSE 5 END;
  medium:=CASE kind WHEN 'BEHIND_PERCENT' THEN 25 WHEN 'DELAY_SHARE' THEN 10 WHEN 'OVERDUE_SHARE' THEN 15
   WHEN 'BUDGET_PERCENT' THEN 110 WHEN 'POINTS_ABOVE' THEN 15 ELSE 10 END;
  lvl:=CASE WHEN vn<=low*vd THEN 'LOW' WHEN vn<=medium*vd THEN 'MEDIUM' ELSE 'HIGH' END;
 END IF;
 RETURN pg_catalog.jsonb_build_object('conditionId',node->>'id','metric',metric,'outcome',outcome,'level',lvl,
  'measure',CASE WHEN kind IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('kind',kind,
   'actual',pathways_rules_internal.severity_shown(an,ad),
   'expected',CASE WHEN en IS NULL THEN NULL ELSE pathways_rules_internal.severity_shown(en,ed) END,
   'value',pathways_rules_internal.severity_shown(vn,vd)) END,
  'missing',missing);
END $$;

-- Severity basis of a matched rule from its counted conditions, mirroring the shared classifyAlertSeverity exactly.
CREATE FUNCTION pathways_rules_internal.classify_alert_severity(tree jsonb,results jsonb,facts jsonb,expectations jsonb,rule_severity text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE pending jsonb[]:=ARRAY[tree];node jsonb;child jsonb;leaf jsonb;n integer;r text;
 counted jsonb[]:=ARRAY[]::jsonb[];unchecked text[]:=ARRAY[]::text[];absent text;
 conditions jsonb;missing jsonb;top text;delivery text;decisive text;classified boolean;
BEGIN
 IF pathways_rules_internal.severity_node_result(tree,results) IS DISTINCT FROM 'TRUE' THEN
  RAISE EXCEPTION 'Only a matched rule has a severity.' USING ERRCODE='22023'; END IF;
 -- Only children that made a group TRUE count; unavailable leaves of an unconfirmed child are listed as unchecked.
 WHILE pg_catalog.cardinality(pending)>0 LOOP
  n:=pg_catalog.cardinality(pending);node:=pending[n];pending:=pending[1:n-1];
  IF node->>'kind'='CONDITION' THEN counted:=pg_catalog.array_append(counted,node); CONTINUE; END IF;
  FOR child IN SELECT v.value FROM pg_catalog.jsonb_array_elements(node->'children') v LOOP
   r:=pathways_rules_internal.severity_node_result(child,results);
   IF r='TRUE' THEN pending:=pg_catalog.array_append(pending,child);
   ELSIF r='UNAVAILABLE' THEN
    FOR leaf IN SELECT v FROM pg_catalog.jsonb_path_query(child,'strict $.** ? (@.kind == "CONDITION")') v LOOP
     IF COALESCE(results->>(leaf->>'id'),'UNAVAILABLE')='UNAVAILABLE' THEN unchecked:=pg_catalog.array_append(unchecked,leaf->>'id'); END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 SELECT min(c->>'id' COLLATE pg_catalog."C") INTO absent FROM pg_catalog.unnest(counted) c
  WHERE pg_catalog.jsonb_typeof(facts->(c->>'id')) IS DISTINCT FROM 'object';
 IF absent IS NOT NULL THEN RAISE EXCEPTION 'Severity facts are missing for condition %.',absent USING ERRCODE='22023'; END IF;
 -- A repeated figure stays as evidence; the level is a maximum, so it never counts twice.
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.severity_condition_basis(c,facts->(c->>'id'),expectations)
  ORDER BY c->>'id' COLLATE pg_catalog."C"),'[]'::jsonb) INTO conditions FROM pg_catalog.unnest(counted) c;
 SELECT c.value->>'level' INTO top FROM pg_catalog.jsonb_array_elements(conditions) c WHERE c.value->>'outcome'='LEVEL'
  ORDER BY CASE c.value->>'level' WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC LIMIT 1;
 -- High spending with low delivery: budget used at least 90 and a High delivery condition, both counted.
 IF EXISTS(SELECT FROM pg_catalog.jsonb_array_elements(conditions) c WHERE c.value->>'metric'='BUDGET_UTILIZATION_PERCENT'
  AND pg_catalog.jsonb_typeof(c.value->'measure')='object' AND (c.value->'measure'->>'actual')::numeric>=90) THEN
  SELECT c.value->>'conditionId' INTO delivery FROM pg_catalog.jsonb_array_elements(conditions) WITH ORDINALITY c(value,ord)
   WHERE c.value->>'outcome'='LEVEL' AND c.value->>'level'='HIGH'
    AND c.value->>'metric' IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT','ACTIVITY_COMPLETION_PERCENT')
   ORDER BY c.ord LIMIT 1;
 END IF;
 SELECT c.value->>'conditionId' INTO decisive FROM pg_catalog.jsonb_array_elements(conditions) WITH ORDINALITY c(value,ord)
  WHERE c.value->>'outcome'='LEVEL' AND c.value->>'level'=top ORDER BY c.ord LIMIT 1;
 SELECT COALESCE(pg_catalog.jsonb_agg(m.code ORDER BY m.code COLLATE pg_catalog."C"),'[]'::jsonb) INTO missing
  FROM (SELECT DISTINCT c.value->>'missing' AS code FROM pg_catalog.jsonb_array_elements(conditions) c
   WHERE c.value->>'missing' IS NOT NULL) m;
 IF top IS NULL AND missing='[]'::jsonb THEN missing:='["DELIVERY_EXPECTATION"]'::jsonb; END IF;
 classified:=top='HIGH' OR (top IS NOT NULL AND missing='[]'::jsonb);
 RETURN pg_catalog.jsonb_build_object('criteriaVersion','severity-guide-v0.2',
  'status',CASE WHEN classified THEN 'CLASSIFIED' ELSE 'CONTEXT_REQUIRED' END,
  'level',CASE WHEN classified THEN top END,'supportedLevel',top,
  'decisiveConditionId',COALESCE(delivery,decisive),
  'combination',CASE WHEN delivery IS NOT NULL THEN 'HIGH_SPENDING_LOW_DELIVERY' END,
  'manualCritical',rule_severity IS NOT DISTINCT FROM 'CRITICAL',
  'conditions',conditions,'missing',missing,
  'unchecked',(SELECT COALESCE(pg_catalog.jsonb_agg(u.id ORDER BY u.id COLLATE pg_catalog."C"),'[]'::jsonb)
   FROM (SELECT DISTINCT x AS id FROM pg_catalog.unnest(unchecked) x) u));
END $$;

REVOKE ALL ON FUNCTION pathways_rules_internal.severity_shown(numeric,numeric),pathways_rules_internal.severity_calendar_date(text),
 pathways_rules_internal.severity_node_result(jsonb,jsonb),pathways_rules_internal.severity_condition_basis(jsonb,jsonb,jsonb),
 pathways_rules_internal.classify_alert_severity(jsonb,jsonb,jsonb,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.severity_shown(numeric,numeric),pathways_rules_internal.severity_calendar_date(text),
 pathways_rules_internal.severity_node_result(jsonb,jsonb),pathways_rules_internal.severity_condition_basis(jsonb,jsonb,jsonb),
 pathways_rules_internal.classify_alert_severity(jsonb,jsonb,jsonb,jsonb,text) TO rules_commit_owner;

-- 6. Part 2: classification at snapshot commit and the alert read model, each function replaced by its own owner.
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
  -- An undecided recommendation closes with its auto-resolved alert (0059) and an alert may move its severity (0072); no other commit write is permitted.
  IF wanted_action='UPDATE' AND NOT (
   (relation_name='ALERT' AND (new_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at','severity','severity_basis','severity_change'])
      IS NOT DISTINCT FROM (old_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at','severity','severity_basis','severity_change']))
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
    AND (wanted_action<>'INSERT' OR (e.result='TRUE' AND e.evidence=new_row->'evaluated_snapshot'))
    -- Severity moves only with a new basis, which must be the one stored on this commit's matched evaluation (0072).
    AND ((new_row->'severity_basis' IS NOT DISTINCT FROM old_row->'severity_basis' AND new_row->'severity' IS NOT DISTINCT FROM old_row->'severity')
     OR (e.result='TRUE' AND e.evidence->'severityBasis'=new_row->'severity_basis'))) THEN
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
        -- A direct alert outcome on a terminal alert is refused; recommendation outcomes keep their behavior (G-F10-4, 0059).
        AND (c.operation_code='RECOMMENDATION_CONFIRM' OR old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED'))
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
 basis jsonb;results jsonb;facts jsonb;
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
  condition_units:='[]';observed:='{}';results:='{}';facts:='{}';basis:=NULL;
  FOR leaf IN SELECT value FROM pg_catalog.jsonb_array_elements(result->'conditions') ORDER BY value->>'conditionId' LOOP
   condition_units:=condition_units||pg_catalog.jsonb_build_array(leaf||pg_catalog.jsonb_build_object('unit',
    captured.observations->rule_id::text->(leaf->>'conditionId')->>'unit'));
   observed:=observed||pg_catalog.jsonb_build_object(leaf->>'conditionId',leaf->'cell');
   -- Severity inputs (0072): every leaf result, and the captured facts of each TRUE leaf only.
   results:=results||pg_catalog.jsonb_build_object(leaf->>'conditionId',leaf->>'result');
   IF leaf->>'result'='TRUE' THEN facts:=facts||pg_catalog.jsonb_build_object(leaf->>'conditionId',
    captured.observations->rule_id::text->(leaf->>'conditionId')->'facts'); END IF;
  END LOOP;
  evidence:=result||pg_catalog.jsonb_build_object('conditions',condition_units,'snapshotId',captured.id,
   'asOf',pathways_rules_internal.utc_milliseconds(captured.as_of),'reportingDate',captured.reporting_date,
   'calendar',pg_catalog.jsonb_build_object('zone',captured.zone,'version',captured.calendar_version::text));
  -- Each matched evaluation stores its own severity basis (0072).
  IF result->>'result'='TRUE' THEN
   basis:=pathways_rules_internal.classify_alert_severity(entry->'conditions',results,facts,entry->'expectations',entry->>'severity');
   evidence:=evidence||pg_catalog.jsonb_build_object('severityBasis',basis);
  END IF;
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
   new_alert.severity:=(CASE WHEN entry->>'severity'='CRITICAL' THEN 'CRITICAL' ELSE basis->>'level' END)::pathways.alert_severity;
   new_alert.severity_basis:=basis;new_alert.observed_values:=observed;new_alert.evaluated_snapshot:=evidence;
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
   -- An open alert with a basis takes each matched basis; a new status or level moves its severity and records the change (0072).
   IF result->>'result'='TRUE' AND old_alert.severity_basis IS NOT NULL AND old_alert.lifecycle IN ('NEW','REVIEWED','ACTIONED') THEN
    new_alert.severity_basis:=basis;
    IF (basis->>'status',basis->>'level') IS DISTINCT FROM (old_alert.severity_basis->>'status',old_alert.severity_basis->>'level') THEN
     new_alert.severity:=(CASE WHEN entry->>'severity'='CRITICAL' THEN 'CRITICAL' ELSE basis->>'level' END)::pathways.alert_severity;
     new_alert.severity_change:=pg_catalog.jsonb_build_object('from',old_alert.severity,'to',new_alert.severity,
      'at',pathways_rules_internal.utc_milliseconds(moment),'previous',old_alert.severity_basis);
    END IF;
   END IF;
   PERFORM pathways_rules_internal.install_commit_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
   UPDATE pathways.rule_based_alerts SET latest_evaluation_id=evaluation,revision=new_alert.revision,lifecycle=new_alert.lifecycle,updated_at=moment,
    severity=new_alert.severity,severity_basis=new_alert.severity_basis,severity_change=new_alert.severity_change
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

SET LOCAL ROLE rules_human_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.alert_json(wanted uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',a.id,'projectId',a.project_id,'ruleId',a.rule_id,'ruleVersion',r.version,
  'title',a.title,'explanation',a.message,'severity',a.severity,
  'severityBasis',a.severity_basis,'severityChange',a.severity_change,'lifecycle',a.lifecycle,'revision',a.revision::text,
  'evaluatedAt',a.evaluated_at,'freshness',pathways_rules_internal.resource_freshness(a.id),
  'conditions',r.conditions_json,'asOf',a.evaluated_snapshot->'asOf',
  'reportingDate',a.evaluated_snapshot->'reportingDate','calendar',a.evaluated_snapshot->'calendar',
  'evidence',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'conditionId',leaf->>'conditionId','metric',leaf->>'metric','operator',leaf->>'operator',
   'threshold',leaf->>'threshold','thresholdMaximum',leaf->>'thresholdMaximum',
   'cell',pg_catalog.jsonb_build_object('state',leaf->'cell'->>'state','value',leaf->'cell'->'value','reason',leaf->'cell'->'reason'),
   'unit',leaf->>'unit','result',leaf->>'result') ORDER BY leaf->>'conditionId')
   FROM pg_catalog.jsonb_array_elements(a.evaluated_snapshot->'conditions') leaf),'[]'::jsonb),
  'predefinedRecommendations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',t.id,'title',t.title,'text',t.text) ORDER BY t.id) FROM pathways.alert_rule_recommendations t
   WHERE t.organization_id=a.organization_id AND t.rule_id=a.rule_id),'[]'::jsonb),
  'linkedRecommendationIds',CASE WHEN pathways.p06_can('recommendations.read',a.project_id) IS TRUE THEN
   COALESCE((SELECT pg_catalog.jsonb_agg(d.id ORDER BY d.id) FROM pathways.decision_recommendations d
    WHERE d.organization_id=a.organization_id AND d.project_id=a.project_id AND d.alert_id=a.id
     AND d.runtime_contract_version='f10.v1'),'[]'::jsonb) ELSE '[]'::jsonb END)
 FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.organization_id=a.organization_id AND r.id=a.rule_id
 WHERE a.id=wanted AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1'
$$;
RESET ROLE;

-- 7. The schema owner takes back every loan from step 0.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM prisma,rules_projection_owner,rules_config_owner,rules_human_owner,
 rules_commit_owner,rules_runtime_guard_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0072.had_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways_rules_internal FROM prisma; END IF;
END $$;
RESET ROLE;

-- 8. Postconditions; functions are resolved by text because prisma holds no USAGE on the schema.
DO $$ DECLARE fn record; wanted record; BEGIN
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.validate_configuration_input(jsonb,text)','rules_config_owner',false,'i','9907d1ba98c5fe890b8220f9ecf4e8f2'),
  (1,'pathways_rules_internal.configuration_operation(uuid,jsonb,text)','rules_config_owner',true,'v','edbaf221645a04c039d494097b73c4fd'),
  (2,'pathways_rules_internal.rule_json(uuid)','rules_human_owner',false,'s','519d441502e52ba1e9a403fd99215901'),
  (3,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s','5dba57ac3d29beaeb201db5d51cb5e6e'),
  (4,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','0ed70417ea4783a8972f7a882c977560'),
  (5,'pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)','rules_runtime_guard_owner',true,'v','5471c4a385d7bef25f59b068fa95c6e8'),
  (6,'pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea)','rules_commit_owner',true,'v','78bdeafefc3861eba6aeb5fa395296dd'),
  (7,'pathways_rules_internal.alert_json(uuid)','rules_human_owner',false,'v','34642b36d3ff722a7686417c83cbff89')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)=wanted.source_md5
   OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0072.acl_'||wanted.n)
  THEN RAISE EXCEPTION '0072 replaced function postcondition failed for %',wanted.signature; END IF;
 END LOOP;
 FOR fn IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways_rules_internal' AND p.proname IN ('classify_alert_severity','severity_shown','severity_calendar_date',
   'severity_node_result','severity_condition_basis') LOOP
  IF pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef OR fn.provolatile<>'i'
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR NOT pg_catalog.has_function_privilege('rules_commit_owner',fn.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('anon',fn.oid,'EXECUTE') OR pg_catalog.has_function_privilege('authenticated',fn.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('service_role',fn.oid,'EXECUTE') OR pg_catalog.has_function_privilege('pathways_runtime',fn.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('pathways_rules_worker',fn.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('pathways_rules_sweeper',fn.oid,'EXECUTE')
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(fn.proacl) a WHERE a.grantee=0)
  THEN RAISE EXCEPTION '0072 classifier postcondition failed for %',fn.proname; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways_rules_internal' AND p.proname IN ('classify_alert_severity','severity_shown','severity_calendar_date',
   'severity_node_result','severity_condition_basis'))<>5
 THEN RAISE EXCEPTION '0072 classifier set postcondition failed'; END IF;
 IF (SELECT attnotnull OR atthasdef FROM pg_catalog.pg_attribute WHERE attrelid='pathways.alert_rules'::pg_catalog.regclass AND attname='severity')
  OR (SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid='pathways.rule_based_alerts'::pg_catalog.regclass AND attname='severity')
  OR (SELECT count(*) FROM pg_catalog.pg_attribute WHERE NOT attisdropped
   AND ((attrelid='pathways.alert_rules'::pg_catalog.regclass AND attname IN ('expected_score_improvement','manageable_follow_up_percent')
     AND atttypid='pg_catalog.numeric'::pg_catalog.regtype)
    OR (attrelid='pathways.rule_based_alerts'::pg_catalog.regclass AND attname IN ('severity_basis','severity_change')
     AND atttypid='pg_catalog.jsonb'::pg_catalog.regtype)))<>4
  OR NOT pg_catalog.has_column_privilege('rules_projection_owner','pathways.alert_rules','expected_score_improvement','SELECT')
  OR NOT pg_catalog.has_column_privilege('rules_human_owner','pathways.alert_rules','manageable_follow_up_percent','SELECT')
  OR NOT pg_catalog.has_column_privilege('rules_projection_owner','pathways.project_indicators','target_date','SELECT')
  OR NOT pg_catalog.has_column_privilege('rules_commit_owner','pathways.rule_based_alerts','severity_change','UPDATE')
  OR NOT pg_catalog.has_column_privilege('rules_human_owner','pathways.rule_based_alerts','severity_basis','SELECT')
  OR pg_catalog.has_column_privilege('rules_outcome_owner','pathways.rule_based_alerts','severity_basis','UPDATE')
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.rule_based_alerts'::pg_catalog.regclass
   AND conname='rule_based_alerts_severity_basis_check' AND contype='c' AND convalidated
   AND pg_catalog.pg_get_constraintdef(oid) LIKE '%IS DISTINCT FROM ''CONTEXT_REQUIRED''%')
 THEN RAISE EXCEPTION '0072 storage postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_config_owner','rules_human_owner',
   'rules_commit_owner','rules_runtime_guard_owner') AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text<>pg_catalog.current_setting('pathways_0072.had_usage')
 THEN RAISE EXCEPTION '0072 schema loan postcondition failed'; END IF;
END $$;
COMMIT;
