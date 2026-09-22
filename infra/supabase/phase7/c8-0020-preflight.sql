BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'prisma'
     OR session_user <> 'prisma'
     OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
  THEN RAISE EXCEPTION 'Unexpected managed target or identity'; END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 19
     OR (SELECT count(*) FROM public._prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 19
     OR (SELECT max(migration_name) FROM public._prisma_migrations)
        <> '0019_journey_correction_lock_compatibility'
     OR NOT EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE migration_name = '0019_journey_correction_lock_compatibility'
         AND checksum = '2e74ce16f7236c91c2c6698a274e7207c2e46a496e7012950d76b5cd400e16c0'
     )
  THEN RAISE EXCEPTION 'Managed ledger is not the accepted through-0019 state'; END IF;

  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='pathways' AND c.relkind='r') <> 44
     OR to_regclass('pathways.sensitive_aggregate_releases') IS NOT NULL
     OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime')
     OR has_function_privilege(
          'pathways_runtime',
          'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)',
          'EXECUTE')
     OR position(
          'RELEASE_POLICY_REVIEW_REQUIRED' IN
          pg_get_functiondef(
            'pathways.p06_saddd(uuid,uuid[],date,date,text)'::regprocedure)
        ) = 0
     OR to_regprocedure('pg_catalog.sha256(bytea)') IS NULL
  THEN RAISE EXCEPTION 'Managed C8 security/function pre-state differs'; END IF;
END $$;
SELECT 'PATHWAYS_C8_0020_PREFLIGHT=PASS';
ROLLBACK;