-- 0088 smart mapping V5: disposable behavioral checks for pathways.p78_record_smart_mapping under AUTO_SMART_V5
-- (CALCULATED_FIELD, SUBMISSION_TIME, SYSTEM_COLUMN) and its retries across V3, V4 and V5. Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or phase4/phase6 replay database that already
-- has 0088 applied. The harness prints SMART_MAPPING_V5_RUNTIME=PASS when this file succeeds.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Smart mapping V5 checks require a disposable local database'; END IF;
END $$;

-- Passed checks are counted in the transaction-local setting v5.passed.

INSERT INTO auth.users(id) VALUES
 ('88000000-0000-4000-8000-000000000011'),('88000000-0000-4000-8000-000000000012');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('88000000-0000-4000-8000-000000000001','SMART_V5_ORG','Synthetic smart mapping organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,'88000000-0000-4000-8000-000000000001',r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('88000000-0000-4000-8000-000000000031','PROJECT_OFFICER','88000000-0000-4000-8000-000000000011','Synthetic officer','v5-po@example.invalid'),
 ('88000000-0000-4000-8000-000000000032','MONITORING_AND_EVALUATION_OFFICER','88000000-0000-4000-8000-000000000012','Synthetic reviewer','v5-me@example.invalid')
) v(id,role_code,sub,name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000001','SMART_V5_A1','Synthetic project A1','88000000-0000-4000-8000-000000000031');
SET LOCAL session_replication_role = origin;
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES
 ('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000031','88000000-0000-4000-8000-000000000031'),
 ('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000032','88000000-0000-4000-8000-000000000031');
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id) VALUES
 ('88000000-0000-4000-8000-000000000051','88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','smart_v5_f1',1,'Synthetic F1','OTHER','DRAFT','88000000-0000-4000-8000-000000000031');
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,sequence_no,source_names) VALUES
 ('88000000-0000-4000-8000-000000000061','88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000051','first_name','First name','TEXT',true,1,ARRAY['Given name']),
 ('88000000-0000-4000-8000-000000000062','88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000051','birth_date','Birth date','DATE',false,2,ARRAY['DOB']),
 ('88000000-0000-4000-8000-000000000063','88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000051','notes','Notes','TEXT',false,3,'{}');
UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id='88000000-0000-4000-8000-000000000032'
WHERE id='88000000-0000-4000-8000-000000000051';

-- Upload reservations normally come from the runtime upload path; fixtures bypass its triggers.
SET LOCAL session_replication_role = replica;
-- Batches: 81 the V5 result, 82 rejected inputs, 83 a stored V4 result, 84-86 one accepted reason each, 87 a pending suggestion.
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
 file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id)
SELECT v.id::uuid,'88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000041','88000000-0000-4000-8000-000000000051',1,
 'MANUAL_UPLOAD','synthetic.csv','CSV',rpad(replace(v.id,'-',''),64,'0'),gen_random_uuid(),'uploads',
 'organizations/88000000-0000-4000-8000-000000000001/projects/88000000-0000-4000-8000-000000000041/imports/'||v.id||'/'||rpad(replace(v.id,'-',''),64,'0')||'.csv',
 '88000000-0000-4000-8000-000000000031'
FROM (SELECT '88000000-0000-4000-8000-00000000008'||n AS id FROM generate_series(1,7) n) v;
UPDATE pathways.data_import_batches b SET storage_status='STORED',status='UPLOADED',total_rows=2,
 source_headers='[{"key":"column_0001","columnIndex":1,"header":"Given name"},{"key":"column_0002","columnIndex":2,"header":"DOB"},{"key":"column_0003","columnIndex":3,"header":"age_calc"},{"key":"column_0004","columnIndex":4,"header":"_submission_time"},{"key":"column_0005","columnIndex":5,"header":"start"}]'::jsonb
WHERE b.id::text LIKE '88000000-0000-4000-8000-00000000008_';
INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data)
SELECT b.organization_id,b.project_id,b.form_id,b.id,n+1,rpad(md5(b.id::text||n),64,'0'),
 CASE WHEN n=1 THEN '{"column_0001":"Synthetic-Secret-Cell-8801","column_0002":"2012-04-01","column_0003":"14","column_0004":"2001-02-03T04:05:06","column_0005":"2001-02-03T03:04:05"}'::jsonb
  ELSE '{"column_0001":"Ana","column_0002":"2011-01-09","column_0003":"15","column_0004":"2001-02-03T05:06:07","column_0005":"2001-02-03T04:05:06"}'::jsonb END
