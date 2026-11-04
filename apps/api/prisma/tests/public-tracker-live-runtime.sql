-- cr-pathways-public-tracker-media-analytics (0085): disposable checks for the live public revision, the ten-key snapshot and
-- p85_public_projects. Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable
-- pathways_phase2_* or phase4/phase6 replay database that already has 0085 applied. Success prints PUBLIC_TRACKER_LIVE_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Public tracker live checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a8500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('ptl.passed',(coalesce(nullif(current_setting('ptl.passed',true),''),'0')::integer+1)::text,true);
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
-- Staff context for user 21 (A, submits) or 22 (B, approves and publishes); 0 clears every app context.
CREATE FUNCTION pg_temp.act_as(user_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(1)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
CREATE FUNCTION pg_temp.pub(project_n integer) RETURNS pathways.project_publications LANGUAGE sql AS $$
 SELECT * FROM pathways.project_publications WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(project_n)
$$;
-- Moves a publication by one UPDATE as the given user.
CREATE FUNCTION pg_temp.move(user_n integer, project_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',
  assignments,pg_temp.u(1),pg_temp.u(project_n));
END $$;
CREATE FUNCTION pg_temp.submit_first(project_n integer, summary text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
 VALUES(pg_temp.u(1),pg_temp.u(project_n),1,'FOR_REVIEW','SUBMIT',summary,'{"media":[],"views":[]}',pg_temp.u(21));
END $$;
-- Receipt insert for the publication's current revision, as the API records it after a transition.
CREATE FUNCTION pg_temp.receipt_sql(user_n integer, project_n integer, request_n integer, op text) RETURNS text LANGUAGE sql AS $$
 SELECT format($i$INSERT INTO pathways.publication_requests(organization_id,project_id,actor_id,request_id,operation_code,request_hash,
  resulting_revision,resulting_state,resulting_updated_at) SELECT organization_id,project_id,%L,%L,%L,%L,revision,state,updated_at
  FROM pathways.project_publications WHERE organization_id=%L AND project_id=%L$i$,
  pg_temp.u(user_n),pg_temp.u(request_n),op,repeat('a',64),pg_temp.u(1),pg_temp.u(project_n))
$$;

-- backfill: every row that existed before this suite carries media and views arrays, and every PUBLISHED one is live as itself.
SELECT pg_temp.ok('backfill', NOT EXISTS(SELECT FROM pathways.project_publications
 WHERE snapshot->'media' IS DISTINCT FROM '[]'::jsonb OR snapshot->'views' IS DISTINCT FROM '[]'::jsonb
  OR (state='PUBLISHED' AND ROW(live_revision,live_snapshot,live_published_at,live_published_by_id)
   IS DISTINCT FROM ROW(revision,snapshot,published_at,published_by_id))));

-- Catalog: the guard keeps its owner and mode, the new functions are prisma-owned definers executable by pathways_runtime only.
SELECT pg_temp.ok('catalog', (SELECT pg_catalog.pg_get_userbyid(proowner)='prisma' AND NOT prosecdef AND proconfig=ARRAY['search_path=""']
  FROM pg_catalog.pg_proc WHERE oid='pathways.p34_guard_publication()'::regprocedure)
 AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p85_public_projects(uuid,integer,integer)'::regprocedure,
   'pathways.p85_publication_media(jsonb,uuid)'::regprocedure,'pathways.p85_publication_views(jsonb)'::regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=3
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p85_prisma_live_read'
  AND polrelid='pathways.project_publications'::regclass AND polcmd='r')
 AND (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.project_publications'::regclass)
 AND EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgname='p34_guard_publication' AND tgenabled='O'
  AND tgrelid='pathways.project_publications'::regclass));

-- Fixtures: one organization, staff A (21) and B (22), both Project Managers assigned to projects 41, 42 and 43.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PTL_A','Synthetic public tracker organization');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,pg_temp.u(1),r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(11),'Synthetic PTL submitter','ptl-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(12),'Synthetic PTL publisher','ptl-b@example.invalid')) v(id,auth_id,full_name,email)
JOIN pathways.roles r ON r.code='PROJECT_MANAGER';
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,created_by_id)
SELECT pg_temp.u(n),pg_temp.u(1),'PTL_'||n,'Synthetic PTL project '||n,pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(500+p*2+s),pg_temp.u(1),pg_temp.u(p),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) p, unnest(ARRAY[1,2]) s;
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
-- R1: a first SUBMIT may not set the live revision or choose media or views in 0085.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('insert with live columns refused', format($s$INSERT INTO pathways.project_publications(organization_id,project_id,
 revision,state,last_operation,summary,snapshot,submitted_by_id,live_revision) VALUES(%L,%L,1,'FOR_REVIEW','SUBMIT','Summary',
 '{"media":[],"views":[]}',%L,1)$s$,pg_temp.u(1),pg_temp.u(43),pg_temp.u(21)),'23514','Live publication');
