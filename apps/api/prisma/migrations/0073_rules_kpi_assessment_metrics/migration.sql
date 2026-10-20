-- 0073 rules KPI performance and test score metrics (cr-pathways-rules-mixed-connectors-and-metrics); forward migration.
-- Contract stays f10.v1. Three project-level aggregate metrics join the closed rule metric set, with no bindings and no
-- per-row output: KPI_ACHIEVEMENT_PERCENT (mean baseline-to-target progress of non-archived indicators with a visible value,
-- to tenths, as on the project overview), SURVEY_MEAN_PRE_TEST_PERCENT and SURVEY_MEAN_POST_TEST_PERCENT (mean of each
-- ACTIVE enrollment's latest valid score on a 0 to 100 scale, SUPPRESSED under 5). All are NOT_APPLICABLE when the project
-- is archived or not PLANNED/ONGOING, explain severity only (guide sections 5.12 to 5.14) and rely on the hourly sweep.
-- Replaced, each by its own owner, keeping signature, owner, ACL, security mode, volatility and empty search_path:
--  * rules_projection_owner: evaluate_node and evaluate_snapshot_rule (metric set and domains), project_metric_observation
--    (the three aggregates) and capture_rule_snapshot (PERCENT unit on suppressed placeholders);
--  * rules_eligibility_owner: lease_family_allowed (new KPI family; SURVEY covers the test scores), rule_audience_allowed
--    (test scores need assessments.detail.read; KPI needs monitoring.read and indicators.read or reports.indicator.read,
--    as the overview KPI tile) and rule_dependency_fingerprint (id and stamp digests only, never values);
--  * prisma: severity_condition_basis (the three metrics are EXPLANATORY).
-- rules_store_owner re-adds the rule_bindings metric CHECK with the three keys. On prisma-owned tables the projection owner may
-- read every indicator and measurement of a project with an active KPI rule (two permissive policies, both guards widened)
-- and enrollment status for an active survey rule. No grant, column or other policy changes.
-- DBA prerequisite: run hosted-rules-metrics-preprovision.sql first and hosted-rules-metrics-cleanup.sql afterwards
-- (after a failure, run prisma migrate resolve --rolled-back first). rules_store_owner lends schema USAGE and CREATE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; wanted record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0072_severity_classification'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0073 requires the verified 0072 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_projection_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','SET')
 THEN RAISE EXCEPTION '0073 requires the temporary rules owner SET chain (run hosted-rules-metrics-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_eligibility_owner')
   AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_kpi_indicator','f10_projection_kpi_measurement'))
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_indicator_numeric_guard',
   'f10_projection_measurement_numeric_guard','f10_projection_enrollment'))<>3
  OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=(SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
   ON n.oid=c.relnamespace WHERE n.nspname='pathways_rules_internal' AND c.relname='rule_bindings')
   AND contype='c' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%SURVEY_MEAN_IMPROVEMENT_POINTS%'
   AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%KPI_ACHIEVEMENT_PERCENT%')<>1
 THEN RAISE EXCEPTION '0073 requires the reviewed schema owner, policies and metric constraint and no earlier schema CREATE'; END IF;
 -- Only the reviewed latest definitions may be replaced; their ACLs are kept for the postcondition.
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.evaluate_node(jsonb,jsonb,integer)','rules_projection_owner',false,'i','af2fabaa21d606419139e40ff4a247f6'),
  (1,'pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb)','rules_projection_owner',false,'i','98120cbadd517a9ad91c3aa6c71cf57b'),
  (2,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s','2a2d1e6f5cd35a072b1dc6d4f59549bb'),
  (3,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','a092ee6834e09e3e749dbdf90fb045cc'),
  (4,'pathways_rules_internal.lease_family_allowed(uuid,uuid,text)','rules_eligibility_owner',true,'v','5955d18797677a1efa3057d531ca5261'),
  (5,'pathways_rules_internal.rule_audience_allowed(uuid)','rules_eligibility_owner',true,'s','45116efb7ec89bd82613a3ad1e089774'),
  (6,'pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamp with time zone)','rules_eligibility_owner',true,'s','ccf2c58ba8ef217a8e056e192f0abdcd'),
  (7,'pathways_rules_internal.severity_condition_basis(jsonb,jsonb,jsonb)','prisma',false,'i','d789316875ee71e18c734e9250fecfd9')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
  THEN RAISE EXCEPTION '0073 requires the reviewed definition of %',wanted.signature; END IF;
  PERFORM pg_catalog.set_config('pathways_0073.acl_'||wanted.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 0. The schema owner lends prisma USAGE and CREATE, and the two function owners CREATE, until step 5.
SELECT pg_catalog.set_config('pathways_0073.had_usage',pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text,true);
SET LOCAL ROLE rules_store_owner;
GRANT USAGE,CREATE ON SCHEMA pathways_rules_internal TO prisma;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_projection_owner,rules_eligibility_owner;

-- 1. rules_store_owner: the three keys bind no record.
DO $$ DECLARE c text; BEGIN
 SELECT conname INTO STRICT c FROM pg_catalog.pg_constraint WHERE conrelid='pathways_rules_internal.rule_bindings'::pg_catalog.regclass
  AND contype='c' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%INDICATOR_CURRENT_VALUE%';
 EXECUTE pg_catalog.format('ALTER TABLE pathways_rules_internal.rule_bindings DROP CONSTRAINT %I',c);
 EXECUTE pg_catalog.format($chk$ALTER TABLE pathways_rules_internal.rule_bindings ADD CONSTRAINT %I
CHECK((metric_key IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT')
   AND indicator_id IS NOT NULL AND activity_id IS NULL AND definition_revision>0 AND definition_revision IS NOT NULL
   AND classification_id IS NOT NULL AND source_fingerprint IS NOT NULL AND pg_catalog.octet_length(source_fingerprint)=32)
  OR (metric_key='ACTIVITY_OVERDUE_DAYS' AND activity_id IS NOT NULL AND indicator_id IS NULL
   AND definition_revision IS NULL AND classification_id IS NULL AND source_fingerprint IS NULL)
  OR (metric_key IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
    'ACTIVITY_OVERDUE_COUNT','ACTIVITY_COMPLETION_PERCENT',
    'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
    'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT')
   AND indicator_id IS NULL AND activity_id IS NULL AND definition_revision IS NULL AND classification_id IS NULL AND source_fingerprint IS NULL))$chk$,c);
END $$;
RESET ROLE;

-- 2. rules_eligibility_owner: family lease, audience and freshness.
SET LOCAL ROLE rules_eligibility_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.lease_family_allowed(org uuid,project uuid,family text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT family IN ('BUDGET','BENEFICIARY','SURVEY','KPI') AND pathways_rules_internal.lease_metric_scope(org,project) IS TRUE AND EXISTS(
  SELECT FROM pathways_rules_internal.rule_bindings b
  JOIN pathways.alert_rules r ON r.id=b.rule_version_id AND r.organization_id=b.organization_id AND r.project_id=b.project_id
  WHERE b.organization_id=org AND b.project_id=project AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE'
   AND b.metric_key=ANY(CASE family WHEN 'BUDGET' THEN ARRAY['BUDGET_UTILIZATION_PERCENT']
    WHEN 'BENEFICIARY' THEN ARRAY['BENEFICIARY_FOLLOW_UP_PERCENT'] WHEN 'KPI' THEN ARRAY['KPI_ACHIEVEMENT_PERCENT']
    ELSE ARRAY['SURVEY_MEAN_IMPROVEMENT_POINTS','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT'] END))
$$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.rule_audience_allowed(wanted_rule uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; project uuid;
BEGIN
 IF session_user<>'pathways_runtime' OR wanted_rule IS NULL THEN RETURN false; END IF;
 SELECT r.organization_id,r.project_id INTO org,project FROM pathways.alert_rules r WHERE r.id=wanted_rule
  AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR project IS NULL THEN RETURN false; END IF;
 -- Each bound source family needs its own read permission; a rule with no such binding is unrestricted here.
 RETURN NOT EXISTS(SELECT FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted_rule AND (
  (b.metric_key='BUDGET_UTILIZATION_PERCENT' AND NOT (pathways.p06_can('budgets.read',project) IS TRUE
    AND pathways.p06_can('expenses.read',project) IS TRUE))
  OR (b.metric_key='BENEFICIARY_FOLLOW_UP_PERCENT' AND pathways.p06_can('beneficiaries.records.read',project) IS NOT TRUE)
  OR (b.metric_key IN ('SURVEY_MEAN_IMPROVEMENT_POINTS','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT')
   AND pathways.p06_can('assessments.detail.read',project) IS NOT TRUE)
  OR (b.metric_key='KPI_ACHIEVEMENT_PERCENT' AND NOT (pathways.p06_can('monitoring.read',project) IS TRUE
   AND (pathways.p06_can('indicators.read',project) IS TRUE OR pathways.p06_can('reports.indicator.read',project) IS TRUE)))));
END $$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.rule_dependency_fingerprint(wanted uuid,as_of timestamptz)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;project uuid;calendar_version bigint;day date;binding record;dependencies jsonb:='[]';part jsonb;
BEGIN
 SELECT r.organization_id,r.project_id INTO org,project FROM pathways.alert_rules r
  WHERE r.id=wanted AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR project IS NULL OR as_of IS NULL OR as_of>pg_catalog.clock_timestamp()
  OR ((session_user='pathways_runtime' AND pathways_rules_internal.rule_exposure_allowed(wanted) IS TRUE)
   OR (session_user='pathways_rules_worker' AND pathways_rules_internal.lease_metric_scope(org,project) IS TRUE)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Rule dependency unavailable' USING ERRCODE='42501'; END IF;
 SELECT c.version,(as_of AT TIME ZONE c.zone)::date INTO calendar_version,day
  FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules calendar unavailable' USING ERRCODE='55000'; END IF;
 FOR binding IN SELECT b.condition_id,b.metric_key,b.indicator_id,b.activity_id,b.definition_revision,b.source_fingerprint
  FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=org AND b.project_id=project
   AND b.rule_version_id=wanted ORDER BY b.condition_id LOOP
  IF binding.metric_key IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS') THEN
   SELECT pg_catalog.jsonb_build_object('id',p.id,'start',p.start_date,'end',p.end_date,'status',p.status,'archivedAt',p.archived_at)
    INTO part FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  ELSIF binding.metric_key IN ('ACTIVITY_OVERDUE_COUNT','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_DAYS') THEN
   SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'status',a.status,
    'plannedEnd',a.planned_end_date,'archivedAt',a.archived_at) ORDER BY a.id),'[]'::jsonb) INTO part
    FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project
     AND (binding.activity_id IS NULL OR a.id=binding.activity_id);
  ELSIF binding.metric_key='BUDGET_UTILIZATION_PERCENT' THEN
   -- Count and digest of record ids with update stamps; no amount, currency or status value is read (0060).
   SELECT pg_catalog.jsonb_build_object('records',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(r.id::text||'|'||pg_catalog.to_char(r.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY r.id),'')))
     FROM pathways.project_budget_records r WHERE r.organization_id=org AND r.project_id=project),
    'expenses',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(e.id::text||'|'||pg_catalog.to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY e.id),'')))
     FROM pathways.budget_expense_entries e WHERE e.organization_id=org AND e.project_id=project)) INTO part;
  ELSIF binding.metric_key='BENEFICIARY_FOLLOW_UP_PERCENT' THEN
   SELECT pg_catalog.jsonb_build_object('enrollments',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(n.id::text||'|'||pg_catalog.to_char(n.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY n.id),'')))
     FROM pathways.beneficiary_project_enrollments n WHERE n.organization_id=org AND n.project_id=project),
    'participations',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(a.id::text||'|'||pg_catalog.to_char(a.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY a.id),'')))
     FROM pathways.beneficiary_activity_participations a WHERE a.organization_id=org AND a.project_id=project)) INTO part;
  ELSIF binding.metric_key IN ('SURVEY_MEAN_IMPROVEMENT_POINTS','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN
   -- Test scores also follow enrollment status changes (0073).
   SELECT pg_catalog.jsonb_build_object('assessments',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(s.id::text||'|'||pg_catalog.to_char(s.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY s.id),'')))
     FROM pathways.assessment_results s WHERE s.organization_id=org AND s.project_id=project))
    ||CASE WHEN binding.metric_key='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('enrollments',(
     SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(n.id::text||'|'||pg_catalog.to_char(n.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY n.id),'')))
     FROM pathways.beneficiary_project_enrollments n WHERE n.organization_id=org AND n.project_id=project)) END INTO part;
  ELSIF binding.metric_key='KPI_ACHIEVEMENT_PERCENT' THEN
   -- Indicator revisions, measurement ids with record stamps and activity states; no value is read (0073).
   SELECT pg_catalog.jsonb_build_object('indicators',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',i.id,
     'revision',i.revision,'mode',i.measurement_mode,'periodStart',i.period_start,'periodEnd',i.period_end,'archivedAt',i.archived_at)
     ORDER BY i.id),'[]'::jsonb) FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project),
    'measurements',(SELECT pg_catalog.jsonb_build_array(pg_catalog.count(*),
     pg_catalog.md5(COALESCE(pg_catalog.string_agg(m.id::text||'|'||pg_catalog.to_char(m.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),',' ORDER BY m.id),'')))
     FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project AND m.recorded_at<=as_of),
    'activities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'status',a.status,
     'plannedEnd',a.planned_end_date,'archivedAt',a.archived_at) ORDER BY a.id),'[]'::jsonb)
     FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project)) INTO part;
  ELSE
   SELECT pg_catalog.jsonb_build_object('definitionRevision',binding.definition_revision,
    'definitionFingerprint',pg_catalog.encode(binding.source_fingerprint,'hex'),'measurementMode',i.measurement_mode,
    'measurementId',CASE WHEN i.measurement_mode='MANUAL' THEN (
     SELECT m.id FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
      AND m.indicator_id=binding.indicator_id AND m.recorded_at<=as_of
      AND m.period_start=i.period_start AND m.period_end=i.period_end
      AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements successor
       WHERE successor.organization_id=m.organization_id AND successor.project_id=m.project_id
        AND successor.indicator_id=m.indicator_id AND successor.corrects_measurement_id=m.id AND successor.recorded_at<=as_of)
     ORDER BY m.period_end DESC,m.recorded_at DESC,m.id DESC LIMIT 1) ELSE NULL END,
    'derivedActivities',CASE WHEN i.measurement_mode='DERIVED' THEN (
     SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'status',a.status,
      'plannedEnd',a.planned_end_date,'archivedAt',a.archived_at) ORDER BY a.id),'[]'::jsonb)
      FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project
       AND a.archived_at IS NULL AND a.status<>'CANCELLED' AND a.planned_end_date BETWEEN i.period_start AND i.period_end) ELSE NULL END)
    INTO part FROM pathways.project_indicators i WHERE i.id=binding.indicator_id AND i.organization_id=org AND i.project_id=project;
  END IF;
  dependencies:=dependencies||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'conditionId',binding.condition_id,'metric',binding.metric_key,'dependency',part));
 END LOOP;
 RETURN pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'calendarVersion',calendar_version::text,'reportingDate',day,'dependencies',dependencies)::text,'UTF8'));
