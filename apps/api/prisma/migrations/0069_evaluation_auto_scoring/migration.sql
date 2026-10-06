-- 0069 evaluation auto scoring (cr-pathways-evaluation-auto-scoring); forward migration.
-- Every evaluation criterion is now scored from project data, so criterion_type gains INDICATOR_LINKAGE
-- (share of activities linked to an indicator) and ASSESSMENT_GAIN (share of paired pre/post assessments that
-- improved). PostgreSQL permits ADD VALUE inside a transaction block, but the new values must not be used before
-- commit, so this migration only checks the catalog for them (0036 and 0058 precedent). The default criteria are
-- provisioned by the API on the first evaluation round, never by SQL. No table, policy, function or grant changes;
-- PostgreSQL has no DROP VALUE, so rollback leaves the values unused.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0068_timeline_final_position'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='criterion_type' AND t.typtype='e'
   AND e.enumlabel IN ('KPI','TIMELINE_COMPLIANCE','BUDGET_EFFICIENCY','BENEFICIARY_REACH','OTHER')) <> 5
 THEN RAISE EXCEPTION '0069 requires the verified 0068 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,4);

ALTER TYPE pathways.criterion_type ADD VALUE IF NOT EXISTS 'INDICATOR_LINKAGE';
ALTER TYPE pathways.criterion_type ADD VALUE IF NOT EXISTS 'ASSESSMENT_GAIN';

DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='criterion_type') <> 7
 OR (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='criterion_type'
   AND e.enumlabel IN ('INDICATOR_LINKAGE','ASSESSMENT_GAIN')) <> 2
 THEN RAISE EXCEPTION '0069 criterion type verification failed'; END IF;
END $$;
COMMIT;
