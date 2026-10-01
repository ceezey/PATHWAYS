-- cr-pathways-import-value-map: per-column data type choice and value translation (G-F6-7).
-- Additive only: two nullable columns on metadata_mappings. No grant, policy, trigger or function
-- change; the table-level runtime grant already covers them. The predecessor assertion names 0049.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0049_journey_event_note'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.metadata_mappings'::regclass
  AND a.attname IN('data_type','value_map') AND NOT a.attisdropped)
 THEN RAISE EXCEPTION '0050 requires the verified 0049 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,50);

ALTER TABLE pathways.metadata_mappings
 ADD COLUMN data_type pathways.field_data_type,
 ADD COLUMN value_map jsonb,
 ADD CONSTRAINT metadata_mappings_value_map_shape CHECK(value_map IS NULL
  OR (jsonb_typeof(value_map)='array' AND jsonb_array_length(value_map) BETWEEN 1 AND 50)),
 ADD CONSTRAINT metadata_mappings_choice_mapped_only CHECK((data_type IS NULL AND value_map IS NULL)
  OR (status='MAPPED' AND target_field_id IS NOT NULL));
COMMIT;