FROM pathways.data_import_batches b CROSS JOIN generate_series(1,2) n
WHERE b.id::text LIKE '88000000-0000-4000-8000-00000000008_';
SET LOCAL session_replication_role = origin;

-- The V5 decisions every block starts from: two mapped fields, then one column per V5 ignore reason.
DO $$ BEGIN PERFORM set_config('v5.good','[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"88000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
 '{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"88000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
 '{"sourceKey":"column_0003","columnIndex":3,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"CALCULATED_FIELD"},'
 '{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"SUBMISSION_TIME"},'
 '{"sourceKey":"column_0005","columnIndex":5,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"SYSTEM_COLUMN"}]',true); END $$;

-- Catalog: one recorder that keeps its signature, owner, security and grants; p38 is untouched.
DO $$ BEGIN
 IF NOT has_function_privilege('pathways_runtime','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
  AND p.prosrc ~ 'AUTO_SMART_V5' AND p.prosrc ~ 'CALCULATED_FIELD' AND p.prosrc ~ 'SUBMISSION_TIME'
  AND NOT EXISTS(SELECT FROM aclexplode(p.proacl) a
   WHERE a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='pathways_runtime'))))
 OR (SELECT count(*) FROM pg_proc WHERE proname='p78_record_smart_mapping')<>1
 OR (SELECT prosrc FROM pg_proc WHERE oid='pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure) ~ 'AUTO_SMART_V[345]|CALCULATED_FIELD|SUBMISSION_TIME'
 THEN RAISE EXCEPTION 'function catalog'; END IF;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('request.jwt.claim.sub','88000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','88000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','88000000-0000-4000-8000-000000000031',true);

-- Rejected inputs, each in its own savepoint: the V5 reasons are V5-only and ignored-only with no target, suggestion,
-- score or match reason, and a field is still suggested at most once and never both mapped and suggested.
DO $$
DECLARE c record; got text; good jsonb := current_setting('v5.good')::jsonb;
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('calculated field under V4','AUTO_SMART_V4',jsonb_set(good,'{3,reason}','"SYSTEM_COLUMN"')),
  ('submission time under V4','AUTO_SMART_V4',jsonb_set(good,'{2,reason}','"SYSTEM_COLUMN"')),
  ('calculated field under V3','AUTO_SMART_V3',jsonb_set(jsonb_set(good,'{3,reason}','"BLANK_COLUMN"'),'{4,reason}','"BLANK_COLUMN"')),
  ('submission time under V3','AUTO_SMART_V3',jsonb_set(jsonb_set(good,'{2,reason}','"BLANK_COLUMN"'),'{4,reason}','"BLANK_COLUMN"')),
  ('mapped calculated field','AUTO_SMART_V5',jsonb_set(good,'{2}','{"sourceKey":"column_0003","columnIndex":3,"status":"MAPPED","targetFieldId":"88000000-0000-4000-8000-000000000063","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"CALCULATED_FIELD"}')),
  ('mapped submission time','AUTO_SMART_V5',jsonb_set(good,'{3}','{"sourceKey":"column_0004","columnIndex":4,"status":"MAPPED","targetFieldId":"88000000-0000-4000-8000-000000000063","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"SUBMISSION_TIME"}')),
  ('pending calculated field','AUTO_SMART_V5',jsonb_set(good,'{2,status}','"PENDING"')),
  ('pending submission time','AUTO_SMART_V5',jsonb_set(good,'{3,status}','"PENDING"')),
  ('suggested calculated field','AUTO_SMART_V5',jsonb_set(jsonb_set(jsonb_set(jsonb_set(good,'{2,status}','"PENDING"'),'{2,suggestedFieldId}','"88000000-0000-4000-8000-000000000063"'),'{2,score}','70'),'{2,matchReason}','"TOKEN_SET"')),
  ('suggested submission time','AUTO_SMART_V5',jsonb_set(jsonb_set(jsonb_set(jsonb_set(good,'{3,status}','"PENDING"'),'{3,suggestedFieldId}','"88000000-0000-4000-8000-000000000063"'),'{3,score}','70'),'{3,matchReason}','"TOKEN_SET"')),
  ('calculated field with target','AUTO_SMART_V5',jsonb_set(good,'{2,targetFieldId}','"88000000-0000-4000-8000-000000000063"')),
  ('calculated field with suggestion','AUTO_SMART_V5',jsonb_set(good,'{2,suggestedFieldId}','"88000000-0000-4000-8000-000000000063"')),
  ('calculated field with score and match reason','AUTO_SMART_V5',jsonb_set(jsonb_set(good,'{2,score}','95'),'{2,matchReason}','"EXACT"')),
  ('submission time with target','AUTO_SMART_V5',jsonb_set(good,'{3,targetFieldId}','"88000000-0000-4000-8000-000000000063"')),
  ('submission time with suggestion','AUTO_SMART_V5',jsonb_set(good,'{3,suggestedFieldId}','"88000000-0000-4000-8000-000000000063"')),
  ('submission time with score and match reason','AUTO_SMART_V5',jsonb_set(jsonb_set(good,'{3,score}','95'),'{3,matchReason}','"EXACT"')),
  ('V5 system column with target','AUTO_SMART_V5',jsonb_set(good,'{4,targetFieldId}','"88000000-0000-4000-8000-000000000063"')),
  ('pending V5 system column','AUTO_SMART_V5',jsonb_set(good,'{4,status}','"PENDING"')),
  ('pending suggestion repeating a mapped field','AUTO_SMART_V5',jsonb_set(good,'{2}','{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":"88000000-0000-4000-8000-000000000061","score":70,"matchReason":"TOKEN_SET","reason":"SUGGESTED"}')),
  ('unknown algorithm id','AUTO_SMART_V6',good),
  ('null algorithm',NULL,good)
 ) v(label,alg,ds)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000082',0,c.alg,c.ds);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM '22023' THEN RAISE EXCEPTION '%: expected SQLSTATE 22023 but got %', c.label, got; END IF;
 END LOOP;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- V5 records all three ignore reasons; retries at either revision return the same receipt, V4 and V3 retries conflict.
