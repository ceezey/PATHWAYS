BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'prisma'
     OR session_user <> 'prisma'
     OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
  THEN RAISE EXCEPTION 'Unexpected managed target or identity'; END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 20
     OR (SELECT count(*) FROM public._prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 20
     OR (SELECT max(migration_name) FROM public._prisma_migrations)
        <> '0020_fixed_sensitive_release_policy'
     OR NOT EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE migration_name='0020_fixed_sensitive_release_policy'
         AND checksum='d9c301f26d42fa9b52a5591c43584a900f1b7d0293726616a4bed9a74745f10c'
         AND applied_steps_count=1
     )
  THEN RAISE EXCEPTION 'Managed 0020 ledger differs'; END IF;

  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='pathways' AND c.relkind='r') <> 45
     OR NOT EXISTS (
       SELECT FROM pg_class
       WHERE oid='pathways.sensitive_aggregate_releases'::regclass
         AND relrowsecurity AND relforcerowsecurity
     )
     OR (SELECT count(*) FROM pathways.sensitive_aggregate_releases) <> 0
     OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime')
     OR has_table_privilege('pathways_runtime','pathways.sensitive_aggregate_releases','SELECT')
     OR has_table_privilege('pathways_runtime','pathways.sensitive_aggregate_releases','INSERT')
     OR has_table_privilege('pathways_runtime','pathways.sensitive_aggregate_releases','UPDATE')
     OR has_table_privilege('pathways_runtime','pathways.sensitive_aggregate_releases','DELETE')
     OR has_function_privilege('pathways_runtime',
          'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','EXECUTE')
     OR NOT has_function_privilege('pathways_runtime',
          'pathways.p06_saddd(uuid,uuid[],date,date,text)','EXECUTE')
     OR has_function_privilege('anon',
          'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','EXECUTE')
     OR has_function_privilege('authenticated',
          'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','EXECUTE')
     OR has_function_privilege('service_role',
          'pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','EXECUTE')
     OR NOT EXISTS (
       SELECT FROM pg_proc
       WHERE oid='pathways.p06_saddd(uuid,uuid[],date,date,text)'::regprocedure
         AND prosecdef AND proowner='prisma'::regrole
         AND proconfig=ARRAY['search_path=""']
     )
  THEN RAISE EXCEPTION 'Managed C8 registry/function security differs'; END IF;
END $$;
SELECT 'PATHWAYS_C8_0020_POSTFLIGHT=PASS';
ROLLBACK;
