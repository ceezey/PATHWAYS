-- cr-pathways-smart-import-mapping (0038): disposable behavioral checks for
-- pathways.p38_record_smart_mapping. Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or phase6 replay database that
-- already has 0038 applied. Success prints IMPORT_SMART_MAPPING_RUNTIME=PASS.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'Smart mapping checks require a disposable local database'; END IF;
END $$;

-- Passed checks are counted in the transaction-local setting smart_mapping.passed.

INSERT INTO auth.users(id) VALUES
 ('78000000-0000-4000-8000-000000000011'),('78000000-0000-4000-8000-000000000012'),
 ('78000000-0000-4000-8000-000000000013'),('78000000-0000-4000-8000-000000000014');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('78000000-0000-4000-8000-000000000001','SMART_ORG_A','Synthetic smart mapping organization A'),
 ('78000000-0000-4000-8000-000000000002','SMART_ORG_B','Synthetic smart mapping organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,v.org::uuid,r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000001','PROJECT_OFFICER','78000000-0000-4000-8000-000000000011','Synthetic officer','smart-po@example.invalid'),
 ('78000000-0000-4000-8000-000000000032','78000000-0000-4000-8000-000000000001','MONITORING_AND_EVALUATION_OFFICER','78000000-0000-4000-8000-000000000012','Synthetic reviewer','smart-me@example.invalid'),
 ('78000000-0000-4000-8000-000000000033','78000000-0000-4000-8000-000000000002','PROJECT_OFFICER','78000000-0000-4000-8000-000000000013','Synthetic foreign officer','smart-foreign@example.invalid'),
 ('78000000-0000-4000-8000-000000000034','78000000-0000-4000-8000-000000000002','MONITORING_AND_EVALUATION_OFFICER','78000000-0000-4000-8000-000000000014','Synthetic foreign reviewer','smart-foreign-me@example.invalid')
) v(id,org,role_code,sub,name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000001','SMART_A1','Synthetic project A1','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000042','78000000-0000-4000-8000-000000000001','SMART_A2','Synthetic project A2','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000002','SMART_B1','Synthetic project B1','78000000-0000-4000-8000-000000000033');
SET LOCAL session_replication_role = origin;
-- The officer is assigned to A1 only; A2 is the cross-project case.
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES
 ('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000032','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000033','78000000-0000-4000-8000-000000000033');
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id) VALUES
 ('78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','smart_f1',1,'Synthetic F1','OTHER','DRAFT','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000052','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','smart_f2',1,'Synthetic F2','OTHER','DRAFT','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000053','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000042','smart_f3',1,'Synthetic F3','OTHER','DRAFT','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000054','78000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000043','smart_f4',1,'Synthetic F4','OTHER','DRAFT','78000000-0000-4000-8000-000000000033');
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,allowed_values,sequence_no) VALUES
 ('78000000-0000-4000-8000-000000000061','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','first_name','First name','TEXT',true,NULL,1),
 ('78000000-0000-4000-8000-000000000062','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','birth_date','Birth date','DATE',false,NULL,2),
 ('78000000-0000-4000-8000-000000000063','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','sex','Sex','SELECT',false,'["MALE","FEMALE"]',3),
 ('78000000-0000-4000-8000-000000000064','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000052','other','Other form field','TEXT',false,NULL,1),
 ('78000000-0000-4000-8000-000000000065','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000042','78000000-0000-4000-8000-000000000053','first_name','First name','TEXT',false,NULL,1),
 ('78000000-0000-4000-8000-000000000066','78000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000054','first_name','First name','TEXT',false,NULL,1);
UPDATE pathways.digital_forms f SET status='PUBLISHED',published_at=now(),
 published_by_id=CASE WHEN f.organization_id='78000000-0000-4000-8000-000000000001'
  THEN '78000000-0000-4000-8000-000000000032'::uuid ELSE '78000000-0000-4000-8000-000000000034'::uuid END
WHERE f.id::text LIKE '78000000-0000-4000-8000-00000000005_';

-- Upload reservations normally come from the runtime upload path; fixtures bypass its triggers.
SET LOCAL session_replication_role = replica;
-- Stored batches: X1 happy path, X2 cross-project, X3 another uploader, X4 foreign organization,
-- X5 V1 first, X6 post-cleanup role state, X7 revoked upload permission.
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
 file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id)
