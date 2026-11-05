-- 0085 public tracker live revision (cr-pathways-public-tracker-media-analytics sections 3.5a and 3.7); forward migration.
-- project_publications keeps the last published revision in live_revision, live_snapshot, live_published_at and
-- live_published_by_id, so staff can submit and review a new revision while the public keeps reading the live one.
-- The snapshot gains media and views arrays (empty only until 0086 and 0087 replace the two validators).
-- p34_guard_publication keeps the 0034 body with these changes (marked 0085): WITHDRAW clears the live columns and is the only
-- way to clear them, SUBMIT is allowed from PUBLISHED and validates media and views, PUBLISH sets the live columns.
-- p34_guard_publication_request keeps the 0034 body except that a WITHDRAW receipt requires the live columns cleared in the
-- same transaction instead of the withdrawer being the submitter, since a withdraw under a pending draft keeps its submitter.
-- p85_public_projects reads only live snapshots, as prisma through the p85_prisma_live_read policy.
-- p34_public_projects stays in place unused. Owner, security mode, search_path and ACL of both guards stay unchanged (asserted below).
-- No new table, role or owner-role change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0084_smart_mapping_v4'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0085 requires the verified 0084 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_publications'::pg_catalog.regclass)<>'prisma'
  OR EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.project_publications'::pg_catalog.regclass
   AND a.attname LIKE 'live\_%' AND NOT a.attisdropped)
  OR pg_catalog.to_regprocedure('pathways.p85_public_projects(uuid,integer,integer)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p85_publication_media(jsonb,uuid)') IS NOT NULL
  OR pg_catalog.to_regprocedure('pathways.p85_publication_views(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION '0085 requires prisma to own project_publications and no earlier live columns or p85 functions'; END IF;
 -- Only the reviewed 0034 guards may be replaced; their ACLs are kept.
 FOR fn IN SELECT w.n, w.sig, w.md5, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways.p34_guard_publication()','e66d434584d57e28dd3bb39982e10bf2'),
   (1,'pathways.p34_guard_publication_request()','cb928a3793da446b09d91e9badf65cb8')) w(n,sig,md5)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef OR fn.provolatile<>'v'
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>fn.md5
  THEN RAISE EXCEPTION '0085 requires the reviewed definition of %',fn.sig; END IF;
  PERFORM pg_catalog.set_config('pathways_0085.acl_'||fn.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,85);

-- 1. Live columns, set and cleared together.
ALTER TABLE pathways.project_publications
  ADD COLUMN live_revision integer,
  ADD COLUMN live_snapshot jsonb,
  ADD COLUMN live_published_at timestamptz(3),
  ADD COLUMN live_published_by_id uuid,
  ADD CONSTRAINT publication_live_together CHECK(num_nulls(live_revision,live_snapshot,live_published_at,live_published_by_id) IN (0,4)),
  ADD CONSTRAINT project_publications_organization_id_live_published_by_id_fkey FOREIGN KEY(organization_id,live_published_by_id)
    REFERENCES pathways.system_users(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  DROP CONSTRAINT publication_snapshot_shape;

-- 2. Backfill as the owner with the guard and forced row security off, inside this transaction only.
ALTER TABLE pathways.project_publications DISABLE TRIGGER p34_guard_publication;
ALTER TABLE pathways.project_publications NO FORCE ROW LEVEL SECURITY;
UPDATE pathways.project_publications SET snapshot=snapshot||'{"media":[],"views":[]}'::jsonb;
UPDATE pathways.project_publications SET live_revision=revision,live_snapshot=snapshot,live_published_at=published_at,
  live_published_by_id=published_by_id WHERE state='PUBLISHED';
-- Checked before FORCE returns, while the owner still sees every row.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pathways.project_publications WHERE snapshot->'media' IS DISTINCT FROM '[]'::jsonb
   OR snapshot->'views' IS DISTINCT FROM '[]'::jsonb OR (state='PUBLISHED' AND ROW(live_revision,live_snapshot,live_published_at,
   live_published_by_id) IS DISTINCT FROM ROW(revision,snapshot,published_at,published_by_id)) OR (state<>'PUBLISHED' AND live_snapshot IS NOT NULL))
 THEN RAISE EXCEPTION '0085 backfill postcondition failed'; END IF;
END $$;
ALTER TABLE pathways.project_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways.project_publications ENABLE TRIGGER p34_guard_publication;

