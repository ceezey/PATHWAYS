-- cr-pathways-indicator-library: organization-scoped library of indicator definition templates.
-- Adds one prisma-owned table with RLS (organization match plus the org-level p09_can check),
-- three permissions granted to System Administrator, Monitoring and Evaluation Officer and Project
-- Manager (the roles that hold indicators.create), and replaces the immutable p09_role_allows
-- ceiling in place with those nine pairs added. Entries hold definition fields only: no project,
-- activity, form, period, baseline, target or measurement data. Using an entry copies its
-- definition into a project indicator through the existing create path; there is no live link.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 -- Predecessor is 0045, not 0050: 0046-0050 are built in parallel on the 0045 state.
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0045_f9_descriptive_aggregates' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regclass('pathways.indicator_library_entries') IS NOT NULL
 OR EXISTS(SELECT FROM pathways.permissions WHERE code LIKE 'indicators.library.%')
 OR (SELECT count(*) FROM pathways.roles WHERE code IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER') AND is_active) <> 3
 OR to_regprocedure('pathways.p09_can(text)') IS NULL
 OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
 OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0051 requires the verified 0045 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

INSERT INTO pathways.permissions(code,name) VALUES
('indicators.library.read','indicators.library.read'),
('indicators.library.create','indicators.library.create'),
('indicators.library.archive','indicators.library.archive');

CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT EXISTS(SELECT FROM (VALUES
('SYSTEM_ADMINISTRATOR','projects.read'),
('SYSTEM_ADMINISTRATOR','activities.read'),
('SYSTEM_ADMINISTRATOR','budgets.read'),
('PROJECT_OFFICER','projects.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.read'),
('PROJECT_MANAGER','projects.read'),
('PROGRAM_MANAGER','projects.read'),
('GRANT_MANAGER','projects.read'),
('PROJECT_MANAGER','projects.create'),
('SYSTEM_ADMINISTRATOR','activities.context.read'),
('PROJECT_OFFICER','activities.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.read'),
('PROJECT_MANAGER','activities.read'),
('PROJECT_OFFICER','activities.create'),
('PROJECT_MANAGER','activities.create'),
('PROJECT_MANAGER','activities.update'),
('PROJECT_OFFICER','activities.proof.submit'),
('PROJECT_MANAGER','activities.proof.submit'),
('SYSTEM_ADMINISTRATOR','journeys.read'),
('PROJECT_OFFICER','journeys.read'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.read'),
('PROJECT_MANAGER','journeys.read'),
('SYSTEM_ADMINISTRATOR','journeys.manage'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.manage'),
('PROJECT_MANAGER','journeys.manage'),
('PROJECT_OFFICER','participation.record'),
('MONITORING_AND_EVALUATION_OFFICER','participation.record'),
('PROJECT_MANAGER','participation.record'),
('PROJECT_MANAGER','budgets.read'),
('PROGRAM_MANAGER','budgets.read'),
('GRANT_MANAGER','budgets.read'),
('PROJECT_MANAGER','budgets.create'),
('PROGRAM_MANAGER','budgets.create'),
('GRANT_MANAGER','budgets.create'),
('PROJECT_MANAGER','budgets.update'),
('PROGRAM_MANAGER','budgets.update'),
('GRANT_MANAGER','budgets.update'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.read'),
('PROJECT_MANAGER','expenses.read'),
('PROGRAM_MANAGER','expenses.read'),
('GRANT_MANAGER','expenses.read'),
('PROJECT_OFFICER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.submit'),
('PROJECT_MANAGER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.verify'),
('PROJECT_MANAGER','expenses.approve'),
('SYSTEM_ADMINISTRATOR','monitoring.read'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.read'),
('PROJECT_MANAGER','monitoring.read'),
('PROGRAM_MANAGER','monitoring.read'),
('GRANT_MANAGER','monitoring.read'),
('SYSTEM_ADMINISTRATOR','monitoring.review'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.review'),
('PROJECT_MANAGER','monitoring.review'),
('PROGRAM_MANAGER','monitoring.review'),
('GRANT_MANAGER','monitoring.review'),
('SYSTEM_ADMINISTRATOR','rules.read'),
('SYSTEM_ADMINISTRATOR','rules.create'),
('SYSTEM_ADMINISTRATOR','rules.update'),
('SYSTEM_ADMINISTRATOR','rules.activate'),
('SYSTEM_ADMINISTRATOR','alerts.read'),
('PROJECT_OFFICER','alerts.read'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.read'),
('PROJECT_MANAGER','alerts.read'),
('PROGRAM_MANAGER','alerts.read'),
('GRANT_MANAGER','alerts.read'),
('SYSTEM_ADMINISTRATOR','alerts.review'),
('PROJECT_OFFICER','alerts.review'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.review'),
('PROJECT_MANAGER','alerts.review'),
('PROGRAM_MANAGER','alerts.review'),
('GRANT_MANAGER','alerts.review'),
('SYSTEM_ADMINISTRATOR','alerts.outcome.record'),
('PROJECT_OFFICER','alerts.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.outcome.record'),
('PROJECT_MANAGER','alerts.outcome.record'),
('PROGRAM_MANAGER','alerts.outcome.record'),
('GRANT_MANAGER','alerts.outcome.record'),
('SYSTEM_ADMINISTRATOR','recommendations.read'),
('PROJECT_OFFICER','recommendations.read'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.read'),
('PROJECT_MANAGER','recommendations.read'),
('PROGRAM_MANAGER','recommendations.read'),
('GRANT_MANAGER','recommendations.read'),
('SYSTEM_ADMINISTRATOR','recommendations.review'),
('PROJECT_OFFICER','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.review'),
('PROJECT_MANAGER','recommendations.review'),
('PROGRAM_MANAGER','recommendations.review'),
('GRANT_MANAGER','recommendations.review'),
('PROJECT_OFFICER','beneficiaries.records.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.read'),
('PROJECT_MANAGER','beneficiaries.records.read'),
('PROJECT_OFFICER','beneficiaries.records.register'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.register'),
('PROJECT_MANAGER','beneficiaries.records.register'),
('PROJECT_OFFICER','beneficiaries.profiles.update'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.profiles.update'),
('PROJECT_MANAGER','beneficiaries.profiles.update'),
('PROJECT_OFFICER','beneficiaries.enrollments.manage'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.enrollments.manage'),
('PROJECT_MANAGER','beneficiaries.enrollments.manage'),
('SYSTEM_ADMINISTRATOR','beneficiaries.aggregates.read'),
('PROJECT_OFFICER','beneficiaries.aggregates.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.aggregates.read'),
('PROJECT_MANAGER','beneficiaries.aggregates.read'),
('PROGRAM_MANAGER','beneficiaries.aggregates.read'),
('GRANT_MANAGER','beneficiaries.aggregates.read'),
('SYSTEM_ADMINISTRATOR','recommendations.outcome.record'),
('PROJECT_OFFICER','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.outcome.record'),
('PROJECT_MANAGER','recommendations.outcome.record'),
('PROGRAM_MANAGER','recommendations.outcome.record'),
('GRANT_MANAGER','recommendations.outcome.record'),
('SYSTEM_ADMINISTRATOR','public.preview'),
('PROJECT_MANAGER','public.preview'),
('PROGRAM_MANAGER','public.preview'),
('GRANT_MANAGER','public.preview'),
('SYSTEM_ADMINISTRATOR','public.publish'),
('PROJECT_MANAGER','public.publish'),
('PROGRAM_MANAGER','public.publish'),
('GRANT_MANAGER','public.publish'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.review'),
('SYSTEM_ADMINISTRATOR','indicators.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.create'),
('PROJECT_MANAGER','indicators.create'),
('SYSTEM_ADMINISTRATOR','indicators.update'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.update'),
('PROJECT_MANAGER','indicators.update'),
('SYSTEM_ADMINISTRATOR','collection.read'),
('PROJECT_OFFICER','collection.read'),
('MONITORING_AND_EVALUATION_OFFICER','collection.read'),
('SYSTEM_ADMINISTRATOR','forms.read'),
('PROJECT_OFFICER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.read'),
('SYSTEM_ADMINISTRATOR','forms.manage'),
('MONITORING_AND_EVALUATION_OFFICER','forms.manage'),
('SYSTEM_ADMINISTRATOR','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','forms.publish'),
('PROJECT_OFFICER','submissions.write'),
('MONITORING_AND_EVALUATION_OFFICER','submissions.write'),
('SYSTEM_ADMINISTRATOR','imports.read'),
('PROJECT_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.read'),
('SYSTEM_ADMINISTRATOR','imports.upload'),
('PROJECT_OFFICER','imports.upload'),
('MONITORING_AND_EVALUATION_OFFICER','imports.upload'),
('SYSTEM_ADMINISTRATOR','imports.review'),
('MONITORING_AND_EVALUATION_OFFICER','imports.review'),
('SYSTEM_ADMINISTRATOR','imports.process'),
('PROJECT_OFFICER','imports.process'),
('MONITORING_AND_EVALUATION_OFFICER','imports.process'),
('SYSTEM_ADMINISTRATOR','analytics.read'),
('PROJECT_OFFICER','analytics.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.read'),
('PROJECT_MANAGER','analytics.read'),
('PROGRAM_MANAGER','analytics.read'),
('GRANT_MANAGER','analytics.read'),
('SYSTEM_ADMINISTRATOR','reports.read'),
('PROJECT_OFFICER','reports.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.read'),
('PROJECT_MANAGER','reports.read'),
('PROGRAM_MANAGER','reports.read'),
('GRANT_MANAGER','reports.read'),
('SYSTEM_ADMINISTRATOR','reports.project.read'),
('PROJECT_OFFICER','reports.project.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.project.read'),
('PROJECT_MANAGER','reports.project.read'),
('PROGRAM_MANAGER','reports.project.read'),
('GRANT_MANAGER','reports.project.read'),
('SYSTEM_ADMINISTRATOR','reports.indicator.read'),
('PROJECT_OFFICER','reports.indicator.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.indicator.read'),
('PROJECT_MANAGER','reports.indicator.read'),
('PROGRAM_MANAGER','reports.indicator.read'),
('GRANT_MANAGER','reports.indicator.read'),
('PROJECT_OFFICER','reports.beneficiary.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.beneficiary.read'),
('PROJECT_MANAGER','reports.beneficiary.read'),
('SYSTEM_ADMINISTRATOR','users.authorize'),
('PROJECT_MANAGER','users.authorize'),
('PROGRAM_MANAGER','users.authorize'),
('SYSTEM_ADMINISTRATOR','assignments.manage'),
('PROJECT_MANAGER','assignments.manage'),
('PROGRAM_MANAGER','assignments.manage'),
('SYSTEM_ADMINISTRATOR','settings.read'),
('PROJECT_OFFICER','settings.read'),
('MONITORING_AND_EVALUATION_OFFICER','settings.read'),
('PROJECT_MANAGER','settings.read'),
('PROGRAM_MANAGER','settings.read'),
('GRANT_MANAGER','settings.read'),
('SYSTEM_ADMINISTRATOR','projects.detail.read'),
('PROJECT_OFFICER','projects.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.detail.read'),
('PROJECT_MANAGER','projects.detail.read'),
('PROGRAM_MANAGER','projects.detail.read'),
('GRANT_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.update'),
('SYSTEM_ADMINISTRATOR','projects.archive'),
('PROJECT_MANAGER','projects.archive'),
('PROGRAM_MANAGER','projects.archive'),
('GRANT_MANAGER','projects.archive'),
('PROJECT_OFFICER','activities.complete'),
('MONITORING_AND_EVALUATION_OFFICER','activities.complete'),
('PROJECT_MANAGER','activities.complete'),
('PROJECT_OFFICER','expenses.evidence.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.evidence.submit'),
('PROJECT_MANAGER','expenses.evidence.submit'),
('SYSTEM_ADMINISTRATOR','indicators.read'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.read'),
('PROJECT_MANAGER','indicators.read'),
('SYSTEM_ADMINISTRATOR','assessments.read'),
('PROJECT_OFFICER','assessments.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.read'),
('PROJECT_MANAGER','assessments.read'),
('PROGRAM_MANAGER','assessments.read'),
('GRANT_MANAGER','assessments.read'),
('SYSTEM_ADMINISTRATOR','public.approve'),
('PROJECT_MANAGER','public.approve'),
('PROGRAM_MANAGER','public.approve'),
('GRANT_MANAGER','public.approve'),
('SYSTEM_ADMINISTRATOR','forms.generate'),
('PROJECT_OFFICER','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.generate'),
('SYSTEM_ADMINISTRATOR','forms.export'),
('MONITORING_AND_EVALUATION_OFFICER','forms.export'),
('SYSTEM_ADMINISTRATOR','forms.import'),
('PROJECT_OFFICER','forms.import'),
('MONITORING_AND_EVALUATION_OFFICER','forms.import'),
('SYSTEM_ADMINISTRATOR','imports.validate'),
('PROJECT_OFFICER','imports.validate'),
('MONITORING_AND_EVALUATION_OFFICER','imports.validate'),
('SYSTEM_ADMINISTRATOR','analytics.export'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.export'),
('PROJECT_MANAGER','analytics.export'),
('PROGRAM_MANAGER','analytics.export'),
('GRANT_MANAGER','analytics.export'),
('SYSTEM_ADMINISTRATOR','reports.generate'),
('PROJECT_OFFICER','reports.generate'),
('MONITORING_AND_EVALUATION_OFFICER','reports.generate'),
('PROJECT_MANAGER','reports.generate'),
('PROGRAM_MANAGER','reports.generate'),
('GRANT_MANAGER','reports.generate'),
('SYSTEM_ADMINISTRATOR','reports.export'),
('PROJECT_OFFICER','reports.export'),
('MONITORING_AND_EVALUATION_OFFICER','reports.export'),
('PROJECT_MANAGER','reports.export'),
('PROGRAM_MANAGER','reports.export'),
('GRANT_MANAGER','reports.export'),
('SYSTEM_ADMINISTRATOR','audit.read'),
('PROJECT_MANAGER','audit.read'),
('PROGRAM_MANAGER','audit.read'),
('SYSTEM_ADMINISTRATOR','settings.configure'),
('SYSTEM_ADMINISTRATOR','backups.create'),
('SYSTEM_ADMINISTRATOR','backups.restore'),
('SYSTEM_ADMINISTRATOR','profile.manage'),
('PROJECT_OFFICER','profile.manage'),
('MONITORING_AND_EVALUATION_OFFICER','profile.manage'),
('PROJECT_MANAGER','profile.manage'),
('PROGRAM_MANAGER','profile.manage'),
('GRANT_MANAGER','profile.manage'),
('PROGRAM_MANAGER','expenses.signoff'),
('GRANT_MANAGER','expenses.signoff'),
('PROJECT_OFFICER','assessments.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.detail.read'),
('PROJECT_MANAGER','assessments.detail.read'),
('PROJECT_OFFICER','activities.progress.update'),
('MONITORING_AND_EVALUATION_OFFICER','activities.progress.update'),
('PROJECT_MANAGER','activities.progress.update'),
('SYSTEM_ADMINISTRATOR','evidence.read'),
('PROJECT_OFFICER','evidence.read'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.read'),
('PROJECT_MANAGER','evidence.read'),
('PROGRAM_MANAGER','evidence.read'),
('GRANT_MANAGER','evidence.read'),
('SYSTEM_ADMINISTRATOR','activities.escalations.read'),
('PROJECT_OFFICER','activities.escalations.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.escalations.read'),
('PROJECT_MANAGER','activities.escalations.read'),
('PROGRAM_MANAGER','activities.escalations.read'),
('GRANT_MANAGER','activities.escalations.read'),
('SYSTEM_ADMINISTRATOR','activities.escalations.raise'),
('PROJECT_OFFICER','activities.escalations.raise'),
('MONITORING_AND_EVALUATION_OFFICER','activities.escalations.raise'),
('PROJECT_MANAGER','activities.escalations.raise'),
('PROGRAM_MANAGER','activities.escalations.raise'),
('GRANT_MANAGER','activities.escalations.raise'),
('SYSTEM_ADMINISTRATOR','forms.templates.import'),
('MONITORING_AND_EVALUATION_OFFICER','forms.templates.import'),
('SYSTEM_ADMINISTRATOR','evaluations.weights.configure'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.weights.configure'),
('SYSTEM_ADMINISTRATOR','dashboards.customize'),
('PROJECT_OFFICER','dashboards.customize'),
('MONITORING_AND_EVALUATION_OFFICER','dashboards.customize'),
('PROJECT_MANAGER','dashboards.customize'),
('PROGRAM_MANAGER','dashboards.customize'),
('GRANT_MANAGER','dashboards.customize'),
('SYSTEM_ADMINISTRATOR','analytics.descriptive.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.descriptive.read'),
('PROJECT_MANAGER','analytics.descriptive.read'),
('PROGRAM_MANAGER','analytics.descriptive.read'),
('GRANT_MANAGER','analytics.descriptive.read'),
('SYSTEM_ADMINISTRATOR','analytics.saddd.read'),
('PROJECT_OFFICER','analytics.saddd.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.saddd.read'),
('PROJECT_MANAGER','analytics.saddd.read'),
('PROGRAM_MANAGER','analytics.saddd.read'),
('SYSTEM_ADMINISTRATOR','indicators.library.read'),
('SYSTEM_ADMINISTRATOR','indicators.library.create'),
('SYSTEM_ADMINISTRATOR','indicators.library.archive'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.library.read'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.library.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.library.archive'),
('PROJECT_MANAGER','indicators.library.read'),
('PROJECT_MANAGER','indicators.library.create'),
('PROJECT_MANAGER','indicators.library.archive'),
('GRANT_MANAGER','analytics.saddd.read')) allowed(role_code,permission_code)
 WHERE allowed.role_code=$1 AND allowed.permission_code=$2)
$matrix$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code LIKE 'indicators.library.%'
WHERE r.code IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE pathways.indicator_library_entries (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 organization_id uuid NOT NULL,
 code text NOT NULL,
 name text NOT NULL,
 description text,
 unit_label text NOT NULL,
 data_source text NOT NULL,
 measurement_mode text NOT NULL,
 numeric_kind text NOT NULL,
 direction text NOT NULL,
 display_precision integer NOT NULL,
 recipe text,
 client_mutation_id uuid NOT NULL,
 created_by_id uuid NOT NULL,
 created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
 archived_at timestamp(3) with time zone,
 CONSTRAINT indicator_library_entries_pkey PRIMARY KEY (id),
 CONSTRAINT indicator_library_entries_client_key UNIQUE (organization_id, client_mutation_id),
 CONSTRAINT indicator_library_entries_code_check CHECK (code ~ '^[A-Z][A-Z0-9_\-]{1,39}$'),
 CONSTRAINT indicator_library_entries_text_check CHECK (
  char_length(btrim(name)) BETWEEN 1 AND 160 AND char_length(btrim(unit_label)) BETWEEN 1 AND 80
  AND char_length(btrim(data_source)) BETWEEN 1 AND 300 AND (description IS NULL OR char_length(description) <= 2000)),
 CONSTRAINT indicator_library_entries_kind_check CHECK (
  measurement_mode IN ('MANUAL','DERIVED')
  AND numeric_kind IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
  AND direction IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','DESCRIPTIVE')
  AND display_precision BETWEEN 0 AND 4 AND (numeric_kind <> 'COUNT' OR display_precision = 0)),
 CONSTRAINT indicator_library_entries_recipe_check CHECK (
  (measurement_mode = 'DERIVED') = (recipe IS NOT NULL)
  AND (recipe IS NULL OR recipe IN ('PARTICIPATION_RECORD_COUNT','DISTINCT_ATTENDING_INDIVIDUALS',
   'ATTENDANCE_RECORDS_PER_INDIVIDUAL','EFFECTIVE_JOURNEY_EVENT_COUNT','ACTIVITY_COMPLETION_PERCENTAGE'))),
 CONSTRAINT indicator_library_entries_organization_fk FOREIGN KEY (organization_id)
  REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT indicator_library_entries_created_by_fk FOREIGN KEY (organization_id, created_by_id)
  REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE pathways.indicator_library_entries OWNER TO prisma;
CREATE UNIQUE INDEX indicator_library_entries_active_code_key
 ON pathways.indicator_library_entries (organization_id, code) WHERE archived_at IS NULL;
CREATE INDEX indicator_library_entries_created_by_idx
 ON pathways.indicator_library_entries (organization_id, created_by_id);

ALTER TABLE pathways.indicator_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.indicator_library_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY p11_indicator_library_select ON pathways.indicator_library_entries FOR SELECT TO pathways_runtime
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.read'));
CREATE POLICY p11_indicator_library_insert ON pathways.indicator_library_entries FOR INSERT TO pathways_runtime
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND created_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND archived_at IS NULL AND pathways.p09_can('indicators.library.create'));
CREATE POLICY p11_indicator_library_archive ON pathways.indicator_library_entries FOR UPDATE TO pathways_runtime
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.archive'))
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p09_can('indicators.library.archive'));

-- No DELETE; archiving is the only update, enforced by a column-level grant.
REVOKE ALL ON pathways.indicator_library_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT ON pathways.indicator_library_entries TO pathways_runtime;
GRANT UPDATE (archived_at) ON pathways.indicator_library_entries TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.permissions p ON p.id=rp.permission_id
  WHERE p.code LIKE 'indicators.library.%')<>9
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','indicators.library.create')
 OR pathways.p09_role_allows('PROJECT_OFFICER','indicators.library.read')
 OR pathways.p09_role_allows('PROGRAM_MANAGER','indicators.library.read')
 OR pathways.p09_role_allows('GRANT_MANAGER','indicators.library.read')
 THEN RAISE EXCEPTION '0051 grant postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.indicator_library_entries'::pg_catalog.regclass)
 OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.indicator_library_entries'::pg_catalog.regclass)<>3
 THEN RAISE EXCEPTION '0051 row level security postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.indicator_library_entries','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.indicator_library_entries','INSERT')
  AND has_column_privilege('pathways_runtime','pathways.indicator_library_entries','archived_at','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.indicator_library_entries','name','UPDATE')
  AND NOT has_table_privilege('pathways_runtime','pathways.indicator_library_entries','DELETE'))
 THEN RAISE EXCEPTION '0051 table privilege postcondition failed'; END IF;
END $$;
COMMIT;
