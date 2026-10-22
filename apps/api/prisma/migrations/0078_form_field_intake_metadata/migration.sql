-- cr-pathways-metadata-import-intake: form field intake metadata and the AUTO_SMART_V3 recorder.
-- Additive only. form_fields gains four nullable import metadata columns (source_names, value_aliases,
-- import_default, rule) with shape checks; p2_form_field already freezes the whole row outside DRAFT, so no
-- trigger is added. digital_forms gains last_edited_by_id (same composite FK as created_by_id) so the editor of
-- a draft can be kept from publishing it. data_import_rows gains validation_warnings (codes and counts only).
-- metadata_mappings_match_reason_known also admits METADATA_SOURCE_NAME. p78_record_smart_mapping is
-- p38_record_smart_mapping with the AUTO_SMART_V3 deltas: IGNORED only as BLANK_COLUMN, the V3 prefix and audit,
-- an ignored count in the receipt, and required fields satisfied by a default or a calculated rule. p38 stays
-- installed and unchanged as the rollback path. No table grant, policy, permission or ledger row changes; the
-- table-level runtime grants already cover the new columns. Sampled cell values are never passed in, stored or
-- audited: each decision carries only a fixed key set. The definer runs as prisma with the same reviewed call
-- graph as p38 (it reads prisma-owned tables and calls only p05_has_project_permission).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0077_saddd_by_place' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR pg_catalog.to_regprocedure('pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)') IS NOT NULL
 OR EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE NOT a.attisdropped AND (
   (a.attrelid='pathways.form_fields'::regclass AND a.attname IN('source_names','value_aliases','import_default','rule'))
   OR (a.attrelid='pathways.digital_forms'::regclass AND a.attname='last_edited_by_id')
   OR (a.attrelid='pathways.data_import_rows'::regclass AND a.attname='validation_warnings')))
 THEN RAISE EXCEPTION '0078 requires the verified 0077 state and migration identity'; END IF;
 -- Everything the definer reads is owned by prisma without FORCE RLS, and the only helper it calls
 -- is prisma-owned and executable by prisma directly (never through a revocable membership).
 IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('data_import_batches','data_import_rows','digital_forms',
   'form_fields','metadata_mappings','audit_logs','system_users')
  AND pg_catalog.pg_get_userbyid(c.relowner)='prisma' AND NOT c.relforcerowsecurity)<>7
 OR EXISTS(SELECT FROM unnest(ARRAY['pathways.p05_has_project_permission(text,uuid)',
   'pathways.p09_role_allows(text,text)']) f(sig)
  WHERE pg_catalog.to_regprocedure(f.sig) IS NULL
  OR pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(f.sig)))<>'prisma')
 THEN RAISE EXCEPTION '0078 requires prisma ownership of the mapping tables and helpers'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,78);

-- Source names are 0-20 non-blank entries of at most 100 characters; value aliases are 0-100 {from,to} string
-- pairs of 1-100 characters; import_default is 1-120 characters; rule is an object of one of the seven kinds.
ALTER TABLE pathways.form_fields
 ADD COLUMN source_names text[],
 ADD COLUMN value_aliases jsonb,
 ADD COLUMN import_default text,
 ADD COLUMN rule jsonb,
 ADD CONSTRAINT form_fields_source_names_shape CHECK(source_names IS NULL OR cardinality(source_names)=0
  OR (cardinality(source_names) <= 20 AND array_ndims(source_names)=1 AND array_position(source_names, NULL) IS NULL
   AND array_to_string(source_names, E'\x01') !~ E'(^|\\x01)\\s*(\\x01|$)|[^\\x01]{101}')),
 ADD CONSTRAINT form_fields_value_aliases_shape CHECK(value_aliases IS NULL OR CASE
  WHEN jsonb_typeof(value_aliases)='array' THEN jsonb_array_length(value_aliases) <= 100
   AND NOT jsonb_path_exists(value_aliases, '$[*] ? (!(@.type() == "object" && @."from".type() == "string"
    && @."to".type() == "string" && @."from" like_regex "^.{1,100}$" flag "s" && @."to" like_regex "^.{1,100}$" flag "s")
    || exists(@.keyvalue() ? (@.key != "from" && @.key != "to")))')
  ELSE false END),
 ADD CONSTRAINT form_fields_import_default_shape CHECK(import_default IS NULL OR char_length(import_default) BETWEEN 1 AND 120),
 ADD CONSTRAINT form_fields_rule_kind CHECK(rule IS NULL OR (jsonb_typeof(rule)='object' AND coalesce(rule ->> 'kind','') IN
  ('AGE_AT_DATE','MINOR_AT_DATE','WASHINGTON_GROUP_DISABILITY','SAME_ANSWER_AS','AGE_CHECK','FOLLOW_UP_OF',
   'ID_FROM_INITIALS_AND_BIRTH_DATE')));

