BEGIN;

DO $guard$
DECLARE
  fn_oid oid;
  fn_def text;
BEGIN
  IF current_user <> 'prisma' OR session_user <> 'prisma' THEN
    RAISE EXCEPTION '0019 must run as the prisma migration identity';
  END IF;

  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO fn_oid, fn_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'pathways'
    AND p.proname = 'p05_snapshot_journey_event'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF fn_oid IS NULL THEN
    RAISE EXCEPTION '0019 expected p05_snapshot_journey_event() to exist';
  END IF;

  IF position('FOR SHARE' in upper(fn_def)) = 0 THEN
    RAISE EXCEPTION '0019 expected the reviewed pre-change FOR SHARE definition';
  END IF;

  IF position('CORRECTED.ENROLLMENT_ID<>NEW.ENROLLMENT_ID' in regexp_replace(upper(fn_def), '\s+', '', 'g')) = 0
     OR position('CORRECTED.CORRECTS_EVENT_IDISNOTNULL' in regexp_replace(upper(fn_def), '\s+', '', 'g')) = 0 THEN
    RAISE EXCEPTION '0019 refused an unexpected journey-correction guard definition';
  END IF;
END
$guard$;

-- beneficiary_journey_events are append-only to the application runtime. The
-- original-event check therefore does not need a row-level FOR SHARE lock.
-- PostgreSQL requires UPDATE privilege (and UPDATE RLS policy participation)
-- for SELECT ... FOR SHARE. Keeping the plain SELECT preserves the existing
-- same-enrollment / single-level correction invariant without granting runtime
-- UPDATE capability to immutable journey events.
CREATE OR REPLACE FUNCTION pathways.p05_snapshot_journey_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pathways AS $$
DECLARE corrected pathways.beneficiary_journey_events;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT code,name INTO NEW.stage_code_snapshot,NEW.stage_name_snapshot
    FROM pathways.journey_stages
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.stage_id;
    IF NEW.stage_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Journey stage is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.activity_id IS NOT NULL THEN
    SELECT code,title INTO NEW.activity_code_snapshot,NEW.activity_title_snapshot
    FROM pathways.project_activities
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.activity_id AND archived_at IS NULL;
    IF NEW.activity_code_snapshot IS NULL THEN
      RAISE EXCEPTION 'Activity is outside the project' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.corrects_event_id IS NOT NULL THEN
    SELECT * INTO corrected FROM pathways.beneficiary_journey_events
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND id=NEW.corrects_event_id;
    IF corrected.id IS NULL OR corrected.enrollment_id<>NEW.enrollment_id
       OR corrected.corrects_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'Correction must reference one original event in the same enrollment' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
