-- 0049 journey event note; forward migration for G-F4-6 (developer approval 2026-10-01).
-- Nullable bounded free-text note on journey events; existing rows stay NULL.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0048_identity_review_grant' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0049 requires the verified 0048 state'; END IF;
END $$;
ALTER TABLE pathways.beneficiary_journey_events ADD COLUMN "note" TEXT;
ALTER TABLE pathways.beneficiary_journey_events
  ADD CONSTRAINT "beneficiary_journey_events_note_length_chk"
  CHECK ("note" IS NULL OR (char_length("note") BETWEEN 1 AND 1000 AND "note" = btrim("note")));
