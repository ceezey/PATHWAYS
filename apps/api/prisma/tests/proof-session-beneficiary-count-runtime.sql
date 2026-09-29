-- cr-pathways-proof-session-beneficiary-count (migration 0042): behavioral checks for the
-- redefined pathways.p08_activity_beneficiaries_reached, which now sums each activity's
-- APPROVED activity_updates.beneficiaries_reached_this_session values (NULL as 0) instead of
-- counting distinct participating beneficiaries. Synthetic fixtures only; everything rolls
-- back. Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_*
-- replay database that already has 0042 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0042 proof-session-beneficiary-count checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE psc_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON psc_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO psc_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO psc_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('79000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- Two organizations, each with one project; a second project in org A for cross-project
-- isolation. Triggers are off only while writing the parent fixtures (org/project/activity
-- rows and the initial PENDING activity_updates rows); the status transitions and the proof
-- rejection below run with every trigger on, through the ordinary PENDING->APPROVED/REJECTED
-- path enforced by pathways.p05_guard_activity_update.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,8) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
  (pg_temp.u(1),'PSC_ORG_A','Synthetic PSC org A'),
  (pg_temp.u(2),'PSC_ORG_B','Synthetic PSC org B');
INSERT INTO pathways.roles(code,name) VALUES
  ('PROGRAM_MANAGER','Program Manager'),
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(
  id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at
)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
  -- pathways.p09_role_allows never grants PROGRAM_MANAGER plain 'activities.read' (only
  -- PROJECT_MANAGER, PROJECT_OFFICER, MONITORING_AND_EVALUATION_OFFICER and
  -- SYSTEM_ADMINISTRATOR have it), so the aggregate-reading identities below use
  -- PROJECT_MANAGER, the project-scoped role that also holds 'beneficiaries.aggregates.read'.
  (1,pg_temp.u(1),'PROJECT_MANAGER','PSC Aggregate Reader A','psc-reader-a@example.invalid'),
  (2,pg_temp.u(1),'PROJECT_MANAGER','PSC Project Manager A','psc-mgr-a@example.invalid'),
  (3,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','PSC M&E A','psc-me-a@example.invalid'),
  (4,pg_temp.u(1),'PROJECT_OFFICER','PSC Officer A','psc-officer-a@example.invalid'),
  (5,pg_temp.u(2),'PROJECT_MANAGER','PSC Aggregate Reader B','psc-reader-b@example.invalid'),
  (6,pg_temp.u(2),'MONITORING_AND_EVALUATION_OFFICER','PSC M&E B','psc-me-b@example.invalid'),
  (7,pg_temp.u(2),'PROJECT_OFFICER','PSC Officer B','psc-officer-b@example.invalid')
) v(n,org_id,role_code,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

INSERT INTO pathways.permissions(code,name) VALUES
  ('projects.read','projects.read'),
  ('activities.read','activities.read'),
  ('beneficiaries.aggregates.read','beneficiaries.aggregates.read')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN ('PROGRAM_MANAGER','PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
  AND p.code IN ('projects.read','activities.read','beneficiaries.aggregates.read')
ON CONFLICT DO NOTHING;

INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
  (pg_temp.u(301),pg_temp.u(1),'PSC-A1','PSC Project A1','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(302),pg_temp.u(1),'PSC-A2','PSC Project A2','2026-01-01','2026-12-31',pg_temp.u(101)),
  (pg_temp.u(303),pg_temp.u(2),'PSC-B1','PSC Project B1','2026-01-01','2026-12-31',pg_temp.u(105));

-- A PROJECT_MANAGER only gains pathways.p05_has_project_permission for a project through an
-- explicit ACTIVE user_project_assignments row (unlike PROGRAM_MANAGER's portfolio-wide access
-- through a managed program); the aggregate reader identities need one per project they call
-- p08_activity_beneficiaries_reached against.
INSERT INTO pathways.user_project_assignments(
  id,organization_id,project_id,user_id,assigned_by_id
) VALUES
  (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(402),pg_temp.u(1),pg_temp.u(302),pg_temp.u(101),pg_temp.u(101)),
  (pg_temp.u(403),pg_temp.u(2),pg_temp.u(303),pg_temp.u(105),pg_temp.u(105));

INSERT INTO pathways.project_activities(
  id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id
) VALUES
  (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'PSC-ACT-1','Activity with mixed proofs',
   '2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'PSC-ACT-2','Activity with no proofs',
   '2026-01-01','2026-06-30',NULL,'NOT_STARTED',pg_temp.u(101)),
  (pg_temp.u(503),pg_temp.u(1),pg_temp.u(302),'PSC-ACT-3','Activity in the other project',
   '2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(101)),
  (pg_temp.u(504),pg_temp.u(2),pg_temp.u(303),'PSC-ACT-4','Activity in the other organization',
   '2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(105));

-- Activity 501: a PENDING update (excluded), an update that will be APPROVED with a NULL
-- session count (counts as 0), an update that will be APPROVED with 10, an update that will
-- be APPROVED with 7 and then REJECTED (the total must drop), and an update that will be
-- REJECTED outright with 40 (excluded throughout).
INSERT INTO pathways.activity_updates(
  id,organization_id,project_id,activity_id,client_update_id,progress_percent,note,
  beneficiaries_reached_this_session,status,submitted_by_id
) VALUES
  (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(701),20,
   'Pending update',25,'PENDING',pg_temp.u(104)),
  (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(702),30,
   'Approved update, null session count',NULL,'PENDING',pg_temp.u(104)),
  (pg_temp.u(603),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(703),40,
   'Approved update, ten reached',10,'PENDING',pg_temp.u(104)),
  (pg_temp.u(604),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(704),50,
   'Approved then later rejected, seven reached',7,'PENDING',pg_temp.u(104)),
  (pg_temp.u(605),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(705),60,
   'Rejected outright, forty reached',40,'PENDING',pg_temp.u(104));
SET LOCAL session_replication_role = origin;

-- Move each update through the real PENDING -> APPROVED/REJECTED transition the review
-- endpoint uses, so the guard trigger and its immutability rule are exercised, not bypassed.
UPDATE pathways.activity_updates
SET status='APPROVED',reviewed_by_id=pg_temp.u(103),reviewed_at=now(),review_reason='Approved for count'
WHERE id IN (pg_temp.u(602),pg_temp.u(603),pg_temp.u(604));
UPDATE pathways.activity_updates
SET status='REJECTED',reviewed_by_id=pg_temp.u(103),reviewed_at=now(),review_reason='Rejected on submission'
WHERE id=pg_temp.u(605);

-- A CHECK constraint on pathways.activity_updates forbids status='VERIFIED' outright, so a
-- proof review can never leave a row VERIFIED; this proves VERIFIED structurally cannot occur
-- on this table and therefore can never contribute to the sum.
SELECT pg_temp.reject(
  format($i$INSERT INTO pathways.activity_updates(
    organization_id,project_id,activity_id,client_update_id,progress_percent,note,
    beneficiaries_reached_this_session,status,reviewed_by_id,reviewed_at,review_reason,submitted_by_id
  ) VALUES(%L,%L,%L,%L,15,'Verified attempt',99,'VERIFIED',%L,now(),'Verified reason',%L)$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(706),pg_temp.u(103),pg_temp.u(104)),
  '23514','VERIFIED status is rejected by the activity_updates CHECK constraint');

SET LOCAL ROLE pathways_runtime;

-- Project Manager, organization A (via the explicit project assignment).
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);

SELECT pg_temp.ok(
  (SELECT beneficiaries_reached=17
   FROM pathways.p08_activity_beneficiaries_reached(pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501)])),
  'Sums only APPROVED sessions: 0 (null) + 10 + 7 = 17, excluding PENDING(25) and REJECTED(40)');

SELECT pg_temp.ok(
  (SELECT beneficiaries_reached=0
   FROM pathways.p08_activity_beneficiaries_reached(pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(502)])),
  'An activity with no activity_updates rows reports zero, not null');

RESET ROLE;

-- Apply the "approved then rejected" correction as the migration owner. The guard trigger's
-- immutability rule (OLD.status<>'PENDING') means an application-level re-review cannot flip an
-- already-decided row; this models a corrected review record the same way storage-level
-- corrections are written elsewhere in this schema, with triggers off only for this one
-- corrective UPDATE.
SET LOCAL session_replication_role = replica;
UPDATE pathways.activity_updates
SET status='REJECTED',review_reason='Correction: approval reversed after audit'
WHERE id=pg_temp.u(604);
SET LOCAL session_replication_role = origin;
SELECT pg_temp.ok(
  (SELECT status='REJECTED' FROM pathways.activity_updates WHERE id=pg_temp.u(604)),
  'The seven-reached update is now REJECTED after the correction');

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.ok(
  (SELECT beneficiaries_reached=10
   FROM pathways.p08_activity_beneficiaries_reached(pg_temp.u(1),pg_temp.u(301),ARRAY[pg_temp.u(501)])),
  'An approved proof later rejected lowers the total (17 drops to 10)');

RESET ROLE;

-- Cross-project isolation: a request naming an activity from a different project (same
-- organization) than the one supplied is rejected, never silently scoped down.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),
       set_config('app.organization_id',pg_temp.u(1)::text,true),
       set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject(
  format($i$SELECT * FROM pathways.p08_activity_beneficiaries_reached(%L,%L,ARRAY[%L]::uuid[])$i$,
    pg_temp.u(1),pg_temp.u(301),pg_temp.u(503)),
  '42501','Cross-project activity id (other project, same org) is rejected');
