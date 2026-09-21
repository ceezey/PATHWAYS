BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $guard$
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'PATHWAYS_0018_POSTFLIGHT_IDENTITY_MISMATCH';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 18
     OR EXISTS (
       SELECT 1 FROM public._prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_POSTFLIGHT_HISTORY_NOT_CLEAN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name = '0018_runtime_journey_mapping_delete'
      AND checksum = '1c1646770f11b76af183fc18a71a27dfb01d23e1d79cf2730fed59de22ff242d'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_POSTFLIGHT_CHECKSUM_MISMATCH';
  END IF;

  IF NOT has_table_privilege(
    'pathways_runtime',
    'pathways.activity_journey_stage_mappings',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_RUNTIME_DELETE_GRANT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='pathways'
      AND tablename='activity_journey_stage_mappings'
      AND policyname='p07_mapping_delete'
      AND cmd='DELETE'
      AND 'pathways_runtime'=ANY(roles)
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_RUNTIME_DELETE_POLICY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='pathways_runtime' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways'
      AND c.relname='activity_journey_stage_mappings'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_MAPPING_RLS_MUST_REMAIN_ENABLED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pathways.journey_stages j JOIN pathways.projects pr
      ON pr.organization_id=j.organization_id AND pr.id=j.project_id
    WHERE pr.code='P07-SMOKE-001'
  ) OR EXISTS (
    SELECT 1 FROM pathways.activity_journey_stage_mappings m JOIN pathways.projects pr
      ON pr.organization_id=m.organization_id AND pr.id=m.project_id
    WHERE pr.code='P07-SMOKE-001'
  ) OR EXISTS (
    SELECT 1 FROM pathways.beneficiary_journey_events e JOIN pathways.projects pr
      ON pr.organization_id=e.organization_id AND pr.id=e.project_id
    WHERE pr.code='P07-SMOKE-001'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0018_UNEXPECTED_APPLICATION_ROW_CHANGE';
  END IF;
END
$guard$;

SELECT jsonb_build_object(
  'migration_count', (SELECT count(*) FROM public._prisma_migrations),
  'migration_0018_finished', EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name='0018_runtime_journey_mapping_delete'
      AND checksum='1c1646770f11b76af183fc18a71a27dfb01d23e1d79cf2730fed59de22ff242d'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ),
  'runtime_delete_grant', has_table_privilege('pathways_runtime','pathways.activity_journey_stage_mappings','DELETE'),
  'runtime_delete_policy', EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='pathways' AND tablename='activity_journey_stage_mappings'
      AND policyname='p07_mapping_delete' AND cmd='DELETE'
      AND 'pathways_runtime'=ANY(roles)
  ),
  'runtime_bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
  'mapping_rls', (
    SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relname='activity_journey_stage_mappings'
  ),
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
) AS pathways_0018_postflight;

ROLLBACK;
