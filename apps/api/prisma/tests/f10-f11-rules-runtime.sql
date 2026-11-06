-- PRD-F10/F11 gate closure (migrations 0058-0060, 0072, 0073): end-to-end rules runtime checks.
-- Synthetic fixtures only. The machine phases run in separate transactions as the worker and sweeper logins and
-- the human calls as pathways_runtime with the app.* context, so the data COMMITS: run only against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that has 0060 applied and its cleanup run.
\set ON_ERROR_STOP on

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'F10/F11 rules runtime checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE t_results(check_name text PRIMARY KEY);
CREATE TEMP TABLE t_out(name text PRIMARY KEY, doc jsonb);
GRANT INSERT, SELECT ON t_results, t_out TO PUBLIC;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO t_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO t_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Human session: user n of org A (n=5 belongs to org B), logged in as the runtime role.
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE 'SET LOCAL SESSION AUTHORIZATION pathways_runtime';
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
  set_config('app.organization_id',pg_temp.u(CASE WHEN n=5 THEN 2 ELSE 1 END)::text,true),
  set_config('app.user_id',pg_temp.u(100+n)::text,true);
END $$;
-- Machine drain: claim, capture (repeatable read) and commit, each in its own transaction as the worker login.
CREATE PROCEDURE pg_temp.drain(label text,max_jobs integer DEFAULT 20) LANGUAGE plpgsql AS $$
DECLARE claim jsonb; captured jsonb; handled integer:=0;
BEGIN
 WHILE handled<max_jobs LOOP
  SET LOCAL SESSION AUTHORIZATION pathways_rules_worker;
  claim:=pathways_rules_internal.claim_rule_project();
  COMMIT;
  SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
  EXIT WHEN claim IS NULL;
  SET LOCAL SESSION AUTHORIZATION pathways_rules_worker;
  captured:=pathways_rules_internal.capture_rule_snapshot((claim->>'jobId')::uuid,claim->>'leaseNonce');
  COMMIT;
  SET LOCAL SESSION AUTHORIZATION pathways_rules_worker;
  PERFORM pathways_rules_internal.commit_rule_snapshot((claim->>'jobId')::uuid,claim->>'leaseNonce',
   (captured->>'snapshotId')::uuid,decode(captured->>'digest','hex'));
  COMMIT;
  handled:=handled+1;
  DELETE FROM t_out WHERE name='last_drain';
  INSERT INTO t_out VALUES('last_drain',jsonb_build_object('claim',claim,'captured',captured));
 END LOOP;
 INSERT INTO t_out VALUES('drain_'||label,jsonb_build_object('handled',handled));
END $$;
-- Rule create and activate as the system administrator, stored under a name; extra overrides request keys.
CREATE FUNCTION pg_temp.make_rule(tag text,project integer,metric text,operator text,threshold text,recs integer,op integer,extra jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE created jsonb;
BEGIN
 created:=pathways.f10_rule_create(jsonb_build_object('name','Rule '||tag,'severity',NULL,'code','F10-'||upper(tag),
  'projectId',pg_temp.u(project),'clientOperationId',pg_temp.u(op),
  'conditions',jsonb_build_object('kind','CONDITION','id','c1','metric',metric,'operator',operator,'threshold',threshold),
  'recommendations',(SELECT jsonb_agg(jsonb_build_object('id',pg_temp.u(op*10+g),'title','Action '||g,'text','Synthetic action '||g)) FROM generate_series(1,recs) g))||extra);
 INSERT INTO t_out VALUES('rule_'||tag,created);
 PERFORM pathways.f10_rule_activate((created->>'id')::uuid,jsonb_build_object('expectedVersion',1,'clientOperationId',pg_temp.u(op+1)));
END $$;

-- Catalog shape of 0058-0060.
SELECT pg_temp.ok(EXISTS(SELECT FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='decision_status' AND e.enumlabel='AUTO_RESOLVED'),'enum label');
SELECT pg_temp.ok((SELECT count(*) FROM pg_policy WHERE NOT polpermissive AND polname LIKE 'f10\_audience\_%')=4,'four audience policies');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways_rules_internal.rule_audience_allowed(uuid)','EXECUTE')
 AND NOT has_function_privilege('pathways_runtime','pathways_rules_internal.lease_family_allowed(uuid,uuid,text)','EXECUTE')
 AND has_function_privilege('rules_human_owner','pathways_rules_internal.rule_audience_allowed(uuid)','EXECUTE')
 AND has_function_privilege('rules_projection_owner','pathways_rules_internal.lease_family_allowed(uuid,uuid,text)','EXECUTE'),'family helper ACLs');
SELECT pg_temp.ok(NOT has_column_privilege('rules_eligibility_owner','pathways.budget_expense_entries','amount','SELECT')
 AND has_column_privilege('rules_projection_owner','pathways.budget_expense_entries','amount','SELECT')
 AND NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname LIKE 'rules\_%\_owner' AND m.member=(SELECT oid FROM pg_roles WHERE rolname='prisma')),
 'projection reads amounts, freshness never, no residual owner chain');

-- Fixtures: org A users 101 SA, 102 PM (P1,P3), 103 M&E (P1,P3), 104 PM (P2 only); org B user 105.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,6) n;
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'F10R_A','Synthetic F10 org A'),(pg_temp.u(2),'F10R_B','Synthetic F10 org B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),v.org,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES (1,pg_temp.u(1),'SYSTEM_ADMINISTRATOR','F10 SA','f10-sa@example.invalid'),
 (2,pg_temp.u(1),'PROJECT_MANAGER','F10 PM','f10-pm@example.invalid'),
 (3,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','F10 ME','f10-me@example.invalid'),
 (4,pg_temp.u(1),'PROJECT_MANAGER','F10 PM other','f10-pm2@example.invalid'),
 (5,pg_temp.u(2),'PROJECT_MANAGER','F10 PM org B','f10-pmb@example.invalid'),
 (6,pg_temp.u(1),'GRANT_MANAGER','F10 GM aggregate only','f10-gm@example.invalid')) v(n,org,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- P1 timeline, P2 out of scope, P3 budget 85 percent plus timeline, P4 zero planned, P5 three enrollments,
-- P6 ten with five follow-ups, P7 six survey pairs, P8 mixed currency, P9 on hold, P10 org B.
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status,created_by_id)
SELECT pg_temp.u(300+n),CASE WHEN n=10 THEN pg_temp.u(2) ELSE pg_temp.u(1) END,'F10R-P'||n,'F10 project '||n,
 current_date-200,current_date-10,CASE WHEN n=9 THEN 'ON_HOLD' ELSE 'ONGOING' END::pathways.project_status,
 CASE WHEN n=10 THEN pg_temp.u(105) ELSE pg_temp.u(101) END
FROM generate_series(1,10) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(402),pg_temp.u(1),pg_temp.u(303),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(101)),
 (pg_temp.u(404),pg_temp.u(1),pg_temp.u(303),pg_temp.u(103),pg_temp.u(101)),
 (pg_temp.u(405),pg_temp.u(1),pg_temp.u(302),pg_temp.u(104),pg_temp.u(101)),
 (pg_temp.u(406),pg_temp.u(2),pg_temp.u(310),pg_temp.u(105),pg_temp.u(105)),
 (pg_temp.u(407),pg_temp.u(1),pg_temp.u(306),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(408),pg_temp.u(1),pg_temp.u(306),pg_temp.u(106),pg_temp.u(101)),
 (pg_temp.u(409),pg_temp.u(1),pg_temp.u(301),pg_temp.u(106),pg_temp.u(101));
-- Budgets. P3: active record 100 (approved 85, pending 40) and an archived record 900 with approved 500 (both excluded).
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id,recorded_at,archived_at) VALUES
 (pg_temp.u(501),pg_temp.u(1),pg_temp.u(303),'Supplies','PHP',100,pg_temp.u(101),now()-interval '1 day',NULL),
 (pg_temp.u(502),pg_temp.u(1),pg_temp.u(303),'Old','PHP',900,pg_temp.u(101),now()-interval '1 day',now()),
 (pg_temp.u(503),pg_temp.u(1),pg_temp.u(304),'Zero','PHP',0,pg_temp.u(101),now()-interval '1 day',NULL),
 (pg_temp.u(504),pg_temp.u(1),pg_temp.u(308),'PHP part','PHP',100,pg_temp.u(101),now()-interval '1 day',NULL),
 (pg_temp.u(505),pg_temp.u(1),pg_temp.u(308),'USD part','USD',100,pg_temp.u(101),now()-interval '1 day',NULL),
 (pg_temp.u(506),pg_temp.u(1),pg_temp.u(309),'Hold','PHP',100,pg_temp.u(101),now()-interval '1 day',NULL);
INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,status,
 submitted_by_id,submitted_at,verified_by_id,verified_at,approved_by_id,approved_at) VALUES
 (pg_temp.u(511),pg_temp.u(1),pg_temp.u(303),pg_temp.u(501),'Approved',85,current_date,'APPROVED',pg_temp.u(101),now()-interval '3 hours',pg_temp.u(102),now()-interval '2 hours',pg_temp.u(103),now()-interval '1 hour'),
 (pg_temp.u(512),pg_temp.u(1),pg_temp.u(303),pg_temp.u(501),'Pending',40,current_date,'PENDING',pg_temp.u(101),now()-interval '3 hours',NULL,NULL,NULL,NULL),
 (pg_temp.u(513),pg_temp.u(1),pg_temp.u(303),pg_temp.u(502),'Archived record',500,current_date,'APPROVED',pg_temp.u(101),now()-interval '3 hours',pg_temp.u(102),now()-interval '2 hours',pg_temp.u(103),now()-interval '1 hour'),
 (pg_temp.u(514),pg_temp.u(1),pg_temp.u(308),pg_temp.u(504),'Approved',10,current_date,'APPROVED',pg_temp.u(101),now()-interval '3 hours',pg_temp.u(102),now()-interval '2 hours',pg_temp.u(103),now()-interval '1 hour'),
 (pg_temp.u(515),pg_temp.u(1),pg_temp.u(309),pg_temp.u(506),'Approved',90,current_date,'APPROVED',pg_temp.u(101),now()-interval '3 hours',pg_temp.u(102),now()-interval '2 hours',pg_temp.u(103),now()-interval '1 hour');
-- Enrollments. P5: 3 active. P6: ids 6001-6010 active (1-5 latest needs follow-up, 6-10 latest completed but
-- with an older follow-up), 6011 active without participation, 6012 dropped with follow-up.
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,status,ended_date,end_reason,recorded_by_id)
SELECT pg_temp.u(5000+g),pg_temp.u(1),pg_temp.u(305),pg_temp.u(5100+g),current_date-100,'ACTIVE',NULL,NULL,pg_temp.u(101) FROM generate_series(1,3) g
UNION ALL SELECT pg_temp.u(6000+g),pg_temp.u(1),pg_temp.u(306),pg_temp.u(6100+g),current_date-100,
 CASE WHEN g=12 THEN 'DROPPED' ELSE 'ACTIVE' END::pathways.enrollment_status,CASE WHEN g=12 THEN current_date-50 END,CASE WHEN g=12 THEN 'Dropped out' END,pg_temp.u(101) FROM generate_series(1,12) g
UNION ALL SELECT pg_temp.u(7000+g),pg_temp.u(1),pg_temp.u(307),pg_temp.u(7100+g),current_date-100,'ACTIVE',NULL,NULL,pg_temp.u(101) FROM generate_series(1,7) g;
INSERT INTO pathways.beneficiary_activity_participations(id,organization_id,project_id,enrollment_id,activity_id,participation_date,progress_status,recorded_by_id,recorded_at)
SELECT pg_temp.u(5200+g),pg_temp.u(1),pg_temp.u(305),pg_temp.u(5000+g),pg_temp.u(9900),current_date-5,'NEEDS_FOLLOW_UP',pg_temp.u(101),now() FROM generate_series(1,3) g
UNION ALL SELECT pg_temp.u(6200+g),pg_temp.u(1),pg_temp.u(306),pg_temp.u(6000+g),pg_temp.u(9900),current_date-5,
 CASE WHEN g<=5 OR g=12 THEN 'NEEDS_FOLLOW_UP' ELSE 'COMPLETED' END::pathways.progress_status,pg_temp.u(101),now() FROM generate_series(1,12) g WHERE g<>11
UNION ALL SELECT pg_temp.u(6300+g),pg_temp.u(1),pg_temp.u(306),pg_temp.u(6000+g),pg_temp.u(9900),current_date-30,'NEEDS_FOLLOW_UP',pg_temp.u(101),now() FROM generate_series(6,10) g;
-- Survey: enrollments 7001-7006 pair (pre 50 percent; post 60 for 7001-7004 and 70 for 7005-7006, mean 13.3333),
-- 7006 also holds an older pre of 10 that must not count; 7007 has a pre only.
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(7200+g),pg_temp.u(1),pg_temp.u(307),pg_temp.u(7000+g),'PRE_TEST'::pathways.assessment_type,50,100,current_date-60,pg_temp.u(101) FROM generate_series(1,7) g
UNION ALL SELECT pg_temp.u(7300+g),pg_temp.u(1),pg_temp.u(307),pg_temp.u(7000+g),'POST_TEST'::pathways.assessment_type,CASE WHEN g<=4 THEN 60 ELSE 70 END,100,current_date-20,pg_temp.u(101) FROM generate_series(1,6) g
UNION ALL SELECT pg_temp.u(7400),pg_temp.u(1),pg_temp.u(307),pg_temp.u(7006),'PRE_TEST'::pathways.assessment_type,10,100,current_date-90,pg_temp.u(101);
COMMIT;

-- (1) The system administrator creates and activates the overdue-days rule on P1 with three recommendations.
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.make_rule('p1',301,'PROJECT_OVERDUE_DAYS','GT','0',3,9000);
COMMIT;
SELECT pg_temp.ok((SELECT doc->>'status' FROM t_out WHERE name='rule_p1')='DRAFT'
 AND (SELECT status::text FROM pathways.alert_rules WHERE id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_p1'))='ACTIVE','rule created then activated');

-- (2) First drain: one NEW SYSTEM alert with evidence, three NEW recommendations, lifecycle event and audit.
CALL pg_temp.drain('p1');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301))=1,'exactly one alert');
SELECT pg_temp.ok((SELECT lifecycle='NEW' AND attribution='SYSTEM' AND evaluated_snapshot->'conditions'->0->>'unit'='DAYS'
  AND (evaluated_snapshot->'conditions'->0->'cell'->>'value')::numeric>0 AND evaluated_snapshot->>'snapshotId' IS NOT NULL
  FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301)),'alert evidence value, unit and snapshot');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(301) AND status='NEW' AND attribution='SYSTEM')=3,'three NEW recommendations');
SELECT pg_temp.ok((SELECT count(*) FROM pathways_rules_internal.lifecycle_events e JOIN pathways.rule_based_alerts a ON a.id=e.alert_id
  WHERE a.project_id=pg_temp.u(301) AND e.state_after='NEW' AND e.actor_kind='SYSTEM')=1
 AND EXISTS(SELECT FROM pathways.audit_logs WHERE project_id=pg_temp.u(301) AND action='rules.system.evaluated'),'lifecycle event and evaluation audit');
INSERT INTO t_out SELECT 'p1_counts',jsonb_build_object('evaluations',(SELECT count(*) FROM pathways_rules_internal.evaluations WHERE project_id=pg_temp.u(301)),
 'alerts',(SELECT count(*) FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301)));

SELECT pg_temp.ok((SELECT count(*) FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(301))=3
 AND NOT EXISTS((SELECT d.source_rule_recommendation_id,d.title,d.text FROM pathways.decision_recommendations d WHERE d.project_id=pg_temp.u(301))
  EXCEPT (SELECT t.id,t.title,t.text FROM pathways.alert_rule_recommendations t WHERE t.rule_id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_p1')))
 AND NOT EXISTS((SELECT t.id,t.title,t.text FROM pathways.alert_rule_recommendations t WHERE t.rule_id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_p1'))
  EXCEPT (SELECT d.source_rule_recommendation_id,d.title,d.text FROM pathways.decision_recommendations d WHERE d.project_id=pg_temp.u(301)))
 AND (SELECT array_agg(title||'|'||text ORDER BY title) FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(301))
  =ARRAY['Action 1|Synthetic action 1','Action 2|Synthetic action 2','Action 3|Synthetic action 3'],'recommendations equal the configured templates');

-- G-F10-3 stored-rule abuse: closed shapes only, each refused with 22023.
CREATE FUNCTION pg_temp.rule_input(cond jsonb,extra jsonb DEFAULT '{}',rec_extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('name','Abuse','severity',NULL,'code','F10-ABUSE','projectId',pg_temp.u(301),'clientOperationId',pg_temp.u(9600),
  'conditions',cond,'recommendations',jsonb_build_array(jsonb_build_object('id',pg_temp.u(9601),'title','T','text','X')||rec_extra))||extra
$$;
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0","sql":"SELECT 1"}')),'22023','condition with an extra key');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"eval","threshold":"0"}')),'22023','operator outside the closed set');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"FOO","operator":"GT","threshold":"0"}')),'22023','metric outside the catalog');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{"script":"x"}')),'22023','extra top-level key');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{}','{"html":"<b>"}')),'22023','recommendation with an extra key');
-- 0072: severity is null or the manual CRITICAL mark, and expectations are two optional decimals from 0 to 100.
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{"severity":"HIGH"}')),'22023','author-chosen HIGH severity');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}')-'severity'),'22023','missing severity');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{"expectations":{"expectedScoreImprovement":"100.0001"}}')),'22023','expectation above 100');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{"expectations":{"manageableFollowUpPercent":10}}')),'22023','expectation as a JSON number');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"PROJECT_OVERDUE_DAYS","operator":"GT","threshold":"0"}','{"expectations":{"target":"1"}}')),'22023','expectation with an extra key');
INSERT INTO t_out SELECT 'rule_expect',pathways.f10_rule_create(pg_temp.rule_input(
 '{"kind":"CONDITION","id":"c1","metric":"SURVEY_MEAN_IMPROVEMENT_POINTS","operator":"LT","threshold":"5"}',
 jsonb_build_object('severity','CRITICAL','code','F10-EXPECT','clientOperationId',pg_temp.u(9610),
  'expectations',jsonb_build_object('expectedScoreImprovement','10.50','manageableFollowUpPercent',NULL))));
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_draft(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_p1'),
 (pg_temp.rule_input('{"kind":"CONDITION","id":"c1","metric":"FOO","operator":"GT","threshold":"0"}')-'code'-'projectId')||'{"expectedVersion":1}'),'22023','draft with a metric outside the catalog');
