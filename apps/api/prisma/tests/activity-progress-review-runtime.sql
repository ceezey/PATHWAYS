-- 0044 activity progress review: behavioral checks that the ACTIVITY_REVIEW source operation
-- accepts a PENDING progress-only update (no evidence, below 100%) while its activity is
-- IN_PROGRESS, and that every other review rule is unchanged. Synthetic fixtures only;
-- everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or
-- pathways_phase4_* replay database that already has 0044 applied and its cleanup run.
-- The reviews run exactly as the API runs them: as the pathways_runtime session with the
-- app.* context, through f10_begin_source_operation, the two DML statements and
-- f10_finish_source_operation.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0044 activity-progress-review checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE prv_results(check_name text PRIMARY KEY) ON COMMIT DROP;
GRANT INSERT, SELECT ON prv_results TO pathways_runtime;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO prv_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7c000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- One review exactly as the API performs it. Returns 'OK' or the SQLSTATE of the first failure;
-- the caller asserts the expected outcome. The DML mirrors ActivitiesService.reviewUpdate.
CREATE FUNCTION pg_temp.review(org uuid,actor uuid,project uuid,activity uuid,update_id uuid,decision text,
 request uuid,stale boolean DEFAULT false,progress_only boolean DEFAULT true) RETURNS text LANGUAGE plpgsql AS $$
