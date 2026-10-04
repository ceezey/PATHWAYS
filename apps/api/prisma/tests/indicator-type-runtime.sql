-- 0056 indicator type: behavioral checks that the INDICATOR_CREATE source operation carries an
-- optional indicatorType into the inserted row, defaults to OUTPUT, rejects values outside the enum
-- and still rejects an insert that differs from the validated request. Synthetic fixtures only;
-- everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or
-- pathways_phase4_* replay database that already has 0056 applied and its cleanup run.
-- The creates run exactly as the API runs them: as the pathways_runtime session with the app.*
-- context, through f10_begin_source_operation, the project_indicators INSERT and
-- f10_finish_source_operation (IndicatorsService.create).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0056 indicator-type checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE ity_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON ity_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO ity_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- One indicator creation exactly as IndicatorsService.create performs it. The body is the request
-- and insert_type the indicator_type the INSERT writes (the request value when NULL). Returns 'OK'
-- or the SQLSTATE and message of the first failure; a failure rolls the whole attempt back.
CREATE FUNCTION pg_temp.create_indicator(org uuid,actor uuid,project uuid,request uuid,body jsonb,
 insert_type text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE started jsonb; handle uuid; indicator uuid;
BEGIN
 BEGIN
  PERFORM set_config('app.organization_id',org::text,true);
  PERFORM set_config('app.user_id',actor::text,true);
  PERFORM set_config('request.jwt.claim.sub',('7d000000-0000-4000-8000-'||lpad((right(actor::text,12)::integer+100)::text,12,'0')),true);
  started:=pathways.f10_begin_source_operation('INDICATOR_CREATE',project,NULL,'CLIENT_MUTATION',request,'MUTATION',body);
  handle:=(started->>'operationHandle')::uuid;
  indicator:=(started->>'reservedRecordId')::uuid;
  INSERT INTO pathways.project_indicators(id,organization_id,project_id,code,name,description,indicator_type,unit,unit_label,data_source,
   measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,baseline_value,target_value,created_by_id)
  VALUES(indicator,org,project,body->>'code',body->>'name',body->>'description',
   coalesce(insert_type,body->>'indicatorType','OUTPUT')::pathways.indicator_type,'COUNT'::pathways.indicator_unit,body->>'unitLabel',
   body->>'dataSource',body->>'mode',body->>'numericKind',body->>'direction',(body->>'displayPrecision')::integer,
   (body->>'periodStart')::date,(body->>'periodEnd')::date,(body->>'baseline')::numeric,(body->>'target')::numeric,actor);
  PERFORM pathways.f10_finish_source_operation(handle);
  RETURN 'OK';
 EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE||': '||SQLERRM;
 END;
END $$;
CREATE FUNCTION pg_temp.expect(result text,expected text,label text,pattern text DEFAULT '%') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF expected='OK' THEN
  IF result<>'OK' THEN RAISE EXCEPTION 'Assertion % expected OK, got %',label,result; END IF;
 ELSIF left(result,5)<>expected OR result NOT LIKE pattern THEN
  RAISE EXCEPTION 'Assertion % expected % like %, got %',label,expected,pattern,result;
 END IF;
 INSERT INTO ity_results VALUES(label);
END $$;
-- The SQLSTATE of canonical_source_request for one request, or OK.
CREATE FUNCTION pg_temp.try_canonical(body jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pathways_rules_internal.canonical_source_request('INDICATOR_CREATE',body);
 RETURN 'OK';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
-- A valid manual COUNT indicator request; the caller overrides or adds keys.
CREATE FUNCTION pg_temp.req(code text,extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('code',code,'name','Synthetic indicator '||code,'unitLabel','people','dataSource','Synthetic register',
  'mode','MANUAL','numericKind','COUNT','direction','HIGHER_IS_BETTER','displayPrecision',0,'periodStart','2026-01-01',
  'periodEnd','2026-12-31','baseline','0','target','100')||extra
$$;

-- Ledger, cleanup and catalog: the migration finished, its temporary chain and lent rights are gone.
SELECT pg_temp.ok(EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0056_indicator_type'
 AND finished_at IS NOT NULL AND rolled_back_at IS NULL),'ledger row finished');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 WHERE m.member='prisma'::regrole AND r.rolname LIKE 'rules\_%\_owner')
 AND NOT has_schema_privilege('rules_enqueue_owner','pathways','CREATE')
 AND NOT has_schema_privilege('rules_enqueue_owner','pathways_rules_internal','CREATE')
 AND NOT has_schema_privilege('rules_store_owner','pathways','CREATE'),'post-cleanup membership and schema rights unchanged');
