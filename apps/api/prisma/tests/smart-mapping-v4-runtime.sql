-- 0084 smart mapping V4: disposable behavioral checks for pathways.p78_record_smart_mapping under AUTO_SMART_V4
-- (SYSTEM_COLUMN) and the kept AUTO_SMART_V3 path. Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or phase4/phase6 replay database that already
-- has 0084 applied. Success prints SMART_MAPPING_V4_RUNTIME=PASS.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Smart mapping V4 checks require a disposable local database'; END IF;
END $$;

-- Passed checks are counted in the transaction-local setting v4.passed.

INSERT INTO auth.users(id) VALUES
 ('84000000-0000-4000-8000-000000000011'),('84000000-0000-4000-8000-000000000012');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('84000000-0000-4000-8000-000000000001','SMART_V4_ORG','Synthetic smart mapping organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,'84000000-0000-4000-8000-000000000001',r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('84000000-0000-4000-8000-000000000031','PROJECT_OFFICER','84000000-0000-4000-8000-000000000011','Synthetic officer','v4-po@example.invalid'),
 ('84000000-0000-4000-8000-000000000032','MONITORING_AND_EVALUATION_OFFICER','84000000-0000-4000-8000-000000000012','Synthetic reviewer','v4-me@example.invalid')
) v(id,role_code,sub,name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000001','SMART_V4_A1','Synthetic project A1','84000000-0000-4000-8000-000000000031');
SET LOCAL session_replication_role = origin;
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES
 ('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000031','84000000-0000-4000-8000-000000000031'),
 ('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000032','84000000-0000-4000-8000-000000000031');
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id) VALUES
 ('84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','smart_v4_f1',1,'Synthetic F1','OTHER','DRAFT','84000000-0000-4000-8000-000000000031');
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no,source_names) VALUES
 ('84000000-0000-4000-8000-000000000061','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000051','first_name','First name','TEXT',true,1,ARRAY['Given name']),
 ('84000000-0000-4000-8000-000000000062','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000051','birth_date','Birth date','DATE',false,2,ARRAY['DOB']),
 ('84000000-0000-4000-8000-000000000063','84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000051','notes','Notes','TEXT',false,3,'{}');
UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id='84000000-0000-4000-8000-000000000032'
WHERE id='84000000-0000-4000-8000-000000000051';

-- Upload reservations normally come from the runtime upload path; fixtures bypass its triggers.
SET LOCAL session_replication_role = replica;
-- Batches: 81 the V4 result, 82 rejected inputs, 83 the kept V3 result.
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
 file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id)
SELECT v.id::uuid,'84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000051',1,
 'MANUAL_UPLOAD','synthetic.csv','CSV',rpad(replace(v.id,'-',''),64,'0'),gen_random_uuid(),'uploads',
 'organizations/84000000-0000-4000-8000-000000000001/projects/84000000-0000-4000-8000-000000000041/imports/'||v.id||'/'||rpad(replace(v.id,'-',''),64,'0')||'.csv',
 '84000000-0000-4000-8000-000000000031'
FROM (VALUES ('84000000-0000-4000-8000-000000000081'),('84000000-0000-4000-8000-000000000082'),('84000000-0000-4000-8000-000000000083')) v(id);
UPDATE pathways.data_import_batches b SET storage_status='STORED',status='UPLOADED',total_rows=2,
 source_headers='[{"key":"column_0001","columnIndex":1,"header":"Given name"},{"key":"column_0002","columnIndex":2,"header":"DOB"},{"key":"column_0003","columnIndex":3,"header":"_submission_time"}]'::jsonb
WHERE b.id::text LIKE '84000000-0000-4000-8000-00000000008_';
INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data)
SELECT b.organization_id,b.project_id,b.form_id,b.id,n+1,rpad(md5(b.id::text||n),64,'0'),
 CASE WHEN n=1 THEN '{"column_0001":"Synthetic-Secret-Cell-8401","column_0002":"2012-04-01","column_0003":"2001-02-03T04:05:06"}'::jsonb
  ELSE '{"column_0001":"Ana","column_0002":"2011-01-09","column_0003":"2001-02-03T05:06:07"}'::jsonb END
