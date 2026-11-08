-- 0089 project map pins (cr-pathways-public-tracker-media-analytics map pins); forward migration.
-- project_map_pins keeps one saved position per place of a project: the pin sits at its saved position instead of the
-- bundled town or province centroid, and locked stops anyone from moving it until it is unlocked. Reads need projects.read;
-- writes need projects.update. A submitted publication snapshot freezes the project's pins under the optional key pins, so the
-- public map shows the pins of the reviewed revision and anonymous reads never touch this table.
-- p34_guard_publication keeps the 0085 body except that SUBMIT adds pins (marked 0089). p85_public_projects keeps the 0086 body
-- except that the project payload leaves pins out. p87_public_view keeps the 0087 body except that the map view returns pins.
-- Owner, security mode, volatility, search_path and ACL of the three replaced functions stay unchanged (asserted below).
-- prisma owns every table and function used here, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0088_smart_mapping_v5'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0089 requires the verified 0088 state and migration identity'; END IF;
 IF pg_catalog.to_regclass('pathways.project_map_pins') IS NOT NULL
 THEN RAISE EXCEPTION '0089 requires the table to not already exist'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)='prisma'
   AND oid IN ('pathways.organizations'::pg_catalog.regclass,'pathways.projects'::pg_catalog.regclass,
    'pathways.system_users'::pg_catalog.regclass,'pathways.project_publications'::pg_catalog.regclass))<>4
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
   WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_publications'::pg_catalog.regclass
   AND conname='publication_snapshot_shape' AND contype='c' AND convalidated
   AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%pins%')
 THEN RAISE EXCEPTION '0089 requires prisma ownership of its tables and the 0085 snapshot shape check'; END IF;
 -- Only the reviewed definitions may be replaced; their ACLs are kept.
 FOR fn IN SELECT w.n, w.sig, w.md5, w.secdef, w.vol, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways.p34_guard_publication()','a29ed81274a4b4d5c81cc8fa2a7cf83d',false,'v'),
   (1,'pathways.p85_public_projects(uuid,integer,integer)','4ded05556c8c942b497f1845710359e2',true,'s'),
   (2,'pathways.p87_public_view(uuid,text)','7a9caf4ab0aff291335d3837eb347d06',true,'s')) w(n,sig,md5,secdef,vol)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef<>fn.secdef OR fn.provolatile<>fn.vol
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>fn.md5
  THEN RAISE EXCEPTION '0089 requires the reviewed definition of %',fn.sig; END IF;
  PERFORM pg_catalog.set_config('pathways_0089.acl_'||fn.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,89);

-- 1. The table: one saved position per place of a project, inside the Philippines map area.
CREATE TABLE pathways.project_map_pins (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    place_name text NOT NULL,
    province text NOT NULL,
    longitude double precision NOT NULL,
    latitude double precision NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    updated_by_id uuid NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_map_pins_place_name_check CHECK (char_length(place_name) BETWEEN 1 AND 120),
    CONSTRAINT project_map_pins_province_check CHECK (char_length(province) BETWEEN 1 AND 120),
    CONSTRAINT project_map_pins_longitude_check CHECK (longitude BETWEEN 114 AND 128),
    CONSTRAINT project_map_pins_latitude_check CHECK (latitude BETWEEN 4 AND 22)
);
ALTER TABLE pathways.project_map_pins OWNER TO prisma;
ALTER TABLE ONLY pathways.project_map_pins
 ADD CONSTRAINT project_map_pins_pkey PRIMARY KEY (organization_id, project_id, place_name, province);
ALTER TABLE ONLY pathways.project_map_pins
 ADD CONSTRAINT project_map_pins_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.project_map_pins
 ADD CONSTRAINT project_map_pins_project_fk FOREIGN KEY (organization_id, project_id)
 REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.project_map_pins
 ADD CONSTRAINT project_map_pins_updated_by_fk FOREIGN KEY (organization_id, updated_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX project_map_pins_updated_by_idx ON pathways.project_map_pins (organization_id, updated_by_id);

-- 2. Row security: the context is read directly, and every write is also bound to the acting user.
ALTER TABLE ONLY pathways.project_map_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.project_map_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY p89_project_map_pins_select ON pathways.project_map_pins
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('projects.read', project_map_pins.project_id)
 );
CREATE POLICY p89_project_map_pins_insert ON pathways.project_map_pins
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND updated_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND pathways.p05_has_project_permission('projects.update', project_map_pins.project_id)
 );
CREATE POLICY p89_project_map_pins_update ON pathways.project_map_pins
 FOR UPDATE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('projects.update', project_map_pins.project_id)
 ) WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND updated_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND pathways.p05_has_project_permission('projects.update', project_map_pins.project_id)
 );
CREATE POLICY p89_project_map_pins_delete ON pathways.project_map_pins
 FOR DELETE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('projects.update', project_map_pins.project_id)
 );

