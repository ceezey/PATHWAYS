-- cr-pathways-metadata-import-intake (0078): disposable behavioral checks for the form field intake metadata
-- columns and pathways.p78_record_smart_mapping (AUTO_SMART_V3). Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or phase4/phase6 replay database that already
-- has 0078 applied. Success prints IMPORT_INTAKE_RUNTIME=PASS.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'Import intake checks require a disposable local database'; END IF;
END $$;

-- Passed checks are counted in the transaction-local setting intake.passed.

INSERT INTO auth.users(id) VALUES
 ('79000000-0000-4000-8000-000000000011'),('79000000-0000-4000-8000-000000000012'),
 ('79000000-0000-4000-8000-000000000013'),('79000000-0000-4000-8000-000000000014'),
 ('79000000-0000-4000-8000-000000000015');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('79000000-0000-4000-8000-000000000001','INTAKE_ORG_A','Synthetic intake organization A'),
 ('79000000-0000-4000-8000-000000000002','INTAKE_ORG_B','Synthetic intake organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,v.org::uuid,r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000001','PROJECT_OFFICER','79000000-0000-4000-8000-000000000011','Synthetic officer','intake-po@example.invalid'),
 ('79000000-0000-4000-8000-000000000032','79000000-0000-4000-8000-000000000001','MONITORING_AND_EVALUATION_OFFICER','79000000-0000-4000-8000-000000000012','Synthetic reviewer','intake-me@example.invalid'),
 ('79000000-0000-4000-8000-000000000033','79000000-0000-4000-8000-000000000002','PROJECT_OFFICER','79000000-0000-4000-8000-000000000013','Synthetic foreign officer','intake-foreign@example.invalid'),
 ('79000000-0000-4000-8000-000000000034','79000000-0000-4000-8000-000000000002','MONITORING_AND_EVALUATION_OFFICER','79000000-0000-4000-8000-000000000014','Synthetic foreign reviewer','intake-foreign-me@example.invalid'),
 ('79000000-0000-4000-8000-000000000035','79000000-0000-4000-8000-000000000001','MONITORING_AND_EVALUATION_OFFICER','79000000-0000-4000-8000-000000000015','Synthetic third reviewer','intake-third@example.invalid')
) v(id,org,role_code,sub,name,email)
JOIN pathways.roles r ON r.code=v.role_code;
-- The F10 source-proof trigger accepts only runtime sessions; fixtures bypass triggers here only.
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES
 ('79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000001','INTAKE_A1','Synthetic project A1','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000002','INTAKE_B1','Synthetic project B1','79000000-0000-4000-8000-000000000033');
SET LOCAL session_replication_role = origin;
INSERT INTO pathways.user_project_assignments(organization_id,project_id,user_id,assigned_by_id) VALUES
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000032','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000033','79000000-0000-4000-8000-000000000033');
-- F1, F2 and F6 are published (A1), F4 is published (B1), F5 and F7 stay drafts for the constraint and publish checks.
INSERT INTO pathways.digital_forms(id,organization_id,project_id,code,version,name,form_type,status,created_by_id,last_edited_by_id) VALUES
 ('79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','intake_f1',1,'Synthetic F1','OTHER','DRAFT','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000052','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','intake_f2',1,'Synthetic F2','OTHER','DRAFT','79000000-0000-4000-8000-000000000031',NULL),
 ('79000000-0000-4000-8000-000000000054','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000043','intake_f4',1,'Synthetic F4','OTHER','DRAFT','79000000-0000-4000-8000-000000000033',NULL),
 ('79000000-0000-4000-8000-000000000055','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','intake_f5',1,'Synthetic F5','OTHER','DRAFT','79000000-0000-4000-8000-000000000031',NULL),
 ('79000000-0000-4000-8000-000000000056','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','intake_f6',1,'Synthetic F6','OTHER','DRAFT','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000057','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','intake_f7',1,'Synthetic F7','OTHER','DRAFT','79000000-0000-4000-8000-000000000031','79000000-0000-4000-8000-000000000032');