SELECT pg_temp.ok(
  (SELECT beneficiaries_reached=0
   FROM pathways.p08_activity_beneficiaries_reached(pg_temp.u(1),pg_temp.u(302),ARRAY[pg_temp.u(503)])),
  'The other project''s own activity is readable and reports its own zero total, unaffected by project A');

-- Cross-organization isolation: organization A cannot resolve organization B's activity, and
-- organization B's own aggregate is computed independently and correctly for its own data.
SELECT pg_temp.reject(
  format($i$SELECT * FROM pathways.p08_activity_beneficiaries_reached(%L,%L,ARRAY[%L]::uuid[])$i$,
    pg_temp.u(1),pg_temp.u(303),pg_temp.u(504)),
  '42501','Cross-organization activity id under organization A''s session context is rejected');
RESET ROLE;

INSERT INTO pathways.activity_updates(
  id,organization_id,project_id,activity_id,client_update_id,progress_percent,note,
  beneficiaries_reached_this_session,status,submitted_by_id
) VALUES(
  pg_temp.u(611),pg_temp.u(2),pg_temp.u(303),pg_temp.u(504),pg_temp.u(711),35,
  'Organization B approved update',9,'PENDING',pg_temp.u(107)
);
UPDATE pathways.activity_updates
SET status='APPROVED',reviewed_by_id=pg_temp.u(106),reviewed_at=now(),review_reason='Approved in org B'
WHERE id=pg_temp.u(611);

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(205)::text,true),
       set_config('app.organization_id',pg_temp.u(2)::text,true),
       set_config('app.user_id',pg_temp.u(105)::text,true);
