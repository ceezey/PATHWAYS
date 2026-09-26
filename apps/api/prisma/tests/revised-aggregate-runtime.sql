-- Synthetic tests only. The harness supplies an isolated loopback cluster.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_rbac_fresh','pathways_phase4_baseline')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55448
 OR current_user<>'postgres' THEN RAISE EXCEPTION 'CSV RBAC tests require disposable replay'; END IF;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('99000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CSV RBAC assertion: %',label; END IF; END $$;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,7) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
 (pg_temp.u(1),'RBAC_A','Synthetic RBAC A'),(pg_temp.u(2),'RBAC_B','Synthetic RBAC B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+n),CASE WHEN n=7 THEN pg_temp.u(2) ELSE pg_temp.u(1) END,r.id,pg_temp.u(200+n),
 'Synthetic RBAC '||n,'rbac-'||n||'@example.invalid','ACTIVE',now()
FROM (VALUES (1,'SYSTEM_ADMINISTRATOR'),(2,'PROJECT_OFFICER'),(3,'MONITORING_AND_EVALUATION_OFFICER'),
 (4,'PROJECT_MANAGER'),(5,'PROGRAM_MANAGER'),(6,'GRANT_MANAGER'),(7,'PROJECT_MANAGER')) v(n,role_code)
JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.programs(id,organization_id,code,name,manager_user_id)
 VALUES(pg_temp.u(10),pg_temp.u(1),'RBAC_PROGRAM','Synthetic program',pg_temp.u(105));
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id,program_id,start_date,end_date) VALUES
 (pg_temp.u(20),pg_temp.u(1),'RBAC_PROJECT','Synthetic project',pg_temp.u(104),NULL,'2026-01-01','2026-02-28'),
 (pg_temp.u(21),pg_temp.u(1),'RBAC_PROGRAM_PROJECT','Synthetic program project',pg_temp.u(104),pg_temp.u(10),'2026-01-01','2026-02-28'),
 (pg_temp.u(22),pg_temp.u(2),'RBAC_FOREIGN','Synthetic foreign project',pg_temp.u(107),NULL,'2026-01-01','2026-02-28');
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(1),pg_temp.u(20),pg_temp.u(100+n),pg_temp.u(101) FROM generate_series(2,6) n;
SELECT set_config('app.organization_id',pg_temp.u(1)::text,true),
 set_config('app.user_id',pg_temp.u(102)::text,true),set_config('request.jwt.claim.sub',pg_temp.u(202)::text,true);
