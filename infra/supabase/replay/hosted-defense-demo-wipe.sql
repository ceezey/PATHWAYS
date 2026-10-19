-- Defense demo wipe for hosted PATHWAYS-devV2: clears all domain data, keeps users and reference data.
-- Run hosted-defense-demo-wipe-dry-run.sql first, in the Supabase SQL editor as postgres, with RULES_DISPATCH_ENABLED=false.
-- Kept: pathways organizations, roles, permissions, role_permissions, system_users, user_step_up_pins, signin_lockouts;
-- pathways_rules_internal source_operation_catalog, calendar_configuration, sweep_cursor (cursor ids reset).
-- audit_logs is cleared and storage.objects is untouched. The list is closed under FKs, so there is no CASCADE.
-- postgres gets temporary role membership in owner roles it lacks; this needs its ADMIN on them. If the grant fails,
-- connect as the owner roles (prisma, report_projection_owner, rules_store_owner) and run the TRUNCATE per owner instead.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$
BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres'
     OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'Run as postgres (BYPASSRLS, non-superuser) in database postgres';
  END IF;
  IF pg_catalog.to_regnamespace('pathways') IS NULL OR pg_catalog.to_regnamespace('pathways_rules_internal') IS NULL THEN
    RAISE EXCEPTION 'pathways schemas missing';
  END IF;
  IF (SELECT count(*) FROM (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor')) k(s,t) WHERE pg_catalog.to_regclass(format('%I.%I',s,t)) IS NOT NULL)<>10 THEN
    RAISE EXCEPTION 'Expected kept tables missing';
  END IF;
  IF to_regclass('pathways.survey_period_releases') IS NULL THEN RAISE EXCEPTION 'Migrations through 0060 not applied'; END IF;
END $$;

-- Temporary membership only in owner roles postgres does not already inherit.
CREATE TEMP TABLE _wipe_grants(role_name name) ON COMMIT DROP;
DO $$
DECLARE r name;
BEGIN
  FOR r IN SELECT DISTINCT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c
           WHERE c.relkind='r' AND c.relnamespace IN ('pathways'::regnamespace,'pathways_rules_internal'::regnamespace)
  LOOP
    IF NOT pg_catalog.pg_has_role('postgres', r, 'USAGE') THEN
      EXECUTE format('GRANT %I TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres', r);
      INSERT INTO _wipe_grants VALUES (r);
    END IF;
  END LOOP;
END $$;

TRUNCATE TABLE
  pathways.activity_extension_requests,
  pathways.activity_indicator_links,
  pathways.activity_journey_stage_mappings,
  pathways.activity_overdue_explanations,
  pathways.activity_updates,
  pathways.alert_rule_conditions,
  pathways.alert_rule_recommendations,
  pathways.alert_rules,
  pathways.assessment_results,
  pathways.audit_logs,
  pathways.beneficiaries,
  pathways.beneficiary_activity_participations,
  pathways.beneficiary_consent_records,
  pathways.beneficiary_identifiers,
  pathways.beneficiary_journey_events,
  pathways.beneficiary_project_enrollments,
  pathways.beneficiary_step_up_grants,
  pathways.budget_expense_entries,
  pathways.data_import_batches,
  pathways.data_import_rows,
  pathways.decision_recommendations,
  pathways.digital_forms,
  pathways.evidence_media,
  pathways.expense_signoffs,
  pathways.form_fields,
  pathways.form_response_values,
  pathways.form_submissions,
  pathways.implementing_partners,
  pathways.indicator_library_entries,
  pathways.journey_stages,
  pathways.metadata_mappings,
  pathways.programs,
  pathways.project_activities,
  pathways.project_activity_assignments,
  pathways.project_budget_records,
  pathways.project_evaluation_criteria,
  pathways.project_evaluation_scores,
  pathways.project_evaluations,
  pathways.project_implementing_partners,
  pathways.project_indicator_bindings,
  pathways.project_indicator_measurements,
  pathways.project_indicators,
  pathways.project_milestones,
  pathways.project_publications,
  pathways.projects,
  pathways.publication_requests,
  pathways.reports,
  pathways.rule_based_alerts,
  pathways.sensitive_aggregate_releases,
  pathways.survey_aggregate_releases,
  pathways.survey_period_releases,
  pathways.user_project_assignments,
  pathways_rules_internal.acknowledgements,
  pathways_rules_internal.alert_reviews,
  pathways_rules_internal.configuration_context,
  pathways_rules_internal.configuration_receipts,
  pathways_rules_internal.decisions,
  pathways_rules_internal.eligibility,
  pathways_rules_internal.episode_cursors,
  pathways_rules_internal.evaluations,
  pathways_rules_internal.feature_operation_context,
  pathways_rules_internal.feature_operation_receipts,
  pathways_rules_internal.jobs,
  pathways_rules_internal.lifecycle_events,
  pathways_rules_internal.notifications,
  pathways_rules_internal.outcome_previews,
  pathways_rules_internal.project_state,
  pathways_rules_internal.projection_context,
  pathways_rules_internal.recommendation_reviews,
  pathways_rules_internal.rule_bindings,
  pathways_rules_internal.runtime_mutation_intents,
  pathways_rules_internal.snapshots,
  pathways_rules_internal.source_operation_context,
  pathways_rules_internal.source_operation_receipts,
  pathways_rules_internal.source_request_abandonments,
  pathways_rules_internal.work_coverage,
  pathways_rules_internal.work_items
  RESTART IDENTITY;

-- Reset the sweep cursor so the scheduler restarts from the first project.
UPDATE pathways_rules_internal.sweep_cursor SET last_organization_id=NULL, last_project_id=NULL, exhausted=false;

-- Abort unless every wiped table is empty, checked while the temporary memberships still apply.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(n.nspname||'.'||c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('pathways','pathways_rules_internal')
    AND (n.nspname,c.relname) NOT IN (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor'))
    AND (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint<>0;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Not empty after wipe: %', bad; END IF;
END $$;

SELECT n.nspname||'.'||c.relname AS table_name, CASE WHEN (n.nspname,c.relname) IN (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor')) THEN 'KEEP' ELSE 'WIPE' END AS action,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS row_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('pathways','pathways_rules_internal')
ORDER BY action, 1;

-- Drop exactly the temporary memberships added above.
DO $$
DECLARE r name;
BEGIN
  FOR r IN SELECT role_name FROM _wipe_grants LOOP
    EXECUTE format('REVOKE %I FROM postgres GRANTED BY postgres', r);
  END LOOP;
END $$;

COMMIT;