ALTER TABLE pathways.digital_forms
 ADD COLUMN last_edited_by_id uuid,
 ADD CONSTRAINT digital_forms_last_edited_by_fk FOREIGN KEY(organization_id,last_edited_by_id)
  REFERENCES pathways.system_users(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX digital_forms_last_edited_by_idx ON pathways.digital_forms USING btree(organization_id,last_edited_by_id);

ALTER TABLE pathways.data_import_rows
 ADD COLUMN validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD CONSTRAINT data_import_rows_warnings_shape CHECK(jsonb_typeof(validation_warnings)='array');

ALTER TABLE pathways.metadata_mappings
 DROP CONSTRAINT metadata_mappings_match_reason_known,
 ADD CONSTRAINT metadata_mappings_match_reason_known CHECK(match_reason IS NULL OR match_reason IN
  ('EXACT','SYNONYM','SYNONYM_REVIEW','TOKEN_SET','TOKEN_OVERLAP','EDIT_DISTANCE','METADATA_SOURCE_NAME'));

CREATE FUNCTION pathways.p78_record_smart_mapping(
 wanted_batch uuid, expected_mapping_revision integer, wanted_algorithm text, wanted_decisions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
 actor_id uuid := nullif(current_setting('app.user_id',true),'')::uuid;
 org_id uuid := nullif(current_setting('app.organization_id',true),'')::uuid;
 batch pathways.data_import_batches%ROWTYPE;
 source_count integer;
 field_count integer;
 row_count integer;
 bad_rows integer;
 form_published_by uuid;
 ignored_count integer;
 decisions jsonb;
 mapped_count integer;
 pending_count integer;
 required_unmapped integer;
 complete boolean;
 receipt jsonb;
BEGIN
 -- Cheap input bounds before any lock or read: allow-listed algorithm, one array of at most 500
 -- decisions, and a byte ceiling well above 500 fixed-shape decisions.
 IF wanted_batch IS NULL OR expected_mapping_revision IS NULL
  OR expected_mapping_revision NOT IN (0, 1)
  OR wanted_algorithm IS DISTINCT FROM 'AUTO_SMART_V3'
  OR pg_catalog.jsonb_typeof(wanted_decisions) IS DISTINCT FROM 'array'
  OR pg_catalog.jsonb_array_length(wanted_decisions) NOT BETWEEN 1 AND 500
  OR pg_catalog.octet_length(wanted_decisions::text) > 262144 THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Automatic mapping input is invalid.';
 END IF;
 IF actor_id IS NULL OR org_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Automatic mapping is unavailable.';
 END IF;

 -- Same structural scope, lock and live authority as p29_auto_map_import.
 SELECT b.* INTO batch
 FROM pathways.data_import_batches b
 WHERE b.id = wanted_batch AND b.organization_id = org_id
  AND b.uploaded_by_id = actor_id
  AND pathways.p05_has_project_permission('imports.upload', b.project_id)
 FOR UPDATE;
 IF NOT FOUND OR NOT pathways.p05_has_project_permission('imports.upload', batch.project_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Automatic mapping is unavailable.';
 END IF;
 IF batch.storage_status <> 'STORED'
  OR batch.status NOT IN ('UPLOADED', 'MAPPED')
  OR batch.mapping_revision NOT IN (0, 1)
  OR batch.validation_revision <> 0
  OR batch.validated_mapping_revision IS NOT NULL
  OR batch.reviewed_by_id IS NOT NULL OR batch.validated_at IS NOT NULL
  OR batch.processing_revision <> 0 OR batch.processing_attempts <> 0
  OR batch.processing_claim_id IS NOT NULL OR batch.processing_claimed_at IS NOT NULL
  OR batch.processed_at IS NOT NULL
  OR batch.valid_rows <> 0 OR batch.invalid_rows <> 0
  OR batch.processed_rows <> 0 OR batch.unprocessed_rows <> 0 OR batch.failed_rows <> 0
  OR batch.total_rows NOT BETWEEN 1 AND 5000 THEN
  RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping batch is stale or frozen.';
 END IF;
 IF batch.mapping_revision = 0 AND expected_mapping_revision <> 0 THEN
  RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping revision conflict.';
 END IF;
 SELECT f.published_by_id INTO form_published_by FROM pathways.digital_forms f
 WHERE f.id = batch.form_id AND f.organization_id = org_id
  AND f.project_id = batch.project_id AND f.version = batch.form_version
  AND f.status = 'PUBLISHED' AND f.archived_at IS NULL
 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping definition is unavailable.';
 END IF;
 -- The form lock can wait independently of the batch lock; recheck live authority.
 IF actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  OR org_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
  OR NOT pathways.p05_has_project_permission('imports.upload', batch.project_id) THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Automatic mapping is unavailable.';
 END IF;
 IF pg_catalog.jsonb_typeof(batch.source_headers) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Stored source columns are invalid.';
 END IF;
 source_count := pg_catalog.jsonb_array_length(batch.source_headers);
 IF source_count NOT BETWEEN 1 AND 500 OR source_count * batch.total_rows > 250000 THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Stored source columns exceed import bounds.';
 END IF;
 IF EXISTS (
  SELECT 1
  FROM pg_catalog.jsonb_array_elements(batch.source_headers) WITH ORDINALITY AS c(value, n)
  WHERE pg_catalog.jsonb_typeof(c.value) IS DISTINCT FROM 'object'
   OR pg_catalog.jsonb_typeof(c.value -> 'key') IS DISTINCT FROM 'string'
   OR c.value ->> 'key' IS DISTINCT FROM 'column_' || pg_catalog.lpad(c.n::text, 4, '0')
   OR pg_catalog.jsonb_typeof(c.value -> 'columnIndex') IS DISTINCT FROM 'number'
   OR c.value ->> 'columnIndex' IS DISTINCT FROM c.n::text
   OR pg_catalog.jsonb_typeof(c.value -> 'header') IS DISTINCT FROM 'string'
   OR pg_catalog.char_length(c.value ->> 'header') NOT BETWEEN 1 AND 100
 ) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Stored source column identity is invalid.';
 END IF;
 SELECT pg_catalog.count(*)::integer INTO field_count
 FROM pathways.form_fields f
 WHERE f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id;
 IF field_count NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Automatic mapping definition exceeds field bounds.';
 END IF;
 SELECT pg_catalog.count(*)::integer,
  pg_catalog.count(*) FILTER (WHERE
   r.status <> 'PENDING' OR r.normalized_data IS NOT NULL
   OR r.validation_revision <> 0 OR r.validated_by_id IS NOT NULL OR r.validated_at IS NOT NULL
   OR r.processing_claim_id IS NOT NULL OR r.processing_claimed_at IS NOT NULL
   OR r.processing_attempts <> 0 OR r.processed_at IS NOT NULL
   OR r.mapping_revision <> batch.mapping_revision
  )::integer INTO row_count, bad_rows
 FROM pathways.data_import_rows r
 WHERE r.organization_id = org_id AND r.project_id = batch.project_id
  AND r.form_id = batch.form_id AND r.import_batch_id = batch.id;
 IF row_count <> batch.total_rows OR bad_rows <> 0 THEN
  RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping staged rows are stale or frozen.';
 END IF;

 -- Decision shape: exactly one per stored source key in column order, a fixed key set, fixed
 -- vocabularies, integer scores and a consistent status. Anything else is rejected, so no other
 -- value (a sampled cell in particular) can reach the mapping or audit rows.
 IF pg_catalog.jsonb_array_length(wanted_decisions) <> source_count OR EXISTS (
  SELECT 1
  FROM pg_catalog.jsonb_array_elements(wanted_decisions) WITH ORDINALITY AS d(value, n)
  WHERE pg_catalog.jsonb_typeof(d.value) IS DISTINCT FROM 'object'
   OR (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(d.value) k)
    IS DISTINCT FROM ARRAY['columnIndex','matchReason','reason','score','sourceKey','status',
     'suggestedFieldId','targetFieldId']::text[]
   OR pg_catalog.jsonb_typeof(d.value -> 'sourceKey') IS DISTINCT FROM 'string'
   OR d.value ->> 'sourceKey' IS DISTINCT FROM 'column_' || pg_catalog.lpad(d.n::text, 4, '0')
   OR pg_catalog.jsonb_typeof(d.value -> 'columnIndex') IS DISTINCT FROM 'number'
   OR d.value ->> 'columnIndex' IS DISTINCT FROM d.n::text
   OR pg_catalog.jsonb_typeof(d.value -> 'status') IS DISTINCT FROM 'string'
   OR d.value ->> 'status' NOT IN ('MAPPED','PENDING','IGNORED')
   OR pg_catalog.jsonb_typeof(d.value -> 'reason') IS DISTINCT FROM 'string'
   OR d.value ->> 'reason' NOT IN ('AUTO_MATCH','SUGGESTED','HELD_CONTESTED','HELD_MARGIN',
    'HELD_VALUE_GATE','HELD_NO_SAMPLES','NO_MATCH','EMPTY_NAME','BLANK_COLUMN')
   OR pg_catalog.jsonb_typeof(d.value -> 'targetFieldId') NOT IN ('null','string')
   OR pg_catalog.jsonb_typeof(d.value -> 'suggestedFieldId') NOT IN ('null','string')
   OR (d.value ->> 'targetFieldId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (d.value ->> 'suggestedFieldId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR pg_catalog.jsonb_typeof(d.value -> 'score') NOT IN ('null','number')
   OR (d.value ->> 'score') !~ '^(100|[1-9]?[0-9])$'
   OR pg_catalog.jsonb_typeof(d.value -> 'matchReason') NOT IN ('null','string')
   OR (d.value ->> 'matchReason') NOT IN ('EXACT','SYNONYM','SYNONYM_REVIEW','TOKEN_SET',
    'TOKEN_OVERLAP','EDIT_DISTANCE','METADATA_SOURCE_NAME')
   OR (d.value -> 'score' = 'null'::jsonb) <> (d.value -> 'matchReason' = 'null'::jsonb)
   OR (d.value ->> 'status' = 'MAPPED' AND (
    d.value -> 'targetFieldId' = 'null'::jsonb OR d.value -> 'suggestedFieldId' <> 'null'::jsonb
    OR d.value ->> 'reason' <> 'AUTO_MATCH' OR d.value -> 'score' = 'null'::jsonb
    OR (d.value ->> 'score')::integer < 90 OR d.value ->> 'matchReason' = 'SYNONYM_REVIEW'))
   OR (d.value ->> 'status' = 'PENDING' AND (
    d.value -> 'targetFieldId' <> 'null'::jsonb OR d.value ->> 'reason' IN ('AUTO_MATCH','BLANK_COLUMN')
    OR (d.value -> 'suggestedFieldId' = 'null'::jsonb) <> (d.value -> 'score' = 'null'::jsonb)
    OR (d.value -> 'score' <> 'null'::jsonb AND (d.value ->> 'score')::integer < 60)
    OR (d.value ->> 'reason' = 'SUGGESTED' AND (d.value -> 'suggestedFieldId' = 'null'::jsonb
     OR (d.value ->> 'score')::integer >= 90))
    OR (d.value ->> 'reason' IN ('NO_MATCH','EMPTY_NAME') AND d.value -> 'suggestedFieldId' <> 'null'::jsonb)))
   OR (d.value ->> 'status' = 'IGNORED' AND (
    d.value ->> 'reason' <> 'BLANK_COLUMN' OR d.value -> 'targetFieldId' <> 'null'::jsonb
    OR d.value -> 'suggestedFieldId' <> 'null'::jsonb OR d.value -> 'score' <> 'null'::jsonb
    OR d.value -> 'matchReason' <> 'null'::jsonb))
 ) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Automatic mapping choices are invalid.';
 END IF;

 -- Canonical copy in column order with typed values; the audit and retry comparison use this.
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'sourceKey', d.value ->> 'sourceKey', 'columnIndex', d.n::integer,
  'status', d.value ->> 'status',
  'targetFieldId', (d.value ->> 'targetFieldId')::uuid,
  'suggestedFieldId', (d.value ->> 'suggestedFieldId')::uuid,
  'score', (d.value ->> 'score')::integer,
  'matchReason', d.value ->> 'matchReason',
  'reason', d.value ->> 'reason'
 ) ORDER BY d.n) INTO decisions
 FROM pg_catalog.jsonb_array_elements(wanted_decisions) WITH ORDINALITY AS d(value, n);

 -- Every target and suggestion is a field of the pinned form in the same organization and
 -- project. A field is mapped at most once and suggested at most once, never both.
 IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
  CROSS JOIN LATERAL (VALUES (d.value ->> 'targetFieldId'), (d.value ->> 'suggestedFieldId')) AS t(field_id)
  WHERE t.field_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM pathways.form_fields f
   WHERE f.organization_id = org_id AND f.project_id = batch.project_id
    AND f.form_id = batch.form_id AND f.id = t.field_id::uuid)
 ) OR EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
  CROSS JOIN LATERAL (VALUES (d.value ->> 'targetFieldId'), (d.value ->> 'suggestedFieldId')) AS t(field_id)
  WHERE t.field_id IS NOT NULL
  GROUP BY t.field_id HAVING pg_catalog.count(*) > 1
 ) THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Automatic mapping choices are invalid.';
 END IF;

 SELECT pg_catalog.count(*) FILTER (WHERE d.value ->> 'status' = 'MAPPED')::integer,
  pg_catalog.count(*) FILTER (WHERE d.value ->> 'status' = 'PENDING')::integer,
  pg_catalog.count(*) FILTER (WHERE d.value ->> 'status' = 'IGNORED')::integer
  INTO mapped_count, pending_count, ignored_count
 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value);
 SELECT pg_catalog.count(*)::integer INTO required_unmapped
 FROM pathways.form_fields f
 WHERE f.organization_id = org_id AND f.project_id = batch.project_id AND f.form_id = batch.form_id
  AND f.is_required AND f.import_default IS NULL
  AND coalesce(f.rule ->> 'kind', '') NOT IN ('AGE_AT_DATE','MINOR_AT_DATE','WASHINGTON_GROUP_DISABILITY','SAME_ANSWER_AS')
  AND NOT EXISTS (
   SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
   WHERE d.value ->> 'status' = 'MAPPED' AND d.value ->> 'targetFieldId' = f.id::text
  );
 complete := pending_count = 0 AND required_unmapped = 0 AND mapped_count > 0;
 receipt := pg_catalog.jsonb_build_object(
  'batchId', batch.id, 'mappingRevision', 1, 'mapped', mapped_count,
  'pending', pending_count, 'ignored', ignored_count, 'requiredUnmapped', required_unmapped, 'complete', complete
 );

 IF batch.mapping_revision = 1 THEN
  -- Only the identical immutable AUTO_SMART_V3 result is an idempotent retry. A V1 or V2 result, a
  -- manual revision, validation or processing always conflicts.
  IF (SELECT pg_catalog.count(*) FROM pathways.metadata_mappings m
   WHERE m.organization_id = org_id AND m.project_id = batch.project_id
    AND m.form_id = batch.form_id AND m.import_batch_id = batch.id AND m.revision = 1) <> source_count
   OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value)
    LEFT JOIN pathways.metadata_mappings m
     ON m.organization_id = org_id AND m.project_id = batch.project_id AND m.form_id = batch.form_id
     AND m.import_batch_id = batch.id AND m.revision = 1 AND m.source_field_name = d.value ->> 'sourceKey'
    WHERE m.id IS NULL OR m.status::text IS DISTINCT FROM d.value ->> 'status'
     OR m.target_field_id::text IS DISTINCT FROM d.value ->> 'targetFieldId'
     OR m.suggested_field_id::text IS DISTINCT FROM d.value ->> 'suggestedFieldId'
     OR m.match_score::text IS DISTINCT FROM d.value ->> 'score'
     OR m.match_reason IS DISTINCT FROM d.value ->> 'matchReason'
     OR m.target_system_field IS NOT NULL
     OR m.validation_message IS DISTINCT FROM 'AUTO_SMART_V3:' || (d.value ->> 'reason')
   ) OR (SELECT pg_catalog.count(*) FROM pathways.audit_logs a
    WHERE a.organization_id = org_id AND a.project_id = batch.project_id AND a.actor_user_id = actor_id
     AND a.entity_type = 'DataImportBatch' AND a.entity_id = batch.id::text
     AND a.action = 'IMPORT_AUTOMATIC_MAPPING_CREATED'
     AND a.changes ->> 'algorithmVersion' = 'AUTO_SMART_V3'
     AND a.changes -> 'decisions' = decisions) <> 1 THEN
   RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping revision conflict.';
  END IF;
  RETURN receipt;
 END IF;
 IF EXISTS (SELECT 1 FROM pathways.metadata_mappings m
  WHERE m.organization_id = org_id AND m.import_batch_id = batch.id) THEN
  RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Automatic mapping revision conflict.';
 END IF;

 INSERT INTO pathways.metadata_mappings (
  organization_id, project_id, form_id, import_batch_id, revision,
  source_field_name, target_field_id, status, validation_message,
  suggested_field_id, match_score, match_reason
 )
 SELECT org_id, batch.project_id, batch.form_id, batch.id, 1,
  d.value ->> 'sourceKey', (d.value ->> 'targetFieldId')::uuid,
  (d.value ->> 'status')::pathways.mapping_status,
  'AUTO_SMART_V3:' || (d.value ->> 'reason'),
  (d.value ->> 'suggestedFieldId')::uuid, (d.value ->> 'score')::smallint, d.value ->> 'matchReason'
 FROM pg_catalog.jsonb_array_elements(decisions) AS d(value);

 UPDATE pathways.data_import_rows r SET mapping_revision = 1, updated_at = CURRENT_TIMESTAMP
 WHERE r.organization_id = org_id AND r.project_id = batch.project_id
  AND r.form_id = batch.form_id AND r.import_batch_id = batch.id;
 UPDATE pathways.data_import_batches b
 SET mapping_revision = 1,
  status = CASE WHEN complete THEN 'MAPPED'::pathways.import_status ELSE 'UPLOADED'::pathways.import_status END,
  updated_at = CURRENT_TIMESTAMP
 WHERE b.id = batch.id AND b.organization_id = org_id AND b.project_id = batch.project_id;
 INSERT INTO pathways.audit_logs (
  organization_id, actor_user_id, project_id, action, entity_type, entity_id, changes
 ) VALUES (
  org_id, actor_id, batch.project_id, 'IMPORT_AUTOMATIC_MAPPING_CREATED', 'DataImportBatch', batch.id::text,
  pg_catalog.jsonb_build_object('algorithmVersion', 'AUTO_SMART_V3', 'synonymVersion', 'SMART_SYNONYMS_V2',
   'formId', batch.form_id, 'formPublishedById', form_published_by, 'formVersion', batch.form_version, 'revision', 1,
   'receipt', receipt, 'decisions', decisions)
 );
 RETURN receipt;