DO $$
DECLARE receipt jsonb; again jsonb; good jsonb := current_setting('v5.good')::jsonb;
BEGIN
 receipt := pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V5',good);
 IF receipt IS DISTINCT FROM jsonb_build_object('batchId','88000000-0000-4000-8000-000000000081','mappingRevision',1,
  'mapped',2,'pending',0,'ignored',3,'requiredUnmapped',0,'complete',true) THEN RAISE EXCEPTION 'V5 receipt %', receipt; END IF;
 again := pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V5',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'V5 retry 1 receipt'; END IF;
 again := pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V5',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'V5 retry 0 receipt'; END IF;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V4',
   jsonb_set(jsonb_set(good,'{2,reason}','"SYSTEM_COLUMN"'),'{3,reason}','"SYSTEM_COLUMN"'));
  RAISE EXCEPTION 'V4 retry of V5 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V3',
   jsonb_set(jsonb_set(jsonb_set(good,'{2,reason}','"BLANK_COLUMN"'),'{3,reason}','"BLANK_COLUMN"'),'{4,reason}','"BLANK_COLUMN"'));
  RAISE EXCEPTION 'V3 retry of V5 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- A stored V4 result stays valid: a V4 retry is still idempotent and a V5 retry of the same decisions conflicts.
DO $$
DECLARE receipt jsonb; again jsonb;
 v4 jsonb := jsonb_set(jsonb_set(current_setting('v5.good')::jsonb,'{2,reason}','"BLANK_COLUMN"'),'{3,reason}','"SYSTEM_COLUMN"');
BEGIN
 receipt := pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000083',0,'AUTO_SMART_V4',v4);
 again := pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000083',1,'AUTO_SMART_V4',v4);
 IF again IS DISTINCT FROM receipt OR receipt->>'ignored'<>'3' THEN RAISE EXCEPTION 'V4 retry receipt'; END IF;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('88000000-0000-4000-8000-000000000083',1,'AUTO_SMART_V5',v4);
  RAISE EXCEPTION 'V5 retry of V4 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Accepted inputs, each in its own savepoint: one V5 ignore reason per batch, and a pending suggestion of an unmapped field.
DO $$
DECLARE c record; got jsonb; good jsonb := current_setting('v5.good')::jsonb;
 blank jsonb := jsonb_set(jsonb_set(current_setting('v5.good')::jsonb,'{3,reason}','"BLANK_COLUMN"'),'{4,reason}','"BLANK_COLUMN"');
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('calculated field','88000000-0000-4000-8000-000000000084',blank,'0'),
  ('submission time','88000000-0000-4000-8000-000000000085',jsonb_set(blank,'{2,reason}','"SUBMISSION_TIME"'),'0'),
  ('system column','88000000-0000-4000-8000-000000000086',jsonb_set(blank,'{2,reason}','"SYSTEM_COLUMN"'),'0'),
  ('pending suggestion of an unmapped field','88000000-0000-4000-8000-000000000087',jsonb_set(good,'{2}','{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":"88000000-0000-4000-8000-000000000063","score":70,"matchReason":"TOKEN_SET","reason":"SUGGESTED"}'),'1')
 ) v(label,batch,ds,pending)
 LOOP
  BEGIN
   got := pathways.p78_record_smart_mapping(c.batch::uuid,0,'AUTO_SMART_V5',c.ds);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%: refused with SQLSTATE %', c.label, SQLSTATE; END;
  IF got->>'pending' IS DISTINCT FROM c.pending OR got->>'mapped'<>'2' THEN RAISE EXCEPTION '%: receipt %', c.label, got; END IF;
 END LOOP;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