DECLARE started jsonb; handle uuid; ts timestamptz; u pathways.activity_updates; expected text;
BEGIN
 BEGIN
  PERFORM set_config('app.organization_id',org::text,true);
  PERFORM set_config('app.user_id',actor::text,true);
 PERFORM set_config('request.jwt.claim.sub',('7c000000-0000-4000-8000-'||lpad((right(actor::text,12)::integer+100)::text,12,'0')),true);
  SELECT x.* INTO u FROM pathways.activity_updates x WHERE x.id=update_id;
  expected:=to_char((u.updated_at-CASE WHEN stale THEN interval '1 second' ELSE interval '0' END) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  started:=pathways.f10_begin_source_operation('ACTIVITY_REVIEW',project,activity,'CLIENT_MUTATION',request,'MUTATION',
   jsonb_build_object('updateId',update_id,'decision',decision,'reason','Synthetic review reason','expectedUpdatedAt',expected));
  handle:=(started->>'operationHandle')::uuid;
  ts:=(started->'generatedValues'->>'timestamp')::timestamptz;
  UPDATE pathways.activity_updates SET status=CASE WHEN decision='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END::pathways.review_status,
   reviewed_by_id=actor,reviewed_at=ts,updated_at=ts,review_reason='Synthetic review reason' WHERE id=update_id AND status='PENDING';
  IF NOT progress_only THEN
   UPDATE pathways.evidence_media SET status=CASE WHEN decision='APPROVE' THEN 'VERIFIED' ELSE 'REJECTED' END::pathways.review_status,
    verified_by_id=CASE WHEN decision='APPROVE' THEN actor END,verified_at=CASE WHEN decision='APPROVE' THEN ts END,
    rejected_by_id=CASE WHEN decision='RETURN' THEN actor END,rejected_at=CASE WHEN decision='RETURN' THEN ts END,
    rejection_reason=CASE WHEN decision='RETURN' THEN 'Synthetic review reason' END
    WHERE activity_update_id=update_id AND status='PENDING';
  END IF;
  IF progress_only THEN
   IF decision='APPROVE' THEN UPDATE pathways.project_activities SET progress_percent=u.progress_percent,updated_at=ts WHERE id=activity;
   ELSE UPDATE pathways.project_activities SET updated_at=ts WHERE id=activity; END IF;
  ELSE
   UPDATE pathways.project_activities SET status='IN_PROGRESS',progress_percent=u.progress_percent,updated_at=ts WHERE id=activity;
  END IF;
  PERFORM pathways.f10_finish_source_operation(handle);
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='REVIEW_COMMITTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='REVIEW_COMMITTED' THEN RETURN 'OK'; END IF;
  RETURN SQLSTATE||': '||SQLERRM;
 END;
END $$;
-- The committed path above ends in a controlled exception so that each scenario leaves its
-- fixture untouched; the state it produced is asserted separately by commit_review below.
CREATE FUNCTION pg_temp.commit_review(org uuid,actor uuid,project uuid,activity uuid,update_id uuid,decision text,
 request uuid,progress_only boolean DEFAULT true) RETURNS text LANGUAGE plpgsql AS $$
DECLARE started jsonb; handle uuid; ts timestamptz; u pathways.activity_updates; expected text;
BEGIN
 PERFORM set_config('app.organization_id',org::text,true);
 PERFORM set_config('app.user_id',actor::text,true);
 PERFORM set_config('request.jwt.claim.sub',('7c000000-0000-4000-8000-'||lpad((right(actor::text,12)::integer+100)::text,12,'0')),true);
 SELECT x.* INTO u FROM pathways.activity_updates x WHERE x.id=update_id;
 expected:=to_char(u.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 started:=pathways.f10_begin_source_operation('ACTIVITY_REVIEW',project,activity,'CLIENT_MUTATION',request,'MUTATION',
  jsonb_build_object('updateId',update_id,'decision',decision,'reason','Synthetic review reason','expectedUpdatedAt',expected));
 handle:=(started->>'operationHandle')::uuid;
 ts:=(started->'generatedValues'->>'timestamp')::timestamptz;
 UPDATE pathways.activity_updates SET status=CASE WHEN decision='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END::pathways.review_status,
  reviewed_by_id=actor,reviewed_at=ts,updated_at=ts,review_reason='Synthetic review reason' WHERE id=update_id AND status='PENDING';
 IF NOT progress_only THEN
  UPDATE pathways.evidence_media SET status=CASE WHEN decision='APPROVE' THEN 'VERIFIED' ELSE 'REJECTED' END::pathways.review_status,
   verified_by_id=CASE WHEN decision='APPROVE' THEN actor END,verified_at=CASE WHEN decision='APPROVE' THEN ts END,
   rejected_by_id=CASE WHEN decision='RETURN' THEN actor END,rejected_at=CASE WHEN decision='RETURN' THEN ts END,
   rejection_reason=CASE WHEN decision='RETURN' THEN 'Synthetic review reason' END
   WHERE activity_update_id=update_id AND status='PENDING';
 END IF;
 IF progress_only THEN
  IF decision='APPROVE' THEN UPDATE pathways.project_activities SET progress_percent=u.progress_percent,updated_at=ts WHERE id=activity;
  ELSE UPDATE pathways.project_activities SET updated_at=ts WHERE id=activity; END IF;
 ELSE
  UPDATE pathways.project_activities SET status='IN_PROGRESS',progress_percent=u.progress_percent,updated_at=ts WHERE id=activity;
 END IF;
 PERFORM pathways.f10_finish_source_operation(handle);
 RETURN 'OK';
END $$;
CREATE FUNCTION pg_temp.expect(result text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF expected='OK' THEN
  IF result<>'OK' THEN RAISE EXCEPTION 'Assertion % expected OK, got %',label,result; END IF;
 ELSIF left(result,5)<>expected THEN RAISE EXCEPTION 'Assertion % expected %, got %',label,expected,result;
 END IF;
 INSERT INTO prv_results VALUES(label);
END $$;

-- Ledger, cleanup and catalog: the migration finished, its temporary chain and lent rights are gone.
SELECT pg_temp.ok(EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0044_activity_progress_review'
 AND finished_at IS NOT NULL AND rolled_back_at IS NULL),'ledger row finished');
SELECT pg_temp.ok(NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 WHERE m.member='prisma'::regrole AND r.rolname LIKE 'rules\_%\_owner')
 AND NOT has_schema_privilege('rules_enqueue_owner','pathways','CREATE')
 AND NOT has_schema_privilege('rules_source_proof_owner','pathways','CREATE')
 AND NOT has_schema_privilege('rules_source_proof_owner','pathways_rules_internal','CREATE')
 AND NOT has_schema_privilege('rules_store_owner','pathways','CREATE'),'post-cleanup membership and schema rights unchanged');
SELECT pg_temp.ok(pg_get_userbyid(p.proowner)='rules_enqueue_owner' AND p.prosecdef AND p.provolatile='v'
 AND p.proconfig=ARRAY['search_path=""'] AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND md5(p.prosrc)='a9c15dca6847b64f109cf7b2039c4145','f10_begin_source_operation owner mode search_path ACL and body'),
 pg_temp.ok(pg_get_userbyid(q.proowner)='rules_source_proof_owner' AND q.prosecdef AND q.provolatile='v'
 AND q.proconfig=ARRAY['search_path=""'] AND NOT has_function_privilege('pathways_runtime',q.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',q.oid,'EXECUTE') AND md5(q.prosrc)='24ad351577ffffee2f66ff02dfe26c0a',
 'prove_source_root_dml owner mode search_path ACL and body')
FROM pg_proc p,pg_proc q
WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::regprocedure
 AND q.oid='pathways_rules_internal.prove_source_root_dml()'::regprocedure;
SELECT pg_temp.ok((SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal
 AND t.tgfoid='pathways_rules_internal.prove_source_root_dml()'::regprocedure)=4,'source proof triggers still attached');

-- Fixtures: org A and org B. In org A the M&E officer is assigned to project A1 (the reviewer),
-- a second M&E officer has no assignment, a Project Manager is assigned (no evidence.review) and
-- a Project Officer submits. Triggers are off for the parent rows only; every review below runs
-- through the real functions and triggers.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) SELECT pg_temp.u(200+n) FROM generate_series(1,8) n;
INSERT INTO pathways.organizations(id,code,name) VALUES
 (pg_temp.u(1),'PRV_ORG_A','Synthetic PRV org A'),(pg_temp.u(2),'PRV_ORG_B','Synthetic PRV org B');
INSERT INTO pathways.roles(code,name) VALUES
 ('PROJECT_MANAGER','Project Manager'),('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
 ('PROJECT_OFFICER','Project Officer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.permissions(code,name) VALUES
 ('projects.read','projects.read'),('activities.read','activities.read'),('evidence.review','evidence.review'),
 ('activities.progress.update','activities.progress.update'),('monitoring.review','monitoring.review')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code IN ('projects.read','activities.read','evidence.review','monitoring.review'))
 OR (r.code='PROJECT_MANAGER' AND p.code IN ('projects.read','activities.read','monitoring.review'))
 OR (r.code='PROJECT_OFFICER' AND p.code IN ('projects.read','activities.read','activities.progress.update'))
ON CONFLICT DO NOTHING;
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,activated_at)
SELECT pg_temp.u(100+v.n),v.org_id,r.id,pg_temp.u(200+v.n),v.full_name,v.email,'ACTIVE',now()
FROM (VALUES
 (1,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','PRV M&E A (assigned)','prv-me-a@example.invalid'),
 (2,pg_temp.u(1),'MONITORING_AND_EVALUATION_OFFICER','PRV M&E A (unassigned)','prv-me-a2@example.invalid'),
 (3,pg_temp.u(1),'PROJECT_MANAGER','PRV PM A (assigned)','prv-pm-a@example.invalid'),
 (4,pg_temp.u(1),'PROJECT_OFFICER','PRV Officer A','prv-po-a@example.invalid'),
 (5,pg_temp.u(2),'MONITORING_AND_EVALUATION_OFFICER','PRV M&E B (assigned in org B)','prv-me-b@example.invalid')
) v(n,org_id,role_code,full_name,email) JOIN pathways.roles r ON r.code=v.role_code;
INSERT INTO pathways.projects(id,organization_id,code,title,start_date,end_date,created_by_id) VALUES
 (pg_temp.u(301),pg_temp.u(1),'PRV-A1','PRV Project A1','2026-01-01','2026-12-31',pg_temp.u(103)),
 (pg_temp.u(303),pg_temp.u(2),'PRV-B1','PRV Project B1','2026-01-01','2026-12-31',pg_temp.u(105));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id) VALUES
 (pg_temp.u(401),pg_temp.u(1),pg_temp.u(301),pg_temp.u(101),pg_temp.u(103)),
 (pg_temp.u(402),pg_temp.u(1),pg_temp.u(301),pg_temp.u(103),pg_temp.u(103)),
 (pg_temp.u(403),pg_temp.u(1),pg_temp.u(301),pg_temp.u(104),pg_temp.u(103)),
 (pg_temp.u(404),pg_temp.u(2),pg_temp.u(303),pg_temp.u(105),pg_temp.u(105));
-- IN_PROGRESS rows need actual_start_date (activities_lifecycle CHECK).
INSERT INTO pathways.project_activities(id,organization_id,project_id,code,title,planned_start_date,planned_end_date,actual_start_date,status,created_by_id,progress_percent) VALUES
 (pg_temp.u(501),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-1','Progress approve','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(502),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-2','Progress return','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(503),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-3','Denied actors','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(504),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-4','Proof while in progress','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(505),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-5','Progress at 100','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(506),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-6','Own update','2026-01-01','2026-06-30','2026-01-01','IN_PROGRESS',pg_temp.u(103),10),
 (pg_temp.u(507),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-7','Proof for review','2026-01-01','2026-06-30','2026-01-01','FOR_REVIEW',pg_temp.u(103),10),
 (pg_temp.u(508),pg_temp.u(1),pg_temp.u(301),'PRV-ACT-8','Proof returned','2026-01-01','2026-06-30','2026-01-01','FOR_REVIEW',pg_temp.u(103),10);
INSERT INTO pathways.activity_updates(id,organization_id,project_id,activity_id,client_update_id,progress_percent,note,submitted_by_id) VALUES
 (pg_temp.u(601),pg_temp.u(1),pg_temp.u(301),pg_temp.u(501),pg_temp.u(701),30,'Synthetic progress note',pg_temp.u(104)),
 (pg_temp.u(602),pg_temp.u(1),pg_temp.u(301),pg_temp.u(502),pg_temp.u(702),40,'Synthetic progress note',pg_temp.u(104)),
 (pg_temp.u(603),pg_temp.u(1),pg_temp.u(301),pg_temp.u(503),pg_temp.u(703),30,'Synthetic progress note',pg_temp.u(104)),
 (pg_temp.u(604),pg_temp.u(1),pg_temp.u(301),pg_temp.u(504),pg_temp.u(704),30,'Synthetic proof update',pg_temp.u(104)),
 (pg_temp.u(605),pg_temp.u(1),pg_temp.u(301),pg_temp.u(505),pg_temp.u(705),100,'Synthetic completing note',pg_temp.u(104)),
 (pg_temp.u(606),pg_temp.u(1),pg_temp.u(301),pg_temp.u(506),pg_temp.u(706),30,'Reviewer own note',pg_temp.u(101)),
 (pg_temp.u(607),pg_temp.u(1),pg_temp.u(301),pg_temp.u(507),pg_temp.u(707),60,'Synthetic proof update',pg_temp.u(104)),
 (pg_temp.u(608),pg_temp.u(1),pg_temp.u(301),pg_temp.u(508),pg_temp.u(708),60,'Synthetic proof update',pg_temp.u(104));
INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,activity_update_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,storage_ready,submitted_by_id)
SELECT pg_temp.u(800+v.n),pg_temp.u(1),pg_temp.u(301),pg_temp.u(v.activity),pg_temp.u(v.upd),'PHOTO','proof.jpg','pathways-private',
 'organizations/'||pg_temp.u(1)||'/projects/'||pg_temp.u(301)||'/evidence/'||pg_temp.u(800+v.n)||'/proof.jpg',repeat('a',64),1000,'image/jpeg',true,pg_temp.u(104)
FROM (VALUES (1,504,604),(2,507,607),(3,508,608)) v(n,activity,upd);
SET LOCAL session_replication_role = origin;

-- 1. Progress-only APPROVE by the assigned M&E officer while the activity is IN_PROGRESS succeeds and
--    applies only the progress percent.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.expect(pg_temp.commit_review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(501),pg_temp.u(601),'APPROVE',pg_temp.u(901)),
 'OK','assigned M&E approves a progress-only update while the activity is IN_PROGRESS');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok((SELECT a.status='IN_PROGRESS' AND a.progress_percent=30 AND a.reviewed_by_id IS NULL AND a.actual_end_date IS NULL
  FROM pathways.project_activities a WHERE a.id=pg_temp.u(501))
 AND (SELECT status='APPROVED' AND reviewed_by_id=pg_temp.u(101) FROM pathways.activity_updates WHERE id=pg_temp.u(601)),
 'approved progress note applies progress only and never completes');

-- 2. Progress-only RETURN keeps the recorded progress.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.expect(pg_temp.commit_review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(502),pg_temp.u(602),'RETURN',pg_temp.u(902)),
 'OK','assigned M&E returns a progress-only update while the activity is IN_PROGRESS');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok((SELECT a.status='IN_PROGRESS' AND a.progress_percent=10 FROM pathways.project_activities a WHERE a.id=pg_temp.u(502))
 AND (SELECT status='REJECTED' FROM pathways.activity_updates WHERE id=pg_temp.u(602)),'returned progress note leaves progress unchanged');

