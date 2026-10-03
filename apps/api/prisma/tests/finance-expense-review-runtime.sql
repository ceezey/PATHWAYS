-- Expense review runtime checks: receipt required to verify or approve, distinct reviewers, rejection reason (G-F2-16, G-F2-17).
-- Synthetic rows only; every write is rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'pathways_phase4_phase6_replay' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Finance review checks require the guarded disposable replay target'; END IF;
END $$;
CREATE TEMP TABLE fr_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT,SELECT ON fr_results TO pathways_runtime;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO fr_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO fr_results VALUES(label); RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
-- Acts as one synthetic user for the next review call.
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),set_config('app.organization_id',pg_temp.u(1)::text,true),
  set_config('app.user_id',pg_temp.u(100+n)::text,true) $$;
CREATE TEMP TABLE fr_rev(id uuid PRIMARY KEY,at timestamptz);
GRANT SELECT ON fr_rev TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text), pg_temp.reject(text,text,text), pg_temp.u(integer), pg_temp.act(integer) TO pathways_runtime;

-- Users: 1 submitter, 2 verifier, 3 second reviewer, 4 approver; every role holds every review grant so only distinctness decides.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,4) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'FR_ORG','Synthetic review org');
INSERT INTO pathways.roles(code,name) VALUES
 ('PROJECT_OFFICER','Project Officer'),('PROJECT_MANAGER','Project Manager'),
 ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),('PROGRAM_MANAGER','Program Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),v.nm,v.em,'ACTIVE',now()
FROM (VALUES(1,'PROJECT_OFFICER','FR submitter','fr1@example.invalid'),(2,'MONITORING_AND_EVALUATION_OFFICER','FR verifier','fr2@example.invalid'),
 (3,'PROGRAM_MANAGER','FR reviewer','fr3@example.invalid'),(4,'PROJECT_MANAGER','FR approver','fr4@example.invalid')) v(n,rc,nm,em)
JOIN pathways.roles r ON r.code=v.rc;
INSERT INTO pathways.permissions(code,name)
SELECT c,c FROM unnest(ARRAY['expenses.submit','expenses.read','expenses.verify','expenses.approve']) c ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code IN('PROJECT_OFFICER','PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER','PROGRAM_MANAGER')
 AND p.code IN('expenses.submit','expenses.read','expenses.verify','expenses.approve')
ON CONFLICT DO NOTHING;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES(pg_temp.u(301),pg_temp.u(1),'FR-1','FR Project',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(400+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(100+n),pg_temp.u(101) FROM generate_series(1,4) n;
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id)
VALUES(pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'Venue','PHP',5000,pg_temp.u(101));
SET LOCAL session_replication_role = origin;

-- Two expenses submitted through the real function: 601 gets a receipt, 602 is used for rejection checks.
CREATE TEMP TABLE fr_submit(n integer,r jsonb);
GRANT INSERT,SELECT ON fr_submit TO pathways_runtime;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act(1);
INSERT INTO fr_submit SELECT 1,pathways.p34_submit_expense(pg_temp.u(301),pg_temp.u(901),pg_temp.u(501),'Venue',1500.00,DATE '2026-09-30');
INSERT INTO fr_submit SELECT 2,pathways.p34_submit_expense(pg_temp.u(301),pg_temp.u(902),pg_temp.u(501),'Meals',300.00,DATE '2026-09-30');
RESET SESSION AUTHORIZATION;
CREATE TEMP TABLE fr_ids AS SELECT n,(r->>'id')::uuid id FROM fr_submit;
GRANT SELECT ON fr_ids TO pathways_runtime;
INSERT INTO fr_rev SELECT id,updated_at FROM pathways.budget_expense_entries WHERE id IN(SELECT id FROM fr_ids);

-- G-F2-16: verifying without a stored private receipt is refused.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act(2);
SELECT pg_temp.reject($q$SELECT pathways.p34_review_expense(pg_temp.u(301),(SELECT id FROM fr_ids WHERE n=1),(SELECT at FROM fr_rev r JOIN fr_ids i USING(id) WHERE i.n=1),'VERIFY')$q$,
 '23514','Verify without receipt is refused');
-- G-F2-17: the submitter cannot review their own expense.
SELECT pg_temp.act(1);
SELECT pg_temp.reject($q$SELECT pathways.p34_review_expense(pg_temp.u(301),(SELECT id FROM fr_ids WHERE n=1),(SELECT at FROM fr_rev r JOIN fr_ids i USING(id) WHERE i.n=1),'VERIFY')$q$,
 '42501','Submitter cannot verify own expense');
-- Rejection requires a reason.
SELECT pg_temp.act(2);
SELECT pg_temp.reject($q$SELECT pathways.p34_review_expense(pg_temp.u(301),(SELECT id FROM fr_ids WHERE n=2),(SELECT at FROM fr_rev r JOIN fr_ids i USING(id) WHERE i.n=2),'REJECT','  ')$q$,
 '22023','Rejection without reason is refused');
RESET SESSION AUTHORIZATION;

-- Attach a stored private receipt to expense 601 by fixture; the upload path is outside this suite.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.evidence_media(id,organization_id,project_id,expense_id,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,storage_ready)
SELECT pg_temp.u(701),pg_temp.u(1),pg_temp.u(301),id,'receipt.pdf','pathways-private',
 'organizations/'||pg_temp.u(1)||'/projects/'||pg_temp.u(301)||'/evidence/'||pg_temp.u(701)||'/receipt.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(101),true
FROM fr_ids WHERE n=1;
UPDATE pathways.budget_expense_entries SET receipt_evidence_id=pg_temp.u(701) WHERE id=(SELECT id FROM fr_ids WHERE n=1);
SET LOCAL session_replication_role = origin;
UPDATE fr_rev SET at=e.updated_at FROM pathways.budget_expense_entries e WHERE e.id=fr_rev.id;

CREATE TEMP TABLE fr_out(step text,r jsonb);
GRANT INSERT,SELECT ON fr_out TO pathways_runtime;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act(2);
INSERT INTO fr_out SELECT 'verify',pathways.p34_review_expense(pg_temp.u(301),(SELECT id FROM fr_ids WHERE n=1),(SELECT at FROM fr_rev r JOIN fr_ids i USING(id) WHERE i.n=1),'VERIFY');
SELECT pg_temp.ok((SELECT r->>'status' FROM fr_out WHERE step='verify')='VERIFIED','Verify with stored receipt succeeds');
-- G-F2-17: the verifier cannot also approve.
SELECT pg_temp.reject(format($q$SELECT pathways.p34_review_expense(pg_temp.u(301),%L,%L::timestamptz,'APPROVE')$q$,
 (SELECT id FROM fr_ids WHERE n=1),(SELECT r->>'updatedAt' FROM fr_out WHERE step='verify')),'42501','Verifier cannot approve the same expense');
SELECT pg_temp.act(4);
INSERT INTO fr_out SELECT 'approve',pathways.p34_review_expense(pg_temp.u(301),(SELECT id FROM fr_ids WHERE n=1),(SELECT (r->>'updatedAt')::timestamptz FROM fr_out WHERE step='verify'),'APPROVE');
SELECT pg_temp.ok((SELECT r->>'status' FROM fr_out WHERE step='approve')='APPROVED','Distinct approver approves');
RESET SESSION AUTHORIZATION;

SELECT pg_temp.ok((SELECT verified_by_id=pg_temp.u(102) AND approved_by_id=pg_temp.u(104) FROM pathways.budget_expense_entries WHERE id=(SELECT id FROM fr_ids WHERE n=1)),
 'Approved expense records distinct verifier and approver');

DO $$ BEGIN IF (SELECT count(*) FROM fr_results)<>7 THEN RAISE EXCEPTION 'Finance review runtime expected 7 checks'; END IF; END $$;
SELECT 'FINANCE_EXPENSE_REVIEW_RUNTIME=PASS' AS result;
ROLLBACK;