SELECT v.id::uuid,v.org::uuid,v.project::uuid,v.form::uuid,1,'MANUAL_UPLOAD','synthetic.csv','CSV',
 rpad(replace(v.id,'-',''),64,'0'),gen_random_uuid(),'uploads',
 'organizations/'||v.org||'/projects/'||v.project||'/imports/'||v.id||'/'||rpad(replace(v.id,'-',''),64,'0')||'.csv',v.uploader::uuid
FROM (VALUES
 ('78000000-0000-4000-8000-000000000071','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000072','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000042','78000000-0000-4000-8000-000000000053','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000073','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000032'),
 ('78000000-0000-4000-8000-000000000074','78000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000054','78000000-0000-4000-8000-000000000033'),
 ('78000000-0000-4000-8000-000000000075','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000076','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000031'),
 ('78000000-0000-4000-8000-000000000077','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051','78000000-0000-4000-8000-000000000031')
) v(id,org,project,form,uploader);
UPDATE pathways.data_import_batches b SET storage_status='STORED',status='UPLOADED',total_rows=2,
 source_headers=CASE WHEN b.id='78000000-0000-4000-8000-000000000075'
  THEN '[{"key":"column_0001","columnIndex":1,"header":"First name"},{"key":"column_0002","columnIndex":2,"header":"Birth date"},{"key":"column_0003","columnIndex":3,"header":"Gender"}]'::jsonb
  ELSE '[{"key":"column_0001","columnIndex":1,"header":"Given name"},{"key":"column_0002","columnIndex":2,"header":"DOB"},{"key":"column_0003","columnIndex":3,"header":"Gender"}]'::jsonb END
WHERE b.id::text LIKE '78000000-0000-4000-8000-00000000007_';
INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data)
SELECT b.organization_id,b.project_id,b.form_id,b.id,n+1,rpad(md5(b.id::text||n),64,'0'),
 CASE WHEN n=1 THEN '{"column_0001":"Synthetic-Secret-Cell-5521","column_0002":"2012-04-01","column_0003":"FEMALE"}'::jsonb
  ELSE '{"column_0001":"Ana","column_0002":"2011-01-09","column_0003":"MALE"}'::jsonb END
FROM pathways.data_import_batches b CROSS JOIN generate_series(1,2) n
WHERE b.id::text LIKE '78000000-0000-4000-8000-00000000007_';

SET LOCAL session_replication_role = origin;

