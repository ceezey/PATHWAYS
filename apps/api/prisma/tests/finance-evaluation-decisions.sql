-- Synthetic fixtures only; this suite refuses every nonlocal/shared database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT LIKE 'pathways_phase3_%' OR inet_server_addr()<>'127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Only disposable localhost Phase 3 databases are permitted';
 END IF;
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE phase3_assertions(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO phase3_assertions VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 BEGIN
  EXECUTE command;
  SET CONSTRAINTS ALL IMMEDIATE;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected AND NOT(expected='23503' AND SQLSTATE='23001') THEN
   RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM;
  END IF;
  caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'Assertion % accepted invalid data',label; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 INSERT INTO phase3_assertions VALUES(label);
END $$;

INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(1),'P3_A','Synthetic A');

INSERT INTO pathways.organizations(id,code,name) VALUES(pg_temp.u(2),'P3_B','Synthetic B');

INSERT INTO pathways.roles(id,code,name) VALUES(pg_temp.u(10),'P3_TEST','Synthetic local role');

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(11),pg_temp.u(1),pg_temp.u(10),'Synthetic actor 11','actor11@example.invalid','ACTIVE',now());

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(12),pg_temp.u(1),pg_temp.u(10),'Synthetic actor 12','actor12@example.invalid','ACTIVE',now());

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(13),pg_temp.u(1),pg_temp.u(10),'Synthetic actor 13','actor13@example.invalid','ACTIVE',now());

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(14),pg_temp.u(1),pg_temp.u(10),'Synthetic actor 14','actor14@example.invalid','ACTIVE',now());

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(15),pg_temp.u(1),pg_temp.u(10),'Synthetic actor 15','actor15@example.invalid','INVITED',NULL);

INSERT INTO pathways.system_users(id,organization_id,role_id,full_name,email,account_status,activated_at) VALUES(pg_temp.u(21),pg_temp.u(2),pg_temp.u(10),'Synthetic actor 21','actor21@example.invalid','ACTIVE',now());

INSERT INTO pathways.projects(id,organization_id,code,title) VALUES(pg_temp.u(101),pg_temp.u(1),'P3_101','Synthetic project 101');

INSERT INTO pathways.projects(id,organization_id,code,title) VALUES(pg_temp.u(102),pg_temp.u(1),'P3_102','Synthetic project 102');

INSERT INTO pathways.projects(id,organization_id,code,title) VALUES(pg_temp.u(103),pg_temp.u(2),'P3_103','Synthetic project 103');

INSERT INTO pathways.programs(id,organization_id,code,name) VALUES(pg_temp.u(90),pg_temp.u(1),'P3_PROGRAM','Synthetic program');

INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title) VALUES(pg_temp.u(201),pg_temp.u(1),pg_temp.u(101),'P3_ACTIVITY_201','Synthetic activity');

INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title) VALUES(pg_temp.u(202),pg_temp.u(1),pg_temp.u(102),'P3_ACTIVITY_202','Synthetic activity');

INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title) VALUES(pg_temp.u(203),pg_temp.u(2),pg_temp.u(103),'P3_ACTIVITY_203','Synthetic activity');

INSERT INTO pathways.beneficiaries(id,organization_id,code,consent_recorded) VALUES(pg_temp.u(301),pg_temp.u(1),'P3_BENEFICIARY',true);

INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES(pg_temp.u(311),pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),'2026-01-01',pg_temp.u(11));

INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id) VALUES(pg_temp.u(312),pg_temp.u(1),pg_temp.u(102),pg_temp.u(301),'2026-01-01',pg_temp.u(11));

SELECT pg_temp.reject($q$INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(202),'Training','PHP',1000,pg_temp.u(11))$q$,'23503','Budget/activity project isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(2),pg_temp.u(101),pg_temp.u(201),'Training','PHP',1000,pg_temp.u(21))$q$,'23503','Budget organization isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'Training','PHP',-1,pg_temp.u(11))$q$,'23514','Negative planned budget');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'Training','php',1000,pg_temp.u(11))$q$,'23514','Canonical currency');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'Training','PHP',1000,pg_temp.u(15))$q$,'23514','Inactive actor rejected');

INSERT INTO pathways.project_budget_records(id,organization_id,project_id,activity_id,category,currency,planned_budget,recorded_by_id) VALUES(pg_temp.u(401),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'Training','PHP',1000,pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.project_budget_records SET planned_budget=2000 WHERE id=pg_temp.u(401)$q$,'23514','Recorded budget provenance immutable');

SELECT pg_temp.reject($q$INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(pg_temp.u(411),pg_temp.u(1),pg_temp.u(102),pg_temp.u(401),'Synthetic training receipt',250,'2026-09-01',pg_temp.u(11))$q$,'23503','Expense/budget project isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(pg_temp.u(411),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'Synthetic training receipt',-1,'2026-09-01',pg_temp.u(11))$q$,'23514','Negative expense rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id,status,verified_by_id,verified_at,approved_by_id,approved_at) VALUES(pg_temp.u(411),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'Synthetic training receipt',250,'2026-09-01',pg_temp.u(11),'APPROVED',pg_temp.u(12),now(),pg_temp.u(13),now())$q$,'23514','Expense cannot bypass review on insert');

INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(pg_temp.u(411),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'Synthetic training receipt',250,'2026-09-01',pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET amount=100 WHERE id=pg_temp.u(411)$q$,'23514','Submitted expense amount immutable');

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='VERIFIED',verified_by_id=pg_temp.u(12),verified_at=now() WHERE id=pg_temp.u(411)$q$,'23514','Expense needs verified receipt');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','https://invalid.example/file',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Storage URL forbidden');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/../escape.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Traversal storage key rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/%2e%2e.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Encoded traversal storage key rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/x.pdf?token=x',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Signed URL query storage key rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/nested/file.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Extra path segment storage key rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/x\file.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Backslash storage key rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','public','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Public bucket forbidden');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(102)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Object key project integrity');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf','wrong',10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Evidence digest integrity');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(12),pg_temp.u(411))$q$,'23514','Receipt submitter provenance');

SELECT pg_temp.reject($q$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(202),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411))$q$,'23514','Receipt activity provenance');

INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,expense_id) VALUES(pg_temp.u(421),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),pg_temp.u(411));

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET object_key='organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(421)::text||'/replacement.pdf' WHERE id=pg_temp.u(421)$q$,'23514','Submitted storage object immutable');

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=pg_temp.u(11),verified_at=now() WHERE id=pg_temp.u(421)$q$,'23514','Evidence self-verification rejected');

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=pg_temp.u(12),verified_at=NULL WHERE id=pg_temp.u(421)$q$,'23514','Evidence missing verification timestamp');

UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=pg_temp.u(12),verified_at=now() WHERE id=pg_temp.u(421);

UPDATE pathways.budget_expense_entries SET receipt_evidence_id=pg_temp.u(421) WHERE id=pg_temp.u(411);

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='VERIFIED',verified_by_id=pg_temp.u(11),verified_at=now() WHERE id=pg_temp.u(411)$q$,'23514','Expense self-verification rejected');

UPDATE pathways.budget_expense_entries SET status='VERIFIED',verified_by_id=pg_temp.u(12),verified_at=now() WHERE id=pg_temp.u(411);

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='APPROVED',approved_by_id=pg_temp.u(11),approved_at=now() WHERE id=pg_temp.u(411)$q$,'23514','Expense submitter cannot approve');

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='APPROVED',approved_by_id=pg_temp.u(12),approved_at=now() WHERE id=pg_temp.u(411)$q$,'23514','Expense verifier cannot approve');

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET verified_by_id=pg_temp.u(13) WHERE id=pg_temp.u(411)$q$,'23514','Expense verification actor immutable');

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET status='REJECTED',rejected_by_id=pg_temp.u(13),rejected_at=now(),rejection_reason='Rewrite proof' WHERE id=pg_temp.u(421)$q$,'23514','Cannot invalidate receipt backing verified expense');

UPDATE pathways.budget_expense_entries SET status='APPROVED',approved_by_id=pg_temp.u(13),approved_at=now() WHERE id=pg_temp.u(411);

SELECT pg_temp.ok((SELECT actual_spending=250 AND remaining_budget=750 FROM pathways.p3_budget_totals(pg_temp.u(401))),'Actual spending derived only from approved expenses');

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='PENDING',verified_by_id=NULL,verified_at=NULL,approved_by_id=NULL,approved_at=NULL WHERE id=pg_temp.u(411)$q$,'23514','Approved expense cannot reopen');

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET status='APPROVED',approved_by_id=pg_temp.u(12),approved_at=now() WHERE id=pg_temp.u(421)$q$,'23514','Evidence verifier cannot approve');

UPDATE pathways.evidence_media SET status='APPROVED',approved_by_id=pg_temp.u(13),approved_at=now() WHERE id=pg_temp.u(421);

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET public_visibility_status='FOR_REVIEW',public_submitted_by_id=pg_temp.u(11),public_submitted_at=now() WHERE id=pg_temp.u(421)$q$,'23514','Identifying nonconsented evidence remains private');

INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,consent_confirmed,is_identifying) VALUES(pg_temp.u(422),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),'DOCUMENT','Synthetic file.pdf','pathways-private','organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/evidence/'||pg_temp.u(422)::text||'/fixture.pdf',repeat('a',64),10,'application/pdf',pg_temp.u(11),true,false);

UPDATE pathways.evidence_media SET status='VERIFIED',verified_by_id=pg_temp.u(12),verified_at=now() WHERE id=pg_temp.u(422);

UPDATE pathways.evidence_media SET status='APPROVED',approved_by_id=pg_temp.u(13),approved_at=now() WHERE id=pg_temp.u(422);

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET public_visibility_status='PUBLISHED',public_submitted_by_id=pg_temp.u(11),public_submitted_at=now(),public_approved_by_id=pg_temp.u(13),public_approved_at=now(),published_by_id=pg_temp.u(14),published_at=now() WHERE id=pg_temp.u(422)$q$,'23514','Publication cannot skip public review');

UPDATE pathways.evidence_media SET public_visibility_status='FOR_REVIEW',public_submitted_by_id=pg_temp.u(11),public_submitted_at=now() WHERE id=pg_temp.u(422);

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET public_visibility_status='APPROVED',public_approved_by_id=pg_temp.u(11),public_approved_at=now() WHERE id=pg_temp.u(422)$q$,'23514','Public self-approval rejected');