SELECT pg_temp.refused('insert with views refused', format($s$INSERT INTO pathways.project_publications(organization_id,project_id,
 revision,state,last_operation,summary,snapshot,submitted_by_id) VALUES(%L,%L,1,'FOR_REVIEW','SUBMIT','Summary',
 '{"media":[],"views":["kpi"]}',%L)$s$,pg_temp.u(1),pg_temp.u(43),pg_temp.u(21)),'23514','Public view selection');

-- Project 41: revision 1 is submitted, approved and published.
SELECT pg_temp.submit_first(41,'Summary one');
SELECT pg_temp.move(22,41,$$state='APPROVED'$$);
SELECT pg_temp.move(22,41,$$state='PUBLISHED'$$);
SELECT pg_temp.ok('publish sets live', (SELECT live_revision=1 AND live_snapshot=snapshot AND live_published_by_id=pg_temp.u(22)
 AND live_published_at=published_at AND snapshot->'media'='[]' AND snapshot->'views'='[]' FROM pg_temp.pub(41)));

-- submit_while_published_keeps_live: A submits a new summary while revision 1 is live.
SELECT pg_temp.move(21,41,$$revision=2,state='FOR_REVIEW',summary='Summary two'$$);
SELECT pg_temp.ok('submit_while_published_keeps_live', (SELECT state='FOR_REVIEW' AND revision=2 AND approved_by_id IS NULL
 AND live_revision=1 AND live_snapshot->>'approvedSummary'='Summary one' AND snapshot->>'approvedSummary'='Summary two'
 AND last_operation='SUBMIT' FROM pg_temp.pub(41)));

-- publish_moves_live: B approves and publishes revision 2.
SELECT pg_temp.move(22,41,$$state='APPROVED'$$);
SELECT pg_temp.ok('approve keeps live', (SELECT live_revision=1 FROM pg_temp.pub(41)));
SELECT pg_temp.move(22,41,$$state='PUBLISHED'$$);
SELECT pg_temp.ok('publish_moves_live', (SELECT live_revision=2 AND live_published_by_id=pg_temp.u(22)
 AND live_snapshot->>'approvedSummary'='Summary two' FROM pg_temp.pub(41)));
-- A WITHDRAW receipt is refused when this transaction made no withdraw.
SELECT pg_temp.refused('withdraw_receipt_without_withdraw', pg_temp.receipt_sql(22,41,901,'WITHDRAW'),'23514','same-transaction transition');

