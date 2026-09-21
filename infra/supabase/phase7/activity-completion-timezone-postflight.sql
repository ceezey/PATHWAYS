BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $check$
DECLARE definition text;
BEGIN
  IF (SELECT count(*) FROM public._prisma_migrations) <> 17 THEN
    RAISE EXCEPTION 'PATHWAYS_0017_POSTFLIGHT_EXPECTED_17_MIGRATIONS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name='0017_activity_completion_timezone_constraint'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0017_LEDGER_POSTFLIGHT_FAILED';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='pathways' AND t.relname='project_activities' AND c.conname='activities_lifecycle';
  IF definition IS NULL
     OR position('reviewed_at)::date >= actual_end_date' in definition)>0
     OR position('AT TIME ZONE ''UTC''' in definition)=0 THEN
    RAISE EXCEPTION 'PATHWAYS_0017_CONSTRAINT_POSTFLIGHT_FAILED';
  END IF;
END
$check$;

SELECT jsonb_build_object(
  'migration_0017_finished',(SELECT finished_at IS NOT NULL AND rolled_back_at IS NULL FROM public._prisma_migrations WHERE migration_name='0017_activity_completion_timezone_constraint'),
  'migration_count',(SELECT count(*) FROM public._prisma_migrations),
  'runtime_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'),
  'project_activities_rls',(SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relname='project_activities')
) AS pathways_0017_postflight;
ROLLBACK;
