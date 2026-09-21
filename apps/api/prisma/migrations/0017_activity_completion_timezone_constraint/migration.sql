BEGIN;

DO $guard$
BEGIN
  IF to_regclass('pathways.project_activities') IS NULL THEN
    RAISE EXCEPTION '0017 requires pathways.project_activities';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'pathways'
      AND t.relname = 'project_activities'
      AND c.conname = 'activities_lifecycle'
      AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION '0017 requires the existing activities_lifecycle check constraint';
  END IF;
END
$guard$;

-- A project activity stores actual_end_date as the configured BUSINESS_TIME_ZONE
-- calendar date, while reviewed_at is an auditable timestamptz. Comparing
-- reviewed_at::date directly is session-time-zone dependent (PATHWAYS-dev is
-- UTC) and rejects legitimate reviews when the business calendar has already
-- advanced to the next day. Keep the lifecycle invariant, but allow the only
-- date skew that a real world time zone can introduce relative to UTC: +/- 1 day.
ALTER TABLE pathways.project_activities
  DROP CONSTRAINT activities_lifecycle;

ALTER TABLE pathways.project_activities
  ADD CONSTRAINT activities_lifecycle CHECK (
    (
      status = 'NOT_STARTED'
      AND actual_start_date IS NULL
      AND actual_end_date IS NULL
      AND reviewed_by_id IS NULL
      AND reviewed_at IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR (
      status IN ('IN_PROGRESS','FOR_REVIEW')
      AND actual_start_date IS NOT NULL
      AND actual_end_date IS NULL
      AND reviewed_by_id IS NULL
      AND reviewed_at IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR (
      status = 'COMPLETED'
      AND actual_start_date IS NOT NULL
      AND actual_end_date IS NOT NULL
      AND created_by_id IS NOT NULL
      AND reviewed_by_id IS NOT NULL
      AND reviewed_by_id <> created_by_id
      AND reviewed_at IS NOT NULL
      AND actual_end_date BETWEEN
        ((reviewed_at AT TIME ZONE 'UTC')::date - 1)
        AND ((reviewed_at AT TIME ZONE 'UTC')::date + 1)
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR (
      status = 'CANCELLED'
      AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND btrim(cancellation_reason) <> ''
      AND reviewed_by_id IS NULL
      AND reviewed_at IS NULL
    )
  );

COMMIT;
