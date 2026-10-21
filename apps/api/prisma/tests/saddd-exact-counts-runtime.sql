-- cr-pathways-saddd-exact-counts (migration 0076): runtime checks for exact closed-project SADDD releases under
-- FIXED_CLOSED_PROJECT_PERIOD_V2 and the one-time re-release of a V1 release. Synthetic fixtures only; everything rolls
-- back. Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay database with 0076.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0076 saddd-exact-counts checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;
CREATE TEMP TABLE sec_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE sec_out(name text PRIMARY KEY, doc jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON sec_results TO pathways_runtime;
GRANT INSERT, SELECT ON sec_out TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO sec_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.doc(wanted text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT doc FROM sec_out WHERE name=wanted
$$;
CREATE FUNCTION pg_temp.release(project integer) RETURNS pathways.sensitive_aggregate_releases LANGUAGE sql AS $$
  SELECT * FROM pathways.sensitive_aggregate_releases WHERE project_id=pg_temp.u(project)
$$;
-- Reads SADDD for one project as the Program Manager over its persisted period.
CREATE FUNCTION pg_temp.saddd(project integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(project)],p.start_date,p.end_date,'Asia/Manila')
  FROM pathways.projects p WHERE p.id=pg_temp.u(project)
$$;

-- Org A, Program Manager u101. Closed projects: C1 u321 first release, C2 u322 seeded V1 release, C3 u323 seeded V1 stale.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES (pg_temp.u(201));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'SEC_ORG_A','Synthetic SEC org A');
INSERT INTO pathways.roles(code,name) VALUES ('PROGRAM_MANAGER','Program Manager') ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(101),pg_temp.u(1),r.id,pg_temp.u(201),'SEC Program Manager','sec-pgm@example.invalid','ACTIVE',now()
FROM pathways.roles r WHERE r.code='PROGRAM_MANAGER';
INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),
  ('analytics.saddd.read','analytics.saddd.read')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON pathways.p09_role_allows(r.code,p.code)
WHERE r.code='PROGRAM_MANAGER' AND p.code IN ('projects.read','beneficiaries.aggregates.read','analytics.saddd.read')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
SELECT pg_temp.u(p),pg_temp.u(1),'SEC-C'||p,'SEC closed project '||p,
  (now() AT TIME ZONE 'Asia/Manila')::date-100,(now() AT TIME ZONE 'Asia/Manila')::date-10,pg_temp.u(101)
FROM (VALUES (321),(322),(323)) v(p);
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT gen_random_uuid(),pg_temp.u(1),pg_temp.u(p),pg_temp.u(101),pg_temp.u(101) FROM (VALUES (321),(322),(323)) v(p);
-- Three individuals per project: a count of 1-4 that V1 suppressed as a whole release.
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
SELECT pg_temp.u(400+n),pg_temp.u(1),'SEC-'||n,'INDIVIDUAL','Synthetic','Person '||n,true,true,pg_temp.u(101)
FROM generate_series(1,9) n;
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
SELECT pg_temp.u(500+n),pg_temp.u(1),pg_temp.u(320+(n+2)/3),pg_temp.u(400+n),(now() AT TIME ZONE 'Asia/Manila')::date-90,pg_temp.u(101)
FROM generate_series(1,9) n;
-- Releases frozen before 0076: C2 still RELEASED under V1, C3 already STALE under V1.
INSERT INTO pathways.sensitive_aggregate_releases(organization_id,project_id,period_start,period_end,policy_version,source_fingerprint,status,stale_reason,stale_at)
SELECT pg_temp.u(1),p.id,p.start_date,p.end_date,'FIXED_CLOSED_PROJECT_PERIOD_V1',repeat('a',64),v.status,v.reason,v.stale_at
FROM pathways.projects p JOIN (VALUES (322,'RELEASED',NULL,NULL::timestamptz),(323,'STALE','SOURCE_CHANGED',now())) v(n,status,reason,stale_at)
  ON p.id=pg_temp.u(v.n);
UPDATE pathways.sensitive_aggregate_releases SET released_at=now()-interval '30 days' WHERE project_id=pg_temp.u(322);
SET LOCAL session_replication_role = origin;

SELECT pg_temp.ok((SELECT pg_get_constraintdef(oid) LIKE '%FIXED_CLOSED_PROJECT_PERIOD_V2%' FROM pg_constraint
  WHERE conname='p06_sensitive_release_policy_check'),
  '1 the release registry admits the V2 exact-count policy');

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.organization_id',pg_temp.u(1)::text,true),
  set_config('app.user_id',pg_temp.u(101)::text,true);
INSERT INTO sec_out VALUES ('c1',pg_temp.saddd(321)),('c2',pg_temp.saddd(322)),('c3',pg_temp.saddd(323));
INSERT INTO sec_out VALUES ('c2_again',pg_temp.saddd(322));
RESET ROLE;

SELECT pg_temp.ok((SELECT d->>'releaseState'='RELEASED' AND d#>>'{total,state}'='AVAILABLE' AND d#>>'{total,value}'='3'
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(d->'sex') x WHERE x#>>'{metric,state}'='SUPPRESSED')
  FROM pg_temp.doc('c1') d),
  '2 a closed project with three individuals releases exact counts');
SELECT pg_temp.ok((SELECT r.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V2' AND r.status='RELEASED' FROM pg_temp.release(321) r),
  '3 a first release is frozen under V2');
SELECT pg_temp.ok((SELECT d->>'releaseState'='RELEASED' AND d#>>'{total,value}'='3' FROM pg_temp.doc('c2') d),
  '4 a V1 release is re-released with exact counts');
SELECT pg_temp.ok((SELECT r.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V2' AND r.status='RELEASED' AND r.source_fingerprint<>repeat('a',64)
  AND r.released_at>now()-interval '1 day' FROM pg_temp.release(322) r),
  '5 the re-release moves the row to V2 with a fresh fingerprint and release time');
SELECT pg_temp.ok(pg_temp.doc('c2_again')=pg_temp.doc('c2'),
  '6 a second read of the re-released project returns the same release');
SELECT pg_temp.ok((SELECT d#>>'{total,reason}'='RESTATEMENT_REVIEW_REQUIRED' FROM pg_temp.doc('c3') d)
  AND (SELECT r.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V1' AND r.status='STALE' FROM pg_temp.release(323) r),
  '7 a V1 release that was already STALE stays STALE under review');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM sec_results;
 IF total<>7 THEN RAISE EXCEPTION '0076 saddd-exact-counts checks expected 7 assertions, recorded %',total; END IF;
 RAISE NOTICE 'SADDD_EXACT_COUNTS_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
