-- cr-pathways-public-tracker-media-analytics (0086): disposable checks for the public media queue, the pickable-media rule in
-- p85_publication_media and the live-only p86_public_media lookup. Synthetic fixtures only; everything rolls back. Run as a
-- local superuser against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0086 applied.
-- Success prints PUBLIC_TRACKER_MEDIA_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Public tracker media checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('ptm.passed',(coalesce(nullif(current_setting('ptm.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must fail with the expected SQLSTATE and a message that mentions the needle.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Staff context for user 21 (A, uploads), 22 (B) or 23 (C); 0 clears every app context.
CREATE FUNCTION pg_temp.act_as(user_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(1)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
-- Updates one evidence row as the given user.
CREATE FUNCTION pg_temp.media_sql(media_n integer, assignments text) RETURNS text LANGUAGE sql AS $$
 SELECT format('UPDATE pathways.evidence_media SET %s WHERE organization_id=%L AND id=%L',assignments,pg_temp.u(1),pg_temp.u(media_n))
$$;
CREATE FUNCTION pg_temp.media_move(user_n integer, media_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE pg_temp.media_sql(media_n,assignments);
END $$;
CREATE FUNCTION pg_temp.media(media_n integer) RETURNS pathways.evidence_media LANGUAGE sql AS $$
 SELECT * FROM pathways.evidence_media WHERE organization_id=pg_temp.u(1) AND id=pg_temp.u(media_n)
$$;
-- A stored evidence row uploaded by A; link is 'none', 'activity' or 'enrollment'. Inserted with triggers off.
CREATE FUNCTION pg_temp.seed(media_n integer, project_n integer, kind text, content text, link text, review text) RETURNS void
LANGUAGE sql AS $$
 INSERT INTO pathways.evidence_media(id,organization_id,project_id,activity_id,activity_update_id,enrollment_id,type,file_name,bucket,
  object_key,sha256,byte_size,content_type,status,submitted_by_id,submitted_at,verified_by_id,verified_at,storage_ready)
 VALUES(pg_temp.u(media_n),pg_temp.u(1),pg_temp.u(project_n),CASE WHEN link='activity' THEN pg_temp.u(301) END,
  CASE WHEN link='activity' THEN pg_temp.u(302) END,CASE WHEN link='enrollment' THEN pg_temp.u(303) END,kind::pathways.evidence_type,
  'proof','pathways-private',format('organizations/%s/projects/%s/evidence/%s/proof',pg_temp.u(1),pg_temp.u(project_n),pg_temp.u(media_n)),
  repeat('a',64),10,content,review::pathways.review_status,pg_temp.u(21),now()-interval '1 hour',
  CASE WHEN review='VERIFIED' THEN pg_temp.u(22) END,CASE WHEN review='VERIFIED' THEN now() END,true)
$$;
-- A queue item: A sends it to the queue, then C approves it.
CREATE FUNCTION pg_temp.queue_approved(media_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.media_move(21,media_n,format($a$public_visibility_status='FOR_REVIEW',public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21)));
 PERFORM pg_temp.media_move(23,media_n,format($a$public_visibility_status='APPROVED',public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(23)));
END $$;
-- A selection item as the API sends it.
CREATE FUNCTION pg_temp.pick(media_n integer, caption text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('id',pg_temp.u(media_n),'caption',caption)
$$;
-- A SUBMIT of the next revision of project 41's publication with the given media selection, as A.
CREATE FUNCTION pg_temp.submit_sql(media jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT format($s$UPDATE pathways.project_publications SET revision=revision+1,state='FOR_REVIEW',
  snapshot=jsonb_build_object('media',%L::jsonb,'views','[]'::jsonb) WHERE organization_id=%L AND project_id=%L$s$,media,pg_temp.u(1),pg_temp.u(41))
$$;
CREATE FUNCTION pg_temp.submit(media jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 EXECUTE pg_temp.submit_sql(media);
 RETURN (SELECT snapshot->'media' FROM pathways.project_publications WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(41));
END $$;
CREATE FUNCTION pg_temp.not_pickable(label text, media jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 PERFORM pg_temp.refused(label,pg_temp.submit_sql(media),'23514','Media not publishable');
END $$;
-- The media ids of project 41 in the public projection, in order.
CREATE FUNCTION pg_temp.live_ids() RETURNS jsonb LANGUAGE sql AS $$
 SELECT coalesce(jsonb_agg(m->>'id' ORDER BY o),'[]') FROM jsonb_array_elements(pathways.p85_public_projects(pg_temp.u(41))->0->'media')
  WITH ORDINALITY x(m,o)
$$;
-- Runs one statement as the superuser with triggers off; the caller resets the session first.
CREATE FUNCTION pg_temp.as_owner(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 SET LOCAL session_replication_role = replica;
 EXECUTE statement;
 SET LOCAL session_replication_role = origin;
END $$;
CREATE FUNCTION pg_temp.pub_move(user_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',assignments,pg_temp.u(1),pg_temp.u(41));
END $$;

-- Catalog: the media validator and lookup are prisma-owned definers executable by pathways_runtime only, the queue CHECK is
-- validated, and the public evidence guard and the public read have their 0086 bodies.
SELECT pg_temp.ok('catalog', (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p85_publication_media(jsonb,uuid)'::regprocedure,
   'pathways.p86_public_media(uuid,uuid)'::regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""'] AND p.provolatile='s'
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=2
 AND EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.evidence_media'::regclass AND conname='p3_evidence_public' AND convalidated)
 AND (SELECT md5(prosrc)='32c52a969c76775b0a86b6731c3d6fff' AND NOT prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways.p3_guard_public_evidence()'::regprocedure)
 AND (SELECT md5(prosrc)='2e377c27df955be9547b46648b7c32d9' AND prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways.p85_public_projects(uuid,integer,integer)'::regprocedure)
 AND EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgname='p3_40_public' AND tgenabled='O' AND tgrelid='pathways.evidence_media'::regclass));

-- Fixtures: one organization; A (21), B (22) and C (23) are Project Managers assigned to projects 41 and 42.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PTM_A','Synthetic public media organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'Synthetic PTM uploader','ptm-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'Synthetic PTM reviewer','ptm-b@example.invalid'),
 (pg_temp.u(23),pg_temp.u(13),'Synthetic PTM approver','ptm-c@example.invalid')) v(id,auth_id,full_name,email)
JOIN pathways.roles r ON r.code='PROJECT_MANAGER';
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id)
SELECT pg_temp.u(n),pg_temp.u(1),'PTM_'||n,'Synthetic PTM project '||n,pg_temp.u(21) FROM unnest(ARRAY[41,42]) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(500+p*3+s),pg_temp.u(1),pg_temp.u(p),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[41,42]) p, unnest(ARRAY[1,2,3]) s;
-- The enrollment exists because updating a row inserted in this transaction rechecks its foreign keys.
INSERT INTO pathways.beneficiary_project_enrollments(id,organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
VALUES(pg_temp.u(303),pg_temp.u(1),pg_temp.u(41),pg_temp.u(304),current_date,pg_temp.u(21));
-- Media 102: beneficiary photo. 103/104: activity photos, verified and pending. 105: activity document. 106: activity
-- photo with a PDF content type. 107: activity photo for the never-queued check.
SELECT pg_temp.seed(102,41,'PHOTO','image/jpeg','enrollment','PENDING');
SELECT pg_temp.seed(103,41,'PHOTO','image/png','activity','VERIFIED');
SELECT pg_temp.seed(104,41,'PHOTO','image/png','activity','PENDING');
SELECT pg_temp.seed(105,41,'DOCUMENT','application/pdf','activity','VERIFIED');
SELECT pg_temp.seed(106,41,'PHOTO','application/pdf','activity','VERIFIED');
SELECT pg_temp.seed(107,41,'PHOTO','image/png','activity','VERIFIED');
-- Media 108: an unlinked upload for the reject checks. 109: an unlinked upload on project 42. 110: an unlinked document.
-- 111: an unlinked upload that is approved and then rejected. 112: an unlinked upload rejected after it goes live.
SELECT pg_temp.seed(108,41,'VIDEO','video/mp4','none','PENDING');
SELECT pg_temp.seed(109,42,'PHOTO','image/jpeg','none','PENDING');
SELECT pg_temp.seed(110,41,'DOCUMENT','application/pdf','none','PENDING');
SELECT pg_temp.seed(111,41,'PHOTO','image/jpeg','none','PENDING');
SELECT pg_temp.seed(112,41,'PHOTO','image/jpeg','none','PENDING');
-- Media 120: a stored photo of project 45 in a second organization, for the cross-organization lookup.
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(2),'PTM_B','Synthetic second public media organization');
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES (pg_temp.u(45),pg_temp.u(2),'PTM_45','Synthetic PTM project 45',pg_temp.u(21));
INSERT INTO pathways.evidence_media(id,organization_id,project_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,storage_ready)
VALUES(pg_temp.u(120),pg_temp.u(2),pg_temp.u(45),'PHOTO','proof','pathways-private',
 format('organizations/%s/projects/%s/evidence/%s/proof',pg_temp.u(2),pg_temp.u(45),pg_temp.u(120)),repeat('c',64),10,'image/jpeg',pg_temp.u(21),true);
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;

-- queue_upload_flow: A inserts an unlinked project photo, finalizes it and sends it to the queue.
SELECT pg_temp.act_as(21);
INSERT INTO pathways.evidence_media(id,organization_id,project_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id)
VALUES(pg_temp.u(101),pg_temp.u(1),pg_temp.u(41),'PHOTO','photo.jpg','pathways-private',
 format('organizations/%s/projects/%s/evidence/%s/proof.jpg',pg_temp.u(1),pg_temp.u(41),pg_temp.u(101)),repeat('b',64),20,'image/jpeg',pg_temp.u(21));
SELECT pg_temp.ok('queue_upload_flow inserted', (SELECT status='PENDING' AND public_visibility_status='PRIVATE' AND NOT storage_ready
 FROM pg_temp.media(101)));
SELECT pg_temp.media_move(21,101,'storage_ready=true');
SELECT pg_temp.media_move(21,101,format($a$public_visibility_status='FOR_REVIEW',public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21)));
SELECT pg_temp.ok('queue_upload_flow queued', (SELECT storage_ready AND public_visibility_status='FOR_REVIEW'
 AND public_submitted_by_id=pg_temp.u(21) FROM pg_temp.media(101)));
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('queue_upload_flow uploader cannot approve', pg_temp.media_sql(101,format($a$public_visibility_status='APPROVED',
 public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(21))),'23514','p3_evidence_public');
-- The approval must be recorded: no approver fails the CHECK even with the session binding bypassed, and as runtime the
-- approver must be the acting user.
RESET SESSION AUTHORIZATION;
SELECT pg_temp.refused('queue_upload_flow approver required', pg_temp.media_sql(101,$a$public_visibility_status='APPROVED'$a$),
 '23514','p3_evidence_public');
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('queue_upload_flow approver unrecorded', pg_temp.media_sql(101,$a$public_visibility_status='APPROVED'$a$),
 '42501','acting user');
SELECT pg_temp.refused('queue_upload_flow approver is the session user', pg_temp.media_sql(101,format($a$public_visibility_status='APPROVED',
 public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(23))),'42501','acting user');
SELECT pg_temp.media_move(22,101,format($a$public_visibility_status='APPROVED',public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(22)));
SELECT pg_temp.ok('queue_upload_flow approved', (SELECT public_visibility_status='APPROVED' AND public_approved_by_id=pg_temp.u(22)
 FROM pg_temp.media(101)));
-- The approved upload is pickable: the first SUBMIT freezes it with its type, content type and trimmed caption.
SELECT pg_temp.act_as(21);
INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
VALUES(pg_temp.u(1),pg_temp.u(41),1,'FOR_REVIEW','SUBMIT','Media summary',
 jsonb_build_object('media',jsonb_build_array(pg_temp.pick(101,'  Harvest day  ')),'views','[]'::jsonb),pg_temp.u(21));
SELECT pg_temp.ok('queue_upload_flow pickable', (SELECT snapshot->'media'=jsonb_build_array(jsonb_build_object('id',pg_temp.u(101),
 'type','PHOTO','contentType','image/jpeg','caption','Harvest day')) FROM pathways.project_publications
 WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(41)));

-- beneficiary_media_queue: B sends A's beneficiary photo to the queue; neither A (uploader) nor B (sender) may approve it, C may.
SELECT pg_temp.not_pickable('beneficiary media not pickable before the queue', jsonb_build_array(pg_temp.pick(102,'Beneficiary')));
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('beneficiary_media_queue sender is the session user', pg_temp.media_sql(102,format($a$public_visibility_status='FOR_REVIEW',
 public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21))),'42501','acting user');
SELECT pg_temp.media_move(22,102,format($a$public_visibility_status='FOR_REVIEW',public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(22)));
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('beneficiary_media_queue uploader cannot approve', pg_temp.media_sql(102,format($a$public_visibility_status='APPROVED',
 public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(21))),'23514','p3_evidence_public');
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('beneficiary_media_queue sender cannot approve', pg_temp.media_sql(102,format($a$public_visibility_status='APPROVED',
 public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(22))),'23514','p3_evidence_public');
SELECT pg_temp.media_move(23,102,format($a$public_visibility_status='APPROVED',public_approved_by_id=%L,public_approved_at=now()$a$,pg_temp.u(23)));
SELECT pg_temp.ok('beneficiary_media_queue', (SELECT public_visibility_status='APPROVED' AND enrollment_id IS NOT NULL AND status='PENDING'
 FROM pg_temp.media(102)));

-- activity_proof_pickable_when_verified: a VERIFIED activity photo passes, a PENDING one does not.
SELECT pg_temp.ok('activity_proof_pickable_when_verified', (SELECT pg_temp.submit(jsonb_build_array(pg_temp.pick(103,'Verified proof')))
 =jsonb_build_array(jsonb_build_object('id',pg_temp.u(103),'type','PHOTO','contentType','image/png','caption','Verified proof'))));
SELECT pg_temp.not_pickable('activity_proof_pickable_when_verified pending', jsonb_build_array(pg_temp.pick(104,'Pending proof')));

-- activity_proof_never_queued: activity proof cannot enter the public media queue.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('activity_proof_never_queued', pg_temp.media_sql(107,format($a$public_visibility_status='FOR_REVIEW',
 public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21))),'23514','p3_evidence_public');

-- reject_in_queue: B rejects a queued upload with a reason; it stays out of the picker. An approved upload rejected later
-- is no longer pickable.
SELECT pg_temp.media_move(21,108,format($a$public_visibility_status='FOR_REVIEW',public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21)));
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('reject_in_queue rejecter is the session user', pg_temp.media_sql(108,format($a$status='REJECTED',rejected_by_id=%L,
 rejected_at=now(),rejection_reason='Faces are visible'$a$,pg_temp.u(23))),'42501','acting user');
SELECT pg_temp.media_move(22,108,format($a$status='REJECTED',rejected_by_id=%L,rejected_at=now(),rejection_reason='Faces are visible'$a$,pg_temp.u(22)));
SELECT pg_temp.ok('reject_in_queue', (SELECT status='REJECTED' AND public_visibility_status='FOR_REVIEW' AND rejection_reason='Faces are visible'
 FROM pg_temp.media(108)));
SELECT pg_temp.not_pickable('reject_in_queue not pickable', jsonb_build_array(pg_temp.pick(108,'Rejected')));
SELECT pg_temp.queue_approved(111);
SELECT pg_temp.ok('approved upload pickable', jsonb_array_length(pg_temp.submit(jsonb_build_array(pg_temp.pick(111,'Approved'))))=1);
SELECT pg_temp.media_move(22,111,format($a$status='REJECTED',rejected_by_id=%L,rejected_at=now(),rejection_reason='Withdrawn by reviewer'$a$,pg_temp.u(22)));
SELECT pg_temp.not_pickable('rejected after approval not pickable', jsonb_build_array(pg_temp.pick(111,'Approved')));

-- documents_never_pickable: documents never enter the queue, and neither a verified activity document nor a photo row
-- holding a PDF can be picked.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('documents_never_pickable queue', pg_temp.media_sql(110,format($a$public_visibility_status='FOR_REVIEW',
 public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21))),'23514','p3_evidence_public');
SELECT pg_temp.not_pickable('documents_never_pickable document', jsonb_build_array(pg_temp.pick(105,'Document')));
SELECT pg_temp.not_pickable('documents_never_pickable pdf', jsonb_build_array(pg_temp.pick(106,'Pdf')));

-- Selection rules: input order kept, and duplicates, other projects, unknown ids, bad captions, extra keys and more than 24
-- items are refused.
SELECT pg_temp.ok('selection keeps input order', (SELECT jsonb_agg(m->>'id' ORDER BY o)=jsonb_build_array(pg_temp.u(103),pg_temp.u(101),pg_temp.u(102))
 FROM jsonb_array_elements(pg_temp.submit(jsonb_build_array(pg_temp.pick(103,'One'),pg_temp.pick(101,'Two'),pg_temp.pick(102,'Three'))))
 WITH ORDINALITY x(m,o)));
SELECT pg_temp.queue_approved(109);
SELECT pg_temp.not_pickable('selection duplicate', jsonb_build_array(pg_temp.pick(101,'One'),pg_temp.pick(101,'Again')));
SELECT pg_temp.not_pickable('selection other project', jsonb_build_array(pg_temp.pick(109,'Elsewhere')));
SELECT pg_temp.not_pickable('selection unknown id', jsonb_build_array(pg_temp.pick(999,'Unknown')));
SELECT pg_temp.not_pickable('selection blank caption', jsonb_build_array(pg_temp.pick(101,'   ')));
SELECT pg_temp.not_pickable('selection long caption', jsonb_build_array(pg_temp.pick(101,repeat('x',301))));
SELECT pg_temp.not_pickable('selection extra key', jsonb_build_array(pg_temp.pick(101,'One')||'{"type":"PHOTO"}'));
SELECT pg_temp.not_pickable('selection not an array', '{}'::jsonb);
SELECT pg_temp.not_pickable('selection over 24', (SELECT jsonb_agg(pg_temp.pick(101,'Same')) FROM generate_series(1,25)));

-- The validator answers only inside the publication guard, never to a direct runtime call.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('direct p85_publication_media call refused', format('SELECT pathways.p85_publication_media(%L::jsonb,%L)',
 jsonb_build_array(pg_temp.pick(101,'Direct')),pg_temp.u(41)),'42501','Public media selection unavailable');

-- published_state_unused: the PUBLISHED public state is never used by evidence.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('published_state_unused', pg_temp.media_sql(101,format($a$public_visibility_status='PUBLISHED',
 published_by_id=%L,published_at=now()$a$,pg_temp.u(23))),'23514','p3_evidence_public');

-- public_media_live_only: revision with approved uploads 101 and 112 is approved and published by B.
SELECT pg_temp.queue_approved(112);
SELECT pg_temp.submit(jsonb_build_array(pg_temp.pick(101,'Live photo'),pg_temp.pick(112,'Second photo')));
SELECT pg_temp.pub_move(22,$$state='APPROVED'$$);
SELECT pg_temp.pub_move(22,$$state='PUBLISHED'$$);
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_media_live_only live', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101))=jsonb_build_object(
 'bucket','pathways-private','objectKey',format('organizations/%s/projects/%s/evidence/%s/proof.jpg',pg_temp.u(1),pg_temp.u(41),pg_temp.u(101)),
 'contentType','image/jpeg','byteSize',20,'sha256',repeat('b',64))));
SELECT pg_temp.ok('public_media_live_only second item', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(112)) IS NOT NULL));
SELECT pg_temp.ok('public_media_live_only not in snapshot', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(102)) IS NULL
 AND pathways.p86_public_media(pg_temp.u(42),pg_temp.u(101)) IS NULL));