RESET SESSION AUTHORIZATION;
-- Stored prefixes and one audit row per recorded batch, each naming its own algorithm and synonym list; no sampled value.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='88000000-0000-4000-8000-000000000082')
 THEN RAISE EXCEPTION 'rejected input wrote rows'; END IF;
 IF (SELECT string_agg(source_field_name||'='||status||'='||validation_message,',' ORDER BY source_field_name)
   FROM pathways.metadata_mappings WHERE import_batch_id='88000000-0000-4000-8000-000000000081' AND revision=1)
  IS DISTINCT FROM 'column_0001=MAPPED=AUTO_SMART_V5:AUTO_MATCH,column_0002=MAPPED=AUTO_SMART_V5:AUTO_MATCH,'
   'column_0003=IGNORED=AUTO_SMART_V5:CALCULATED_FIELD,column_0004=IGNORED=AUTO_SMART_V5:SUBMISSION_TIME,'
   'column_0005=IGNORED=AUTO_SMART_V5:SYSTEM_COLUMN'
 OR (SELECT string_agg(validation_message,',' ORDER BY import_batch_id)
   FROM pathways.metadata_mappings WHERE import_batch_id IN ('88000000-0000-4000-8000-000000000084',
    '88000000-0000-4000-8000-000000000085','88000000-0000-4000-8000-000000000086') AND source_field_name='column_0003' AND revision=1)
  IS DISTINCT FROM 'AUTO_SMART_V5:CALCULATED_FIELD,AUTO_SMART_V5:SUBMISSION_TIME,AUTO_SMART_V5:SYSTEM_COLUMN'
 OR (SELECT string_agg(validation_message,',' ORDER BY source_field_name)
   FROM pathways.metadata_mappings WHERE import_batch_id='88000000-0000-4000-8000-000000000083' AND revision=1)
  IS DISTINCT FROM 'AUTO_SMART_V4:AUTO_MATCH,AUTO_SMART_V4:AUTO_MATCH,AUTO_SMART_V4:BLANK_COLUMN,AUTO_SMART_V4:SYSTEM_COLUMN,AUTO_SMART_V4:SYSTEM_COLUMN'
 OR EXISTS(SELECT FROM pathways.metadata_mappings WHERE organization_id='88000000-0000-4000-8000-000000000001'
  AND status='IGNORED' AND (target_field_id IS NOT NULL OR suggested_field_id IS NOT NULL
   OR match_score IS NOT NULL OR match_reason IS NOT NULL))
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='88000000-0000-4000-8000-000000000081')<>'(1,MAPPED)'
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='88000000-0000-4000-8000-000000000087')<>'(1,UPLOADED)'
 THEN RAISE EXCEPTION 'stored revision'; END IF;
 IF (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='88000000-0000-4000-8000-000000000081'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND changes->>'algorithmVersion'='AUTO_SMART_V5'
  AND changes->>'synonymVersion'='SMART_SYNONYMS_V3' AND changes->'receipt'->>'ignored'='3')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='88000000-0000-4000-8000-000000000081')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='88000000-0000-4000-8000-000000000083'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND changes->>'algorithmVersion'='AUTO_SMART_V4'
  AND changes->>'synonymVersion'='SMART_SYNONYMS_V3')<>1
 OR (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='88000000-0000-4000-8000-000000000083')<>1
 THEN RAISE EXCEPTION 'audit rows'; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings m WHERE m.organization_id='88000000-0000-4000-8000-000000000001'
   AND to_jsonb(m)::text ~ '(Synthetic-Secret|2012-04-01|2001-02-03T|Ana)')
 OR EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id='88000000-0000-4000-8000-000000000001'
   AND a.changes::text ~ '(Synthetic-Secret|2012-04-01|2001-02-03T|Ana)')
 THEN RAISE EXCEPTION 'sampled value persisted'; END IF;
 PERFORM set_config('v5.passed',(coalesce(nullif(current_setting('v5.passed',true),''),'0')::integer+1)::text,true);
END $$;

SELECT 'SMART_MAPPING_V5_ASSERTIONS_PASSED=' || current_setting('v5.passed') AS result;
DO $$ BEGIN IF current_setting('v5.passed')::integer<>6 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
ROLLBACK;
