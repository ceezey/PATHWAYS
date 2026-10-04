-- cr-pathways-activity-extension-request (migration 0061): behavioral checks for pathways.activity_extension_requests.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or pathways_phase4_* replay database that already has 0061 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0061 activity-extension-requests checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE aer_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON aer_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO aer_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected OR position(needle in SQLERRM)=0 THEN
   RAISE EXCEPTION 'Assertion % expected % mentioning %, got %: %',label,expected,needle,SQLSTATE,SQLERRM; END IF;
  INSERT INTO aer_results VALUES(label);
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

-- One org and project. Users: 1 Project Officer (assigned), 2 M&E officer (assigned), 3 Project Manager (assigned),
-- 4 Project Officer with no assignment (no activities.read).
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,4) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'AER_ORG_A','Synthetic AER org A');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  (1,'PROJECT_OFFICER','AER Officer (assigned)','aer-po@example.invalid'),
  (2,'MONITORING_AND_EVALUATION_OFFICER','AER M&E officer','aer-me@example.invalid'),
  (3,'PROJECT_MANAGER','AER Project Manager','aer-pm@example.invalid'),
  (4,'PROJECT_OFFICER','AER Officer (unassigned)','aer-po2@example.invalid')
) v(n,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.permissions(code,name) VALUES
  ('activities.read','activities.read'),('activities.proof.submit','activities.proof.submit'),
  ('evidence.review','evidence.review'),('activities.update','activities.update')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON
  (r.code='PROJECT_OFFICER' AND p.code IN ('activities.read','activities.proof.submit'))
  OR (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('activities.read','evidence.review'))
  OR (r.code='PROJECT_MANAGER' AND p.code IN ('activities.read','activities.update'))
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id)
VALUES(pg_temp.u(301),pg_temp.u(1),'AER-A1','AER Project A1','2026-01-01','2026-12-31',pg_temp.u(103));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(103)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(102),pg_temp.u(103)),
  (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(103));
INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id
) SELECT pg_temp.u(500+n),pg_temp.u(1),pg_temp.u(301),'AER-ACT-'||n,'Activity '||n,'2026-01-01','2026-02-01','2026-01-01',
  'IN_PROGRESS',pg_temp.u(103) FROM generate_series(1,6) n;
-- Seeded as owner: 601 PENDING requested by the M&E officer (self-verify case), 602 VERIFIED by the M&E officer
-- (self-decide case), 603 PENDING requested by the PO (legitimate verify case).
INSERT INTO pathways.activity_extension_requests(
  id,organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,status,requested_by_id,
  verified_by_id,verified_at,client_mutation_id
) VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),pg_temp.u(502),'2026-02-01','2026-03-01','Seeded request by the M&E officer.',
   'PENDING',pg_temp.u(102),NULL,NULL,pg_temp.u(951)),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),pg_temp.u(503),'2026-02-01','2026-03-01','Seeded request awaiting decision.',
   'VERIFIED',pg_temp.u(101),pg_temp.u(102),now(),pg_temp.u(952)),
  (pg_temp.u(603),pg_temp.u(1),pg_temp.u(301),pg_temp.u(504),'2026-02-01','2026-03-01','Seeded request awaiting review.',
   'PENDING',pg_temp.u(101),NULL,NULL,pg_temp.u(953));
SET LOCAL session_replication_role = origin;

-- Assertion 1: the assigned PO inserts a PENDING row for themself; another user's id is rejected by RLS.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(1);
INSERT INTO pathways.activity_extension_requests(
  organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,requested_by_id,client_mutation_id
) VALUES(pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),'2026-02-01','2026-03-01','Delivery partner needs more time.',pg_temp.u(101),pg_temp.u(901));
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_extension_requests
  WHERE activity_id=pg_temp.u(501) AND status='PENDING' AND requested_by_id=pg_temp.u(101)),
  '1a PO with activities.proof.submit inserts a PENDING request for themself');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_extension_requests(
  organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,requested_by_id,client_mutation_id
 ) VALUES(%L,%L,%L,'2026-02-01','2026-03-01','Spoofing another requester id.',%L,%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(505),pg_temp.u(102),pg_temp.u(902)),
  '42501','row-level security','1b inserting with another user id is denied by RLS');