-- 3. Rejected callers: unassigned M&E, cross-organization M&E, an assigned Project Manager (no
--    evidence.review), and the submitter. All fail before any row changes (42501 or 40001).
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(102),pg_temp.u(301),pg_temp.u(503),pg_temp.u(603),'APPROVE',pg_temp.u(903)),
 '42501','an unassigned M&E officer is rejected');
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(2),pg_temp.u(105),pg_temp.u(301),pg_temp.u(503),pg_temp.u(603),'APPROVE',pg_temp.u(904)),
 '42501','a cross-organization M&E officer is rejected');
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(103),pg_temp.u(301),pg_temp.u(503),pg_temp.u(603),'APPROVE',pg_temp.u(905)),
 '42501','an assigned Project Manager without evidence.review is rejected');
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(506),pg_temp.u(606),'APPROVE',pg_temp.u(906)),
 '40001','a reviewer cannot review their own progress note');
RESET SESSION AUTHORIZATION;

-- 4. Unchanged rules: a proof update (evidence rows) is not reviewable while the activity is IN_PROGRESS,
--    a progress-only update at 100% is not reviewable outside FOR_REVIEW, and a stale version is refused.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(504),pg_temp.u(604),'APPROVE',pg_temp.u(907),false,false),
 '40001','a proof update is still not reviewable while the activity is IN_PROGRESS');
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(505),pg_temp.u(605),'APPROVE',pg_temp.u(908)),
 '40001','a completing (100 percent) progress-only update is still refused while IN_PROGRESS');
