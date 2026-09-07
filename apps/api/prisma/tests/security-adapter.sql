-- Local synthetic security-adapter tests. No hosted database is permitted.
-- Apply the reviewed local TEMP privilege adapter before this suite.
-- All Auth/profile/business fixtures are rolled back. No real identities used.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '^pathways_phase4_[a-z0-9_]+$'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres' OR session_user <> 'postgres'
     OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Only disposable loopback Phase 4 databases under local postgres are permitted';
  END IF;
  IF has_database_privilege('pathways_runtime',current_database(),'TEMPORARY') THEN
    RAISE EXCEPTION 'Apply and verify the reviewed local TEMP privilege adapter first';
  END IF;
END
$guard$;

-- No pg_temp helpers are used: the runtime TEMP rejection must be tested before
-- this session has initialized a temporary schema using administrator authority.
INSERT INTO auth.users(id) VALUES
 ('40000000-0000-4000-8000-000000001011'),
 ('40000000-0000-4000-8000-000000001012'),
 ('40000000-0000-4000-8000-000000001013'),
 ('40000000-0000-4000-8000-000000001014'),
 ('40000000-0000-4000-8000-000000001016');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000001','P4_A','Synthetic organization A'),
 ('40000000-0000-4000-8000-000000000002','P4_B','Synthetic organization B');