-- 3. Grants: the place key and the project never change; only the position, lock and edit stamp do.
REVOKE ALL ON TABLE pathways.project_map_pins FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT, DELETE ON TABLE pathways.project_map_pins TO pathways_runtime;
GRANT UPDATE (longitude, latitude, locked, updated_by_id, updated_at) ON TABLE pathways.project_map_pins TO pathways_runtime;

-- 4. The snapshot gains the optional key pins; a snapshot from before 0089 stays valid without it.
ALTER TABLE pathways.project_publications DROP CONSTRAINT publication_snapshot_shape;
ALTER TABLE pathways.project_publications ADD CONSTRAINT publication_snapshot_shape CHECK(jsonb_typeof(snapshot)='object'
  AND snapshot ?& ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate','media','views']
  AND snapshot - ARRAY['id','title','code','approvedSummary','area','sector','startDate','endDate','media','views','pins'] = '{}'::jsonb
  AND (snapshot->>'id'=project_id::text) IS TRUE AND (snapshot->>'approvedSummary'=summary) IS TRUE
  AND jsonb_typeof(snapshot->'title')='string' AND jsonb_typeof(snapshot->'code')='string'
  AND jsonb_typeof(snapshot->'media')='array' AND jsonb_typeof(snapshot->'views')='array'
  AND (NOT snapshot ? 'pins' OR jsonb_typeof(snapshot->'pins')='array'));

-- 5. The guard (marked 0089): SUBMIT freezes the project's saved pins into the snapshot.
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