COMMIT;
SELECT pg_temp.ok((SELECT doc->'severity'='null'::jsonb AND doc->'expectations'='{"expectedScoreImprovement":null,"manageableFollowUpPercent":null}'::jsonb
  FROM t_out WHERE name='rule_p1')
 AND (SELECT doc->>'severity'='CRITICAL' AND doc->'expectations'='{"expectedScoreImprovement":"10.5","manageableFollowUpPercent":null}'::jsonb
  FROM t_out WHERE name='rule_expect')
 AND (SELECT expected_score_improvement=10.5 AND manageable_follow_up_percent IS NULL FROM pathways.alert_rules
  WHERE id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_expect')),'0072 rule severity and expectations stored and read');
-- A digest without expectations keeps its pre-0072 form; set expectations join it.
SELECT pg_temp.ok((SELECT bool_and(r.definition_digest=sha256(convert_to((jsonb_build_object('name',r.name,'severity',r.severity,
   'conditions',r.conditions_json,'recommendations',(SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'text',t.text) ORDER BY t.title)
    FROM pathways.alert_rule_recommendations t WHERE t.rule_id=r.id))
   ||CASE WHEN r.id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='rule_expect') THEN
    '{"expectations":{"expectedScoreImprovement":"10.5","manageableFollowUpPercent":null}}'::jsonb ELSE '{}'::jsonb END)::text,'UTF8')))
  FROM pathways.alert_rules r WHERE r.id IN (SELECT (doc->>'id')::uuid FROM t_out WHERE name IN ('rule_p1','rule_expect'))),'0072 definition digest form');

-- (3) Recommit with the same arguments writes nothing, no second job, sweep and drain keep one latched alert.
BEGIN;
SET LOCAL SESSION AUTHORIZATION pathways_rules_worker;
SELECT pathways_rules_internal.commit_rule_snapshot((doc->'claim'->>'jobId')::uuid,doc->'claim'->>'leaseNonce',
 (doc->'captured'->>'snapshotId')::uuid,decode(doc->'captured'->>'digest','hex')) FROM t_out WHERE name='last_drain';
COMMIT;
SELECT pg_temp.ok((SELECT count(*) FROM pathways_rules_internal.evaluations WHERE project_id=pg_temp.u(301))=(SELECT (doc->>'evaluations')::bigint FROM t_out WHERE name='p1_counts'),'recommit wrote no evaluation');
BEGIN;
SET LOCAL SESSION AUTHORIZATION pathways_rules_worker;
SELECT pathways_rules_internal.claim_rule_project() IS NULL AS no_job \gset
COMMIT;
SELECT pg_temp.ok(:'no_job'::boolean,'second claim finds no job');
BEGIN;
SET LOCAL SESSION AUTHORIZATION pathways_rules_sweeper;
SELECT pathways_rules_internal.sweep_rule_projects();
COMMIT;
CALL pg_temp.drain('p1_sweep');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301))=1
 AND (SELECT count(*) FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(301))=3,'latched: still one alert after sweep');

-- (4) Scope: out-of-scope PM and other-org user are denied reads and see empty lists.
INSERT INTO t_out SELECT 'p1_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301)),
 'recs',(SELECT jsonb_agg(id ORDER BY id) FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(301)));
BEGIN;
SELECT pg_temp.act(4);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert')),'42501','out-of-scope PM alert get');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_get(%L)',(SELECT (doc->'recs'->>0)::uuid FROM t_out WHERE name='p1_alert')),'42501','out-of-scope PM recommendation get');
SELECT pg_temp.ok(jsonb_array_length(pathways.f10_alert_list('{"limit":50}'::jsonb)->'items')=0
 AND jsonb_array_length(pathways.f10_recommendation_list('{"limit":50}'::jsonb)->'items')=0,'out-of-scope PM lists are empty');
COMMIT;
BEGIN;
SELECT pg_temp.act(5);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert')),'42501','other-org alert get');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_get(%L)',(SELECT (doc->'recs'->>0)::uuid FROM t_out WHERE name='p1_alert')),'42501','other-org recommendation get');
SELECT pg_temp.ok(jsonb_array_length(pathways.f10_alert_list('{"limit":50}'::jsonb)->'items')=0
 AND jsonb_array_length(pathways.f10_recommendation_list('{"limit":50}'::jsonb)->'items')=0,'other-org lists are empty');
COMMIT;

-- (5) The assigned PM reviews recommendation 1 and declines recommendation 2.
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'review',pathways.f10_recommendation_review((SELECT (doc->'recs'->>0)::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('expectedRevision','1','note','Reviewed by PM','clientOperationId',pg_temp.u(9201)));
INSERT INTO t_out SELECT 'preview',pathways.f10_recommendation_preview((SELECT (doc->'recs'->>1)::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('expectedRevision','1','note','Declined by PM','clientOperationId',pg_temp.u(9202),'outcome','DECLINE'));
COMMIT;
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'confirm',pathways.f10_recommendation_confirm((SELECT (doc->'recs'->>1)::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('previewId',(SELECT doc->>'previewId' FROM t_out WHERE name='preview'),'clientOperationId',pg_temp.u(9203)));
COMMIT;
SELECT pg_temp.ok((SELECT status::text FROM pathways.decision_recommendations WHERE id=(SELECT (doc->'recs'->>0)::uuid FROM t_out WHERE name='p1_alert'))='REVIEWED'
 AND (SELECT doc->>'status' FROM t_out WHERE name='review')='REVIEWED','recommendation 1 reviewed');
SELECT pg_temp.ok(EXISTS(SELECT FROM pathways_rules_internal.decisions d WHERE d.recommendation_id=(SELECT (doc->'recs'->>1)::uuid FROM t_out WHERE name='p1_alert') AND d.outcome='DECLINE'),'recommendation 2 declined with a decision row');

-- (6) Clear the condition through a PROJECT_UPDATE source operation (the assigned PM holds projects.update), then drain.
BEGIN;
SELECT pg_temp.act(2);
DO $$
DECLARE p pathways.projects; started jsonb; handle uuid; ts timestamptz;
BEGIN
 SELECT * INTO p FROM pathways.projects WHERE id=pg_temp.u(301);
 started:=pathways.f10_begin_source_operation('PROJECT_UPDATE',p.id,p.id,'CLIENT_MUTATION',pg_temp.u(9301),'MUTATION',
  jsonb_build_object('expectedUpdatedAt',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'title',p.title,'status',p.status,'startDate',p.start_date,'endDate',current_date+365));
 handle:=(started->>'operationHandle')::uuid;
 ts:=(started->'generatedValues'->>'timestamp')::timestamptz;
 UPDATE pathways.projects SET end_date=current_date+365,updated_at=ts WHERE id=p.id AND organization_id=p.organization_id;
 PERFORM pathways.f10_finish_source_operation(handle);
END $$;
COMMIT;
CALL pg_temp.drain('p1_clear');
SELECT pg_temp.ok((SELECT lifecycle='AUTO_RESOLVED' AND revision=3 FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(301)),'alert auto-resolved');
SELECT pg_temp.ok((SELECT status::text||':'||revision FROM pathways.decision_recommendations WHERE id=(SELECT (doc->'recs'->>2)::uuid FROM t_out WHERE name='p1_alert'))='AUTO_RESOLVED:2','undecided recommendation auto-resolved with revision plus one');
SELECT pg_temp.ok((SELECT status::text||':'||revision FROM pathways.decision_recommendations WHERE id=(SELECT (doc->'recs'->>0)::uuid FROM t_out WHERE name='p1_alert'))='AUTO_RESOLVED:3','reviewed recommendation without decision auto-resolved');
SELECT pg_temp.ok((SELECT status::text||':'||revision FROM pathways.decision_recommendations WHERE id=(SELECT (doc->'recs'->>1)::uuid FROM t_out WHERE name='p1_alert'))='NEW:2','decided recommendation untouched by the cascade');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.audit_logs WHERE action='rules.system.recommendation_auto_resolved' AND project_id=pg_temp.u(301)
  AND actor_user_id IS NULL AND changes->>'attribution'='SYSTEM' AND changes->>'alertId'=(SELECT doc->>'id' FROM t_out WHERE name='p1_alert')
  AND entity_id::text IN ((SELECT doc->'recs'->>0 FROM t_out WHERE name='p1_alert'),(SELECT doc->'recs'->>2 FROM t_out WHERE name='p1_alert')))=2
 AND (SELECT changes->>'statusBefore' FROM pathways.audit_logs WHERE action='rules.system.recommendation_auto_resolved'
  AND entity_id::text=(SELECT doc->'recs'->>0 FROM t_out WHERE name='p1_alert'))='REVIEWED','auto-resolve audit rows with statusBefore');
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_review(%L,%L::jsonb)',(SELECT (doc->'recs'->>2)::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('expectedRevision','2','note','Late review','clientOperationId',pg_temp.u(9204))),'40001','review of AUTO_RESOLVED rejected');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_preview(%L,%L::jsonb)',(SELECT (doc->'recs'->>2)::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('expectedRevision','2','note','Late decline','clientOperationId',pg_temp.u(9205),'outcome','DECLINE')),'40001','preview on AUTO_RESOLVED rejected');
COMMIT;