SELECT pg_temp.ok(
  (SELECT beneficiaries_reached=9
   FROM pathways.p08_activity_beneficiaries_reached(pg_temp.u(2),pg_temp.u(303),ARRAY[pg_temp.u(504)])),
  'Organization B''s own aggregate sums its own approved session independently of organization A');
SELECT pg_temp.reject(
  format($i$SELECT * FROM pathways.p08_activity_beneficiaries_reached(%L,%L,ARRAY[%L]::uuid[])$i$,
    pg_temp.u(2),pg_temp.u(301),pg_temp.u(501)),
  '42501','Organization B cannot resolve organization A''s activity id');
RESET ROLE;

-- Ownership, security mode and grants are unchanged from the 0000 baseline definition.
SELECT pg_temp.ok(
  (SELECT proowner='prisma'::regrole
   FROM pg_proc WHERE oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::regprocedure),
  'aggregate remains owned by prisma');
SELECT pg_temp.ok(
  (SELECT prosecdef AND proconfig=ARRAY['search_path=""']
   FROM pg_proc WHERE oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::regprocedure),
  'aggregate remains controlled-owner SECURITY DEFINER with empty search path');
SELECT pg_temp.ok(
  has_function_privilege('pathways_runtime',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('anon',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('service_role',
    'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE'),
  'aggregate execution remains granted only to runtime');
SELECT pg_temp.ok(
  (SELECT array_agg(parameter_name::text ORDER BY ordinal_position)
   FROM information_schema.parameters
   WHERE specific_schema='pathways'
     AND specific_name LIKE 'p08_activity_beneficiaries_reached_%'
     AND parameter_mode='OUT')=ARRAY['activity_id','beneficiaries_reached'],
  'aggregate still exposes only activity id and integer count (unchanged signature)');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM psc_results;
 IF total<>14 THEN RAISE EXCEPTION '0042 proof-session-beneficiary-count checks expected 14 assertions, recorded %',total; END IF;
 RAISE NOTICE 'PROOF_SESSION_BENEFICIARY_COUNT_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
