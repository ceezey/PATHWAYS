-- Hosted control-plane only, run by a person with psql after the rules migrations are applied.
-- Sets worker and sweeper passwords through psql \password, which hashes client-side and stores nothing here.
\set ON_ERROR_STOP on
\if :{?target_project_ref}
\else
\echo 'Explicit independently pinned target_project_ref required'
\quit 2
\endif
\if :{?expected_database}
\else
\echo 'Explicit expected_database required'
\quit 2
\endif
SELECT current_database()=:'expected_database' AND current_database()='postgres'
 AND :'target_project_ref'='klbtoqdalmcsfjqophty'
 AND current_user='postgres' AND session_user='postgres'
 AND EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0060_rules_budget_beneficiary_survey_metrics'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 AND (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('pathways_rules_worker','pathways_rules_sweeper')
  AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit)=2
 AS target_verified \gset
\if :target_verified
\else
\echo 'Pinned target, applied rules migrations and reviewed machine roles required'
\quit 2
\endif
\echo 'Enter the worker password (input hidden)'
\password pathways_rules_worker
\echo 'Enter the sweeper password (input hidden)'
\password pathways_rules_sweeper
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER ROLE pathways_rules_worker CONNECTION LIMIT 3;
ALTER ROLE pathways_rules_sweeper CONNECTION LIMIT 3;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('pathways_rules_worker','pathways_rules_sweeper')
  AND rolconnlimit=3)<>2 THEN
  RAISE EXCEPTION 'Machine login postcondition failed';
 END IF;
END $$;
COMMIT;
\echo 'RULES_MACHINE_LOGIN=READY'