UPDATE pathways.evidence_media SET public_visibility_status='APPROVED',public_approved_by_id=pg_temp.u(13),public_approved_at=now() WHERE id=pg_temp.u(422);

SELECT pg_temp.ok((SELECT public_visibility_status='APPROVED' AND published_at IS NULL AND bucket='pathways-private' FROM pathways.evidence_media WHERE id=pg_temp.u(422)),'Approval is not publication and bucket stays private');

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET public_visibility_status='PUBLISHED',published_by_id=pg_temp.u(13),published_at=now() WHERE id=pg_temp.u(422)$q$,'23514','Public approval and publisher separation');

UPDATE pathways.evidence_media SET public_visibility_status='PUBLISHED',published_by_id=pg_temp.u(14),published_at=now() WHERE id=pg_temp.u(422);

SELECT pg_temp.reject($q$UPDATE pathways.evidence_media SET public_approved_by_id=pg_temp.u(12) WHERE id=pg_temp.u(422)$q$,'23514','Publication approval audit immutable');

SELECT pg_temp.ok((SELECT published_at IS NOT NULL AND bucket='pathways-private' FROM pathways.evidence_media WHERE id=pg_temp.u(422)),'Publication records metadata only, without changing private storage');

INSERT INTO pathways.budget_expense_entries(id,organization_id,project_id,budget_record_id,description,amount,expense_date,submitted_by_id) VALUES(pg_temp.u(412),pg_temp.u(1),pg_temp.u(101),pg_temp.u(401),'Rejected fixture',250,'2026-09-01',pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.budget_expense_entries SET status='REJECTED',rejected_by_id=pg_temp.u(12),rejected_at=now() WHERE id=pg_temp.u(412)$q$,'23514','Rejection requires reason');

UPDATE pathways.budget_expense_entries SET status='REJECTED',rejected_by_id=pg_temp.u(12),rejected_at=now(),rejection_reason='Synthetic rejection' WHERE id=pg_temp.u(412);

SELECT pg_temp.ok((SELECT actual_spending=250 FROM pathways.p3_budget_totals(pg_temp.u(401))),'Rejected expense excluded from spending');

INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,name,activity_id) VALUES(pg_temp.u(501),pg_temp.u(1),pg_temp.u(101),'P3_FORM','Synthetic form',pg_temp.u(201));

INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,sequence_no) VALUES(pg_temp.u(502),pg_temp.u(1),pg_temp.u(101),pg_temp.u(501),'VALUE','Value','INTEGER',1);

UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id=pg_temp.u(12) WHERE id=pg_temp.u(501);

INSERT INTO pathways.form_submissions(id,organization_id,project_id,form_id,enrollment_id,submitted_by_id) VALUES(pg_temp.u(511),pg_temp.u(1),pg_temp.u(101),pg_temp.u(501),pg_temp.u(311),pg_temp.u(11));

SELECT pg_temp.reject($q$INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(311),pg_temp.u(511),'PRE_TEST',8,10,'2026-09-01',pg_temp.u(11))$q$,'23514','Unvalidated source cannot create assessment');

UPDATE pathways.form_submissions SET status='VALIDATED',validated_by_id=pg_temp.u(12),validated_at=now() WHERE id=pg_temp.u(511);

SELECT pg_temp.reject($q$INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(312),pg_temp.u(511),'PRE_TEST',8,10,'2026-09-01',pg_temp.u(11))$q$,'23514','Assessment source enrollment isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(202),pg_temp.u(311),pg_temp.u(511),'PRE_TEST',8,10,'2026-09-01',pg_temp.u(11))$q$,'23514','Assessment source activity isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(311),pg_temp.u(511),'PRE_TEST',11,10,'2026-09-01',pg_temp.u(11))$q$,'23514','Assessment score bounds');

INSERT INTO pathways.assessment_results(id,organization_id,project_id,activity_id,enrollment_id,source_submission_id,type,score,maximum_score,assessment_date,recorded_by_id) VALUES(pg_temp.u(521),pg_temp.u(1),pg_temp.u(101),pg_temp.u(201),pg_temp.u(311),pg_temp.u(511),'PRE_TEST',8,10,'2026-09-01',pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.assessment_results SET score=9 WHERE id=pg_temp.u(521)$q$,'23514','Assessment immutable after recording');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(pg_temp.u(601),pg_temp.u(1),pg_temp.u(101),'P3_KPI',1,'KPI','Synthetic criterion',101,10,pg_temp.u(11))$q$,'23514','Criterion weight bound');

INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(pg_temp.u(601),pg_temp.u(1),pg_temp.u(101),'P3_KPI',1,'KPI','Synthetic criterion',100,10,pg_temp.u(11));

INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(pg_temp.u(602),pg_temp.u(1),pg_temp.u(102),'P3_KPI',1,'KPI','Synthetic criterion',100,10,pg_temp.u(11));

UPDATE pathways.project_evaluation_criteria SET status='PUBLISHED',published_by_id=pg_temp.u(12),published_at=now() WHERE id=pg_temp.u(601);

