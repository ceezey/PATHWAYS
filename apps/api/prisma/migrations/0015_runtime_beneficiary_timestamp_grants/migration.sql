-- P07 forward correction:
-- Prisma supplies created_at and updated_at during Beneficiary creation.
-- Keep the runtime grant column-scoped and preserve all RLS policies.

DO $preflight$
BEGIN
  IF to_regrole('pathways_runtime') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ROLE_MISSING';
  END IF;

  IF to_regclass('pathways.beneficiaries') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARIES_TABLE_MISSING';
  END IF;

  IF EXISTS (
    SELECT
    FROM pg_roles
    WHERE rolname = 'pathways_runtime'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;
END
$preflight$;

GRANT INSERT (created_at, updated_at)
ON TABLE pathways.beneficiaries
TO pathways_runtime;

DO $postflight$
BEGIN
  IF NOT has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiaries',
    'created_at',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_BENEFICIARY_CREATED_AT_INSERT_MISSING';
  END IF;

  IF NOT has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiaries',
    'updated_at',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_BENEFICIARY_UPDATED_AT_INSERT_MISSING';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiaries',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_BENEFICIARY_DELETE_MUST_REMAIN_DENIED';
  END IF;
END
$postflight$;