INSERT INTO pathways.roles(id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000010','P4_FIXTURE','Synthetic local role');
INSERT INTO pathways.permissions(id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000020','P4_FIXTURE_PERMISSION','Synthetic local permission');
INSERT INTO pathways.role_permissions(role_id,permission_id) VALUES
 ('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000020');
INSERT INTO pathways.system_users
 (id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
VALUES
 ('40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000001011','Synthetic actor A','p4a@example.invalid','ACTIVE',now()),
 ('40000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000001012','Synthetic reviewer A','p4review@example.invalid','ACTIVE',now()),
 ('40000000-0000-4000-8000-000000000013','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000001013','Synthetic actor B','p4b@example.invalid','ACTIVE',now()),
 ('40000000-0000-4000-8000-000000000014','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000001014','Synthetic invited actor','p4invited@example.invalid','INVITED',NULL),
 ('40000000-0000-4000-8000-000000000015','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010',NULL,'Synthetic unlinked actor','p4unlinked@example.invalid','ACTIVE',now()),
 ('40000000-0000-4000-8000-000000000016','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000001016','Synthetic FK actor','p4fk@example.invalid','ACTIVE',now());
INSERT INTO pathways.programs(id,organization_id,code,name) VALUES
 ('40000000-0000-4000-8000-000000000090','40000000-0000-4000-8000-000000000002','P4_OTHER','Other organization program');

-- Unlike SET ROLE under an administrator session, local SET SESSION
-- AUTHORIZATION makes negative role-escalation tests use runtime session rights.
SET SESSION AUTHORIZATION pathways_runtime;
DO $context_denials$
DECLARE scenario record; count_rows bigint; caught boolean;
BEGIN
  FOR scenario IN SELECT * FROM (VALUES
    ('missing context','','',''),
    ('malformed organization','not-a-uuid','40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000001011'),
    ('malformed profile','40000000-0000-4000-8000-000000000001','not-a-uuid','40000000-0000-4000-8000-000000001011'),
    ('malformed Auth subject','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011','not-a-uuid'),
    ('missing Auth subject','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011',''),
    ('wrong Auth subject','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000001013'),
    ('wrong organization','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000001011'),
    ('wrong profile','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000001011'),
    ('inactive profile','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000014','40000000-0000-4000-8000-000000001014'),
    ('unlinked profile','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000015','40000000-0000-4000-8000-000000001011')
  ) AS cases(label,organization_id,user_id,subject) LOOP
    PERFORM set_config('app.organization_id',scenario.organization_id,true);
    PERFORM set_config('app.user_id',scenario.user_id,true);
    PERFORM set_config('request.jwt.claim.sub',scenario.subject,true);
    PERFORM set_config('request.jwt.claims','{}',true);
    IF pathways.runtime_context_organization() IS NOT NULL
       OR pathways.runtime_context_user() IS NOT NULL THEN
      RAISE EXCEPTION 'Context denial failed: %',scenario.label;
    END IF;
    SELECT count(*) INTO count_rows FROM pathways.system_users;
    IF count_rows<>0 OR EXISTS(SELECT FROM pathways.roles) THEN
      RAISE EXCEPTION 'Fail-closed SELECT failed: %',scenario.label;
    END IF;
    caught:=false;
    BEGIN
      INSERT INTO pathways.programs(organization_id,code,name)
      VALUES('40000000-0000-4000-8000-000000000001','P4_DENIED','Must not persist');
    EXCEPTION WHEN insufficient_privilege THEN caught:=true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Fail-closed INSERT failed: %',scenario.label; END IF;
  END LOOP;
  RAISE NOTICE 'PASS: 10 invalid/missing/inactive context cases deny helpers, SELECT and INSERT';
END
$context_denials$;

SELECT set_config('app.organization_id','40000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.user_id','40000000-0000-4000-8000-000000000011',true);
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000001011',true);

DO $valid_context$
DECLARE item record; table_count integer:=0; row_count bigint; touched bigint;
BEGIN
  IF current_user<>'pathways_runtime' OR session_user<>'pathways_runtime'
     OR pathways.runtime_context_organization() IS DISTINCT FROM '40000000-0000-4000-8000-000000000001'::uuid
     OR pathways.runtime_context_user() IS DISTINCT FROM '40000000-0000-4000-8000-000000000011'::uuid THEN
    RAISE EXCEPTION 'Verified synthetic runtime context did not resolve';
  END IF;
  FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relkind='r' ORDER BY c.relname LOOP
    EXECUTE format('SELECT count(*) FROM pathways.%I',item.relname) INTO row_count;
    table_count:=table_count+1;
  END LOOP;
  IF table_count<>39 THEN RAISE EXCEPTION 'Expected SELECT coverage for 39 tables'; END IF;
  IF (SELECT count(*) FROM pathways.organizations)<>1
     OR (SELECT count(*) FROM pathways.roles)<>1
     OR (SELECT count(*) FROM pathways.permissions)<>1
     OR (SELECT count(*) FROM pathways.role_permissions)<>1
     OR EXISTS(SELECT FROM pathways.system_users WHERE organization_id='40000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Scoped/reference SELECT visibility differs';
  END IF;
  UPDATE pathways.programs SET name='Forbidden cross-organization update'
    WHERE id='40000000-0000-4000-8000-000000000090';
  GET DIAGNOSTICS touched=ROW_COUNT;
  IF touched<>0 THEN RAISE EXCEPTION 'Cross-organization UPDATE reached a row'; END IF;
  -- This exercises UPDATE(id) + UPDATE-policy USING without modifying profiles.
  PERFORM id FROM pathways.system_users
    WHERE id='40000000-0000-4000-8000-000000000012' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Same-organization actor row lock failed'; END IF;
  RAISE NOTICE 'PASS: all 39 SELECT paths, global references, organization isolation and actor row lock';
END
$valid_context$;

-- Actual runtime writes, including invoker actor-profile locking.
INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id)
VALUES('40000000-0000-4000-8000-000000000091','40000000-0000-4000-8000-000000000001','P4_PROGRAM','Runtime program','40000000-0000-4000-8000-000000000011');
UPDATE pathways.programs SET name='Runtime program updated' WHERE id='40000000-0000-4000-8000-000000000091';
INSERT INTO pathways.projects(id,organization_id,program_id,code,title,created_by_id)
VALUES('40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000091','P4_PROJECT','Runtime project','40000000-0000-4000-8000-000000000011');
UPDATE pathways.projects SET title='Runtime project updated' WHERE id='40000000-0000-4000-8000-000000000101';
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
VALUES('40000000-0000-4000-8000-000000000201','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000012');
INSERT INTO pathways.project_budget_records(id,organization_id,project_id,category,currency,planned_budget,recorded_by_id)
VALUES('40000000-0000-4000-8000-000000000401','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','Synthetic category','PHP',1000,'40000000-0000-4000-8000-000000000011');
INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id)
VALUES('40000000-0000-4000-8000-000000000411','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000401','Synthetic pending expense',25,current_date,'40000000-0000-4000-8000-000000000011');
INSERT INTO pathways.evidence_media(id,organization_id,project_id,expense_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id)
VALUES('40000000-0000-4000-8000-000000000421','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000411','DOCUMENT','Synthetic.pdf','pathways-private','organizations/40000000-0000-4000-8000-000000000001/projects/40000000-0000-4000-8000-000000000101/evidence/40000000-0000-4000-8000-000000000421/synthetic.pdf',repeat('a',64),10,'application/pdf','40000000-0000-4000-8000-000000000011');
INSERT INTO pathways.audit_logs(id,organization_id,actor_user_id,project_id,action,entity_type)
VALUES('40000000-0000-4000-8000-000000000501','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000101','SYNTHETIC_TEST','project');

-- Rule evaluation exercises nested EXECUTE grants and the immutable alert
-- FOR SHARE prerequisite used by an actual decision recommendation insert.
INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id)
VALUES('40000000-0000-4000-8000-000000000701','40000000-0000-4000-8000-000000000001','P4_RULE',1,'Synthetic rule','COMBINED_CONDITION','ALL','40000000-0000-4000-8000-000000000011');
INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold)
VALUES('40000000-0000-4000-8000-000000000711','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000701',1,'KPI_ACHIEVEMENT_PERCENT','LT',50);
INSERT INTO pathways.alert_rule_recommendations(id,organization_id,rule_id,title,text,type,created_by_id)
VALUES('40000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000701','Synthetic review','Human review required','REVIEW_PROMPT','40000000-0000-4000-8000-000000000011');
UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id='40000000-0000-4000-8000-000000000012',activated_at=now()
WHERE id='40000000-0000-4000-8000-000000000701';
INSERT INTO pathways.rule_based_alerts(id,organization_id,project_id,rule_id,title,message,severity,observed_values,evaluated_snapshot,evaluated_by_id)
VALUES('40000000-0000-4000-8000-000000000741','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000701','Synthetic alert','Human review required','LOW','{"KPI_ACHIEVEMENT_PERCENT":40}','{}','40000000-0000-4000-8000-000000000011');
INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,alert_id,source_rule_recommendation_id,title,text,basis,proposed_by_id)
VALUES('40000000-0000-4000-8000-000000000751','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000741','40000000-0000-4000-8000-000000000731','Ignored','Ignored','COMBINED','40000000-0000-4000-8000-000000000011');