UPDATE pathways.project_evaluation_criteria SET status='PUBLISHED',published_by_id=pg_temp.u(12),published_at=now() WHERE id=pg_temp.u(602);

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluation_criteria SET weight_percentage=50 WHERE id=pg_temp.u(601)$q$,'23514','Published criterion cannot change weight');

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluation_criteria SET name='Rewritten' WHERE id=pg_temp.u(601)$q$,'23514','Published criterion text immutable');

SELECT pg_temp.reject($q$DELETE FROM pathways.project_evaluation_criteria WHERE id=pg_temp.u(601)$q$,'23514','Published criterion cannot be deleted');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(pg_temp.u(603),pg_temp.u(1),pg_temp.u(101),'P3_KPI',1,'KPI','Synthetic criterion',100,10,pg_temp.u(11))$q$,'23505','Criterion code/version unique');

INSERT INTO pathways.project_evaluation_criteria(id,organization_id,project_id,code,version,type,name,weight_percentage,maximum_score,created_by_id) VALUES(pg_temp.u(603),pg_temp.u(1),pg_temp.u(101),'P3_KPI',2,'KPI','Revised version',100,10,pg_temp.u(11));

INSERT INTO pathways.project_evaluations(id,organization_id,project_id,title,period_start,period_end,evaluated_by_id) VALUES(pg_temp.u(611),pg_temp.u(1),pg_temp.u(101),'Synthetic evaluation','2026-01-01','2026-09-01',pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='SUBMITTED',evaluated_at=now() WHERE id=pg_temp.u(611)$q$,'23514','Empty evaluation cannot submit');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_evaluation_scores(id,organization_id,project_id,evaluation_id,criterion_id,score,maximum_score,weighted_score,criterion_snapshot) VALUES(pg_temp.u(621),pg_temp.u(1),pg_temp.u(101),pg_temp.u(611),pg_temp.u(602),8,999,99,'{}')$q$,'23514','Evaluation criterion project isolation');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_evaluation_scores(id,organization_id,project_id,evaluation_id,criterion_id,score,maximum_score,weighted_score,criterion_snapshot) VALUES(pg_temp.u(621),pg_temp.u(1),pg_temp.u(101),pg_temp.u(611),pg_temp.u(603),8,999,99,'{}')$q$,'23514','Draft criterion cannot be scored');

SELECT pg_temp.reject($q$INSERT INTO pathways.project_evaluation_scores(id,organization_id,project_id,evaluation_id,criterion_id,score,maximum_score,weighted_score,criterion_snapshot) VALUES(pg_temp.u(621),pg_temp.u(1),pg_temp.u(101),pg_temp.u(611),pg_temp.u(601),11,999,99,'{}')$q$,'23514','Evaluation score bounds');

INSERT INTO pathways.project_evaluation_scores(id,organization_id,project_id,evaluation_id,criterion_id,score,maximum_score,weighted_score,criterion_snapshot) VALUES(pg_temp.u(621),pg_temp.u(1),pg_temp.u(101),pg_temp.u(611),pg_temp.u(601),8,999,99,'{}');

SELECT pg_temp.ok((SELECT maximum_score=10 AND weighted_score=80 AND criterion_snapshot->>'version'='1' FROM pathways.project_evaluation_scores WHERE id=pg_temp.u(621)),'Score and criterion snapshot derived from published version');

UPDATE pathways.project_evaluations SET status='SUBMITTED',evaluated_at=now(),overall_score=1 WHERE id=pg_temp.u(611);

SELECT pg_temp.ok((SELECT overall_score=80 FROM pathways.project_evaluations WHERE id=pg_temp.u(611)),'Submitted evaluation total computed from immutable scores');

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluation_scores SET score=9 WHERE id=pg_temp.u(621)$q$,'23514','Submitted score cannot change');

SELECT pg_temp.reject($q$DELETE FROM pathways.project_evaluation_scores WHERE id=pg_temp.u(621)$q$,'23514','Submitted score cannot be removed');

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET commentary='Rewrite' WHERE id=pg_temp.u(611)$q$,'23514','Submitted evaluation content immutable');

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='REVIEWED',reviewed_by_id=pg_temp.u(11),reviewed_at=now(),review_feedback='Self review' WHERE id=pg_temp.u(611)$q$,'23514','Evaluator cannot self-review');

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='REVIEWED',reviewed_by_id=pg_temp.u(12),reviewed_at=NULL,review_feedback='Missing time' WHERE id=pg_temp.u(611)$q$,'23514','Evaluation review timestamp required');

UPDATE pathways.project_evaluations SET status='REVIEWED',reviewed_by_id=pg_temp.u(12),reviewed_at=now(),review_feedback='Reviewed synthetic evidence' WHERE id=pg_temp.u(611);

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='SIGNED_OFF',signed_off_by_id=pg_temp.u(12),signed_off_at=now() WHERE id=pg_temp.u(611)$q$,'23514','Evaluation reviewer cannot sign off');

UPDATE pathways.project_evaluations SET status='SIGNED_OFF',signed_off_by_id=pg_temp.u(13),signed_off_at=now() WHERE id=pg_temp.u(611);

SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='ARCHIVED',archived_at=now(),review_feedback='Rewrite' WHERE id=pg_temp.u(611)$q$,'23514','Review feedback survives archival unchanged');

UPDATE pathways.project_evaluations SET status='ARCHIVED',archived_at=now() WHERE id=pg_temp.u(611);

