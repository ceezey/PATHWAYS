-- 0049 journey event note; forward migration for G-F4-6 (developer approval 2026-10-01).
-- Nullable bounded free-text note on journey events; existing rows stay NULL.
ALTER TABLE "beneficiary_journey_events" ADD COLUMN "note" TEXT;
ALTER TABLE "beneficiary_journey_events"
  ADD CONSTRAINT "beneficiary_journey_events_note_length_chk"
  CHECK ("note" IS NULL OR (char_length("note") BETWEEN 1 AND 1000 AND "note" = btrim("note")));
