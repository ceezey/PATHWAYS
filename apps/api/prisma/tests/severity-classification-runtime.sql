-- cr-pathways-severity-classification (migration 0072): SQL classifier parity with the shared fixtures,
-- observation facts and catalog shape. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- from the repository root against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0072.
-- The fixtures are read with `type` on Windows (the Replay-Local and Verify-Forward host) and `cat` elsewhere.
\set ON_ERROR_STOP on
\getenv windows_os OS
\if :{?windows_os}
\set fixtures `type packages\shared\src\rules\severity\severity-fixtures.json`
\else
\set fixtures `cat packages/shared/src/rules/severity/severity-fixtures.json`
\endif
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0072 severity classification checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE sc_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO sc_results VALUES(label);
END $$;
-- Reverses every group's children, which must not change the basis.
CREATE FUNCTION pg_temp.reversed(node jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN node->>'kind'='GROUP' THEN node||jsonb_build_object('children',
  (SELECT jsonb_agg(pg_temp.reversed(c.value) ORDER BY c.ord DESC) FROM jsonb_array_elements(node->'children') WITH ORDINALITY c(value,ord)))
  ELSE node END
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- (1) Catalog: storage, the prisma-owned invoker classifier and its narrow EXECUTE grant.
SELECT pg_temp.ok((SELECT NOT attnotnull AND NOT atthasdef FROM pg_attribute WHERE attrelid='pathways.alert_rules'::regclass AND attname='severity')
 AND (SELECT NOT attnotnull FROM pg_attribute WHERE attrelid='pathways.rule_based_alerts'::regclass AND attname='severity')
 AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='pathways' AND ((table_name='alert_rules'
   AND column_name IN ('expected_score_improvement','manageable_follow_up_percent') AND numeric_precision=18 AND numeric_scale=4)
  OR (table_name='rule_based_alerts' AND column_name IN ('severity_basis','severity_change') AND data_type='jsonb')))=4,'storage shape');
SELECT pg_temp.ok((SELECT count(*) FROM pg_proc p WHERE p.pronamespace='pathways_rules_internal'::regnamespace
  AND p.proname IN ('classify_alert_severity','severity_shown','severity_calendar_date','severity_node_result','severity_condition_basis')
  AND pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.provolatile='i' AND p.proconfig=ARRAY['search_path=""']
  AND has_function_privilege('rules_commit_owner',p.oid,'EXECUTE') AND NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('pathways_rules_worker',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))=5,
 'classifier owner, mode and grants');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
  WHERE r.rolname LIKE 'rules\_%\_owner' AND m.member=(SELECT oid FROM pg_roles WHERE rolname='prisma'))
 AND NOT has_schema_privilege('prisma','pathways_rules_internal','CREATE')
 AND NOT has_schema_privilege('rules_projection_owner','pathways_rules_internal','CREATE'),'no residual owner chain or schema loan');
SELECT pg_temp.ok((SELECT count(*) FROM pg_constraint WHERE contype='c' AND conname IN
  ('alert_rules_expected_score_improvement_range','alert_rules_manageable_follow_up_percent_range','rule_based_alerts_severity_basis_check'))=3,
 'range and basis constraints');

-- (2) Parity: every shared fixture, and its reversed-children twin, gives the expected basis exactly.
CREATE TEMP TABLE sc_fixtures ON COMMIT DROP AS SELECT f.value->>'name' AS name,f.value->'input' AS input,f.value->'expected' AS expected
 FROM jsonb_array_elements(:'fixtures'::jsonb) f;
SELECT pg_temp.ok(pathways_rules_internal.classify_alert_severity(input->'tree',input->'results',input->'facts',
  input->'expectations',input->>'ruleSeverity')=expected,'fixture: '||name) FROM sc_fixtures ORDER BY name;
SELECT pg_temp.ok(pathways_rules_internal.classify_alert_severity(pg_temp.reversed(input->'tree'),input->'results',input->'facts',
  input->'expectations',input->>'ruleSeverity')=expected,'reversed fixture: '||name) FROM sc_fixtures ORDER BY name;