SELECT pg_temp.ok((SELECT overall_score=80 AND reviewed_by_id=pg_temp.u(12) AND signed_off_by_id=pg_temp.u(13) FROM pathways.project_evaluations WHERE id=pg_temp.u(611)),'Evaluation signoff and archival preserve history');

INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id) VALUES(pg_temp.u(701),pg_temp.u(1),'P3_RULE_701',1,'Synthetic ALL rule','COMBINED_CONDITION','ALL',pg_temp.u(11));

INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id) VALUES(pg_temp.u(702),pg_temp.u(1),'P3_RULE_702',1,'Synthetic ANY rule','COMBINED_CONDITION','ANY',pg_temp.u(11));

INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id) VALUES(pg_temp.u(703),pg_temp.u(2),'P3_RULE_703',1,'Synthetic ALL rule','COMBINED_CONDITION','ALL',pg_temp.u(21));

INSERT INTO pathways.alert_rules(id,organization_id,code,version,name,type,match_mode,created_by_id) VALUES(pg_temp.u(704),pg_temp.u(1),'P3_RULE_704',1,'Synthetic ALL rule','COMBINED_CONDITION','ALL',pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id=pg_temp.u(12),activated_at=now() WHERE id=pg_temp.u(704)$q$,'23514','Empty rule cannot activate');

SELECT pg_temp.reject($q$INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold,threshold_maximum) VALUES(pg_temp.u(711),pg_temp.u(1),pg_temp.u(701),1,'KPI_ACHIEVEMENT_PERCENT','BETWEEN',50,40)$q$,'23514','Reversed BETWEEN rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(711),pg_temp.u(1),pg_temp.u(701),1,'EXECUTE_SQL','LT',50)$q$,'22P02','Rule metric allowlist');

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(711),pg_temp.u(1),pg_temp.u(701),1,'KPI_ACHIEVEMENT_PERCENT','LT',50);

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(721),pg_temp.u(1),pg_temp.u(701),2,'BUDGET_UTILIZATION_PERCENT','GT',90);

INSERT INTO pathways.alert_rule_recommendations(id,organization_id,rule_id,title,text,type,created_by_id) VALUES(pg_temp.u(731),pg_temp.u(1),pg_temp.u(701),'Human review required','Inspect the budget and indicator evidence.','REVIEW_PROMPT',pg_temp.u(11));

UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id=pg_temp.u(12),activated_at=now() WHERE id=pg_temp.u(701);

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(712),pg_temp.u(1),pg_temp.u(702),1,'KPI_ACHIEVEMENT_PERCENT','LT',50);

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(722),pg_temp.u(1),pg_temp.u(702),2,'BUDGET_UTILIZATION_PERCENT','GT',90);

INSERT INTO pathways.alert_rule_recommendations(id,organization_id,rule_id,title,text,type,created_by_id) VALUES(pg_temp.u(732),pg_temp.u(1),pg_temp.u(702),'Human review required','Inspect the budget and indicator evidence.','REVIEW_PROMPT',pg_temp.u(11));

UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id=pg_temp.u(12),activated_at=now() WHERE id=pg_temp.u(702);

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(713),pg_temp.u(2),pg_temp.u(703),1,'KPI_ACHIEVEMENT_PERCENT','LT',50);

INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(723),pg_temp.u(2),pg_temp.u(703),2,'BUDGET_UTILIZATION_PERCENT','GT',90);

INSERT INTO pathways.alert_rule_recommendations(id,organization_id,rule_id,title,text,type,created_by_id) VALUES(pg_temp.u(733),pg_temp.u(2),pg_temp.u(703),'Human review required','Inspect the budget and indicator evidence.','REVIEW_PROMPT',pg_temp.u(21));

UPDATE pathways.alert_rules SET status='ACTIVE',activated_by_id=pg_temp.u(21),activated_at=now() WHERE id=pg_temp.u(703);

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(701),'{"KPI_ACHIEVEMENT_PERCENT":40,"BUDGET_UTILIZATION_PERCENT":95}')->>'matched')::boolean=true),'ALL matches every condition');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(701),'{"KPI_ACHIEVEMENT_PERCENT":40,"BUDGET_UTILIZATION_PERCENT":80}')->>'matched')::boolean=false),'ALL fails a false condition');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(702),'{"KPI_ACHIEVEMENT_PERCENT":60,"BUDGET_UTILIZATION_PERCENT":95}')->>'matched')::boolean=true),'ANY matches one condition');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(702),'{"KPI_ACHIEVEMENT_PERCENT":60,"BUDGET_UTILIZATION_PERCENT":80}')->>'matched')::boolean=false),'ANY fails all false conditions');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(701),'{"KPI_ACHIEVEMENT_PERCENT":40}')->>'matched')::boolean=false),'ALL treats missing input as false');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(702),'{"KPI_ACHIEVEMENT_PERCENT":40}')->>'matched')::boolean=true),'ANY tolerates other missing inputs');