-- A new revision adds media 102; it stays unreachable while that revision is under review.
SELECT pg_temp.submit(jsonb_build_array(pg_temp.pick(101,'Live photo'),pg_temp.pick(102,'Draft photo')));
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_media_live_only review revision', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(102)) IS NULL
 AND pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NOT NULL));
SELECT pg_temp.ok('public_projection_media live', pg_temp.live_ids()=jsonb_build_array(pg_temp.u(101),pg_temp.u(112)));
-- A live item rejected internally afterwards is no longer served, and the public projection drops it while the other stays.
SELECT pg_temp.media_move(22,112,format($a$status='REJECTED',rejected_by_id=%L,rejected_at=now(),rejection_reason='Wrong site'$a$,pg_temp.u(22)));
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_media_live_only rejected after publish', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(112)) IS NULL
 AND pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NOT NULL));
SELECT pg_temp.ok('public_projection_media rejected after publish', pg_temp.live_ids()=jsonb_build_array(pg_temp.u(101)));
-- A forged live item of another organization is neither served nor listed.
RESET SESSION AUTHORIZATION;
SELECT pg_temp.as_owner(format($u$UPDATE pathways.project_publications SET live_snapshot=jsonb_set(live_snapshot,'{media}',
 (live_snapshot->'media')||jsonb_build_array(jsonb_build_object('id',%L,'type','PHOTO','contentType','image/jpeg','caption','Elsewhere')))
 WHERE organization_id=%L AND project_id=%L$u$,pg_temp.u(120),pg_temp.u(1),pg_temp.u(41)));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('public_media_live_only other organization', pathways.p86_public_media(pg_temp.u(41),pg_temp.u(120)) IS NULL
 AND pg_temp.live_ids()=jsonb_build_array(pg_temp.u(101)));
