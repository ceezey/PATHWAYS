-- P07 forward correction:
-- ParticipantsService.saveStages() replaces project activity/stage mappings by
-- deleting the current scoped mapping set and recreating the requested set.
-- Runtime already has SELECT/INSERT/UPDATE plus RLS on this table, but DELETE
-- was omitted. Grant only DELETE and scope it through the existing journeys.manage
-- project permission under NOBYPASSRLS.

BEGIN;

DO $preflight$
BEGIN
  IF to_regrole('pathways_runtime') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ROLE_MISSING';
  END IF;

  IF to_regclass('pathways.activity_journey_stage_mappings') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_ACTIVITY_JOURNEY_STAGE_MAPPINGS_TABLE_MISSING';
  END IF;

  IF to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_P05_PROJECT_PERMISSION_HELPER_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pathways'
      AND c.relname = 'activity_journey_stage_mappings'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_JOURNEY_MAPPING_RLS_MUST_ALREADY_BE_ENABLED';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.activity_journey_stage_mappings',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_JOURNEY_MAPPING_DELETE_ALREADY_PRESENT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'pathways'
      AND tablename = 'activity_journey_stage_mappings'
      AND cmd = 'DELETE'
      AND 'pathways_runtime' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_JOURNEY_MAPPING_DELETE_POLICY_ALREADY_PRESENT';
  END IF;
END
$preflight$;

GRANT DELETE
ON TABLE pathways.activity_journey_stage_mappings
TO pathways_runtime;

CREATE POLICY p07_mapping_delete
ON pathways.activity_journey_stage_mappings
FOR DELETE
TO pathways_runtime
USING (
  organization_id = (SELECT pathways.runtime_context_organization())
  AND (SELECT pathways.p05_has_project_permission('journeys.manage', project_id))
);

DO $postflight$
BEGIN
  IF NOT has_table_privilege(
    'pathways_runtime',
    'pathways.activity_journey_stage_mappings',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_JOURNEY_MAPPING_DELETE_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'pathways'
      AND tablename = 'activity_journey_stage_mappings'
      AND policyname = 'p07_mapping_delete'
      AND cmd = 'DELETE'
      AND 'pathways_runtime' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_JOURNEY_MAPPING_DELETE_POLICY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;
END
$postflight$;

COMMIT;
