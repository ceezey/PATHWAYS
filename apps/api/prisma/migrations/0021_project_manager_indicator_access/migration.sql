-- Narrow Project Manager indicator exception. The indicator tables, project
-- scope rules, constraints, indexes and runtime grants remain those of 0013.
BEGIN;

DO $guard$
DECLARE
  expected_security boolean;
  expected_owner boolean;
BEGIN
  IF current_user <> 'prisma' OR session_user <> 'prisma' THEN
    RAISE EXCEPTION '0021 requires the established prisma migration identity';
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_roles
    WHERE rolname = 'pathways_runtime' AND NOT rolbypassrls AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION '0021 requires NOBYPASSRLS pathways_runtime';
  END IF;

  SELECT p.prosecdef, p.proowner = 'prisma'::regrole
    INTO expected_security, expected_owner
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('pathways.p06_can(text,uuid)');

  IF expected_security IS DISTINCT FROM true
     OR expected_owner IS DISTINCT FROM true
     OR to_regprocedure('pathways.p05_has_project_permission(text,uuid)') IS NULL
  THEN
    RAISE EXCEPTION '0021 requires the established scoped indicator policy';
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'pathways'
      AND tablename = 'project_indicators'
      AND policyname = 'p06_indicator_insert'
  ) OR NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'pathways'
      AND tablename = 'project_indicators'
      AND policyname = 'p06_indicator_update'
  ) THEN
    RAISE EXCEPTION '0021 requires the existing project-indicator RLS policies';
  END IF;
END
$guard$;

-- Existing role and permission entities are authoritative; no duplicate
-- permission or schema attribute is introduced. Fresh replay seed uses the
-- same checked-in authorization policy when reference rows are added later.
INSERT INTO pathways.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM pathways.roles r
CROSS JOIN pathways.permissions p
WHERE r.code = 'PROJECT_MANAGER'
  AND p.code IN ('indicators.create', 'indicators.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Preserve the existing project/organization/identity check. Only the two
-- indicator write permissions acquire Project Manager as an allowed role.
CREATE OR REPLACE FUNCTION pathways.p06_can(
  requested_permission text,
  requested_project uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    nullif(current_setting('app.organization_id', true), '')::uuid IS NOT NULL
    AND nullif(current_setting('app.user_id', true), '')::uuid IS NOT NULL
    AND nullif(current_setting('request.jwt.claim.sub', true), '')::uuid IS NOT NULL
    AND pathways.p05_has_project_permission(requested_permission, requested_project)
    AND EXISTS (
      SELECT
      FROM pathways.system_users u
      JOIN pathways.roles r ON r.id = u.role_id AND r.is_active
      WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
        AND u.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND u.auth_user_id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        AND u.account_status = 'ACTIVE'
        AND u.archived_at IS NULL
        AND CASE
          WHEN requested_permission IN ('indicators.create', 'indicators.update')
            THEN r.code IN ('PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER')
          WHEN requested_permission = 'monitoring.read'
            THEN r.code IN (
              'SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'PROJECT_MANAGER',
              'MONITORING_AND_EVALUATION_OFFICER'
            )
          WHEN requested_permission IN ('analytics.read', 'beneficiaries.aggregates.read')
            THEN r.code IN (
              'SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'GRANT_MANAGER',
              'PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'
            )
          ELSE false
        END
    )
$$;

-- Keep this internal function unavailable to Supabase Data API roles.
REVOKE ALL ON FUNCTION pathways.p06_can(text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p06_can(text,uuid) TO pathways_runtime;

COMMIT;