SELECT pg_temp.ok((SELECT count(*) FROM sc_fixtures)>=71,'fixture set loaded');
DO $$ BEGIN
 BEGIN
  PERFORM pathways_rules_internal.classify_alert_severity('{"kind":"CONDITION","id":"c1","metric":"BUDGET_UTILIZATION_PERCENT"}',
   '{"c1":"FALSE"}','{}','{}',NULL);
  RAISE EXCEPTION 'unmatched rule was classified';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Only a matched rule has a severity.' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM pathways_rules_internal.classify_alert_severity('{"kind":"CONDITION","id":"c1","metric":"BUDGET_UTILIZATION_PERCENT"}',
   '{"c1":"TRUE"}','{}','{}',NULL);
  RAISE EXCEPTION 'counted condition without facts was classified';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Severity facts are missing for condition c1.' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.ok(true,'unmatched rule and missing facts are refused');

-- (3) Facts: lease checks are stubbed inside this rolled-back transaction so the projection runs as a unit.
CREATE OR REPLACE FUNCTION pathways_rules_internal.lease_metric_scope(org uuid,project uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';
CREATE OR REPLACE FUNCTION pathways_rules_internal.lease_indicator_allowed(org uuid,project uuid,indicator uuid) RETURNS boolean
 LANGUAGE sql VOLATILE AS 'SELECT true';
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'SEV_A','Synthetic severity org');
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status)
 VALUES (pg_temp.u(2),pg_temp.u(1),'SEV-P','Synthetic severity project',date '2026-07-11',date '2027-01-27','ONGOING');
-- Baseline 0, target 200 and a reading of 160 is 80 percent progress, due on the reporting date itself.
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,measurement_mode,numeric_kind,direction,display_precision,
 period_start,period_end,unit_label,data_source,baseline_value,target_value,target_date)
 VALUES (pg_temp.u(3),pg_temp.u(1),pg_temp.u(2),'SEV-I','Synthetic reach','MANUAL','NON_NEGATIVE','HIGHER_IS_BETTER',0,
  date '2026-01-01',date '2026-12-31','people','Synthetic',0,200,date '2026-10-19');
INSERT INTO pathways.project_indicator_measurements(organization_id,project_id,indicator_id,period_start,period_end,value,source,
 client_measurement_id,request_hash,recorded_by_id,recorded_at)
 VALUES (pg_temp.u(1),pg_temp.u(2),pg_temp.u(3),date '2026-01-01',date '2026-12-31',160,'Synthetic',pg_temp.u(4),repeat('a',64),
  pg_temp.u(5),timestamptz '2026-10-01 00:00+08');
-- Ten included activities: eight planned to end on or before the reporting date, two after it.
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,status,planned_start_date,planned_end_date)
 SELECT pg_temp.u(10+g),pg_temp.u(1),pg_temp.u(2),'SEV-A'||g,'Synthetic activity '||g,'NOT_STARTED',date '2026-09-01',
  CASE WHEN g<=8 THEN date '2026-10-19'-g+1 ELSE date '2026-11-15' END FROM generate_series(1,10) g;
SET LOCAL session_replication_role = origin;
CREATE TEMP TABLE sc_observed ON COMMIT DROP AS SELECT v.metric,pathways_rules_internal.project_metric_observation(pg_temp.u(1),pg_temp.u(2),
  v.metric,v.indicator,v.activity,timestamptz '2026-10-19 12:00+08',date '2026-10-19') AS doc
 FROM (VALUES ('INDICATOR_CURRENT_VALUE',pg_temp.u(3),NULL::uuid),('ACTIVITY_COMPLETION_PERCENT',NULL,NULL),
  ('ACTIVITY_OVERDUE_DAYS',NULL,pg_temp.u(11)),('PROJECT_OVERDUE_DAYS',NULL,NULL)) v(metric,indicator,activity);
SELECT pg_temp.ok((SELECT doc->'facts'='{"metric":"INDICATOR_CURRENT_VALUE","value":"160","reportingDate":"2026-10-19","progress":"80",
  "targetDate":"2026-10-19","periodEnd":"2026-12-31"}'::jsonb FROM sc_observed WHERE metric='INDICATOR_CURRENT_VALUE'),
 'indicator due today gives progress and target date');
