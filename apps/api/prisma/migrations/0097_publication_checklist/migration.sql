-- 0097 publication checklist (cr-pathways-publication-checklist); forward migration.
-- An approver confirms a fixed checklist before a publication revision or a public photo or video is approved. The guards refuse
-- an approval without it, so the rule holds whatever calls the database, and the publication approval audit row names the items.
-- The approver may also read the figures of the revision under review (p97_review_view), computed by the same body as the public
-- page (p97_view_payload), so the review screen can mark counts under 5. Public pages keep exact counts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
  IF current_user <> 'prisma' OR NOT EXISTS (SELECT FROM public._prisma_migrations WHERE migration_name='0096_audit_tamper_evidence'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION '0097 requires the verified 0096 state and migration identity';
  END IF;
  IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_publications'::pg_catalog.regclass) <> 'prisma'
     OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.evidence_media'::pg_catalog.regclass) <> 'prisma'
     OR EXISTS (SELECT FROM pg_catalog.pg_attribute WHERE NOT attisdropped
       AND ((attrelid='pathways.project_publications'::pg_catalog.regclass AND attname='approval_checklist')
         OR (attrelid='pathways.evidence_media'::pg_catalog.regclass AND attname='public_approval_checklist')))
     OR pg_catalog.to_regprocedure('pathways.p97_view_payload(uuid,uuid,jsonb,text,date,date,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('pathways.p97_review_view(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION '0097 requires prisma-owned publication and evidence tables without the checklist objects';
  END IF;
END $preflight$;
SELECT pg_catalog.pg_advisory_xact_lock(505005, 97);

-- 1. The checklist columns; existing approvals keep NULL, and only the exact confirmed object is accepted.
ALTER TABLE pathways.project_publications ADD COLUMN approval_checklist jsonb
 CONSTRAINT p97_publication_checklist_shape CHECK (approval_checklist IS NULL OR approval_checklist='{"smallGroupsChecked":true,"noIdentifiableMinor":true,"imageConsentOnFile":true,"pinPositionsAcceptable":true}'::jsonb);
ALTER TABLE pathways.evidence_media ADD COLUMN public_approval_checklist jsonb
 CONSTRAINT p97_media_checklist_shape CHECK (public_approval_checklist IS NULL OR public_approval_checklist='{"noIdentifiableMinor":true,"imageConsentOnFile":true}'::jsonb);

-- 2. The publication guard (marked 0097): APPROVE requires the checklist, PUBLISH keeps it, SUBMIT and a reopening WITHDRAW clear it.
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
   NEW.approval_checklist:=OLD.approval_checklist;
  ELSE
   NEW.submitted_by_id:=actor; NEW.submitted_at:=now_at;
   NEW.approved_by_id:=NULL; NEW.approved_at:=NULL; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
   NEW.approval_checklist:=NULL;
  END IF;
  IF op='SUBMIT' THEN
   NEW.snapshot:=jsonb_build_object('id',p.id,'title',p.title,'code',p.code,'approvedSummary',NEW.summary,
    'area',p.implementation_area,'sector',p.sector,'startDate',p.start_date,'endDate',p.end_date,
    'media',pathways.p85_publication_media(NEW.snapshot->'media',NEW.project_id),
    'views',pathways.p85_publication_views(NEW.snapshot->'views'),
    -- 0089: the saved map pins of the project are frozen into the revision.
    'pins',coalesce((SELECT jsonb_agg(jsonb_build_object('name',place_name,'province',province,'longitude',longitude,'latitude',latitude))
      FROM pathways.project_map_pins WHERE organization_id=p.organization_id AND project_id=p.id),'[]'::jsonb));
  END IF;
 ELSE
  IF ROW(NEW.summary,NEW.snapshot,NEW.submitted_by_id,NEW.submitted_at)
   IS DISTINCT FROM ROW(OLD.summary,OLD.snapshot,OLD.submitted_by_id,OLD.submitted_at)
  THEN RAISE EXCEPTION 'Approved publication content immutable' USING ERRCODE='23514'; END IF;
  IF op='APPROVE' THEN
   IF NOT pathways.p05_has_project_permission('public.approve',NEW.project_id) OR actor=OLD.submitted_by_id
   THEN RAISE EXCEPTION 'Distinct publication approval required' USING ERRCODE='42501'; END IF;
   -- 0097: the approver confirms all four checklist items; the API cannot skip it.
   IF NEW.approval_checklist IS DISTINCT FROM '{"smallGroupsChecked":true,"noIdentifiableMinor":true,"imageConsentOnFile":true,"pinPositionsAcceptable":true}'::jsonb THEN
    RAISE EXCEPTION 'Publication checklist required (0097)' USING ERRCODE='23514';
   END IF;
   NEW.approved_by_id:=actor; NEW.approved_at:=now_at; NEW.published_by_id:=NULL; NEW.published_at:=NULL;
  ELSE
   IF NOT pathways.p05_has_project_permission('public.publish',NEW.project_id)
    OR ROW(NEW.approved_by_id,NEW.approved_at,NEW.approval_checklist) IS DISTINCT FROM ROW(OLD.approved_by_id,OLD.approved_at,OLD.approval_checklist)
   THEN RAISE EXCEPTION 'Publication publishing unavailable' USING ERRCODE='42501'; END IF;
   NEW.published_by_id:=actor; NEW.published_at:=now_at;
   NEW.live_revision:=NEW.revision; NEW.live_snapshot:=NEW.snapshot; NEW.live_published_at:=now_at; NEW.live_published_by_id:=actor;
  END IF;
 END IF;
 NEW.last_operation:=op; NEW.updated_at:=now_at;
 INSERT INTO pathways.audit_logs(organization_id,project_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(NEW.organization_id,NEW.project_id,actor,'PUBLICATION_'||op,'ProjectPublication',NEW.project_id::text,
  jsonb_build_object('revision',NEW.revision,'state',NEW.state,'liveRevision',NEW.live_revision)
   -- 0097: an approval row names the confirmed items.
   || CASE WHEN op='APPROVE' THEN jsonb_build_object('checklist','smallGroupsChecked,noIdentifiableMinor,imageConsentOnFile,pinPositionsAcceptable')
      ELSE '{}'::jsonb END);
 RETURN NEW;
END $$;

-- 3. The public evidence guard (marked 0097): FOR_REVIEW to APPROVED requires the media checklist, which then stays with the approval.
CREATE OR REPLACE FUNCTION pathways.p3_guard_public_evidence() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $$
DECLARE actor uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.public_visibility_status<>'PRIVATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evidence must start PRIVATE'; END IF;
 ELSE
  IF NEW.public_visibility_status=OLD.public_visibility_status THEN
   IF ROW(NEW.public_submitted_by_id,NEW.public_submitted_at,NEW.public_approved_by_id,NEW.public_approved_at,NEW.published_by_id,NEW.published_at,NEW.public_approval_checklist)
    IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at,OLD.public_approved_by_id,OLD.public_approved_at,OLD.published_by_id,OLD.published_at,OLD.public_approval_checklist) THEN
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
   -- 0097: the approver confirms both media checklist items; the confirmation then stays with the approval.
   IF NEW.public_visibility_status='APPROVED' AND OLD.public_visibility_status='FOR_REVIEW'
    AND NEW.public_approval_checklist IS DISTINCT FROM '{"noIdentifiableMinor":true,"imageConsentOnFile":true}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Media checklist required (0097)';
   END IF;
   IF OLD.public_visibility_status='PRIVATE' AND NEW.public_approval_checklist IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Media checklist is set only by approval (0097)';
   END IF;
   IF OLD.public_visibility_status='APPROVED' AND ROW(NEW.public_approved_by_id,NEW.public_approved_at,NEW.public_approval_checklist) IS DISTINCT FROM ROW(OLD.public_approved_by_id,OLD.public_approved_at,OLD.public_approval_checklist) THEN
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

-- 3b. The review guard (marked 0097): the media checklist may change with the public approval columns, as they do.
CREATE OR REPLACE FUNCTION pathways.p3_guard_review() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE allowed text[] := ARRAY['updated_at','status','verified_by_id','verified_at','approved_by_id','approved_at','rejected_by_id','rejected_at','rejection_reason']; proof pathways.evidence_media;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review records must begin PENDING'; END IF;
 ELSE
  IF TG_TABLE_NAME='evidence_media' THEN
   -- 0097: the media approval checklist is written with the public approval.
   allowed:=allowed||ARRAY['storage_ready','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at','public_approval_checklist'];
   IF OLD.storage_ready AND NOT NEW.storage_ready THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Stored evidence cannot be unfinalized'; END IF;
  ELSIF OLD.status='PENDING' THEN allowed:=allowed||ARRAY['receipt_evidence_id']; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted financial/evidence provenance is immutable';
  END IF;
  IF NEW.status=OLD.status THEN
   IF (to_jsonb(NEW)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at','public_approval_checklist'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','storage_ready','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at','public_approval_checklist']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review actor history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','REJECTED'))) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid review transition';
   END IF;
   IF OLD.status='VERIFIED' AND (NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verification history is immutable';
   END IF;
   IF OLD.status='PENDING' AND NEW.status='REJECTED' AND NEW.verified_by_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cannot manufacture earlier verification';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='budget_expense_entries' THEN
  PERFORM 1 FROM pathways.project_budget_records WHERE id=NEW.budget_record_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense requires a nonarchived budget'; END IF;
  IF NEW.receipt_evidence_id IS NOT NULL THEN
   SELECT * INTO proof FROM pathways.evidence_media WHERE id=NEW.receipt_evidence_id FOR SHARE;
   IF NOT FOUND OR proof.organization_id<>NEW.organization_id OR proof.project_id<>NEW.project_id OR proof.expense_id IS DISTINCT FROM NEW.id
    OR proof.submitted_by_id<>NEW.submitted_by_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt must belong to this expense, scope and submitter';
   END IF;
  END IF;
  IF NEW.status IN ('VERIFIED','APPROVED') AND (NEW.receipt_evidence_id IS NULL OR proof.status NOT IN ('VERIFIED','APPROVED')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verified private receipt evidence is required';
  END IF;
 ELSIF NEW.status='REJECTED' AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE receipt_evidence_id=NEW.id AND status IN ('VERIFIED','APPROVED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt supporting verified financial history cannot be rejected';
 END IF;
 RETURN NEW;
END $$;

-- 4. One view body for the public page and the review read; it reads with its caller's (prisma) rights and no API role may call it.
CREATE FUNCTION pathways.p97_view_payload(p_org uuid, p_project uuid, p_snap jsonb, p_status text, p_start date, p_end date, p_view text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
 prior pathways.sensitive_aggregate_releases%ROWTYPE; data jsonb;
BEGIN
 IF p_view='saddd' THEN
  -- The p06_saddd release rules, read only: a changed period or source, or a stale release, shows the restatement state.
  SELECT * INTO prior FROM pathways.sensitive_aggregate_releases r WHERE r.organization_id=p_org AND r.project_id=p_project;
  IF prior.id IS NOT NULL AND ROW(prior.period_start,prior.period_end) IS DISTINCT FROM ROW(p_start,p_end) THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSIF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end>DATE '2100-12-31'
   OR p_start>today THEN
   RETURN NULL;
  ELSIF p_end>=today THEN
   data:=pathways.p87_saddd_core(p_org,p_project,p_start,today,'Asia/Manila');
  ELSIF prior.status='STALE' THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSE
   data:=pathways.p87_saddd_core(p_org,p_project,p_start,p_end,'Asia/Manila');
   IF prior.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V2'
    AND prior.source_fingerprint IS DISTINCT FROM pathways.p87_saddd_fingerprint(p_org,p_project,data)
   THEN data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED'); END IF;
  END IF;
  RETURN jsonb_build_object('total',data->'total','sex',data->'sex','age',data->'age','disability',data->'disability');
 ELSIF p_view='kpi' THEN
  -- Released values, as p06_indicator_values gives them: the ACTIVE row with the latest periodEnd per code.
  RETURN (SELECT coalesce(jsonb_agg(k.item ORDER BY k.item->>'code',k.item->>'id'),'[]'::jsonb) FROM (
   SELECT DISTINCT ON (v.item->>'code') v.item FROM pg_catalog.unnest(pathways.p87_indicator_values_core(p_org,p_project,'Asia/Manila')) v(item)
   WHERE v.item->>'status'='ACTIVE' ORDER BY v.item->>'code',v.item->>'periodEnd' DESC NULLS LAST) k);
 ELSIF p_view='participation' THEN
  -- From the project start to today; a project not started yet has no attendance to show.
  IF p_start IS NULL OR p_start>today THEN RETURN NULL; END IF;
  RETURN pathways.p87_participation_core(p_org,p_project,p_start,today);
 ELSIF p_view='timeline' THEN
  -- As the internal view: the final position is read only for a completed project.
  RETURN jsonb_build_object('project',jsonb_build_object('status',p_status,'startDate',to_char(p_start,'YYYY-MM-DD'),
    'endDate',to_char(p_end,'YYYY-MM-DD')),'aggregate',pathways.p87_timeline_core(p_org,p_project,today),
   'lastCompletion',CASE WHEN p_status='COMPLETED'
    THEN to_char(pathways.p87_timeline_last_completion_core(p_org,p_project),'YYYY-MM-DD') END);
 ELSIF p_view='map' THEN
  -- This project's places and reach only; never the overview or budget.
  -- 0089: the pins frozen into the live revision; a revision from before 0089 has none.
  RETURN jsonb_build_object('area',p_snap->>'area','towns',pathways.p87_saddd_by_place_core(p_org,p_project,'Asia/Manila'),
   'pins',coalesce(p_snap->'pins','[]'::jsonb));
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION pathways.p97_view_payload(uuid,uuid,jsonb,text,date,date,text) FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;

CREATE OR REPLACE FUNCTION pathways.p87_public_view(wanted_project uuid, wanted_view text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE live record;
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public analytics unavailable' USING ERRCODE='42501'; END IF;
 SELECT pub.organization_id AS org,pub.live_snapshot,p.status::text AS status,p.start_date,p.end_date INTO live
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE'
   AND o.archived_at IS NULL AND pub.live_snapshot->'views' ? wanted_view;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- 0097: the view body is shared with the approver's review read.
 RETURN pathways.p97_view_payload(live.org,wanted_project,live.live_snapshot,live.status,live.start_date,live.end_date,wanted_view);
END $$;

-- 5. The approver's review read: one view of the revision awaiting approval or publication, for a holder of public.approve.
-- prisma reads that row only through this policy, with the request's organization and the actor's permission (the 0077 convention).
CREATE POLICY p97_prisma_review_read ON pathways.project_publications FOR SELECT TO prisma
 USING (organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('public.approve',project_id));
CREATE FUNCTION pathways.p97_review_view(wanted_project uuid, wanted_view text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; r record;
BEGIN
 IF session_user<>'pathways_runtime' OR org IS NULL OR NOT pathways.p06_can('public.approve',wanted_project) THEN
  RAISE EXCEPTION 'Publication review unavailable' USING ERRCODE='42501';
 END IF;
 SELECT pub.snapshot,p.status::text AS status,p.start_date,p.end_date INTO r
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  WHERE pub.organization_id=org AND pub.project_id=wanted_project AND pub.state IN ('FOR_REVIEW','APPROVED')
   AND p.archived_at IS NULL AND pub.snapshot->'views' ? wanted_view;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN pathways.p97_view_payload(org,wanted_project,r.snapshot,r.status,r.start_date,r.end_date,wanted_view);
END $$;
REVOKE ALL ON FUNCTION pathways.p97_review_view(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p97_review_view(uuid,text) TO pathways_runtime;

DO $postflight$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conname IN ('p97_publication_checklist_shape','p97_media_checklist_shape')) <> 2
  OR (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p34_guard_publication()'::pg_catalog.regprocedure,
      'pathways.p3_guard_public_evidence()'::pg_catalog.regprocedure) AND p.prosrc LIKE '%(0097)%' AND NOT p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner)='prisma') <> 2
  OR (SELECT p.prosrc LIKE '%0097%public_approval_checklist%' AND NOT p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
      FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p3_guard_review()'::pg_catalog.regprocedure) IS NOT TRUE
  OR (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p87_public_view(uuid,text)'::pg_catalog.regprocedure,
      'pathways.p97_review_view(uuid,text)'::pg_catalog.regprocedure) AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']
      AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
      AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
        FROM pg_catalog.aclexplode(p.proacl) a)='{pathways_runtime,prisma}') <> 2
  OR (SELECT NOT p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
      AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text) FROM pg_catalog.aclexplode(p.proacl) a)='{prisma}'
      FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p97_view_payload(uuid,uuid,jsonb,text,date,date,text)'::pg_catalog.regprocedure) IS NOT TRUE
  OR NOT EXISTS (SELECT FROM pg_catalog.pg_policy WHERE polname='p97_prisma_review_read' AND polcmd='r'
      AND polrelid='pathways.project_publications'::pg_catalog.regclass AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid]) THEN
  RAISE EXCEPTION '0097 postflight failed';
 END IF;
END $postflight$;
COMMIT;
