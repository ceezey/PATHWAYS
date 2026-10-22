-- cr-pathways-indicator-measurement-lookup (migration 0074): runtime checks for the MANUAL measurement lookup of
-- pathways.p06_compute_indicator_value. Synthetic fixtures only; everything rolls back. Run as a local superuser against a
-- disposable pathways_phase2_* or pathways_phase4_* replay database with 0074.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0074 indicator-measurement-lookup checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE TEMP TABLE iml_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON iml_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '0074 assertion failed: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION '0074 % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION '0074 % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a7400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT doc FROM iml_out WHERE name=wanted
$$;

-- Org A, M&E Officer u101 assigned to project u301 only. Indicators: u601 MANUAL with a correction chain
-- (u701 <- u702 <- u703) and a newer root u705 in another period; u602 MANUAL with no measurement; u603 on the unassigned u302.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES (pg_temp.u(201));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'IML_ORG_A','Synthetic IML org A');
INSERT INTO pathways.roles(code,name) VALUES ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(101),pg_temp.u(1),r.id,pg_temp.u(201),'IML M&E Officer','iml-me@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='MONITORING_AND_EVALUATION_OFFICER';
INSERT INTO pathways.permissions(code,name) VALUES ('monitoring.read','monitoring.read') ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code='monitoring.read'
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(300+n),pg_temp.u(1),'IML-P'||n,'IML project '||n,'2025-07-01','2026-12-31',pg_temp.u(101)
FROM generate_series(1,2) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES (gen_random_uuid(),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101));
INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,unit,unit_label,data_source,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
SELECT pg_temp.u(v.id),pg_temp.u(1),pg_temp.u(v.project),v.code,'Synthetic indicator '||v.code,NULL,'COUNT','people','Synthetic manual source','MANUAL','COUNT','HIGHER_IS_BETTER',0,'2026-01-01','2026-06-30',0,20,pg_temp.u(101)
FROM (VALUES (601,301,'IML-CHAIN'),(602,301,'IML-EMPTY'),(603,302,'IML-UNASSIGNED')) v(id,project,code);
INSERT INTO pathways.project_indicator_measurements(id,organization_id,project_id,indicator_id,period_start,period_end,value,source,client_measurement_id,request_hash,corrects_measurement_id,correction_reason,recorded_by_id,recorded_at)
VALUES
  (pg_temp.u(701),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',10,'Synthetic field report',pg_temp.u(801),repeat('a',64),NULL,NULL,pg_temp.u(101),'2026-03-01T00:00:00Z'),
  (pg_temp.u(702),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',11,'Synthetic field report',pg_temp.u(802),repeat('b',64),pg_temp.u(701),'Synthetic correction',pg_temp.u(101),'2026-03-02T00:00:00Z'),
  (pg_temp.u(703),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2026-01-01','2026-06-30',12,'Synthetic field report',pg_temp.u(803),repeat('c',64),pg_temp.u(702),'Synthetic correction',pg_temp.u(101),'2026-03-03T00:00:00Z'),
  (pg_temp.u(705),pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'2025-07-01','2025-12-31',99,'Synthetic field report',pg_temp.u(805),repeat('d',64),NULL,NULL,pg_temp.u(101),'2026-03-04T00:00:00Z'),
  (pg_temp.u(706),pg_temp.u(1),pg_temp.u(302),pg_temp.u(603),'2026-01-01','2026-06-30',5,'Synthetic field report',pg_temp.u(806),repeat('e',64),NULL,NULL,pg_temp.u(101),'2026-03-01T00:00:00Z');
SET LOCAL session_replication_role = origin;

-- Catalog: the reviewed body, owner, definer mode, empty search_path and no grant beyond the owner.
SELECT pg_temp.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='prisma'),
  '1 prisma has neither SUPERUSER nor BYPASSRLS, as on hosted');
SELECT pg_temp.ok((SELECT md5(p.prosrc)='2c9dba260db07a6fcc317c2f0cbad04a' AND pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   FROM pg_proc p WHERE p.oid='pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)'::regprocedure),
  '2 p06_compute_indicator_value is the reviewed 0074 definition as 0076 replaced it, owned by prisma');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('anon','pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','EXECUTE'),
  '3 the compute function stays unexecutable by the runtime and Data API roles');

-- Reads through the runtime entry point as the assigned M&E Officer.
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
SET LOCAL ROLE pathways_runtime;
INSERT INTO iml_out SELECT 'chain', pathways.p06_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(601),'Asia/Manila');
INSERT INTO iml_out SELECT 'empty', pathways.p06_indicator_value(pg_temp.u(1),pg_temp.u(301),pg_temp.u(602),'Asia/Manila');
SELECT pg_temp.reject(format('SELECT pathways.p06_indicator_value(%L::uuid,%L::uuid,%L::uuid,%L)',
  pg_temp.u(1),pg_temp.u(302),pg_temp.u(603),'Asia/Manila'),'42501','4 an unassigned project is refused');
RESET ROLE;

SELECT pg_temp.ok(pg_temp.doc('chain')->>'measurementId'=pg_temp.u(703)::text AND pg_temp.doc('chain')#>>'{current,value}'='12',
  '5 the latest correction of the chain is the current value');
SELECT pg_temp.ok(pg_temp.doc('chain')->>'measurementId'<>pg_temp.u(705)::text,
  '6 a newer root in another period is ignored');
SELECT pg_temp.ok(pg_temp.doc('empty')->>'measurementId' IS NULL AND pg_temp.doc('empty')#>>'{current,reason}'='NO_MEASUREMENT',
  '7 an indicator without a measurement reads as missing');

ROLLBACK;
SELECT 'INDICATOR_MEASUREMENT_LOOKUP_RUNTIME=PASS';
