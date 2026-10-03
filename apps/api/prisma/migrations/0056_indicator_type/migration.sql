-- 0056 indicator type; forward migration (feature/indicator-type).
-- A project indicator could only be created as OUTPUT because the INDICATOR_CREATE source operation
-- hard coded indicator_type in its expected row. The create request now carries an optional
-- indicatorType (OUTPUT, OUTCOME, ACTIVITY, BUDGET, TIMELINE, PARTICIPATION or SURVEY_SCORE; OUTPUT when absent):
--  * pathways_rules_internal.canonical_source_request (owner rules_enqueue_owner): INDICATOR_CREATE
--    accepts the optional key indicatorType and rejects any value outside that enum;
--  * pathways.f10_begin_source_operation (owner rules_enqueue_owner): the expected INDICATOR_CREATE
--    row takes indicator_type from the request, so the source proof matches the inserted row.
-- Each function keeps its signature, owner, ACL, SECURITY mode, volatility and empty search_path
-- (checked below). The bodies keep the CRLF line endings of 0041 and 0044; only the marked lines differ.
-- DBA prerequisite: the same temporary SET-only chain as 0041 from prisma to rules_store_owner and
-- rules_enqueue_owner. Run the 0041 preprovision script first (hosted-activity-media-preprovision.sql
-- hosted, forward-activity-media-preprovision.sql local) and the matching cleanup script afterwards
-- (hosted-activity-media-cleanup.sql, forward-activity-media-cleanup.sql), also after a failure.
-- The schema owners lend CREATE for the two statements and take it back. No table, column, policy or
-- grant remains changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0055_rbac_v4_grants'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0056 requires the verified 0055 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
 THEN RAISE EXCEPTION '0056 requires the temporary rules_store_owner and rules_enqueue_owner SET chain (run the 0041 activity-media preprovision script)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
 THEN RAISE EXCEPTION '0056 requires the reviewed schema owners'; END IF;
 -- Only the reviewed 0041 and 0044 definitions, or this migration's own on a rerun, may be replaced.
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='pathways_rules_internal' AND p.proname='canonical_source_request'
 AND pg_catalog.pg_get_function_identity_arguments(p.oid)='operation text, body jsonb';
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR fn.prosecdef OR fn.provolatile<>'i'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('26392f4284b21e3b751063c39901628d','cc7f2aae3e9dc2e5b7c9e2f04dbcf4df')
 THEN RAISE EXCEPTION '0056 requires the reviewed 0041 canonical_source_request definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0056.canonical_acl',coalesce(fn.proacl::text,''),true);
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::pg_catalog.regprocedure;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('f43ddcc77120d4c068c604ddbba96b7b','a9c15dca6847b64f109cf7b2039c4145')
 THEN RAISE EXCEPTION '0056 requires the reviewed 0044 f10_begin_source_operation definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0056.begin_acl',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 1. canonical_source_request. The schema owner (rules_store_owner) lends CREATE for this statement.
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
   'periodStart','periodEnd','baseline','target','binding','indicatorType'];
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
  OR (body->>'code') !~ '^[A-Z][A-Z0-9_-]{1,39}$'
  OR coalesce(body->>'indicatorType','OUTPUT') NOT IN ('OUTPUT','OUTCOME','ACTIVITY','BUDGET','TIMELINE','PARTICIPATION','SURVEY_SCORE')) THEN RAISE EXCEPTION 'Invalid indicator definition' USING ERRCODE='22023'; END IF;
 RETURN normalized;
END $$;
RESET ROLE;
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_enqueue_owner;
RESET ROLE;

