-- Proposed forward0033 only. Retains current activity profile edit ceiling.
BEGIN;
DO $$ DECLARE f record;t record; BEGIN
 IF current_user<>'prisma' OR session_user<>'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0032_core_workflow_actor_locks' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION '0033 requires verified0032 and Prisma migration ownership'; END IF;
 SELECT p.* INTO f FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p09_guard_activity()');
 IF NOT FOUND OR f.prosecdef OR f.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype OR pg_catalog.pg_get_userbyid(f.proowner)<>'prisma' OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(pg_catalog.regexp_replace(f.prosrc,'[[:space:]]','','g'))<>'b3ada17a9311c476974805d2244b32a0' OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>f.proowner) THEN RAISE EXCEPTION '0033 activity guard baseline differs'; END IF;
 SELECT * INTO t FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.project_activities'::pg_catalog.regclass AND tgname='p09_activity_authority' AND tgfoid=f.oid;
 IF NOT FOUND OR t.tgtype<>19 OR t.tgnargs<>0 OR t.tgargs<>'\x'::bytea OR t.tgisinternal OR t.tgenabled<>'O' OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgfoid=f.oid AND NOT tgisinternal)<>1 THEN RAISE EXCEPTION '0033 activity trigger attachment differs'; END IF;
END $$;
CREATE OR REPLACE FUNCTION pathways.p09_guard_activity() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 current_xid xid; approved_update uuid; update_count integer; proof_count integer;
BEGIN
 IF NOT pathways.p05_has_project_permission('activities.update',OLD.project_id)
 AND pg_catalog.to_jsonb(NEW)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at']
 IS DISTINCT FROM pg_catalog.to_jsonb(OLD)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at'] THEN
  -- Only canonical M&E approval metadata bypasses the profile-edit guard.
  -- This is not a grant of activities.update or arbitrary reviewer stamping.
  IF session_user IS DISTINCT FROM 'pathways_runtime'
   OR NEW.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   OR NOT pathways.p05_has_project_permission('evidence.review',OLD.project_id)
   OR NOT EXISTS(SELECT FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id
      WHERE u.id=actor AND u.organization_id=OLD.organization_id AND r.code='MONITORING_AND_EVALUATION_OFFICER'
      AND r.is_active AND u.account_status='ACTIVE' AND u.archived_at IS NULL)
   OR pg_catalog.to_jsonb(NEW)-ARRAY['status','progress_percent','actual_end_date','reviewed_by_id','reviewed_at','updated_at']
      IS DISTINCT FROM pg_catalog.to_jsonb(OLD)-ARRAY['status','progress_percent','actual_end_date','reviewed_by_id','reviewed_at','updated_at']
   OR OLD.status::text IS DISTINCT FROM 'FOR_REVIEW'
   OR NEW.reviewed_by_id IS DISTINCT FROM actor OR NEW.reviewed_at IS NULL
   OR NEW.reviewed_at<=OLD.updated_at OR NEW.updated_at<NEW.reviewed_at
   OR NEW.progress_percent NOT BETWEEN 0 AND 100
   OR NEW.status::text IS DISTINCT FROM (CASE WHEN NEW.progress_percent=100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END)
   OR NEW.actual_end_date IS DISTINCT FROM (CASE WHEN NEW.progress_percent=100 THEN (NEW.reviewed_at AT TIME ZONE 'Asia/Manila')::date ELSE NULL::date END) THEN
   RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501';
  END IF;
  -- Strong parent lock conflicts with FK KEY SHARE from new sibling inserts.
  -- Keep it to commit and then read the complete companion set again.
  PERFORM 1 FROM pathways.project_activities a WHERE a.organization_id=OLD.organization_id
   AND a.project_id=OLD.project_id AND a.id=OLD.id FOR UPDATE;
  IF NOT FOUND OR NOT pathways.p05_has_project_permission('evidence.review',OLD.project_id) THEN
   RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501';
  END IF;
  -- xmin is PostgreSQL's32-bit tuple transaction identity; xid8 modulo2^32
  -- handles epoch rollover without accepting an old historical approval.
  current_xid:=pg_catalog.mod(pg_catalog.pg_current_xact_id()::text::numeric,4294967296)::text::xid;
  SELECT count(*)::integer,min(u.id::text)::uuid INTO update_count,approved_update
   FROM pathways.activity_updates u WHERE u.organization_id=OLD.organization_id AND u.project_id=OLD.project_id
   AND u.activity_id=OLD.id AND u.status::text='APPROVED' AND u.reviewed_by_id=actor
   AND u.reviewed_at=NEW.reviewed_at AND u.progress_percent=NEW.progress_percent
   AND u.submitted_by_id<>actor AND u.xmin=current_xid;
  IF update_count<>1 THEN RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501'; END IF;
  SELECT count(*)::integer INTO proof_count FROM pathways.evidence_media e
   WHERE e.organization_id=OLD.organization_id AND e.project_id=OLD.project_id
   AND e.activity_id=OLD.id AND e.activity_update_id=approved_update;
  IF proof_count NOT BETWEEN 1 AND 5 OR EXISTS(SELECT FROM pathways.evidence_media e
   WHERE e.organization_id=OLD.organization_id AND e.project_id=OLD.project_id
   AND e.activity_id=OLD.id AND e.activity_update_id=approved_update AND (
    NOT e.storage_ready OR e.status::text IS DISTINCT FROM 'VERIFIED'
    OR e.verified_by_id IS DISTINCT FROM actor OR e.verified_at IS DISTINCT FROM NEW.reviewed_at
    OR e.xmin<>current_xid)) THEN
   RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways.p09_guard_activity() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p09_guard_activity() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
COMMIT;