SELECT pg_temp.ok((SELECT (pathways.p3_evaluate_rule(pg_temp.u(702),'{}')->>'matched')::boolean=false),'Empty observed inputs do not match');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('LT',9,10,NULL)=true),'Numeric operator LT at 9');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('LTE',10,10,NULL)=true),'Numeric operator LTE at 10');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('EQ',10,10,NULL)=true),'Numeric operator EQ at 10');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('GTE',10,10,NULL)=true),'Numeric operator GTE at 10');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('GT',11,10,NULL)=true),'Numeric operator GT at 11');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('BETWEEN',10,10,20)=true),'Numeric operator BETWEEN at 10');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('BETWEEN',20,10,20)=true),'Numeric operator BETWEEN at 20');

SELECT pg_temp.ok((SELECT pathways.p3_condition_matches('BETWEEN',21,10,20)=false),'Numeric operator BETWEEN at 21');

SELECT pg_temp.reject($q$SELECT pathways.p3_evaluate_rule(pg_temp.u(701),'{"KPI_ACHIEVEMENT_PERCENT":"40"}')$q$,'23514','Rule rejects text pretending to be numeric');

SELECT pg_temp.reject($q$SELECT pathways.p3_evaluate_rule(pg_temp.u(701),'{"PASSWORD":40}')$q$,'23514','Rule rejects undeclared input keys');

SELECT pg_temp.reject($q$UPDATE pathways.alert_rules SET match_mode='ANY' WHERE id=pg_temp.u(701)$q$,'23514','Activated rule mode immutable');

SELECT pg_temp.reject($q$UPDATE pathways.alert_rule_conditions SET threshold=10 WHERE id=pg_temp.u(711)$q$,'23514','Activated threshold immutable');

SELECT pg_temp.reject($q$INSERT INTO pathways.alert_rule_conditions(id,organization_id,rule_id,sequence,metric,operator,threshold) VALUES(pg_temp.u(714),pg_temp.u(1),pg_temp.u(701),3,'OUTCOME_SCORE','LT',20)$q$,'23514','Activated rule cannot gain conditions');

SELECT pg_temp.reject($q$UPDATE pathways.alert_rule_recommendations SET text='Changed after activation' WHERE id=pg_temp.u(731)$q$,'23514','Activated recommendation template immutable');

SELECT pg_temp.reject($q$DELETE FROM pathways.alert_rule_conditions WHERE id=pg_temp.u(711)$q$,'23514','Activated condition cannot be deleted');

SELECT pg_temp.reject($q$INSERT INTO pathways.rule_based_alerts(id,organization_id,project_id,rule_id,title,message,severity,observed_values,evaluated_snapshot,evaluated_by_id) VALUES(pg_temp.u(741),pg_temp.u(1),pg_temp.u(101),pg_temp.u(703),'Synthetic alert','Review the evaluated evidence','CRITICAL','{"KPI_ACHIEVEMENT_PERCENT":40,"BUDGET_UTILIZATION_PERCENT":95}','{"forged":true}',pg_temp.u(11))$q$,'23514','Cross-organization rule evaluation rejected');

SELECT pg_temp.reject($q$INSERT INTO pathways.rule_based_alerts(id,organization_id,project_id,rule_id,title,message,severity,observed_values,evaluated_snapshot,evaluated_by_id) VALUES(pg_temp.u(741),pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),'Synthetic alert','Review the evaluated evidence','CRITICAL','{"KPI_ACHIEVEMENT_PERCENT":70,"BUDGET_UTILIZATION_PERCENT":80}','{"forged":true}',pg_temp.u(11))$q$,'23514','Nonmatching condition cannot create alert');

INSERT INTO pathways.rule_based_alerts(id,organization_id,project_id,rule_id,title,message,severity,observed_values,evaluated_snapshot,evaluated_by_id) VALUES(pg_temp.u(741),pg_temp.u(1),pg_temp.u(101),pg_temp.u(701),'Synthetic alert','Review the evaluated evidence','CRITICAL','{"KPI_ACHIEVEMENT_PERCENT":40,"BUDGET_UTILIZATION_PERCENT":95}','{"forged":true}',pg_temp.u(11));

SELECT pg_temp.ok((SELECT severity='MEDIUM' AND evaluated_snapshot->'rule'->>'version'='1' AND evaluated_snapshot->>'matched'='true' AND NOT(evaluated_snapshot?'forged') FROM pathways.rule_based_alerts WHERE id=pg_temp.u(741)),'Alert snapshot and severity computed from evaluated rule');

SELECT pg_temp.reject($q$UPDATE pathways.rule_based_alerts SET observed_values='{}' WHERE id=pg_temp.u(741)$q$,'23514','Evaluated observed values immutable');

SELECT pg_temp.reject($q$UPDATE pathways.rule_based_alerts SET evaluated_snapshot='{}' WHERE id=pg_temp.u(741)$q$,'23514','Evaluated rule snapshot immutable');

SELECT pg_temp.reject($q$INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,alert_id,source_rule_recommendation_id,title,text,basis,proposed_by_id) VALUES(pg_temp.u(751),pg_temp.u(1),pg_temp.u(101),pg_temp.u(741),pg_temp.u(732),'Ignored input','Ignored input','COMBINED',pg_temp.u(11))$q$,'23514','Recommendation source rule must match evaluated alert');

SELECT pg_temp.reject($q$INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,alert_id,source_rule_recommendation_id,title,text,basis,proposed_by_id) VALUES(pg_temp.u(751),pg_temp.u(1),pg_temp.u(102),pg_temp.u(741),pg_temp.u(731),'Ignored input','Ignored input','COMBINED',pg_temp.u(11))$q$,'23514','Recommendation alert project isolation');