-- Assertion 2: a second open request for the same activity hits the partial unique index.
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_extension_requests(
  organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,requested_by_id,client_mutation_id
 ) VALUES(%L,%L,%L,'2026-02-01','2026-04-01','A second open request for one activity.',%L,%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(101),pg_temp.u(903)),
  '23505','activity_extension_requests_open_key','2 a second PENDING row for the same activity is rejected');

-- Assertion 3: the date CHECK and the reason CHECK.
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_extension_requests(
  organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,requested_by_id,client_mutation_id
 ) VALUES(%L,%L,%L,'2026-02-01','2026-02-01','Requested date is not later.',%L,%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(505),pg_temp.u(101),pg_temp.u(904)),
  '23514','activity_extension_requests_date_check','3a requested_end_date not after current_end_date fails the date CHECK');
SELECT pg_temp.reject(format($i$INSERT INTO pathways.activity_extension_requests(
  organization_id,project_id,activity_id,current_end_date,requested_end_date,reason,requested_by_id,client_mutation_id
 ) VALUES(%L,%L,%L,'2026-02-01','2026-03-01','123456789',%L,%L)$i$,
  pg_temp.u(1),pg_temp.u(301),pg_temp.u(505),pg_temp.u(101),pg_temp.u(905)),
  '23514','activity_extension_requests_reason_check','3b a 9 character reason fails the reason CHECK');
RESET ROLE;

-- Assertion 4: separation CHECKs on UPDATE; the acting M&E officer holds evidence.review and signs as themself, so RLS passes.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(2);
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_extension_requests
  SET status='VERIFIED',verified_by_id=%L,verified_at=now(),verification_note='Self verification attempt.'
  WHERE id=%L$i$,pg_temp.u(102),pg_temp.u(601)),
  '23514','activity_extension_requests_verifier_check','4a verified_by_id equal to requested_by_id is rejected');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_extension_requests
  SET status='APPROVED',decided_by_id=%L,decided_at=now(),decision_note='Self decision attempt.'
  WHERE id=%L$i$,pg_temp.u(102),pg_temp.u(602)),
  '23514','activity_extension_requests_decider_check','4b decided_by_id equal to verified_by_id is rejected');
-- The legitimate path: the M&E officer verifies, then the PM decides.
UPDATE pathways.activity_extension_requests
  SET status='VERIFIED',verified_by_id=pg_temp.u(102),verified_at=now(),verification_note='Verified against the work plan.'
  WHERE id=pg_temp.u(603);
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_extension_requests WHERE id=pg_temp.u(603) AND status='VERIFIED'),
  '4c the M&E officer can verify a pending request');
SELECT pg_temp.act_as(3);
UPDATE pathways.activity_extension_requests
  SET status='APPROVED',decided_by_id=pg_temp.u(103),decided_at=now(),decision_note='Approved by the manager.'
  WHERE id=pg_temp.u(602);
SELECT pg_temp.ok((SELECT count(*)=1 FROM pathways.activity_extension_requests WHERE id=pg_temp.u(602) AND status='APPROVED'),
  '4d the Project Manager can approve a verified request');
SELECT pg_temp.reject(format($i$UPDATE pathways.activity_extension_requests
  SET status='PENDING',verified_by_id=NULL,verified_at=NULL,decided_by_id=NULL,decided_at=NULL,decision_note=NULL
  WHERE id=%L$i$,pg_temp.u(602)),
  '23514','cannot move from APPROVED to PENDING','4e an approved request cannot be reset to PENDING');
RESET ROLE;

-- Assertion 5: no DELETE, and no UPDATE on request content.
SELECT pg_temp.ok(NOT has_table_privilege('pathways_runtime','pathways.activity_extension_requests','DELETE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','reason','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','requested_end_date','UPDATE'),
  '5 pathways_runtime has no DELETE and no UPDATE on reason or requested_end_date');

-- Assertion 6: a user without activities.read on the project sees nothing.
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.act_as(4);
SELECT pg_temp.ok((SELECT count(*)=0 FROM pathways.activity_extension_requests),
  '6a a user without activities.read on the project sees 0 rows');
SELECT pg_temp.act_as(1);
SELECT pg_temp.ok((SELECT count(*)>=1 FROM pathways.activity_extension_requests),
  '6b an assigned user with activities.read sees the rows');
RESET ROLE;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM aer_results;
 IF total<>13 THEN RAISE EXCEPTION '0061 activity-extension-requests checks expected 13 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_EXTENSION_REQUESTS_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
