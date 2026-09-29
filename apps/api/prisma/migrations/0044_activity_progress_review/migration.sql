-- 0044 activity progress review; forward migration (developer decision 2026-09-29: new migration 0044).
-- A PENDING progress-only activity update (no evidence rows, below 100%) can be reviewed while its
-- activity stays IN_PROGRESS. Until now the ACTIVITY_REVIEW source operation demanded a FOR_REVIEW
-- activity, so M&E approve/return of a progress note failed in the database, and the pending note
-- also blocked every later proof submission. Only the status precondition changes:
--  * pathways.f10_begin_source_operation (owner rules_enqueue_owner): accepts before-status
--    IN_PROGRESS for a progress-only update, and a progress-only RETURN keeps the activity progress;
--  * pathways_rules_internal.prove_source_root_dml (owner rules_source_proof_owner): the same
--    precondition for the DML proof.
-- FOR_REVIEW proof reviews (1-5 evidence rows, p09_guard_activity, assert_source_companions) are
-- unchanged. pathways.p09_guard_activity needs no change: a progress-only approve changes only
-- progress_percent and updated_at, which that guard already exempts. Each function keeps its
-- signature, owner, ACL, SECURITY DEFINER mode, volatility and empty search_path (checked below).
-- The bodies keep the 0031 CRLF line endings; only the marked lines differ.
-- DBA prerequisite: run hosted-activity-review-preprovision.sql first (a temporary SET-only chain
-- from prisma to rules_store_owner, rules_enqueue_owner and rules_source_proof_owner) and
-- hosted-activity-review-cleanup.sql afterwards, also after a failure. The schema owners lend
-- CREATE for the two statements and take it back. No table, column, policy or grant remains changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0043_activity_overdue_explanation'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0044 requires the verified 0043 state and migration identity'; END IF;
 IF NOT pg_catalog.pg_has_role('prisma','rules_store_owner','SET') OR NOT pg_catalog.pg_has_role('prisma','rules_enqueue_owner','SET')
  OR NOT pg_catalog.pg_has_role('prisma','rules_source_proof_owner','SET')
 THEN RAISE EXCEPTION '0044 requires the temporary rules_store_owner, rules_enqueue_owner and rules_source_proof_owner SET chain (run hosted-activity-review-preprovision.sql)'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
 THEN RAISE EXCEPTION '0044 requires the reviewed schema owners'; END IF;
 -- Only the reviewed 0031 definitions, or this migration's own on a rerun, may be replaced.
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::pg_catalog.regprocedure;
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.jsonb'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('7f6cbcf20a51fd44a13822d29a0c9f8a','f43ddcc77120d4c068c604ddbba96b7b')
 THEN RAISE EXCEPTION '0044 requires the reviewed 0031 f10_begin_source_operation definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0044.begin_acl',coalesce(fn.proacl::text,''),true);
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways_rules_internal' AND p.proname='prove_source_root_dml';
 IF pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_source_proof_owner' OR NOT fn.prosecdef OR fn.provolatile<>'v'
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR fn.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype
  OR pg_catalog.md5(fn.prosrc) NOT IN ('9effd59448b3522325d3b8ff6d1604c8','24ad351577ffffee2f66ff02dfe26c0a')
 THEN RAISE EXCEPTION '0044 requires the reviewed 0031 prove_source_root_dml definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0044.prove_acl',coalesce(fn.proacl::text,''),true);
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- 1. f10_begin_source_operation. The schema owner (prisma) lends CREATE on pathways for this statement.
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
    'name',body->>'name','description',body->>'description','indicator_type','OUTPUT','unit',CASE body->>'numericKind' WHEN 'COUNT' THEN 'COUNT' WHEN 'PERCENTAGE' THEN 'PERCENTAGE' ELSE 'OTHER' END,
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

-- 2. prove_source_root_dml. The schema owner rules_store_owner lends CREATE on pathways_rules_internal.
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_source_proof_owner;
RESET ROLE;
SET LOCAL ROLE rules_source_proof_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.prove_source_root_dml()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c pathways_rules_internal.source_operation_context; needed_permission text;
 cat pathways_rules_internal.source_operation_catalog; matches bigint;
 next_row jsonb:=pg_catalog.to_jsonb(NEW); previous_row jsonb;
 before_hash bytea; after_hash bytea; meaningful boolean; work text;
 root_id uuid; org uuid; project uuid; needed text; revision text;
 proof pathways.activity_updates; definition pathways.project_indicators; eligible boolean;
