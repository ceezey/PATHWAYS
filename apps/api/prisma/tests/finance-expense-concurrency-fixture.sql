-- Committed synthetic fixtures for finance-expense-concurrency.mjs (0034 p34_submit_expense).
-- Load only into a disposable local replay clone as postgres; never a hosted or shared database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^pathways_phase[24]_[a-z0-9_]+$' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR current_user<>'postgres' THEN RAISE EXCEPTION 'Disposable local database required'; END IF;
END $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES('7c000000-0000-4000-8000-000000000201');
INSERT INTO pathways.organizations(id,code,name) VALUES('7c000000-0000-4000-8000-000000000001','FXC_ORG','Synthetic expense race org');
INSERT INTO pathways.roles(code,name) VALUES('PROJECT_MANAGER','Project Manager') ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT '7c000000-0000-4000-8000-000000000101','7c000000-0000-4000-8000-000000000001',r.id,'7c000000-0000-4000-8000-000000000201',
 'FXC manager','fxc-pm@example.invalid','ACTIVE',now() FROM pathways.roles r WHERE r.code='PROJECT_MANAGER';
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id)
VALUES('7c000000-0000-4000-8000-000000000301','7c000000-0000-4000-8000-000000000001','FXC-1','FXC Project','7c000000-0000-4000-8000-000000000101');
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES('7c000000-0000-4000-8000-000000000401','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000301',
 '7c000000-0000-4000-8000-000000000101','7c000000-0000-4000-8000-000000000101');
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id)
VALUES('7c000000-0000-4000-8000-000000000501','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000301',
 'Venue','PHP',50000,'7c000000-0000-4000-8000-000000000101');
COMMIT;