INSERT INTO pathways.beneficiaries(id,organization_id,code,subject_type,display_name,first_name,last_name,consent_recorded,data_processing_consent_recorded,created_by_id)
VALUES(pg_temp.u(30),pg_temp.u(1),'CSV_PERSON','INDIVIDUAL','Synthetic person','Synthetic','Person',true,true,pg_temp.u(102));
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
VALUES(pg_temp.u(31),pg_temp.u(1),pg_temp.u(20),pg_temp.u(30),'2026-01-01',pg_temp.u(102));
INSERT INTO pathways.assessment_results(id,organization_id,project_id,enrollment_id,type,score,maximum_score,assessment_date,recorded_by_id)
VALUES(pg_temp.u(32),pg_temp.u(1),pg_temp.u(20),pg_temp.u(31),'PRE_TEST',5,10,'2026-02-01',pg_temp.u(102));
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name,created_by_id)
VALUES(pg_temp.u(40),pg_temp.u(1),pg_temp.u(20),'CSV_FORM','Synthetic survey',pg_temp.u(102));
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,sequence_no)
VALUES(pg_temp.u(41),pg_temp.u(1),pg_temp.u(20),pg_temp.u(40),'RESPONSE','Synthetic private response','TEXT',1);
UPDATE pathways.digital_forms SET status='PUBLISHED',published_by_id=pg_temp.u(103),published_at=now() WHERE id=pg_temp.u(40);
INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,form_version,client_submission_id,submitted_by_id,submitted_at)
VALUES(pg_temp.u(42),pg_temp.u(1),pg_temp.u(20),pg_temp.u(40),1,pg_temp.u(44),pg_temp.u(102),NULL);
INSERT INTO pathways.form_response_values(id,organization_id,project_id,form_id,submission_id,field_id,value)
VALUES(pg_temp.u(43),pg_temp.u(1),pg_temp.u(20),pg_temp.u(40),pg_temp.u(42),pg_temp.u(41),'"Synthetic private response"'::jsonb);
CREATE FUNCTION pg_temp.reject(sql text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql;
 EXCEPTION WHEN insufficient_privilege THEN RETURN;
 WHEN check_violation THEN
  -- The historical assignment guard hides targets outside the actor's
  -- hierarchy before RLS's WITH CHECK can evaluate the proposed row.
  IF SQLERRM='Active assignment requires an active profile' THEN RETURN; END IF;
  RAISE;
 END;
 RAISE EXCEPTION 'CSV RBAC denial missing: %',label;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO pathways_runtime;
SET LOCAL ROLE pathways_runtime;
DO $$
DECLARE n integer; code text; permission text; expected boolean;
BEGIN
 FOR n IN 1..6 LOOP
  PERFORM set_config('app.organization_id',pg_temp.u(1)::text,true);
  PERFORM set_config('app.user_id',pg_temp.u(100+n)::text,true);
  PERFORM set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true);
  code:=CASE n WHEN 1 THEN 'SYSTEM_ADMINISTRATOR' WHEN 2 THEN 'PROJECT_OFFICER'
    WHEN 3 THEN 'MONITORING_AND_EVALUATION_OFFICER' WHEN 4 THEN 'PROJECT_MANAGER'
    WHEN 5 THEN 'PROGRAM_MANAGER' ELSE 'GRANT_MANAGER' END;
  FOR permission IN SELECT p.code FROM pathways.permissions p LOOP
   expected:=pathways.p09_role_allows(code,permission);
   PERFORM pg_temp.assert_true(pathways.p09_can(permission)=expected,'workspace matrix '||code||' '||permission);
   PERFORM pg_temp.assert_true(pathways.p05_has_project_permission(permission,pg_temp.u(20))=expected,'project matrix '||code||' '||permission);
   PERFORM pg_temp.assert_true(NOT pathways.p05_has_project_permission(permission,pg_temp.u(22)),'cross organization '||code);
   PERFORM pg_temp.assert_true(pathways.p05_has_project_permission(permission,pg_temp.u(21))=(expected AND n IN (1,5)),'unassigned/managed program '||code);
  END LOOP;
  PERFORM pg_temp.assert_true(NOT pathways.p09_can('unregistered.permission'),'unknown permission');
  PERFORM set_config('app.organization_id',pg_temp.u(2)::text,true);
  PERFORM pg_temp.assert_true(NOT pathways.p09_can('projects.read'),'forged organization');
  PERFORM set_config('app.organization_id',pg_temp.u(1)::text,true);
  IF n IN (1,5,6) THEN
   PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pathways.beneficiaries),'denied profile rows '||code);
   PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pathways.beneficiary_project_enrollments),'denied enrollment detail '||code);
  ELSE
   PERFORM pg_temp.assert_true(EXISTS(SELECT FROM pathways.beneficiaries WHERE id=pg_temp.u(30)),'permitted profile '||code);
  END IF;
  IF n IN (1,5,6) THEN
   PERFORM pg_temp.assert_true(NOT pathways.p09_can('beneficiaries.records.read'),'aggregate-only profile denial');
   PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pathways.assessment_results),'aggregate-only survey detail denial');
   PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pathways.form_submissions),'aggregate-only submission denial');
   PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pathways.form_response_values),'aggregate-only response denial');
  ELSE
   PERFORM pg_temp.assert_true(EXISTS(SELECT FROM pathways.form_response_values WHERE id=pg_temp.u(43)),'permitted survey response '||code);
  END IF;
  PERFORM pg_temp.assert_true(jsonb_typeof(pathways.p06_saddd(pg_temp.u(1),ARRAY[pg_temp.u(20)],'2026-01-01','2026-02-28','Asia/Manila'))='object','SADDD entrypoint '||code);
  IF n=2 THEN
   PERFORM pg_temp.reject('SELECT pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(20)],''2026-01-01'',''2026-02-28'',''Asia/Manila'')','PO monitoring entrypoint denied');
  ELSE
   PERFORM pg_temp.assert_true(jsonb_typeof(pathways.p06_monitoring(pg_temp.u(1),ARRAY[pg_temp.u(20)],'2026-01-01','2026-02-28','Asia/Manila'))='object','Monitoring entrypoint '||code);
  END IF;
  PERFORM pg_temp.reject('SELECT pathways.p06_saddd(pg_temp.u(2),ARRAY[pg_temp.u(22)],''2026-01-01'',''2026-02-28'',''Asia/Manila'')','Foreign SADDD entrypoint denied');
  IF n=1 THEN
   PERFORM pg_temp.reject('SELECT pathways.p09_enroll(pg_temp.u(21),pg_temp.u(30),''2026-01-02'')','Admin enrollment no longer granted');
   PERFORM pg_temp.assert_true(EXISTS(SELECT FROM pathways.digital_forms WHERE id=pg_temp.u(40)),'Admin blank definitions allowed');
   PERFORM pg_temp.assert_true(NOT pathways.p09_can('assessments.detail.read'),'Admin survey detail denied');
   PERFORM pg_temp.assert_true(pathways.p09_can('projects.detail.read'),'Admin project viewing granted');
   PERFORM pg_temp.assert_true(NOT pathways.p09_can('budgets.read'),'Admin budget detail denied');
   PERFORM pg_temp.assert_true(pathways.p09_can('journeys.manage'),'Admin journey configuration granted');
   INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id)
   VALUES(pg_temp.u(1),pg_temp.u(21),pg_temp.u(106),pg_temp.u(101));
   PERFORM pg_temp.assert_true(EXISTS(SELECT FROM pathways.user_project_assignments WHERE project_id=pg_temp.u(21) AND user_id=pg_temp.u(106)),'Admin assigns Grant');
   -- End the new assignment through the permitted update workflow.
   UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Synthetic test' WHERE project_id=pg_temp.u(21) AND user_id=pg_temp.u(106);
  END IF;
  IF n=1 THEN
   PERFORM pg_temp.assert_true(pathways.p09_can('activities.context.read') AND NOT pathways.p09_can('activities.read'),'Admin context without activity details');
  END IF;
  IF n=2 THEN
   PERFORM pg_temp.assert_true(pathways.p09_can('analytics.read') AND pathways.p09_can('analytics.saddd.read') AND pathways.p09_can('alerts.review'),'PO revised analytical grants');
   PERFORM pg_temp.assert_true(NOT pathways.p09_can('forms.manage') AND NOT pathways.p09_can('forms.export') AND NOT pathways.p09_can('activities.update'),'PO definition/profile editing denied');
  END IF;
  IF n IN (4,5,6) THEN
   PERFORM pg_temp.assert_true(NOT pathways.p09_can('forms.read') AND NOT pathways.p09_can('forms.generate'),'Removed executive form grants');
  END IF;
  PERFORM pg_temp.assert_true(pathways.p09_can('activities.escalations.read') AND pathways.p09_can('activities.escalations.raise'),'Scoped escalation visibility and raising');
  IF n=4 THEN
   PERFORM pg_temp.reject('INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(20),pg_temp.u(106),pg_temp.u(104))','PM cannot assign Grant');
  END IF;
  IF n=5 THEN
   PERFORM pg_temp.reject('INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES(pg_temp.u(1),pg_temp.u(21),pg_temp.u(102),pg_temp.u(105))','Program cannot assign PO');
  END IF;
  PERFORM set_config('request.jwt.claim.sub',pg_temp.u(207)::text,true);
  PERFORM pg_temp.assert_true(NOT pathways.p09_can('projects.read'),'forged subject');
 END LOOP;