INSERT INTO pathways.form_fields(id,organization_id,project_id,form_id,code,label,data_type,is_required,allowed_values,sequence_no,
 source_names,value_aliases,import_default,rule) VALUES
 ('79000000-0000-4000-8000-000000000061','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','first_name','First name','TEXT',true,NULL,1,
  ARRAY['Given name','Forename'],NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000062','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','birth_date','Birth date','DATE',false,NULL,2,
  ARRAY['DOB'],NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000063','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','sex','Sex','SELECT',false,'["MALE","FEMALE"]',3,
  ARRAY['Gender'],'[{"from":"M","to":"MALE"},{"from":"F","to":"FEMALE"}]',NULL,NULL),
 ('79000000-0000-4000-8000-000000000064','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','program_site','Program site','TEXT',true,NULL,4,
  '{}',NULL,'Synthetic site',NULL),
 ('79000000-0000-4000-8000-000000000065','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','age_at_registration','Age at registration','INTEGER',true,NULL,5,
  '{}',NULL,NULL,'{"kind":"AGE_AT_DATE","birthField":"birth_date","atField":"registration_date"}'),
 ('79000000-0000-4000-8000-000000000071','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000052','first_name','First name','TEXT',true,NULL,1,
  ARRAY['Given name'],NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000072','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000052','village','Village','TEXT',true,NULL,2,
  '{}',NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000073','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000052','age_check','Age check','INTEGER',true,NULL,3,
  '{}',NULL,NULL,'{"kind":"AGE_CHECK","birthField":"birth_date","atFields":["registration_date"]}'),
 ('79000000-0000-4000-8000-000000000076','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000054','first_name','First name','TEXT',false,NULL,1,
  '{}',NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000091','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000055','draft_field','Draft field','TEXT',false,NULL,1,
  '{}',NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000092','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000056','draft_field','Draft field','TEXT',false,NULL,1,
  '{}',NULL,NULL,NULL),
 ('79000000-0000-4000-8000-000000000093','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000057','draft_field','Draft field','TEXT',false,NULL,1,
  '{}',NULL,NULL,NULL);
UPDATE pathways.digital_forms f SET status='PUBLISHED',published_at=now(),
 published_by_id=CASE WHEN f.organization_id='79000000-0000-4000-8000-000000000001'
  THEN '79000000-0000-4000-8000-000000000032'::uuid ELSE '79000000-0000-4000-8000-000000000034'::uuid END
WHERE f.id IN ('79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000052','79000000-0000-4000-8000-000000000054','79000000-0000-4000-8000-000000000056');

-- Upload reservations normally come from the runtime upload path; fixtures bypass its triggers.
SET LOCAL session_replication_role = replica;
-- Batches: 81 happy path (F1), 82 required-field counting (F2), 83 another uploader, 84 foreign organization,
-- 85 rejected inputs (F1), 86 post-cleanup role state, 87 revoked upload permission.
INSERT INTO pathways.data_import_batches(id,organization_id,project_id,form_id,form_version,source_system,original_file_name,
 file_type,source_checksum,client_import_id,storage_bucket,storage_object_key,uploaded_by_id)
SELECT v.id::uuid,v.org::uuid,v.project::uuid,v.form::uuid,1,'MANUAL_UPLOAD','synthetic.csv','CSV',
 rpad(replace(v.id,'-',''),64,'0'),gen_random_uuid(),'uploads',
 'organizations/'||v.org||'/projects/'||v.project||'/imports/'||v.id||'/'||rpad(replace(v.id,'-',''),64,'0')||'.csv',v.uploader::uuid
FROM (VALUES
 ('79000000-0000-4000-8000-000000000081','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000082','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000052','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000083','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000032'),
 ('79000000-0000-4000-8000-000000000084','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000043','79000000-0000-4000-8000-000000000054','79000000-0000-4000-8000-000000000033'),
 ('79000000-0000-4000-8000-000000000085','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000086','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000031'),
 ('79000000-0000-4000-8000-000000000087','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051','79000000-0000-4000-8000-000000000031')
) v(id,org,project,form,uploader);
UPDATE pathways.data_import_batches b SET storage_status='STORED',status='UPLOADED',total_rows=2,
 source_headers=CASE WHEN b.id IN ('79000000-0000-4000-8000-000000000082','79000000-0000-4000-8000-000000000084')
  THEN '[{"key":"column_0001","columnIndex":1,"header":"Given name"},{"key":"column_0002","columnIndex":2,"header":"Notes"}]'::jsonb
  ELSE '[{"key":"column_0001","columnIndex":1,"header":"Given name"},{"key":"column_0002","columnIndex":2,"header":"DOB"},{"key":"column_0003","columnIndex":3,"header":"Gender"},{"key":"column_0004","columnIndex":4,"header":"Notes"}]'::jsonb END
WHERE b.id::text LIKE '79000000-0000-4000-8000-00000000008_';
INSERT INTO pathways.data_import_rows(organization_id,project_id,form_id,import_batch_id,row_number,source_checksum,raw_data)
SELECT b.organization_id,b.project_id,b.form_id,b.id,n+1,rpad(md5(b.id::text||n),64,'0'),
 CASE WHEN n=1 THEN '{"column_0001":"Synthetic-Secret-Cell-5521","column_0002":"2012-04-01","column_0003":"FEMALE","column_0004":""}'::jsonb
  ELSE '{"column_0001":"Ana","column_0002":"2011-01-09","column_0003":"MALE","column_0004":""}'::jsonb END
FROM pathways.data_import_batches b CROSS JOIN generate_series(1,2) n
WHERE b.id::text LIKE '79000000-0000-4000-8000-00000000008_';
SET LOCAL session_replication_role = origin;