-- Catalog: exact function authority, V1 kept, callee privileges held by prisma directly.
DO $$ BEGIN
 IF NOT has_function_privilege('pathways_runtime','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('pathways_runtime','pathways.p29_auto_map_import(uuid,integer)','EXECUTE')
 OR EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND (pg_get_userbyid(p.proowner)<>'prisma' OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']))
 THEN RAISE EXCEPTION 'function catalog'; END IF;
 -- The only helper chain it calls is prisma-owned and granted to prisma by ownership.
 IF EXISTS(SELECT FROM unnest(ARRAY['pathways.p05_has_project_permission(text,uuid)','pathways.p09_role_allows(text,text)']) f(sig)
  JOIN pg_proc p ON p.oid=to_regprocedure(f.sig) WHERE pg_get_userbyid(p.proowner)<>'prisma')
 OR EXISTS(SELECT FROM pg_class c WHERE c.relnamespace='pathways'::regnamespace
  AND c.relname IN('data_import_batches','data_import_rows','digital_forms','form_fields','metadata_mappings','audit_logs')
  AND (pg_get_userbyid(c.relowner)<>'prisma' OR c.relforcerowsecurity))
 THEN RAISE EXCEPTION 'callee ownership'; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','78000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','78000000-0000-4000-8000-000000000031',true);

-- Rejected inputs: every case fails before any row is written, without echoing values.
DO $$
DECLARE c record; got text;
 good text := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":"78000000-0000-4000-8000-000000000063","score":80,"matchReason":"SYNONYM_REVIEW","reason":"SUGGESTED"}]';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('V1 algorithm id','AUTO_CODE_LABEL_V1',0,good,'22023'),
  ('unknown algorithm id','AUTO_SMART_V3',0,good,'22023'),
  ('null algorithm',NULL,0,good,'22023'),
  ('bad expected revision','AUTO_SMART_V2',2,good,'22023'),
  ('not an array','AUTO_SMART_V2',0,'{"a":1}','22023'),
  ('stale expected revision','AUTO_SMART_V2',1,good,'40001'),
  ('too few decisions','AUTO_SMART_V2',0,(good::jsonb - 2)::text,'22023'),
  ('wrong source key order','AUTO_SMART_V2',0,replace(replace(good,'"column_0001"','"column_0009"'),'"column_0002"','"column_0001"'),'22023'),
  ('extra sampled value key','AUTO_SMART_V2',0,jsonb_set(good::jsonb,'{0,sample}','"Synthetic-Secret-Cell-5521"')::text,'22023'),
  ('score above 100','AUTO_SMART_V2',0,replace(good,'"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"','"score":101,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"'),'22023'),
  ('fractional score','AUTO_SMART_V2',0,replace(good,'"score":80','"score":80.5'),'22023'),
  ('string score','AUTO_SMART_V2',0,replace(good,'"score":80','"score":"80"'),'22023'),
  ('suggestion below floor','AUTO_SMART_V2',0,replace(good,'"score":80','"score":59'),'22023'),
  ('mapped below auto band','AUTO_SMART_V2',0,replace(good,'"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"','"score":85,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"'),'22023'),
  ('review synonym auto-mapped','AUTO_SMART_V2',0,replace(good,'"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"','"score":90,"matchReason":"SYNONYM_REVIEW","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"'),'22023'),
  ('unknown reason','AUTO_SMART_V2',0,replace(good,'"SUGGESTED"','"TRUSTED"'),'22023'),
  ('unknown match reason','AUTO_SMART_V2',0,replace(good,'"SYNONYM_REVIEW"','"MODEL"'),'22023'),
  ('duplicate mapped target','AUTO_SMART_V2',0,replace(good,'"targetFieldId":"78000000-0000-4000-8000-000000000062"','"targetFieldId":"78000000-0000-4000-8000-000000000061"'),'22023'),
  ('suggestion of a mapped field','AUTO_SMART_V2',0,replace(good,'"suggestedFieldId":"78000000-0000-4000-8000-000000000063"','"suggestedFieldId":"78000000-0000-4000-8000-000000000061"'),'22023'),
  ('other form target','AUTO_SMART_V2',0,replace(good,'"targetFieldId":"78000000-0000-4000-8000-000000000062"','"targetFieldId":"78000000-0000-4000-8000-000000000064"'),'22023'),
  ('cross-project target','AUTO_SMART_V2',0,replace(good,'"targetFieldId":"78000000-0000-4000-8000-000000000062"','"targetFieldId":"78000000-0000-4000-8000-000000000065"'),'22023'),
  ('cross-organization suggestion','AUTO_SMART_V2',0,replace(good,'"suggestedFieldId":"78000000-0000-4000-8000-000000000063"','"suggestedFieldId":"78000000-0000-4000-8000-000000000066"'),'22023'),
  ('non-uuid target','AUTO_SMART_V2',0,replace(good,'"78000000-0000-4000-8000-000000000062"','"x'' OR 1=1"'),'22023'),
  ('pending with target','AUTO_SMART_V2',0,replace(good,'"status":"PENDING","targetFieldId":null','"status":"PENDING","targetFieldId":"78000000-0000-4000-8000-000000000064"'),'22023'),
  ('ignored status','AUTO_SMART_V2',0,replace(good,'"status":"PENDING"','"status":"IGNORED"'),'22023')
 ) v(label,alg,rev,ds,wanted)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000071',c.rev,c.alg,c.ds::jsonb);
  EXCEPTION WHEN OTHERS THEN
   got := SQLSTATE;
   IF SQLERRM ~ 'Synthetic-Secret' THEN RAISE EXCEPTION '% echoed a value', c.label; END IF;
  END;
  IF got IS DISTINCT FROM c.wanted THEN RAISE EXCEPTION '%: expected SQLSTATE % but got %', c.label, c.wanted, got; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='78000000-0000-4000-8000-000000000071')
 THEN RAISE EXCEPTION 'rejected input wrote rows'; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Happy path, then identical retries (expected 0 or 1) return the same receipt without writes.
