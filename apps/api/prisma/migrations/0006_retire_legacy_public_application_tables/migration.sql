-- Phase 6: optional, destructive retirement of the 15 superseded public
-- application tables. The surrounding operator runbook verifies the exact
-- PATHWAYS-dev target, backup/restore evidence, migration ledger and provider
-- inventories. This transaction independently fails closed on physical drift.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

DO $preflight$
DECLARE
  is_disposable_local boolean := current_database() ~ '^pathways_phase4_phase6_[a-z0-9_]+$'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1');
  target_tables text[] := ARRAY[
    'organizations','roles','permissions','role_permissions','system_users','audit_logs',
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','beneficiary_journey_events',
    'project_budget_records','budget_expense_entries','assessment_results',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'rule_based_alerts','decision_recommendations','evidence_media','reports'
  ];
  legacy_tables text[] := ARRAY[
    'AuditLog','FormMetadata','MetadataField','Participant','ParticipantCard',
    'ParticipantJourney','Program','Project','Report','Role','UploadBatch',
    'UploadRow','UploadRowError','User','UserRole'
  ];
BEGIN
  IF current_user <> 'prisma' OR session_user <> 'prisma' THEN
    RAISE EXCEPTION '0006 requires the approved prisma migration session';
  END IF;
  IF current_database() <> 'postgres' AND NOT coalesce(is_disposable_local,false) THEN
    RAISE EXCEPTION '0006 database is outside the approved live/local boundary';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname='public')
     OR NOT EXISTS (SELECT FROM pg_namespace WHERE nspname='pathways'
                    AND nspowner='prisma'::regrole)
     OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='pgcrypto') THEN
    RAISE EXCEPTION 'Required schemas, ownership or pgcrypto differ';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relname='_prisma_migrations' AND c.relkind='r') <> 1
     OR to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'Expected exactly one public Prisma migration ledger';
  END IF;
  IF ARRAY(
       SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='pathways' AND c.relkind='r' ORDER BY c.relname
     ) IS DISTINCT FROM ARRAY(SELECT name FROM unnest(target_tables) AS names(name) ORDER BY name)
     OR EXISTS (
       SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='pathways' AND c.relkind='r'
         AND (c.relowner<>'prisma'::regrole OR NOT c.relrowsecurity)
     ) THEN
    RAISE EXCEPTION 'Expected exactly the 39 prisma-owned RLS target tables';
  END IF;
  IF ARRAY(
       SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'
       ORDER BY c.relname
     ) IS DISTINCT FROM ARRAY(SELECT name FROM unnest(legacy_tables) AS names(name) ORDER BY name)
     OR EXISTS (
       SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY(legacy_tables)
         AND c.relowner<>'prisma'::regrole
     ) THEN
    RAISE EXCEPTION 'Expected exactly the 15 approved prisma-owned legacy tables';
  END IF;

  IF EXISTS (
       SELECT FROM pg_constraint constraint_row
       JOIN pg_class referenced_table ON referenced_table.oid=constraint_row.confrelid
       JOIN pg_namespace referenced_schema ON referenced_schema.oid=referenced_table.relnamespace
       JOIN pg_class source_table ON source_table.oid=constraint_row.conrelid
       JOIN pg_namespace source_schema ON source_schema.oid=source_table.relnamespace
       WHERE constraint_row.contype='f' AND referenced_schema.nspname='public'
         AND referenced_table.relname=ANY(legacy_tables)
         AND NOT (source_schema.nspname='public' AND source_table.relname=ANY(legacy_tables))
     ) THEN
    RAISE EXCEPTION 'An external foreign key still depends on a legacy table';
  END IF;
  IF EXISTS (
       SELECT FROM pg_depend dependency
       JOIN pg_rewrite rewrite_row ON dependency.classid='pg_rewrite'::regclass
         AND dependency.objid=rewrite_row.oid
       JOIN pg_class dependent_view ON dependent_view.oid=rewrite_row.ev_class
       JOIN pg_class legacy_table ON legacy_table.oid=dependency.refobjid
       JOIN pg_namespace legacy_schema ON legacy_schema.oid=legacy_table.relnamespace
       WHERE legacy_schema.nspname='public' AND legacy_table.relname=ANY(legacy_tables)
         AND dependent_view.relkind IN ('v','m')
     ) THEN
    RAISE EXCEPTION 'A view or materialized view still depends on a legacy table';
  END IF;
  IF EXISTS (
       SELECT FROM pg_inherits inheritance
       JOIN pg_class parent_table ON parent_table.oid=inheritance.inhparent
       JOIN pg_namespace parent_schema ON parent_schema.oid=parent_table.relnamespace
       JOIN pg_class child_table ON child_table.oid=inheritance.inhrelid
       JOIN pg_namespace child_schema ON child_schema.oid=child_table.relnamespace
       WHERE (parent_schema.nspname='public' AND parent_table.relname=ANY(legacy_tables))
          OR (child_schema.nspname='public' AND child_table.relname=ANY(legacy_tables))
     ) THEN
    RAISE EXCEPTION 'A partition or inheritance relationship involves a legacy table';
  END IF;
  IF EXISTS (
       SELECT FROM pg_publication_rel publication_table
       JOIN pg_class legacy_table ON legacy_table.oid=publication_table.prrelid
       JOIN pg_namespace legacy_schema ON legacy_schema.oid=legacy_table.relnamespace
       WHERE legacy_schema.nspname='public' AND legacy_table.relname=ANY(legacy_tables)
     ) THEN
    RAISE EXCEPTION 'A publication explicitly includes a legacy table';
  END IF;
  IF EXISTS (
       SELECT FROM pg_proc routine
       JOIN pg_namespace routine_schema ON routine_schema.oid=routine.pronamespace
       CROSS JOIN LATERAL (SELECT pg_get_functiondef(routine.oid) AS definition) source
       WHERE routine.prokind IN ('f','p')
         AND routine_schema.nspname NOT IN ('pg_catalog','information_schema')
         AND EXISTS (
           SELECT FROM unnest(legacy_tables) AS names(name)
           WHERE position(quote_ident(names.name) IN source.definition)>0
         )
     ) THEN
    RAISE EXCEPTION 'A stored routine body still names a legacy table';
  END IF;
