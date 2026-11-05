-- 0086 public tracker media (cr-pathways-public-tracker-media-analytics sections 3.3, 3.4 and 3.7); forward migration.
-- p3_evidence_public is replaced: a row is PRIVATE with no public columns set, or it is in the public media queue (FOR_REVIEW,
-- then APPROVED by someone other than its uploader and its sender), which takes only unlinked or beneficiary photos and videos.
-- The consent, identifying and enrollment restrictions are dropped (section 3.4), and PUBLISHED is no longer a valid state.
-- p3_guard_public_evidence keeps the baseline body and, for pathways_runtime sessions, also requires the queue sender, the
-- approver and a rejecter of a FOR_REVIEW row to be the acting user (marked 0086). Owner, mode, search_path and ACL are kept.
-- p85_publication_media now checks every chosen item against the pickable rule in the caller's organization and project, and
-- answers only inside the publication guard. p86_public_media gives the storage key of an item on the live revision only.
-- p85_public_projects keeps the 0085 body except that each live media list leaves out items rejected or gone since publishing.
-- No new table, role or owner-role change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0085_public_tracker_live_revision'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0086 requires the verified 0085 state and migration identity'; END IF;
 -- The definers below read evidence_media as its owner, so it must stay prisma-owned without forced row security.
 IF (SELECT pg_catalog.pg_get_userbyid(relowner)<>'prisma' OR relforcerowsecurity FROM pg_catalog.pg_class
   WHERE oid='pathways.evidence_media'::pg_catalog.regclass)
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.evidence_media'::pg_catalog.regclass
   AND conname='p3_evidence_public' AND contype='c')
  OR pg_catalog.to_regprocedure('pathways.p86_public_media(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION '0086 requires prisma-owned evidence_media with p3_evidence_public and no p86 function'; END IF;
 -- The 0085 media validator and public read are replaced and keep their ACLs; the evidence guard must be the baseline body.
 FOR fn IN SELECT w.n, w.sig, w.md5, w.secdef, w.vol, w.cfg, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways.p85_publication_media(jsonb,uuid)','c03f1e3532e61630d4c976682fb7360f',true,'s',ARRAY['search_path=""']),
   (1,'pathways.p3_guard_public_evidence()','5f70529c1edd30bba73a4c9a660f154f',false,'v',ARRAY['search_path=pg_catalog']),
   (2,'pathways.p85_public_projects(uuid,integer,integer)','5d468f817ce70c1d72428fc21ffe9fe6',true,'s',ARRAY['search_path=""']))
   w(n,sig,md5,secdef,vol,cfg)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef<>fn.secdef OR fn.provolatile<>fn.vol
   OR fn.proconfig IS DISTINCT FROM fn.cfg OR pg_catalog.md5(fn.prosrc)<>fn.md5
  THEN RAISE EXCEPTION '0086 requires the reviewed definition of %',fn.sig; END IF;
  PERFORM pg_catalog.set_config('pathways_0086.acl_'||fn.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,86);

