-- cr-pathways-escalated-alerts (migration 0062): behavioral checks for pathways.f10_escalated_alert_list.
-- Synthetic fixtures only. It reuses the committed alerts of f10-f11-rules-runtime.sql and records outcomes through
-- the real preview and confirm functions, so the data COMMITS: run it only right after that suite, against the same
-- disposable pathways_phase2_* or pathways_phase4_* replay database with 0062 applied and its cleanup run.
\set ON_ERROR_STOP on

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0062 escalated alert list checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE e_results(check_name text PRIMARY KEY);
CREATE TEMP TABLE e_out(name text PRIMARY KEY, doc jsonb);
GRANT INSERT, SELECT ON e_results, e_out TO PUBLIC;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO e_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO e_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
-- Same synthetic identifiers as the rules suite: user 102 PM (P1,P3,P6,P14-P18), 103 M&E (P1,P3), 104 PM (P2 only).
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE 'SET LOCAL SESSION AUTHORIZATION pathways_runtime';
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),
  set_config('app.user_id',pg_temp.u(100+n)::text,true);
END $$;
CREATE FUNCTION pg_temp.alert(project integer,budget boolean DEFAULT false) RETURNS uuid LANGUAGE sql AS $$
 SELECT a.id FROM pathways.rule_based_alerts a WHERE a.project_id=pg_temp.u(project) AND a.runtime_contract_version='f10.v1'
  AND a.lifecycle IN ('NEW','REVIEWED')
  AND (a.evaluated_snapshot->'conditions'->0->>'metric'='BUDGET_UTILIZATION_PERCENT')=budget
 ORDER BY a.id LIMIT 1
$$;
-- Records one alert outcome as the in-scope Project Manager through preview then confirm.
CREATE FUNCTION pg_temp.outcome(wanted uuid,result text,op integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE preview jsonb; current_revision text;
BEGIN
 -- The runtime role cannot read f10 rows directly, so the revision is read before switching.
 SELECT revision::text INTO STRICT current_revision FROM pathways.rule_based_alerts WHERE id=wanted;
 PERFORM pg_temp.act(2);
 preview:=pathways.f10_alert_preview(wanted,jsonb_build_object('expectedRevision',current_revision,'note','Synthetic '||result,
  'clientOperationId',pg_temp.u(op),'outcome',result));
 PERFORM pathways.f10_alert_confirm(wanted,jsonb_build_object('previewId',preview->>'previewId','clientOperationId',pg_temp.u(op+1)));
END $$;

INSERT INTO e_out SELECT 'ids',jsonb_build_object('p16',pg_temp.alert(316),'p18',pg_temp.alert(318),'p3b',pg_temp.alert(303,true));
SELECT pg_temp.ok((SELECT doc->>'p16' IS NOT NULL AND doc->>'p18' IS NOT NULL AND doc->>'p3b' IS NOT NULL FROM e_out WHERE name='ids'),
 '0 the rules suite left open alerts on P16, P18 and the P3 budget rule');
INSERT INTO e_out SELECT 'before',jsonb_build_object('lifecycle',lifecycle,'revision',revision::text)
 FROM pathways.rule_based_alerts WHERE id=(SELECT (doc->>'p16')::uuid FROM e_out WHERE name='ids');

BEGIN;
SELECT pg_temp.outcome((SELECT (doc->>'p16')::uuid FROM e_out WHERE name='ids'),'ESCALATE',9901);
COMMIT;
BEGIN;
SELECT pg_temp.outcome((SELECT (doc->>'p3b')::uuid FROM e_out WHERE name='ids'),'ESCALATE',9903);
COMMIT;
BEGIN;
SELECT pg_temp.outcome((SELECT (doc->>'p18')::uuid FROM e_out WHERE name='ids'),'ESCALATE',9905);
COMMIT;
BEGIN;
SELECT pg_temp.outcome((SELECT (doc->>'p18')::uuid FROM e_out WHERE name='ids'),'ACCEPT',9907);
COMMIT;

-- (1) The latest ESCALATE is listed with its time; (2) an escalation later ACCEPTed is not.
BEGIN;
SELECT pg_temp.act(2);
INSERT INTO e_out SELECT 'pm',pathways.f10_escalated_alert_list('{"limit":100}'::jsonb);
INSERT INTO e_out SELECT 'pm_page1',pathways.f10_escalated_alert_list('{"limit":1}'::jsonb);
INSERT INTO e_out SELECT 'pm_page2',pathways.f10_escalated_alert_list(jsonb_build_object('limit',1,'cursor',(SELECT doc->>'nextCursor' FROM e_out WHERE name='pm_page1')));
INSERT INTO e_out SELECT 'pm_p16',pathways.f10_escalated_alert_list(jsonb_build_object('limit',10,'projectId',pg_temp.u(316)));
COMMIT;
SELECT pg_temp.ok(EXISTS(SELECT FROM e_out o,jsonb_array_elements(o.doc->'items') i WHERE o.name='pm'
  AND i->>'id'=(SELECT doc->>'p16' FROM e_out WHERE name='ids')
  AND (i->>'escalatedAt')::timestamptz=(SELECT max(created_at) FROM pathways_rules_internal.decisions WHERE alert_id=(i->>'id')::uuid)),
 '1 the escalated alert is listed with its latest escalation time');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM e_out o,jsonb_array_elements(o.doc->'items') i WHERE o.name='pm'
  AND i->>'id'=(SELECT doc->>'p18' FROM e_out WHERE name='ids')),'2 an escalation followed by ACCEPT is not listed');
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'items')=1 AND doc->>'nextCursor' IS NOT NULL FROM e_out WHERE name='pm_page1')
 AND (SELECT jsonb_array_length(doc->'items')>=1 FROM e_out WHERE name='pm_page2')
 AND (SELECT doc->'items'->0->>'id' FROM e_out WHERE name='pm_page1')<>(SELECT doc->'items'->0->>'id' FROM e_out WHERE name='pm_page2')
 AND (SELECT jsonb_array_length(doc->'items')=1 AND doc->'items'->0->>'id'=(SELECT doc->>'p16' FROM e_out WHERE name='ids') FROM e_out WHERE name='pm_p16'),
 '1b pages advance by cursor and a project filter narrows the page');