-- Revision 3 waits for review while revision 2 is live; the caller cannot set live columns or choose media or views itself.
SELECT pg_temp.move(21,41,$$revision=3,state='FOR_REVIEW',summary='Summary three'$$);
SELECT pg_temp.act_as(22);
SELECT pg_temp.refused('live columns set only by publish', format($s$UPDATE pathways.project_publications SET live_revision=3
 WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),'23514','Live publication');
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('nonempty_media_or_views_refused_0085 media', format($s$UPDATE pathways.project_publications SET revision=4,
 snapshot=jsonb_build_object('media',jsonb_build_array(jsonb_build_object('id',%L::uuid,'type','PHOTO','contentType','image/png',
 'caption','A photo')),'views','[]'::jsonb) WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(99),pg_temp.u(1),pg_temp.u(41)),
 '23514','Public media selection');
SELECT pg_temp.refused('nonempty_media_or_views_refused_0085 views', format($s$UPDATE pathways.project_publications SET revision=4,
 snapshot='{"media":[],"views":["kpi"]}' WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),
 '23514','Public view selection');

-- public_read_live_only: with no app context the public read returns revision 2, not the revision 3 under review.
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_read_live_only live', (SELECT jsonb_array_length(r)=1 AND r->0->>'approvedSummary'='Summary two'
 AND r->0->>'id'=pg_temp.u(41)::text AND r->0 ? 'publishedAt' AND r->0->'media'='[]' AND r->0->'views'='[]'
 FROM pathways.p85_public_projects(pg_temp.u(41)) r));
SELECT pg_temp.ok('public_read_live_only list', (SELECT r @> jsonb_build_array(jsonb_build_object('id',pg_temp.u(41)::text))
 FROM pathways.p85_public_projects() r));
SELECT pg_temp.refused('public read bounds', 'SELECT pathways.p85_public_projects(NULL,0,0)','22023','Invalid public request');

-- withdraw_with_pending_draft: B withdraws revision 2; revision 3 stays under review untouched.
SELECT pg_temp.move(22,41,$$live_snapshot=NULL$$);
SELECT pg_temp.ok('withdraw_with_pending_draft', (SELECT state='FOR_REVIEW' AND revision=3 AND summary='Summary three'
 AND submitted_by_id=pg_temp.u(21) AND last_operation='WITHDRAW'
 AND num_nulls(live_revision,live_snapshot,live_published_at,live_published_by_id)=4 FROM pg_temp.pub(41)));
-- withdraw_receipt_with_pending_draft: B records the withdraw although A submitted the pending draft.
SELECT pg_temp.receipt_sql(22,41,902,'WITHDRAW') \gexec
SELECT pg_temp.ok('withdraw_receipt_with_pending_draft', EXISTS(SELECT FROM pathways.publication_requests
 WHERE request_id=pg_temp.u(902) AND actor_id=pg_temp.u(22) AND operation_code='WITHDRAW' AND resulting_revision=3 AND resulting_state='FOR_REVIEW'));
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public_read_live_only withdrawn', (SELECT pathways.p85_public_projects(pg_temp.u(41))='[]'::jsonb));

-- Project 42: revision 1 is live, revision 2 is approved, and A edits again before it is published.
SELECT pg_temp.submit_first(42,'Live summary');
SELECT pg_temp.move(22,42,$$state='APPROVED'$$);
SELECT pg_temp.move(22,42,$$state='PUBLISHED'$$);
SELECT pg_temp.move(21,42,$$revision=2,state='FOR_REVIEW',summary='Draft summary'$$);
SELECT pg_temp.move(22,42,$$state='APPROVED'$$);
SELECT set_config('ptl.live42',(SELECT row_to_json(x)::text FROM (SELECT live_revision,live_snapshot,live_published_at,live_published_by_id
 FROM pg_temp.pub(42)) x),true);
SELECT pg_temp.move(21,42,$$revision=3,state='FOR_REVIEW',summary='Edited draft summary'$$);
SELECT pg_temp.ok('resubmit_clears_approval', (SELECT state='FOR_REVIEW' AND revision=3 AND approved_by_id IS NULL AND approved_at IS NULL
 AND (SELECT row_to_json(x)::text FROM (SELECT live_revision,live_snapshot,live_published_at,live_published_by_id) x)=current_setting('ptl.live42')
 AND live_revision=1 FROM pg_temp.pub(42)));

