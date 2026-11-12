-- 0090 test case gap closure (cr-pathways-test-case-gap-closure sections 2.1 and 2.5); forward migration.
-- public_project_views counts views per published project per Manila day: no IP, no identifier and no cookie is stored,
-- and nothing displays it yet. p90_count_public_view adds one view for a live, unarchived project of an active organization.
-- p90_record_password_reset writes PASSWORD_RESET_COMPLETED for the staff account of the recovery session's auth subject.
-- p90_dashboard_view_due answers whether DASHBOARD_VIEWED may be written, at most once per user per dashboard per 30 minutes;
-- it reads audit_logs as the owner because p09_select hides earlier rows from roles without audit.read.
-- All three are prisma-owned definers executable by pathways_runtime only.
-- Section 2.5: configuration_operation raises 42710 when a new rule reuses the code of a live rule in the same organization
-- and project scope, and 54000 (was 40001) for the active-rule cap. It is replaced by its owner rules_config_owner, keeping
-- signature, owner, ACL, security mode, volatility and empty search_path. Existing rows are not touched.
-- DBA prerequisite: run hosted-test-case-gaps-preprovision.sql first and hosted-test-case-gaps-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). rules_store_owner lends schema CREATE for the replace.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0089_project_map_pins'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0090 requires the verified 0089 state and migration identity'; END IF;
 IF pg_catalog.to_regclass('pathways.public_project_views') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_count_public_view(uuid)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_record_password_reset(uuid)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p90_dashboard_view_due(uuid,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION '0090 requires the table and functions to not already exist'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)='prisma'
   AND oid IN ('pathways.projects'::pg_catalog.regclass,'pathways.project_publications'::pg_catalog.regclass,
    'pathways.organizations'::pg_catalog.regclass,'pathways.system_users'::pg_catalog.regclass,'pathways.audit_logs'::pg_catalog.regclass))<>5
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p85_prisma_live_read' AND polcmd='r'
   AND polrelid='pathways.project_publications'::pg_catalog.regclass AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid])
 THEN RAISE EXCEPTION '0090 requires prisma ownership of its tables and the 0085 live read policy'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_config_owner','SET')
 THEN RAISE EXCEPTION '0090 requires the temporary rules owner SET chain (run hosted-test-case-gaps-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR pg_catalog.has_schema_privilege('rules_config_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0090 requires the reviewed rules schema owner and no earlier schema CREATE'; END IF;
 -- Only the reviewed 0072 definition may be replaced; prisma has no schema USAGE, so the function is found by its text signature.
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.configuration_operation(uuid,jsonb,text)';
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_config_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>'862bc998ad4d0d579366306cdbf0a2a3'
 THEN RAISE EXCEPTION '0090 requires the reviewed definition of pathways_rules_internal.configuration_operation(uuid,jsonb,text)'; END IF;
 PERFORM pg_catalog.set_config('pathways_0090.acl_rules',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,90);

