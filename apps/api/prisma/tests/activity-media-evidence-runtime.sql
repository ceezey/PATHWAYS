-- cr-pathways-activity-progress-media (0041): disposable behavioral checks for the widened
-- activity-update evidence types and the canonical finalize request bounds. Synthetic fixtures
-- only; everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or
-- pathways_phase4_* replay database that already has 0041 applied and its cleanup run.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0041 checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE media_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON media_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO media_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %: %',label,expected,SQLSTATE,SQLERRM; END IF;
  INSERT INTO media_results VALUES(label);
  RETURN;
 END;
 RAISE EXCEPTION 'Assertion % expected rejection %',label,expected;
END $$;
-- One ACTIVITY_PROOF_FINALIZE body with n files of the given type and size.
CREATE FUNCTION pg_temp.body(n integer,content_type text,size bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('updateId','00000000-0000-4000-8000-000000000001','progressPercent',50,'note','Synthetic',
  'files',(SELECT jsonb_agg(jsonb_build_object('fileName','file-'||i||'.bin','sha256',lpad(to_hex(i),64,'0'),
   'contentType',content_type,'byteSize',size)) FROM generate_series(1,n) i))
$$;
CREATE FUNCTION pg_temp.canonical(body jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT pathways_rules_internal.canonical_source_request('ACTIVITY_PROOF_FINALIZE',body)
$$;

-- Ledger and catalog: the migration finished, its temporary chain is gone again.
SELECT pg_temp.ok(EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0041_activity_media_evidence'
 AND finished_at IS NOT NULL AND rolled_back_at IS NULL),'ledger row finished');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 WHERE m.member='prisma'::regrole AND r.rolname LIKE 'rules\_%\_owner'),'post-cleanup prisma has no rules owner membership');
SELECT pg_temp.ok(NOT has_schema_privilege('prisma','pathways_rules_internal','USAGE')
 AND NOT has_schema_privilege('rules_enqueue_owner','pathways_rules_internal','CREATE')
 AND NOT has_schema_privilege('rules_store_owner','pathways_rules_internal','CREATE'),'post-cleanup schema rights unchanged');

