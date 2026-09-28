-- 0041 activity media evidence; canonical forward migration (cr-pathways-activity-progress-media).
-- Predecessor assertion is 0037, not 0040: 0038-0041 are built in parallel in one release wave.
-- 1. Widens evidence_media_activity_update_check so activity-update evidence may be typed PHOTO,
--    VIDEO or DOCUMENT from its verified content type. PROGRESS_PROOF and COMPLETION_PROOF stay
--    valid for existing rows. The constraint is added NOT VALID and then validated.
-- 2. Replaces pathways_rules_internal.canonical_source_request with only the ACTIVITY_PROOF_FINALIZE
--    files bounds changed: 1-10 files, video/quicktime and video/webm, byteSize up to 104857600
--    (the EVIDENCE_MAX_FILE_BYTES ceiling) and a 524288000 total. Every other byte of the body,
--    including its CRLF line endings, is the 0031 text, so the installed definition differs from
--    0031 only inside the files branch. The replacement runs as the owner rules_enqueue_owner.
-- DBA prerequisite: the 0031 cleanup revoked prisma's rules owner memberships and schema rights.
-- Run hosted-activity-media-preprovision.sql first (a temporary SET chain to rules_store_owner and
-- rules_enqueue_owner) and hosted-activity-media-cleanup.sql afterwards, also after a failure.
-- No postgres-owned helper is called; catalog reads need no grants. No table, column, policy or
-- grant changes remain after commit.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0037_step_up_pin'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0041 requires the verified 0037 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
 THEN RAISE EXCEPTION '0041 requires the temporary rules_store_owner and rules_enqueue_owner SET chain (run hosted-activity-media-preprovision.sql)'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='pathways_rules_internal' AND p.proname='canonical_source_request'
 AND pg_catalog.pg_get_function_identity_arguments(p.oid)='operation text, body jsonb';
 -- Only the reviewed 0031 definition, or this migration's own on a rerun, may be replaced.
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR fn.prosecdef OR fn.provolatile<>'i'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('f29b759a811908174dbad04cdf47c7f5','26392f4284b21e3b751063c39901628d')
 THEN RAISE EXCEPTION '0041 requires the reviewed 0031 canonical_source_request definition'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.evidence_media'::pg_catalog.regclass
  AND c.conname='evidence_media_activity_update_check')
 OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.evidence_media'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0041 requires the prisma-owned evidence_media activity-update constraint'; END IF;
 PERFORM pg_catalog.set_config('pathways_0041.acl',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 1. Activity-update evidence types.
ALTER TABLE pathways.evidence_media DROP CONSTRAINT evidence_media_activity_update_check;
ALTER TABLE pathways.evidence_media ADD CONSTRAINT evidence_media_activity_update_check CHECK (
 activity_update_id IS NULL OR (activity_id IS NOT NULL AND type = ANY (ARRAY['PROGRESS_PROOF','COMPLETION_PROOF',
  'PHOTO','VIDEO','DOCUMENT']::pathways.evidence_type[]))) NOT VALID;
ALTER TABLE pathways.evidence_media VALIDATE CONSTRAINT evidence_media_activity_update_check;

-- 2. Canonical finalize request bounds, replaced by the function owner. The schema owner lends
-- CREATE for this one statement and takes it back; owner, ACL, SECURITY mode, volatility and
-- search_path stay unchanged (checked below).
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_enqueue_owner;
RESET ROLE;
SET LOCAL ROLE rules_enqueue_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.canonical_source_request(operation text,body jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[]; required text[]; k text; v jsonb; item jsonb; normalized jsonb:=body; maximum_length integer;
BEGIN
 IF pg_catalog.jsonb_typeof(body) IS DISTINCT FROM 'object' OR pg_catalog.octet_length(body::text)>65536 THEN
  RAISE EXCEPTION 'Invalid source request' USING ERRCODE='22023'; END IF;
 CASE operation
 WHEN 'PROJECT_UPDATE' THEN
  allowed:=ARRAY['expectedUpdatedAt','code','title','description','objectives','implementationArea','implementingPartners',
   'implementingPartnerNames','sector','targetBeneficiaries','startDate','endDate','status','programId','programManagerId',
   'projectManagerId','monitoringOfficerId','projectOfficerIds','projectBudget']; required:=ARRAY['expectedUpdatedAt','title','status'];
 WHEN 'ACTIVITY_CREATE','ACTIVITY_UPDATE' THEN
  allowed:=ARRAY['code','title','description','activityType','plannedStartDate','plannedEndDate','timelineOverrideJustification',
   'targetBeneficiaries','budgetAllocation','assignedUserIds','indicatorIds','journeyStageId'];
  required:=ARRAY['title','plannedStartDate','plannedEndDate','assignedUserIds'];
  IF operation='ACTIVITY_UPDATE' THEN allowed:=pg_catalog.array_append(allowed,'expectedUpdatedAt'); required:=pg_catalog.array_append(required,'expectedUpdatedAt'); END IF;
 WHEN 'ACTIVITY_START','ACTIVITY_CANCEL' THEN
  allowed:=ARRAY['expectedUpdatedAt','status','reason']; required:=ARRAY['expectedUpdatedAt','status'];
 WHEN 'ACTIVITY_REVIEW' THEN
  allowed:=ARRAY['updateId','decision','reason','expectedUpdatedAt']; required:=allowed;
 WHEN 'ACTIVITY_PROOF_FINALIZE' THEN
  allowed:=ARRAY['updateId','progressPercent','note','files']; required:=allowed;
 WHEN 'INDICATOR_CREATE' THEN
  allowed:=ARRAY['code','name','description','unitLabel','dataSource','mode','numericKind','direction','displayPrecision',
   'periodStart','periodEnd','baseline','target','binding'];
  required:=ARRAY['code','name','unitLabel','dataSource','mode','numericKind','direction','displayPrecision','periodStart','periodEnd','baseline','target'];
 WHEN 'INDICATOR_UPDATE' THEN allowed:=ARRAY['name','description','expectedRevision']; required:=ARRAY['name','expectedRevision'];
 WHEN 'INDICATOR_ARCHIVE' THEN allowed:=ARRAY['expectedRevision']; required:=allowed;
 WHEN 'INDICATOR_MEASUREMENT' THEN
  allowed:=ARRAY['periodStart','periodEnd','value','source','note','correctsMeasurementId','correctionReason'];
  required:=ARRAY['periodStart','periodEnd','value','source'];
 ELSE RAISE EXCEPTION 'Unknown source operation' USING ERRCODE='22023'; END CASE;
 IF body-allowed<>'{}'::jsonb OR NOT(body ?& required) THEN
  RAISE EXCEPTION 'Invalid source fields' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT e.key,e.value FROM pg_catalog.jsonb_each(body) e LOOP
  IF v='null'::jsonb THEN
   IF k=ANY(required) AND k NOT IN ('baseline','target') THEN
    RAISE EXCEPTION 'Required source field is null' USING ERRCODE='22023'; END IF;
   IF k NOT IN ('description','objectives','implementationArea','implementingPartners','sector','targetBeneficiaries',
     'programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','baseline','target')
    AND NOT(operation='PROJECT_UPDATE' AND k IN ('code','startDate','endDate'))
    AND NOT(operation IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE') AND k IN ('code','activityType','timelineOverrideJustification')) THEN
    RAISE EXCEPTION 'Invalid null source field' USING ERRCODE='22023'; END IF;
  ELSIF k IN ('expectedRevision','displayPrecision','targetBeneficiaries','progressPercent') THEN
   IF pg_catalog.jsonb_typeof(v)<>'number' OR v::text !~ '^(0|[1-9][0-9]{0,9})$'
    OR v::text::numeric>2147483647 OR (k='expectedRevision' AND v::text::int<1)
    OR (k='displayPrecision' AND v::text::int>4) OR (k='progressPercent' AND v::text::int>100) THEN
    RAISE EXCEPTION 'Invalid source integer' USING ERRCODE='22023'; END IF;
  ELSIF k IN ('assignedUserIds','indicatorIds','projectOfficerIds','implementingPartnerNames') THEN
   IF pg_catalog.jsonb_typeof(v)<>'array' OR pg_catalog.jsonb_array_length(v)>
     (CASE k WHEN 'indicatorIds' THEN 100 WHEN 'implementingPartnerNames' THEN 20 ELSE 50 END)
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v) e WHERE pg_catalog.jsonb_typeof(e)<>'string') THEN
    RAISE EXCEPTION 'Invalid source collection' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT e FROM pg_catalog.jsonb_array_elements(v) e LOOP
    IF k='implementingPartnerNames' THEN
     IF pg_catalog.char_length(pg_catalog.btrim(item#>>'{}')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid partner name' USING ERRCODE='22023'; END IF;
    ELSIF (item#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     RAISE EXCEPTION 'Invalid source UUID' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(v))<>
     (SELECT pg_catalog.count(DISTINCT e) FROM pg_catalog.jsonb_array_elements(v) e) THEN
    RAISE EXCEPTION 'Duplicate source collection item' USING ERRCODE='22023'; END IF;
   SELECT coalesce(pg_catalog.jsonb_agg(e ORDER BY e),'[]'::jsonb) INTO v FROM pg_catalog.jsonb_array_elements(v) e;
   normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],v);
  ELSIF k='files' THEN
   IF pg_catalog.jsonb_typeof(v)<>'array' OR pg_catalog.jsonb_array_length(v) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid proof files' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT e FROM pg_catalog.jsonb_array_elements(v) e LOOP
    IF pg_catalog.jsonb_typeof(item)<>'object' OR item-ARRAY['fileName','sha256','contentType','byteSize']<>'{}'::jsonb
     OR NOT(item ?& ARRAY['fileName','sha256','contentType','byteSize'])
     OR pg_catalog.jsonb_typeof(item->'fileName') IS DISTINCT FROM 'string'
     OR pg_catalog.char_length(item->>'fileName') NOT BETWEEN 1 AND 128 OR (item->>'fileName') ~ '[/\\]'
     OR pg_catalog.jsonb_typeof(item->'sha256') IS DISTINCT FROM 'string' OR (item->>'sha256') !~ '^[0-9a-f]{64}$'
     OR pg_catalog.jsonb_typeof(item->'contentType') IS DISTINCT FROM 'string'
     OR item->>'contentType' NOT IN ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf')
     OR pg_catalog.jsonb_typeof(item->'byteSize') IS DISTINCT FROM 'number' OR (item->>'byteSize') !~ '^[1-9][0-9]{0,8}$'
     OR (item->>'byteSize')::bigint>104857600 THEN
     RAISE EXCEPTION 'Invalid proof metadata' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT pg_catalog.sum((e->>'byteSize')::bigint) FROM pg_catalog.jsonb_array_elements(v) e)>524288000 THEN
    RAISE EXCEPTION 'Proof total exceeds bound' USING ERRCODE='22023'; END IF;
   SELECT pg_catalog.jsonb_agg(e ORDER BY e->>'fileName',e->>'sha256',e->>'contentType',(e->>'byteSize')::bigint)
    INTO v FROM pg_catalog.jsonb_array_elements(v) e;
   normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],v);
  ELSIF k='binding' THEN
   IF pg_catalog.jsonb_typeof(v)<>'object' OR v-ARRAY['recipe','activityId','formId','formVersion','fieldId']<>'{}'::jsonb
    OR NOT(v?'recipe') OR v->>'recipe' NOT IN ('ACTIVITY_COMPLETION_PERCENTAGE','PARTICIPATION_RECORD_COUNT',
     'DISTINCT_ATTENDING_INDIVIDUALS','EFFECTIVE_JOURNEY_EVENT_COUNT','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    RAISE EXCEPTION 'Invalid source binding' USING ERRCODE='22023'; END IF;
   -- Native P06 guard independently validates recipe parents and their domain types.
  ELSE
   IF pg_catalog.jsonb_typeof(v)<>'string' OR pg_catalog.char_length(v#>>'{}')>4000 THEN
    RAISE EXCEPTION 'Invalid source text' USING ERRCODE='22023'; END IF;
   IF k IN ('programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','updateId','correctsMeasurementId')
    AND (v#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid source UUID' USING ERRCODE='22023'; END IF;
   IF k IN ('startDate','endDate','plannedStartDate','plannedEndDate','periodStart','periodEnd')
    AND ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR pg_catalog.to_char((v#>>'{}')::date,'YYYY-MM-DD') IS DISTINCT FROM (v#>>'{}')) THEN
    RAISE EXCEPTION 'Invalid source date' USING ERRCODE='22023'; END IF;
   IF k='expectedUpdatedAt' AND ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR pg_catalog.to_char((v#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM (v#>>'{}')) THEN
    RAISE EXCEPTION 'Invalid source version' USING ERRCODE='22023'; END IF;
   IF k IN ('projectBudget','budgetAllocation') AND (v#>>'{}') !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Invalid source budget' USING ERRCODE='22023'; END IF;
   IF k IN ('baseline','target','value') AND (v#>>'{}') !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN
    RAISE EXCEPTION 'Invalid source decimal' USING ERRCODE='22023'; END IF;
   IF k IN ('baseline','target','value') THEN normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],pg_catalog.to_jsonb(pg_catalog.trim_scale((v#>>'{}')::numeric)::text)); END IF;
   maximum_length:=CASE k WHEN 'title' THEN 160 WHEN 'name' THEN 160 WHEN 'code' THEN 40 WHEN 'unitLabel' THEN 80
    WHEN 'dataSource' THEN 300 WHEN 'source' THEN 300 WHEN 'implementationArea' THEN 240 WHEN 'sector' THEN 160
    WHEN 'implementingPartners' THEN 1000 WHEN 'reason' THEN 1000 WHEN 'correctionReason' THEN 1000
    WHEN 'activityType' THEN 80 WHEN 'timelineOverrideJustification' THEN 1000
    WHEN 'description' THEN CASE WHEN operation LIKE 'ACTIVITY_%' THEN 4000 ELSE 2000 END
    WHEN 'note' THEN CASE WHEN operation='ACTIVITY_PROOF_FINALIZE' THEN 4000 ELSE 1000 END ELSE 4000 END;
   IF pg_catalog.char_length(pg_catalog.btrim(v#>>'{}'))>maximum_length
    OR (k='title' AND pg_catalog.char_length(pg_catalog.btrim(v#>>'{}'))<3)
    OR (k IN ('name','unitLabel','dataSource','source','reason','correctionReason') AND pg_catalog.btrim(v#>>'{}')='') THEN
    RAISE EXCEPTION 'Invalid source text bound' USING ERRCODE='22023'; END IF;
   IF k NOT IN ('expectedUpdatedAt','startDate','endDate','plannedStartDate','plannedEndDate','periodStart','periodEnd',
    'programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','updateId','correctsMeasurementId',
    'baseline','target','value') THEN normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],pg_catalog.to_jsonb(pg_catalog.btrim(v#>>'{}'))); END IF;
  END IF;
 END LOOP;
 IF operation='PROJECT_UPDATE' AND body->>'status' NOT IN ('PLANNED','ONGOING','COMPLETED','ON_HOLD','CANCELLED')
  OR operation='ACTIVITY_START' AND body->>'status'<>'IN_PROGRESS'
  OR operation='ACTIVITY_CANCEL' AND (body->>'status'<>'CANCELLED' OR pg_catalog.btrim(body->>'reason') IS NULL OR pg_catalog.btrim(body->>'reason')='')
  OR operation='ACTIVITY_REVIEW' AND (body->>'decision' NOT IN ('APPROVE','RETURN') OR pg_catalog.btrim(body->>'reason')='') THEN
  RAISE EXCEPTION 'Invalid source action' USING ERRCODE='22023'; END IF;
 IF operation='INDICATOR_CREATE' AND (body->>'mode' NOT IN ('MANUAL','DERIVED')
  OR body->>'numericKind' NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
  OR body->>'direction' NOT IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','DESCRIPTIVE')
  OR ((body->>'mode'='DERIVED') IS DISTINCT FROM (body?'binding'))
  OR (body->>'code') !~ '^[A-Z][A-Z0-9_-]{1,39}$') THEN RAISE EXCEPTION 'Invalid indicator definition' USING ERRCODE='22023'; END IF;
 RETURN normalized;
END $$;
RESET ROLE;
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_enqueue_owner;
RESET ROLE;

-- Postconditions.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='pathways_rules_internal' AND p.proname='canonical_source_request'
 AND pg_catalog.pg_get_function_identity_arguments(p.oid)='operation text, body jsonb';
 IF NOT FOUND OR pg_catalog.md5(fn.prosrc)<>'26392f4284b21e3b751063c39901628d'
  OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR fn.prosecdef OR fn.provolatile<>'i'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0041.acl')
  -- Its callers (f10_begin_source_operation, f10_source_acknowledgement and
  -- f10_abandon_source_operation) are definers owned by rules_enqueue_owner.
  OR NOT pg_catalog.has_function_privilege('rules_enqueue_owner',fn.oid,'EXECUTE')
  OR EXISTS(SELECT FROM (VALUES('pathways_runtime'),('anon'),('authenticated'),('service_role'),
   ('pathways_rules_worker'),('pathways_rules_sweeper')) r(name)
   WHERE pg_catalog.has_function_privilege(r.name,fn.oid,'EXECUTE'))
 THEN RAISE EXCEPTION '0041 canonical_source_request postconditions failed'; END IF;
 -- The lent schema CREATE is gone again.
 IF pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0041 schema CREATE postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.evidence_media'::pg_catalog.regclass
  AND c.conname='evidence_media_activity_update_check' AND c.contype='c' AND c.convalidated
  AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%PROGRESS_PROOF%COMPLETION_PROOF%PHOTO%VIDEO%DOCUMENT%')
 OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.evidence_media'::pg_catalog.regclass
  AND c.conname='evidence_media_activity_update_check')<>1
 THEN RAISE EXCEPTION '0041 evidence type constraint postconditions failed'; END IF;
END $$;
COMMIT;
