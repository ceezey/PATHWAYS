-- 0092 rules outcomes and freshness (amendment of cr-pathways-f10-f11-runtime-authority decided 2026-11-24; UC018, UC019, UC023).
-- 1. resource_freshness (rules_eligibility_owner) compares the fingerprint of the alert's latest evaluation snapshot, not of
--    the snapshot that first raised it, so a re-evaluated open alert reads CURRENT instead of SOURCE_CHANGED from the next day.
-- 2. A recommendation outcome moves the recommendation status: ACCEPT and PARTIALLY_ACCEPT give RESOLVED, DECLINE gives
--    DISMISSED and ESCALATE keeps the status. p3_decision_values admits RESOLVED and DISMISSED on the f10 branch (the legacy
--    branch is unchanged), outcome_confirm_operation (rules_outcome_owner) writes the status and assert_runtime_mutation
--    (rules_runtime_guard_owner) admits only those moves, each proven by the decision row of the same operation.
-- 3. recommendation_json (rules_human_owner) adds latestOutcome: outcome, note, the actor's display name and the time, from the
--    new rules_outcome_owner definer recommendation_outcome, which returns null unless the caller holds
--    recommendations.outcome.record on the project. A new rules_outcome_owner policy on decisions and full_name on system_users
--    admit only that read; no other role or function gains a note column.
-- 4. pathways.f10_rule_dry_run_current (rules_eligibility_owner, EXECUTE for pathways_runtime only) evaluates a project rule
--    against current project timeline and activity metadata with the reviewed SQL evaluator and severity twin, writing nothing.
--    Indicator and aggregate conditions report UNSUPPORTED_SOURCE because their numeric sources stay lease-bound.
-- Each replaced function keeps its signature, owner, ACL, security mode, volatility and empty search_path, and md5(prosrc) is
-- pinned before and after. Existing rows are not touched.
-- DBA prerequisite: run hosted-rules-outcomes-preprovision.sql first and hosted-rules-outcomes-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). rules_store_owner lends schema USAGE and CREATE and prisma
-- lends CREATE on pathways; every loan is taken back before the postconditions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; wanted record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0091_backup_recovery'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0092 requires the verified 0091 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_runtime_guard_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_outcome_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_human_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET')
 THEN RAISE EXCEPTION '0092 requires the temporary rules owner SET chain (run hosted-rules-outcomes-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR (SELECT count(*) FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)='prisma' AND oid IN
   ('pathways.decision_recommendations'::pg_catalog.regclass,'pathways.alert_rules'::pg_catalog.regclass,'pathways.system_users'::pg_catalog.regclass))<>3
  OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='pathways_rules_internal' AND c.relname IN ('decisions','evaluations')
    AND pg_catalog.pg_get_userbyid(c.relowner)='rules_store_owner')<>2
  OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_eligibility_owner','rules_runtime_guard_owner',
   'rules_outcome_owner','rules_human_owner') AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('rules_eligibility_owner','pathways','CREATE')
  OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.decision_recommendations'::pg_catalog.regclass
   AND conname='p3_decision_values')<>1
 THEN RAISE EXCEPTION '0092 requires the reviewed schema and table owners, the p3_decision_values constraint and no earlier schema CREATE'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='pathways_rules_internal' AND p.proname='recommendation_outcome') OR (n.nspname='pathways' AND p.proname='f10_rule_dry_run_current'))
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='f10_outcome_decision_read')
 THEN RAISE EXCEPTION '0092 requires its new functions and policy to not already exist'; END IF;
 -- Only the reviewed latest definitions may be replaced; prisma has no schema USAGE yet, so functions are found by text.
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.resource_freshness(uuid)','rules_eligibility_owner',true,'v','de1f7bc4dc7717bb3be0cccc42057438'),
  (1,'pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)','rules_runtime_guard_owner',true,'v','88a4347a80e7007a8f74e8f527bf92e2'),
  (2,'pathways_rules_internal.outcome_confirm_operation(uuid,jsonb,boolean)','rules_outcome_owner',true,'v','e79a2c5577d227953c5ff9ad550c8d6c'),
  (3,'pathways_rules_internal.recommendation_json(uuid)','rules_human_owner',false,'s','3eb2dbb5b3088d7cd4564da7fa656ada')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
  THEN RAISE EXCEPTION '0092 requires the reviewed definition of %',wanted.signature; END IF;
  PERFORM pg_catalog.set_config('pathways_0092.acl_'||wanted.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,92);

