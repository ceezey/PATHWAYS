-- 0058 rules decision status AUTO_RESOLVED (PRD-F11 G-F11-5, step 1 of 3).
-- Adds the AUTO_RESOLVED enum value so 0059 can let the rules runtime close an undecided recommendation
-- when its alert auto-resolves. PostgreSQL permits ADD VALUE inside a transaction block, but the new value
-- must not be used before commit, so this migration only checks the catalog for it (0036 precedent).
-- No table, column, policy or grant changes. PostgreSQL has no DROP VALUE; rollback leaves it unused.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0055_rbac_v4_grants' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='decision_status' AND t.typtype='e'
   AND e.enumlabel IN ('NEW','REVIEWED','RESOLVED','DISMISSED')) <> 4
 THEN RAISE EXCEPTION '0058 requires the verified 0055 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

ALTER TYPE pathways.decision_status ADD VALUE IF NOT EXISTS 'AUTO_RESOLVED';

DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='decision_status') <> 5
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='decision_status' AND e.enumlabel='AUTO_RESOLVED')
 THEN RAISE EXCEPTION '0058 decision status verification failed'; END IF;
END $$;
COMMIT;
