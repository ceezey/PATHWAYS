-- 0088 smart mapping V5 (cr-pathways-import-mapping-decision-help); forward migration.
-- p78_record_smart_mapping is replaced in place with the 0084 body plus the AUTO_SMART_V5 deltas.
-- It accepts the algorithm AUTO_SMART_V3, AUTO_SMART_V4 or AUTO_SMART_V5, and SYSTEM_COLUMN under V4 or V5.
-- CALCULATED_FIELD and SUBMISSION_TIME are V5 only, only IGNORED and with no target, suggestion, score or match reason.
-- The audit synonymVersion is SMART_SYNONYMS_V3 for V4 and V5 and SMART_SYNONYMS_V2 for V3.
-- A retry under another algorithm than the stored result's still conflicts, and stored V3 and V4 results stay valid.
-- Signature, owner, security mode, search_path, ACL and call graph stay as in 0084 (asserted below), and p38 is untouched.
-- No table, constraint, policy, trigger or grant changes; the field scope query and once-per-field rule are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0087_public_tracker_analytics'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0088 requires the verified 0087 state and migration identity'; END IF;
 -- Only the reviewed 0084 definition may be replaced.
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure('pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)')
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
  AND pg_catalog.md5(p.prosrc)='c57ba755024ce161b3f876561ffbf035')
 THEN RAISE EXCEPTION '0088 requires the reviewed 0084 definition of p78_record_smart_mapping'; END IF;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,88);

CREATE OR REPLACE FUNCTION pathways.p78_record_smart_mapping(
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
  OR coalesce(wanted_algorithm, '') NOT IN ('AUTO_SMART_V3', 'AUTO_SMART_V4', 'AUTO_SMART_V5')
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
    'HELD_VALUE_GATE','HELD_NO_SAMPLES','NO_MATCH','EMPTY_NAME','BLANK_COLUMN','SYSTEM_COLUMN','CALCULATED_FIELD','SUBMISSION_TIME')
   -- A submission system column is V4 or V5 only and only ever IGNORED, under the BLANK_COLUMN null rules below.
   OR (d.value ->> 'reason' = 'SYSTEM_COLUMN' AND (wanted_algorithm NOT IN ('AUTO_SMART_V4','AUTO_SMART_V5')
    OR d.value ->> 'status' <> 'IGNORED'))
   -- A calculated field or submission time column is V5 only and only ever IGNORED, under the same null rules.
   OR (d.value ->> 'reason' IN ('CALCULATED_FIELD','SUBMISSION_TIME') AND (wanted_algorithm <> 'AUTO_SMART_V5'
    OR d.value ->> 'status' <> 'IGNORED'))
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
    d.value ->> 'reason' NOT IN ('BLANK_COLUMN','SYSTEM_COLUMN','CALCULATED_FIELD','SUBMISSION_TIME') OR d.value -> 'targetFieldId' <> 'null'::jsonb
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
  -- Only the identical immutable result of the same algorithm is an idempotent retry. A result of any other
  -- algorithm, a manual revision, validation or processing always conflicts.
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
     OR m.validation_message IS DISTINCT FROM wanted_algorithm || ':' || (d.value ->> 'reason')
   ) OR (SELECT pg_catalog.count(*) FROM pathways.audit_logs a
    WHERE a.organization_id = org_id AND a.project_id = batch.project_id AND a.actor_user_id = actor_id
     AND a.entity_type = 'DataImportBatch' AND a.entity_id = batch.id::text
     AND a.action = 'IMPORT_AUTOMATIC_MAPPING_CREATED'
     AND a.changes ->> 'algorithmVersion' = wanted_algorithm
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
  wanted_algorithm || ':' || (d.value ->> 'reason'),
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
  pg_catalog.jsonb_build_object('algorithmVersion', wanted_algorithm,
   'synonymVersion', CASE WHEN wanted_algorithm IN ('AUTO_SMART_V4','AUTO_SMART_V5') THEN 'SMART_SYNONYMS_V3'
    ELSE 'SMART_SYNONYMS_V2' END,
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

-- Postconditions: the V5 deltas present, exact function security as in 0084 and the reviewed call graph.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
   AND p.prosrc LIKE '%AUTO_SMART_V5%' AND p.prosrc LIKE '%CALCULATED_FIELD%' AND p.prosrc LIKE '%SUBMISSION_TIME%'
   AND p.prosrc LIKE '%SYSTEM_COLUMN%' AND p.prosrc NOT LIKE '%AUTO_SMART_V3:%')
 OR EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure
  AND (pg_catalog.pg_get_userbyid(p.proowner)<>'prisma' OR NOT p.prosecdef
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
   OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
   OR has_function_privilege('service_role',p.oid,'EXECUTE')
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))))
 OR NOT has_function_privilege('pathways_runtime','pathways.p38_record_smart_mapping(uuid,integer,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION '0088 function security postconditions failed'; END IF;
 -- Call graph: inside pathways the definer calls only p05_has_project_permission (the other
 -- matches are table names in INSERT column lists and %ROWTYPE, not calls).
 IF (SELECT p.prosrc ~ 'pathways\.(?!p05_has_project_permission\(|metadata_mappings\s*\(|audit_logs\s*\()[a-z0-9_]+\s*\('
   OR p.prosrc ~ 'runtime_context|auth\.'
  FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::regprocedure)
 THEN RAISE EXCEPTION '0088 definer calls a helper outside its reviewed set'; END IF;
END $$;
COMMIT;