-- 2. f10_begin_source_operation. The schema owner (prisma) lends CREATE on pathways for this statement.
GRANT CREATE ON SCHEMA pathways TO rules_enqueue_owner;
SET LOCAL ROLE rules_enqueue_owner;
CREATE OR REPLACE FUNCTION pathways.f10_begin_source_operation(operation text,wanted_project uuid,wanted_source uuid,
 wanted_kind text,wanted_request uuid,wanted_phase text,body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE org uuid; actor uuid; cat pathways_rules_internal.source_operation_catalog;
 request jsonb; recovered jsonb; project_row pathways.projects; before_row jsonb; after_row jsonb; patch jsonb;
 source uuid; handle_id uuid; relation_oid oid; action text; generated_at timestamptz(3); reporting_date date;
 related pathways.activity_updates; definition pathways.project_indicators; manual_class uuid; manual_fp bytea;
 k text; db_key text; value jsonb; normalized_value text; request_hash text; compact text;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user IS DISTINCT FROM 'pathways_runtime' OR wanted_project IS NULL OR wanted_request IS NULL
  OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 SELECT c.* INTO cat FROM pathways_rules_internal.source_operation_catalog c
  WHERE c.operation_code=operation AND c.request_kind=wanted_kind AND c.request_kind<>'CONFIGURATION';
 IF NOT FOUND OR org IS NULL OR actor IS NULL OR pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 IF (wanted_kind='CLIENT_MUTATION' AND wanted_phase IS DISTINCT FROM 'MUTATION')
  OR (wanted_kind='CLIENT_MEASUREMENT' AND wanted_phase IS DISTINCT FROM 'MEASUREMENT')
  OR (wanted_kind='PROOF_FINALIZE' AND wanted_phase IS DISTINCT FROM 'FINALIZE') THEN
  RAISE EXCEPTION 'Invalid source key' USING ERRCODE='22023'; END IF;
 body:=pathways_rules_internal.canonical_source_request(operation,body);request:=body;
 -- Source id is included by SQL, preventing reuse against a different resource.
 request:=pg_catalog.jsonb_build_object('operation',operation,'sourceId',wanted_source,'body',request);
 recovered:=pathways.f10_source_acknowledgement(wanted_project,operation,wanted_kind,wanted_request,wanted_phase,request);
 IF recovered IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('kind','REPLAY','acknowledgement',recovered); END IF;
 PERFORM pathways.f10_bootstrap_project(wanted_project,operation);
 PERFORM pathways_rules_internal.lock_source_request_identity(org,actor,wanted_kind,wanted_request,wanted_phase);
 PERFORM pathways_rules_internal.assert_source_request_live(org,actor,wanted_kind,wanted_request,wanted_phase);
 recovered:=pathways.f10_source_acknowledgement(wanted_project,operation,wanted_kind,wanted_request,wanted_phase,request);
 IF recovered IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('kind','REPLAY','acknowledgement',recovered); END IF;
 IF EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user) THEN
  RAISE EXCEPTION 'Nested source operation unavailable' USING ERRCODE='55000'; END IF;
 SELECT p.* INTO project_row FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project
  AND p.archived_at IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND OR pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true
  OR nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS DISTINCT FROM actor OR nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid IS DISTINCT FROM org THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 IF operation IN ('ACTIVITY_CREATE','INDICATOR_CREATE') AND wanted_source IS NOT NULL
  OR operation NOT IN ('ACTIVITY_CREATE','INDICATOR_CREATE','PROJECT_UPDATE') AND wanted_source IS NULL
  OR operation='PROJECT_UPDATE' AND wanted_source IS DISTINCT FROM wanted_project THEN
  RAISE EXCEPTION 'Invalid source root' USING ERRCODE='22023'; END IF;
 action:=CASE WHEN operation IN ('ACTIVITY_CREATE','INDICATOR_CREATE','INDICATOR_MEASUREMENT') THEN 'INSERT' ELSE 'UPDATE' END;
 source:=CASE WHEN action='INSERT' THEN pg_catalog.gen_random_uuid() ELSE wanted_source END;
 -- Definition locks precede activities. Measurement sourceId denotes its parent definition.
 IF operation LIKE 'INDICATOR_%' AND operation<>'INDICATOR_CREATE' THEN
  SELECT i.* INTO definition FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=wanted_project
   AND i.id=wanted_source FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF operation LIKE 'ACTIVITY_%' AND operation<>'ACTIVITY_CREATE' THEN
  PERFORM 1 FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=wanted_project
   AND a.id=source AND a.archived_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 before_row:=CASE WHEN action='UPDATE' THEN pathways_rules_internal.read_source_row(operation,org,wanted_project,source) ELSE NULL END;
 IF action='UPDATE' AND before_row IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 generated_at:=greatest(pg_catalog.clock_timestamp()::timestamptz(3),project_row.updated_at+interval '1 millisecond',
  CASE WHEN before_row IS NOT NULL THEN (before_row->>'updated_at')::timestamptz+interval '1 millisecond' END);
 IF operation IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE') THEN
  SELECT u.* INTO related FROM pathways.activity_updates u WHERE u.organization_id=org AND u.project_id=wanted_project
   AND u.activity_id=source AND u.id=(body->>'updateId')::uuid FOR NO KEY UPDATE;
  IF NOT FOUND OR related.status::text<>'PENDING' THEN RAISE EXCEPTION 'Proof unavailable' USING ERRCODE='40001'; END IF;
  generated_at:=greatest(generated_at,related.updated_at+interval '1 millisecond');
  -- These exact evidence rows are protected before any readiness/review write.
  PERFORM e.id FROM pathways.evidence_media e WHERE e.organization_id=org AND e.project_id=wanted_project
   AND e.activity_id=source AND e.activity_update_id=related.id ORDER BY e.id FOR NO KEY UPDATE;
  IF operation='ACTIVITY_REVIEW' AND (related.submitted_by_id=actor
   -- FOR_REVIEW proof reviews are unchanged. A progress-only update (no evidence, below 100%) is
   -- reviewed while the activity stays IN_PROGRESS (0044).
   OR (before_row->>'status'<>'FOR_REVIEW' AND NOT (before_row->>'status'='IN_PROGRESS' AND related.progress_percent<100
    AND NOT EXISTS(SELECT 1 FROM pathways.evidence_media e WHERE e.organization_id=org AND e.project_id=wanted_project
     AND e.activity_id=source AND e.activity_update_id=related.id)))
   OR related.updated_at IS DISTINCT FROM (body->>'expectedUpdatedAt')::timestamptz) THEN
   RAISE EXCEPTION 'Proof changed' USING ERRCODE='40001'; END IF;
  IF operation='ACTIVITY_PROOF_FINALIZE' AND (related.submitted_by_id IS DISTINCT FROM actor OR related.id IS DISTINCT FROM wanted_request
   OR before_row->>'status' NOT IN ('IN_PROGRESS','FOR_REVIEW') OR related.progress_percent IS DISTINCT FROM (body->>'progressPercent')::int
   OR related.note IS DISTINCT FROM body->>'note') THEN
   RAISE EXCEPTION 'Proof changed' USING ERRCODE='40001'; END IF;
 END IF;
 IF action='UPDATE' AND operation NOT IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE','INDICATOR_UPDATE','INDICATOR_ARCHIVE')
  AND (before_row->>'updated_at')::timestamptz IS DISTINCT FROM (body->>'expectedUpdatedAt')::timestamptz
  OR operation IN ('INDICATOR_UPDATE','INDICATOR_ARCHIVE') AND definition.revision IS DISTINCT FROM (body->>'expectedRevision')::int THEN
  RAISE EXCEPTION 'Source changed' USING ERRCODE='40001'; END IF;
 SELECT (generated_at AT TIME ZONE c.zone)::date INTO reporting_date FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF reporting_date IS NULL THEN RAISE EXCEPTION 'Calendar unavailable' USING ERRCODE='55000'; END IF;
 after_row:=before_row;
 CASE operation
 WHEN 'PROJECT_UPDATE' THEN
  patch:=pg_catalog.jsonb_build_object('code',coalesce(body->>'code',before_row->>'code'),'title',pg_catalog.btrim(body->>'title'),
   'description',nullif(pg_catalog.btrim(body->>'description'),''),'objectives',nullif(pg_catalog.btrim(body->>'objectives'),''),
   'implementation_area',nullif(pg_catalog.btrim(body->>'implementationArea'),''),'start_date',body->>'startDate','end_date',body->>'endDate',
   'status',body->>'status','program_id',body->>'programId');
  FOREACH k IN ARRAY ARRAY['implementingPartners','sector','targetBeneficiaries','programManagerId'] LOOP
   IF body?k THEN db_key:=CASE k WHEN 'implementingPartners' THEN 'implementing_partners' WHEN 'targetBeneficiaries' THEN 'target_beneficiaries'
     WHEN 'programManagerId' THEN 'program_manager_id' ELSE k END;
    patch:=patch||pg_catalog.jsonb_build_object(db_key,CASE WHEN k IN ('implementingPartners','sector') THEN pg_catalog.to_jsonb(nullif(pg_catalog.btrim(body->>k),'')) ELSE body->k END); END IF;
  END LOOP;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.projects,before_row||patch)); relation_oid:='pathways.projects'::regclass;
 WHEN 'ACTIVITY_CREATE','ACTIVITY_UPDATE' THEN
  IF action='INSERT' THEN after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'created_by_id',actor,'status','NOT_STARTED','progress_percent',0))); END IF;
  patch:=pg_catalog.jsonb_build_object('code',coalesce(body->>'code',after_row->>'code','ACT-'||pg_catalog.upper(pg_catalog.substr(source::text,1,8))),
   'title',pg_catalog.btrim(body->>'title'),'description',nullif(pg_catalog.btrim(body->>'description'),''),
   'activity_type',nullif(pg_catalog.btrim(body->>'activityType'),''),'planned_start_date',body->>'plannedStartDate','planned_end_date',body->>'plannedEndDate');
  IF (body->>'plannedStartDate')::date<project_row.start_date OR (body->>'plannedEndDate')::date>project_row.end_date THEN
   IF nullif(pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')),'') IS NULL THEN
    RAISE EXCEPTION 'Timeline justification required' USING ERRCODE='22023'; END IF;
   patch:=patch||pg_catalog.jsonb_build_object('timeline_override_justification',pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')));
  END IF;
  patch:=patch||pg_catalog.jsonb_build_object('timeline_override_justification',nullif(pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')),''));
  IF body?'targetBeneficiaries' OR action='INSERT' THEN patch:=patch||pg_catalog.jsonb_build_object('target_beneficiaries',body->'targetBeneficiaries'); END IF;
  IF action='UPDATE' AND before_row->>'status' IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Terminal activity' USING ERRCODE='40001'; END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,after_row||patch)); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_START' THEN
  IF before_row->>'status'<>'NOT_STARTED' THEN RAISE EXCEPTION 'Invalid start' USING ERRCODE='40001'; END IF;
  after_row:=before_row||pg_catalog.jsonb_build_object('status','IN_PROGRESS','actual_start_date',reporting_date); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_CANCEL' THEN
  IF before_row->>'status' NOT IN ('NOT_STARTED','IN_PROGRESS') THEN RAISE EXCEPTION 'Invalid cancellation' USING ERRCODE='40001'; END IF;
  after_row:=before_row||pg_catalog.jsonb_build_object('status','CANCELLED','cancelled_at',generated_at,'cancellation_reason',pg_catalog.btrim(body->>'reason')); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_REVIEW' THEN
  patch:=pg_catalog.jsonb_build_object('status',CASE WHEN body->>'decision'='APPROVE' AND related.progress_percent=100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,'progress_percent',CASE WHEN body->>'decision'='RETURN' AND before_row->>'status'='IN_PROGRESS'
   THEN (before_row->>'progress_percent')::integer ELSE related.progress_percent END);
  IF body->>'decision'='APPROVE' AND related.progress_percent=100 THEN patch:=patch||pg_catalog.jsonb_build_object('actual_end_date',reporting_date,'reviewed_by_id',actor,'reviewed_at',generated_at); END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,before_row||patch)); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_PROOF_FINALIZE' THEN
  after_row:=before_row||pg_catalog.jsonb_build_object('status','FOR_REVIEW','progress_percent',related.progress_percent); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'INDICATOR_CREATE' THEN
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicators,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'created_by_id',actor,'code',body->>'code',
    'name',body->>'name','description',body->>'description','indicator_type',coalesce(body->>'indicatorType','OUTPUT'),'unit',CASE body->>'numericKind' WHEN 'COUNT' THEN 'COUNT' WHEN 'PERCENTAGE' THEN 'PERCENTAGE' ELSE 'OTHER' END,
    'is_saddd_related',false,'status','NOT_STARTED','revision',1,'unit_label',body->>'unitLabel','data_source',body->>'dataSource',
    'measurement_mode',body->>'mode','numeric_kind',body->>'numericKind','direction',body->>'direction','display_precision',body->'displayPrecision',
    'period_start',body->>'periodStart','period_end',body->>'periodEnd','baseline_value',body->>'baseline','target_value',body->>'target'))); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_UPDATE' THEN
  after_row:=before_row||pg_catalog.jsonb_build_object('name',body->>'name','description',body->>'description','revision',definition.revision+1); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_ARCHIVE' THEN
  IF definition.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Indicator archived' USING ERRCODE='40001'; END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicators,before_row||pg_catalog.jsonb_build_object('archived_at',generated_at,'revision',definition.revision+1))); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_MEASUREMENT' THEN
  IF definition.measurement_mode IS DISTINCT FROM 'MANUAL' OR definition.archived_at IS NOT NULL
   OR definition.period_start IS DISTINCT FROM (body->>'periodStart')::date OR definition.period_end IS DISTINCT FROM (body->>'periodEnd')::date THEN
   RAISE EXCEPTION 'Measurement definition changed' USING ERRCODE='40001'; END IF;
  normalized_value:=pg_catalog.trim_scale((body->>'value')::numeric)::text;
  -- Compact ordered JSON matches P06's original request_hash. Each value is JSON encoded independently.
  compact:='{"projectId":'||pg_catalog.to_jsonb(wanted_project::text)::text||',"indicatorId":'||pg_catalog.to_jsonb(wanted_source::text)::text||
   ',"periodStart":'||(body->'periodStart')::text||',"periodEnd":'||(body->'periodEnd')::text||',"value":'||pg_catalog.to_jsonb(normalized_value)::text||
   ',"source":'||(body->'source')::text||',"note":'||coalesce((body->'note')::text,'null')||',"correctsMeasurementId":'||coalesce((body->'correctsMeasurementId')::text,'null')||
   ',"correctionReason":'||coalesce((body->'correctionReason')::text,'null')||'}';
  request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(compact,'UTF8')),'hex');
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicator_measurements,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'indicator_id',wanted_source,
    'period_start',body->>'periodStart','period_end',body->>'periodEnd','value',normalized_value,'source',body->>'source','note',body->>'note',
    'client_measurement_id',wanted_request,'request_hash',request_hash,'corrects_measurement_id',body->>'correctsMeasurementId','correction_reason',body->>'correctionReason','recorded_by_id',actor)));
  relation_oid:='pathways.project_indicator_measurements'::regclass;
  SELECT e.id,e.source_fingerprint INTO manual_class,manual_fp FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=org AND e.project_id=wanted_project AND e.indicator_id=wanted_source
    AND e.definition_revision=definition.revision
    AND e.source_fingerprint=pathways_rules_internal.indicator_source_fingerprint(definition.id,definition.revision,definition.measurement_mode,definition.numeric_kind,NULL,NULL,NULL)
    AND e.decision='ALLOWED_NON_SENSITIVE'
    AND e.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS' AND e.approved_at<=generated_at AND (e.expires_at IS NULL OR e.expires_at>generated_at)
    AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.eligibility newer WHERE newer.organization_id=e.organization_id
     AND newer.project_id=e.project_id AND newer.indicator_id=e.indicator_id AND newer.classification_revision>e.classification_revision);
 END CASE;
 IF pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways_rules_internal.source_operation_context(transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,
  operation_code,request_kind,request_id,phase,canonical_request_hash,source_record_id,root_relation_oid,root_action,
  expected_before_business_hash,expected_after_business_hash,related_update_id,review_action,manual_definition_revision,
  manual_definition_fingerprint,manual_classification_id,canonical_body,generated_at,companion_before)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,org,wanted_project,actor,operation,wanted_kind,wanted_request,wanted_phase,
  pg_catalog.sha256(pg_catalog.convert_to(request::text,'UTF8')),source,relation_oid,action,
  CASE WHEN before_row IS NOT NULL THEN pathways_rules_internal.source_business_fingerprint(before_row) END,
  pathways_rules_internal.source_business_fingerprint(after_row),related.id,CASE WHEN operation='ACTIVITY_REVIEW' THEN body->>'decision' END,
  CASE WHEN operation='INDICATOR_MEASUREMENT' THEN definition.revision END,manual_fp,manual_class,body,generated_at,
  pathways_rules_internal.source_companion_state(operation,org,wanted_project,source)) RETURNING handle INTO handle_id;
 RETURN pg_catalog.jsonb_build_object('kind','NEW','operationHandle',handle_id,'reservedRecordId',CASE WHEN action='INSERT' THEN source ELSE NULL END,
  'generatedValues',pg_catalog.jsonb_build_object('timestamp',pathways_rules_internal.utc_milliseconds(generated_at),'businessDate',reporting_date,
   'normalizedValue',normalized_value,'requestHash',request_hash));
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM rules_enqueue_owner;

-- Postconditions.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='pathways_rules_internal' AND p.proname='canonical_source_request'
 AND pg_catalog.pg_get_function_identity_arguments(p.oid)='operation text, body jsonb';
 IF NOT FOUND OR pg_catalog.md5(fn.prosrc)<>'cc7f2aae3e9dc2e5b7c9e2f04dbcf4df'
  OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR fn.prosecdef OR fn.provolatile<>'i'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0056.canonical_acl')
  OR NOT pg_catalog.has_function_privilege('rules_enqueue_owner',fn.oid,'EXECUTE')
  OR EXISTS(SELECT FROM (VALUES('pathways_runtime'),('anon'),('authenticated'),('service_role'),
   ('pathways_rules_worker'),('pathways_rules_sweeper')) r(name)
   WHERE pg_catalog.has_function_privilege(r.name,fn.oid,'EXECUTE'))
 THEN RAISE EXCEPTION '0056 canonical_source_request postconditions failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::pg_catalog.regprocedure;
 IF pg_catalog.md5(fn.prosrc)<>'a9c15dca6847b64f109cf7b2039c4145' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner'
  OR NOT fn.prosecdef OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0056.begin_acl')
 THEN RAISE EXCEPTION '0056 f10_begin_source_operation postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0056 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