-- Legacy recommendations never accept AUTO_RESOLVED (the CHECK keeps the legacy branch).
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,title,text,type,basis,status,proposed_by_id,proposed_at)
VALUES(pg_temp.u(8001),pg_temp.u(1),pg_temp.u(302),'Legacy','Legacy recommendation','SUGGESTED_ACTION','COMBINED','NEW',pg_temp.u(101),now());
SELECT pg_temp.reject(format('UPDATE pathways.decision_recommendations SET status=%L WHERE id=%L','AUTO_RESOLVED',pg_temp.u(8001)),'23514','legacy row cannot be AUTO_RESOLVED');
ROLLBACK;

BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status,created_by_id)
SELECT pg_temp.u(310+n),pg_temp.u(1),'F10R-P'||(10+n),'F10 project '||(10+n),current_date-200,current_date-10,'ONGOING',pg_temp.u(101) FROM generate_series(1,8) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(410),pg_temp.u(1),pg_temp.u(307),pg_temp.u(106),pg_temp.u(101)),
 (pg_temp.u(411),pg_temp.u(1),pg_temp.u(314),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(412),pg_temp.u(1),pg_temp.u(315),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(413),pg_temp.u(1),pg_temp.u(316),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(414),pg_temp.u(1),pg_temp.u(317),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(415),pg_temp.u(1),pg_temp.u(318),pg_temp.u(102),pg_temp.u(101));
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,status,recorded_by_id)
SELECT pg_temp.u(8000+p*100+g),pg_temp.u(1),pg_temp.u(310+p),pg_temp.u(8500+p*100+g),current_date-100,'ACTIVE'::pathways.enrollment_status,pg_temp.u(101)
FROM generate_series(1,2) p,generate_series(1,10) g
UNION ALL SELECT pg_temp.u(8300+g),pg_temp.u(1),pg_temp.u(313),pg_temp.u(8800+g),current_date-100,'ACTIVE',pg_temp.u(101) FROM generate_series(1,4) g;
INSERT INTO pathways.beneficiary_activity_participations(id,organization_id,project_id,enrollment_id,activity_id,participation_date,progress_status,recorded_by_id,recorded_at)
SELECT pg_temp.u(8900+p*100+g),pg_temp.u(1),pg_temp.u(310+p),pg_temp.u(8000+p*100+g),pg_temp.u(9900),current_date-5,
 CASE WHEN g<=CASE p WHEN 1 THEN 4 ELSE 6 END THEN 'NEEDS_FOLLOW_UP' ELSE 'COMPLETED' END::pathways.progress_status,pg_temp.u(101),now()
FROM generate_series(1,2) p,generate_series(1,10) g;
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(8400+g+t*10),pg_temp.u(1),pg_temp.u(313),pg_temp.u(8300+g),CASE t WHEN 0 THEN 'PRE_TEST' ELSE 'POST_TEST' END::pathways.assessment_type,
 CASE t WHEN 0 THEN 50 ELSE 60 END,100,current_date-30+t*10,pg_temp.u(101) FROM generate_series(1,4) g,generate_series(0,1) t;
COMMIT;
-- (7) Budget, beneficiary and survey metrics. P3 also carries a timeline rule for the audience check.
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.make_rule('p3b',303,'BUDGET_UTILIZATION_PERCENT','GTE','80',1,9400);
SELECT pg_temp.make_rule('p3t',303,'PROJECT_OVERDUE_DAYS','GT','0',1,9410);
SELECT pg_temp.make_rule('p4',304,'BUDGET_UTILIZATION_PERCENT','GTE','80',1,9420);
SELECT pg_temp.make_rule('p5',305,'BENEFICIARY_FOLLOW_UP_PERCENT','GTE','0',1,9430);
SELECT pg_temp.make_rule('p6',306,'BENEFICIARY_FOLLOW_UP_PERCENT','GTE','50',1,9440);
SELECT pg_temp.make_rule('p7',307,'SURVEY_MEAN_IMPROVEMENT_POINTS','LT','20',1,9450);
SELECT pg_temp.make_rule('p8',308,'BUDGET_UTILIZATION_PERCENT','GTE','0',1,9460);
SELECT pg_temp.make_rule('p9',309,'BUDGET_UTILIZATION_PERCENT','GTE','0',1,9470);
SELECT pg_temp.make_rule('p11',311,'BENEFICIARY_FOLLOW_UP_PERCENT','GTE','0',1,9480);
SELECT pg_temp.make_rule('p12',312,'BENEFICIARY_FOLLOW_UP_PERCENT','GTE','0',1,9490);
SELECT pg_temp.make_rule('p13',313,'SURVEY_MEAN_IMPROVEMENT_POINTS','LT','100',1,9500);
SELECT pg_temp.make_rule('p14',314,'PROJECT_OVERDUE_DAYS','GT','0',1,9510);
SELECT pg_temp.make_rule('p15',315,'PROJECT_OVERDUE_DAYS','GT','0',1,9520);
SELECT pg_temp.make_rule('p16',316,'PROJECT_OVERDUE_DAYS','GT','0',1,9530);
SELECT pg_temp.make_rule('p17',317,'PROJECT_OVERDUE_DAYS','GT','0',1,9540);
SELECT pg_temp.make_rule('p18',318,'PROJECT_OVERDUE_DAYS','GT','0',1,9550);
COMMIT;
CALL pg_temp.drain('metrics');
-- Clears a project's overdue condition through a PROJECT_UPDATE source operation (runs as the current human).
CREATE FUNCTION pg_temp.clear_project(n integer,op integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p pathways.projects; started jsonb; ts timestamptz;
BEGIN
 SELECT * INTO p FROM pathways.projects WHERE id=pg_temp.u(n);
 started:=pathways.f10_begin_source_operation('PROJECT_UPDATE',p.id,p.id,'CLIENT_MUTATION',pg_temp.u(op),'MUTATION',
  jsonb_build_object('expectedUpdatedAt',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'title',p.title,'status',p.status,'startDate',p.start_date,'endDate',current_date+365));
 ts:=(started->'generatedValues'->>'timestamp')::timestamptz;
 UPDATE pathways.projects SET end_date=current_date+365,updated_at=ts WHERE id=p.id AND organization_id=p.organization_id;
 PERFORM pathways.f10_finish_source_operation((started->>'operationHandle')::uuid);
END $$;
CREATE FUNCTION pg_temp.last_eval(tag text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('result',e.result,'cell',e.evidence->'conditions'->0->'cell','unit',e.evidence->'conditions'->0->>'unit')
 FROM pathways_rules_internal.evaluations e JOIN pathways.alert_rules r ON r.id=e.rule_version_id
 WHERE r.display_code='F10-'||upper(tag) ORDER BY e.evaluation_sequence DESC LIMIT 1
$$;
SELECT pg_temp.ok(pg_temp.last_eval('p3b')->>'result'='TRUE' AND pg_temp.last_eval('p3b')->'cell'->>'value'='85' AND pg_temp.last_eval('p3b')->>'unit'='PERCENT'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.id=a.rule_id WHERE a.project_id=pg_temp.u(303) AND r.display_code='F10-P3B'),'utilization 85 raises the alert');
SELECT pg_temp.ok(pg_temp.last_eval('p4')->>'result'='UNAVAILABLE' AND pg_temp.last_eval('p4')->'cell'->>'reason'='ZERO_DENOMINATOR'
 AND NOT EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(304)),'planned zero is ZERO_DENOMINATOR with no alert');
SELECT pg_temp.ok(pg_temp.last_eval('p5')->>'result'='TRUE' AND pg_temp.last_eval('p5')->'cell'->>'value'='100'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(305)),'three enrollments are released exactly and raise the alert (0076)');
SELECT pg_temp.ok(pg_temp.last_eval('p6')->>'result'='TRUE' AND pg_temp.last_eval('p6')->'cell'->>'value'='50' AND pg_temp.last_eval('p6')->>'unit'='PERCENT'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(306)),'ten enrollments with five follow-ups give 50 percent');
SELECT pg_temp.ok(pg_temp.last_eval('p7')->>'result'='TRUE' AND pg_temp.last_eval('p7')->'cell'->>'value'='13.3333' AND pg_temp.last_eval('p7')->>'unit'='POINTS'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(307)),'six survey pairs give the mean improvement');
SELECT pg_temp.ok(pg_temp.last_eval('p8')->>'result'='UNAVAILABLE' AND pg_temp.last_eval('p8')->'cell'->>'reason'='UNSUPPORTED_SOURCE'
 AND NOT EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(308)),'mixed currency is UNSUPPORTED_SOURCE');
SELECT pg_temp.ok(pg_temp.last_eval('p9')->>'result'='UNAVAILABLE' AND pg_temp.last_eval('p9')->'cell'->>'reason'='NOT_APPLICABLE','on-hold project is NOT_APPLICABLE');

SELECT pg_temp.ok(pg_temp.last_eval('p11')->>'result'='TRUE' AND pg_temp.last_eval('p11')->'cell'->>'value'='40'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(311)),'four follow-ups of ten give exactly 40 percent (0076)');
SELECT pg_temp.ok(pg_temp.last_eval('p12')->>'result'='TRUE' AND pg_temp.last_eval('p12')->'cell'->>'value'='60'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(312)),'a complement of four is released exactly (0076)');
SELECT pg_temp.ok(pg_temp.last_eval('p13')->>'result'='TRUE' AND pg_temp.last_eval('p13')->'cell'->>'value'='10'
 AND EXISTS(SELECT FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(313)),'four survey pairs give the exact mean improvement (0076)');