DO $actual_writes$
BEGIN
  IF NOT EXISTS(SELECT FROM pathways.programs WHERE id='40000000-0000-4000-8000-000000000091' AND name='Runtime program updated')
    OR NOT EXISTS(SELECT FROM pathways.projects WHERE id='40000000-0000-4000-8000-000000000101' AND title='Runtime project updated')
    OR NOT EXISTS(SELECT FROM pathways.evidence_media WHERE id='40000000-0000-4000-8000-000000000421')
    OR NOT EXISTS(SELECT FROM pathways.audit_logs WHERE id='40000000-0000-4000-8000-000000000501')
    OR NOT EXISTS(SELECT FROM pathways.decision_recommendations WHERE id='40000000-0000-4000-8000-000000000751' AND title='Synthetic review')
    OR (SELECT actual_spending FROM pathways.p3_budget_totals('40000000-0000-4000-8000-000000000401'))<>0 THEN
    RAISE EXCEPTION 'Actual runtime invoker DML verification failed';
  END IF;
  RAISE NOTICE 'PASS: actual runtime project, assignment, finance/evidence, audit, rule, alert and decision DML';
END
$actual_writes$;

DO $negative_privileges$
DECLARE test record; caught boolean; actual_code text; checked integer:=0;
BEGIN
  FOR test IN SELECT * FROM (VALUES
    ('cross-org INSERT',$q$INSERT INTO pathways.programs(organization_id,code,name) VALUES('40000000-0000-4000-8000-000000000002','P4_CROSS','Forbidden')$q$,'42501'),
    ('scope reassignment',$q$UPDATE pathways.programs SET organization_id='40000000-0000-4000-8000-000000000002' WHERE id='40000000-0000-4000-8000-000000000091'$q$,'23514'),
    ('profile UPDATE id denied',$q$UPDATE pathways.system_users SET id=id WHERE id='40000000-0000-4000-8000-000000000011'$q$,'42501'),
    ('profile authority UPDATE denied',$q$UPDATE pathways.system_users SET role_id=role_id WHERE id='40000000-0000-4000-8000-000000000011'$q$,'42501'),
    ('profile provisioning denied',$q$INSERT INTO pathways.system_users(organization_id,role_id,full_name,email) VALUES('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','Forbidden','forbidden@example.invalid')$q$,'42501'),
    ('role INSERT denied',$q$INSERT INTO pathways.roles(code,name) VALUES('P4_FORBIDDEN','Forbidden')$q$,'42501'),
    ('permission INSERT denied',$q$INSERT INTO pathways.permissions(code,name) VALUES('P4_FORBIDDEN','Forbidden')$q$,'42501'),
    ('role-permission UPDATE denied',$q$UPDATE pathways.role_permissions SET permission_id=permission_id$q$,'42501'),
    ('organization UPDATE denied',$q$UPDATE pathways.organizations SET name=name$q$,'42501'),
    ('audit UPDATE denied',$q$UPDATE pathways.audit_logs SET action='FORGED' WHERE id='40000000-0000-4000-8000-000000000501'$q$,'42501'),
    ('audit DELETE denied',$q$DELETE FROM pathways.audit_logs WHERE id='40000000-0000-4000-8000-000000000501'$q$,'42501'),
    ('audit actor impersonation denied',$q$INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type) VALUES('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000012','FORGED','test')$q$,'42501'),
    ('evaluated alert rewrite denied',$q$UPDATE pathways.rule_based_alerts SET id=id WHERE id='40000000-0000-4000-8000-000000000741'$q$,'23514'),
    ('CREATE TEMP denied',$q$CREATE TEMP TABLE phase4_forbidden_temp(id integer)$q$,'42501'),
    ('CREATE TABLE pathways denied',$q$CREATE TABLE pathways.phase4_forbidden_table(id integer)$q$,'42501'),
    ('CREATE TABLE public denied',$q$CREATE TABLE public.phase4_forbidden_table(id integer)$q$,'42501'),
    ('CREATE SCHEMA denied',$q$CREATE SCHEMA phase4_forbidden_schema$q$,'42501'),
    ('CREATE ROLE denied',$q$CREATE ROLE phase4_forbidden_role NOLOGIN$q$,'42501'),
    ('ALTER TABLE denied',$q$ALTER TABLE pathways.programs ADD COLUMN phase4_forbidden integer$q$,'42501'),
    ('DISABLE RLS denied',$q$ALTER TABLE pathways.programs DISABLE ROW LEVEL SECURITY$q$,'42501'),
    ('TRUNCATE denied',$q$TRUNCATE pathways.audit_logs$q$,'42501'),
    ('ownership transfer denied',$q$ALTER TABLE pathways.programs OWNER TO pathways_runtime$q$,'42501'),
    ('SET ROLE prisma denied',$q$SET ROLE prisma$q$,'42501'),
    ('SET ROLE postgres denied',$q$SET ROLE postgres$q$,'42501'),
    ('Auth identity SELECT denied',$q$SELECT count(*) FROM auth.users$q$,'42501'),
    ('migration ledger SELECT denied',$q$SELECT count(*) FROM public._prisma_migrations$q$,'42501')
  ) AS cases(label,command,expected) LOOP
    caught:=false;
    BEGIN
      EXECUTE test.command;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS actual_code=RETURNED_SQLSTATE;
      IF actual_code<>test.expected THEN
        RAISE EXCEPTION 'Negative test % expected SQLSTATE %, got %',test.label,test.expected,actual_code;
      END IF;
      caught:=true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Negative test unexpectedly succeeded: %',test.label; END IF;
    checked:=checked+1;
  END LOOP;
  RAISE NOTICE 'PASS: % explicit negative DML/DDL/ownership/API-boundary tests',checked;