END
$fn$;
ALTER FUNCTION pathways.p78_record_smart_mapping(uuid,integer,text,jsonb) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)
 FROM PUBLIC, anon, authenticated, service_role, pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p78_record_smart_mapping(uuid,integer,text,jsonb) TO pathways_runtime;

-- Postconditions: columns and constraints present; exact function security; p38 untouched.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.form_fields'::regclass
  AND NOT a.attisdropped AND NOT a.attnotnull AND a.atthasdef IS FALSE
  AND ((a.attname='source_names' AND a.atttypid='text[]'::regtype)
   OR (a.attname='value_aliases' AND a.atttypid='jsonb'::regtype)
   OR (a.attname='import_default' AND a.atttypid='text'::regtype)
   OR (a.attname='rule' AND a.atttypid='jsonb'::regtype)))<>4
 OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.form_fields'::regclass
  AND c.convalidated AND c.conname IN('form_fields_source_names_shape','form_fields_value_aliases_shape',
   'form_fields_import_default_shape','form_fields_rule_kind'))<>4
 OR (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.digital_forms'::regclass
  AND NOT a.attisdropped AND NOT a.attnotnull AND a.atthasdef IS FALSE
  AND a.attname='last_edited_by_id' AND a.atttypid='uuid'::regtype)<>1
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.digital_forms'::regclass
  AND c.convalidated AND c.contype='f' AND c.conname='digital_forms_last_edited_by_fk')
 OR pg_catalog.to_regclass('pathways.digital_forms_last_edited_by_idx') IS NULL
 OR (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='pathways.data_import_rows'::regclass
  AND NOT a.attisdropped AND a.attnotnull AND a.atthasdef AND a.attname='validation_warnings'
  AND a.atttypid='jsonb'::regtype)<>1
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.data_import_rows'::regclass
  AND c.convalidated AND c.conname='data_import_rows_warnings_shape')
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.metadata_mappings'::regclass
  AND c.convalidated AND c.conname='metadata_mappings_match_reason_known'
  AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%METADATA_SOURCE_NAME%')
 THEN RAISE EXCEPTION '0078 column and constraint postconditions failed'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND (pg_catalog.pg_get_userbyid(p.proowner)<>'prisma' OR NOT p.prosecdef
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
   OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
   OR has_function_privilege('service_role',p.oid,'EXECUTE')
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))))
 OR NOT has_function_privilege('pathways_runtime','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p05_has_project_permission(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('prisma','pathways.p09_role_allows(text,text)','EXECUTE')
 THEN RAISE EXCEPTION '0078 function security postconditions failed'; END IF;
 -- Call graph: inside pathways the definer calls only p05_has_project_permission (the other
 -- matches are table names in INSERT column lists and %ROWTYPE, not calls).
 IF (SELECT p.prosrc ~ 'pathways\.(?!p05_has_project_permission\(|metadata_mappings\s*\(|audit_logs\s*\()[a-z0-9_]+\s*\('
   OR p.prosrc ~ 'runtime_context|auth\.'
  FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure)
 THEN RAISE EXCEPTION '0078 definer calls a helper outside its reviewed set'; END IF;
END $$;
COMMIT;