DO $$
DECLARE receipt jsonb; again jsonb;
 good jsonb := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":"78000000-0000-4000-8000-000000000063","score":80,"matchReason":"SYNONYM_REVIEW","reason":"SUGGESTED"}]';
BEGIN
 receipt := pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000071',0,'AUTO_SMART_V2',good);
 IF receipt IS DISTINCT FROM jsonb_build_object('batchId','78000000-0000-4000-8000-000000000071','mappingRevision',1,
  'mapped',2,'pending',1,'requiredUnmapped',0,'complete',false) THEN RAISE EXCEPTION 'receipt %', receipt; END IF;
 again := pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000071',1,'AUTO_SMART_V2',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'retry 1 receipt'; END IF;
 again := pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000071',0,'AUTO_SMART_V2',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'retry 0 receipt'; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
 -- A changed recomputation is a conflict, never a second revision.
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000071',1,'AUTO_SMART_V2',
   jsonb_set(jsonb_set(jsonb_set(jsonb_set(good,'{2,suggestedFieldId}','null'),'{2,score}','null'),'{2,matchReason}','null'),'{2,reason}','"NO_MATCH"'));
  RAISE EXCEPTION 'changed retry accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- V1 cannot treat the V2 revision as its own retry.
 BEGIN
  PERFORM pathways.p29_auto_map_import('78000000-0000-4000-8000-000000000071',1);
  RAISE EXCEPTION 'V1 retry of V2 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- The runtime role cannot write suggestion columns directly (imports.review policy for a PO).
DO $$ BEGIN
 BEGIN
  INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,revision,source_field_name,
   status,suggested_field_id,match_score,match_reason)
  VALUES('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051',
   '78000000-0000-4000-8000-000000000076',1,'column_0001','PENDING','78000000-0000-4000-8000-000000000061',95,'EXACT');
  RAISE EXCEPTION 'officer wrote mapping rows directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- V1 first: a later V2 call conflicts.
DO $$ BEGIN
 PERFORM pathways.p29_auto_map_import('78000000-0000-4000-8000-000000000075',0);
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000075',1,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":"78000000-0000-4000-8000-000000000063","score":80,"matchReason":"SYNONYM_REVIEW","reason":"SUGGESTED"}]');
  RAISE EXCEPTION 'V2 accepted a V1 revision';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Denials: cross-project batch (no assignment), another uploader's batch.
DO $$
DECLARE c record; got text;
 one_pending text := '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('cross-project','78000000-0000-4000-8000-000000000072'),
  ('another uploader','78000000-0000-4000-8000-000000000073'),
  ('cross-organization','78000000-0000-4000-8000-000000000074'),
  ('unknown batch','78000000-0000-4000-8000-000000000079')
 ) v(label,batch)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p38_record_smart_mapping(c.batch::uuid,0,'AUTO_SMART_V2',one_pending::jsonb);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '% expected 42501 got %', c.label, got; END IF;
 END LOOP;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- The foreign officer cannot map organization A's batch, and cannot target A's fields from B.
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','78000000-0000-4000-8000-000000000002',true),
 set_config('app.user_id','78000000-0000-4000-8000-000000000033',true);
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000076',0,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'foreign officer on A: %', got; END IF;
 got := NULL;
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000074',0,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'foreign field target: %', got; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='78000000-0000-4000-8000-000000000074')
 THEN RAISE EXCEPTION 'foreign target wrote rows'; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- A forged subject for organization A's officer fails closed.
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','78000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','78000000-0000-4000-8000-000000000031',true);
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000076',0,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'forged subject: %', got; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

