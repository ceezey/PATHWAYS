-- cr-pathways-proof-session-beneficiary-count: optional whole-number "Beneficiaries reached this
-- session" recorded on the proof submission. Additive only: one nullable column with a
-- bounds CHECK on pathways.activity_updates, which is owned by prisma since the 0000 baseline and
-- never reassigned by a later migration. No preprovision, role switch or grant change is needed;
-- this column never enters pathways_rules_internal.canonical_source_request (finalizeBody never
-- carries it), so that function's ACTIVITY_PROOF_FINALIZE field enumeration stays unchanged.
--
-- Developer decision (2026-09-29, final): an activity's beneficiaries_reached is the SUM of
-- beneficiaries_reached_this_session over that activity's activity_updates whose status is
-- APPROVED (NULL counts as 0). PENDING, VERIFIED and REJECTED never count; an approved proof
-- later REJECTED drops the total. Participation-record counts are no longer used for the
-- activity-level total. pathways.p08_activity_beneficiaries_reached is redefined below to sum
-- approved session counts instead of counting distinct participating beneficiaries. Its exact
-- signature, return columns, owner, ACL, SECURITY DEFINER mode and empty search_path are
-- preserved. SADDD sex/age breakdowns are unaffected: they stay sourced from participation
-- records, because a typed per-session count carries no breakdown.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0041_activity_media_evidence'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0042 requires the verified 0041 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_updates'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0042 requires prisma ownership of pathways.activity_updates'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.activity_updates'::pg_catalog.regclass
  AND a.attname='beneficiaries_reached_this_session' AND NOT a.attisdropped)
 THEN RAISE EXCEPTION '0042 requires the column to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0042 requires prisma ownership of pathways.p08_activity_beneficiaries_reached'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

ALTER TABLE pathways.activity_updates
 ADD COLUMN beneficiaries_reached_this_session integer;
ALTER TABLE pathways.activity_updates
 ADD CONSTRAINT activity_updates_beneficiaries_session_check
 CHECK (beneficiaries_reached_this_session IS NULL
  OR beneficiaries_reached_this_session BETWEEN 0 AND 100000);

-- Redefine the activity-level aggregate to sum approved proof-session counts instead of
-- counting distinct participating beneficiaries. Signature, return columns, owner, ACL,
-- SECURITY DEFINER mode and empty search_path are unchanged from the 0000 baseline; only the
-- body's final SELECT changes.
CREATE OR REPLACE FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) RETURNS TABLE(activity_id uuid, beneficiaries_reached integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  requested_count integer;
BEGIN
  requested_count:=cardinality(wanted_activity_ids);
  IF wanted_org IS NULL OR wanted_project IS NULL OR requested_count IS NULL
     OR requested_count<1 OR requested_count>100
     OR array_position(wanted_activity_ids,NULL) IS NOT NULL
     OR (SELECT count(DISTINCT requested_id) FROM unnest(wanted_activity_ids) requested_id)<>requested_count THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  IF wanted_org IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
     OR NOT pathways.p05_has_project_permission('activities.read',wanted_project)
     OR NOT pathways.p05_has_project_permission('beneficiaries.aggregates.read',wanted_project) THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  IF (SELECT count(*)
      FROM pathways.project_activities a
      WHERE a.organization_id=wanted_org
        AND a.project_id=wanted_project
        AND a.id=ANY(wanted_activity_ids)
        AND a.archived_at IS NULL)<>requested_count THEN
    RAISE EXCEPTION 'Activity aggregate request unavailable' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    coalesce(sum(coalesce(u.beneficiaries_reached_this_session,0))
      FILTER (WHERE u.status='APPROVED' AND a.status<>'CANCELLED'),0)::integer
      AS beneficiaries_reached
  FROM pathways.project_activities a
  LEFT JOIN pathways.activity_updates u
    ON u.organization_id=a.organization_id
   AND u.project_id=a.project_id
   AND u.activity_id=a.id
  WHERE a.organization_id=wanted_org
    AND a.project_id=wanted_project
    AND a.id=ANY(wanted_activity_ids)
    AND a.archived_at IS NULL
  GROUP BY a.id
  ORDER BY a.id;
END
$$;
ALTER FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION pathways.p08_activity_beneficiaries_reached(wanted_org uuid, wanted_project uuid, wanted_activity_ids uuid[]) TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.activity_updates'::pg_catalog.regclass
  AND a.attname='beneficiaries_reached_this_session' AND NOT a.attisdropped AND a.attnotnull=false
  AND pg_catalog.format_type(a.atttypid,a.atttypmod)='integer')
 THEN RAISE EXCEPTION '0042 column postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_updates'::pg_catalog.regclass
  AND c.conname='activity_updates_beneficiaries_session_check' AND c.contype='c' AND c.convalidated)
 THEN RAISE EXCEPTION '0042 constraint postcondition failed'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_updates'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0042 ownership postcondition failed'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0042 function ownership postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p
  WHERE p.oid='pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])'::pg_catalog.regprocedure
  AND p.prosecdef AND p.proconfig=ARRAY['search_path=""'])
 THEN RAISE EXCEPTION '0042 function security/search_path postcondition failed'; END IF;
 IF NOT (has_function_privilege('pathways_runtime',
   'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('anon',
   'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('authenticated',
   'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE')
  AND NOT has_function_privilege('service_role',
   'pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])','EXECUTE'))
 THEN RAISE EXCEPTION '0042 function ACL postcondition failed'; END IF;
END $$;
COMMIT;