-- 1. The counter: one row per project per day, readable by no API role.
CREATE TABLE pathways.public_project_views (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    view_date date NOT NULL,
    view_count integer NOT NULL,
    CONSTRAINT public_project_views_pkey PRIMARY KEY (organization_id, project_id, view_date),
    CONSTRAINT public_project_views_project_fk FOREIGN KEY (organization_id, project_id)
     REFERENCES pathways.projects(organization_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT public_project_views_count_positive CHECK (view_count > 0)
);
ALTER TABLE pathways.public_project_views OWNER TO prisma;
ALTER TABLE pathways.public_project_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.public_project_views FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- 2. One public view; a project that is not live, is archived or belongs to an inactive organization is not counted.
CREATE FUNCTION pathways.p90_count_public_view(wanted_project uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public projection unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.public_project_views AS v(organization_id,project_id,view_date,view_count)
 SELECT pub.organization_id,pub.project_id,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,1
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
 ON CONFLICT ON CONSTRAINT public_project_views_pkey DO UPDATE SET view_count=v.view_count+1;
END $$;

-- 3. A completed password reset, attributed to the unarchived staff account of the auth subject; an unknown subject writes nothing.
CREATE FUNCTION pathways.p90_record_password_reset(auth_subject uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Account event unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 SELECT u.organization_id,u.id,'PASSWORD_RESET_COMPLETED','Authentication',u.id::text,'{}'::jsonb
  FROM pathways.system_users u WHERE u.auth_user_id=auth_subject AND u.archived_at IS NULL;
END $$;

-- 4. Whether a dashboard view is due; the lock holds until commit so concurrent requests of one viewer write one row.
CREATE FUNCTION pathways.p90_dashboard_view_due(viewer uuid, viewer_organization uuid, wanted_dashboard text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Dashboard view unavailable' USING ERRCODE='42501'; END IF;
 IF wanted_dashboard IS NULL OR wanted_dashboard !~ '^[a-z][a-z0-9-]{0,39}$'
 THEN RAISE EXCEPTION 'Invalid dashboard' USING ERRCODE='22023'; END IF;
 IF viewer IS NULL OR viewer_organization IS NULL THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p90-dashboard-view:'||viewer::text||':'||wanted_dashboard,0));
 RETURN NOT EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id=viewer_organization AND a.actor_user_id=viewer
  AND a.action='DASHBOARD_VIEWED' AND a.entity_type='Dashboard' AND a.entity_id=wanted_dashboard
  AND a.occurred_at>pg_catalog.transaction_timestamp()-interval '30 minutes');
END $$;

REVOKE ALL ON FUNCTION pathways.p90_count_public_view(uuid),pathways.p90_record_password_reset(uuid),
 pathways.p90_dashboard_view_due(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p90_count_public_view(uuid),pathways.p90_record_password_reset(uuid),
 pathways.p90_dashboard_view_due(uuid,uuid,text) TO pathways_runtime;

-- 5. Distinct rule conflict codes: rules_store_owner lends rules_config_owner schema CREATE for the replace and takes it back.
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_config_owner;
RESET ROLE;
SET LOCAL ROLE rules_config_owner;
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
 -- 0090: a new rule may not reuse the code of a live rule in the same organization and project scope.
 IF operation='RULE_CREATE' THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f10-rule-code:'||org::text||':'||coalesce(project::text,'')||':'||(input->>'code'),0));
  IF EXISTS(SELECT FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id IS NOT DISTINCT FROM project
   AND r.runtime_contract_version='f10.v1' AND r.display_code=input->>'code' AND r.status<>'ARCHIVED') THEN
   RAISE EXCEPTION 'Another rule already uses this code.' USING ERRCODE='42710'; END IF;
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
   RAISE EXCEPTION 'The project already has 20 active rules.' USING ERRCODE='54000'; END IF;
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
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_config_owner;
RESET ROLE;

-- Postconditions: the table's owner, constraints, row security and grants, the three functions' owner, mode, search_path and ACL,
-- and configuration_operation's kept owner, mode, search_path and ACL, its new body and no schema CREATE left.
DO $$ DECLARE fn record; BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.public_project_views'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0090 ownership postcondition failed'; END IF;
 IF (SELECT pg_catalog.string_agg(c.contype::text,'' ORDER BY c.contype) FROM pg_catalog.pg_constraint c
   WHERE c.conrelid='pathways.public_project_views'::pg_catalog.regclass AND c.convalidated AND c.contype IN ('c','f','p'))<>'cfp'
 THEN RAISE EXCEPTION '0090 constraint postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_catalog.pg_class
   WHERE oid='pathways.public_project_views'::pg_catalog.regclass)
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.public_project_views'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0090 row level security postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['pathways_runtime','anon','authenticated','service_role']) r
   WHERE has_table_privilege(r,'pathways.public_project_views','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION '0090 grant postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p90_count_public_view(uuid)'::pg_catalog.regprocedure,
    'pathways.p90_record_password_reset(uuid)'::pg_catalog.regprocedure,'pathways.p90_dashboard_view_due(uuid,uuid,text)'::pg_catalog.regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=""']
   AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
    FROM pg_catalog.aclexplode(p.proacl) a)=ARRAY['pathways_runtime','prisma'])<>3
 THEN RAISE EXCEPTION '0090 function postconditions failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text='pathways_rules_internal.configuration_operation(uuid,jsonb,text)';
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_config_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0090.acl_rules')
  OR pg_catalog.md5(fn.prosrc)<>'9c27a063e27d3b2b05321f357b590329'
  OR pg_catalog.has_schema_privilege('rules_config_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0090 configuration_operation postcondition failed'; END IF;
END $$;
COMMIT;