SELECT pg_temp.expect(pg_temp.review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(503),pg_temp.u(603),'APPROVE',pg_temp.u(909),true),
 '40001','a stale expectedUpdatedAt is still refused');
RESET SESSION AUTHORIZATION;

-- 5. FOR_REVIEW proof reviews behave as before: approve and return succeed for the assigned M&E officer.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.expect(pg_temp.commit_review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(507),pg_temp.u(607),'APPROVE',pg_temp.u(910),false),
 'OK','a FOR_REVIEW proof approve still succeeds');
SELECT pg_temp.expect(pg_temp.commit_review(pg_temp.u(1),pg_temp.u(101),pg_temp.u(301),pg_temp.u(508),pg_temp.u(608),'RETURN',pg_temp.u(911),false),
 'OK','a FOR_REVIEW proof return still succeeds');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok((SELECT a.status='IN_PROGRESS' AND a.progress_percent=60 FROM pathways.project_activities a WHERE a.id=pg_temp.u(507))
 AND (SELECT count(*)=1 FROM pathways.evidence_media WHERE activity_update_id=pg_temp.u(607) AND status='VERIFIED')
 AND (SELECT a.status='IN_PROGRESS' AND a.progress_percent=60 FROM pathways.project_activities a WHERE a.id=pg_temp.u(508))
 AND (SELECT count(*)=1 FROM pathways.evidence_media WHERE activity_update_id=pg_temp.u(608) AND status='REJECTED'),
 'proof review outcomes unchanged');
-- A proof update whose activity is IN_PROGRESS but which also carries evidence cannot use the new path.
SELECT pg_temp.ok((SELECT status='PENDING' FROM pathways.activity_updates WHERE id=pg_temp.u(604))
 AND (SELECT status='IN_PROGRESS' FROM pathways.project_activities WHERE id=pg_temp.u(504)),'rejected reviews changed nothing');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM prv_results;
 IF total<>20 THEN RAISE EXCEPTION '0044 activity-progress-review checks expected 20 assertions, recorded %',total; END IF;
 RAISE NOTICE 'ACTIVITY_PROGRESS_REVIEW_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