-- 0. Loans: rules_store_owner lends prisma schema USAGE and four function owners CREATE; prisma lends rules_store_owner USAGE
-- on pathways for its policy and rules_eligibility_owner CREATE on pathways for the dry run. All are taken back in step 8.
SELECT pg_catalog.set_config('pathways_0092.had_usage',pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text,true);
SELECT pg_catalog.set_config('pathways_0092.had_store_usage',pg_catalog.has_schema_privilege('rules_store_owner','pathways','USAGE')::text,true);
SET LOCAL ROLE rules_store_owner;
GRANT USAGE ON SCHEMA pathways_rules_internal TO prisma;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_eligibility_owner,rules_runtime_guard_owner,rules_outcome_owner,rules_human_owner;
RESET ROLE;
GRANT USAGE ON SCHEMA pathways TO rules_store_owner;
GRANT CREATE ON SCHEMA pathways TO rules_eligibility_owner;

-- 1. Tables owned by rules_store_owner: freshness reads the latest snapshot id, and the outcome owner reads recommendation
-- decisions, note included, only for a caller who may record recommendation outcomes on that project.
SET LOCAL ROLE rules_store_owner;
GRANT SELECT(snapshot_id) ON pathways_rules_internal.evaluations TO rules_eligibility_owner;
CREATE POLICY f10_outcome_decision_read ON pathways_rules_internal.decisions FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND recommendation_id IS NOT NULL
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('recommendations.outcome.record',project_id) IS TRUE);
RESET ROLE;

-- 2. Tables and functions owned by prisma: the f10 recommendation statuses, the actor display name for the outcome owner, the
-- rule severity and the severity twin for the dry run.
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
      OR (status IN ('AUTO_RESOLVED','RESOLVED','DISMISSED') AND ((reviewed_by_id IS NULL AND reviewed_at IS NULL AND private_review_id IS NULL)
        OR (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_at>=proposed_at AND private_review_id IS NOT NULL))))
    AND (reviewed_by_id IS NULL OR proposed_by_id IS NULL OR reviewed_by_id<>proposed_by_id))
);
GRANT SELECT(full_name) ON pathways.system_users TO rules_outcome_owner;
GRANT SELECT(severity) ON pathways.alert_rules TO rules_eligibility_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.classify_alert_severity(jsonb,jsonb,jsonb,jsonb,text),
 pathways_rules_internal.severity_shown(numeric,numeric),pathways_rules_internal.severity_calendar_date(text),
 pathways_rules_internal.severity_node_result(jsonb,jsonb),pathways_rules_internal.severity_condition_basis(jsonb,jsonb,jsonb)
 TO rules_eligibility_owner;

-- 3. rules_projection_owner: the pure evaluator and cell helpers for the dry run.
SET LOCAL ROLE rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb),
 pathways_rules_internal.evaluate_node(jsonb,jsonb,integer),pathways_rules_internal.validate_metric_cell(jsonb),
 pathways_rules_internal.decimal_value(text),pathways_rules_internal.numeric_cell(numeric),
 pathways_rules_internal.unavailable_cell(text,text),pathways_rules_internal.progress_cell(text,text,text,text),
 pathways_rules_internal.utc_milliseconds(timestamptz) TO rules_eligibility_owner;
RESET ROLE;

