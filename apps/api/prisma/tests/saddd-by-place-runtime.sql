-- cr-pathways-map-reach-per-pin (migration 0077): runtime checks for pathways.p06_saddd_by_place, the SADDD population
-- grouped by recorded city or municipality and province. Synthetic fixtures only; everything rolls back. Run as a local
-- superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0077.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0077 saddd-by-place checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;
CREATE TEMP TABLE sbp_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE sbp_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON sbp_results TO pathways_runtime;
GRANT INSERT, SELECT ON sbp_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO sbp_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO sbp_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
         set_config('app.organization_id',pg_temp.u(1)::text,true),
         set_config('app.user_id',pg_temp.u(100+n)::text,true)
$$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT doc FROM sbp_out WHERE name=wanted
$$;
CREATE FUNCTION pg_temp.town(doc jsonb,wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements(doc) x WHERE x->>'town' IS NOT DISTINCT FROM wanted
$$;
CREATE FUNCTION pg_temp.n(row_doc jsonb,sex text) RETURNS integer LANGUAGE sql AS $$
  SELECT (s->>'n')::integer FROM jsonb_array_elements(row_doc->'sex') s WHERE s->>'key'=sex
$$;

-- Org A: Program Manager u101, Project Officer u103. Projects: P1 u301 ongoing and assigned, P2 u302 unassigned,
-- P3 u303 not started.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES (pg_temp.u(201)),(pg_temp.u(203));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'SBP_ORG_A','Synthetic SBP org A');
INSERT INTO pathways.roles(code,name) VALUES ('PROGRAM_MANAGER','Program Manager'),('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES (1,'PROGRAM_MANAGER','SBP Program Manager','sbp-pgm@example.invalid'),
  (3,'PROJECT_OFFICER','SBP Project Officer','sbp-po@example.invalid')) v(n,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),
  ('analytics.saddd.read','analytics.saddd.read')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code IN ('PROGRAM_MANAGER','PROJECT_OFFICER')
  AND p.code IN ('projects.read','beneficiaries.aggregates.read','analytics.saddd.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(v.p),pg_temp.u(1),'SBP-P'||v.p,'SBP project '||v.p,
  (now() AT TIME ZONE 'Asia/Manila')::date+v.s,(now() AT TIME ZONE 'Asia/Manila')::date+v.e,pg_temp.u(101)
FROM (VALUES (301,-30,60),(302,-30,60),(303,10,100)) v(p,s,e);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(1),pg_temp.u(v.p),pg_temp.u(100+v.n),pg_temp.u(101)
FROM (VALUES (301,1),(301,3),(303,1)) v(p,n);
-- P1: Borongan City 1 male 2 female, Guiuan 1 female (written in two spellings), no town 1, plus a group, an archived
-- and a dummy record that SADDD never counts.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,sex,first_name,last_name,location_city_municipality,
  location_province,status,archived_at,is_dummy_record,consent_recorded,data_processing_consent_recorded,created_by_id)
SELECT pg_temp.u(400+v.n),pg_temp.u(1),'SBP-'||v.n,v.subject::pathways.beneficiary_subject_type,v.sex::pathways.beneficiary_sex,
  'Synthetic','Person '||v.n,v.town,v.province,
  (CASE WHEN v.archived THEN 'ARCHIVED' ELSE 'ACTIVE' END)::pathways.profile_status,CASE WHEN v.archived THEN now() END,v.dummy,true,true,pg_temp.u(101)
FROM (VALUES
  (1,'INDIVIDUAL','MALE','Borongan City','Eastern Samar',false,false),
  (2,'INDIVIDUAL','FEMALE','Borongan City','Eastern Samar',false,false),
  (3,'INDIVIDUAL','FEMALE','Borongan City','Eastern Samar',false,false),
  (4,'INDIVIDUAL','FEMALE',' Guiuan ','Eastern Samar',false,false),
  (5,'INDIVIDUAL','MALE',NULL,NULL,false,false),
  (6,'GROUP','NOT_SPECIFIED','Borongan City','Eastern Samar',false,false),
  (7,'INDIVIDUAL','MALE','Borongan City','Eastern Samar',true,false),
  (8,'INDIVIDUAL','MALE','Borongan City','Eastern Samar',false,true)
) v(n,subject,sex,town,province,archived,dummy);
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
SELECT pg_temp.u(500+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(400+n),(now() AT TIME ZONE 'Asia/Manila')::date-20,pg_temp.u(101)
FROM generate_series(1,8) n;
SET LOCAL session_replication_role = origin;

SELECT pg_temp.ok(has_function_privilege('pathways_runtime','pathways.p06_saddd_by_place(uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('anon','pathways.p06_saddd_by_place(uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','pathways.p06_saddd_by_place(uuid,uuid,text)','EXECUTE'),
  '1 only the runtime role may execute the place release');

SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1);
INSERT INTO sbp_out VALUES ('p1',pathways.p06_saddd_by_place(pg_temp.u(1),pg_temp.u(301),'Asia/Manila')),
  ('p3',pathways.p06_saddd_by_place(pg_temp.u(1),pg_temp.u(303),'Asia/Manila'));
SELECT pg_temp.reject(format('SELECT pathways.p06_saddd_by_place(%L::uuid,%L::uuid,%L)',pg_temp.u(1),pg_temp.u(302),'Asia/Manila'),
  '42501','2 an unassigned project is refused');
SELECT pg_temp.reject(format('SELECT pathways.p06_saddd_by_place(%L::uuid,%L::uuid,%L)',pg_temp.u(2),pg_temp.u(301),'Asia/Manila'),
  '42501','3 another organization than the session is refused');
SELECT pg_temp.reject(format('SELECT pathways.p06_saddd_by_place(%L::uuid,%L::uuid,%L)',pg_temp.u(1),pg_temp.u(301),'UTC'),
  '22023','4 another business time zone is refused');
SELECT pg_temp.act_as(3);
SELECT pg_temp.reject(format('SELECT pathways.p06_saddd_by_place(%L::uuid,%L::uuid,%L)',pg_temp.u(1),pg_temp.u(301),'Asia/Manila'),
  '42501','5 a role without the SADDD grant is refused');
RESET ROLE;

SELECT pg_temp.ok((SELECT (x->>'total')::integer=3 AND x->>'province'='Eastern Samar' AND pg_temp.n(x,'MALE')=1
  AND pg_temp.n(x,'FEMALE')=2 FROM pg_temp.town(pg_temp.doc('p1'),'Borongan City') x),
  '6 a town releases its exact individuals by sex, excluding groups, archived and dummy records');
SELECT pg_temp.ok((SELECT (x->>'total')::integer=1 AND pg_temp.n(x,'FEMALE')=1 FROM pg_temp.town(pg_temp.doc('p1'),'Guiuan') x),
  '7 a town name is trimmed before grouping');
SELECT pg_temp.ok((SELECT (x->>'total')::integer=1 AND x->>'province' IS NULL FROM pg_temp.town(pg_temp.doc('p1'),NULL) x),
  '8 individuals without a recorded town form their own row');
SELECT pg_temp.ok((SELECT sum((x->>'total')::integer)=5 AND count(*)=3 FROM jsonb_array_elements(pg_temp.doc('p1')) x),
  '9 the town rows add up to the SADDD population');
SELECT pg_temp.ok(pg_temp.doc('p3')='[]'::jsonb,'10 a project that has not started releases no towns');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM sbp_results;
 IF total<>10 THEN RAISE EXCEPTION '0077 saddd-by-place checks expected 10 assertions, recorded %',total; END IF;
 RAISE NOTICE 'SADDD_BY_PLACE_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
