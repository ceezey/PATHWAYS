-- cr-pathways-proof-session-beneficiary-count: optional whole-number "Beneficiaries reached this
-- session" recorded on the proof submission only. Additive only: one nullable column with a
-- bounds CHECK on pathways.activity_updates, which is owned by prisma since the 0000 baseline and
-- never reassigned by a later migration. No preprovision, role switch or grant change is needed;
-- this column never enters pathways_rules_internal.canonical_source_request (finalizeBody never
-- carries it), so that function's ACTIVITY_PROOF_FINALIZE field enumeration stays unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0041_activity_media_evidence'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0042 requires the verified 0041 state and migration identity'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_updates'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0042 requires prisma ownership of pathways.activity_updates'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.activity_updates'::pg_catalog.regclass
  AND a.attname='beneficiaries_reached_this_session' AND NOT a.attisdropped)
 THEN RAISE EXCEPTION '0042 requires the column to not already exist'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

ALTER TABLE pathways.activity_updates
 ADD COLUMN beneficiaries_reached_this_session integer;
ALTER TABLE pathways.activity_updates
 ADD CONSTRAINT activity_updates_beneficiaries_session_check
 CHECK (beneficiaries_reached_this_session IS NULL
  OR beneficiaries_reached_this_session BETWEEN 0 AND 100000);

-- Postconditions.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.activity_updates'::pg_catalog.regclass
  AND a.attname='beneficiaries_reached_this_session' AND NOT a.attisdropped AND a.attnotnull=false
  AND pg_catalog.format_type(a.atttypid,a.atttypmod)='integer')
 THEN RAISE EXCEPTION '0042 column postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_updates'::pg_catalog.regclass
  AND c.conname='activity_updates_beneficiaries_session_check' AND c.contype='c' AND c.convalidated)
 THEN RAISE EXCEPTION '0042 constraint postcondition failed'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_updates'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0042 ownership postcondition failed'; END IF;
END $$;
COMMIT;