RESET ROLE;
-- Stored rows, batch state and audit for X1; no sampled value anywhere.
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.metadata_mappings WHERE import_batch_id='78000000-0000-4000-8000-000000000071' AND revision=1)<>3
 OR NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='78000000-0000-4000-8000-000000000071'
  AND source_field_name='column_0001' AND status='MAPPED' AND target_field_id='78000000-0000-4000-8000-000000000061'
  AND suggested_field_id IS NULL AND match_score=90 AND match_reason='SYNONYM' AND validation_message='AUTO_SMART_V2:AUTO_MATCH')
 OR NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='78000000-0000-4000-8000-000000000071'
  AND source_field_name='column_0003' AND status='PENDING' AND target_field_id IS NULL
  AND suggested_field_id='78000000-0000-4000-8000-000000000063' AND match_score=80 AND match_reason='SYNONYM_REVIEW'
  AND validation_message='AUTO_SMART_V2:SUGGESTED')
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='78000000-0000-4000-8000-000000000071')<>'(1,UPLOADED)'
 OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id='78000000-0000-4000-8000-000000000071' AND mapping_revision<>1)
 THEN RAISE EXCEPTION 'stored revision'; END IF;
 IF (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='78000000-0000-4000-8000-000000000071'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND actor_user_id='78000000-0000-4000-8000-000000000031'
  AND changes->>'algorithmVersion'='AUTO_SMART_V2' AND changes->>'synonymVersion'='SMART_SYNONYMS_V2'
  AND jsonb_array_length(changes->'decisions')=3 AND changes->'receipt'->>'mapped'='2')<>1
 THEN RAISE EXCEPTION 'single audit row'; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings m WHERE m.organization_id='78000000-0000-4000-8000-000000000001'
   AND to_jsonb(m)::text ~ '(Synthetic-Secret|2012-04-01|FEMALE|Ana)')
 OR EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id='78000000-0000-4000-8000-000000000001'
   AND a.changes::text ~ '(Synthetic-Secret|2012-04-01|FEMALE|Ana)')
 THEN RAISE EXCEPTION 'sampled value persisted'; END IF;
 -- A reviewer's manual row cannot carry a suggestion on a MAPPED status (shape constraint).
 BEGIN
  INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,revision,source_field_name,
   status,target_field_id,suggested_field_id,match_score,match_reason)
  VALUES('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051',
   '78000000-0000-4000-8000-000000000071',2,'column_0001','MAPPED','78000000-0000-4000-8000-000000000061',
   '78000000-0000-4000-8000-000000000062',95,'EXACT');
  RAISE EXCEPTION 'mapped row with suggestion accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,revision,source_field_name,
   status,suggested_field_id,match_score,match_reason)
  VALUES('78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000051',
   '78000000-0000-4000-8000-000000000071',2,'column_0002','PENDING','78000000-0000-4000-8000-000000000064',95,'EXACT');
  RAISE EXCEPTION 'cross-form suggestion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Hosted role reality: with every owner-role membership of prisma revoked (as the 0031/0034
-- cleanups do), the definer still maps. The revocation is inside this rolled-back transaction.
DO $$ DECLARE m record; BEGIN
 FOR m IN SELECT r.rolname AS role_name, g.rolname AS grantor_name FROM pg_auth_members a
  JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles g ON g.oid=a.grantor
  WHERE a.member=(SELECT oid FROM pg_roles WHERE rolname='prisma')
 LOOP
  EXECUTE format('REVOKE %I FROM prisma GRANTED BY %I', m.role_name, m.grantor_name);
 END LOOP;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='prisma'))
 THEN RAISE EXCEPTION 'memberships remain'; END IF;
 IF has_function_privilege('prisma','pathways.runtime_context_organization()','EXECUTE')
 THEN RAISE EXCEPTION 'prisma still executes the postgres-owned context helper'; END IF;
END $$;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','78000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','78000000-0000-4000-8000-000000000031',true);
DO $$ BEGIN
 IF (pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000076',0,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"78000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":90,"matchReason":"SYNONYM","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"EMPTY_NAME"}]'
  )->>'mapped')<>'1' THEN RAISE EXCEPTION 'post-cleanup mapping'; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Revoked imports.upload: the next call is denied (checked live, not from the API).
RESET ROLE;
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_OFFICER' AND p.code='imports.upload';
SET LOCAL ROLE pathways_runtime;
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('78000000-0000-4000-8000-000000000077',0,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'revoked upload: %', got; END IF;
 PERFORM set_config('smart_mapping.passed',(coalesce(nullif(current_setting('smart_mapping.passed',true),''),'0')::integer+1)::text,true);
END $$;
RESET ROLE;

SELECT 'IMPORT_SMART_MAPPING_ASSERTIONS_PASSED=' || current_setting('smart_mapping.passed') AS result;
DO $$ BEGIN IF current_setting('smart_mapping.passed')::integer<>12 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
SELECT 'IMPORT_SMART_MAPPING_RUNTIME=PASS' AS result;
ROLLBACK;