SELECT pg_temp.ok((SELECT doc->'facts'='{"metric":"ACTIVITY_COMPLETION_PERCENT","value":"0","reportingDate":"2026-10-19","included":10,
  "dueByDate":8,"missingEnd":0}'::jsonb FROM sc_observed WHERE metric='ACTIVITY_COMPLETION_PERCENT'),'ten included activities with eight due');
SELECT pg_temp.ok((SELECT doc->'facts'->>'activityStart'='2026-09-01' AND doc->'facts'->>'activityEnd'='2026-10-19'
  AND doc->'facts'->'included'='1' FROM sc_observed WHERE metric='ACTIVITY_OVERDUE_DAYS')
 AND (SELECT doc->'facts'->>'startDate'='2026-07-11' AND doc->'facts'->>'endDate'='2027-01-27'
  FROM sc_observed WHERE metric='PROJECT_OVERDUE_DAYS'),'bound activity and project dates');
-- The captured facts feed the classifier: 80 percent of a target due today is 20 behind, Medium.
SELECT pg_temp.ok(pathways_rules_internal.classify_alert_severity(
  '{"kind":"CONDITION","id":"c1","metric":"INDICATOR_CURRENT_VALUE","operator":"LT","threshold":"180","indicatorId":"7f000000-0000-4000-8000-000000000003"}',
  '{"c1":"TRUE"}',jsonb_build_object('c1',(SELECT doc->'facts' FROM sc_observed WHERE metric='INDICATOR_CURRENT_VALUE')),'{}',NULL)
  @>'{"status":"CLASSIFIED","level":"MEDIUM","conditions":[{"measure":{"value":"20.0000"}}]}','observed facts classify');
-- A suppressed indicator or family gives only the base facts, so no withheld figure can reach a basis.
CREATE OR REPLACE FUNCTION pathways_rules_internal.lease_indicator_allowed(org uuid,project uuid,indicator uuid) RETURNS boolean
 LANGUAGE sql VOLATILE AS 'SELECT false';
CREATE OR REPLACE FUNCTION pathways_rules_internal.lease_family_allowed(org uuid,project uuid,family text) RETURNS boolean
 LANGUAGE sql VOLATILE AS 'SELECT false';
SELECT pg_temp.ok((SELECT bool_and(pathways_rules_internal.project_metric_observation(pg_temp.u(1),pg_temp.u(2),v.metric,v.indicator,NULL,
   timestamptz '2026-10-19 12:00+08',date '2026-10-19')->'facts'=jsonb_build_object('metric',v.metric,'value',NULL,'reportingDate','2026-10-19'))
  FROM (VALUES ('INDICATOR_CURRENT_VALUE',pg_temp.u(3)),('INDICATOR_PROGRESS_PERCENT',pg_temp.u(3)),
   ('BENEFICIARY_FOLLOW_UP_PERCENT',NULL::uuid),('SURVEY_MEAN_IMPROVEMENT_POINTS',NULL)) v(metric,indicator)),
 'suppressed indicator and families give base facts only');

-- (4) Part 2: the commit owner can classify, writes the severity columns, and humans read the basis.
SET LOCAL ROLE rules_commit_owner;
SELECT pathways_rules_internal.classify_alert_severity('{"kind":"CONDITION","id":"c1","metric":"BUDGET_UTILIZATION_PERCENT"}',
 '{"c1":"TRUE"}','{"c1":{"metric":"BUDGET_UTILIZATION_PERCENT","value":"105","reportingDate":"2026-10-19"}}','{}',NULL)->>'level' AS commit_owner_level \gset
RESET ROLE;
SELECT pg_temp.ok(:'commit_owner_level'='MEDIUM','commit owner classifies under its own grant');
SELECT pg_temp.ok(has_column_privilege('rules_commit_owner','pathways.rule_based_alerts','severity','UPDATE')
 AND has_column_privilege('rules_commit_owner','pathways.rule_based_alerts','severity_basis','UPDATE')
 AND has_column_privilege('rules_commit_owner','pathways.rule_based_alerts','severity_change','UPDATE')
 AND has_column_privilege('rules_human_owner','pathways.rule_based_alerts','severity_basis','SELECT')
 AND has_column_privilege('rules_human_owner','pathways.rule_based_alerts','severity_change','SELECT')
 AND NOT has_column_privilege('rules_outcome_owner','pathways.rule_based_alerts','severity_basis','UPDATE')
 AND (SELECT pg_get_constraintdef(oid) LIKE '%IS DISTINCT FROM ''CONTEXT_REQUIRED''%' FROM pg_constraint
  WHERE conrelid='pathways.rule_based_alerts'::regclass AND conname='rule_based_alerts_severity_basis_check'),'part 2 column grants and strict basis check');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM sc_results;
 RAISE NOTICE 'SEVERITY_CLASSIFICATION_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