END $$;
RESET ROLE;
-- Revocation and inactive definitions must affect the next operation.
SELECT set_config('app.organization_id',pg_temp.u(1)::text,true),
 set_config('app.user_id',pg_temp.u(104)::text,true),set_config('request.jwt.claim.sub',pg_temp.u(204)::text,true);
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_MANAGER' AND p.code='projects.create';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p09_can('projects.create'),'revoked grant');
RESET ROLE;
UPDATE pathways.permissions SET is_active=false WHERE code='projects.read';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(20)),'inactive permission');
RESET ROLE;
UPDATE pathways.permissions SET is_active=true WHERE code='projects.read';
UPDATE pathways.roles SET is_active=false WHERE code='PROJECT_MANAGER';
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p09_can('projects.read'),'inactive role');
RESET ROLE;
UPDATE pathways.roles SET is_active=true WHERE code='PROJECT_MANAGER';
UPDATE pathways.user_project_assignments SET status='ENDED',ended_at=now(),end_reason='Synthetic test'
 WHERE user_id=pg_temp.u(104);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p05_has_project_permission('projects.read',pg_temp.u(20)),'ended assignment');
RESET ROLE;
UPDATE pathways.system_users SET account_status='SUSPENDED',suspended_at=now() WHERE id=pg_temp.u(104);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p09_can('projects.read'),'suspended account');
RESET ROLE;
UPDATE pathways.system_users SET account_status='ACTIVE',suspended_at=NULL WHERE id=pg_temp.u(104);
UPDATE pathways.system_users SET account_status='DEACTIVATED',deactivated_at=now() WHERE id=pg_temp.u(104);
SET LOCAL ROLE pathways_runtime;
SELECT pg_temp.assert_true(NOT pathways.p09_can('projects.read'),'deactivated account');
RESET ROLE;
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','pathways.p09_enroll(uuid,uuid,date)','EXECUTE'),'anonymous function denial');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','pathways.p09_can(text)','EXECUTE'),'Data API function denial');
SELECT pg_temp.assert_true(NOT (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='pathways_runtime'),'runtime security');
ROLLBACK;
\echo REVISED_AGGREGATE_ENTRYPOINTS=PASS