END
$negative_privileges$;
RESET SESSION AUTHORIZATION;

-- Fresh authoritative database state is checked on each statement.
UPDATE pathways.roles SET is_active=false WHERE id='40000000-0000-4000-8000-000000000010';
SET SESSION AUTHORIZATION pathways_runtime;
DO $$ BEGIN
  IF pathways.runtime_context_organization() IS NOT NULL OR EXISTS(SELECT FROM pathways.projects) THEN
    RAISE EXCEPTION 'Inactive canonical role must deny context and reads';
  END IF;
END $$;
RESET SESSION AUTHORIZATION;
UPDATE pathways.roles SET is_active=true WHERE id='40000000-0000-4000-8000-000000000010';
UPDATE pathways.organizations SET status='INACTIVE' WHERE id='40000000-0000-4000-8000-000000000001';
SET SESSION AUTHORIZATION pathways_runtime;
DO $$ BEGIN
  IF pathways.runtime_context_organization() IS NOT NULL OR EXISTS(SELECT FROM pathways.projects) THEN
    RAISE EXCEPTION 'Inactive organization must deny context and reads';
  END IF;
END $$;
RESET SESSION AUTHORIZATION;
UPDATE pathways.organizations SET status='ACTIVE' WHERE id='40000000-0000-4000-8000-000000000001';