-- 3. The ten-key snapshot.
ALTER TABLE pathways.project_publications ADD CONSTRAINT publication_snapshot_shape CHECK(jsonb_typeof(snapshot)='object'
  AND snapshot ?& ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate','media','views']
  AND snapshot - ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate','media','views'] = '{}'::jsonb
  AND (snapshot->>'id'=project_id::text) IS TRUE AND (snapshot->>'approvedSummary'=summary) IS TRUE
  AND jsonb_typeof(snapshot->'title')='string' AND jsonb_typeof(snapshot->'code')='string'
  AND jsonb_typeof(snapshot->'media')='array' AND jsonb_typeof(snapshot->'views')='array');

-- 4. Selection validators; 0086 and 0087 replace these bodies.
CREATE FUNCTION pathways.p85_publication_media(media jsonb, wanted_project uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF media IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Public media selection unavailable' USING ERRCODE='23514'; END IF;
 RETURN media;
END $$;
CREATE FUNCTION pathways.p85_publication_views(views jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF views IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Public view selection unavailable' USING ERRCODE='23514'; END IF;
 RETURN views;
END $$;

-- 5. The guard (marked 0085).
CREATE OR REPLACE FUNCTION pathways.p34_guard_publication() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p record; actor uuid:=pathways.runtime_context_user(); now_at timestamptz(3):=clock_timestamp(); op text;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF session_user<>'pathways_runtime' OR actor IS NULL OR TG_OP='DELETE'
  OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
 THEN RAISE EXCEPTION 'Publication identity unavailable' USING ERRCODE='42501'; END IF;
 SELECT id,organization_id,title,code,implementation_area,sector,start_date,end_date INTO p
  FROM pathways.projects WHERE organization_id=NEW.organization_id AND id=NEW.project_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Publication project unavailable' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF num_nonnulls(NEW.live_revision,NEW.live_snapshot,NEW.live_published_at,NEW.live_published_by_id)>0
  THEN RAISE EXCEPTION 'Live publication is set only by publishing (0085)' USING ERRCODE='23514'; END IF;
  op:='SUBMIT';
 ELSE
  IF ROW(NEW.organization_id,NEW.project_id) IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id)
  THEN RAISE EXCEPTION 'Publication scope immutable' USING ERRCODE='23514'; END IF;
  IF OLD.live_snapshot IS NOT NULL AND NEW.live_snapshot IS NULL THEN
   -- Withdrawing a published row reopens it for review; withdrawing under a pending draft leaves the draft as it is.
   IF (OLD.state='PUBLISHED' AND (NEW.state<>'FOR_REVIEW' OR NEW.revision<>OLD.revision+1
     OR ROW(NEW.summary,NEW.snapshot) IS DISTINCT FROM ROW(OLD.summary,OLD.snapshot)))
    OR (OLD.state<>'PUBLISHED' AND ROW(NEW.state,NEW.revision,NEW.summary,NEW.snapshot)
     IS DISTINCT FROM ROW(OLD.state,OLD.revision,OLD.summary,OLD.snapshot))
   THEN RAISE EXCEPTION 'Withdrawal keeps the publication content' USING ERRCODE='23514'; END IF;
   op:='WITHDRAW';
  ELSIF ROW(NEW.live_revision,NEW.live_snapshot,NEW.live_published_at,NEW.live_published_by_id)
   IS DISTINCT FROM ROW(OLD.live_revision,OLD.live_snapshot,OLD.live_published_at,OLD.live_published_by_id)
  THEN RAISE EXCEPTION 'Live publication is set only by publishing (0085)' USING ERRCODE='23514';
  ELSIF NEW.state='FOR_REVIEW' AND NEW.revision=OLD.revision+1 THEN op:='SUBMIT';
  ELSIF OLD.state='FOR_REVIEW' AND NEW.state='APPROVED' AND NEW.revision=OLD.revision THEN op:='APPROVE';
  ELSIF OLD.state='APPROVED' AND NEW.state='PUBLISHED' AND NEW.revision=OLD.revision THEN op:='PUBLISH';
  ELSE RAISE EXCEPTION 'Invalid publication transition' USING ERRCODE='23514'; END IF;
 END IF;
 IF op IN('SUBMIT','WITHDRAW') THEN
  IF (op='SUBMIT' AND NOT pathways.p05_has_project_permission('public.preview',NEW.project_id))
   OR (op='WITHDRAW' AND NOT pathways.p05_has_project_permission('public.publish',NEW.project_id))
   OR (TG_OP='INSERT' AND (NEW.revision<>1 OR NEW.state<>'FOR_REVIEW'))
  THEN RAISE EXCEPTION 'Publication submission unavailable' USING ERRCODE='42501'; END IF;
  IF op='WITHDRAW' THEN
   NEW.live_revision:=NULL; NEW.live_snapshot:=NULL; NEW.live_published_at:=NULL; NEW.live_published_by_id:=NULL;
  END IF;
  IF op='WITHDRAW' AND OLD.state<>'PUBLISHED' THEN
   NEW.submitted_by_id:=OLD.submitted_by_id; NEW.submitted_at:=OLD.submitted_at;
   NEW.approved_by_id:=OLD.approved_by_id; NEW.approved_at:=OLD.approved_at;
   NEW.published_by_id:=OLD.published_by_id; NEW.published_at:=OLD.published_at;
  ELSE
   NEW.submitted_by_id:=actor; NEW.submitted_at:=now_at;
   NEW.approved_by_id:=NULL; NEW.approved_at:=NULL; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
  END IF;
  IF op='SUBMIT' THEN
   NEW.snapshot:=jsonb_build_object('id',p.id,'title',p.title,'code',p.code,'approvedSummary',NEW.summary,
    'area',p.implementation_area,'sector',p.sector,'startDate',p.start_date,'endDate',p.end_date,
    'media',pathways.p85_publication_media(NEW.snapshot->'media',NEW.project_id),
    'views',pathways.p85_publication_views(NEW.snapshot->'views'));
  END IF;
 ELSE
  IF ROW(NEW.summary,NEW.snapshot,NEW.submitted_by_id,NEW.submitted_at)
   IS DISTINCT FROM ROW(OLD.summary,OLD.snapshot,OLD.submitted_by_id,OLD.submitted_at)
  THEN RAISE EXCEPTION 'Approved publication content immutable' USING ERRCODE='23514'; END IF;
  IF op='APPROVE' THEN
   IF NOT pathways.p05_has_project_permission('public.approve',NEW.project_id) OR actor=OLD.submitted_by_id
   THEN RAISE EXCEPTION 'Distinct publication approval required' USING ERRCODE='42501'; END IF;
   NEW.approved_by_id:=actor; NEW.approved_at:=now_at; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
  ELSE
   IF NOT pathways.p05_has_project_permission('public.publish',NEW.project_id)
    OR ROW(NEW.approved_by_id,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by_id,OLD.approved_at)
   THEN RAISE EXCEPTION 'Publication publishing unavailable' USING ERRCODE='42501'; END IF;
   NEW.published_by_id:=actor; NEW.published_at:=now_at;
   NEW.live_revision:=NEW.revision; NEW.live_snapshot:=NEW.snapshot; NEW.live_published_at:=now_at; NEW.live_published_by_id:=actor;
  END IF;
 END IF;
 NEW.last_operation:=op; NEW.updated_at:=now_at;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(NEW.organization_id,NEW.project_id,actor,'PUBLICATION_'||op,'ProjectPublication',NEW.project_id::text,
  jsonb_build_object('revision',NEW.revision,'state',NEW.state,'liveRevision',NEW.live_revision));
 RETURN NEW;
END $$;

-- 6. The receipt guard (marked 0085): a WITHDRAW receipt needs the live columns cleared by this transaction's withdraw.
CREATE OR REPLACE FUNCTION pathways.p34_guard_publication_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE publication record; current_xid xid;
BEGIN
 PERFORM pathways.p34_assert_projection_provisioned();
 IF TG_OP<>'INSERT' OR session_user<>'pathways_runtime' OR NEW.organization_id IS DISTINCT FROM pathways.runtime_context_organization()
  OR NEW.actor_id IS DISTINCT FROM pathways.runtime_context_user()
 THEN RAISE EXCEPTION 'Publication receipt immutable and scoped' USING ERRCODE='42501'; END IF;
 current_xid:=pg_catalog.mod(pg_catalog.pg_current_xact_id()::text::numeric,4294967296)::text::xid;
 SELECT p.revision,p.state,p.updated_at,p.last_operation,p.xmin,p.submitted_by_id,p.approved_by_id,p.published_by_id,
  p.live_revision,p.live_snapshot INTO publication FROM pathways.project_publications p
  WHERE p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id;
 IF NOT FOUND OR publication.xmin<>current_xid OR publication.last_operation IS DISTINCT FROM NEW.operation_code
  OR (NEW.operation_code='WITHDRAW' AND num_nonnulls(publication.live_revision,publication.live_snapshot)>0)
  OR (NEW.operation_code<>'WITHDRAW' AND (CASE NEW.operation_code WHEN 'SUBMIT' THEN publication.submitted_by_id
      WHEN 'APPROVE' THEN publication.approved_by_id ELSE publication.published_by_id END) IS DISTINCT FROM NEW.actor_id)
  OR ROW(publication.revision,publication.state,publication.updated_at)
   IS DISTINCT FROM ROW(NEW.resulting_revision,NEW.resulting_state,NEW.resulting_updated_at)
 THEN RAISE EXCEPTION 'Publication receipt requires actual same-transaction transition (0085)' USING ERRCODE='23514'; END IF;
 NEW.recorded_at:=clock_timestamp(); RETURN NEW;
END $$;

-- 7. The live-only public read.
CREATE POLICY p85_prisma_live_read ON pathways.project_publications FOR SELECT TO prisma USING(live_snapshot IS NOT NULL);
CREATE FUNCTION pathways.p85_public_projects(wanted_project uuid DEFAULT NULL,skip_rows integer DEFAULT 0,take_rows integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public projection unavailable' USING ERRCODE='42501'; END IF;
 IF skip_rows IS NULL OR take_rows IS NULL OR skip_rows<0 OR skip_rows>10000 OR take_rows<1 OR take_rows>100
 THEN RAISE EXCEPTION 'Invalid public request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(q.payload ORDER BY q.project_id) FROM(
  SELECT pub.project_id,pub.live_snapshot||jsonb_build_object('publishedAt',pub.live_published_at) AS payload
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
   AND (wanted_project IS NULL OR pub.project_id=wanted_project)
  ORDER BY pub.project_id LIMIT take_rows OFFSET skip_rows)q),'[]'::jsonb);