BEGIN
 -- No direct function call or caller-built relation identity supplies provenance.
 IF TG_WHEN IS DISTINCT FROM 'AFTER' OR TG_LEVEL IS DISTINCT FROM 'ROW'
  OR TG_OP NOT IN ('INSERT','UPDATE') OR session_user IS DISTINCT FROM 'pathways_runtime' THEN
  RAISE EXCEPTION 'Source proof unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_RELID NOT IN ('pathways.projects'::regclass,'pathways.project_activities'::regclass,
   'pathways.project_indicators'::regclass,'pathways.project_indicator_measurements'::regclass) THEN
  RAISE EXCEPTION 'Source relation unavailable' USING ERRCODE='42501';
 END IF;
 root_id:=(next_row->>'id')::uuid; org:=(next_row->>'organization_id')::uuid;
 project:=CASE WHEN TG_RELID='pathways.projects'::regclass THEN root_id
   ELSE (next_row->>'project_id')::uuid END;
 SELECT pg_catalog.count(*) INTO matches
 FROM pathways_rules_internal.source_operation_context x
 WHERE x.transaction_id=pg_catalog.pg_current_xact_id() AND x.backend_pid=pg_catalog.pg_backend_pid()
  AND x.login_name=session_user AND x.organization_id=org AND x.project_id=project
  AND x.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND x.source_record_id=root_id
  AND x.root_relation_oid=TG_RELID;
 -- Marker-free existing human writers retain their existing behavior during
 -- proposal rollout. Once hooks are enabled, source participation/enforcement is
 -- an explicit rollout prerequisite; absence MUST NOT be treated as receipt proof.
 IF matches=0 THEN
  IF TG_RELID='pathways.projects'::regclass AND TG_OP='INSERT' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Source operation required' USING ERRCODE='42501';
 END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Ambiguous source proof' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO STRICT c FROM pathways_rules_internal.source_operation_context x
 WHERE x.transaction_id=pg_catalog.pg_current_xact_id() AND x.backend_pid=pg_catalog.pg_backend_pid()
  AND x.login_name=session_user AND x.organization_id=org AND x.project_id=project
  AND x.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND x.source_record_id=root_id
  AND x.root_relation_oid=TG_RELID;
 SELECT x.* INTO STRICT cat FROM pathways_rules_internal.source_operation_catalog x
 WHERE x.operation_code=c.operation_code;
 IF c.sealed OR c.root_action IS DISTINCT FROM TG_OP
  OR c.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  OR c.request_kind IS DISTINCT FROM cat.request_kind
  OR pathways.p06_can(cat.permission_code,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Source proof unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  previous_row:=pg_catalog.to_jsonb(OLD);
  IF (previous_row->>'id')::uuid IS DISTINCT FROM root_id
   OR (previous_row->>'organization_id')::uuid IS DISTINCT FROM org
   OR (TG_RELID<>'pathways.projects'::regclass AND
       (previous_row->>'project_id')::uuid IS DISTINCT FROM project) THEN
   RAISE EXCEPTION 'Source reparenting forbidden' USING ERRCODE='22023';
  END IF;
  before_hash:=pathways_rules_internal.source_business_fingerprint(previous_row);
 END IF;
 after_hash:=pathways_rules_internal.source_business_fingerprint(next_row);
 IF before_hash IS DISTINCT FROM c.expected_before_business_hash
  OR after_hash IS DISTINCT FROM c.expected_after_business_hash THEN
  RAISE EXCEPTION 'Source DML differs from validated request' USING ERRCODE='22023';
 END IF;
 IF TG_RELID='pathways.projects'::regclass THEN
  IF cat.source_table<>'projects' OR c.operation_code<>'PROJECT_UPDATE' OR TG_OP<>'UPDATE' THEN
   RAISE EXCEPTION 'Invalid project operation' USING ERRCODE='22023';
  END IF;
  meaningful:=(previous_row->'status',previous_row->'start_date',previous_row->'end_date')
   IS DISTINCT FROM (next_row->'status',next_row->'start_date',next_row->'end_date');
 ELSIF TG_RELID='pathways.project_activities'::regclass THEN
  IF cat.source_table<>'project_activities'
   OR c.operation_code NOT IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE','ACTIVITY_START',
       'ACTIVITY_CANCEL','ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE')
   OR ((c.operation_code='ACTIVITY_CREATE') IS DISTINCT FROM (TG_OP='INSERT')) THEN
   RAISE EXCEPTION 'Invalid activity operation' USING ERRCODE='22023';
  END IF;
  IF TG_OP='INSERT' AND (next_row->>'created_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Activity creator mismatch' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='ACTIVITY_START' AND
    (previous_row->>'status' IS DISTINCT FROM 'NOT_STARTED' OR next_row->>'status' IS DISTINCT FROM 'IN_PROGRESS') THEN
   RAISE EXCEPTION 'Invalid activity start' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='ACTIVITY_CANCEL' AND
    (previous_row->>'status' NOT IN ('NOT_STARTED','IN_PROGRESS')
      OR next_row->>'status' IS DISTINCT FROM 'CANCELLED') THEN
   RAISE EXCEPTION 'Invalid activity cancellation' USING ERRCODE='22023';
  END IF;
  IF c.operation_code IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE') THEN
   IF c.related_update_id IS NULL THEN RAISE EXCEPTION 'Missing proof root' USING ERRCODE='22023'; END IF;
   SELECT u.id,u.organization_id,u.project_id,u.activity_id,u.submitted_by_id,u.progress_percent,
     u.status,u.reviewed_by_id INTO proof.id,proof.organization_id,proof.project_id,proof.activity_id,
     proof.submitted_by_id,proof.progress_percent,proof.status,proof.reviewed_by_id
   FROM pathways.activity_updates u WHERE u.organization_id=org AND u.project_id=project
    AND u.id=c.related_update_id AND u.activity_id=root_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Proof root unavailable' USING ERRCODE='22023'; END IF;
   IF c.operation_code='ACTIVITY_PROOF_FINALIZE' THEN
    IF c.request_kind<>'PROOF_FINALIZE' OR c.request_id<>proof.id OR c.phase<>'FINALIZE'
     OR proof.submitted_by_id IS DISTINCT FROM c.actor_id OR proof.status::text<>'PENDING'
     OR previous_row->>'status' NOT IN ('IN_PROGRESS','FOR_REVIEW')
     OR next_row->>'status' IS DISTINCT FROM 'FOR_REVIEW'
     OR (next_row->>'progress_percent')::integer IS DISTINCT FROM proof.progress_percent
     OR EXISTS(SELECT 1 FROM pathways.evidence_media e WHERE e.organization_id=org
         AND e.project_id=project AND e.activity_update_id=proof.id
         AND (NOT e.storage_ready OR e.activity_id IS DISTINCT FROM root_id
           OR e.submitted_by_id IS DISTINCT FROM c.actor_id)) THEN
     RAISE EXCEPTION 'Invalid proof finalization' USING ERRCODE='22023';
    END IF;
   ELSE
    IF proof.submitted_by_id=c.actor_id OR proof.reviewed_by_id IS DISTINCT FROM c.actor_id
     OR c.review_action IS NULL
     OR (previous_row->>'status' IS DISTINCT FROM 'FOR_REVIEW' AND NOT (previous_row->>'status'='IN_PROGRESS'
      AND proof.progress_percent<100 AND NOT EXISTS(SELECT 1 FROM pathways.evidence_media e
       WHERE e.organization_id=org AND e.project_id=project AND e.activity_update_id=proof.id)))
     OR (c.review_action='APPROVE' AND (proof.status::text<>'APPROVED' OR next_row->>'status' IS DISTINCT FROM CASE WHEN proof.progress_percent=100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END))
     OR (c.review_action='RETURN' AND (proof.status::text<>'REJECTED' OR next_row->>'status' IS DISTINCT FROM 'IN_PROGRESS')) THEN
     RAISE EXCEPTION 'Invalid proof review' USING ERRCODE='22023';
    END IF;
   END IF;
  END IF;
  meaningful:=TG_OP='INSERT' OR
    (previous_row->'status',previous_row->'planned_start_date',previous_row->'planned_end_date',
     previous_row->'actual_start_date',previous_row->'actual_end_date',previous_row->'archived_at')
    IS DISTINCT FROM
    (next_row->'status',next_row->'planned_start_date',next_row->'planned_end_date',
     next_row->'actual_start_date',next_row->'actual_end_date',next_row->'archived_at');
 ELSIF TG_RELID='pathways.project_indicators'::regclass THEN
  IF cat.source_table<>'project_indicators'
   OR c.operation_code NOT IN ('INDICATOR_CREATE','INDICATOR_UPDATE','INDICATOR_ARCHIVE')
   OR ((c.operation_code='INDICATOR_CREATE') IS DISTINCT FROM (TG_OP='INSERT')) THEN
   RAISE EXCEPTION 'Invalid indicator operation' USING ERRCODE='22023';
  END IF;
  IF TG_OP='INSERT' AND (next_row->>'created_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Indicator creator mismatch' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='INDICATOR_ARCHIVE' AND
    (previous_row->'archived_at'<>'null'::jsonb OR next_row->'archived_at'='null'::jsonb) THEN
   RAISE EXCEPTION 'Invalid indicator archive' USING ERRCODE='22023';
  END IF;
  meaningful:=TG_OP='INSERT' OR before_hash IS DISTINCT FROM after_hash;
 ELSE
  IF cat.source_table<>'project_indicator_measurements' OR c.operation_code<>'INDICATOR_MEASUREMENT'
   OR TG_OP<>'INSERT' OR c.request_kind<>'CLIENT_MEASUREMENT' OR c.phase<>'MEASUREMENT'
   OR (next_row->>'client_measurement_id')::uuid IS DISTINCT FROM c.request_id
   OR (next_row->>'recorded_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Invalid measurement identity' USING ERRCODE='22023';
  END IF;
  -- Existing p06_guard_measurement remains the domain/correction validator.
  -- Only current approved MANUAL metadata can classify the inserted root W_G.
  -- Fingerprint is generated by the fixed begin definition builder; no supplied
  -- eligibility flag or measurement VALUE query enters this proof routine.
  SELECT i.id,i.organization_id,i.project_id,i.revision,i.measurement_mode,
      i.period_start,i.period_end,i.archived_at
   INTO definition.id,definition.organization_id,definition.project_id,definition.revision,
      definition.measurement_mode,definition.period_start,definition.period_end,definition.archived_at
  FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project
   AND i.id=(next_row->>'indicator_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Measurement definition missing' USING ERRCODE='22023'; END IF;
  SELECT EXISTS(
   SELECT 1 FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=org AND e.project_id=project AND e.indicator_id=definition.id
    AND e.id=c.manual_classification_id AND e.definition_revision=definition.revision
    AND definition.revision=c.manual_definition_revision
    AND e.source_fingerprint=c.manual_definition_fingerprint
    AND e.decision='ALLOWED_NON_SENSITIVE' AND e.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    AND e.approved_at<=pg_catalog.clock_timestamp()
    AND (e.expires_at IS NULL OR e.expires_at>pg_catalog.clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.eligibility newer
      WHERE newer.organization_id=e.organization_id AND newer.project_id=e.project_id
       AND newer.indicator_id=e.indicator_id AND newer.classification_revision>e.classification_revision)
  ) INTO eligible;
  meaningful:=eligible AND definition.measurement_mode::text='MANUAL' AND definition.archived_at IS NULL
   AND definition.period_start IS NOT DISTINCT FROM (next_row->>'period_start')::date
   AND definition.period_end IS NOT DISTINCT FROM (next_row->>'period_end')::date
   AND NOT EXISTS(SELECT 1 FROM pathways.project_indicator_bindings b
    WHERE b.organization_id=org AND b.project_id=project AND b.indicator_id=definition.id);
 END IF;
 work:=CASE WHEN meaningful THEN cat.maximum_work ELSE 'NONE' END;
 revision:=CASE WHEN TG_RELID='pathways.project_indicators'::regclass
   THEN next_row->>'revision' WHEN TG_RELID='pathways.project_indicator_measurements'::regclass
   THEN root_id::text ELSE next_row->>'updated_at' END;
 IF revision IS NULL THEN RAISE EXCEPTION 'Missing source revision' USING ERRCODE='22023'; END IF;
 UPDATE pathways_rules_internal.source_operation_context x SET
  source_before_fingerprint=before_hash, source_after_fingerprint=after_hash,
  source_revision=revision, proven_work=work, proof_relation=TG_RELID::regclass::text,
  proof_action=TG_OP, sealed=true WHERE x.handle=c.handle AND NOT x.sealed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source proof already consumed' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
RESET ROLE;
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_source_proof_owner;
RESET ROLE;

-- Postconditions.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb)'::pg_catalog.regprocedure;
 IF pg_catalog.md5(fn.prosrc)<>'f43ddcc77120d4c068c604ddbba96b7b' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_enqueue_owner'
  OR NOT fn.prosecdef OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0044.begin_acl')
 THEN RAISE EXCEPTION '0044 f10_begin_source_operation postcondition failed'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways_rules_internal' AND p.proname='prove_source_root_dml';
 IF pg_catalog.md5(fn.prosrc)<>'24ad351577ffffee2f66ff02dfe26c0a' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'rules_source_proof_owner'
  OR NOT fn.prosecdef OR fn.provolatile<>'v' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0044.prove_acl')
 THEN RAISE EXCEPTION '0044 prove_source_root_dml postcondition failed'; END IF;
 IF pg_catalog.has_schema_privilege('rules_enqueue_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_source_proof_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0044 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
