BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $guard$
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'PATHWAYS_0018_PREFLIGHT_IDENTITY_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 17
     OR EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE migration_name = '0017_activity_completion_timezone_constraint'
         AND checksum = '234b653c5d6fd5bfbc53d478a2f4bd5048630cd236f16a5234a11ae4c8a5e911'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_PREFLIGHT_LEDGER_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name = '0018_runtime_journey_mapping_delete'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_ALREADY_IN_LEDGER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pathways.roles r
    JOIN pathways.role_permissions rp ON rp.role_id = r.id
    JOIN pathways.permissions p ON p.id = rp.permission_id
    WHERE r.code = 'PROJECT_MANAGER'
      AND r.is_active
      AND p.code = 'journeys.manage'
      AND p.is_active
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_PROJECT_MANAGER_JOURNEYS_MANAGE_MAPPING_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pathways.system_users u
    JOIN pathways.roles r ON r.id = u.role_id
    JOIN pathways.user_project_assignments a
      ON a.organization_id = u.organization_id
     AND a.user_id = u.id
    JOIN pathways.projects pr
      ON pr.organization_id = a.organization_id
     AND pr.id = a.project_id
    WHERE r.code = 'PROJECT_MANAGER'
      AND u.account_status = 'ACTIVE'
      AND u.email LIKE 'p07.%@example.test'
      AND a.status = 'ACTIVE'
      AND a.ended_at IS NULL
      AND pr.code = 'P07-SMOKE-001'
      AND pr.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_P07_PROJECT_MANAGER_ASSIGNMENT_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'pathways_runtime' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pathways'
      AND c.relname = 'activity_journey_stage_mappings'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_JOURNEY_MAPPING_RLS_MUST_BE_ENABLED';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.activity_journey_stage_mappings',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_JOURNEY_MAPPING_DELETE_ALREADY_GRANTED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pathways'
      AND tablename = 'activity_journey_stage_mappings'
      AND cmd = 'DELETE'
      AND 'pathways_runtime' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_JOURNEY_MAPPING_DELETE_POLICY_ALREADY_PRESENT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pathways.journey_stages j
    JOIN pathways.projects pr
      ON pr.organization_id = j.organization_id
     AND pr.id = j.project_id
    WHERE pr.code = 'P07-SMOKE-001'
  ) OR EXISTS (
    SELECT 1 FROM pathways.activity_journey_stage_mappings m
    JOIN pathways.projects pr
      ON pr.organization_id = m.organization_id
     AND pr.id = m.project_id
    WHERE pr.code = 'P07-SMOKE-001'
  ) OR EXISTS (
    SELECT 1 FROM pathways.beneficiary_journey_events e
    JOIN pathways.projects pr
      ON pr.organization_id = e.organization_id
     AND pr.id = e.project_id
    WHERE pr.code = 'P07-SMOKE-001'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_P07_C4_PRECONDITION_REQUIRES_ZERO_JOURNEY_ROWS';
  END IF;
END
$guard$;

SELECT jsonb_build_object(
  'migration_count', (SELECT count(*) FROM public._prisma_migrations),
  'latest_migration', (
    SELECT migration_name FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC LIMIT 1
  ),
  'project_manager_journeys_manage', EXISTS (
    SELECT 1 FROM pathways.roles r
    JOIN pathways.role_permissions rp ON rp.role_id = r.id
    JOIN pathways.permissions p ON p.id = rp.permission_id
    WHERE r.code='PROJECT_MANAGER' AND p.code='journeys.manage' AND p.is_active
  ),
  'project_manager_assigned', EXISTS (
    SELECT 1 FROM pathways.system_users u
    JOIN pathways.roles r ON r.id=u.role_id
    JOIN pathways.user_project_assignments a
      ON a.organization_id=u.organization_id AND a.user_id=u.id
    JOIN pathways.projects pr
      ON pr.organization_id=a.organization_id AND pr.id=a.project_id
    WHERE r.code='PROJECT_MANAGER' AND u.account_status='ACTIVE'
      AND u.email LIKE 'p07.%@example.test'
      AND a.status='ACTIVE' AND a.ended_at IS NULL
      AND pr.code='P07-SMOKE-001'
  ),
  'runtime_delete_grant', has_table_privilege('pathways_runtime','pathways.activity_journey_stage_mappings','DELETE'),
  'runtime_delete_policy', EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='pathways' AND tablename='activity_journey_stage_mappings'
      AND cmd='DELETE' AND 'pathways_runtime'=ANY(roles)
  ),
  'runtime_bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
  'journey_stage_rows', (
    SELECT count(*) FROM pathways.journey_stages j JOIN pathways.projects pr
      ON pr.organization_id=j.organization_id AND pr.id=j.project_id WHERE pr.code='P07-SMOKE-001'
  ),
  'mapping_rows', (
    SELECT count(*) FROM pathways.activity_journey_stage_mappings m JOIN pathways.projects pr
      ON pr.organization_id=m.organization_id AND pr.id=m.project_id WHERE pr.code='P07-SMOKE-001'
  ),
  'journey_event_rows', (
    SELECT count(*) FROM pathways.beneficiary_journey_events e JOIN pathways.projects pr
      ON pr.organization_id=e.organization_id AND pr.id=e.project_id WHERE pr.code='P07-SMOKE-001'
  )
) AS pathways_0018_preflight;

ROLLBACK;