-- Audience: M&E sees the timeline alert on P3 but not the budget alert; the PM sees both.
INSERT INTO t_out SELECT 'p3_alerts',jsonb_build_object(
 'budget',(SELECT a.id FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.id=a.rule_id WHERE a.project_id=pg_temp.u(303) AND r.display_code='F10-P3B'),
 'timeline',(SELECT a.id FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.id=a.rule_id WHERE a.project_id=pg_temp.u(303) AND r.display_code='F10-P3T'));
BEGIN;
SELECT pg_temp.act(3);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'timeline')::uuid FROM t_out WHERE name='p3_alerts')) IS NOT NULL,'M&E sees the timeline alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'budget')::uuid FROM t_out WHERE name='p3_alerts')),'42501','M&E cannot see the budget alert');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM jsonb_array_elements(pathways.f10_alert_list('{"limit":50}'::jsonb)->'items') i WHERE i->>'id'=(SELECT doc->>'budget' FROM t_out WHERE name='p3_alerts')),'M&E list omits the budget alert');
COMMIT;
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'budget')::uuid FROM t_out WHERE name='p3_alerts')) IS NOT NULL,'PM sees the budget alert');
COMMIT;

INSERT INTO t_out SELECT 'p3b_rec',jsonb_build_object('id',(SELECT d.id FROM pathways.decision_recommendations d WHERE d.alert_id=(SELECT (doc->>'budget')::uuid FROM t_out WHERE name='p3_alerts')),
 'tl',(SELECT d.id FROM pathways.decision_recommendations d WHERE d.alert_id=(SELECT (doc->>'timeline')::uuid FROM t_out WHERE name='p3_alerts')));
INSERT INTO t_out SELECT 'p7_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(307)),
 'rec',(SELECT id FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(307)));
-- G-F10-4: a direct alert outcome on a terminal alert is refused, at preview and at confirm.
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_preview(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('expectedRevision','3','note','Late outcome','clientOperationId',pg_temp.u(9801),'outcome','DECLINE')),'40001','alert outcome preview on an AUTO_RESOLVED alert');
COMMIT;
INSERT INTO t_out SELECT 'p14_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(314)));
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'p14_preview',pathways.f10_alert_preview((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p14_alert'),
 jsonb_build_object('expectedRevision','1','note','Open outcome','clientOperationId',pg_temp.u(9802),'outcome','DECLINE'));
SELECT pg_temp.clear_project(314,9803);
COMMIT;
CALL pg_temp.drain('p14_clear');
SELECT pg_temp.ok((SELECT lifecycle FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(314))='AUTO_RESOLVED','preview alert auto-resolved afterwards');
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_confirm(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p14_alert'),
 jsonb_build_object('previewId',(SELECT doc->>'previewId' FROM t_out WHERE name='p14_preview'),'clientOperationId',pg_temp.u(9804))),'40001','confirm after the alert went terminal');
COMMIT;
-- Combined recommendation outcome keeps working when its linked alert was resolved by a human.
INSERT INTO t_out SELECT 'p15_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(315)),
 'rec',(SELECT id FROM pathways.decision_recommendations WHERE project_id=pg_temp.u(315)));
BEGIN;
SELECT pg_temp.act(2);
SELECT pathways.f10_alert_disposition((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p15_alert'),
 jsonb_build_object('action','RESOLVE','expectedRevision','1','note','Resolved by PM','clientOperationId',pg_temp.u(9805)));
INSERT INTO t_out SELECT 'p15_preview',pathways.f10_recommendation_preview((SELECT (doc->>'rec')::uuid FROM t_out WHERE name='p15_alert'),
 jsonb_build_object('expectedRevision','1','expectedAlertRevision','2','note','Accepted','clientOperationId',pg_temp.u(9806),'outcome','ACCEPT'));
COMMIT;
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'p15_confirm',pathways.f10_recommendation_confirm((SELECT (doc->>'rec')::uuid FROM t_out WHERE name='p15_alert'),
 jsonb_build_object('previewId',(SELECT doc->>'previewId' FROM t_out WHERE name='p15_preview'),'clientOperationId',pg_temp.u(9807)));
COMMIT;
SELECT pg_temp.ok((SELECT lifecycle FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(315))='RESOLVED'
 AND (SELECT revision FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(315))=3
 AND EXISTS(SELECT FROM pathways_rules_internal.decisions WHERE recommendation_id=(SELECT (doc->>'rec')::uuid FROM t_out WHERE name='p15_alert') AND outcome='ACCEPT'),
 'combined recommendation outcome on a human-resolved alert succeeds and leaves the lifecycle');

-- G-F10-4 lifecycle through the real functions: disposition on terminal alerts, review, accept and decline.
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_disposition(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p15_alert'),
 jsonb_build_object('action','RESOLVE','expectedRevision','3','note','Again','clientOperationId',pg_temp.u(9811))),'40001','resolve on a RESOLVED alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_disposition(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p15_alert'),
 jsonb_build_object('action','DISMISS','expectedRevision','3','note','Again','clientOperationId',pg_temp.u(9812))),'40001','dismiss on a RESOLVED alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_disposition(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('action','RESOLVE','expectedRevision','3','note','Late','clientOperationId',pg_temp.u(9813))),'40001','resolve on an AUTO_RESOLVED alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_disposition(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert'),
 jsonb_build_object('action','DISMISS','expectedRevision','3','note','Late','clientOperationId',pg_temp.u(9814))),'40001','dismiss on an AUTO_RESOLVED alert');
COMMIT;
INSERT INTO t_out SELECT 'p16_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(316)));
INSERT INTO t_out SELECT 'p17_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(317)));
INSERT INTO t_out SELECT 'p18_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(318)));
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'p16_review',pathways.f10_alert_review((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p16_alert'),
 jsonb_build_object('expectedRevision','1','note','Looked at it','clientOperationId',pg_temp.u(9821)));
INSERT INTO t_out SELECT 'p17_preview',pathways.f10_alert_preview((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p17_alert'),
 jsonb_build_object('expectedRevision','1','note','Accept','clientOperationId',pg_temp.u(9822),'outcome','ACCEPT'));
INSERT INTO t_out SELECT 'p18_preview',pathways.f10_alert_preview((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p18_alert'),
 jsonb_build_object('expectedRevision','1','note','Decline','clientOperationId',pg_temp.u(9823),'outcome','DECLINE'));
COMMIT;
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'p17_confirm',pathways.f10_alert_confirm((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p17_alert'),
 jsonb_build_object('previewId',(SELECT doc->>'previewId' FROM t_out WHERE name='p17_preview'),'clientOperationId',pg_temp.u(9824)));
INSERT INTO t_out SELECT 'p18_confirm',pathways.f10_alert_confirm((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p18_alert'),
 jsonb_build_object('previewId',(SELECT doc->>'previewId' FROM t_out WHERE name='p18_preview'),'clientOperationId',pg_temp.u(9825)));
COMMIT;
SELECT pg_temp.ok((SELECT lifecycle FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(316))='REVIEWED'
 AND (SELECT doc->>'lifecycle' FROM t_out WHERE name='p16_review')='REVIEWED','alert review moves NEW to REVIEWED');
SELECT pg_temp.ok((SELECT lifecycle FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(317))='ACTIONED'
 AND EXISTS(SELECT FROM pathways_rules_internal.decisions WHERE alert_id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p17_alert') AND outcome='ACCEPT'),'alert ACCEPT confirm gives ACTIONED with a decision row');
SELECT pg_temp.ok((SELECT lifecycle FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(318))='NEW'
 AND EXISTS(SELECT FROM pathways_rules_internal.decisions WHERE alert_id=(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p18_alert') AND outcome='DECLINE'),'alert DECLINE confirm leaves the lifecycle with a decision row');

-- M&E in scope of P3 is refused every read and action on the budget alert and its recommendation.
BEGIN;
SELECT pg_temp.act(3);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_review(%L,%L::jsonb)',(SELECT (doc->>'budget')::uuid FROM t_out WHERE name='p3_alerts'),
 jsonb_build_object('expectedRevision','1','note','Review','clientOperationId',pg_temp.u(9701))),'42501','M&E cannot review the budget alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_preview(%L,%L::jsonb)',(SELECT (doc->>'budget')::uuid FROM t_out WHERE name='p3_alerts'),
 jsonb_build_object('expectedRevision','1','note','Outcome','clientOperationId',pg_temp.u(9702),'outcome','DECLINE')),'42501','M&E cannot preview an outcome on the budget alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_get(%L)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p3b_rec')),'42501','M&E cannot read the budget recommendation');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_preview(%L,%L::jsonb)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p3b_rec'),
 jsonb_build_object('expectedRevision','1','note','Outcome','clientOperationId',pg_temp.u(9703),'outcome','DECLINE')),'42501','M&E cannot preview an outcome on the budget recommendation');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM jsonb_array_elements(pathways.f10_recommendation_list('{"limit":50}'::jsonb)->'items') i
 WHERE i->>'id'=(SELECT doc->>'id' FROM t_out WHERE name='p3b_rec')),'budget recommendation absent from the M&E list');
COMMIT;
-- A role without assessments.detail.read (the Grant Manager, assigned to the survey project) is refused the survey alert.
BEGIN;
SELECT pg_temp.act(6);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p7_alert')),'42501','no assessments.detail.read: survey alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_get(%L)',(SELECT (doc->>'rec')::uuid FROM t_out WHERE name='p7_alert')),'42501','no assessments.detail.read: survey recommendation');
COMMIT;
-- In-scope PM that holds alerts.read and recommendations.read but not the action grants (revoked then restored inside this transaction).
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE t_saved_rp ON COMMIT DROP AS SELECT rp.* FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id
 WHERE r.code='PROJECT_MANAGER' AND p.code IN ('alerts.review','alerts.outcome.record','recommendations.review','recommendations.outcome.record');
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_MANAGER'
  AND p.code IN ('alerts.review','alerts.outcome.record','recommendations.review','recommendations.outcome.record');
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'timeline')::uuid FROM t_out WHERE name='p3_alerts')) IS NOT NULL
 AND pathways.f10_recommendation_get((SELECT (doc->>'tl')::uuid FROM t_out WHERE name='p3b_rec')) IS NOT NULL,'reader without action grants still reads');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_review(%L,%L::jsonb)',(SELECT (doc->>'timeline')::uuid FROM t_out WHERE name='p3_alerts'),
 jsonb_build_object('expectedRevision','1','note','Review','clientOperationId',pg_temp.u(9711))),'42501','reader cannot review an alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_preview(%L,%L::jsonb)',(SELECT (doc->>'timeline')::uuid FROM t_out WHERE name='p3_alerts'),
 jsonb_build_object('expectedRevision','1','note','Outcome','clientOperationId',pg_temp.u(9712),'outcome','DECLINE')),'42501','reader cannot preview an alert outcome');