END $$;
-- shortcut: p34_public_projects stays installed but unused, drop it in a cleanup CR with the public_projection_owner preprovision chain.
REVOKE ALL ON FUNCTION pathways.p85_public_projects(uuid,integer,integer),pathways.p85_publication_media(jsonb,uuid),
  pathways.p85_publication_views(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p85_public_projects(uuid,integer,integer),pathways.p85_publication_media(jsonb,uuid),
  pathways.p85_publication_views(jsonb) TO pathways_runtime;

-- Postconditions: columns and constraints, forced row security, both guard bodies, owners, ACLs and triggers, and the new
-- functions and policy.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.project_publications'::pg_catalog.regclass
   AND NOT a.attisdropped AND NOT a.attnotnull AND ((a.attname='live_revision' AND a.atttypid='integer'::pg_catalog.regtype)
    OR (a.attname='live_snapshot' AND a.atttypid='jsonb'::pg_catalog.regtype)
    OR (a.attname='live_published_at' AND a.atttypid='timestamptz'::pg_catalog.regtype)
    OR (a.attname='live_published_by_id' AND a.atttypid='uuid'::pg_catalog.regtype)))<>4
  OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.project_publications'::pg_catalog.regclass AND c.convalidated
   AND c.conname IN ('publication_live_together','publication_snapshot_shape','project_publications_organization_id_live_published_by_id_fkey'))<>3
  OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.project_publications'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0085 table postconditions failed'; END IF;
 IF (SELECT count(*) FROM (VALUES (0,'pathways.p34_guard_publication()','a29ed81274a4b4d5c81cc8fa2a7cf83d'),
    (1,'pathways.p34_guard_publication_request()','c62a26d1a8096480c41b2104c71a590b')) w(n,sig,md5)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND NOT p.prosecdef AND p.provolatile='v'
    AND p.proconfig=ARRAY['search_path=""'] AND pg_catalog.md5(p.prosrc)=w.md5
    AND coalesce(p.proacl::text,'')=pg_catalog.current_setting('pathways_0085.acl_'||w.n))<>2
  OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgenabled='O' AND NOT t.tgisinternal AND (
   (t.tgname='p34_guard_publication' AND t.tgrelid='pathways.project_publications'::pg_catalog.regclass
     AND t.tgfoid='pathways.p34_guard_publication()'::pg_catalog.regprocedure)
   OR (t.tgname='p34_guard_publication_request' AND t.tgrelid='pathways.publication_requests'::pg_catalog.regclass
     AND t.tgfoid='pathways.p34_guard_publication_request()'::pg_catalog.regprocedure)))<>2
  OR (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p85_public_projects(uuid,integer,integer)'::pg_catalog.regprocedure,
    'pathways.p85_publication_media(jsonb,uuid)'::pg_catalog.regprocedure,'pathways.p85_publication_views(jsonb)'::pg_catalog.regprocedure)
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
   AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
    FROM pg_catalog.aclexplode(p.proacl) a)=ARRAY['pathways_runtime','prisma'])<>3
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p85_prisma_live_read' AND polcmd='r'
   AND polrelid='pathways.project_publications'::pg_catalog.regclass AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid])
 THEN RAISE EXCEPTION '0085 function postconditions failed'; END IF;
END $$;
COMMIT;