-- 6. The public project payload (marked 0089): pins are served by the map view only.
CREATE OR REPLACE FUNCTION pathways.p85_public_projects(wanted_project uuid DEFAULT NULL,skip_rows integer DEFAULT 0,take_rows integer DEFAULT 50)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public projection unavailable' USING ERRCODE='42501'; END IF;
 IF skip_rows IS NULL OR take_rows IS NULL OR skip_rows<0 OR skip_rows>10000 OR take_rows<1 OR take_rows>100
 THEN RAISE EXCEPTION 'Invalid public request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(q.payload ORDER BY q.project_id) FROM(
  -- 0089: pins are served by the map view only, so the project payload keeps its shape.
  SELECT pub.project_id,(pub.live_snapshot-'pins')||jsonb_build_object('publishedAt',pub.live_published_at,
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

-- 7. The public map view (marked 0089): it returns the pins of the live revision.
CREATE OR REPLACE FUNCTION pathways.p87_public_view(wanted_project uuid, wanted_view text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE live record; today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
 prior pathways.sensitive_aggregate_releases%ROWTYPE; data jsonb;
BEGIN
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Public analytics unavailable' USING ERRCODE='42501'; END IF;
 SELECT pub.organization_id AS org,pub.live_snapshot,p.status::text AS status,p.start_date,p.end_date INTO live
  FROM pathways.project_publications pub JOIN pathways.projects p ON p.organization_id=pub.organization_id AND p.id=pub.project_id
  JOIN pathways.organizations o ON o.id=p.organization_id
  WHERE pub.project_id=wanted_project AND pub.live_snapshot IS NOT NULL AND p.archived_at IS NULL AND o.status='ACTIVE'
   AND o.archived_at IS NULL AND pub.live_snapshot->'views' ? wanted_view;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF wanted_view='saddd' THEN
  -- The p06_saddd release rules, read only: a changed period or source, or a stale release, shows the restatement state.
  SELECT * INTO prior FROM pathways.sensitive_aggregate_releases r WHERE r.organization_id=live.org AND r.project_id=wanted_project;
  IF prior.id IS NOT NULL AND ROW(prior.period_start,prior.period_end) IS DISTINCT FROM ROW(live.start_date,live.end_date) THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSIF live.start_date IS NULL OR live.end_date IS NULL OR live.end_date<live.start_date OR live.end_date>DATE '2100-12-31'
   OR live.start_date>today THEN
   RETURN NULL;
  ELSIF live.end_date>=today THEN
   data:=pathways.p87_saddd_core(live.org,wanted_project,live.start_date,today,'Asia/Manila');
  ELSIF prior.status='STALE' THEN
   data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED');
  ELSE
   data:=pathways.p87_saddd_core(live.org,wanted_project,live.start_date,live.end_date,'Asia/Manila');
   IF prior.policy_version='FIXED_CLOSED_PROJECT_PERIOD_V2'
    AND prior.source_fingerprint IS DISTINCT FROM pathways.p87_saddd_fingerprint(live.org,wanted_project,data)
   THEN data:=pathways.p06_missing_saddd('RESTATEMENT_REVIEW_REQUIRED'); END IF;
  END IF;
  RETURN jsonb_build_object('total',data->'total','sex',data->'sex','age',data->'age','disability',data->'disability');
 ELSIF wanted_view='kpi' THEN
  -- Released values, as p06_indicator_values gives them: the ACTIVE row with the latest periodEnd per code.
  RETURN (SELECT coalesce(jsonb_agg(k.item ORDER BY k.item->>'code',k.item->>'id'),'[]'::jsonb) FROM (
   SELECT DISTINCT ON (v.item->>'code') v.item FROM pg_catalog.unnest(pathways.p87_indicator_values_core(live.org,wanted_project,'Asia/Manila')) v(item)
   WHERE v.item->>'status'='ACTIVE' ORDER BY v.item->>'code',v.item->>'periodEnd' DESC NULLS LAST) k);
 ELSIF wanted_view='participation' THEN
  -- From the project start to today; a project not started yet has no attendance to show.
  IF live.start_date IS NULL OR live.start_date>today THEN RETURN NULL; END IF;
  RETURN pathways.p87_participation_core(live.org,wanted_project,live.start_date,today);
 ELSIF wanted_view='timeline' THEN
  -- As the internal view: the final position is read only for a completed project.
  RETURN jsonb_build_object('project',jsonb_build_object('status',live.status,'startDate',to_char(live.start_date,'YYYY-MM-DD'),
    'endDate',to_char(live.end_date,'YYYY-MM-DD')),'aggregate',pathways.p87_timeline_core(live.org,wanted_project,today),
   'lastCompletion',CASE WHEN live.status='COMPLETED'
    THEN to_char(pathways.p87_timeline_last_completion_core(live.org,wanted_project),'YYYY-MM-DD') END);
 ELSIF wanted_view='map' THEN
  -- This project's places and reach only; never the overview or budget.
  -- 0089: the pins frozen into the live revision; a revision from before 0089 has none.
  RETURN jsonb_build_object('area',live.live_snapshot->>'area','towns',pathways.p87_saddd_by_place_core(live.org,wanted_project,'Asia/Manila'),
   'pins',coalesce(live.live_snapshot->'pins','[]'::jsonb));
 END IF;
 RETURN NULL;
END $$;

-- Postconditions: the table, its constraints, row security, policies and grants, the new snapshot check, and the three replaced
-- bodies with owners, modes, volatility, search_path and ACLs kept.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_map_pins'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0089 ownership postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.project_map_pins'::pg_catalog.regclass
   AND c.contype='c' AND c.convalidated)<>4
  OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.project_map_pins'::pg_catalog.regclass
   AND c.contype='f' AND c.confdeltype='r' AND c.confupdtype='r')<>3
  OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.project_map_pins'::pg_catalog.regclass
   AND c.contype='p' AND c.conkey=ARRAY[1,2,3,4]::smallint[])<>1
 THEN RAISE EXCEPTION '0089 constraint postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.project_map_pins'::pg_catalog.regclass)
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.project_map_pins'::pg_catalog.regclass
   AND polroles=ARRAY['pathways_runtime'::pg_catalog.regrole::oid])<>4
 THEN RAISE EXCEPTION '0089 row level security postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.project_map_pins','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.project_map_pins','INSERT')
  AND has_table_privilege('pathways_runtime','pathways.project_map_pins','DELETE')
  AND NOT has_table_privilege('pathways_runtime','pathways.project_map_pins','UPDATE')
  AND has_column_privilege('pathways_runtime','pathways.project_map_pins','longitude','UPDATE')
  AND has_column_privilege('pathways_runtime','pathways.project_map_pins','latitude','UPDATE')
  AND has_column_privilege('pathways_runtime','pathways.project_map_pins','locked','UPDATE')
  AND has_column_privilege('pathways_runtime','pathways.project_map_pins','updated_by_id','UPDATE')
  AND has_column_privilege('pathways_runtime','pathways.project_map_pins','updated_at','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','place_name','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','province','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','project_id','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','organization_id','UPDATE')
  AND NOT has_table_privilege('anon','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION '0089 grant postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_publications'::pg_catalog.regclass
   AND conname='publication_snapshot_shape' AND contype='c' AND convalidated AND pg_catalog.pg_get_constraintdef(oid) LIKE '%pins%')
 THEN RAISE EXCEPTION '0089 snapshot shape postcondition failed'; END IF;
 IF (SELECT count(*) FROM (VALUES (0,'pathways.p34_guard_publication()','2d5c0d23902592338d987e8d8c4dc1fa',false,'v'),
    (1,'pathways.p85_public_projects(uuid,integer,integer)','2e377c27df955be9547b46648b7c32d9',true,'s'),
    (2,'pathways.p87_public_view(uuid,text)','ac69bf9b641ce7374b5f1ce9ebc93e6f',true,'s')) w(n,sig,md5,secdef,vol)
   JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
   WHERE pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.secdef AND p.provolatile=w.vol
    AND p.proconfig=ARRAY['search_path=""'] AND pg_catalog.md5(p.prosrc)=w.md5
    AND coalesce(p.proacl::text,'')=pg_catalog.current_setting('pathways_0089.acl_'||w.n))<>3
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname='p34_guard_publication' AND t.tgenabled='O' AND NOT t.tgisinternal
   AND t.tgrelid='pathways.project_publications'::pg_catalog.regclass
   AND t.tgfoid='pathways.p34_guard_publication()'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0089 function postconditions failed'; END IF;
END $$;
COMMIT;
