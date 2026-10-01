-- 0053 expense submit race; forward migration (developer decision 2026-10-01).
-- Two concurrent pathways.p34_submit_expense calls with the same client request id both missed the
-- replay SELECT and the loser failed on expenses_client_request_key with 23505. The function now
-- catches that unique_violation (only for that index), returns the committed expense when its stored
-- input matches, and keeps the 22023 conflict when it differs. Owner finance_operation_owner,
-- SECURITY DEFINER, search_path, row_security, signature and ACL stay identical to 0034.
-- DBA prerequisite: run hosted-expense-submit-preprovision.sql first (a temporary SET-only membership
-- from prisma to finance_operation_owner) and hosted-expense-submit-cleanup.sql afterwards, also after
-- a failure. The schema owner lends CREATE for the one statement and takes it back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0052_signin_password_hook'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0053 requires the verified 0052 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','finance_operation_owner','SET')
 THEN RAISE EXCEPTION '0053 requires the temporary finance_operation_owner SET membership (run hosted-expense-submit-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
 THEN RAISE EXCEPTION '0053 requires the reviewed pathways schema owner'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p34_submit_expense(uuid,uuid,uuid,text,numeric,date)'::pg_catalog.regprocedure;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'finance_operation_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""','row_security=on'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
 THEN RAISE EXCEPTION '0053 requires the reviewed 0034 p34_submit_expense definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0053.submit_acl',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

GRANT CREATE ON SCHEMA pathways TO finance_operation_owner;
SET LOCAL ROLE finance_operation_owner;
CREATE OR REPLACE FUNCTION pathways.p34_submit_expense(wanted_project uuid,request_id uuid,budget_id uuid,expense_description text,expense_amount numeric,on_date date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE org uuid:=pathways.runtime_context_organization(); actor uuid:=pathways.runtime_context_user(); e pathways.budget_expense_entries; b pathways.project_budget_records; cname text;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR request_id IS NULL OR wanted_project IS NULL
  OR NOT pathways.p05_has_project_permission('expenses.submit',wanted_project)
 THEN RAISE EXCEPTION 'Expense submission unavailable' USING ERRCODE='42501'; END IF;
 IF expense_description IS NULL OR length(btrim(expense_description)) NOT BETWEEN 1 AND 2000
  OR expense_amount IS NULL OR expense_amount::text IN('NaN','Infinity','-Infinity') OR expense_amount<=0 OR expense_amount<>round(expense_amount,2)
  OR on_date IS NULL OR on_date<DATE '1900-01-01' OR on_date>DATE '2100-12-31'
 THEN RAISE EXCEPTION 'Invalid expense data' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM pathways.budget_expense_entries WHERE organization_id=org AND submitted_by_id=actor AND client_request_id=request_id;
 IF NOT FOUND THEN
  SELECT * INTO b FROM pathways.project_budget_records WHERE organization_id=org AND project_id=wanted_project AND id=budget_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND OR b.currency<>'PHP' THEN RAISE EXCEPTION 'Expense budget unavailable' USING ERRCODE='42501'; END IF;
  BEGIN
   INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id,client_request_id)
    VALUES(pg_catalog.gen_random_uuid(),org,wanted_project,budget_id,btrim(expense_description),expense_amount,on_date,actor,request_id) RETURNING * INTO e;
   INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id)
    VALUES(org,wanted_project,actor,'EXPENSE_SUBMITTED','BudgetExpenseEntry',e.id::text);
  EXCEPTION WHEN unique_violation THEN
   -- A concurrent submit with the same request id committed first: replay it instead of failing.
   GET STACKED DIAGNOSTICS cname=CONSTRAINT_NAME;
   IF cname IS DISTINCT FROM 'expenses_client_request_key' THEN RAISE; END IF;
   SELECT * INTO e FROM pathways.budget_expense_entries WHERE organization_id=org AND submitted_by_id=actor AND client_request_id=request_id;
   IF NOT FOUND THEN RAISE; END IF;
  END;
 END IF;
 IF ROW(e.project_id,e.budget_record_id,e.description,e.amount,e.expense_date)
  IS DISTINCT FROM ROW(wanted_project,budget_id,btrim(expense_description),expense_amount,on_date)
 THEN RAISE EXCEPTION 'Expense request content conflict' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',e.id,'projectId',e.project_id,'status',e.status,'updatedAt',e.updated_at,'receiptEvidenceId',e.receipt_evidence_id);
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM finance_operation_owner;

DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p34_submit_expense(uuid,uuid,uuid,text,numeric,date)'::pg_catalog.regprocedure;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'finance_operation_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""','row_security=on'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0053.submit_acl')
  OR fn.prosrc NOT LIKE '%expenses_client_request_key%'
 THEN RAISE EXCEPTION '0053 p34_submit_expense postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('finance_operation_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0053 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