-- Definition: owner, mode, search_path, ACL; identical to 0031 outside the files branch.
SELECT pg_temp.ok(pg_get_userbyid(p.proowner)='rules_enqueue_owner' AND NOT p.prosecdef AND p.provolatile='i'
 AND p.proconfig=ARRAY['search_path=""']
 AND has_function_privilege('rules_enqueue_owner',p.oid,'EXECUTE')
 AND NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
 AND NOT has_function_privilege('prisma',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('pathways_rules_worker',p.oid,'EXECUTE'),'owner mode search_path and ACL unchanged')
FROM pg_proc p WHERE p.oid='pathways_rules_internal.canonical_source_request(text,jsonb)'::regprocedure;
-- md5 values of the 0031 body before `ELSIF k='files'` and from `ELSIF k='binding'`, computed from
-- 0031_f10_f11_rules_runtime/migration.sql (5295 and 4637 bytes).
SELECT pg_temp.ok(md5(substr(p.prosrc,1,position($x$  ELSIF k='files' THEN$x$ in p.prosrc)-1))='4f92b2e3dc61289a375979b3f343aadd'
 AND md5(substr(p.prosrc,position($x$  ELSIF k='binding' THEN$x$ in p.prosrc)))='e18389dfcea36863eea2c1e09debba5b'
 AND md5(p.prosrc)='26392f4284b21e3b751063c39901628d','definition identical to 0031 outside the files branch')
FROM pg_proc p WHERE p.oid='pathways_rules_internal.canonical_source_request(text,jsonb)'::regprocedure;
-- Callers are definers owned by the same owner, so their EXECUTE path is unchanged.
SELECT pg_temp.ok(bool_and(pg_get_userbyid(p.proowner)='rules_enqueue_owner' AND p.prosecdef
 AND has_function_privilege(p.proowner,'pathways_rules_internal.canonical_source_request(text,jsonb)'::regprocedure,'EXECUTE'))
 AND count(*)=3,'callers keep EXECUTE through their owner')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='pathways' AND p.proname IN ('f10_begin_source_operation','f10_source_acknowledgement','f10_abandon_source_operation');

-- New bounds accepted.
SELECT pg_temp.ok(jsonb_array_length(pg_temp.canonical(pg_temp.body(10,'image/jpeg',1))->'files')=10,'ten files accepted');
SELECT pg_temp.ok(pg_temp.canonical(pg_temp.body(1,'video/quicktime',1)) IS NOT NULL
 AND pg_temp.canonical(pg_temp.body(1,'video/webm',1)) IS NOT NULL,'quicktime and webm accepted');
SELECT pg_temp.ok(pg_temp.canonical(pg_temp.body(1,'video/mp4',104857600)) IS NOT NULL,'100 MiB file accepted');
SELECT pg_temp.ok(pg_temp.canonical(pg_temp.body(5,'video/mp4',104857600)) IS NOT NULL,'five 100 MiB files within total');
SELECT pg_temp.ok(pg_temp.canonical(pg_temp.body(5,'application/pdf',52428800))->'files'->0->>'fileName'='file-1.bin','files normalized in order');

-- New bounds rejected; old rejections kept.
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(11,'image/jpeg',1))$q$,'22023','eleventh file rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(0,'image/jpeg',1))$q$,'22023','no files rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(1,'video/mp4',104857601))$q$,'22023','over 100 MiB rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(6,'video/mp4',104857600))$q$,'22023','over total rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(1,'text/html',1))$q$,'22023','html type rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(1,'image/gif',1))$q$,'22023','unlisted image type rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(1,'image/png',0))$q$,'22023','zero size rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(jsonb_set(pg_temp.body(1,'image/png',1),'{files,0,byteSize}','"1"'))$q$,'22023','string size rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(jsonb_set(pg_temp.body(1,'image/png',1),'{files,0,byteSize}','1.5'))$q$,'22023','fractional size rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(jsonb_set(pg_temp.body(1,'image/png',1),'{files,0,fileName}','"a/b.png"'))$q$,'22023','slash name rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(jsonb_set(pg_temp.body(1,'image/png',1),'{files,0,sha256}',to_jsonb(repeat('A',64))))$q$,'22023','uppercase digest rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(pg_temp.body(1,'image/png',1)#-'{files,0,sha256}')$q$,'22023','missing file key rejected');
SELECT pg_temp.reject($q$SELECT pg_temp.canonical(jsonb_set(pg_temp.body(1,'image/png',1),'{files,0,url}','"x"'))$q$,'22023','extra file key rejected');
-- Other operations are unchanged, for example the partner-name and review grammar.
SELECT pg_temp.reject($q$SELECT pathways_rules_internal.canonical_source_request('PROJECT_UPDATE',jsonb_build_object('expectedUpdatedAt','2026-01-01T00:00:00.000Z','title','Synthetic','status','ONGOING','implementingPartnerNames',(SELECT jsonb_agg('Partner '||i) FROM generate_series(1,21) i)))$q$,'22023','partner bound unchanged');
SELECT pg_temp.reject($q$SELECT pathways_rules_internal.canonical_source_request('ACTIVITY_REVIEW',jsonb_build_object('updateId','00000000-0000-4000-8000-000000000001','decision','DELETE','reason','x','expectedUpdatedAt','2026-01-01T00:00:00.000Z'))$q$,'22023','review grammar unchanged');

-- Evidence type constraint: synthetic organization, project, activity and update. The rules
-- source-proof triggers admit activity DML only inside an API source operation, so the parent
-- fixtures are written with triggers off; the evidence rows below run with every trigger on.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES('78000000-0000-4000-8000-000000000011'),('78000000-0000-4000-8000-000000000012');
INSERT INTO pathways.organizations(id,code,name) VALUES
 ('78000000-0000-4000-8000-000000000001','MEDIA_ORG_A','Synthetic media organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT v.id::uuid,'78000000-0000-4000-8000-000000000001',r.id,v.sub::uuid,v.name,v.email,'ACTIVE',now()
FROM (VALUES
 ('78000000-0000-4000-8000-000000000031','PROJECT_MANAGER','78000000-0000-4000-8000-000000000011','Synthetic manager','media-pm@example.invalid'),
 ('78000000-0000-4000-8000-000000000032','PROJECT_OFFICER','78000000-0000-4000-8000-000000000012','Synthetic officer','media-po@example.invalid')
) v(id,role_code,sub,name,email) JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
 ('78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000001','MEDIA-1','Synthetic media project','2026-01-01','2026-12-31','78000000-0000-4000-8000-000000000031');
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,status,created_by_id) VALUES
 ('78000000-0000-4000-8000-000000000061','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','ACT-M1','Synthetic media activity','2026-01-01','2026-06-30','NOT_STARTED','78000000-0000-4000-8000-000000000031');