SELECT pg_temp.reject(format('SELECT pathways.f10_recommendation_preview(%L,%L::jsonb)',(SELECT (doc->>'tl')::uuid FROM t_out WHERE name='p3b_rec'),
 jsonb_build_object('expectedRevision','1','note','Outcome','clientOperationId',pg_temp.u(9713),'outcome','DECLINE')),'42501','reader cannot preview a recommendation outcome');
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.role_permissions SELECT * FROM t_saved_rp;
COMMIT;

-- Direct table reads as the runtime role never return f10 rows; legacy rows stay readable.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,title,text,type,basis,status,proposed_by_id,proposed_at)
VALUES(pg_temp.u(8002),pg_temp.u(1),pg_temp.u(302),'Legacy','Legacy recommendation','SUGGESTED_ACTION','COMBINED','NEW',pg_temp.u(101),now());
COMMIT;
BEGIN;
SELECT pg_temp.act(3);
SELECT pg_temp.ok((SELECT count(*) FROM pathways.rule_based_alerts WHERE runtime_contract_version='f10.v1')=0
 AND (SELECT count(*) FROM pathways.decision_recommendations WHERE runtime_contract_version='f10.v1')=0,'M&E direct reads return no f10 alerts or recommendations');
COMMIT;
BEGIN;
SELECT pg_temp.act(4);
SELECT pg_temp.ok((SELECT count(*) FROM pathways.rule_based_alerts WHERE runtime_contract_version='f10.v1')=0
 AND (SELECT count(*) FROM pathways.decision_recommendations WHERE runtime_contract_version='f10.v1')=0
 AND (SELECT count(*) FROM pathways.decision_recommendations WHERE id=pg_temp.u(8002))=1,'direct reads hide f10 rows and keep the legacy row');
COMMIT;

-- Beneficiary follow-up alerts need beneficiaries.records.read: the aggregate-only Grant Manager (user 6, also in P1) is denied.
INSERT INTO t_out SELECT 'p6_alert',jsonb_build_object('id',(SELECT id FROM pathways.rule_based_alerts WHERE project_id=pg_temp.u(306)));
BEGIN;
SELECT pg_temp.act(6);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p1_alert')) IS NOT NULL,'aggregate-only Grant Manager sees the timeline alert');
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'id')::uuid FROM t_out WHERE name='p6_alert')),'42501','aggregate-only role cannot see the beneficiary alert');
COMMIT;
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'id')::uuid FROM t_out WHERE name='p6_alert')) IS NOT NULL,'records.read holder sees the beneficiary alert');
COMMIT;

-- (8) 0072 severity at commit. P19 survey with an expected improvement, P20 manual Critical, P21 a pre-0072 style alert.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status,created_by_id)
SELECT pg_temp.u(318+n),pg_temp.u(1),'F10R-P'||(18+n),'F10 project '||(18+n),current_date-200,current_date-10,'ONGOING',pg_temp.u(101) FROM generate_series(1,3) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(415+n),pg_temp.u(1),pg_temp.u(318+n),pg_temp.u(102),pg_temp.u(101) FROM generate_series(1,3) n;
-- Five survey pairs, pre 50 and post 52 percent: a mean improvement of 2 points against an expected 10 is Medium.
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,status,recorded_by_id)
SELECT pg_temp.u(10000+g),pg_temp.u(1),pg_temp.u(319),pg_temp.u(10100+g),current_date-100,'ACTIVE',pg_temp.u(101) FROM generate_series(1,5) g;
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(10200+g+t*10),pg_temp.u(1),pg_temp.u(319),pg_temp.u(10000+g),CASE t WHEN 0 THEN 'PRE_TEST' ELSE 'POST_TEST' END::pathways.assessment_type,
 CASE t WHEN 0 THEN 50 ELSE 52 END,100,current_date-30+t*10,pg_temp.u(101) FROM generate_series(1,5) g,generate_series(0,1) t;
COMMIT;
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.make_rule('p19',319,'SURVEY_MEAN_IMPROVEMENT_POINTS','LT','20',1,9560,'{"expectations":{"expectedScoreImprovement":"10"}}');
SELECT pg_temp.make_rule('p20',320,'PROJECT_OVERDUE_DAYS','GT','0',1,9570,'{"severity":"CRITICAL"}');
SELECT pg_temp.make_rule('p21',321,'PROJECT_OVERDUE_DAYS','GT','0',1,9580);
COMMIT;
CALL pg_temp.drain('severity');
CREATE FUNCTION pg_temp.alert_of(n integer) RETURNS pathways.rule_based_alerts LANGUAGE sql AS $$
 SELECT a.* FROM pathways.rule_based_alerts a WHERE a.project_id=pg_temp.u(n)
$$;
SELECT pg_temp.ok((SELECT a.severity='MEDIUM' AND a.severity_basis->>'status'='CLASSIFIED' AND a.severity_basis->>'level'='MEDIUM'
  AND a.severity_basis->'conditions'->0->'measure'->>'value'='8.0000' AND a.severity_change IS NULL
  AND a.evaluated_snapshot->'severityBasis'=a.severity_basis
  AND (SELECT e.evidence->'severityBasis' FROM pathways_rules_internal.evaluations e WHERE e.id=a.latest_evaluation_id)=a.severity_basis
  FROM pg_temp.alert_of(319) a),'expected improvement 10 and mean 2 give Medium with its basis');
SELECT pg_temp.ok((SELECT a.severity IS NULL AND a.severity_basis->>'status'='CONTEXT_REQUIRED'
  AND a.severity_basis->'missing'='["EXPECTED_SCORE_IMPROVEMENT"]'::jsonb FROM pg_temp.alert_of(307) a),'no expectation: alert exists with Needs context');
SELECT pg_temp.ok((SELECT a.severity='CRITICAL' AND (a.severity_basis->'manualCritical')::boolean AND a.severity_basis->>'level'='MEDIUM'
  FROM pg_temp.alert_of(320) a),'manual Critical keeps the suggested level beside it');
BEGIN;
SET LOCAL session_replication_role = replica;
SELECT pg_temp.reject(format('UPDATE pathways.rule_based_alerts SET severity_basis=NULL WHERE id=%L',(pg_temp.alert_of(307)).id),
 '23514','alert without severity or basis');
ROLLBACK;
-- The PM reviews the Medium alert; P21 is made a pre-0072 alert (HIGH, no basis) outside the runtime.
INSERT INTO t_out SELECT 'sev_alerts',jsonb_build_object('p19',(pg_temp.alert_of(319)).id,'p21',(pg_temp.alert_of(321)).id);
INSERT INTO t_out SELECT 'p19_before',jsonb_build_object('notifications',(SELECT count(*) FROM pathways_rules_internal.notifications
 WHERE alert_id=(pg_temp.alert_of(319)).id));
