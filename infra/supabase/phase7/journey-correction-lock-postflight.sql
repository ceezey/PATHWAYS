BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $check$
DECLARE
  fn_def text;
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_IDENTITY_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 19
     OR EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE migration_name='0019_journey_correction_lock_compatibility'
         AND checksum='2e74ce16f7236c91c2c6698a274e7207c2e46a496e7012950d76b5cd400e16c0'
         AND finished_at IS NOT NULL AND rolled_back_at IS NULL
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_LEDGER_MISMATCH';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO fn_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways'
    AND p.proname='p05_snapshot_journey_event'
    AND pg_get_function_identity_arguments(p.oid)='';

  IF fn_def IS NULL
     OR position('FOR SHARE' in upper(fn_def))<>0
     OR position('CORRECTED.ENROLLMENT_ID<>NEW.ENROLLMENT_ID' in regexp_replace(upper(fn_def),'\s+','','g'))=0
     OR position('CORRECTED.CORRECTS_EVENT_IDISNOTNULL' in regexp_replace(upper(fn_def),'\s+','','g'))=0 THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_FUNCTION_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee='pathways_runtime'
      AND table_schema='pathways'
      AND table_name='beneficiary_journey_events'
      AND privilege_type='UPDATE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_EVENT_UPDATE_PRIVILEGE_WIDENED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='pathways_runtime' AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_RUNTIME_RLS_MODE_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relname='beneficiary_journey_events' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_EVENT_RLS_DISABLED';
  END IF;

  -- Migration itself must not create or rewrite C4 application rows.
  IF (SELECT count(*) FROM pathways.journey_stages j JOIN pathways.projects p ON p.organization_id=j.organization_id AND p.id=j.project_id WHERE p.code='P07-SMOKE-001') <> 3
     OR (SELECT count(*) FROM pathways.activity_journey_stage_mappings m JOIN pathways.projects p ON p.organization_id=m.organization_id AND p.id=m.project_id WHERE p.code='P07-SMOKE-001') <> 1
     OR (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NULL) <> 1
     OR (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'PATHWAYS_0019_POSTFLIGHT_C4_STATE_CHANGED';
  END IF;
END
$check$;

SELECT jsonb_build_object(
  'migration_count', (SELECT count(*) FROM public._prisma_migrations),
  'migration_0019_finished', EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name='0019_journey_correction_lock_compatibility'
      AND checksum='2e74ce16f7236c91c2c6698a274e7207c2e46a496e7012950d76b5cd400e16c0'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ),
  'runtime_bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
  'event_rls', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relname='beneficiary_journey_events'),
  'runtime_event_update_any', EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee='pathways_runtime' AND table_schema='pathways'
      AND table_name='beneficiary_journey_events' AND privilege_type='UPDATE'
  ),
  'snapshot_uses_for_share', (
    SELECT position('FOR SHARE' in upper(pg_get_functiondef(p.oid)))>0
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pathways' AND p.proname='p05_snapshot_journey_event'
      AND pg_get_function_identity_arguments(p.oid)=''
  ),
  'journey_stage_rows', (SELECT count(*) FROM pathways.journey_stages j JOIN pathways.projects p ON p.organization_id=j.organization_id AND p.id=j.project_id WHERE p.code='P07-SMOKE-001'),
  'mapping_rows', (SELECT count(*) FROM pathways.activity_journey_stage_mappings m JOIN pathways.projects p ON p.organization_id=m.organization_id AND p.id=m.project_id WHERE p.code='P07-SMOKE-001'),
  'root_event_rows', (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NULL),
  'correction_event_rows', (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NOT NULL)
) AS pathways_0019_postflight;

ROLLBACK;