-- 1. The public media queue rule; existing rows are PRIVATE, so VALIDATE checks them as they are.
ALTER TABLE pathways.evidence_media DROP CONSTRAINT p3_evidence_public;
ALTER TABLE pathways.evidence_media ADD CONSTRAINT p3_evidence_public CHECK(
 (public_visibility_status='PRIVATE' AND public_submitted_by_id IS NULL AND public_submitted_at IS NULL AND public_approved_by_id IS NULL
  AND public_approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
 OR (public_visibility_status IN ('FOR_REVIEW','APPROVED') AND activity_id IS NULL AND expense_id IS NULL AND source_submission_id IS NULL
  AND type IN ('PHOTO','VIDEO') AND public_submitted_by_id IS NOT NULL AND public_submitted_at IS NOT NULL
  AND published_by_id IS NULL AND published_at IS NULL
  AND ((public_visibility_status='FOR_REVIEW' AND public_approved_by_id IS NULL AND public_approved_at IS NULL)
   OR (public_visibility_status='APPROVED' AND public_approved_by_id IS NOT NULL AND public_approved_at IS NOT NULL
    AND public_approved_by_id<>public_submitted_by_id AND public_approved_by_id<>submitted_by_id
    AND public_approved_at>=public_submitted_at)))) NOT VALID;
ALTER TABLE pathways.evidence_media VALIDATE CONSTRAINT p3_evidence_public;

-- 2. The public evidence guard (marked 0086); the baseline rules are unchanged and the queue actors are bound to the session.
CREATE OR REPLACE FUNCTION pathways.p3_guard_public_evidence() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $$
DECLARE actor uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.public_visibility_status<>'PRIVATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evidence must start PRIVATE'; END IF;
 ELSE
  IF NEW.public_visibility_status=OLD.public_visibility_status THEN
   IF ROW(NEW.public_submitted_by_id,NEW.public_submitted_at,NEW.public_approved_by_id,NEW.public_approved_at,NEW.published_by_id,NEW.published_at)
    IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at,OLD.public_approved_by_id,OLD.public_approved_at,OLD.published_by_id,OLD.published_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public workflow history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.public_visibility_status='PRIVATE' AND NEW.public_visibility_status='FOR_REVIEW')
    OR (OLD.public_visibility_status='FOR_REVIEW' AND NEW.public_visibility_status='APPROVED')
    OR (OLD.public_visibility_status='APPROVED' AND NEW.public_visibility_status='PUBLISHED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public review, approval, and publication are separate transitions';
   END IF;
   IF OLD.public_visibility_status<>'PRIVATE' AND ROW(NEW.public_submitted_by_id,NEW.public_submitted_at) IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public submission history is immutable';
   END IF;
   IF OLD.public_visibility_status='APPROVED' AND ROW(NEW.public_approved_by_id,NEW.public_approved_at) IS DISTINCT FROM ROW(OLD.public_approved_by_id,OLD.public_approved_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public approval history is immutable';
   END IF;
  END IF;
  -- 0086: the public media queue records the acting user as sender, approver and rejecter of a queued row.
  IF session_user='pathways_runtime' AND ((NEW.public_visibility_status<>OLD.public_visibility_status
    AND NEW.public_visibility_status IN ('FOR_REVIEW','APPROVED'))
   OR (NEW.status='REJECTED' AND OLD.status<>'REJECTED' AND NEW.public_visibility_status='FOR_REVIEW')) THEN
   actor:=pathways.runtime_context_user();
   IF actor IS NULL OR (NEW.public_visibility_status<>OLD.public_visibility_status AND actor IS DISTINCT FROM
     CASE NEW.public_visibility_status WHEN 'FOR_REVIEW' THEN NEW.public_submitted_by_id ELSE NEW.public_approved_by_id END)
    OR (NEW.status='REJECTED' AND OLD.status<>'REJECTED' AND actor IS DISTINCT FROM NEW.rejected_by_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Public media review must be recorded by the acting user (0086)';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- 3. The selection validator, called only by p34_guard_publication on SUBMIT. prisma cannot call runtime_context_organization(),
-- so it reads app.organization_id, which the guard has already matched to it (the 0077 convention).
CREATE OR REPLACE FUNCTION pathways.p85_publication_media(media jsonb, wanted_project uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; item jsonb; picked record; caption text; seen uuid[]:='{}'; result jsonb:='[]';
BEGIN
 IF pg_catalog.pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Public media selection unavailable' USING ERRCODE='42501'; END IF;
 IF pg_catalog.jsonb_typeof(media) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(media)>24
 THEN RAISE EXCEPTION 'Media not publishable' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(media) WITH ORDINALITY e(value,n) ORDER BY e.n LOOP
  IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['id','caption'] OR item-ARRAY['id','caption']<>'{}'::jsonb
   OR pg_catalog.jsonb_typeof(item->'id')<>'string' OR pg_catalog.jsonb_typeof(item->'caption')<>'string'
   OR item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Media not publishable' USING ERRCODE='23514'; END IF;
  caption:=pg_catalog.btrim(item->>'caption');
  -- Pickable: stored photo or video, not rejected, and either verified activity proof or approved in the public media queue.
  SELECT e.id,e.type::text AS type,e.content_type INTO picked FROM pathways.evidence_media e
   WHERE e.organization_id=org AND e.project_id=wanted_project AND e.id=(item->>'id')::uuid AND e.storage_ready AND e.status<>'REJECTED'
    AND ((e.type='PHOTO' AND e.content_type LIKE 'image/%') OR (e.type='VIDEO' AND e.content_type LIKE 'video/%'))
    AND ((e.activity_update_id IS NOT NULL AND e.status IN ('VERIFIED','APPROVED')) OR e.public_visibility_status='APPROVED');
  IF NOT FOUND OR picked.id=ANY(seen) OR pg_catalog.length(caption) NOT BETWEEN 1 AND 300
  THEN RAISE EXCEPTION 'Media not publishable' USING ERRCODE='23514'; END IF;
  seen:=seen||picked.id;
  result:=result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',picked.id,'type',picked.type,
   'contentType',picked.content_type,'caption',caption));
 END LOOP;
 RETURN result;
END $$;

-- 4. The public media lookup: the storage key of an item on a live revision of an active project, or NULL.
CREATE FUNCTION pathways.p86_public_media(wanted_project uuid, wanted_media uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public media unavailable' USING ERRCODE='42501'; END IF;
 RETURN (SELECT pg_catalog.jsonb_build_object('bucket',e.bucket,'objectKey',e.object_key,'contentType',e.content_type,
   'byteSize',e.byte_size,'sha256',e.sha256)
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  JOIN pathways.evidence_media e ON e.organization_id=pub.organization_id AND e.project_id=pub.project_id AND e.id=wanted_media
   AND e.status<>'REJECTED'
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
   AND pub.live_snapshot->'media' @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',wanted_media)));
END $$;
REVOKE ALL ON FUNCTION pathways.p86_public_media(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p86_public_media(uuid,uuid) TO pathways_runtime;

-- 5. The public read (marked 0086): a live item is listed only while its evidence row exists and is not rejected, as p86 serves it.
CREATE OR REPLACE FUNCTION pathways.p85_public_projects(wanted_project uuid DEFAULT NULL,skip_rows integer DEFAULT 0,take_rows integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public projection unavailable' USING ERRCODE='42501'; END IF;
 IF skip_rows IS NULL OR take_rows IS NULL OR skip_rows<0 OR skip_rows>10000 OR take_rows<1 OR take_rows>100
 THEN RAISE EXCEPTION 'Invalid public request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(q.payload ORDER BY q.project_id) FROM(
  SELECT pub.project_id,pub.live_snapshot||jsonb_build_object('publishedAt',pub.live_published_at,
   -- 0086: a live item whose evidence row is gone or was rejected afterwards is left out; the rest keep their order.
   'media',coalesce((SELECT jsonb_agg(m.item ORDER BY m.n) FROM jsonb_array_elements(pub.live_snapshot->'media') WITH ORDINALITY m(item,n)
    WHERE EXISTS(SELECT FROM pathways.evidence_media e WHERE e.organization_id=pub.organization_id AND e.project_id=pub.project_id
     AND e.id=(m.item->>'id')::uuid AND e.status<>'REJECTED')),'[]'::jsonb)) AS payload
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE' AND o.archived_at IS NULL
   AND (wanted_project IS NULL OR pub.project_id=wanted_project)
  ORDER BY pub.project_id LIMIT take_rows OFFSET skip_rows)q),'[]'::jsonb);
END $$;

-- Postconditions: the queue CHECK, the new evidence guard body with its ACL kept and still bound, the new validator and public read
-- bodies with their ACLs kept, and the new lookup.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.evidence_media'::pg_catalog.regclass
   AND conname='p3_evidence_public' AND contype='c' AND convalidated)
  OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.evidence_media'::pg_catalog.regclass)
  OR (SELECT count(*) FROM (VALUES (0,'pathways.p85_publication_media(jsonb,uuid)','60613af01de09c839c3408f0193ceb82',true,'s',ARRAY['search_path=""']),
    (1,'pathways.p3_guard_public_evidence()','32c52a969c76775b0a86b6731c3d6fff',false,'v',ARRAY['search_path=pg_catalog']),
    (2,'pathways.p85_public_projects(uuid,integer,integer)','4ded05556c8c942b497f1845710359e2',true,'s',ARRAY['search_path=""']))
    w(n,sig,md5,secdef,vol,cfg)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.secdef AND p.provolatile=w.vol AND p.proconfig=w.cfg
    AND pg_catalog.md5(p.prosrc)=w.md5 AND coalesce(p.proacl::text,'')=pg_catalog.current_setting('pathways_0086.acl_'||w.n))<>3
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname='p3_40_public' AND t.tgenabled='O' AND NOT t.tgisinternal
   AND t.tgrelid='pathways.evidence_media'::pg_catalog.regclass AND t.tgfoid='pathways.p3_guard_public_evidence()'::pg_catalog.regprocedure)
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p86_public_media(uuid,uuid)'::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""']
   AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
    FROM pg_catalog.aclexplode(p.proacl) a)=ARRAY['pathways_runtime','prisma'])
 THEN RAISE EXCEPTION '0086 postconditions failed'; END IF;
END $$;
COMMIT;