-- An archived project or an inactive organization serves nothing; each is restored after its check.
RESET SESSION AUTHORIZATION;
SELECT pg_temp.as_owner(format('UPDATE pathways.projects SET archived_at=now() WHERE id=%L',pg_temp.u(41)));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('public_media_live_only archived project', pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NULL);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.as_owner(format('UPDATE pathways.projects SET archived_at=NULL WHERE id=%L',pg_temp.u(41)));
SELECT pg_temp.as_owner(format($u$UPDATE pathways.organizations SET status='INACTIVE' WHERE id=%L$u$,pg_temp.u(1)));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('public_media_live_only inactive organization', pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NULL);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.as_owner(format($u$UPDATE pathways.organizations SET status='ACTIVE' WHERE id=%L$u$,pg_temp.u(1)));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.ok('public_media_live_only restored', pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NOT NULL);
-- Withdraw removes access at once.
SELECT pg_temp.pub_move(22,$$live_snapshot=NULL$$);
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_media_live_only withdrawn', (SELECT pathways.p86_public_media(pg_temp.u(41),pg_temp.u(101)) IS NULL));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.refused('public_media_live_only other session', format('SELECT pathways.p86_public_media(%L,%L)',pg_temp.u(41),pg_temp.u(101)),
 '42501','Public media unavailable');

SELECT 'PUBLIC_TRACKER_MEDIA_RUNTIME=PASS ('||current_setting('ptm.passed')||')' AS result \gset
ROLLBACK;
\echo :result