-- (3) ESCALATE and listing never change the alert lifecycle.
SELECT pg_temp.ok((SELECT lifecycle::text FROM pathways.rule_based_alerts WHERE id=(SELECT (doc->>'p16')::uuid FROM e_out WHERE name='ids'))
  =(SELECT doc->>'lifecycle' FROM e_out WHERE name='before'),'3 ESCALATE and listing leave the lifecycle unchanged');

-- (4) Scope: M&E never sees the budget alert, a PM of another project sees nothing and an explicit foreign project is refused.
BEGIN;
SELECT pg_temp.act(3);
INSERT INTO e_out SELECT 'me',pathways.f10_escalated_alert_list('{"limit":100}'::jsonb);
SELECT pg_temp.act(4);
INSERT INTO e_out SELECT 'other',pathways.f10_escalated_alert_list('{"limit":100}'::jsonb);
SELECT pg_temp.reject(format('SELECT pathways.f10_escalated_alert_list(%L::jsonb)',jsonb_build_object('limit',10,'projectId',pg_temp.u(316))),
 '42501','4c an explicit project without alerts.read is refused');
COMMIT;
SELECT pg_temp.ok(EXISTS(SELECT FROM e_out o,jsonb_array_elements(o.doc->'items') i WHERE o.name='pm'
  AND i->>'id'=(SELECT doc->>'p3b' FROM e_out WHERE name='ids'))
 AND NOT EXISTS(SELECT FROM e_out o,jsonb_array_elements(o.doc->'items') i WHERE o.name='me'
  AND i->>'id'=(SELECT doc->>'p3b' FROM e_out WHERE name='ids')),'4a the budget escalation follows the rule exposure gate');
SELECT pg_temp.ok((SELECT jsonb_array_length(doc->'items')=0 FROM e_out WHERE name='other'),'4b a manager outside the project sees no items');

-- (5) Items never carry the decision note or actor ids.
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM e_out o,jsonb_array_elements(o.doc->'items') i WHERE o.name='pm'
  AND (i ? 'note' OR i ? 'actorId' OR i ? 'actor_id' OR i::text LIKE '%Synthetic ESCALATE%')),'5 items omit the note and the actor');

-- (6) Only the runtime session may call it, and input stays the closed page shape.
SELECT pg_temp.reject($q$SELECT pathways.f10_escalated_alert_list('{"limit":10}'::jsonb)$q$,'42501','6a a session other than pathways_runtime is refused');
BEGIN;
SELECT pg_temp.act(2);
SELECT pg_temp.reject($q$SELECT pathways.f10_escalated_alert_list('{"limit":10,"status":"NEW"}'::jsonb)$q$,'22023','6b an unknown input key is refused');
COMMIT;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM e_results;
 IF total<>11 THEN RAISE EXCEPTION '0062 escalated alert list checks expected 11 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ESCALATED_ALERT_LIST_RUNTIME=PASS (% assertions)',total;
END $$;