END $$;
RESET ROLE;

-- 3. rules_projection_owner: metric set, domains, observations and suppressed units.
SET LOCAL ROLE rules_projection_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.evaluate_node(node jsonb,observations jsonb,group_depth integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE child jsonb; evaluated jsonb; leaf jsonb; cell jsonb; evidence jsonb:='[]'::jsonb;
  verdict text; saw_true boolean:=false; saw_false boolean:=false; saw_unknown boolean:=false;
  value numeric; lower_bound numeric; upper_bound numeric; comparison boolean;
BEGIN
  IF node->>'kind'='GROUP' THEN
    IF group_depth>=4 OR node->>'mode' IS NULL OR node->>'mode' NOT IN ('AND','OR')
      OR pg_catalog.jsonb_typeof(node->'children') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(node->'children') NOT BETWEEN 1 AND 32 THEN
      RAISE EXCEPTION 'Invalid bounded group' USING ERRCODE='22023';
    END IF;
    FOR child IN SELECT v.value FROM pg_catalog.jsonb_array_elements(node->'children') v LOOP
      evaluated:=pathways_rules_internal.evaluate_node(child,observations,group_depth+1);
      saw_true:=saw_true OR evaluated->>'result'='TRUE';
      saw_false:=saw_false OR evaluated->>'result'='FALSE';
      saw_unknown:=saw_unknown OR evaluated->>'result'='UNAVAILABLE';
      evidence:=evidence||(evaluated->'conditions');
    END LOOP;
    verdict:=CASE WHEN node->>'mode'='AND' AND saw_false THEN 'FALSE'
      WHEN node->>'mode'='OR' AND saw_true THEN 'TRUE'
      WHEN saw_unknown THEN 'UNAVAILABLE'
      WHEN node->>'mode'='AND' THEN 'TRUE' ELSE 'FALSE' END;
    RETURN pg_catalog.jsonb_build_object('result',verdict,'conditions',evidence);
  END IF;
  IF node->>'kind' IS DISTINCT FROM 'CONDITION' OR NOT (observations ? (node->>'id')) THEN
    RAISE EXCEPTION 'Incomplete condition observations' USING ERRCODE='22023';
  END IF;
  leaf:=observations->(node->>'id');
  IF leaf->>'metric' IS DISTINCT FROM node->>'metric' THEN
    RAISE EXCEPTION 'Substituted metric' USING ERRCODE='22023';
  END IF;
  cell:=leaf->'cell';
  PERFORM pathways_rules_internal.validate_metric_cell(cell);
  IF node->>'operator' IS NULL OR node->>'operator' NOT IN ('LT','LTE','EQ','GTE','GT','BETWEEN') THEN
    RAISE EXCEPTION 'Invalid typed operator' USING ERRCODE='22023';
  END IF;
  lower_bound:=pathways_rules_internal.decimal_value(node->>'threshold');
  IF node->>'operator'='BETWEEN' THEN
    upper_bound:=pathways_rules_internal.decimal_value(node->>'thresholdMaximum');
    IF lower_bound>upper_bound THEN RAISE EXCEPTION 'Invalid bounds' USING ERRCODE='22023'; END IF;
  ELSIF node ? 'thresholdMaximum' THEN
    RAISE EXCEPTION 'Invalid upper threshold' USING ERRCODE='22023';
  END IF;
  IF cell->>'state' IN ('AVAILABLE','ZERO') THEN
    IF pg_catalog.jsonb_typeof(cell->'value') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid typed metric value' USING ERRCODE='22023';
    END IF;
    value:=pathways_rules_internal.decimal_value(cell->>'value');
    -- Budget and beneficiary percents are non-negative, follow-up and test scores are at most 100 and survey points stay within +-100 (0060, 0073).
    IF (node->>'metric' IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
          'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') AND value<0)
      OR (node->>'metric' IN ('ACTIVITY_COMPLETION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') AND value>100)
      OR (node->>'metric'='SURVEY_MEAN_IMPROVEMENT_POINTS' AND pg_catalog.abs(value)>100)
      OR (node->>'metric' IN ('PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND value<>pg_catalog.trunc(value)) THEN
      RAISE EXCEPTION 'Invalid observed metric domain' USING ERRCODE='22023';
    END IF;
    IF cell->'reason' IS DISTINCT FROM 'null'::jsonb OR
      (cell->>'state'='ZERO' AND value<>0) OR (cell->>'state'='AVAILABLE' AND value=0) THEN
      RAISE EXCEPTION 'Invalid metric state' USING ERRCODE='22023';
    END IF;
    comparison:=CASE node->>'operator' WHEN 'LT' THEN value<lower_bound
      WHEN 'LTE' THEN value<=lower_bound WHEN 'EQ' THEN value=lower_bound
      WHEN 'GTE' THEN value>=lower_bound WHEN 'GT' THEN value>lower_bound
      WHEN 'BETWEEN' THEN value BETWEEN lower_bound AND upper_bound ELSE NULL END;
    IF comparison IS NULL THEN RAISE EXCEPTION 'Invalid typed operator' USING ERRCODE='22023'; END IF;
    verdict:=CASE WHEN comparison THEN 'TRUE' ELSE 'FALSE' END;
  ELSIF cell->>'state' IN ('MISSING','NOT_APPLICABLE','SUPPRESSED')
    AND cell->'value'='null'::jsonb AND pg_catalog.jsonb_typeof(cell->'reason')='string' THEN
    verdict:='UNAVAILABLE';
  ELSE RAISE EXCEPTION 'Invalid metric state' USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object('result',verdict,'conditions',pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('conditionId',node->>'id','result',verdict,'metric',node->>'metric',
      'operator',node->>'operator','threshold',node->>'threshold',
      'thresholdMaximum',node->>'thresholdMaximum','cell',cell)));
END $$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.evaluate_snapshot_rule(tree jsonb,observations jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE pending jsonb[]:=ARRAY[tree]; current_node jsonb; children jsonb[];
  condition_ids text[]:=ARRAY[]::text[]; nodes integer:=0; n integer;
  threshold_value numeric; threshold_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(observations) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid observation manifest' USING ERRCODE='22023';
  END IF;
  WHILE pg_catalog.cardinality(pending)>0 LOOP
    n:=pg_catalog.cardinality(pending); current_node:=pending[n];
    pending:=pending[1:n-1]; nodes:=nodes+1;
    IF nodes>160 OR pg_catalog.jsonb_typeof(current_node) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid bounded tree' USING ERRCODE='22023';
    END IF;
    IF current_node->>'kind'='GROUP' THEN
      IF (current_node-ARRAY['kind','mode','children'])<>'{}'::jsonb
        OR current_node->>'mode' IS NULL OR current_node->>'mode' NOT IN ('AND','OR')
        OR pg_catalog.jsonb_typeof(current_node->'children') IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_array_length(current_node->'children') NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'Invalid bounded group' USING ERRCODE='22023';
      END IF;
      SELECT pg_catalog.array_agg(v.value) INTO children
        FROM pg_catalog.jsonb_array_elements(current_node->'children') v;
      pending:=pending||children;
    ELSIF current_node->>'kind'='CONDITION' THEN
      IF (current_node-ARRAY['kind','id','metric','operator','threshold','thresholdMaximum','indicatorId','activityId'])<>'{}'::jsonb
        OR pg_catalog.jsonb_typeof(current_node->'id') IS DISTINCT FROM 'string'
        OR current_node->>'id' !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
        OR current_node->>'id'=ANY(condition_ids) OR pg_catalog.cardinality(condition_ids)>=32 THEN
        RAISE EXCEPTION 'Invalid bounded condition set' USING ERRCODE='22023';
      END IF;
      IF pg_catalog.jsonb_typeof(current_node->'metric') IS DISTINCT FROM 'string'
        OR current_node->>'metric' NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT',
          'PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
          'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
          'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT')
        OR pg_catalog.jsonb_typeof(current_node->'operator') IS DISTINCT FROM 'string'
        OR current_node->>'operator' NOT IN ('LT','LTE','EQ','GTE','GT','BETWEEN')
        OR pg_catalog.jsonb_typeof(current_node->'threshold') IS DISTINCT FROM 'string'
        OR ((current_node->>'operator'='BETWEEN') IS DISTINCT FROM (current_node ? 'thresholdMaximum')) THEN
        RAISE EXCEPTION 'Invalid typed condition' USING ERRCODE='22023';
      END IF;
      IF current_node->>'operator'='BETWEEN' AND
        pg_catalog.jsonb_typeof(current_node->'thresholdMaximum') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Invalid typed upper threshold' USING ERRCODE='22023';
      END IF;
      IF ((current_node->>'metric' LIKE 'INDICATOR_%') IS DISTINCT FROM (current_node ? 'indicatorId'))
        OR ((current_node->>'metric'='ACTIVITY_OVERDUE_DAYS') IS DISTINCT FROM (current_node ? 'activityId')) THEN
        RAISE EXCEPTION 'Invalid typed record binding' USING ERRCODE='22023';
      END IF;
      IF current_node ? 'indicatorId' THEN
        IF pg_catalog.jsonb_typeof(current_node->'indicatorId') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Invalid indicator binding' USING ERRCODE='22023';
        END IF;
        PERFORM (current_node->>'indicatorId')::uuid;
      END IF;
      IF current_node ? 'activityId' THEN
        IF pg_catalog.jsonb_typeof(current_node->'activityId') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Invalid activity binding' USING ERRCODE='22023';
        END IF;
        PERFORM (current_node->>'activityId')::uuid;
      END IF;
      FOR threshold_text IN SELECT current_node->>'threshold'
        UNION ALL SELECT current_node->>'thresholdMaximum' WHERE current_node ? 'thresholdMaximum' LOOP
        threshold_value:=pathways_rules_internal.decimal_value(threshold_text);
        IF (current_node->>'metric' IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_OVERDUE_DAYS',
              'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
              'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') AND threshold_value<0)
          OR (current_node->>'metric' IN ('ACTIVITY_COMPLETION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') AND threshold_value>100)
          OR (current_node->>'metric'='SURVEY_MEAN_IMPROVEMENT_POINTS' AND pg_catalog.abs(threshold_value)>100)
          OR (current_node->>'metric' IN ('PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
              'ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND threshold_value<>pg_catalog.trunc(threshold_value)) THEN
          RAISE EXCEPTION 'Invalid metric threshold domain' USING ERRCODE='22023';
        END IF;
      END LOOP;
      condition_ids:=pg_catalog.array_append(condition_ids,current_node->>'id');
    ELSE RAISE EXCEPTION 'Invalid rule node' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(condition_ids)=0 OR
    (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(observations))
      <>pg_catalog.cardinality(condition_ids) OR
    EXISTS (SELECT 1 FROM pg_catalog.unnest(condition_ids) c(id) WHERE NOT (observations ? c.id)) THEN
    RAISE EXCEPTION 'Incomplete observation manifest' USING ERRCODE='22023';
  END IF;
  RETURN pathways_rules_internal.evaluate_node(tree,observations,0);
END $$;

CREATE OR REPLACE FUNCTION pathways_rules_internal.project_metric_observation(
 org uuid,project uuid,metric text,indicator uuid,activity uuid,as_of timestamptz,day date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cell jsonb;current_cell jsonb;unit text;start_on date;end_on date;project_status text;archived timestamptz;
 definition record;actual numeric;population bigint;completed bigint;missing bigint;overdue bigint;days integer;
 planned numeric;approved numeric;currencies bigint;follow bigint;mean numeric;
 facts jsonb:='{}';due bigint;no_end bigint;bound_start date;bound_end date;
 total numeric;scored bigint;members bigint;done bigint;
BEGIN
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true OR as_of IS NULL OR day IS NULL
  OR metric NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT',
   'PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS',
   'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
   'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT')
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
 ELSIF metric IN ('BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT','SURVEY_MEAN_IMPROVEMENT_POINTS',
  'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN
  -- Project-level aggregates (0060, 0073): no bindings, no per-row output, every read is lease and family scoped.
  unit:=CASE WHEN metric='SURVEY_MEAN_IMPROVEMENT_POINTS' THEN 'POINTS' ELSE 'PERCENT' END;
  SELECT p.status::text,p.archived_at INTO project_status,archived FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF pathways_rules_internal.lease_family_allowed(org,project,CASE metric WHEN 'BUDGET_UTILIZATION_PERCENT' THEN 'BUDGET'
   WHEN 'BENEFICIARY_FOLLOW_UP_PERCENT' THEN 'BENEFICIARY' WHEN 'KPI_ACHIEVEMENT_PERCENT' THEN 'KPI' ELSE 'SURVEY' END) IS DISTINCT FROM true THEN
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
  ELSIF metric='KPI_ACHIEVEMENT_PERCENT' THEN
   -- Mean baseline-to-target progress of non-archived indicators with a visible value, to tenths as on the overview (0073).
   SELECT count(*) INTO population FROM pathways.project_indicators i
    WHERE i.organization_id=org AND i.project_id=project AND i.archived_at IS NULL;
   IF population>100 THEN RAISE EXCEPTION 'Indicator projection exceeds approved bound' USING ERRCODE='54000'; END IF;
   scored:=0;total:=0;
   FOR definition IN SELECT i.id,i.measurement_mode,i.numeric_kind,i.direction,i.baseline_value,i.target_value,i.period_start,i.period_end
    FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project AND i.archived_at IS NULL ORDER BY i.id LOOP
    -- The current value follows the bound indicator branch above.
    IF definition.measurement_mode='MANUAL' THEN
     SELECT m.value INTO actual FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
      AND m.indicator_id=definition.id AND m.period_start=definition.period_start AND m.period_end=definition.period_end AND m.recorded_at<=as_of
      AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements next_measurement WHERE next_measurement.organization_id=org
       AND next_measurement.project_id=project AND next_measurement.indicator_id=definition.id AND next_measurement.corrects_measurement_id=m.id
       AND next_measurement.recorded_at<=as_of) ORDER BY m.recorded_at DESC,m.id DESC LIMIT 1;
     current_cell:=CASE WHEN actual IS NULL THEN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT')
      ELSE pathways_rules_internal.numeric_cell(actual) END;
    ELSE
     SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED') INTO members,done FROM pathways.project_activities a
      WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
       AND a.planned_end_date BETWEEN definition.period_start AND definition.period_end;
     IF members>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
     current_cell:=CASE WHEN members=0 THEN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR')
      ELSE pathways_rules_internal.progress_cell(done::text,'0',members::text,'HIGHER_IS_BETTER') END;
    END IF;
    IF current_cell->>'value' IS NOT NULL AND NOT (
     definition.numeric_kind NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
     OR (definition.numeric_kind<>'SIGNED_CHANGE' AND (current_cell->>'value')::numeric<0)
     OR (definition.numeric_kind='COUNT' AND (current_cell->>'value')::numeric<>pg_catalog.trunc((current_cell->>'value')::numeric))
     OR (definition.numeric_kind='PERCENTAGE' AND (current_cell->>'value')::numeric>100)) THEN
     current_cell:=pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
      definition.target_value::text,definition.direction);
     IF current_cell->>'value' IS NOT NULL THEN scored:=scored+1;total:=total+(current_cell->>'value')::numeric; END IF;
    END IF;
   END LOOP;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF scored=0 THEN cell:=pathways_rules_internal.unavailable_cell('NO_MEASUREMENT');
   ELSE
    mean:=pg_catalog.round(total/scored,1);
    cell:=CASE WHEN pg_catalog.abs(mean)>99999999999999 THEN pathways_rules_internal.unavailable_cell('PROGRESS_OUT_OF_RANGE')
     ELSE pathways_rules_internal.numeric_cell(mean) END;
   END IF;
  ELSIF metric IN ('SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN
   -- Mean of each ACTIVE enrollment's latest valid pre-test or post-test score on a 0 to 100 scale (0073).
   WITH latest AS (SELECT DISTINCT ON (ar.enrollment_id) ar.score*100/ar.maximum_score AS pct FROM pathways.assessment_results ar
     JOIN pathways.beneficiary_project_enrollments en ON en.organization_id=ar.organization_id AND en.project_id=ar.project_id
      AND en.id=ar.enrollment_id
     WHERE ar.organization_id=org AND ar.project_id=project AND en.status='ACTIVE'
      AND ar.type::text=CASE metric WHEN 'SURVEY_MEAN_PRE_TEST_PERCENT' THEN 'PRE_TEST' ELSE 'POST_TEST' END
      AND ar.score<>'NaN'::numeric AND ar.maximum_score<>'NaN'::numeric AND ar.maximum_score>0
     ORDER BY ar.enrollment_id,ar.assessment_date DESC,ar.id DESC)
   SELECT count(*),pg_catalog.round(avg(l.pct),4) INTO population,mean FROM latest l;
   IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
   ELSIF population<5 THEN cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
   ELSIF mean IS NULL OR mean<0 OR mean>100 THEN cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC');
   ELSE cell:=pathways_rules_internal.numeric_cell(mean); END IF;
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
       'BUDGET_UTILIZATION_PERCENT','BENEFICIARY_FOLLOW_UP_PERCENT',
       'KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN 'PERCENT'
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

-- 4. prisma: the severity twin, and source reads for the projection owner on the prisma-owned tables.
CREATE OR REPLACE FUNCTION pathways_rules_internal.severity_condition_basis(node jsonb,f jsonb,e jsonb)
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
 ELSIF metric IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','KPI_ACHIEVEMENT_PERCENT','SURVEY_MEAN_PRE_TEST_PERCENT','SURVEY_MEAN_POST_TEST_PERCENT') THEN outcome:='EXPLANATORY';
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

CREATE POLICY f10_projection_kpi_indicator ON pathways.project_indicators FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_family_allowed(organization_id,project_id,'KPI'));
ALTER POLICY f10_projection_indicator_numeric_guard ON pathways.project_indicators
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,id)
  OR pathways_rules_internal.lease_family_allowed(organization_id,project_id,'KPI'));