FROM pathways.data_import_batches b CROSS JOIN generate_series(1,2) n
WHERE b.id::text LIKE '84000000-0000-4000-8000-00000000008_';
SET LOCAL session_replication_role = origin;

-- Catalog: the replaced recorder keeps its signature, owner, security and grants; p38 is untouched.
DO $$ BEGIN
 IF NOT has_function_privilege('pathways_runtime','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
  AND p.prosrc ~ 'AUTO_SMART_V4' AND p.prosrc ~ 'SYSTEM_COLUMN')
 OR (SELECT count(*) FROM pg_proc WHERE proname='p78_record_smart_mapping')<>1
 OR (SELECT prosrc FROM pg_proc WHERE oid='pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure) ~ 'AUTO_SMART_V[34]'
 THEN RAISE EXCEPTION 'function catalog'; END IF;
 PERFORM set_config('v4.passed',(coalesce(nullif(current_setting('v4.passed',true),''),'0')::integer+1)::text,true);
END $$;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('request.jwt.claim.sub','84000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','84000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','84000000-0000-4000-8000-000000000031',true);

-- Rejected inputs: SYSTEM_COLUMN is V4-only and ignored-only with no target, suggestion, score or match reason.
DO $$
DECLARE c record; got text;
 good text := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0003","columnIndex":3,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"SYSTEM_COLUMN"}]';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('system column under V3','AUTO_SMART_V3',good),
  ('system column with target','AUTO_SMART_V4',jsonb_set(good::jsonb,'{2,targetFieldId}','"84000000-0000-4000-8000-000000000063"')::text),
  ('system column with suggestion','AUTO_SMART_V4',jsonb_set(good::jsonb,'{2,suggestedFieldId}','"84000000-0000-4000-8000-000000000063"')::text),
  ('system column with score and match reason','AUTO_SMART_V4',jsonb_set(jsonb_set(good::jsonb,'{2,score}','95'),'{2,matchReason}','"EXACT"')::text),
  ('pending system column','AUTO_SMART_V4',replace(good,'"status":"IGNORED"','"status":"PENDING"')),
  ('mapped system column','AUTO_SMART_V4',replace(good,'"reason":"AUTO_MATCH"},{"sourceKey":"column_0003"','"reason":"SYSTEM_COLUMN"},{"sourceKey":"column_0003"')),
  ('unknown algorithm id','AUTO_SMART_V5',good),
  ('null algorithm',NULL,good)
 ) v(label,alg,ds)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000082',0,c.alg,c.ds::jsonb);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM '22023' THEN RAISE EXCEPTION '%: expected SQLSTATE 22023 but got %', c.label, got; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='84000000-0000-4000-8000-000000000082')
 THEN RAISE EXCEPTION 'rejected input wrote rows'; END IF;
 PERFORM set_config('v4.passed',(coalesce(nullif(current_setting('v4.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- V4 records a system column as IGNORED; retries at either revision return the same receipt, a V3 retry conflicts.
DO $$
DECLARE receipt jsonb; again jsonb;
 good jsonb := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"SYSTEM_COLUMN"}]';
BEGIN
 receipt := pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V4',good);
 IF receipt IS DISTINCT FROM jsonb_build_object('batchId','84000000-0000-4000-8000-000000000081','mappingRevision',1,
  'mapped',2,'pending',0,'ignored',1,'requiredUnmapped',0,'complete',true) THEN RAISE EXCEPTION 'V4 receipt %', receipt; END IF;
 again := pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V4',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'V4 retry 1 receipt'; END IF;
 again := pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V4',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'V4 retry 0 receipt'; END IF;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V3',
   jsonb_set(good,'{2,reason}','"BLANK_COLUMN"'));
  RAISE EXCEPTION 'V3 retry of V4 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('v4.passed',(coalesce(nullif(current_setting('v4.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- A stored V3 result stays valid: a V3 retry is still idempotent and a V4 retry of it conflicts.
DO $$
DECLARE receipt jsonb; again jsonb;
 good jsonb := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"84000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]';
BEGIN
 receipt := pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000083',0,'AUTO_SMART_V3',good);
 again := pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000083',1,'AUTO_SMART_V3',good);
 IF again IS DISTINCT FROM receipt OR receipt->>'ignored'<>'1' THEN RAISE EXCEPTION 'V3 retry receipt'; END IF;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('84000000-0000-4000-8000-000000000083',1,'AUTO_SMART_V4',good);
  RAISE EXCEPTION 'V4 retry of V3 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('v4.passed',(coalesce(nullif(current_setting('v4.passed',true),''),'0')::integer+1)::text,true);
END $$;

RESET SESSION AUTHORIZATION;
-- Stored prefixes and one audit row per batch, each naming its own algorithm and synonym list; no sampled value.
DO $$ BEGIN
 IF (SELECT string_agg(source_field_name||'='||status||'='||validation_message,',' ORDER BY source_field_name)
   FROM pathways.metadata_mappings WHERE import_batch_id='84000000-0000-4000-8000-000000000081' AND revision=1)
  IS DISTINCT FROM 'column_0001=MAPPED=AUTO_SMART_V4:AUTO_MATCH,column_0002=MAPPED=AUTO_SMART_V4:AUTO_MATCH,column_0003=IGNORED=AUTO_SMART_V4:SYSTEM_COLUMN'
 OR (SELECT string_agg(validation_message,',' ORDER BY source_field_name)
   FROM pathways.metadata_mappings WHERE import_batch_id='84000000-0000-4000-8000-000000000083' AND revision=1)
  IS DISTINCT FROM 'AUTO_SMART_V3:AUTO_MATCH,AUTO_SMART_V3:AUTO_MATCH,AUTO_SMART_V3:BLANK_COLUMN'
 OR EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='84000000-0000-4000-8000-000000000081'
  AND source_field_name='column_0003' AND (target_field_id IS NOT NULL OR suggested_field_id IS NOT NULL
   OR match_score IS NOT NULL OR match_reason IS NOT NULL))
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='84000000-0000-4000-8000-000000000081')<>'(1,MAPPED)'
 THEN RAISE EXCEPTION 'stored revision'; END IF;
 IF (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='84000000-0000-4000-8000-000000000081'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND changes->>'algorithmVersion'='AUTO_SMART_V4'
  AND changes->>'synonymVersion'='SMART_SYNONYMS_V3' AND changes->'receipt'->>'ignored'='1')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='84000000-0000-4000-8000-000000000081')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='84000000-0000-4000-8000-000000000083'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND changes->>'algorithmVersion'='AUTO_SMART_V3'
  AND changes->>'synonymVersion'='SMART_SYNONYMS_V2')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='84000000-0000-4000-8000-000000000083')<>1
 THEN RAISE EXCEPTION 'audit rows'; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings m WHERE m.organization_id='84000000-0000-4000-8000-000000000001'
   AND to_jsonb(m)::text ~ '(Synthetic-Secret|2012-04-01|2001-02-03T|Ana)')
 OR EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id='84000000-0000-4000-8000-000000000001'
   AND a.changes::text ~ '(Synthetic-Secret|2012-04-01|2001-02-03T|Ana)')
 THEN RAISE EXCEPTION 'sampled value persisted'; END IF;
 PERFORM set_config('v4.passed',(coalesce(nullif(current_setting('v4.passed',true),''),'0')::integer+1)::text,true);
END $$;

SELECT 'SMART_MAPPING_V4_ASSERTIONS_PASSED=' || current_setting('v4.passed') AS result;
DO $$ BEGIN IF current_setting('v4.passed')::integer<>5 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
SELECT 'SMART_MAPPING_V4_RUNTIME=PASS' AS result;
ROLLBACK;
