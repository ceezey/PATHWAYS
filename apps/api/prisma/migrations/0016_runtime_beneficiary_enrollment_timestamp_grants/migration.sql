-- P07 forward correction:
-- Prisma supplies created_at and updated_at during BeneficiaryProjectEnrollment creation.
-- Keep the runtime INSERT grant column-scoped and preserve the existing RLS policies.

BEGIN;

DO $preflight$
DECLARE
  required_column text;
BEGIN
  IF to_regrole('pathways_runtime') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ROLE_MISSING';
  END IF;

  IF to_regclass('pathways.beneficiary_project_enrollments') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARY_ENROLLMENTS_TABLE_MISSING';
  END IF;

  IF EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_INSERT_MUST_REMAIN_COLUMN_SCOPED';
  END IF;

  FOREACH required_column IN ARRAY ARRAY[
    'id',
    'organization_id',
    'project_id',
    'beneficiary_id',
    'enrollment_date',
    'status',
    'recorded_by_id'
  ] LOOP
    IF NOT has_column_privilege(
      'pathways_runtime',
      'pathways.beneficiary_project_enrollments',
      required_column,
      'INSERT'
    ) THEN
      RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_BASE_INSERT_COLUMN_MISSING:%', required_column;
    END IF;
  END LOOP;

  IF has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'created_at',
    'INSERT'
  ) OR has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'updated_at',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_TIMESTAMP_INSERT_ALREADY_PRESENT';
  END IF;

  IF NOT EXISTS (
    SELECT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pathways'
      AND c.relname = 'beneficiary_project_enrollments'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARY_ENROLLMENT_RLS_MUST_ALREADY_BE_ENABLED';
  END IF;
END
$preflight$;

GRANT INSERT (created_at, updated_at)
ON TABLE pathways.beneficiary_project_enrollments
TO pathways_runtime;

DO $postflight$
DECLARE
  timestamp_column text;
BEGIN
  FOREACH timestamp_column IN ARRAY ARRAY['created_at', 'updated_at'] LOOP
    IF NOT has_column_privilege(
      'pathways_runtime',
      'pathways.beneficiary_project_enrollments',
      timestamp_column,
      'INSERT'
    ) THEN
      RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_TIMESTAMP_INSERT_MISSING:%', timestamp_column;
    END IF;
  END LOOP;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_INSERT_MUST_REMAIN_COLUMN_SCOPED';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_DELETE_MUST_REMAIN_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pathways'
      AND c.relname = 'beneficiary_project_enrollments'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARY_ENROLLMENT_RLS_MUST_REMAIN_ENABLED';
  END IF;
END
$postflight$;

COMMIT;
