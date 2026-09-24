-- Exact access alignment for Monitoring and Evaluation Officer and Project
-- Officer. This migration changes only atomic permission definitions and
-- role-permission mappings; it does not add feature handlers or alter RLS.
BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION '0023 requires prisma or a loopback-only replay administrator';
  END IF;

  IF to_regclass('pathways.roles') IS NULL
     OR to_regclass('pathways.permissions') IS NULL
     OR to_regclass('pathways.role_permissions') IS NULL THEN
    RAISE EXCEPTION '0023 requires the canonical authorization tables';
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND NOT rolbypassrls
      AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION '0023 requires NOBYPASSRLS pathways_runtime';
  END IF;

  IF EXISTS (
    SELECT FROM pathways.permissions
    WHERE code IN (
      'alerts.read',
      'alerts.review',
      'alerts.outcome.record',
      'recommendations.read',
      'recommendations.review'
    )
      AND (name <> code OR NOT is_active)
  ) THEN
    RAISE EXCEPTION '0023 permission definition drift';
  END IF;

  IF EXISTS (
    SELECT FROM pathways.roles
    WHERE code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
      AND (
        NOT is_active
        OR name <> CASE code
          WHEN 'MONITORING_AND_EVALUATION_OFFICER'
            THEN 'Monitoring and Evaluation Officer'
          WHEN 'PROJECT_OFFICER' THEN 'Project Officer'
        END
      )
  ) THEN
    RAISE EXCEPTION '0023 target role drift';
  END IF;

  IF (
    SELECT count(*)
    FROM pathways.roles
    WHERE code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
      AND is_active
  ) <> 2 THEN
    RAISE EXCEPTION '0023 requires both active target roles';
  END IF;

  IF (
    SELECT count(*)
    FROM pathways.permissions
    WHERE code IN ('rules.read', 'recommendations.outcome.record')
      AND is_active
  ) <> 2 THEN
    RAISE EXCEPTION '0023 requires both active reused permissions';
  END IF;
END
$preflight$;

INSERT INTO pathways.permissions (code, name, description)
VALUES
  ('alerts.read', 'alerts.read', 'View rule-based alerts within authorized project scope.'),
  ('alerts.review', 'alerts.review', 'Record human review of an authorized alert.'),
  ('alerts.outcome.record', 'alerts.outcome.record', 'Record an outcome for an authorized alert.'),
  ('recommendations.read', 'recommendations.read', 'View recommendations within authorized project scope.'),
  ('recommendations.review', 'recommendations.review', 'Record human review of an authorized recommendation.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO pathways.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM pathways.roles AS role
CROSS JOIN pathways.permissions AS permission
WHERE role.code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
  AND permission.code IN (
    'rules.read',
    'alerts.read',
    'alerts.review',
    'alerts.outcome.record',
    'recommendations.read',
    'recommendations.review',
    'recommendations.outcome.record'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

DO $postflight$
DECLARE
  target_role_count integer;
  target_permission_count integer;
BEGIN
  SELECT count(*) INTO target_role_count
  FROM pathways.roles
  WHERE code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER');

  SELECT count(*) INTO target_permission_count
  FROM pathways.permissions
  WHERE code IN (
    'rules.read',
    'alerts.read',
    'alerts.review',
    'alerts.outcome.record',
    'recommendations.read',
    'recommendations.review',
    'recommendations.outcome.record'
  )
    AND is_active;

  IF target_role_count = 2 AND target_permission_count = 7 THEN
    IF (
      SELECT count(*)
      FROM pathways.role_permissions AS mapping
      JOIN pathways.roles AS role ON role.id = mapping.role_id
      JOIN pathways.permissions AS permission ON permission.id = mapping.permission_id
      WHERE role.code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
        AND permission.code IN (
          'rules.read',
          'alerts.read',
          'alerts.review',
          'alerts.outcome.record',
          'recommendations.read',
          'recommendations.review',
          'recommendations.outcome.record'
        )
    ) <> 14 THEN
      RAISE EXCEPTION '0023 target permission mapping mismatch';
    END IF;
  END IF;

  IF EXISTS (
    SELECT FROM pathways.role_permissions AS mapping
    JOIN pathways.roles AS role ON role.id = mapping.role_id
    JOIN pathways.permissions AS permission ON permission.id = mapping.permission_id
    WHERE role.code NOT IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
      AND permission.code IN (
        'alerts.read',
        'alerts.review',
        'alerts.outcome.record',
        'recommendations.read',
        'recommendations.review'
      )
  ) THEN
    RAISE EXCEPTION '0023 changed an unrelated role';
  END IF;

  IF EXISTS (
    SELECT FROM pathways.role_permissions AS mapping
    JOIN pathways.roles AS role ON role.id = mapping.role_id
    JOIN pathways.permissions AS permission ON permission.id = mapping.permission_id
    WHERE role.code IN ('MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER')
      AND permission.code IN ('rules.create', 'rules.update', 'rules.activate')
  ) THEN
    RAISE EXCEPTION '0023 target role has rule-management access';
  END IF;
END
$postflight$;

COMMIT;