BEGIN;
SELECT pg_temp.act(2);
SELECT pathways.f10_alert_review((SELECT (doc->>'p19')::uuid FROM t_out WHERE name='sev_alerts'),jsonb_build_object('expectedRevision','1','note','Reviewed','clientOperationId',pg_temp.u(9590)));
COMMIT;
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE pathways.rule_based_alerts SET severity='HIGH',severity_basis=NULL WHERE project_id=pg_temp.u(321);
-- Later post-tests of 45 percent drop the mean to -5 points, 15 below the expectation: High.
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(10300+g),pg_temp.u(1),pg_temp.u(319),pg_temp.u(10000+g),'POST_TEST',45,100,current_date-1,pg_temp.u(101) FROM generate_series(1,5) g;
COMMIT;
-- Moves a project's planned end through a PROJECT_UPDATE source operation so its rules re-evaluate.
CREATE FUNCTION pg_temp.set_project_end(n integer,op integer,end_on date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p pathways.projects; started jsonb; ts timestamptz;
BEGIN
 SELECT * INTO p FROM pathways.projects WHERE id=pg_temp.u(n);
 started:=pathways.f10_begin_source_operation('PROJECT_UPDATE',p.id,p.id,'CLIENT_MUTATION',pg_temp.u(op),'MUTATION',
  jsonb_build_object('expectedUpdatedAt',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'title',p.title,'status',p.status,'startDate',p.start_date,'endDate',end_on));
 ts:=(started->'generatedValues'->>'timestamp')::timestamptz;
 UPDATE pathways.projects SET end_date=end_on,updated_at=ts WHERE id=p.id AND organization_id=p.organization_id;
 PERFORM pathways.f10_finish_source_operation((started->>'operationHandle')::uuid);
END $$;
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.set_project_end(319,9591,current_date+365);
SELECT pg_temp.set_project_end(321,9592,current_date-5);
COMMIT;
CALL pg_temp.drain('severity_rematch');
SELECT pg_temp.ok((SELECT a.lifecycle='REVIEWED' AND a.revision=3 AND a.severity='HIGH' AND a.severity_basis->>'level'='HIGH'
  AND a.severity_change->>'from'='MEDIUM' AND a.severity_change->>'to'='HIGH' AND a.severity_change->'previous'->>'level'='MEDIUM'
  AND (a.severity_change->>'at')::timestamptz=a.updated_at
  AND (SELECT e.evidence->'severityBasis' FROM pathways_rules_internal.evaluations e WHERE e.id=a.latest_evaluation_id)=a.severity_basis
  FROM pg_temp.alert_of(319) a),'re-match while REVIEWED raises Medium to High and keeps the lifecycle');
SELECT pg_temp.ok((SELECT count(*) FROM pathways_rules_internal.notifications WHERE alert_id=(pg_temp.alert_of(319)).id)
  =(SELECT (doc->>'notifications')::bigint FROM t_out WHERE name='p19_before')
 AND (SELECT count(*) FROM pathways_rules_internal.lifecycle_events WHERE alert_id=(pg_temp.alert_of(319)).id AND actor_kind='SYSTEM')=1
 AND (SELECT status::text||':'||revision FROM pathways.decision_recommendations WHERE alert_id=(pg_temp.alert_of(319)).id)='NEW:1',
 'a severity change sends no notification and leaves lifecycle and recommendations');
SELECT pg_temp.ok((SELECT a.severity='HIGH' AND a.severity_basis IS NULL AND a.severity_change IS NULL AND a.revision=2
  AND (SELECT e.result='TRUE' AND e.evidence->'severityBasis'->>'level'='LOW' FROM pathways_rules_internal.evaluations e WHERE e.id=a.latest_evaluation_id)
  FROM pg_temp.alert_of(321) a),'pre-0072 alert keeps HIGH without a basis on re-match');
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO t_out SELECT 'p19_json',pathways.f10_alert_get((SELECT (doc->>'p19')::uuid FROM t_out WHERE name='sev_alerts'));
INSERT INTO t_out SELECT 'p21_json',pathways.f10_alert_get((SELECT (doc->>'p21')::uuid FROM t_out WHERE name='sev_alerts'));
COMMIT;
SELECT pg_temp.ok((SELECT doc->>'severity'='HIGH' AND doc->'severityBasis'->>'status'='CLASSIFIED'
  AND doc->'severityChange'->>'from'='MEDIUM' FROM t_out WHERE name='p19_json')
 AND (SELECT doc->>'severity'='HIGH' AND doc->'severityBasis'='null'::jsonb AND doc->'severityChange'='null'::jsonb
  FROM t_out WHERE name='p21_json'),'alert read model exposes severityBasis and severityChange');

-- (9) 0072 re-match edges. P22 stays Medium, P23 is dismissed then worsens, P20 (manual Critical) worsens.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status,created_by_id)
SELECT pg_temp.u(321+n),pg_temp.u(1),'F10R-P'||(21+n),'F10 project '||(21+n),current_date-200,current_date-CASE n WHEN 1 THEN 12 ELSE 10 END,'ONGOING',pg_temp.u(101) FROM generate_series(1,2) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(418+n),pg_temp.u(1),pg_temp.u(321+n),pg_temp.u(102),pg_temp.u(101) FROM generate_series(1,2) n;
COMMIT;
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.make_rule('p22',322,'PROJECT_OVERDUE_DAYS','GT','0',1,9930);
SELECT pg_temp.make_rule('p23',323,'PROJECT_OVERDUE_DAYS','GT','0',1,9940);
COMMIT;
CALL pg_temp.drain('severity_edges');
INSERT INTO t_out SELECT 'edges_before',jsonb_build_object('p22',(pg_temp.alert_of(322)).severity_basis,'p23',(pg_temp.alert_of(323)).severity_basis,
 'p20',(pg_temp.alert_of(320)).severity_basis,'p23_id',(pg_temp.alert_of(323)).id);
SELECT pg_temp.ok((SELECT (pg_temp.alert_of(322)).severity='MEDIUM' AND (pg_temp.alert_of(323)).severity='MEDIUM'),'edge fixtures start Medium');
BEGIN;
SELECT pg_temp.act(2);
SELECT pathways.f10_alert_disposition((SELECT (doc->>'p23_id')::uuid FROM t_out WHERE name='edges_before'),
 jsonb_build_object('action','DISMISS','expectedRevision','1','note','Dismissed by PM','clientOperationId',pg_temp.u(9950)));
-- P22 moves to 15 of 185 days (still Medium); P23 and P20 move to 30 of 170 days (High).
SELECT pg_temp.set_project_end(322,9951,current_date-15);
SELECT pg_temp.set_project_end(323,9952,current_date-30);
SELECT pg_temp.set_project_end(320,9953,current_date-30);
COMMIT;
CALL pg_temp.drain('severity_edges_rematch');
SELECT pg_temp.ok((SELECT a.severity='MEDIUM' AND a.severity_change IS NULL AND a.revision=2 AND a.severity_basis->>'level'='MEDIUM'
  AND a.severity_basis IS DISTINCT FROM (SELECT doc->'p22' FROM t_out WHERE name='edges_before')
  AND (SELECT e.evidence->'severityBasis' FROM pathways_rules_internal.evaluations e WHERE e.id=a.latest_evaluation_id)=a.severity_basis
  FROM pg_temp.alert_of(322) a),'same-level re-match moves the basis and keeps severity without a change');
SELECT pg_temp.ok((SELECT a.lifecycle='DISMISSED' AND a.revision=3 AND a.severity='MEDIUM' AND a.severity_change IS NULL
  AND a.severity_basis=(SELECT doc->'p23' FROM t_out WHERE name='edges_before')
  AND (SELECT e.result='TRUE' AND e.evidence->'severityBasis'->>'level'='HIGH' FROM pathways_rules_internal.evaluations e WHERE e.id=a.latest_evaluation_id)
  FROM pg_temp.alert_of(323) a),'re-match of a dismissed alert leaves its severity and basis');
SELECT pg_temp.ok((SELECT a.severity='CRITICAL' AND a.severity_basis->>'level'='HIGH' AND (a.severity_basis->'manualCritical')::boolean
  AND a.severity_change->>'from'='CRITICAL' AND a.severity_change->>'to'='CRITICAL'
  AND a.severity_change->'previous'=(SELECT doc->'p20' FROM t_out WHERE name='edges_before')
  AND (a.severity_change->>'at')::timestamptz=a.updated_at
  FROM pg_temp.alert_of(320) a),'manual Critical re-match stays Critical and records the suggested-level change');

-- (10) 0073 KPI performance and test score metrics. P30 KPI (two measured indicators of four), P31 none measured,
-- P32 no indicators, P33 pre/post scores with a mixed (A AND B) OR C rule, P34 four post-tests, P35 on hold.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,status,created_by_id)
SELECT pg_temp.u(329+n),pg_temp.u(1),'F10R-P'||(29+n),'F10 project '||(29+n),current_date-200,current_date+100,
 CASE WHEN n=6 THEN 'ON_HOLD' ELSE 'ONGOING' END::pathways.project_status,pg_temp.u(101) FROM generate_series(1,6) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(431),pg_temp.u(1),pg_temp.u(330),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(432),pg_temp.u(1),pg_temp.u(333),pg_temp.u(102),pg_temp.u(101)),
 (pg_temp.u(433),pg_temp.u(1),pg_temp.u(333),pg_temp.u(106),pg_temp.u(101));
-- P30: 10 of 20 (50 percent) and 15 of 20 (75 percent) give 62.5; an unmeasured and an archived indicator do not count.
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,unit,unit_label,data_source,measurement_mode,numeric_kind,
 direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id,archived_at)
SELECT pg_temp.u(11500+v.n),pg_temp.u(1),pg_temp.u(v.project),'KPI-'||v.n,'KPI indicator '||v.n,'COUNT','people','Synthetic manual','MANUAL',
 'COUNT','HIGHER_IS_BETTER',0,current_date-200,current_date+100,0,20,pg_temp.u(101),v.archived
FROM (VALUES (1,330,NULL::timestamptz),(2,330,NULL),(3,330,NULL),(4,330,now()),(5,331,NULL),(6,335,NULL)) v(n,project,archived);
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,
 client_measurement_id,request_hash,recorded_by_id)