END
$preflight$;

-- One deterministic lock acquisition prevents writes between the empty-table
-- assertions and the drops. The local timeout makes contention fail atomically.
LOCK TABLE
  public."UploadRowError", public."UploadRow", public."UploadBatch",
  public."MetadataField", public."ParticipantCard", public."ParticipantJourney",
  public."Report", public."AuditLog", public."UserRole", public."Project",
  public."FormMetadata", public."Participant", public."Program", public."Role",
  public."User"
IN ACCESS EXCLUSIVE MODE;

DO $empty_tables$
DECLARE
  legacy_table text;
  row_count bigint;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY[
    'AuditLog','FormMetadata','MetadataField','Participant','ParticipantCard',
    'ParticipantJourney','Program','Project','Report','Role','UploadBatch',
    'UploadRow','UploadRowError','User','UserRole'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',legacy_table) INTO row_count;
    IF row_count <> 0 THEN
      RAISE EXCEPTION 'Legacy table % is not empty; retirement aborted',legacy_table;
    END IF;
  END LOOP;
END
$empty_tables$;

DROP TABLE public."UploadRowError" RESTRICT;
DROP TABLE public."UploadRow" RESTRICT;
DROP TABLE public."UploadBatch" RESTRICT;
DROP TABLE public."MetadataField" RESTRICT;
DROP TABLE public."ParticipantCard" RESTRICT;
DROP TABLE public."ParticipantJourney" RESTRICT;
DROP TABLE public."Report" RESTRICT;
DROP TABLE public."AuditLog" RESTRICT;
DROP TABLE public."UserRole" RESTRICT;
DROP TABLE public."Project" RESTRICT;
DROP TABLE public."FormMetadata" RESTRICT;
DROP TABLE public."Participant" RESTRICT;
DROP TABLE public."Program" RESTRICT;
DROP TABLE public."Role" RESTRICT;
DROP TABLE public."User" RESTRICT;

DO $postflight$
DECLARE
  target_tables text[] := ARRAY[
    'organizations','roles','permissions','role_permissions','system_users','audit_logs',
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','beneficiary_journey_events',
    'project_budget_records','budget_expense_entries','assessment_results',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'rule_based_alerts','decision_recommendations','evidence_media','reports'
  ];
  legacy_tables text[] := ARRAY[
    'AuditLog','FormMetadata','MetadataField','Participant','ParticipantCard',
    'ParticipantJourney','Program','Project','Report','Role','UploadBatch',
    'UploadRow','UploadRowError','User','UserRole'
  ];
BEGIN
  IF EXISTS (
       SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=ANY(legacy_tables)
     ) THEN
    RAISE EXCEPTION 'A legacy relation remains after retirement';
  END IF;
  IF ARRAY(
       SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='pathways' AND c.relkind='r' ORDER BY c.relname
     ) IS DISTINCT FROM ARRAY(SELECT name FROM unnest(target_tables) AS names(name) ORDER BY name)
     OR ARRAY(
       SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
     ) IS DISTINCT FROM ARRAY['_prisma_migrations']::text[]
     OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='pgcrypto') THEN
    RAISE EXCEPTION 'Protected target, ledger or extension state changed';
  END IF;
END
$postflight$;

COMMIT;
