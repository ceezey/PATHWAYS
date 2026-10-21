-- cr-pathways-indicator-summary-measurement-lookup (migration 0075): runtime checks for the MANUAL measurement lookup of
-- pathways.p34_compute_indicator_value through the Indicator Summary report. Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0075.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0075 indicator-summary-measurement-lookup checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE ism_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON ism_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '0075 assertion failed: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION '0075 % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION '0075 % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.cell(report text,indicator integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e->'current' FROM ism_out o, jsonb_array_elements(o.doc) e WHERE o.name=report AND e->>'id'=pg_temp.u(indicator)::text
$$;

-- Org A, M&E Officer u101 assigned to project u301 only. Indicators: u601 MANUAL with a correction chain
-- (u701 <- u702 <- u703) and a newer root u705 in another period; u602 MANUAL with no measurement; u603 on the unassigned u302.
-- Org B holds project u303 with indicator u604, whose measurement u707 has the same period and a newer timestamp.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES (pg_temp.u(201));
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'ISM_ORG_A','Synthetic ISM org A'),(pg_temp.u(2),'ISM_ORG_B','Synthetic ISM org B');
INSERT INTO pathways.roles(code,name) VALUES ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(101),pg_temp.u(1),r.id,pg_temp.u(201),'ISM M&E Officer','ism-me@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='MONITORING_AND_EVALUATION_OFFICER';
INSERT INTO pathways.permissions(code,name) VALUES ('reports.read','reports.read'),('reports.indicator.read','reports.indicator.read')
ON CONFLICT(code) DO NOTHING;
-- Grants follow the RBAC contract exactly, so no pair outside p09_role_allows is added.
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('reports.read','reports.indicator.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(CASE WHEN n=3 THEN 2 ELSE 1 END),'ISM-P'||n,'ISM project '||n,'2025-07-01','2026-12-31',pg_temp.u(101)
FROM generate_series(1,3) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES (gen_random_uuid(),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101));
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
SELECT pg_temp.u(v.id),pg_temp.u(v.org),pg_temp.u(v.project),v.code,'Synthetic indicator '||v.code,NULL,'COUNT','people','Synthetic manual source','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(101)
FROM (VALUES (601,1,301,'ISM-CHAIN'),(602,1,301,'ISM-EMPTY'),(603,1,302,'ISM-UNASSIGNED'),(604,2,303,'ISM-ORG-B')) v(id,org,project,code);
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,corrects_measurement_id,correction_reason,recorded_by_id,recorded_at)
VALUES
  (pg_temp.u(701),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',10,'Synthetic field report',pg_temp.u(801),repeat('a',64),NULL,NULL,pg_temp.u(101),'2026-03-01T00:00:00Z'),
  (pg_temp.u(702),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',11,'Synthetic field report',pg_temp.u(802),repeat('b',64),pg_temp.u(701),'Synthetic correction',pg_temp.u(101),'2026-03-02T00:00:00Z'),
  (pg_temp.u(703),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',12,'Synthetic field report',pg_temp.u(803),repeat('c',64),pg_temp.u(702),'Synthetic correction',pg_temp.u(101),'2026-03-03T00:00:00Z'),
  (pg_temp.u(705),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2025-07-01','2025-12-31',99,'Synthetic field report',pg_temp.u(805),repeat('d',64),NULL,NULL,pg_temp.u(101),'2026-03-04T00:00:00Z'),
  (pg_temp.u(706),pg_temp.u(1),pg_temp.u(302),pg_temp.u(603),'2026-01-01','2026-06-30',5,'Synthetic field report',pg_temp.u(806),repeat('e',64),NULL,NULL,pg_temp.u(101),'2026-03-01T00:00:00Z'),
  (pg_temp.u(707),pg_temp.u(2),pg_temp.u(303),pg_temp.u(604),'2026-01-01','2026-06-30',77,'Synthetic field report',pg_temp.u(807),repeat('f',64),NULL,NULL,pg_temp.u(101),'2026-03-05T00:00:00Z');
SET LOCAL session_replication_role = origin;

-- Catalog: the reviewed body, owner, definer mode, empty search_path, no runtime grant and no residual owner chain.
SELECT pg_temp.ok((SELECT md5(p.prosrc)='a14c59889bae818ac6dfa7263c3d264b' AND pg_get_userbyid(p.proowner)='report_projection_owner'
   AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   FROM pg_proc p WHERE p.oid='pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)'::regprocedure),
  '1 p34_compute_indicator_value is the reviewed 0075 definition owned by report_projection_owner');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('anon','pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE'),
  '2 the compute function stays unexecutable by the runtime and Data API roles');
SELECT pg_temp.ok(NOT pg_has_role('prisma','report_projection_owner','MEMBER')
  AND NOT has_schema_privilege('report_projection_owner','pathways','CREATE'),
  '3 no temporary prisma membership or lent schema CREATE remains');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
   JOIN pathways.permissions p ON p.id=rp.permission_id
   WHERE r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('reports.read','reports.indicator.read'))=2,
  '4 the M&E Officer holds both report permissions under the RBAC contract');

-- Reads through the report entry point as the assigned M&E Officer; the projection policies need the runtime session user.
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
INSERT INTO ism_out SELECT 'assigned', pathways.p34_indicator_report(pg_temp.u(301),'Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p34_indicator_report(%L::uuid,%L)',pg_temp.u(302),'Asia/Manila'),
  '42501','5 an unassigned project is refused');
SELECT pg_temp.reject(format('SELECT pathways.p34_indicator_report(%L::uuid,%L)',pg_temp.u(303),'Asia/Manila'),
  '42501','6 another organization''s project is refused');
RESET SESSION AUTHORIZATION;

SELECT pg_temp.ok((SELECT jsonb_array_length(doc) FROM ism_out WHERE name='assigned')=2,
  '7 the report lists exactly the two indicators of the assigned project');
SELECT pg_temp.ok(pg_temp.cell('assigned',601)->>'value'='12',
  '8 the latest correction of the chain is the current value, not the newer root in another period');
SELECT pg_temp.ok(pg_temp.cell('assigned',602)->>'value' IS NULL AND pg_temp.cell('assigned',602)->>'reason'='NO_MEASUREMENT',
  '9 an indicator without a measurement reads as missing');
SELECT pg_temp.ok(pg_temp.cell('assigned',604) IS NULL,
  '10 no other organization''s indicator or measurement appears');

ROLLBACK;
SELECT 'INDICATOR_SUMMARY_MEASUREMENT_LOOKUP_RUNTIME=PASS';
