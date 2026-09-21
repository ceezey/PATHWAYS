\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $postflight$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'PATHWAYS_DEV_DATABASE_MISMATCH';
  END IF;

  IF current_setting('server_version_num') <> '170006' THEN
    RAISE EXCEPTION 'PATHWAYS_DEV_SERVER_VERSION_DRIFT:%', current_setting('server_version_num');
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 16
     OR EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
     )
     OR NOT EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE migration_name = '0016_runtime_beneficiary_enrollment_timestamp_grants'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL
         AND applied_steps_count = 1
         AND checksum = 'ddebabb6075046b2a7376a9921de28f00ddbac5abb12c56fbf72dc05ad788c24'
     ) THEN
    RAISE EXCEPTION 'PATHWAYS_0016_LEDGER_POSTFLIGHT_FAILED';
  END IF;

  IF NOT has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'created_at',
    'INSERT'
  ) OR NOT has_column_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'updated_at',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_ENROLLMENT_TIMESTAMP_GRANTS_NOT_EFFECTIVE';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.beneficiary_project_enrollments',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ENROLLMENT_INSERT_BECAME_TABLE_WIDE';
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
    RAISE EXCEPTION 'PATHWAYS_BENEFICIARY_ENROLLMENT_RLS_NOT_ENABLED';
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pathways_runtime' AND rolbypassrls) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_MUST_REMAIN_NOBYPASSRLS';
  END IF;
END
$postflight$;

SELECT json_build_object(
  'postflight','PASS',
  'server_version_num',current_setting('server_version_num'),
  'ledger_rows',(SELECT count(*) FROM public._prisma_migrations),
  'migration_0016_finished',(SELECT finished_at IS NOT NULL AND rolled_back_at IS NULL FROM public._prisma_migrations WHERE migration_name='0016_runtime_beneficiary_enrollment_timestamp_grants'),
  'table_insert',has_table_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','INSERT'),
  'created_at_insert',has_column_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','created_at','INSERT'),
  'updated_at_insert',has_column_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','updated_at','INSERT'),
  'delete',has_table_privilege('pathways_runtime','pathways.beneficiary_project_enrollments','DELETE'),
  'rls',(SELECT c.relrowsecurity FROM pg_class c WHERE c.oid='pathways.beneficiary_project_enrollments'::regclass),
  'runtime_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime')
);

COMMIT;