-- Catalog: exact function authority, p38 kept, the new columns and their defaults.
DO $$ BEGIN
 IF NOT has_function_privilege('pathways_runtime','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('pathways_runtime','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR EXISTS(SELECT FROM pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND (pg_get_userbyid(p.proowner)<>'prisma' OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']))
 THEN RAISE EXCEPTION 'function catalog'; END IF;
 IF (SELECT prosrc FROM pg_proc WHERE oid='pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure) !~ 'AUTO_SMART_V2'
 OR (SELECT prosrc FROM pg_proc WHERE oid='pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure) ~ 'AUTO_SMART_V3'
 THEN RAISE EXCEPTION 'p38 changed'; END IF;
 IF (SELECT count(*) FROM pg_attribute WHERE NOT attisdropped AND (
   (attrelid='pathways.form_fields'::regclass AND attname IN('value_aliases','import_default','rule') AND NOT attnotnull)
   OR (attrelid='pathways.form_fields'::regclass AND attname='source_names' AND attnotnull AND atthasdef)
   OR (attrelid='pathways.digital_forms'::regclass AND attname IN('last_edited_by_id','import_draft_summary') AND NOT attnotnull)
   OR (attrelid='pathways.data_import_rows'::regclass AND attname='validation_warnings' AND attnotnull AND atthasdef)))<>7
 OR EXISTS(SELECT FROM pathways.data_import_rows WHERE validation_warnings <> '[]'::jsonb)
 OR EXISTS(SELECT FROM pathways.form_fields WHERE source_names IS NULL)
 THEN RAISE EXCEPTION 'column catalog'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Published form fields cannot be edited, including the new metadata columns.
DO $$
DECLARE c record; got text;
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('source names','UPDATE pathways.form_fields SET source_names=ARRAY[''Other''] WHERE id=''79000000-0000-4000-8000-000000000061'''),
  ('value aliases','UPDATE pathways.form_fields SET value_aliases=''[{"from":"X","to":"MALE"}]'' WHERE id=''79000000-0000-4000-8000-000000000063'''),
  ('import default','UPDATE pathways.form_fields SET import_default=''Other site'' WHERE id=''79000000-0000-4000-8000-000000000064'''),
  ('rule','UPDATE pathways.form_fields SET rule=NULL WHERE id=''79000000-0000-4000-8000-000000000065'''),
  ('new metadata on a bare field','UPDATE pathways.form_fields SET import_default=''Other'' WHERE id=''79000000-0000-4000-8000-000000000072''')
 ) v(label,stmt)
 LOOP
  got := NULL;
  BEGIN EXECUTE c.stmt; EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  IF got IS NULL OR got !~ 'immutable' THEN RAISE EXCEPTION '% on a published form: %', c.label, got; END IF;
 END LOOP;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Form guard: last editor frozen after publication, and neither the creator nor the last editor may publish.
-- The archive-authority trigger needs a runtime session, so it is off for these superuser checks only.
ALTER TABLE pathways.digital_forms DISABLE TRIGGER p09_form_archive;
DO $$
DECLARE got text;
BEGIN
 -- A published form cannot change its last editor, even while being archived.
 BEGIN
  UPDATE pathways.digital_forms SET status='ARCHIVED',archived_at=now(),
   last_edited_by_id='79000000-0000-4000-8000-000000000032' WHERE id='79000000-0000-4000-8000-000000000056';
  RAISE EXCEPTION 'archive changed the last editor';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM !~ 'immutable' THEN RAISE; END IF; END;
 BEGIN
  UPDATE pathways.digital_forms SET last_edited_by_id='79000000-0000-4000-8000-000000000032' WHERE id='79000000-0000-4000-8000-000000000056';
  RAISE EXCEPTION 'published form changed its last editor';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM !~ 'immutable' THEN RAISE; END IF; END;
 -- The import draft summary is editable on a draft but frozen once published, even while archiving.
 UPDATE pathways.digital_forms SET import_draft_summary='{"addedFields":[],"sourceNamesAdded":[],"optionsAdded":[],"aliasesAdded":0,"defaults":[],"rules":[],"needsCheck":[]}'
 WHERE id='79000000-0000-4000-8000-000000000057';
 -- The last editor cannot publish the draft; neither can the creator.
 FOR got IN SELECT unnest(ARRAY['79000000-0000-4000-8000-000000000032','79000000-0000-4000-8000-000000000031']) LOOP
  BEGIN
   UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id=got::uuid
   WHERE id='79000000-0000-4000-8000-000000000057';
   RAISE EXCEPTION 'publish by % accepted', got;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM !~ 'different attributable reviewer' THEN RAISE; END IF; END;
 END LOOP;
 -- A third user can.
 UPDATE pathways.digital_forms SET status='PUBLISHED',published_at=now(),published_by_id='79000000-0000-4000-8000-000000000035'
 WHERE id='79000000-0000-4000-8000-000000000057';
 -- The summary is now frozen with the form.
 BEGIN
  UPDATE pathways.digital_forms SET import_draft_summary=NULL WHERE id='79000000-0000-4000-8000-000000000057';
  RAISE EXCEPTION 'published form changed its draft summary';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM !~ 'immutable' THEN RAISE; END IF; END;
 BEGIN
  UPDATE pathways.digital_forms SET status='ARCHIVED',archived_at=now(),import_draft_summary=NULL WHERE id='79000000-0000-4000-8000-000000000057';
  RAISE EXCEPTION 'archive changed the draft summary';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM !~ 'immutable' THEN RAISE; END IF; END;
 -- A plain archive of a published form still works.
 UPDATE pathways.digital_forms SET status='ARCHIVED',archived_at=now() WHERE id='79000000-0000-4000-8000-000000000056';
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;
ALTER TABLE pathways.digital_forms ENABLE TRIGGER p09_form_archive;

-- The draft summary shape: exactly the seven keys, arrays of short field codes, a whole alias count, reason pairs.
DO $$
DECLARE c record; got text;
  b text := '{"addedFields":["a_b"],"sourceNamesAdded":["a_b"],"optionsAdded":[],"aliasesAdded":3,"defaults":["x"],"rules":[],"needsCheck":[{"fieldCode":"a_b","reason":"IMPORT_DEFAULT"}]}';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('null', NULL::text, '00000'),
  ('full summary', b, '00000'),
  ('empty summary', '{"addedFields":[],"sourceNamesAdded":[],"optionsAdded":[],"aliasesAdded":0,"defaults":[],"rules":[],"needsCheck":[]}', '00000'),
  ('1000 codes', jsonb_set(b::jsonb,'{addedFields}',(SELECT jsonb_agg('c'||g) FROM generate_series(1,1000) g))::text, '00000'),
  ('array', '[]', '23514'),
  ('string', '"x"', '23514'),
  ('no keys', '{}', '23514'),
  ('extra key', (b::jsonb || '{"extra":[]}')::text, '23514'),
  ('renamed key', ((b::jsonb - 'rules') || '{"rule":[]}')::text, '23514'),
  ('missing key', (b::jsonb - 'rules')::text, '23514'),
  ('alias count text', jsonb_set(b::jsonb,'{aliasesAdded}','"3"')::text, '23514'),
  ('alias count null', jsonb_set(b::jsonb,'{aliasesAdded}','null')::text, '23514'),
  ('alias count negative', jsonb_set(b::jsonb,'{aliasesAdded}','-1')::text, '23514'),
  ('alias count fraction', jsonb_set(b::jsonb,'{aliasesAdded}','1.5')::text, '23514'),
  ('codes not an array', jsonb_set(b::jsonb,'{addedFields}','"a_b"')::text, '23514'),
  ('code is a number', jsonb_set(b::jsonb,'{defaults}','[7]')::text, '23514'),
  ('code is null', jsonb_set(b::jsonb,'{defaults}','[null]')::text, '23514'),
  ('code is empty', jsonb_set(b::jsonb,'{rules}','[""]')::text, '23514'),
  ('code of 65 characters', jsonb_set(b::jsonb,'{rules}',to_jsonb(ARRAY[repeat('a',65)]))::text, '23514'),
  ('1001 codes', jsonb_set(b::jsonb,'{addedFields}',(SELECT jsonb_agg('c'||g) FROM generate_series(1,1001) g))::text, '23514'),
  ('needs check not an array', jsonb_set(b::jsonb,'{needsCheck}','{}')::text, '23514'),
  ('needs check element extra key', jsonb_set(b::jsonb,'{needsCheck}','[{"fieldCode":"a","reason":"IMPORT_DEFAULT","value":"x"}]')::text, '23514'),
  ('needs check element no reason', jsonb_set(b::jsonb,'{needsCheck}','[{"fieldCode":"a"}]')::text, '23514'),
  ('needs check element a string', jsonb_set(b::jsonb,'{needsCheck}','["a"]')::text, '23514'),
  ('needs check reason lower case', jsonb_set(b::jsonb,'{needsCheck}','[{"fieldCode":"a","reason":"free text"}]')::text, '23514'),
  ('needs check code of 65 characters', jsonb_set(b::jsonb,'{needsCheck}',jsonb_build_array(jsonb_build_object('fieldCode',repeat('a',65),'reason','IMPORT_DEFAULT')))::text, '23514')
 ) v(label,val,wanted)
 LOOP
  got := '00000';
  BEGIN UPDATE pathways.digital_forms SET import_draft_summary=c.val::jsonb WHERE id='79000000-0000-4000-8000-000000000055';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM c.wanted THEN RAISE EXCEPTION 'draft summary %: expected SQLSTATE % but got %', c.label, c.wanted, got; END IF;
 END LOOP;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Shape checks on a draft field and the last editor key; every case reports its own label.
DO $$
DECLARE c record; got text; field text := '79000000-0000-4000-8000-000000000091';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('source names null','source_names','NULL','23502'),
  ('source names two dimensions','source_names','''{{a},{b}}''','23514'),
  ('source names control char hides 101 chars','source_names','ARRAY[''a''||chr(1)||repeat(''b'',100)]','23514'),
  ('source names control char makes one valid element','source_names','ARRAY[''a'',chr(1)||''  '']','00000'),
  ('source names blank after control char','source_names','ARRAY[''a''||chr(1)||'''','' '']','23514'),
  ('source names 21 entries','source_names','array_fill(''x''::text,ARRAY[21])','23514'),
  ('source names empty entry','source_names','ARRAY['''']','23514'),
  ('source names blank entry','source_names','ARRAY[''  '']','23514'),
  ('source names null entry','source_names','ARRAY[NULL]::text[]','23514'),
  ('source names 101 chars','source_names','ARRAY[repeat(''a'',101)]','23514'),
  ('source names ok','source_names','array_fill(''x''::text,ARRAY[20])','00000'),
  ('source names 100 chars ok','source_names','ARRAY[repeat(''a'',100),''b'']','00000'),
  ('source names empty array ok','source_names','''{}''::text[]','00000'),
  ('aliases object','value_aliases','''{"from":"a","to":"b"}''::jsonb','23514'),
  ('aliases string','value_aliases','''"x"''::jsonb','23514'),
  ('aliases scalar entry','value_aliases','''[1]''::jsonb','23514'),
  ('aliases missing to','value_aliases','''[{"from":"a"}]''::jsonb','23514'),
  ('aliases numeric to','value_aliases','''[{"from":"a","to":1}]''::jsonb','23514'),
  ('aliases extra key','value_aliases','''[{"from":"a","to":"b","x":"c"}]''::jsonb','23514'),
  ('aliases empty from','value_aliases','''[{"from":"","to":"b"}]''::jsonb','23514'),
  ('aliases 101 char to','value_aliases','jsonb_build_array(jsonb_build_object(''from'',''a'',''to'',repeat(''b'',101)))','23514'),
  ('aliases 101 entries','value_aliases','(SELECT jsonb_agg(jsonb_build_object(''from'',''a''||n,''to'',''b'')) FROM generate_series(1,101) n)','23514'),
  ('aliases ok','value_aliases','''[{"from":"M","to":"MALE"}]''::jsonb','00000'),
  ('aliases 100 entries ok','value_aliases','(SELECT jsonb_agg(jsonb_build_object(''from'',''a''||n,''to'',''b'')) FROM generate_series(1,100) n)','00000'),
  ('aliases 100 char from ok','value_aliases','jsonb_build_array(jsonb_build_object(''from'',repeat(''a'',100),''to'',''b''))','00000'),
  ('aliases empty ok','value_aliases','''[]''::jsonb','00000'),
  ('default empty','import_default','''''','23514'),
  ('default blank','import_default','''   ''','23514'),
  ('default tab and newline','import_default','E''\t\n''','23514'),
  ('default padded ok','import_default','''  x  ''','00000'),
  ('default 121 chars','import_default','repeat(''a'',121)','23514'),
  ('default 120 chars ok','import_default','repeat(''a'',120)','00000'),
  ('rule array','rule','''[]''::jsonb','23514'),
  ('rule string','rule','''"AGE_AT_DATE"''::jsonb','23514'),
  ('rule unknown kind','rule','''{"kind":"EVAL"}''::jsonb','23514'),
  ('rule no kind','rule','''{}''::jsonb','23514'),
  ('rule null kind','rule','''{"kind":null}''::jsonb','23514'),
  ('rule ok','rule','''{"kind":"ID_FROM_INITIALS_AND_BIRTH_DATE","firstNameField":"a","lastNameField":"b","birthField":"c"}''::jsonb','00000')
 ) v(label,col,val,wanted)
 LOOP
  got := '00000';
  BEGIN EXECUTE format('UPDATE pathways.form_fields SET %I=%s WHERE id=%L',c.col,c.val,field);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM c.wanted THEN RAISE EXCEPTION '%: expected SQLSTATE % but got %', c.label, c.wanted, got; END IF;
 END LOOP;
 -- A foreign-organization user cannot be the last editor (composite key), nor can a missing one.
 got := NULL;
 BEGIN UPDATE pathways.digital_forms SET last_edited_by_id='79000000-0000-4000-8000-000000000033' WHERE id='79000000-0000-4000-8000-000000000055';
 EXCEPTION WHEN foreign_key_violation THEN got := 'fk'; END;
 IF got IS DISTINCT FROM 'fk' THEN RAISE EXCEPTION 'foreign last editor accepted'; END IF;
 UPDATE pathways.digital_forms SET last_edited_by_id='79000000-0000-4000-8000-000000000032' WHERE id='79000000-0000-4000-8000-000000000055';
 -- Row warnings must be a JSON array.
 got := NULL;
 BEGIN UPDATE pathways.data_import_rows SET validation_warnings='{}' WHERE import_batch_id='79000000-0000-4000-8000-000000000085';
 EXCEPTION WHEN check_violation THEN got := 'check'; END;
 IF got IS DISTINCT FROM 'check' THEN RAISE EXCEPTION 'warnings object accepted'; END IF;
 UPDATE pathways.data_import_rows SET validation_warnings='[{"code":"AGE_MISMATCH"}]' WHERE import_batch_id='79000000-0000-4000-8000-000000000085';
 UPDATE pathways.data_import_rows SET validation_warnings='[]' WHERE import_batch_id='79000000-0000-4000-8000-000000000085';
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- A reviewer's row may carry the new match reason; an unknown one is still refused. The row is rolled back at once.
DO $$ BEGIN
 BEGIN
  INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,revision,source_field_name,
   status,suggested_field_id,match_score,match_reason)
  VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051',
   '79000000-0000-4000-8000-000000000085',1,'column_0001','PENDING','79000000-0000-4000-8000-000000000061',95,'MODEL');
  RAISE EXCEPTION 'unknown match reason accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO pathways.metadata_mappings(organization_id,project_id,form_id,import_batch_id,revision,source_field_name,
   status,suggested_field_id,match_score,match_reason)
  VALUES('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000041','79000000-0000-4000-8000-000000000051',
   '79000000-0000-4000-8000-000000000085',1,'column_0001','PENDING','79000000-0000-4000-8000-000000000061',95,'METADATA_SOURCE_NAME');
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback-fixture';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'rollback-fixture' THEN RAISE; END IF; END;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000011',true),
 set_config('request.jwt.claims','',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);

-- Rejected inputs: every case fails before any row is written, without echoing values.
DO $$
DECLARE c record; got text;
 good text := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0003","columnIndex":3,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000063","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},'
  '{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('V2 algorithm id','AUTO_SMART_V2',0,good,'22023'),
  ('V1 algorithm id','AUTO_CODE_LABEL_V1',0,good,'22023'),
  ('unknown algorithm id','AUTO_SMART_V4',0,good,'22023'),
  ('null algorithm',NULL,0,good,'22023'),
  ('bad expected revision','AUTO_SMART_V3',2,good,'22023'),
  ('not an array','AUTO_SMART_V3',0,'{"a":1}','22023'),
  ('stale expected revision','AUTO_SMART_V3',1,good,'40001'),
  ('too few decisions','AUTO_SMART_V3',0,(good::jsonb - 3)::text,'22023'),
  ('extra sampled value key','AUTO_SMART_V3',0,jsonb_set(good::jsonb,'{0,sample}','"Synthetic-Secret-Cell-5521"')::text,'22023'),
  ('unknown status','AUTO_SMART_V3',0,replace(good,'"status":"IGNORED"','"status":"REJECTED"'),'22023'),
  ('unknown match reason','AUTO_SMART_V3',0,replace(good,'"METADATA_SOURCE_NAME"','"MODEL"'),'22023'),
  ('ignored with no match reason','AUTO_SMART_V3',0,replace(good,'"reason":"BLANK_COLUMN"','"reason":"NO_MATCH"'),'22023'),
  ('ignored with empty name reason','AUTO_SMART_V3',0,replace(good,'"reason":"BLANK_COLUMN"','"reason":"EMPTY_NAME"'),'22023'),
  ('ignored with auto match reason','AUTO_SMART_V3',0,replace(good,'"reason":"BLANK_COLUMN"','"reason":"AUTO_MATCH"'),'22023'),
  ('ignored with target','AUTO_SMART_V3',0,jsonb_set(good::jsonb,'{3,targetFieldId}','"79000000-0000-4000-8000-000000000064"')::text,'22023'),
  ('ignored with suggestion','AUTO_SMART_V3',0,jsonb_set(good::jsonb,'{3,suggestedFieldId}','"79000000-0000-4000-8000-000000000064"')::text,'22023'),
  ('ignored with score and match reason','AUTO_SMART_V3',0,jsonb_set(jsonb_set(good::jsonb,'{3,score}','95'),'{3,matchReason}','"EXACT"')::text,'22023'),
  ('pending with blank column reason','AUTO_SMART_V3',0,jsonb_set(good::jsonb,'{2}','{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}')::text,'22023'),
  ('mapped with blank column reason','AUTO_SMART_V3',0,replace(good,'"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002"','"matchReason":"METADATA_SOURCE_NAME","reason":"BLANK_COLUMN"},{"sourceKey":"column_0002"'),'22023'),
  ('other form target','AUTO_SMART_V3',0,replace(good,'"targetFieldId":"79000000-0000-4000-8000-000000000062"','"targetFieldId":"79000000-0000-4000-8000-000000000071"'),'22023'),
  ('duplicate mapped target','AUTO_SMART_V3',0,replace(good,'"targetFieldId":"79000000-0000-4000-8000-000000000062"','"targetFieldId":"79000000-0000-4000-8000-000000000061"'),'22023'),
  ('non-uuid target','AUTO_SMART_V3',0,replace(good,'"79000000-0000-4000-8000-000000000062"','"x'' OR 1=1"'),'22023')
 ) v(label,alg,rev,ds,wanted)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000085',c.rev,c.alg,c.ds::jsonb);
  EXCEPTION WHEN OTHERS THEN
   got := SQLSTATE;
   IF SQLERRM ~ 'Synthetic-Secret' THEN RAISE EXCEPTION '% echoed a value', c.label; END IF;
  END;
  IF got IS DISTINCT FROM c.wanted THEN RAISE EXCEPTION '%: expected SQLSTATE % but got %', c.label, c.wanted, got; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='79000000-0000-4000-8000-000000000085')
 THEN RAISE EXCEPTION 'rejected input wrote rows'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Happy path: METADATA_SOURCE_NAME maps and a blank column is IGNORED; retries return the same receipt.
DO $$
DECLARE receipt jsonb; again jsonb;
 good jsonb := '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000063","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]';
BEGIN
 receipt := pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V3',good);
 -- first_name is mapped; program_site has a default and age_at_registration a calculated rule, so none is unmapped.
 IF receipt IS DISTINCT FROM jsonb_build_object('batchId','79000000-0000-4000-8000-000000000081','mappingRevision',1,
  'mapped',3,'pending',0,'ignored',1,'requiredUnmapped',0,'complete',true) THEN RAISE EXCEPTION 'receipt %', receipt; END IF;
 again := pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V3',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'retry 1 receipt'; END IF;
 again := pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000081',0,'AUTO_SMART_V3',good);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'retry 0 receipt'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
 -- A changed recomputation is a conflict, never a second revision.
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V3',
   jsonb_set(good,'{3}','{"sourceKey":"column_0004","columnIndex":4,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}'));
  RAISE EXCEPTION 'changed retry accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- The V2 recorder cannot treat the V3 revision as its own retry.
 BEGIN
  PERFORM pathways.p38_record_smart_mapping('79000000-0000-4000-8000-000000000081',1,'AUTO_SMART_V2',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000062","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000063","suggestedFieldId":null,"score":100,"matchReason":"EXACT","reason":"AUTO_MATCH"},{"sourceKey":"column_0004","columnIndex":4,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]');
  RAISE EXCEPTION 'V2 retry of V3 accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Required fields: a missing default or rule, or a rule that only cross-checks, still counts as unmapped.
DO $$ DECLARE receipt jsonb; BEGIN
 receipt := pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000082',0,'AUTO_SMART_V3',
  '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000071","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]');
 IF receipt IS DISTINCT FROM jsonb_build_object('batchId','79000000-0000-4000-8000-000000000082','mappingRevision',1,
  'mapped',1,'pending',0,'ignored',1,'requiredUnmapped',2,'complete',false) THEN RAISE EXCEPTION 'receipt %', receipt; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Denials: another uploader's batch and a foreign organization's batch.
DO $$
DECLARE c record; got text;
 one_pending text := '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"}]';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('another uploader','79000000-0000-4000-8000-000000000083'),
  ('cross-organization','79000000-0000-4000-8000-000000000084'),
  ('unknown batch','79000000-0000-4000-8000-000000000089')
 ) v(label,batch)
 LOOP
  got := NULL;
  BEGIN
   PERFORM pathways.p78_record_smart_mapping(c.batch::uuid,0,'AUTO_SMART_V3',one_pending::jsonb);
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION '% expected 42501 got %', c.label, got; END IF;
 END LOOP;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- The foreign officer cannot record organization A's batch, and cannot target A's fields from B.
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000002',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000033',true);
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000085',0,'AUTO_SMART_V3',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'foreign officer on A: %', got; END IF;
 got := NULL;
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000084',0,'AUTO_SMART_V3',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000071","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'foreign field target: %', got; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='79000000-0000-4000-8000-000000000084')
 THEN RAISE EXCEPTION 'foreign target wrote rows'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- A forged subject for organization A's officer fails closed.
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000013',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000086',0,'AUTO_SMART_V3',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'forged subject: %', got; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

RESET SESSION AUTHORIZATION;
-- Stored rows, batch state and audit for batch 81; no sampled value anywhere.
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.metadata_mappings WHERE import_batch_id='79000000-0000-4000-8000-000000000081' AND revision=1)<>4
 OR NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='79000000-0000-4000-8000-000000000081'
  AND source_field_name='column_0001' AND status='MAPPED' AND target_field_id='79000000-0000-4000-8000-000000000061'
  AND suggested_field_id IS NULL AND match_score=100 AND match_reason='METADATA_SOURCE_NAME'
  AND validation_message='AUTO_SMART_V3:AUTO_MATCH')
 OR NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id='79000000-0000-4000-8000-000000000081'
  AND source_field_name='column_0004' AND status='IGNORED' AND target_field_id IS NULL
  AND suggested_field_id IS NULL AND match_score IS NULL AND match_reason IS NULL
  AND validation_message='AUTO_SMART_V3:BLANK_COLUMN')
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='79000000-0000-4000-8000-000000000081')<>'(1,MAPPED)'
 OR (SELECT row(mapping_revision,status)::text FROM pathways.data_import_batches WHERE id='79000000-0000-4000-8000-000000000082')<>'(1,UPLOADED)'
 OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id='79000000-0000-4000-8000-000000000081' AND mapping_revision<>1)
 THEN RAISE EXCEPTION 'stored revision'; END IF;
 IF (SELECT count(*) FROM pathways.audit_logs WHERE entity_id='79000000-0000-4000-8000-000000000081'
  AND action='IMPORT_AUTOMATIC_MAPPING_CREATED' AND actor_user_id='79000000-0000-4000-8000-000000000031'
  AND changes->>'algorithmVersion'='AUTO_SMART_V3' AND changes->>'synonymVersion'='SMART_SYNONYMS_V2'
  AND changes->>'formPublishedById'='79000000-0000-4000-8000-000000000032'
  AND jsonb_array_length(changes->'decisions')=4 AND changes->'receipt'->>'mapped'='3'
  AND changes->'receipt'->>'ignored'='1')<>1
 THEN RAISE EXCEPTION 'single audit row'; END IF;
 IF EXISTS(SELECT FROM pathways.metadata_mappings m WHERE m.organization_id='79000000-0000-4000-8000-000000000001'
   AND to_jsonb(m)::text ~ '(Synthetic-Secret|2012-04-01|FEMALE|Ana)')
 OR EXISTS(SELECT FROM pathways.audit_logs a WHERE a.organization_id='79000000-0000-4000-8000-000000000001'
   AND a.changes::text ~ '(Synthetic-Secret|2012-04-01|FEMALE|Ana)')
 THEN RAISE EXCEPTION 'sampled value persisted'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Hosted role reality: with every owner-role membership of prisma revoked (as the 0031/0034
-- cleanups do), the definer still records. The revocation is inside this rolled-back transaction.
DO $$ DECLARE m record; BEGIN
 FOR m IN SELECT r.rolname AS role_name, g.rolname AS grantor_name FROM pg_auth_members a
  JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles g ON g.oid=a.grantor
  WHERE a.member=(SELECT oid FROM pg_roles WHERE rolname='prisma')
 LOOP
  EXECUTE format('REVOKE %I FROM prisma GRANTED BY %I', m.role_name, m.grantor_name);
 END LOOP;
 IF EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='prisma'))
 THEN RAISE EXCEPTION 'memberships remain'; END IF;