-- API-role checks retain valid synthetic claims: role grants still deny access.
DO $api_roles$
DECLARE role_name text; command text; caught boolean; checked integer:=0;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
    FOREACH command IN ARRAY ARRAY[
      'SELECT count(*) FROM pathways.organizations',
      'SELECT pathways.runtime_context_organization()',
      'SELECT pathways.p3_budget_totals(''40000000-0000-4000-8000-000000000401''::uuid)'
    ] LOOP
      caught:=false;
      BEGIN EXECUTE command;
      EXCEPTION WHEN insufficient_privilege THEN caught:=true;
      END;
      IF NOT caught THEN RAISE EXCEPTION 'API-role access unexpectedly succeeded: %',role_name; END IF;
      checked:=checked+1;
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;
  RAISE NOTICE 'PASS: % API-role table/context/domain-helper denials',checked;
END
$api_roles$;

-- Delete only the synthetic local Auth fixture with no assignment/history.
DELETE FROM auth.users WHERE id='40000000-0000-4000-8000-000000001016';
DO $auth_fk$
BEGIN
  IF NOT EXISTS(SELECT FROM pathways.system_users
                WHERE id='40000000-0000-4000-8000-000000000016' AND auth_user_id IS NULL) THEN
    RAISE EXCEPTION 'Auth FK ON DELETE SET NULL did not preserve the application profile';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE id IN
      ('40000000-0000-4000-8000-000000001011','40000000-0000-4000-8000-000000001012',
       '40000000-0000-4000-8000-000000001013','40000000-0000-4000-8000-000000001014'))<>4 THEN
    RAISE EXCEPTION 'Unrelated synthetic Auth identities changed';
  END IF;
  RAISE NOTICE 'PASS: local-only Auth deletion nulls FK and preserves profile/other identities';
END
$auth_fk$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;

-- Same physical connection, next transaction: SET LOCAL context must not leak.
BEGIN;
SET SESSION AUTHORIZATION pathways_runtime;
DO $transaction_isolation$
BEGIN
  IF nullif(current_setting('app.organization_id',true),'') IS NOT NULL
    OR nullif(current_setting('app.user_id',true),'') IS NOT NULL
    OR nullif(current_setting('request.jwt.claim.sub',true),'') IS NOT NULL
    OR pathways.runtime_context_organization() IS NOT NULL
    OR pathways.runtime_context_user() IS NOT NULL THEN
    RAISE EXCEPTION 'Transaction-local context leaked after rollback';
  END IF;
  RAISE NOTICE 'PASS: request context absent in next transaction';
END
$transaction_isolation$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
DO $preserved$
DECLARE item record; has_rows boolean;
BEGIN
  FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relkind='r' LOOP
    EXECUTE format('SELECT EXISTS(SELECT FROM pathways.%I)',item.relname) INTO has_rows;
    IF has_rows THEN RAISE EXCEPTION 'Synthetic data remained after rollback in %',item.relname; END IF;
  END LOOP;
  IF EXISTS(SELECT FROM auth.users WHERE id::text LIKE '40000000-0000-4000-8000-%') THEN
    RAISE EXCEPTION 'Synthetic Auth data remained after rollback';
  END IF;
  RAISE NOTICE 'PASS: all 39 tables empty and synthetic Auth fixtures absent after rollback';
END
$preserved$;
