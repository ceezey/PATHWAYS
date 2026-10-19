-- 0072 severity classification, part 1 (cr-pathways-severity-classification 3.2 to 3.7, severity-guide-v0.2).
-- Storage: alert_rules.severity becomes nullable with no default (null lets the system decide, CRITICAL is the author's
-- manual mark) and gains two optional expectations (expected score improvement and manageable follow-up level, 0 to 100);
-- rule_based_alerts.severity becomes nullable and gains severity_basis and severity_change. Earlier rows are not touched.
-- Replaced, each by its own owner, keeping signature, owner, ACL, security mode, volatility and empty search_path:
--  * rules_config_owner: validate_configuration_input (severity is null or CRITICAL, optional expectations) and
--    configuration_operation (stores expectations; they join the definition digest only when set);
--  * rules_human_owner: rule_json (severity may be null, adds expectations);
--  * rules_projection_owner: project_metric_observation (adds the planning facts severity needs) and
--    capture_rule_snapshot (manifest entries carry expectations).
-- New prisma-owned IMMUTABLE invoker functions: classify_alert_severity and its four helpers, the SQL twin of the shared
-- classifyAlertSeverity, executable only by rules_commit_owner. Column SELECT for the new rule columns and indicator target_date.
-- Part 2 (classification at snapshot commit and the alert read model) follows in this file.
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
 THEN RAISE EXCEPTION '0072 requires the temporary rules owner SET chain (run hosted-rules-severity-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.alert_rules'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.rule_based_alerts'::pg_catalog.regclass)<>'prisma'
  OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_config_owner','rules_human_owner')
   AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
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
  (4,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','0ed70417ea4783a8972f7a882c977560')
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

-- 0. The schema owner lends prisma USAGE and CREATE, and the three function owners CREATE, until step 6.
SELECT pg_catalog.set_config('pathways_0072.had_usage',pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text,true);
SET LOCAL ROLE rules_store_owner;
GRANT USAGE,CREATE ON SCHEMA pathways_rules_internal TO prisma;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_projection_owner,rules_config_owner,rules_human_owner;
RESET ROLE;

-- 1. Storage on the prisma-owned tables; existing rows keep their values and no row is backfilled.
ALTER TABLE pathways.alert_rules ALTER COLUMN severity DROP DEFAULT, ALTER COLUMN severity DROP NOT NULL,
 ADD COLUMN expected_score_improvement numeric(18,4), ADD COLUMN manageable_follow_up_percent numeric(18,4),
 ADD CONSTRAINT alert_rules_expected_score_improvement_range CHECK (expected_score_improvement>=0 AND expected_score_improvement<=100),
 ADD CONSTRAINT alert_rules_manageable_follow_up_percent_range CHECK (manageable_follow_up_percent>=0 AND manageable_follow_up_percent<=100);
ALTER TABLE pathways.rule_based_alerts ALTER COLUMN severity DROP NOT NULL,
 ADD COLUMN severity_basis jsonb, ADD COLUMN severity_change jsonb,
 ADD CONSTRAINT rule_based_alerts_severity_basis_check CHECK (severity IS NOT NULL OR severity_basis->>'status'='CONTEXT_REQUIRED');
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
  IF f->>'included' IS NULL OR (f->>'included')::numeric<=0 THEN outcome:='CONTEXT_REQUIRED';missing:='ACTIVITY_TOTAL';
  ELSIF f->>'missingEnd' IS NULL OR (f->>'missingEnd')::numeric<>0 THEN
   outcome:='CONTEXT_REQUIRED';missing:='ACTIVITY_PLANNED_END_DATES';
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

-- 6. The schema owner takes back every loan from step 0.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM prisma,rules_projection_owner,rules_config_owner,rules_human_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0072.had_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways_rules_internal FROM prisma; END IF;
END $$;
RESET ROLE;

-- 7. Postconditions; functions are resolved by text because prisma holds no USAGE on the schema.
DO $$ DECLARE fn record; wanted record; BEGIN
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.validate_configuration_input(jsonb,text)','rules_config_owner',false,'i','9907d1ba98c5fe890b8220f9ecf4e8f2'),
  (1,'pathways_rules_internal.configuration_operation(uuid,jsonb,text)','rules_config_owner',true,'v','edbaf221645a04c039d494097b73c4fd'),
  (2,'pathways_rules_internal.rule_json(uuid)','rules_human_owner',false,'s','519d441502e52ba1e9a403fd99215901'),
  (3,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s','5dba57ac3d29beaeb201db5d51cb5e6e'),
  (4,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','0ed70417ea4783a8972f7a882c977560')
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
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.rule_based_alerts'::pg_catalog.regclass
   AND conname='rule_based_alerts_severity_basis_check' AND contype='c' AND convalidated)
 THEN RAISE EXCEPTION '0072 storage postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_config_owner','rules_human_owner')
   AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text<>pg_catalog.current_setting('pathways_0072.had_usage')
 THEN RAISE EXCEPTION '0072 schema loan postcondition failed'; END IF;
END $$;
COMMIT;