-- 4. rules_eligibility_owner: freshness and the current-data dry run.
SET LOCAL ROLE rules_eligibility_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.resource_freshness(wanted_alert uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;project uuid;rule uuid;active boolean;superseded boolean;snapshot uuid;fingerprint text;
BEGIN
 SELECT a.organization_id,a.project_id,a.rule_id,r.status='ACTIVE',e.superseded,e.snapshot_id
  INTO org,project,rule,active,superseded,snapshot FROM pathways.rule_based_alerts a
  JOIN pathways.alert_rules r ON r.id=a.rule_id AND r.organization_id=a.organization_id AND r.project_id=a.project_id
  JOIN pathways_rules_internal.evaluations e ON e.id=a.latest_evaluation_id AND e.organization_id=a.organization_id AND e.project_id=a.project_id
  WHERE a.id=wanted_alert AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1';
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR (pathways.p06_can('alerts.read',project) IS TRUE OR (pathways.p06_can('recommendations.read',project) IS TRUE
   AND EXISTS(SELECT FROM pathways.decision_recommendations d WHERE d.organization_id=org AND d.project_id=project
    AND d.alert_id=wanted_alert AND d.runtime_contract_version='f10.v1'))) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(rule) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF NOT active OR superseded THEN RETURN 'SUPERSEDED'; END IF;
 -- The latest evaluation's snapshot holds the fingerprint to compare, so a re-evaluated alert is current (0092).
 SELECT s.source_inputs->'resourceFingerprints'->>rule::text INTO fingerprint FROM pathways_rules_internal.snapshots s
  WHERE s.id=snapshot AND s.organization_id=org AND s.project_id=project;
 IF fingerprint IS NULL OR fingerprint IS DISTINCT FROM pg_catalog.encode(
  pathways_rules_internal.rule_dependency_fingerprint(rule,pg_catalog.clock_timestamp()),'hex') THEN
  RETURN 'SOURCE_CHANGED'; END IF;
 RETURN 'CURRENT';
END $$;
CREATE FUNCTION pathways.f10_rule_dry_run_current(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;project uuid;tree jsonb;rule_severity text;zone text;as_of timestamptz(3);day date;binding record;
 observations jsonb:='{}';cell jsonb;unit text;facts jsonb;evaluated jsonb;leaf jsonb;conditions jsonb:='[]';results jsonb:='{}';
 matched jsonb:='{}';basis jsonb;start_on date;end_on date;project_status text;archived timestamptz;population bigint;
 completed bigint;missing bigint;overdue bigint;days integer;due bigint;no_end bigint;bound_start date;bound_end date;
BEGIN
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;
 IF session_user<>'pathways_runtime' OR org IS NULL OR pathways.p09_can('rules.read') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT r.project_id,r.conditions_json,r.severity::text INTO project,tree,rule_severity FROM pathways.alert_rules r
  WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR project IS NULL OR pathways.p06_can('rules.read',project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(wanted) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT c.zone INTO zone FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules calendar unavailable' USING ERRCODE='55000'; END IF;
 as_of:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());day:=(as_of AT TIME ZONE zone)::date;
 SELECT p.start_date,p.end_date,p.status::text,p.archived_at INTO start_on,end_on,project_status,archived
  FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 -- Each branch repeats project_metric_observation (0076) on the metadata this owner may read for the caller.
 FOR binding IN SELECT b.condition_id,b.metric_key,b.activity_id FROM pathways_rules_internal.rule_bindings b
  WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted ORDER BY b.condition_id LOOP
  facts:='{}';
  IF binding.metric_key LIKE 'PROJECT_%' THEN
   unit:=CASE WHEN binding.metric_key='PROJECT_TIMELINE_ELAPSED_PERCENT' THEN 'PERCENT' ELSE 'DAYS' END;
   IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
    cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
   ELSIF start_on IS NULL OR end_on IS NULL THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
   ELSIF start_on>end_on OR start_on<date '1900-01-01' OR end_on>date '2100-12-31' THEN
    cell:=pathways_rules_internal.unavailable_cell('INVALID_DATES');
   ELSIF binding.metric_key='PROJECT_REMAINING_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(end_on-day);
   ELSIF binding.metric_key='PROJECT_OVERDUE_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(GREATEST(0,day-end_on));
   ELSIF end_on=start_on THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
   ELSE cell:=pathways_rules_internal.progress_cell(GREATEST(0,day-start_on)::text,'0',(end_on-start_on)::text,'HIGHER_IS_BETTER'); END IF;
   facts:=pg_catalog.jsonb_build_object('startDate',CASE WHEN start_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN start_on END,
    'endDate',CASE WHEN end_on BETWEEN date '1900-01-01' AND date '2100-12-31' THEN end_on END);
  ELSIF binding.metric_key IN ('ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') THEN
   unit:=CASE WHEN binding.metric_key='ACTIVITY_COMPLETION_PERCENT' THEN 'PERCENT' WHEN binding.metric_key='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END;
   SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED'),
    count(*) FILTER(WHERE a.status<>'COMPLETED' AND (a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31')),
    count(*) FILTER(WHERE a.status<>'COMPLETED' AND a.planned_end_date<day),
    max(CASE WHEN a.status='COMPLETED' THEN 0 ELSE GREATEST(0,day-a.planned_end_date) END),
    count(*) FILTER(WHERE a.planned_end_date BETWEEN date '1900-01-01' AND date '2100-12-31' AND a.planned_end_date<=day),
    count(*) FILTER(WHERE a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31'),
    min(a.planned_start_date),min(a.planned_end_date)
    INTO population,completed,missing,overdue,days,due,no_end,bound_start,bound_end FROM pathways.project_activities a
    WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
     AND (binding.activity_id IS NULL OR a.id=binding.activity_id);
   IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF binding.metric_key='ACTIVITY_COMPLETION_PERCENT' THEN cell:=pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER');
   ELSIF missing>0 THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
   ELSE cell:=pathways_rules_internal.numeric_cell(CASE WHEN binding.metric_key='ACTIVITY_OVERDUE_COUNT' THEN overdue ELSE days END); END IF;
   facts:=pg_catalog.jsonb_build_object('included',population,'dueByDate',due,'missingEnd',no_end)
    ||CASE WHEN binding.metric_key='ACTIVITY_OVERDUE_DAYS' THEN pg_catalog.jsonb_build_object(
     'activityStart',CASE WHEN bound_start BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_start END,
     'activityEnd',CASE WHEN bound_end BETWEEN date '1900-01-01' AND date '2100-12-31' THEN bound_end END) ELSE '{}'::jsonb END;
  ELSE
   -- shortcut: indicator and aggregate values have no human-scoped source read, so they test as unavailable; add one per family when a CR approves it.
   unit:=CASE WHEN binding.metric_key='INDICATOR_CURRENT_VALUE' THEN 'VALUE'
    WHEN binding.metric_key='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN 'POINTS' ELSE 'PERCENT' END;
   cell:=pathways_rules_internal.unavailable_cell('UNSUPPORTED_SOURCE');
  END IF;
  PERFORM pathways_rules_internal.validate_metric_cell(cell);
  observations:=observations||pg_catalog.jsonb_build_object(binding.condition_id,pg_catalog.jsonb_build_object('metric',binding.metric_key,
   'cell',cell,'unit',unit,'facts',pg_catalog.jsonb_build_object('metric',binding.metric_key,'value',cell->'value','reportingDate',day)||facts));
 END LOOP;
 evaluated:=pathways_rules_internal.evaluate_snapshot_rule(tree,observations);
 FOR leaf IN SELECT value FROM pg_catalog.jsonb_array_elements(evaluated->'conditions') ORDER BY value->>'conditionId' LOOP
  conditions:=conditions||pg_catalog.jsonb_build_array(leaf||pg_catalog.jsonb_build_object('unit',observations->(leaf->>'conditionId')->>'unit'));
  results:=results||pg_catalog.jsonb_build_object(leaf->>'conditionId',leaf->>'result');
  IF leaf->>'result'='TRUE' THEN
   matched:=matched||pg_catalog.jsonb_build_object(leaf->>'conditionId',observations->(leaf->>'conditionId')->'facts'); END IF;
 END LOOP;
 -- Same severity basis the commit would store for this match (0072); expectations only serve unsupported families here.
 IF evaluated->>'result'='TRUE' THEN
  basis:=pathways_rules_internal.classify_alert_severity(tree,results,matched,
   pg_catalog.jsonb_build_object('expectedScoreImprovement',NULL,'manageableFollowUpPercent',NULL),rule_severity);
 END IF;
 RETURN pg_catalog.jsonb_build_object('ruleId',wanted,'asOf',pathways_rules_internal.utc_milliseconds(as_of),'reportingDate',day,
  'result',evaluated->>'result','conditions',conditions,'severityBasis',basis);
END $$;
REVOKE ALL ON FUNCTION pathways.f10_rule_dry_run_current(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_dry_run_current(uuid) TO pathways_runtime;
RESET ROLE;

-- 5. rules_runtime_guard_owner: the recommendation status moves an outcome may make.
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
   OR new_row->>'status' IS NULL OR new_row->>'revision' IS NULL OR new_row->>'status' NOT IN ('NEW','REVIEWED','RESOLVED','DISMISSED','AUTO_RESOLVED')
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
  -- A human moves a recommendation only from NEW to REVIEWED, or to RESOLVED or DISMISSED with an outcome (0092).
  IF intent.purpose='FEATURE_HUMAN' AND (old_row->>'status' IS DISTINCT FROM new_row->>'status'
    AND NOT ((old_row->>'status'='NEW' AND new_row->>'status'='REVIEWED') OR new_row->>'status' IN ('RESOLVED','DISMISSED'))
   OR (old_row->>'status'<>'NEW' AND (new_row->'private_review_id',new_row->'reviewed_by_id',new_row->'reviewed_at')
    IS DISTINCT FROM (old_row->'private_review_id',old_row->'reviewed_by_id',old_row->'reviewed_at'))) THEN
   RAISE EXCEPTION 'Runtime review event is immutable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND (old_row->>'status'=new_row->>'status' OR new_row->>'status' IN ('RESOLVED','DISMISSED'))
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
  IF intent.purpose='FEATURE_HUMAN' AND (old_row->>'status'=new_row->>'status' OR new_row->>'status' IN ('RESOLVED','DISMISSED')) AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.decisions d
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.id=d.operation_receipt_id
    AND o.organization_id=d.organization_id AND o.project_id=d.project_id
   WHERE d.organization_id=org AND d.project_id=project AND d.recommendation_id=row_id
    AND d.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND d.client_operation_id=intent.operation_id
    AND o.actor_id=d.actor_id AND o.client_operation_id=d.client_operation_id
    AND o.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM')
    AND (old_row->>'status'=new_row->>'status' OR (new_row->>'status'='RESOLVED' AND d.outcome IN ('ACCEPT','PARTIALLY_ACCEPT'))
     OR (new_row->>'status'='DISMISSED' AND d.outcome='DECLINE'))) THEN
   RAISE EXCEPTION 'Runtime decision provenance unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE pathways_rules_internal.runtime_mutation_intents i SET consumed=true
  WHERE i.id=intent.id AND NOT i.consumed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime intent already consumed' USING ERRCODE='42501'; END IF;
END $$;
RESET ROLE;

-- 6. rules_outcome_owner: the outcome writes the status, and the latest outcome is read for permitted callers only.
SET LOCAL ROLE rules_outcome_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.outcome_confirm_operation(wanted uuid,input jsonb,recommendation_route boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;alert uuid;recommendation uuid;preview_id uuid;op uuid;hash bytea;operation text;
 metadata record;preview pathways_rules_internal.outcome_previews;receipt pathways_rules_internal.feature_operation_receipts;
 old_alert pathways.rule_based_alerts;new_alert pathways.rule_based_alerts;
 old_rec pathways.decision_recommendations;new_rec pathways.decision_recommendations;
 recipients jsonb;moment timestamptz(3);decision uuid;result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 operation:=CASE WHEN recommendation_route THEN 'RECOMMENDATION_CONFIRM' ELSE 'ALERT_CONFIRM' END;
 IF input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object' OR NOT input ?& ARRAY['previewId','clientOperationId']
  OR (input-ARRAY['previewId','clientOperationId'])<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'previewId') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(input->'clientOperationId') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 preview_id:=(input->>'previewId')::uuid;op:=(input->>'clientOperationId')::uuid;
 IF recommendation_route THEN
  SELECT r.project_id,r.alert_id INTO project,alert FROM pathways.decision_recommendations r
   WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';recommendation:=wanted;
 ELSE
  SELECT a.project_id,a.id INTO project,alert FROM pathways.rule_based_alerts a
   WHERE a.id=wanted AND a.organization_id=org AND a.runtime_contract_version='f10.v1';
 END IF;
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR pathways.p06_can(CASE WHEN recommendation_route THEN 'recommendations.outcome.record' ELSE 'alerts.outcome.record' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 -- Separate read owner can retrieve only own preview target/write metadata,
 -- never private_note/recipients/hash. This prevents a pre-marker note policy.
 SELECT * INTO metadata FROM pathways_rules_internal.confirmation_preview_metadata(project,alert,recommendation,preview_id,recommendation_route);
 recommendation:=metadata.recommendation_id;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,operation,alert,recommendation,preview_id,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.alert_id IS DISTINCT FROM alert
   OR receipt.recommendation_id IS DISTINCT FROM recommendation OR receipt.preview_id IS DISTINCT FROM preview_id
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result||pg_catalog.jsonb_build_object('delivery',pathways_rules_internal.current_decision_delivery((receipt.safe_result->>'decisionId')::uuid));
  PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 SELECT a.* INTO old_alert FROM pathways.rule_based_alerts a WHERE a.id=alert AND a.organization_id=org
  AND a.project_id=project AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF recommendation IS NOT NULL THEN
  SELECT r.* INTO old_rec FROM pathways.decision_recommendations r WHERE r.id=recommendation AND r.organization_id=org
   AND r.project_id=project AND r.alert_id=alert AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT p.* INTO preview FROM pathways_rules_internal.outcome_previews p WHERE p.id=preview_id
  AND p.organization_id=org AND p.project_id=project AND p.actor_id=actor AND p.alert_id=alert
  AND p.recommendation_id IS NOT DISTINCT FROM recommendation FOR NO KEY UPDATE;
 IF NOT FOUND OR preview.consumed_by_decision IS NOT NULL OR preview.expires_at<=pg_catalog.clock_timestamp()
  OR preview.write_alert IS DISTINCT FROM metadata.write_alert OR preview.write_recommendation IS DISTINCT FROM metadata.write_recommendation
  OR (preview.write_alert AND (preview.expected_alert_revision<>old_alert.revision
   OR (NOT recommendation_route AND old_alert.lifecycle IN ('RESOLVED','DISMISSED','AUTO_RESOLVED'))))
  OR (preview.write_recommendation AND preview.expected_recommendation_revision<>old_rec.revision) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(old_alert.rule_id) IS DISTINCT FROM true
  OR (preview.write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (preview.write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 recipients:=pathways_rules_internal.outcome_recipients(org,project,actor);
 IF pg_catalog.jsonb_array_length(recipients)>1000
  OR preview.classification_fingerprint IS DISTINCT FROM pathways_rules_internal.classification_fingerprint(old_alert.rule_id)
  OR preview.recipient_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(recipients::text,'UTF8')) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());decision:=pg_catalog.gen_random_uuid();
 new_alert:=old_alert;new_rec:=old_rec;
 IF preview.write_alert THEN
  new_alert.lifecycle:=CASE WHEN preview.outcome IN ('ACCEPT','PARTIALLY_ACCEPT')
   AND old_alert.lifecycle IN ('NEW','REVIEWED','ACTIONED') THEN 'ACTIONED' ELSE old_alert.lifecycle END;
  new_alert.revision:=old_alert.revision+1;new_alert.updated_at:=moment;
 END IF;
 IF preview.write_recommendation THEN new_rec.revision:=old_rec.revision+1;new_rec.updated_at:=moment;
  -- An accept resolves and a decline dismisses the recommendation; an escalation keeps its status (0092).
  new_rec.status:=CASE WHEN preview.outcome IN ('ACCEPT','PARTIALLY_ACCEPT') THEN 'RESOLVED'
   WHEN preview.outcome='DECLINE' THEN 'DISMISSED' ELSE old_rec.status END;
 END IF;
 result:=pg_catalog.jsonb_build_object('decisionId',decision,'alertId',alert,'recommendationId',recommendation,
  'alertRevision',new_alert.revision::text,'recommendationRevision',CASE WHEN recommendation IS NULL THEN NULL ELSE new_rec.revision::text END,
  'lifecycle',new_alert.lifecycle,'outcome',preview.outcome,'recordedAt',moment,
  'delivery',pg_catalog.jsonb_build_object('pending',0,'delivered',pg_catalog.jsonb_array_length(recipients),'failed',0));
 receipt.id:=pg_catalog.gen_random_uuid();
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (id,organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(receipt.id,org,project,actor,op,operation,alert,recommendation,preview_id,hash,result,moment);
 INSERT INTO pathways_rules_internal.decisions
 (id,organization_id,project_id,alert_id,recommendation_id,actor_id,operation_receipt_id,outcome,note,client_operation_id,request_digest,created_at)
 VALUES(decision,org,project,alert,recommendation,actor,receipt.id,preview.outcome,preview.private_note,op,hash,moment);
 IF preview.write_alert AND new_alert.lifecycle IS DISTINCT FROM old_alert.lifecycle THEN
  INSERT INTO pathways_rules_internal.lifecycle_events
  (organization_id,project_id,alert_id,actor_kind,actor_id,state_before,state_after,operation_receipt_id,occurred_at)
  VALUES(org,project,alert,'HUMAN',actor,old_alert.lifecycle,new_alert.lifecycle,receipt.id,moment);
 END IF;
 IF preview.write_alert THEN
  PERFORM pathways_rules_internal.install_human_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
  UPDATE pathways.rule_based_alerts SET lifecycle=new_alert.lifecycle,revision=new_alert.revision,updated_at=moment
   WHERE id=alert AND organization_id=org AND project_id=project AND revision=old_alert.revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 END IF;
 IF preview.write_recommendation THEN
  PERFORM pathways_rules_internal.install_human_intent('pathways.decision_recommendations'::regclass,pg_catalog.to_jsonb(old_rec),pg_catalog.to_jsonb(new_rec));
  UPDATE pathways.decision_recommendations SET status=new_rec.status,revision=new_rec.revision,updated_at=moment
   WHERE id=recommendation AND organization_id=org AND project_id=project AND revision=old_rec.revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 END IF;
 UPDATE pathways_rules_internal.outcome_previews SET consumed_by_decision=decision
  WHERE id=preview_id AND organization_id=org AND project_id=project AND actor_id=actor AND consumed_by_decision IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 -- Native delivery means durable placement in the recipient's in-app inbox,
 -- not email or read acknowledgement. No recipient note/body input is accepted.
 INSERT INTO pathways_rules_internal.notifications
  (organization_id,project_id,recipient_id,alert_id,decision_id,message,delivery_state,attempts,created_at)
 SELECT org,project,(value#>>'{}')::uuid,alert,decision,preview.message,'DELIVERED',1,moment
 FROM pg_catalog.jsonb_array_elements(recipients);
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,'decision.recorded','RuleDecision',decision,
  pg_catalog.jsonb_build_object('alertId',alert,'recommendationId',recommendation,'outcome',preview.outcome,
   'alertRevision',new_alert.revision::text,'recommendationRevision',CASE WHEN recommendation IS NULL THEN NULL ELSE new_rec.revision::text END));
 IF preview.expires_at<=pg_catalog.clock_timestamp()
  OR preview.recipient_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(
   pathways_rules_internal.outcome_recipients(org,project,actor)::text,'UTF8')) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(old_alert.rule_id) IS DISTINCT FROM true
  OR (preview.write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (preview.write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
CREATE FUNCTION pathways_rules_internal.recommendation_outcome(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('outcome',d.outcome,'note',d.note,'actorName',u.full_name,'recordedAt',d.created_at)
 FROM pathways.decision_recommendations r
 JOIN pathways_rules_internal.decisions d ON d.organization_id=r.organization_id AND d.project_id=r.project_id AND d.recommendation_id=r.id
 LEFT JOIN pathways.system_users u ON u.organization_id=d.organization_id AND u.id=d.actor_id
 WHERE r.id=wanted AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND r.runtime_contract_version='f10.v1' AND session_user='pathways_runtime'
  AND pathways.p06_can('recommendations.outcome.record',r.project_id) IS TRUE
 ORDER BY d.created_at DESC,d.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION pathways_rules_internal.recommendation_outcome(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.recommendation_outcome(uuid) TO rules_human_owner;
RESET ROLE;

-- 7. rules_human_owner: the recommendation read model carries the latest outcome.
SET LOCAL ROLE rules_human_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.recommendation_json(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',d.id,'projectId',d.project_id,'alertId',d.alert_id,'ruleId',a.rule_id,
  'title',d.title,'text',d.text,'basis',d.basis,'status',d.status,'revision',d.revision::text,
  'proposedAt',d.proposed_at,'reviewedAt',d.reviewed_at,
  'latestOutcome',pathways_rules_internal.recommendation_outcome(d.id))
 FROM pathways.decision_recommendations d JOIN pathways.rule_based_alerts a
  ON a.organization_id=d.organization_id AND a.project_id=d.project_id AND a.id=d.alert_id
 WHERE d.id=wanted AND d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND d.runtime_contract_version='f10.v1'
$$;
RESET ROLE;

-- 8. Every loan from step 0 is taken back.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_eligibility_owner,rules_runtime_guard_owner,rules_outcome_owner,rules_human_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0092.had_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways_rules_internal FROM prisma; END IF;
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM rules_eligibility_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0092.had_store_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways FROM rules_store_owner; END IF;
END $$;

-- 9. Postconditions: the replaced functions' kept owner, mode, volatility, search_path and ACL with their new bodies, the two
-- new functions' owner, mode, body and EXECUTE holders, the policy, the validated constraint and no loan left.
DO $$ DECLARE fn record; wanted record; BEGIN
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.resource_freshness(uuid)','rules_eligibility_owner',true,'v','6710ff016db72ae4cf224b63773c3d7e'),
  (1,'pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)','rules_runtime_guard_owner',true,'v','0fd54416351f0fbf2925171fee8e3326'),
  (2,'pathways_rules_internal.outcome_confirm_operation(uuid,jsonb,boolean)','rules_outcome_owner',true,'v','97901aa004120a850b0981cbb2da3a34'),
  (3,'pathways_rules_internal.recommendation_json(uuid)','rules_human_owner',false,'s','70c5e75e1a51227fb3755a13e1f61f4f')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
   OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0092.acl_'||wanted.n)
  THEN RAISE EXCEPTION '0092 replaced function postcondition failed for %',wanted.signature; END IF;
 END LOOP;
 FOR wanted IN SELECT * FROM (VALUES
  ('pathways_rules_internal.recommendation_outcome(uuid)','rules_outcome_owner','s','515d5b062a53ac22d850daa64819badc','rules_human_owner'),
  ('pathways.f10_rule_dry_run_current(uuid)','rules_eligibility_owner','v','2eff1dd0d3a960feaf85a5b507203bd7','pathways_runtime')
 ) w(signature,owner,volatility,source_md5,caller) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR NOT fn.prosecdef OR fn.provolatile<>wanted.volatility
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
   OR NOT pg_catalog.has_function_privilege(wanted.caller,fn.oid,'EXECUTE')
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(fn.proacl) a WHERE a.grantee=0)
   OR EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker',
    'pathways_rules_sweeper','rules_human_owner']) r WHERE r<>wanted.caller AND pg_catalog.has_function_privilege(r,fn.oid,'EXECUTE'))
  THEN RAISE EXCEPTION '0092 new function postcondition failed for %',wanted.signature; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE p.polname='f10_outcome_decision_read' AND n.nspname='pathways_rules_internal' AND c.relname='decisions' AND p.polcmd='r'
    AND p.polpermissive AND p.polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_outcome_owner')])
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.decision_recommendations'::pg_catalog.regclass
   AND conname='p3_decision_values' AND convalidated)
  OR NOT pg_catalog.has_column_privilege('rules_outcome_owner','pathways.system_users','full_name','SELECT')
  OR pg_catalog.has_column_privilege('rules_outcome_owner','pathways.system_users','email','SELECT')
  OR NOT pg_catalog.has_column_privilege('rules_eligibility_owner','pathways.alert_rules','severity','SELECT')
 THEN RAISE EXCEPTION '0092 policy, constraint or column grant postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_eligibility_owner','rules_runtime_guard_owner',
   'rules_outcome_owner','rules_human_owner') AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('rules_eligibility_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text<>pg_catalog.current_setting('pathways_0092.had_usage')
  OR pg_catalog.has_schema_privilege('rules_store_owner','pathways','USAGE')::text<>pg_catalog.current_setting('pathways_0092.had_store_usage')
 THEN RAISE EXCEPTION '0092 lent schema privilege remains'; END IF;
END $$;
COMMIT;
