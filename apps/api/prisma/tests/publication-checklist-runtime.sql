-- cr-pathways-publication-checklist (0097): disposable checks for the approval checklists, the approval audit row and the
-- approver's review read. Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or phase4/phase6 replay database that already has 0097 applied. Success prints PUBLICATION_CHECKLIST_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Publication checklist checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('pcl.passed',(coalesce(nullif(current_setting('pcl.passed',true),''),'0')::integer+1)::text,true);
END $$;
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Staff context for user 21 (submits, uploads), 22 (approves) or 23 (not on the project); 0 clears every app context.
CREATE FUNCTION pg_temp.act_as(user_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(1)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
CREATE FUNCTION pg_temp.run(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE statement;
END $$;
CREATE FUNCTION pg_temp.pub() RETURNS pathways.project_publications LANGUAGE sql AS $$
 SELECT * FROM pathways.project_publications WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(41)
$$;
CREATE FUNCTION pg_temp.pub_sql(assignments text) RETURNS text LANGUAGE sql AS $$
 SELECT format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',assignments,pg_temp.u(1),pg_temp.u(41))
$$;
CREATE FUNCTION pg_temp.media_sql(media_n integer, assignments text) RETURNS text LANGUAGE sql AS $$
 SELECT format('UPDATE pathways.evidence_media SET %s WHERE organization_id=%L AND id=%L',assignments,pg_temp.u(1),pg_temp.u(media_n))
$$;
CREATE FUNCTION pg_temp.media(media_n integer) RETURNS pathways.evidence_media LANGUAGE sql AS $$
 SELECT * FROM pathways.evidence_media WHERE organization_id=pg_temp.u(1) AND id=pg_temp.u(media_n)
$$;
CREATE FUNCTION pg_temp.queue_sql(media_n integer) RETURNS text LANGUAGE sql AS $$
 SELECT pg_temp.media_sql(media_n,format($a$public_visibility_status='FOR_REVIEW',public_submitted_by_id=%L,public_submitted_at=now()$a$,pg_temp.u(21)))
$$;
CREATE FUNCTION pg_temp.approve_media_sql(media_n integer, checklist text) RETURNS text LANGUAGE sql AS $$
 SELECT pg_temp.media_sql(media_n,format($a$public_visibility_status='APPROVED',public_approved_by_id=%L,public_approved_at=now(),
  public_approval_checklist=%s$a$,pg_temp.u(22),checklist))
$$;

-- Catalog: the columns and their exact-shape checks, the review read for pathways_runtime only, the internal body for no API role,
-- and prisma's review policy on the publication table.
SELECT pg_temp.ok('catalog', (SELECT count(*) FROM pg_catalog.pg_constraint WHERE convalidated
   AND conname IN ('p97_publication_checklist_shape','p97_media_checklist_shape'))=2
 AND (SELECT pg_catalog.pg_get_userbyid(proowner)='prisma' AND prosecdef AND has_function_privilege('pathways_runtime',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
   AND NOT has_function_privilege('service_role',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways.p97_review_view(uuid,text)'::regprocedure)
 AND (SELECT NOT prosecdef AND NOT has_function_privilege('pathways_runtime',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways.p97_view_payload(uuid,uuid,jsonb,text,date,date,text)'::regprocedure)
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p97_prisma_review_read' AND polcmd='r'
  AND polrelid='pathways.project_publications'::regclass));

-- Fixtures: one organization; A (21) and B (22) are Project Managers on project 41; C (23) is a Project Manager on no project.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PCL_A','Synthetic publication checklist organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'Synthetic PCL submitter','pcl-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'Synthetic PCL approver','pcl-b@example.invalid'),
 (pg_temp.u(23),pg_temp.u(13),'Synthetic PCL outsider','pcl-c@example.invalid')) v(id,auth_id,full_name,email)
JOIN pathways.roles r ON r.code='PROJECT_MANAGER';
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id) VALUES (pg_temp.u(41),pg_temp.u(1),'PCL_41','Synthetic PCL project 41',pg_temp.u(21));
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(500+s),pg_temp.u(1),pg_temp.u(41),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[1,2]) s;
-- Media 101 and 102: unlinked, stored photos uploaded by A.
INSERT INTO pathways.evidence_media(id,organization_id,project_id,type,file_name,bucket,object_key,sha256,byte_size,content_type,submitted_by_id,storage_ready)
SELECT pg_temp.u(n),pg_temp.u(1),pg_temp.u(41),'PHOTO','photo.jpg','pathways-private',
 format('organizations/%s/projects/%s/evidence/%s/photo.jpg',pg_temp.u(1),pg_temp.u(41),pg_temp.u(n)),repeat('a',64),10,'image/jpeg',pg_temp.u(21),true
FROM unnest(ARRAY[101,102]) n;
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;

-- Revision 1 is submitted by A with the timeline view.
SELECT pg_temp.act_as(21);
INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
VALUES(pg_temp.u(1),pg_temp.u(41),1,'FOR_REVIEW','SUBMIT','Summary one','{"media":[],"views":["timeline"]}',pg_temp.u(21));
SELECT pg_temp.ok('submitted without a checklist', (SELECT approval_checklist IS NULL AND state='FOR_REVIEW' FROM pg_temp.pub()));

-- APPROVE: refused without the checklist, with an item false and with an item missing.
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('approve without checklist', pg_temp.pub_sql($$state='APPROVED'$$),'23514','Publication checklist required');
SELECT pg_temp.refused('approve with an item false', pg_temp.pub_sql($$state='APPROVED',approval_checklist=
 '{"smallGroupsChecked":false,"noIdentifiableMinor":true,"imageConsentOnFile":true,"pinPositionsAcceptable":true}'$$),'23514','Publication checklist required');
SELECT pg_temp.refused('approve with an item missing', pg_temp.pub_sql($$state='APPROVED',approval_checklist=
 '{"smallGroupsChecked":true,"noIdentifiableMinor":true,"imageConsentOnFile":true}'$$),'23514','Publication checklist required');

-- The approver's review read: the chosen view of the revision under review, for a holder of public.approve only.
SELECT pg_temp.ok('review read of the chosen view', pathways.p97_review_view(pg_temp.u(41),'timeline') IS NOT NULL);
SELECT pg_temp.ok('review read of an unchosen view', pathways.p97_review_view(pg_temp.u(41),'saddd') IS NULL);
SELECT set_config('pcl.review',pathways.p97_review_view(pg_temp.u(41),'timeline')::text,true);
SELECT pg_temp.act_as(23);
SELECT pg_temp.refused('review read without public.approve', $$SELECT pathways.p97_review_view('a9700000-0000-4000-8000-000000000041','timeline')$$,
 '42501','Publication review unavailable');
SELECT pg_temp.act_as(0);
SELECT pg_temp.refused('review read without a request context', $$SELECT pathways.p97_review_view('a9700000-0000-4000-8000-000000000041','timeline')$$,
 '42501','Publication review unavailable');
SELECT pg_temp.refused('internal body not callable', $$SELECT pathways.p97_view_payload(NULL,NULL,NULL,NULL,NULL,NULL,'timeline')$$,
 '42501','permission denied');

-- APPROVE with all four items: the row keeps them and the audit row names them.
SELECT pg_temp.act_as(22);
SELECT pg_temp.run(pg_temp.pub_sql($$state='APPROVED',approval_checklist=
 '{"smallGroupsChecked":true,"noIdentifiableMinor":true,"imageConsentOnFile":true,"pinPositionsAcceptable":true}'$$));
SELECT pg_temp.ok('approved with the checklist', (SELECT state='APPROVED' AND approved_by_id=pg_temp.u(22)
 AND approval_checklist='{"smallGroupsChecked":true,"noIdentifiableMinor":true,"imageConsentOnFile":true,"pinPositionsAcceptable":true}'
 FROM pg_temp.pub()));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('approval audit row names the items', (SELECT changes->>'checklist'
  ='smallGroupsChecked,noIdentifiableMinor,imageConsentOnFile,pinPositionsAcceptable'
 FROM pathways.audit_logs WHERE organization_id=pg_temp.u(1) AND action='PUBLICATION_APPROVE' AND entity_id=pg_temp.u(41)::text));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;

-- PUBLISH keeps the checklist; the published page computes the same figures the approver reviewed.
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('publish may not drop the checklist', pg_temp.pub_sql($$state='PUBLISHED',approval_checklist=NULL$$),'42501','Publication publishing unavailable');
SELECT pg_temp.run(pg_temp.pub_sql($$state='PUBLISHED'$$));
SELECT pg_temp.ok('published keeps the checklist', (SELECT state='PUBLISHED' AND approval_checklist IS NOT NULL FROM pg_temp.pub()));
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public view equals the reviewed figures', pathways.p87_public_view(pg_temp.u(41),'timeline')::text=current_setting('pcl.review'));
SELECT pg_temp.act_as(22);
SELECT pg_temp.ok('no review read once published', pathways.p97_review_view(pg_temp.u(41),'timeline') IS NULL);

-- A new SUBMIT clears the checklist for the next approval.
SELECT pg_temp.act_as(21);
SELECT pg_temp.run(pg_temp.pub_sql($$state='FOR_REVIEW',revision=2,summary='Summary two',snapshot='{"media":[],"views":["timeline"]}'$$));
SELECT pg_temp.ok('resubmission clears the checklist', (SELECT revision=2 AND approval_checklist IS NULL FROM pg_temp.pub()));

-- Media: the checklist is set only by approval, approval needs both items, and it then cannot change.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('queue may not set the checklist', pg_temp.media_sql(102,format($a$public_visibility_status='FOR_REVIEW',
 public_submitted_by_id=%L,public_submitted_at=now(),public_approval_checklist='{"noIdentifiableMinor":true,"imageConsentOnFile":true}'$a$,pg_temp.u(21))),
 '23514','Media checklist is set only by approval');
SELECT pg_temp.run(pg_temp.queue_sql(101));
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('media approve without checklist', pg_temp.approve_media_sql(101,'NULL'),'23514','Media checklist required');
SELECT pg_temp.refused('media approve with an item false', pg_temp.approve_media_sql(101,
 $$'{"noIdentifiableMinor":true,"imageConsentOnFile":false}'$$),'23514','Media checklist required');
SELECT pg_temp.refused('media approve with an item missing', pg_temp.approve_media_sql(101,$$'{"noIdentifiableMinor":true}'$$),'23514','Media checklist required');
SELECT pg_temp.run(pg_temp.approve_media_sql(101,$$'{"noIdentifiableMinor":true,"imageConsentOnFile":true}'$$));
SELECT pg_temp.ok('media approved with the checklist', (SELECT public_visibility_status='APPROVED'
 AND public_approval_checklist='{"noIdentifiableMinor":true,"imageConsentOnFile":true}' FROM pg_temp.media(101)));
SELECT pg_temp.refused('media checklist immutable', pg_temp.media_sql(101,'public_approval_checklist=NULL'),'23514','cannot be rewritten');

RESET SESSION AUTHORIZATION;
SELECT 'PUBLICATION_CHECKLIST_RUNTIME=PASS ('||current_setting('pcl.passed')||')' AS result \gset
ROLLBACK;
\echo :result
