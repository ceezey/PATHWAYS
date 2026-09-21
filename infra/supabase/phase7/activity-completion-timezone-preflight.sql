BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $check$
DECLARE definition text;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'PATHWAYS_0017_WRONG_DATABASE';
  END IF;
  IF current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'PATHWAYS_0017_EXPECTED_POSTGRES_17';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations) <> 16 THEN
    RAISE EXCEPTION 'PATHWAYS_0017_EXPECTED_16_MIGRATIONS';
  END IF;
  IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='0017_activity_completion_timezone_constraint') THEN
    RAISE EXCEPTION 'PATHWAYS_0017_ALREADY_PRESENT';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='pathways' AND t.relname='project_activities' AND c.conname='activities_lifecycle';
  IF definition IS NULL OR position('reviewed_at)::date >= actual_end_date' in definition)=0 THEN
    RAISE EXCEPTION 'PATHWAYS_0017_UNEXPECTED_LIFECYCLE_BASELINE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pathways.project_activities
    WHERE status='COMPLETED'
      AND NOT (actual_end_date BETWEEN ((reviewed_at AT TIME ZONE 'UTC')::date - 1)
                                   AND ((reviewed_at AT TIME ZONE 'UTC')::date + 1))
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_0017_EXISTING_COMPLETED_ROW_OUTSIDE_SAFE_WINDOW';
  END IF;
END
$check$;

SELECT jsonb_build_object(
  'migration_count',(SELECT count(*) FROM public._prisma_migrations),
  'latest_migration',(SELECT migration_name FROM public._prisma_migrations ORDER BY started_at DESC LIMIT 1),
  'session_timezone',current_setting('TimeZone'),
  'completed_activities',(SELECT count(*) FROM pathways.project_activities WHERE status='COMPLETED'),
  'pending_p07_reviews',(SELECT count(*) FROM pathways.activity_updates u JOIN pathways.projects p ON p.organization_id=u.organization_id AND p.id=u.project_id WHERE p.code='P07-SMOKE-001' AND u.status='PENDING')
) AS pathways_0017_preflight;
ROLLBACK;