SELECT pg_temp.ok(pg_get_userbyid(p.proowner)='rules_enqueue_owner' AND p.prosecdef AND p.provolatile='v'
 AND p.proconfig=ARRAY['search_path=""'] AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND md5(p.prosrc)='a9c15dca6847b64f109cf7b2039c4145','f10_begin_source_operation owner mode search_path ACL and body'),
 pg_temp.ok(pg_get_userbyid(q.proowner)='rules_enqueue_owner' AND NOT q.prosecdef AND q.provolatile='i'
 AND q.proconfig=ARRAY['search_path=""'] AND NOT has_function_privilege('pathways_runtime',q.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',q.oid,'EXECUTE') AND md5(q.prosrc)='cc7f2aae3e9dc2e5b7c9e2f04dbcf4df',
 'canonical_source_request owner mode search_path ACL and body')
FROM pg_proc p,pg_proc q
WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::regprocedure
 AND q.oid='pathways_rules_internal.canonical_source_request(text,jsonb)'::regprocedure;

-- Canonical request: the optional key is accepted, normalized and bounded to the enum.
SELECT pg_temp.ok(pathways_rules_internal.canonical_source_request('INDICATOR_CREATE',pg_temp.req('ITY-C1','{"indicatorType":"OUTCOME"}'))->>'indicatorType'='OUTCOME',
 'canonical request keeps a valid indicatorType');
SELECT pg_temp.ok(NOT (pathways_rules_internal.canonical_source_request('INDICATOR_CREATE',pg_temp.req('ITY-C2')) ? 'indicatorType'),
 'canonical request without indicatorType is unchanged');
SELECT pg_temp.ok((SELECT bool_and(pathways_rules_internal.canonical_source_request('INDICATOR_CREATE',
  pg_temp.req('ITY-C3',jsonb_build_object('indicatorType',t)))->>'indicatorType'=t)
  FROM unnest(ARRAY['OUTPUT','OUTCOME','ACTIVITY','BUDGET','TIMELINE','PARTICIPATION','SURVEY_SCORE']) t),'all seven enum values are accepted');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM (VALUES('{"indicatorType":"outcome"}'::jsonb),('{"indicatorType":"NOPE"}'),
 ('{"indicatorType":" OUTCOME"}'),('{"indicatorType":null}'),('{"indicatorType":7}')) x(v)
 WHERE pg_temp.try_canonical(pg_temp.req('ITY-C4',x.v)) IS DISTINCT FROM '22023'),
 'out-of-enum, null and non-string indicatorType values are rejected');

-- Fixtures: one organization, a Project Manager assigned to one project.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,2) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'ITY_ORG_A','Synthetic ITY org A');
INSERT INTO pathways.roles(code,name) VALUES('PROJECT_MANAGER','Project Manager') ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.permissions(code,name) VALUES('projects.read','projects.read'),('indicators.create','indicators.create')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code='PROJECT_MANAGER' AND p.code IN ('projects.read','indicators.create') ON CONFLICT DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(101),pg_temp.u(1),r.id,pg_temp.u(201),'ITY PM A (assigned)','ity-pm-a@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='PROJECT_MANAGER';
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
 (pg_temp.u(301),pg_temp.u(1),'ITY-A1','ITY Project A1','2026-01-01','2026-12-31',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101));
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
-- (a) A request with indicatorType OUTCOME inserts an OUTCOME row.
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(901),
 pg_temp.req('ITY-OUTCOME','{"indicatorType":"OUTCOME"}')),'OK','an OUTCOME indicator is created');
-- (b) A request without indicatorType still inserts OUTPUT.
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(902),
 pg_temp.req('ITY-DEFAULT')),'OK','an indicator without indicatorType is created');
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(903),
 pg_temp.req('ITY-OUTPUT','{"indicatorType":"OUTPUT"}')),'OK','an explicit OUTPUT indicator is created');
-- (c) An unknown type is refused at begin.
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(904),
 pg_temp.req('ITY-NOPE','{"indicatorType":"NOPE"}')),'22023','an unknown indicatorType is refused at begin',
 '%Invalid indicator definition');
-- (d) The request says OUTCOME but the INSERT writes OUTPUT: the source proof rejects it.
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(905),
 pg_temp.req('ITY-MISMATCH','{"indicatorType":"OUTCOME"}'),'OUTPUT'),'22023','an insert that differs from the request type is refused',
 '%Source DML differs%');
SELECT pg_temp.expect(pg_temp.create_indicator(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(906),
 pg_temp.req('ITY-MISMATCH2'),'BUDGET'),'22023','a typed insert for an untyped request is refused',
 '%Source DML differs%');
RESET SESSION AUTHORIZATION;

SELECT pg_temp.ok((SELECT indicator_type::text FROM pathways.project_indicators WHERE code='ITY-OUTCOME')='OUTCOME','OUTCOME row stored');
SELECT pg_temp.ok((SELECT indicator_type::text FROM pathways.project_indicators WHERE code='ITY-DEFAULT')='OUTPUT','default row stored as OUTPUT');
SELECT pg_temp.ok((SELECT indicator_type::text FROM pathways.project_indicators WHERE code='ITY-OUTPUT')='OUTPUT','explicit OUTPUT row stored');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pathways.project_indicators WHERE code IN ('ITY-NOPE','ITY-MISMATCH','ITY-MISMATCH2')),
 'refused creates left no row');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM ity_results;
 IF total<>18 THEN RAISE EXCEPTION '0056 indicator-type checks expected 18 assertions, recorded %',total; END IF;
 RAISE NOTICE 'INDICATOR_TYPE_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