SELECT pg_temp.u(11600+v.n),pg_temp.u(1),pg_temp.u(v.project),pg_temp.u(11500+v.n),current_date-200,current_date+100,v.value,
 'Synthetic field report',pg_temp.u(11700+v.n),repeat('a',64),pg_temp.u(101)
FROM (VALUES (1,330,10),(2,330,15),(4,330,20),(6,335,10)) v(n,project,value);
-- P33: six active enrollments (pre 20 of 40, post 70 or 80 of 100) and a dropped one with full marks; 11001 also has an
-- older pre of 0 that must not count. Score change keeps counting every enrollment (0060), so the dropped pair adds a
-- change of 0: (3*20+3*30+0)/7 = 21.4286. P34: four active enrollments with a post-test.
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,status,ended_date,end_reason,recorded_by_id)
SELECT pg_temp.u(11000+g),pg_temp.u(1),pg_temp.u(333),pg_temp.u(11100+g),current_date-100,
 CASE WHEN g=7 THEN 'DROPPED' ELSE 'ACTIVE' END::pathways.enrollment_status,CASE WHEN g=7 THEN current_date-5 END,
 CASE WHEN g=7 THEN 'Dropped out' END,pg_temp.u(101) FROM generate_series(1,7) g
UNION ALL SELECT pg_temp.u(11010+g),pg_temp.u(1),pg_temp.u(334),pg_temp.u(11110+g),current_date-100,'ACTIVE',NULL,NULL,pg_temp.u(101)
 FROM generate_series(1,4) g;
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
SELECT pg_temp.u(11200+g),pg_temp.u(1),pg_temp.u(333),pg_temp.u(11000+g),'PRE_TEST'::pathways.assessment_type,
 CASE WHEN g=7 THEN 40 ELSE 20 END,40,current_date-60,pg_temp.u(101) FROM generate_series(1,7) g
UNION ALL SELECT pg_temp.u(11300+g),pg_temp.u(1),pg_temp.u(333),pg_temp.u(11000+g),'POST_TEST'::pathways.assessment_type,
 CASE WHEN g=7 THEN 100 WHEN g<=3 THEN 70 ELSE 80 END,100,current_date-20,pg_temp.u(101) FROM generate_series(1,7) g
UNION ALL SELECT pg_temp.u(11400),pg_temp.u(1),pg_temp.u(333),pg_temp.u(11001),'PRE_TEST'::pathways.assessment_type,0,40,current_date-90,pg_temp.u(101)
UNION ALL SELECT pg_temp.u(11410+g),pg_temp.u(1),pg_temp.u(334),pg_temp.u(11010+g),'POST_TEST'::pathways.assessment_type,50,100,current_date-20,pg_temp.u(101)
 FROM generate_series(1,4) g;
COMMIT;
BEGIN;
SELECT pg_temp.act(1);
SELECT pg_temp.make_rule('p30',330,'KPI_ACHIEVEMENT_PERCENT','LT','70',1,9960);
SELECT pg_temp.make_rule('p31',331,'KPI_ACHIEVEMENT_PERCENT','LT','70',1,9962);
SELECT pg_temp.make_rule('p32',332,'KPI_ACHIEVEMENT_PERCENT','LT','70',1,9964);
SELECT pg_temp.make_rule('p33pre',333,'SURVEY_MEAN_PRE_TEST_PERCENT','LT','60',1,9966);
SELECT pg_temp.make_rule('p33mix',333,'SURVEY_MEAN_PRE_TEST_PERCENT','LT','60',1,9968,jsonb_build_object('conditions',
 '{"kind":"GROUP","mode":"OR","children":[{"kind":"GROUP","mode":"AND","children":[
  {"kind":"CONDITION","id":"pre","metric":"SURVEY_MEAN_PRE_TEST_PERCENT","operator":"LT","threshold":"60"},
  {"kind":"CONDITION","id":"post","metric":"SURVEY_MEAN_POST_TEST_PERCENT","operator":"GTE","threshold":"75"}]},
  {"kind":"CONDITION","id":"gain","metric":"SURVEY_MEAN_IMPROVEMENT_POINTS","operator":"GTE","threshold":"100"}]}'::jsonb));
SELECT pg_temp.make_rule('p34',334,'SURVEY_MEAN_POST_TEST_PERCENT','LT','100',1,9970);
SELECT pg_temp.make_rule('p35',335,'KPI_ACHIEVEMENT_PERCENT','LT','70',1,9972);
SELECT pg_temp.reject(format('SELECT pg_temp.make_rule(%L,333,%L,%L,%L,1,9974)','bad1','SURVEY_MEAN_POST_TEST_PERCENT','LT','101'),
 '22023','post-test threshold above 100 is refused');
SELECT pg_temp.reject(format('SELECT pathways.f10_rule_create(%L::jsonb)',jsonb_build_object('name','Bound KPI','severity',NULL,'code','F10-BADKPI',
 'projectId',pg_temp.u(330),'clientOperationId',pg_temp.u(9976),'recommendations',jsonb_build_array(jsonb_build_object('id',pg_temp.u(99761),'title','A','text','B')),
 'conditions',jsonb_build_object('kind','CONDITION','id','c1','metric','KPI_ACHIEVEMENT_PERCENT','operator','LT','threshold','70',
  'indicatorId',pg_temp.u(11501)))),'22023','KPI with an indicator binding is refused');
COMMIT;
CALL pg_temp.drain('kpi_tests');
SELECT pg_temp.ok(pg_temp.last_eval('p30')->>'result'='TRUE' AND pg_temp.last_eval('p30')->'cell'->>'value'='62.5'
 AND pg_temp.last_eval('p30')->>'unit'='PERCENT' AND (pg_temp.alert_of(330)).id IS NOT NULL,'KPI mean of measured live indicators raises the alert');
SELECT pg_temp.ok((SELECT a.severity IS NULL AND a.severity_basis->>'status'='CONTEXT_REQUIRED'
 AND a.severity_basis->'missing'='["DELIVERY_EXPECTATION"]'::jsonb AND a.severity_basis->'conditions'->0->>'outcome'='EXPLANATORY'
 FROM pg_temp.alert_of(330) a),'KPI only explains severity');
SELECT pg_temp.ok(pg_temp.last_eval('p31')->'cell'->>'reason'='NO_MEASUREMENT' AND pg_temp.last_eval('p32')->'cell'->>'reason'='EMPTY_POPULATION'
 AND pg_temp.last_eval('p35')->'cell'->>'reason'='NOT_APPLICABLE' AND (pg_temp.alert_of(331)).id IS NULL AND (pg_temp.alert_of(332)).id IS NULL,
 'KPI reasons for no values, no indicators and an on-hold project');
SELECT pg_temp.ok(pg_temp.last_eval('p33pre')->>'result'='TRUE' AND pg_temp.last_eval('p33pre')->'cell'->>'value'='50'
 AND pg_temp.last_eval('p33pre')->>'unit'='PERCENT','pre-test mean counts each active enrollment latest score only');
SELECT pg_temp.ok((SELECT e.result='TRUE' AND (SELECT jsonb_object_agg(c->>'conditionId',c->'cell'->>'value') FROM jsonb_array_elements(e.evidence->'conditions') c)
  ='{"pre":"50","post":"75","gain":"21.4286"}'::jsonb
 FROM pathways_rules_internal.evaluations e JOIN pathways.alert_rules r ON r.id=e.rule_version_id
 WHERE r.display_code='F10-P33MIX' ORDER BY e.evaluation_sequence DESC LIMIT 1),'(pre AND post) OR gain matches through the AND branch');
SELECT pg_temp.ok(pg_temp.last_eval('p34')->'cell'->>'value'='50' AND (pg_temp.alert_of(334)).id IS NOT NULL,'four post-tests give the exact mean and raise the alert (0076)');
INSERT INTO t_out SELECT 'kpi_alerts',jsonb_build_object('p30',(pg_temp.alert_of(330)).id,
 'p33',(SELECT a.id FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.id=a.rule_id WHERE r.display_code='F10-P33PRE'));
-- Test score alerts need assessments.detail.read: the Grant Manager assigned to P33 is refused.
BEGIN;
SELECT pg_temp.act(6);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'p33')::uuid FROM t_out WHERE name='kpi_alerts')),'42501','no assessments.detail.read: pre-test alert');
COMMIT;
-- KPI alerts need monitoring.read and an indicator read: the PM sees it, and is refused once both indicator reads are revoked.
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pathways.f10_alert_get((SELECT (doc->>'p30')::uuid FROM t_out WHERE name='kpi_alerts')) IS NOT NULL,'indicator reader sees the KPI alert');
COMMIT;
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE t_saved_kpi ON COMMIT DROP AS SELECT rp.* FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id
 WHERE r.code='PROJECT_MANAGER' AND p.code IN ('indicators.read','reports.indicator.read');
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_MANAGER' AND p.code IN ('indicators.read','reports.indicator.read');
SELECT pg_temp.act(2);
SELECT pg_temp.reject(format('SELECT pathways.f10_alert_get(%L)',(SELECT (doc->>'p30')::uuid FROM t_out WHERE name='kpi_alerts')),'42501','no indicator read: KPI alert');
RESET SESSION AUTHORIZATION;
INSERT INTO pathways.role_permissions SELECT * FROM t_saved_kpi;
COMMIT;

DO $$ BEGIN RAISE NOTICE 'F10_F11_RULES_RUNTIME=PASS (% checks)',(SELECT count(*) FROM t_results); END $$;
