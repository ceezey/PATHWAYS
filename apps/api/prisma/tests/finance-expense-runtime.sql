-- Expense submission replay and once-per-expense sign-off runtime checks (0034).
-- Synthetic rows only; every write is rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'pathways_phase4_phase6_replay' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>55448 OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Finance expense checks require the guarded disposable replay target'; END IF;
END $$;
CREATE TEMP TABLE fx_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT,SELECT ON fx_results TO pathways_runtime;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO fx_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO fx_results VALUES(label); RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text), pg_temp.reject(text,text,text), pg_temp.u(integer) TO pathways_runtime;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,4) n;
INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'FX_ORG','Synthetic finance org');
INSERT INTO pathways.roles(code,name) VALUES
 ('PROJECT_OFFICER','Project Officer'),('PROJECT_MANAGER','Project Manager'),
 ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),('PROGRAM_MANAGER','Program Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),pg_temp.u(1),r.id,pg_temp.u(200+v.n),v.nm,v.em,'ACTIVE',now()
FROM (VALUES(1,'PROJECT_OFFICER','FX submitter','fx1@example.invalid'),(2,'MONITORING_AND_EVALUATION_OFFICER','FX verifier','fx2@example.invalid'),
 (3,'PROGRAM_MANAGER','FX signoff','fx3@example.invalid'),(4,'PROJECT_MANAGER','FX approver','fx4@example.invalid')) v(n,rc,nm,em)
JOIN pathways.roles r ON r.code=v.rc;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES(pg_temp.u(301),pg_temp.u(1),'FX-1','FX Project',pg_temp.u(101));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(400+n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(100+n),pg_temp.u(101) FROM generate_series(1,4) n;
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id)
VALUES(pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'Venue','PHP',5000,pg_temp.u(101));
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE fx_submit(n integer,r jsonb);
GRANT INSERT,SELECT ON fx_submit TO pathways_runtime;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
INSERT INTO fx_submit SELECT 1,pathways.p34_submit_expense(pg_temp.u(301),pg_temp.u(901),pg_temp.u(501),'Venue',1500.00,DATE '2026-09-30');
INSERT INTO fx_submit SELECT 2,pathways.p34_submit_expense(pg_temp.u(301),pg_temp.u(901),pg_temp.u(501),'Venue',1500.00,DATE '2026-09-30');
SELECT pg_temp.ok((SELECT r->>'id' FROM fx_submit WHERE n=1)=(SELECT r->>'id' FROM fx_submit WHERE n=2),'Expense replay returns the same id');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.budget_expense_entries WHERE project_id=pg_temp.u(301))=1,'Expense replay writes one row');
SELECT pg_temp.reject(format($q$SELECT pathways.p34_submit_expense(%L,%L,%L,'Venue',9999.00,DATE '2026-09-30')$q$,pg_temp.u(301),pg_temp.u(901),pg_temp.u(501)),'22023','Same request id with different input is rejected');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM pathways.audit_logs WHERE entity_type='BudgetExpenseEntry' AND action='EXPENSE_SUBMITTED' AND organization_id=pg_temp.u(1))=1,'Expense replay writes one audit row');

-- Approve by fixture; the receipt-bearing review path is outside this suite.
SET LOCAL session_replication_role = replica;
UPDATE pathways.budget_expense_entries SET status='APPROVED',verified_by_id=pg_temp.u(102),verified_at=submitted_at+interval '1 second',
 approved_by_id=pg_temp.u(104),approved_at=submitted_at+interval '2 seconds' WHERE project_id=pg_temp.u(301);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub',pg_temp.u(203)::text,true),set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(103)::text,true);
INSERT INTO pathways.expense_signoffs(organization_id,project_id,expense_id,signed_off_by_id)
SELECT pg_temp.u(1),pg_temp.u(301),(r->>'id')::uuid,pg_temp.u(103) FROM fx_submit WHERE n=1;
SELECT pg_temp.reject(format($q$INSERT INTO pathways.expense_signoffs(organization_id,project_id,expense_id,signed_off_by_id) VALUES(%L,%L,%L,%L)$q$,
 pg_temp.u(1),pg_temp.u(301),(SELECT (r->>'id')::uuid FROM fx_submit WHERE n=1),pg_temp.u(103)),'23505','Second sign-off for the same expense is rejected');
SELECT pg_temp.ok((SELECT count(*) FROM pathways.expense_signoffs WHERE project_id=pg_temp.u(301))=1,'One sign-off per expense');
SELECT set_config('request.jwt.claim.sub',pg_temp.u(201)::text,true),set_config('app.user_id',pg_temp.u(101)::text,true);
SELECT pg_temp.reject(format($q$INSERT INTO pathways.expense_signoffs(organization_id,project_id,expense_id,signed_off_by_id) VALUES(%L,%L,%L,%L)$q$,
 pg_temp.u(1),pg_temp.u(301),(SELECT (r->>'id')::uuid FROM fx_submit WHERE n=1),pg_temp.u(101)),'42501','Submitter without signoff permission cannot sign off');
RESET ROLE;

DO $$ BEGIN IF (SELECT count(*) FROM fx_results)<>7 THEN RAISE EXCEPTION 'Finance expense runtime expected 7 checks'; END IF; END $$;
SELECT 'FINANCE_EXPENSE_RUNTIME=PASS' AS result;
ROLLBACK;