INSERT INTO pathways.decision_recommendations(id,organization_id,project_id,alert_id,source_rule_recommendation_id,title,text,basis,proposed_by_id) VALUES(pg_temp.u(751),pg_temp.u(1),pg_temp.u(101),pg_temp.u(741),pg_temp.u(731),'Ignored input','Ignored input','COMBINED',pg_temp.u(11));

SELECT pg_temp.ok((SELECT title='Human review required' AND type='REVIEW_PROMPT' AND source_snapshot->>'id'=pg_temp.u(731)::text FROM pathways.decision_recommendations WHERE id=pg_temp.u(751)),'Recommendation template copied from immutable evaluated snapshot');

SELECT pg_temp.reject($q$UPDATE pathways.decision_recommendations SET status='RESOLVED',reviewed_by_id=pg_temp.u(12),reviewed_at=now(),review_note='Skip',outcome='ACCEPT',outcome_by_id=pg_temp.u(13),outcome_at=now(),outcome_note='Skip' WHERE id=pg_temp.u(751)$q$,'23514','Recommendation outcome cannot skip human review');

SELECT pg_temp.reject($q$UPDATE pathways.decision_recommendations SET status='REVIEWED',reviewed_by_id=pg_temp.u(11),reviewed_at=now(),review_note='Self' WHERE id=pg_temp.u(751)$q$,'23514','Recommendation proposer cannot self-review');

UPDATE pathways.decision_recommendations SET status='REVIEWED',reviewed_by_id=pg_temp.u(12),reviewed_at=now(),review_note='Human review of synthetic evidence' WHERE id=pg_temp.u(751);

SELECT pg_temp.reject($q$UPDATE pathways.decision_recommendations SET status='RESOLVED',outcome='ACCEPT',outcome_by_id=pg_temp.u(11),outcome_at=now(),outcome_note='Self' WHERE id=pg_temp.u(751)$q$,'23514','Recommendation proposer cannot approve own outcome');

SELECT pg_temp.reject($q$UPDATE pathways.decision_recommendations SET status='RESOLVED',outcome='ACCEPT',outcome_by_id=pg_temp.u(13),outcome_at=now() WHERE id=pg_temp.u(751)$q$,'23514','Recommendation outcome requires explanation');

UPDATE pathways.decision_recommendations SET status='RESOLVED',outcome='ACCEPT',outcome_by_id=pg_temp.u(13),outcome_at=now(),outcome_note='Human accepted advice; no automatic action' WHERE id=pg_temp.u(751);

SELECT pg_temp.ok((SELECT p.planned_budget=1000 AND t.actual_spending=250 FROM pathways.project_budget_records p CROSS JOIN pathways.p3_budget_totals(pg_temp.u(401)) t WHERE p.id=pg_temp.u(401)),'Accepted recommendation does not change budget or expenses');

SELECT pg_temp.reject($q$UPDATE pathways.decision_recommendations SET outcome_note='Rewrite decision' WHERE id=pg_temp.u(751)$q$,'23514','Completed human decision immutable');

UPDATE pathways.alert_rules SET status='ARCHIVED',archived_at=now() WHERE id=pg_temp.u(701);

SELECT pg_temp.ok((SELECT evaluated_snapshot->'rule'->>'version'='1' AND jsonb_array_length(evaluated_snapshot->'conditions')=2 FROM pathways.rule_based_alerts WHERE id=pg_temp.u(741)),'Rule archival preserves evaluated conditions and snapshot');

SELECT pg_temp.reject($q$SELECT pathways.p3_evaluate_rule(pg_temp.u(701),'{}')$q$,'23514','Archived rule cannot be newly evaluated');

SELECT pg_temp.reject($q$INSERT INTO pathways.reports(id,organization_id,project_id,name,type,evaluation_id,created_by_id) VALUES(pg_temp.u(801),pg_temp.u(1),NULL,'Synthetic evaluation report','EVALUATION_REPORT',pg_temp.u(611),pg_temp.u(11))$q$,'23514','Project report context cannot escape through nullable composite FK');

SELECT pg_temp.reject($q$INSERT INTO pathways.reports(id,organization_id,project_id,name,type,evaluation_id,created_by_id,program_id) VALUES(pg_temp.u(801),pg_temp.u(1),pg_temp.u(101),'Synthetic evaluation report','EVALUATION_REPORT',pg_temp.u(611),pg_temp.u(11),pg_temp.u(90))$q$,'23514','Report program scope and project scope are unambiguous');

INSERT INTO pathways.reports(id,organization_id,project_id,name,type,evaluation_id,created_by_id) VALUES(pg_temp.u(801),pg_temp.u(1),pg_temp.u(101),'Synthetic evaluation report','EVALUATION_REPORT',pg_temp.u(611),pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.reports SET status='GENERATED',format='PDF',bucket='pathways-private',object_key='https://invalid.example/report.pdf',sha256=repeat('b',64),generated_by_id=pg_temp.u(12),generated_at=now() WHERE id=pg_temp.u(801)$q$,'23514','Report artifact cannot be URL');