CREATE POLICY f10_projection_kpi_measurement ON pathways.project_indicator_measurements FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_family_allowed(organization_id,project_id,'KPI'));
ALTER POLICY f10_projection_measurement_numeric_guard ON pathways.project_indicator_measurements
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,indicator_id)
  OR pathways_rules_internal.lease_family_allowed(organization_id,project_id,'KPI'));
ALTER POLICY f10_projection_enrollment ON pathways.beneficiary_project_enrollments
 USING(pathways_rules_internal.lease_family_allowed(organization_id,project_id,'BENEFICIARY')
  OR pathways_rules_internal.lease_family_allowed(organization_id,project_id,'SURVEY'));

-- 5. The schema owner takes back every loan from step 0.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM prisma,rules_projection_owner,rules_eligibility_owner;
DO $$ BEGIN
 IF pg_catalog.current_setting('pathways_0073.had_usage')<>'true' THEN REVOKE USAGE ON SCHEMA pathways_rules_internal FROM prisma; END IF;
END $$;
RESET ROLE;

-- 6. Postconditions; functions are resolved by text because prisma may hold no USAGE on the schema.
DO $$ DECLARE fn record; wanted record; BEGIN
 FOR wanted IN SELECT * FROM (VALUES
  (0,'pathways_rules_internal.evaluate_node(jsonb,jsonb,integer)','rules_projection_owner',false,'i','bac51a74919c562b47181a0ded1412f7'),
  (1,'pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb)','rules_projection_owner',false,'i','dd6ee27690fd84e59a22ac9c114dd3d6'),
  (2,'pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamp with time zone,date)','rules_projection_owner',true,'s','6e17a7de0f8db3551710a39cb50f8288'),
  (3,'pathways_rules_internal.capture_rule_snapshot(uuid,text)','rules_projection_owner',true,'v','1d7d37609bb7a3bf2655ba936c775a10'),
  (4,'pathways_rules_internal.lease_family_allowed(uuid,uuid,text)','rules_eligibility_owner',true,'v','4a094a62cbad1142fe02456b3e96028e'),
  (5,'pathways_rules_internal.rule_audience_allowed(uuid)','rules_eligibility_owner',true,'s','8015b64905673f98f6597f13c22e4d95'),
  (6,'pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamp with time zone)','rules_eligibility_owner',true,'s','19cf161a051a7d5d2363f69ef2bede33'),
  (7,'pathways_rules_internal.severity_condition_basis(jsonb,jsonb,jsonb)','prisma',false,'i','1f22d12f94d2a606170d4bbcad67ad4c')
 ) w(n,signature,owner,definer,volatility,source_md5) LOOP
  SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid::pg_catalog.regprocedure::pg_catalog.text=wanted.signature;
  IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>wanted.owner OR fn.prosecdef IS DISTINCT FROM wanted.definer
   OR fn.provolatile<>wanted.volatility OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR pg_catalog.md5(fn.prosrc)<>wanted.source_md5
   OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0073.acl_'||wanted.n)
  THEN RAISE EXCEPTION '0073 replaced function postcondition failed for %',wanted.signature; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=(SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
   ON n.oid=c.relnamespace WHERE n.nspname='pathways_rules_internal' AND c.relname='rule_bindings')
   AND contype='c' AND convalidated AND pg_catalog.pg_get_constraintdef(oid) LIKE '%SURVEY_MEAN_POST_TEST_PERCENT%')<>1
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_kpi_indicator','f10_projection_kpi_measurement') AND polpermissive AND polcmd='r'
   AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_projection_owner')])<>2
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_indicator_numeric_guard',
   'f10_projection_measurement_numeric_guard') AND NOT polpermissive
   AND pg_catalog.pg_get_expr(polqual,polrelid) LIKE '%lease_indicator_allowed%'
   AND pg_catalog.pg_get_expr(polqual,polrelid) LIKE '%''KPI''%')<>2
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname='f10_projection_enrollment'
   AND pg_catalog.pg_get_expr(polqual,polrelid) LIKE '%''SURVEY''%')<>1
 THEN RAISE EXCEPTION '0073 metric catalog postcondition failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('prisma','rules_projection_owner','rules_eligibility_owner')
   AND pg_catalog.has_schema_privilege(r.oid,'pathways_rules_internal','CREATE'))
  OR pg_catalog.has_schema_privilege('prisma','pathways_rules_internal','USAGE')::text<>pg_catalog.current_setting('pathways_0073.had_usage')
 THEN RAISE EXCEPTION '0073 schema loan postcondition failed'; END IF;
END $$;
COMMIT;