-- withdraw_when_published: revision 3 goes live, then B withdraws it the way it is done today.
SELECT pg_temp.move(22,42,$$state='APPROVED'$$);
SELECT pg_temp.move(22,42,$$state='PUBLISHED'$$);
SELECT set_config('ptl.snapshot42',(SELECT snapshot::text FROM pg_temp.pub(42)),true);
SELECT pg_temp.move(22,42,$$revision=4,state='FOR_REVIEW',live_snapshot=NULL$$);
SELECT pg_temp.ok('withdraw_when_published', (SELECT state='FOR_REVIEW' AND revision=4 AND snapshot=current_setting('ptl.snapshot42')::jsonb
 AND submitted_by_id=pg_temp.u(22) AND approved_by_id IS NULL AND published_by_id IS NULL AND last_operation='WITHDRAW'
 AND num_nulls(live_revision,live_snapshot,live_published_at,live_published_by_id)=4 FROM pg_temp.pub(42)));

-- archived_project_hidden: project 43 is live, then archived.
SELECT pg_temp.submit_first(43,'Archived summary');
SELECT pg_temp.move(22,43,$$state='APPROVED'$$);
SELECT pg_temp.move(22,43,$$state='PUBLISHED'$$);
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('archived project listed while active', (SELECT jsonb_array_length(pathways.p85_public_projects(pg_temp.u(43)))=1));
RESET SESSION AUTHORIZATION;
SET LOCAL session_replication_role = replica;
UPDATE pathways.projects SET archived_at=now() WHERE organization_id=pg_temp.u(1) AND id=pg_temp.u(43);
SET LOCAL session_replication_role = origin;
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('archived_project_hidden', (SELECT pathways.p85_public_projects(pg_temp.u(43))='[]'::jsonb
 AND NOT pathways.p85_public_projects() @> jsonb_build_array(jsonb_build_object('id',pg_temp.u(43)::text))));
RESET SESSION AUTHORIZATION;

-- The prisma live-read policy shows only live rows: project 43 is live, projects 41 and 42 are withdrawn.
SELECT pg_temp.ok('fixture has non-live rows', (SELECT count(*)=3 AND count(*) FILTER (WHERE live_snapshot IS NULL)=2
 FROM pathways.project_publications WHERE organization_id=pg_temp.u(1)));
SET LOCAL ROLE prisma;
SELECT pg_temp.ok('p85_prisma_live_read shows only live rows', (SELECT count(*)=1 AND bool_and(live_snapshot IS NOT NULL)
 AND bool_and(project_id=pg_temp.u(43)) FROM pathways.project_publications WHERE organization_id=pg_temp.u(1)));
RESET ROLE;

-- public_read_live_only: any session other than pathways_runtime is refused.
SELECT pg_temp.refused('public read refused for other sessions', 'SELECT pathways.p85_public_projects()','42501','Public projection');

-- snapshot_rejects_extra_keys: the shape CHECK holds even with the guard bypassed.
SET LOCAL session_replication_role = replica;
SELECT pg_temp.refused('snapshot_rejects_extra_keys', format($s$UPDATE pathways.project_publications SET snapshot=snapshot||'{"extra":1}'
 WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),'23514','publication_snapshot_shape');
SELECT pg_temp.refused('snapshot media must be an array', format($s$UPDATE pathways.project_publications SET snapshot=snapshot||'{"media":{}}'
 WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),'23514','publication_snapshot_shape');
SELECT pg_temp.refused('live columns move together', format($s$UPDATE pathways.project_publications SET live_revision=1
 WHERE organization_id=%L AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),'23514','publication_live_together');
SET LOCAL session_replication_role = origin;

SELECT 'PUBLIC_TRACKER_LIVE_RUNTIME=PASS ('||current_setting('ptl.passed')||')' AS result \gset
ROLLBACK;
\echo :result
