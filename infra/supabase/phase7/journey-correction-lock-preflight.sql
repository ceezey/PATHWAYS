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
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_IDENTITY_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 18
     OR EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE migration_name='0018_runtime_journey_mapping_delete'
         AND checksum='1c1646770f11b76af183fc18a71a27dfb01d23e1d79cf2730fed59de22ff242d'
         AND finished_at IS NOT NULL AND rolled_back_at IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE migration_name='0019_journey_correction_lock_compatibility'
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_LEDGER_MISMATCH';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO fn_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways'
    AND p.proname='p05_snapshot_journey_event'
    AND pg_get_function_identity_arguments(p.oid)='';

  IF fn_def IS NULL
     OR position('FOR SHARE' in upper(fn_def))=0
     OR position('CORRECTED.ENROLLMENT_ID<>NEW.ENROLLMENT_ID' in regexp_replace(upper(fn_def),'\s+','','g'))=0
     OR position('CORRECTED.CORRECTS_EVENT_IDISNOTNULL' in regexp_replace(upper(fn_def),'\s+','','g'))=0 THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_FUNCTION_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee='pathways_runtime'
      AND table_schema='pathways'
      AND table_name='beneficiary_journey_events'
      AND privilege_type='UPDATE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_UNEXPECTED_EVENT_UPDATE_PRIVILEGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='pathways_runtime' AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_RUNTIME_RLS_MODE_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pathways.roles r
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id
    WHERE r.code='PROJECT_MANAGER' AND p.code='participation.record' AND p.is_active
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_PROJECT_MANAGER_PERMISSION_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id
    JOIN pathways.user_project_assignments a
      ON a.organization_id=u.organization_id AND a.user_id=u.id
    JOIN pathways.projects p
      ON p.organization_id=a.organization_id AND p.id=a.project_id
    WHERE r.code='PROJECT_MANAGER'
      AND u.account_status='ACTIVE'
      AND u.email LIKE 'p07.%@example.test'
      AND a.status='ACTIVE' AND a.ended_at IS NULL
      AND p.code='P07-SMOKE-001'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_PROJECT_MANAGER_ASSIGNMENT_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM pathways.journey_stages j JOIN pathways.projects p ON p.organization_id=j.organization_id AND p.id=j.project_id WHERE p.code='P07-SMOKE-001') <> 3
     OR (SELECT count(*) FROM pathways.activity_journey_stage_mappings m JOIN pathways.projects p ON p.organization_id=m.organization_id AND p.id=m.project_id WHERE p.code='P07-SMOKE-001') <> 1
     OR (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NULL) <> 1
     OR (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'PATHWAYS_0019_PREFLIGHT_C4_STATE_MISMATCH';
  END IF;
END
$check$;

SELECT jsonb_build_object(
  'migration_count', (SELECT count(*) FROM public._prisma_migrations),
  'latest_migration', (SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1),
  'runtime_bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
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
  'correction_event_rows', (SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects p ON p.organization_id=e.organization_id AND p.id=e.project_id WHERE p.code='P07-SMOKE-001' AND e.corrects_event_id IS NOT NULL),
  'project_manager_participation_record', EXISTS (
    SELECT 1 FROM pathways.roles r JOIN pathways.role_permissions rp ON rp.role_id=r.id JOIN pathways.permissions p ON p.id=rp.permission_id
    WHERE r.code='PROJECT_MANAGER' AND p.code='participation.record' AND p.is_active
  )
) AS pathways_0019_preflight;

ROLLBACK;
