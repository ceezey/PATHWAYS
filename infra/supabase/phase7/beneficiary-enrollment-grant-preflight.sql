\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $preflight$
DECLARE
  required_column text;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'PATHWAYS_DEV_DATABASE_MISMATCH';
  END IF;

  IF current_setting('server_version_num') <> '170006' THEN
    RAISE EXCEPTION 'PATHWAYS_DEV_SERVER_VERSION_DRIFT:%', current_setting('server_version_num');
  END IF;

  IF to_regrole('pathways_runtime') IS NULL OR to_regclass('pathways.beneficiary_project_enrollments') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_ENROLLMENT_GRANT_PREFLIGHT_OBJECT_MISSING';
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pathways_runtime' AND rolbypassrls) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;

  IF NOT EXISTS (
    SELECT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pathways'
      AND c.relname = 'beneficiary_project_enrollments'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARY_ENROLLMENT_RLS_NOT_ENABLED';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 15
     OR EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
     )
     OR NOT EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE migration_name = '0015_runtime_beneficiary_timestamp_grants'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL
         AND checksum = '37602666c7e4a5cb9eb2f0e643953e7d93ca5ddcf4a3b5edfc903b3a9eb444d3'
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_PRISMA_LEDGER_IS_NOT_THE_VERIFIED_0015_BASELINE';
  END IF;

  IF EXISTS (
    SELECT FROM public._prisma_migrations
    WHERE migration_name = '0016_runtime_beneficiary_enrollment_timestamp_grants'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0016_ALREADY_PRESENT';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_INSERT_ALREADY_TABLE_WIDE';
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
    RAISE EXCEPTION 'PATHWAYS_ENROLLMENT_TIMESTAMP_GRANT_BASELINE_DRIFT';
  END IF;
END
$preflight$;

SELECT json_build_object(
  'preflight','PASS',
  'server_version_num',current_setting('server_version_num'),
  'ledger_rows',(SELECT count(*) FROM public._prisma_migrations),
  'latest_migration',(SELECT migration_name FROM public._prisma_migrations ORDER BY started_at DESC LIMIT 1),
  'table_insert',has_table_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','INSERT'),
  'created_at_insert',has_column_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','created_at','INSERT'),
  'updated_at_insert',has_column_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','updated_at','INSERT'),
  'rls',(SELECT c.relrowsecurity FROM pg_class c WHERE c.oid='pathways.beneficiary_project_enrollments'::regclass),
  'runtime_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime')
);

COMMIT;