END $$;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000011',true),
 set_config('app.organization_id','79000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','79000000-0000-4000-8000-000000000031',true);
DO $$ BEGIN
 IF (pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000086',0,'AUTO_SMART_V3',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"MAPPED","targetFieldId":"79000000-0000-4000-8000-000000000061","suggestedFieldId":null,"score":100,"matchReason":"METADATA_SOURCE_NAME","reason":"AUTO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"EMPTY_NAME"},{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]'
  )->>'ignored')<>'1' THEN RAISE EXCEPTION 'post-cleanup recording'; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;

-- Revoked imports.upload: the next call is denied (checked live, not from the API).
RESET SESSION AUTHORIZATION;
DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='PROJECT_OFFICER' AND p.code='imports.upload';
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
DO $$ DECLARE got text; BEGIN
 BEGIN
  PERFORM pathways.p78_record_smart_mapping('79000000-0000-4000-8000-000000000087',0,'AUTO_SMART_V3',
   '[{"sourceKey":"column_0001","columnIndex":1,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0002","columnIndex":2,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0003","columnIndex":3,"status":"PENDING","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"NO_MATCH"},{"sourceKey":"column_0004","columnIndex":4,"status":"IGNORED","targetFieldId":null,"suggestedFieldId":null,"score":null,"matchReason":null,"reason":"BLANK_COLUMN"}]');
 EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'revoked upload: %', got; END IF;
 PERFORM set_config('intake.passed',(coalesce(nullif(current_setting('intake.passed',true),''),'0')::integer+1)::text,true);
END $$;
RESET SESSION AUTHORIZATION;

SELECT 'IMPORT_INTAKE_ASSERTIONS_PASSED=' || current_setting('intake.passed') AS result;
DO $$ BEGIN IF current_setting('intake.passed')::integer<>16 THEN RAISE EXCEPTION 'incomplete suite'; END IF; END $$;
SELECT 'IMPORT_INTAKE_RUNTIME=PASS' AS result;
ROLLBACK;