UPDATE pathways.reports SET status='GENERATED',format='PDF',bucket='pathways-private',object_key='organizations/'||pg_temp.u(1)::text||'/projects/'||pg_temp.u(101)::text||'/reports/'||pg_temp.u(801)::text||'/evaluation.pdf',sha256=repeat('b',64),generated_by_id=pg_temp.u(12),generated_at=now() WHERE id=pg_temp.u(801);

SELECT pg_temp.reject($q$UPDATE pathways.reports SET name='Rewritten output' WHERE id=pg_temp.u(801)$q$,'23514','Generated report context immutable');

SELECT pg_temp.reject($q$DELETE FROM pathways.reports WHERE id=pg_temp.u(801)$q$,'23514','Generated report cannot be deleted');

UPDATE pathways.reports SET status='ARCHIVED',archived_at=now() WHERE id=pg_temp.u(801);

SELECT pg_temp.ok((SELECT generated_at IS NOT NULL AND archived_at IS NOT NULL FROM pathways.reports WHERE id=pg_temp.u(801)),'Report archival preserves artifact history');

SELECT pg_temp.reject($q$INSERT INTO pathways.reports(id,organization_id,project_id,name,type,created_by_id) VALUES(pg_temp.u(802),pg_temp.u(1),pg_temp.u(101),'Invalid survey','SURVEY_FORM_RESULTS',pg_temp.u(11))$q$,'23514','Survey report must name form version');

INSERT INTO pathways.reports(id,organization_id,project_id,name,type,form_id,activity_id,created_by_id) VALUES(pg_temp.u(802),pg_temp.u(1),pg_temp.u(101),'Synthetic survey report','SURVEY_FORM_RESULTS',pg_temp.u(501),pg_temp.u(201),pg_temp.u(11));

SELECT pg_temp.reject($q$UPDATE pathways.reports SET aggregate_only=false WHERE id=pg_temp.u(802)$q$,'23514','Survey form outputs must be aggregate-only');

SELECT pg_temp.ok((SELECT count(*)=39 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relkind='r'),'Exactly 39 target tables after complete replay');

SELECT pg_temp.ok((SELECT bool_and(c.relrowsecurity AND pg_get_userbyid(c.relowner)='prisma') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relname IN ('project_budget_records','budget_expense_entries','assessment_results','project_evaluation_criteria','project_evaluations','project_evaluation_scores','alert_rules','alert_rule_conditions','alert_rule_recommendations','rule_based_alerts','decision_recommendations','evidence_media','reports')),'All 13 new tables have RLS and intended owner');

SELECT pg_temp.ok((SELECT count(*)=13 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='pathways' AND c.relname IN ('project_budget_records','budget_expense_entries','assessment_results','project_evaluation_criteria','project_evaluations','project_evaluation_scores','alert_rules','alert_rule_conditions','alert_rule_recommendations','rule_based_alerts','decision_recommendations','evidence_media','reports') AND a.attname='id' AND format_type(a.atttypid,a.atttypmod)='uuid' AND pg_get_expr(d.adbin,d.adrelid)='gen_random_uuid()'),'All 13 UUID defaults are database generated');

SELECT pg_temp.ok((SELECT NOT EXISTS(SELECT FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relname IN ('project_budget_records','budget_expense_entries','assessment_results','project_evaluation_criteria','project_evaluations','project_evaluation_scores','alert_rules','alert_rule_conditions','alert_rule_recommendations','rule_based_alerts','decision_recommendations','evidence_media','reports') AND k.contype='f' AND (k.confdeltype<>'r' OR NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid=k.conrelid AND (i.indkey::smallint[])[0:cardinality(k.conkey)-1] @> k.conkey)))),'All new foreign keys use RESTRICT with supporting leading indexes');

SELECT pg_temp.ok((SELECT NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='pathways' AND p.proname LIKE 'p3_%' AND (p.prosecdef OR (a.grantee=0 AND a.privilege_type='EXECUTE')))),'No SECURITY DEFINER or PUBLIC execution for Phase 3 functions');

SELECT pg_temp.reject($q$DELETE FROM pathways.project_budget_records WHERE id=pg_temp.u(401)$q$,'23514','project_budget_records history deletion rejected');

SELECT pg_temp.reject($q$DELETE FROM pathways.budget_expense_entries WHERE id=pg_temp.u(411)$q$,'23514','budget_expense_entries history deletion rejected');

SELECT pg_temp.reject($q$DELETE FROM pathways.assessment_results WHERE id=pg_temp.u(521)$q$,'23514','assessment_results history deletion rejected');

SELECT pg_temp.reject($q$DELETE FROM pathways.rule_based_alerts WHERE id=pg_temp.u(741)$q$,'23514','rule_based_alerts history deletion rejected');

SELECT pg_temp.reject($q$DELETE FROM pathways.decision_recommendations WHERE id=pg_temp.u(751)$q$,'23514','decision_recommendations history deletion rejected');

SELECT pg_temp.reject($q$DELETE FROM pathways.evidence_media WHERE id=pg_temp.u(421)$q$,'23514','evidence_media history deletion rejected');

SET CONSTRAINTS ALL IMMEDIATE;

SELECT pg_temp.ok((SELECT count(*)=126 FROM phase3_assertions),'All named assertions executed');

SELECT 'PHASE3_ASSERTIONS_PASSED='||count(*) FROM phase3_assertions;

ROLLBACK;