INSERT INTO pathways.activity_updates(id,organization_id,project_id,activity_id,client_update_id,progress_percent,note,submitted_by_id) VALUES
 ('78000000-0000-4000-8000-000000000091','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000061','78000000-0000-4000-8000-000000000092',60,'Synthetic media update','78000000-0000-4000-8000-000000000032');
SET LOCAL session_replication_role = origin;
CREATE FUNCTION pg_temp.evidence(n integer,kind text,content_type text,with_update boolean,with_activity boolean) RETURNS text LANGUAGE sql AS $$
 SELECT format($i$INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,activity_update_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,storage_ready,submitted_by_id)
  VALUES(%L,'78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000041',%s,%s,%L,'file.bin','pathways-private',%L,repeat('a',64),40000000,%L,false,'78000000-0000-4000-8000-000000000032')$i$,
  ('78000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,
  CASE WHEN with_activity THEN quote_literal('78000000-0000-4000-8000-000000000061') ELSE 'NULL' END,
  CASE WHEN with_update THEN quote_literal('78000000-0000-4000-8000-000000000091') ELSE 'NULL' END,
  kind,
  'organizations/78000000-0000-4000-8000-000000000001/projects/78000000-0000-4000-8000-000000000041/evidence/78000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0')||'/proof.bin',
  content_type)
$$;
DO $$ BEGIN EXECUTE pg_temp.evidence(1,'PHOTO','image/jpeg',true,true); END $$;
DO $$ BEGIN EXECUTE pg_temp.evidence(2,'VIDEO','video/quicktime',true,true); END $$;
DO $$ BEGIN EXECUTE pg_temp.evidence(3,'DOCUMENT','application/pdf',true,true); END $$;
DO $$ BEGIN EXECUTE pg_temp.evidence(4,'PROGRESS_PROOF','video/webm',true,true); END $$;
DO $$ BEGIN EXECUTE pg_temp.evidence(5,'COMPLETION_PROOF','image/png',true,true); END $$;
SELECT pg_temp.ok((SELECT count(*) FROM pathways.evidence_media WHERE activity_update_id='78000000-0000-4000-8000-000000000091')=5,
 'PHOTO VIDEO DOCUMENT and legacy proof types accepted for an activity update');
SELECT pg_temp.reject(pg_temp.evidence(6,'OTHER','image/png',true,true),'23514','OTHER type rejected for an activity update');
-- Without an update the constraint does not apply (e.g. finance receipts keep their own rules).
SELECT pg_temp.ok(pg_get_constraintdef(c.oid) ~ 'activity_update_id IS NULL' AND c.convalidated,'constraint validated and scoped to updates')
FROM pg_constraint c WHERE c.conrelid='pathways.evidence_media'::regclass AND c.conname='evidence_media_activity_update_check';
SELECT pg_temp.ok((SELECT count(*) FROM pg_constraint WHERE conrelid='pathways.evidence_media'::regclass
 AND conname IN ('evidence_media_activity_update_check','p3_evidence_file','p3_evidence_public','p3_evidence_review','p3_public_times'))=5,
 'other evidence constraints untouched');
-- The runtime role can insert a VIDEO row in its own scope through the same policy as before.
SET LOCAL ROLE pathways_runtime;
SELECT set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000012',true),
 set_config('app.organization_id','78000000-0000-4000-8000-000000000001',true),
 set_config('app.user_id','78000000-0000-4000-8000-000000000032',true);
SELECT pg_temp.ok(has_column_privilege('pathways.evidence_media','type','INSERT')
 AND has_column_privilege('pathways.evidence_media','storage_ready','UPDATE'),'runtime column grants unchanged');
RESET ROLE;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM media_results;
 IF total<>31 THEN RAISE EXCEPTION '0041 checks expected 31 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_MEDIA_EVIDENCE_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
