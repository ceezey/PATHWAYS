-- Approved CSV RBAC realignment. Preserve 0001-0025 and the public Prisma ledger.
-- No business, Auth, Storage, or historical assignment rows are changed.
BEGIN;
DO $preflight$
BEGIN
  IF current_user <> 'prisma' THEN RAISE EXCEPTION '0026 requires the established prisma identity'; END IF;
  IF to_regprocedure('pathways.p08_activity_beneficiaries_reached(uuid,uuid,uuid[])') IS NULL
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolsuper AND NOT rolbypassrls)
     OR EXISTS (SELECT FROM pathways.roles WHERE code NOT IN ('SYSTEM_ADMINISTRATOR','PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER','PROGRAM_MANAGER','GRANT_MANAGER')) THEN
    RAISE EXCEPTION '0026 prerequisites or canonical roles differ';
  END IF;
END $preflight$;
SELECT pg_advisory_xact_lock(505005,1);
INSERT INTO pathways.roles(code,name) VALUES
('SYSTEM_ADMINISTRATOR','System Administrator'),
('PROJECT_OFFICER','Project Officer'),
('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
('PROJECT_MANAGER','Project Manager'),
('PROGRAM_MANAGER','Program Manager'),
('GRANT_MANAGER','Grant Manager')
ON CONFLICT(code) DO NOTHING;
INSERT INTO pathways.permissions(code,name) VALUES
('forms.archive','forms.archive'),
('indicators.archive','indicators.archive'),
('milestones.manage','milestones.manage'),
('assessments.detail.read','assessments.detail.read'),
('projects.read','projects.read'),
('projects.create','projects.create'),
('activities.read','activities.read'),
('activities.create','activities.create'),
('activities.update','activities.update'),
('activities.proof.submit','activities.proof.submit'),
('journeys.read','journeys.read'),
('journeys.manage','journeys.manage'),
('participation.record','participation.record'),
('budgets.read','budgets.read'),
('budgets.create','budgets.create'),
('budgets.update','budgets.update'),
('expenses.read','expenses.read'),
('expenses.submit','expenses.submit'),
('expenses.verify','expenses.verify'),
('expenses.approve','expenses.approve'),
('monitoring.read','monitoring.read'),
('monitoring.review','monitoring.review'),
('rules.read','rules.read'),
('rules.create','rules.create'),
('rules.update','rules.update'),
('rules.activate','rules.activate'),
('alerts.read','alerts.read'),
('alerts.review','alerts.review'),
('alerts.outcome.record','alerts.outcome.record'),
('recommendations.read','recommendations.read'),
('recommendations.review','recommendations.review'),
('beneficiaries.records.read','beneficiaries.records.read'),
('beneficiaries.records.register','beneficiaries.records.register'),
('beneficiaries.profiles.update','beneficiaries.profiles.update'),
('beneficiaries.enrollments.manage','beneficiaries.enrollments.manage'),
('beneficiaries.identities.review','beneficiaries.identities.review'),
('beneficiaries.records.archive','beneficiaries.records.archive'),
('beneficiaries.aggregates.read','beneficiaries.aggregates.read'),
('recommendations.outcome.record','recommendations.outcome.record'),
('evaluations.submit','evaluations.submit'),
('evaluations.approve','evaluations.approve'),
('public.preview','public.preview'),
('public.publish','public.publish'),
('evidence.review','evidence.review'),
('indicators.create','indicators.create'),
('indicators.update','indicators.update'),
('collection.read','collection.read'),
('forms.read','forms.read'),
('forms.manage','forms.manage'),
('forms.publish','forms.publish'),
('submissions.write','submissions.write'),
('imports.read','imports.read'),
('imports.upload','imports.upload'),
('imports.review','imports.review'),
('imports.process','imports.process'),
('analytics.read','analytics.read'),
('reports.read','reports.read'),
('reports.project.read','reports.project.read'),
('reports.indicator.read','reports.indicator.read'),
('reports.beneficiary.read','reports.beneficiary.read'),
('users.authorize','users.authorize'),
('assignments.manage','assignments.manage'),
('settings.read','settings.read'),
('projects.detail.read','projects.detail.read'),
('projects.update','projects.update'),
('projects.archive','projects.archive'),
('activities.complete','activities.complete'),
('expenses.evidence.submit','expenses.evidence.submit'),
('indicators.read','indicators.read'),
('evaluations.archive','evaluations.archive'),
('evaluations.signoff','evaluations.signoff'),
('assessments.read','assessments.read'),
('public.approve','public.approve'),
('forms.generate','forms.generate'),
('forms.export','forms.export'),
('forms.import','forms.import'),
('imports.validate','imports.validate'),
('analytics.export','analytics.export'),
('reports.generate','reports.generate'),
('reports.export','reports.export'),
('audit.read','audit.read'),
('settings.configure','settings.configure'),
('backups.create','backups.create'),
('backups.restore','backups.restore'),
('profile.manage','profile.manage'),
('expenses.signoff','expenses.signoff'),
('programs.create','programs.create'),
('settings.labels.manage','settings.labels.manage')
ON CONFLICT(code) DO NOTHING;
DO $definitions$
BEGIN
 -- Historical migrations use both human labels and code-shaped names.
 -- Normalize reference labels explicitly below, preserving IDs and history.
 IF EXISTS(SELECT FROM pathways.roles WHERE NOT is_active) OR EXISTS(SELECT FROM pathways.permissions WHERE NOT is_active) THEN
   RAISE EXCEPTION '0026 inactive reference definitions require separate review';
 END IF;
END $definitions$;
UPDATE pathways.permissions SET name=code WHERE name IS DISTINCT FROM code;
UPDATE pathways.roles r SET name=canonical.name FROM (VALUES
 ('SYSTEM_ADMINISTRATOR','System Administrator'),
 ('PROGRAM_MANAGER','Program Manager'),
 ('GRANT_MANAGER','Grant Manager'),
 ('PROJECT_MANAGER','Project Manager'),
 ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
 ('PROJECT_OFFICER','Project Officer')
) canonical(code,name) WHERE r.code=canonical.code AND r.name IS DISTINCT FROM canonical.name;
CREATE TEMP TABLE rbac_expected(role_code text, permission_code text, PRIMARY KEY(role_code,permission_code)) ON COMMIT DROP;
INSERT INTO rbac_expected VALUES
('SYSTEM_ADMINISTRATOR','assessments.detail.read'),
('PROJECT_OFFICER','assessments.detail.read'),
('PROJECT_MANAGER','assessments.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.detail.read'),
('SYSTEM_ADMINISTRATOR','projects.read'),
('PROJECT_OFFICER','projects.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.read'),
('PROJECT_MANAGER','projects.read'),
('PROGRAM_MANAGER','projects.read'),
('GRANT_MANAGER','projects.read'),
('PROJECT_MANAGER','projects.create'),
('SYSTEM_ADMINISTRATOR','activities.read'),
('PROJECT_OFFICER','activities.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.read'),
('PROJECT_MANAGER','activities.read'),
('PROJECT_MANAGER','activities.create'),
('PROJECT_OFFICER','activities.create'),
('PROJECT_MANAGER','activities.update'),
('PROJECT_OFFICER','activities.update'),
('PROJECT_MANAGER','activities.proof.submit'),
('PROJECT_OFFICER','activities.proof.submit'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.read'),
('PROJECT_MANAGER','journeys.read'),
('PROJECT_OFFICER','journeys.read'),
('MONITORING_AND_EVALUATION_OFFICER','participation.record'),
('PROJECT_MANAGER','participation.record'),
('PROJECT_OFFICER','participation.record'),
('GRANT_MANAGER','budgets.read'),
('MONITORING_AND_EVALUATION_OFFICER','budgets.read'),
('PROGRAM_MANAGER','budgets.read'),
('PROJECT_MANAGER','budgets.read'),
('SYSTEM_ADMINISTRATOR','budgets.read'),
('GRANT_MANAGER','budgets.create'),
('PROGRAM_MANAGER','budgets.create'),
('PROJECT_MANAGER','budgets.create'),
('GRANT_MANAGER','budgets.update'),
('PROGRAM_MANAGER','budgets.update'),
('PROJECT_MANAGER','budgets.update'),
('GRANT_MANAGER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.read'),
('PROGRAM_MANAGER','expenses.read'),
('PROJECT_MANAGER','expenses.read'),
('PROJECT_OFFICER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.submit'),
('PROJECT_MANAGER','expenses.submit'),
('PROJECT_OFFICER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.verify'),
('PROJECT_MANAGER','expenses.approve'),
('GRANT_MANAGER','monitoring.read'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.read'),
('PROGRAM_MANAGER','monitoring.read'),
('PROJECT_MANAGER','monitoring.read'),
('SYSTEM_ADMINISTRATOR','monitoring.read'),
('GRANT_MANAGER','monitoring.review'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.review'),
('PROGRAM_MANAGER','monitoring.review'),
('PROJECT_MANAGER','monitoring.review'),
('SYSTEM_ADMINISTRATOR','monitoring.review'),
('SYSTEM_ADMINISTRATOR','rules.read'),
('SYSTEM_ADMINISTRATOR','rules.create'),
('SYSTEM_ADMINISTRATOR','rules.update'),
('SYSTEM_ADMINISTRATOR','rules.activate'),
('GRANT_MANAGER','alerts.read'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.read'),
('PROGRAM_MANAGER','alerts.read'),
('PROJECT_MANAGER','alerts.read'),
('SYSTEM_ADMINISTRATOR','alerts.read'),
('GRANT_MANAGER','alerts.review'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.review'),
('PROGRAM_MANAGER','alerts.review'),
('PROJECT_MANAGER','alerts.review'),
('SYSTEM_ADMINISTRATOR','alerts.review'),
('GRANT_MANAGER','alerts.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.outcome.record'),
('PROGRAM_MANAGER','alerts.outcome.record'),
('PROJECT_MANAGER','alerts.outcome.record'),
('SYSTEM_ADMINISTRATOR','alerts.outcome.record'),
('GRANT_MANAGER','recommendations.read'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.read'),
('PROGRAM_MANAGER','recommendations.read'),
('PROJECT_MANAGER','recommendations.read'),
('SYSTEM_ADMINISTRATOR','recommendations.read'),
('GRANT_MANAGER','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.review'),
('PROGRAM_MANAGER','recommendations.review'),
('PROJECT_MANAGER','recommendations.review'),
('SYSTEM_ADMINISTRATOR','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.read'),
('PROJECT_MANAGER','beneficiaries.records.read'),
('PROJECT_OFFICER','beneficiaries.records.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.register'),
('PROJECT_MANAGER','beneficiaries.records.register'),
('PROJECT_OFFICER','beneficiaries.records.register'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.profiles.update'),
('PROJECT_MANAGER','beneficiaries.profiles.update'),
('PROJECT_OFFICER','beneficiaries.profiles.update'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.enrollments.manage'),
('PROJECT_OFFICER','beneficiaries.enrollments.manage'),
('SYSTEM_ADMINISTRATOR','beneficiaries.enrollments.manage'),
('GRANT_MANAGER','beneficiaries.aggregates.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.aggregates.read'),
('PROGRAM_MANAGER','beneficiaries.aggregates.read'),
('PROJECT_MANAGER','beneficiaries.aggregates.read'),
('SYSTEM_ADMINISTRATOR','beneficiaries.aggregates.read'),
('GRANT_MANAGER','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.outcome.record'),
('PROGRAM_MANAGER','recommendations.outcome.record'),
('PROJECT_MANAGER','recommendations.outcome.record'),
('SYSTEM_ADMINISTRATOR','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.submit'),
('PROJECT_MANAGER','evaluations.approve'),
('GRANT_MANAGER','public.preview'),
('PROGRAM_MANAGER','public.preview'),
('PROJECT_MANAGER','public.preview'),
('SYSTEM_ADMINISTRATOR','public.preview'),
('GRANT_MANAGER','public.publish'),
('PROGRAM_MANAGER','public.publish'),
('PROJECT_MANAGER','public.publish'),
('SYSTEM_ADMINISTRATOR','public.publish'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.review'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.create'),
('PROJECT_MANAGER','indicators.create'),
('SYSTEM_ADMINISTRATOR','indicators.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.update'),
('PROJECT_MANAGER','indicators.update'),
('SYSTEM_ADMINISTRATOR','indicators.update'),
('SYSTEM_ADMINISTRATOR','collection.read'),
('PROJECT_OFFICER','collection.read'),
('MONITORING_AND_EVALUATION_OFFICER','collection.read'),
('PROGRAM_MANAGER','forms.read'),
('GRANT_MANAGER','forms.read'),
('SYSTEM_ADMINISTRATOR','forms.read'),
('PROJECT_OFFICER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.read'),
('PROJECT_MANAGER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','submissions.write'),
('PROJECT_OFFICER','submissions.write'),
('SYSTEM_ADMINISTRATOR','imports.read'),
('PROJECT_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.upload'),
('PROJECT_OFFICER','imports.upload'),
('SYSTEM_ADMINISTRATOR','imports.upload'),
('MONITORING_AND_EVALUATION_OFFICER','imports.review'),
('SYSTEM_ADMINISTRATOR','imports.review'),
('PROJECT_OFFICER','imports.process'),
('SYSTEM_ADMINISTRATOR','imports.process'),
('MONITORING_AND_EVALUATION_OFFICER','imports.process'),
('GRANT_MANAGER','analytics.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.read'),
('PROGRAM_MANAGER','analytics.read'),
('PROJECT_MANAGER','analytics.read'),
('SYSTEM_ADMINISTRATOR','analytics.read'),
('GRANT_MANAGER','reports.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.read'),
('PROGRAM_MANAGER','reports.read'),
('PROJECT_MANAGER','reports.read'),
('PROJECT_OFFICER','reports.read'),
('SYSTEM_ADMINISTRATOR','reports.read'),
('GRANT_MANAGER','reports.project.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.project.read'),
('PROGRAM_MANAGER','reports.project.read'),
('PROJECT_MANAGER','reports.project.read'),
('PROJECT_OFFICER','reports.project.read'),
('SYSTEM_ADMINISTRATOR','reports.project.read'),
('GRANT_MANAGER','reports.indicator.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.indicator.read'),
('PROGRAM_MANAGER','reports.indicator.read'),
('PROJECT_MANAGER','reports.indicator.read'),
('PROJECT_OFFICER','reports.indicator.read'),
('SYSTEM_ADMINISTRATOR','reports.indicator.read'),
('PROJECT_OFFICER','reports.beneficiary.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.beneficiary.read'),
('PROJECT_MANAGER','reports.beneficiary.read'),
('PROGRAM_MANAGER','users.authorize'),
('PROJECT_MANAGER','users.authorize'),
('SYSTEM_ADMINISTRATOR','users.authorize'),
('PROGRAM_MANAGER','assignments.manage'),
('PROJECT_MANAGER','assignments.manage'),
('SYSTEM_ADMINISTRATOR','assignments.manage'),
('SYSTEM_ADMINISTRATOR','settings.read'),
('PROJECT_OFFICER','settings.read'),
('MONITORING_AND_EVALUATION_OFFICER','settings.read'),
('PROJECT_MANAGER','settings.read'),
('PROGRAM_MANAGER','settings.read'),
('GRANT_MANAGER','settings.read'),
('GRANT_MANAGER','projects.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.detail.read'),
('PROGRAM_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.update'),
('GRANT_MANAGER','projects.archive'),
('PROGRAM_MANAGER','projects.archive'),
('PROJECT_MANAGER','projects.archive'),
('SYSTEM_ADMINISTRATOR','projects.archive'),
('MONITORING_AND_EVALUATION_OFFICER','activities.complete'),
('PROJECT_MANAGER','activities.complete'),
('PROJECT_OFFICER','activities.complete'),
('SYSTEM_ADMINISTRATOR','activities.complete'),
('PROJECT_OFFICER','expenses.evidence.submit'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.read'),
('PROJECT_MANAGER','indicators.read'),
('SYSTEM_ADMINISTRATOR','indicators.read'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.archive'),
('GRANT_MANAGER','evaluations.signoff'),
('PROGRAM_MANAGER','evaluations.signoff'),
('GRANT_MANAGER','assessments.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.read'),
('PROGRAM_MANAGER','assessments.read'),
('PROJECT_MANAGER','assessments.read'),
('PROJECT_OFFICER','assessments.read'),
('SYSTEM_ADMINISTRATOR','assessments.read'),
('GRANT_MANAGER','public.approve'),
('PROGRAM_MANAGER','public.approve'),
('PROJECT_MANAGER','public.approve'),
('SYSTEM_ADMINISTRATOR','public.approve'),
('GRANT_MANAGER','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.generate'),
('PROGRAM_MANAGER','forms.generate'),
('PROJECT_MANAGER','forms.generate'),
('PROJECT_OFFICER','forms.generate'),
('SYSTEM_ADMINISTRATOR','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.export'),
('PROJECT_OFFICER','forms.export'),
('MONITORING_AND_EVALUATION_OFFICER','forms.import'),
('PROJECT_OFFICER','forms.import'),
('MONITORING_AND_EVALUATION_OFFICER','imports.validate'),
('PROJECT_OFFICER','imports.validate'),
('SYSTEM_ADMINISTRATOR','imports.validate'),
('GRANT_MANAGER','analytics.export'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.export'),
('PROGRAM_MANAGER','analytics.export'),
('PROJECT_MANAGER','analytics.export'),
('SYSTEM_ADMINISTRATOR','analytics.export'),
('GRANT_MANAGER','reports.generate'),
('MONITORING_AND_EVALUATION_OFFICER','reports.generate'),
('PROGRAM_MANAGER','reports.generate'),
('PROJECT_MANAGER','reports.generate'),
('PROJECT_OFFICER','reports.generate'),
('SYSTEM_ADMINISTRATOR','reports.generate'),
('GRANT_MANAGER','reports.export'),
('MONITORING_AND_EVALUATION_OFFICER','reports.export'),
('PROGRAM_MANAGER','reports.export'),
('PROJECT_MANAGER','reports.export'),
('PROJECT_OFFICER','reports.export'),
('SYSTEM_ADMINISTRATOR','reports.export'),
('PROGRAM_MANAGER','audit.read'),
('PROJECT_MANAGER','audit.read'),
('SYSTEM_ADMINISTRATOR','audit.read'),
('SYSTEM_ADMINISTRATOR','settings.configure'),
('SYSTEM_ADMINISTRATOR','backups.create'),
('SYSTEM_ADMINISTRATOR','backups.restore'),
('GRANT_MANAGER','profile.manage'),
('MONITORING_AND_EVALUATION_OFFICER','profile.manage'),
('PROGRAM_MANAGER','profile.manage'),
('PROJECT_MANAGER','profile.manage'),
('PROJECT_OFFICER','profile.manage'),
('SYSTEM_ADMINISTRATOR','profile.manage'),
('PROGRAM_MANAGER','expenses.signoff'),
('GRANT_MANAGER','expenses.signoff');
DELETE FROM pathways.role_permissions rp USING pathways.roles r,pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id
  AND NOT EXISTS(SELECT FROM rbac_expected e WHERE e.role_code=r.code AND e.permission_code=p.code);
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM rbac_expected e JOIN pathways.roles r ON r.code=e.role_code JOIN pathways.permissions p ON p.code=e.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT EXISTS(SELECT FROM (VALUES
('SYSTEM_ADMINISTRATOR','assessments.detail.read'),
('PROJECT_OFFICER','assessments.detail.read'),
('PROJECT_MANAGER','assessments.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.detail.read'),
('SYSTEM_ADMINISTRATOR','projects.read'),
('PROJECT_OFFICER','projects.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.read'),
('PROJECT_MANAGER','projects.read'),
('PROGRAM_MANAGER','projects.read'),
('GRANT_MANAGER','projects.read'),
('PROJECT_MANAGER','projects.create'),
('SYSTEM_ADMINISTRATOR','activities.read'),
('PROJECT_OFFICER','activities.read'),
('MONITORING_AND_EVALUATION_OFFICER','activities.read'),
('PROJECT_MANAGER','activities.read'),
('PROJECT_MANAGER','activities.create'),
('PROJECT_OFFICER','activities.create'),
('PROJECT_MANAGER','activities.update'),
('PROJECT_OFFICER','activities.update'),
('PROJECT_MANAGER','activities.proof.submit'),
('PROJECT_OFFICER','activities.proof.submit'),
('MONITORING_AND_EVALUATION_OFFICER','journeys.read'),
('PROJECT_MANAGER','journeys.read'),
('PROJECT_OFFICER','journeys.read'),
('MONITORING_AND_EVALUATION_OFFICER','participation.record'),
('PROJECT_MANAGER','participation.record'),
('PROJECT_OFFICER','participation.record'),
('GRANT_MANAGER','budgets.read'),
('MONITORING_AND_EVALUATION_OFFICER','budgets.read'),
('PROGRAM_MANAGER','budgets.read'),
('PROJECT_MANAGER','budgets.read'),
('SYSTEM_ADMINISTRATOR','budgets.read'),
('GRANT_MANAGER','budgets.create'),
('PROGRAM_MANAGER','budgets.create'),
('PROJECT_MANAGER','budgets.create'),
('GRANT_MANAGER','budgets.update'),
('PROGRAM_MANAGER','budgets.update'),
('PROJECT_MANAGER','budgets.update'),
('GRANT_MANAGER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.read'),
('PROGRAM_MANAGER','expenses.read'),
('PROJECT_MANAGER','expenses.read'),
('PROJECT_OFFICER','expenses.read'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.submit'),
('PROJECT_MANAGER','expenses.submit'),
('PROJECT_OFFICER','expenses.submit'),
('MONITORING_AND_EVALUATION_OFFICER','expenses.verify'),
('PROJECT_MANAGER','expenses.approve'),
('GRANT_MANAGER','monitoring.read'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.read'),
('PROGRAM_MANAGER','monitoring.read'),
('PROJECT_MANAGER','monitoring.read'),
('SYSTEM_ADMINISTRATOR','monitoring.read'),
('GRANT_MANAGER','monitoring.review'),
('MONITORING_AND_EVALUATION_OFFICER','monitoring.review'),
('PROGRAM_MANAGER','monitoring.review'),
('PROJECT_MANAGER','monitoring.review'),
('SYSTEM_ADMINISTRATOR','monitoring.review'),
('SYSTEM_ADMINISTRATOR','rules.read'),
('SYSTEM_ADMINISTRATOR','rules.create'),
('SYSTEM_ADMINISTRATOR','rules.update'),
('SYSTEM_ADMINISTRATOR','rules.activate'),
('GRANT_MANAGER','alerts.read'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.read'),
('PROGRAM_MANAGER','alerts.read'),
('PROJECT_MANAGER','alerts.read'),
('SYSTEM_ADMINISTRATOR','alerts.read'),
('GRANT_MANAGER','alerts.review'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.review'),
('PROGRAM_MANAGER','alerts.review'),
('PROJECT_MANAGER','alerts.review'),
('SYSTEM_ADMINISTRATOR','alerts.review'),
('GRANT_MANAGER','alerts.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','alerts.outcome.record'),
('PROGRAM_MANAGER','alerts.outcome.record'),
('PROJECT_MANAGER','alerts.outcome.record'),
('SYSTEM_ADMINISTRATOR','alerts.outcome.record'),
('GRANT_MANAGER','recommendations.read'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.read'),
('PROGRAM_MANAGER','recommendations.read'),
('PROJECT_MANAGER','recommendations.read'),
('SYSTEM_ADMINISTRATOR','recommendations.read'),
('GRANT_MANAGER','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.review'),
('PROGRAM_MANAGER','recommendations.review'),
('PROJECT_MANAGER','recommendations.review'),
('SYSTEM_ADMINISTRATOR','recommendations.review'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.read'),
('PROJECT_MANAGER','beneficiaries.records.read'),
('PROJECT_OFFICER','beneficiaries.records.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.records.register'),
('PROJECT_MANAGER','beneficiaries.records.register'),
('PROJECT_OFFICER','beneficiaries.records.register'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.profiles.update'),
('PROJECT_MANAGER','beneficiaries.profiles.update'),
('PROJECT_OFFICER','beneficiaries.profiles.update'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.enrollments.manage'),
('PROJECT_OFFICER','beneficiaries.enrollments.manage'),
('SYSTEM_ADMINISTRATOR','beneficiaries.enrollments.manage'),
('GRANT_MANAGER','beneficiaries.aggregates.read'),
('MONITORING_AND_EVALUATION_OFFICER','beneficiaries.aggregates.read'),
('PROGRAM_MANAGER','beneficiaries.aggregates.read'),
('PROJECT_MANAGER','beneficiaries.aggregates.read'),
('SYSTEM_ADMINISTRATOR','beneficiaries.aggregates.read'),
('GRANT_MANAGER','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','recommendations.outcome.record'),
('PROGRAM_MANAGER','recommendations.outcome.record'),
('PROJECT_MANAGER','recommendations.outcome.record'),
('SYSTEM_ADMINISTRATOR','recommendations.outcome.record'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.submit'),
('PROJECT_MANAGER','evaluations.approve'),
('GRANT_MANAGER','public.preview'),
('PROGRAM_MANAGER','public.preview'),
('PROJECT_MANAGER','public.preview'),
('SYSTEM_ADMINISTRATOR','public.preview'),
('GRANT_MANAGER','public.publish'),
('PROGRAM_MANAGER','public.publish'),
('PROJECT_MANAGER','public.publish'),
('SYSTEM_ADMINISTRATOR','public.publish'),
('MONITORING_AND_EVALUATION_OFFICER','evidence.review'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.create'),
('PROJECT_MANAGER','indicators.create'),
('SYSTEM_ADMINISTRATOR','indicators.create'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.update'),
('PROJECT_MANAGER','indicators.update'),
('SYSTEM_ADMINISTRATOR','indicators.update'),
('SYSTEM_ADMINISTRATOR','collection.read'),
('PROJECT_OFFICER','collection.read'),
('MONITORING_AND_EVALUATION_OFFICER','collection.read'),
('PROGRAM_MANAGER','forms.read'),
('GRANT_MANAGER','forms.read'),
('SYSTEM_ADMINISTRATOR','forms.read'),
('PROJECT_OFFICER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.read'),
('PROJECT_MANAGER','forms.read'),
('MONITORING_AND_EVALUATION_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.manage'),
('PROJECT_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','forms.publish'),
('MONITORING_AND_EVALUATION_OFFICER','submissions.write'),
('PROJECT_OFFICER','submissions.write'),
('SYSTEM_ADMINISTRATOR','imports.read'),
('PROJECT_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.read'),
('MONITORING_AND_EVALUATION_OFFICER','imports.upload'),
('PROJECT_OFFICER','imports.upload'),
('SYSTEM_ADMINISTRATOR','imports.upload'),
('MONITORING_AND_EVALUATION_OFFICER','imports.review'),
('SYSTEM_ADMINISTRATOR','imports.review'),
('PROJECT_OFFICER','imports.process'),
('SYSTEM_ADMINISTRATOR','imports.process'),
('MONITORING_AND_EVALUATION_OFFICER','imports.process'),
('GRANT_MANAGER','analytics.read'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.read'),
('PROGRAM_MANAGER','analytics.read'),
('PROJECT_MANAGER','analytics.read'),
('SYSTEM_ADMINISTRATOR','analytics.read'),
('GRANT_MANAGER','reports.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.read'),
('PROGRAM_MANAGER','reports.read'),
('PROJECT_MANAGER','reports.read'),
('PROJECT_OFFICER','reports.read'),
('SYSTEM_ADMINISTRATOR','reports.read'),
('GRANT_MANAGER','reports.project.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.project.read'),
('PROGRAM_MANAGER','reports.project.read'),
('PROJECT_MANAGER','reports.project.read'),
('PROJECT_OFFICER','reports.project.read'),
('SYSTEM_ADMINISTRATOR','reports.project.read'),
('GRANT_MANAGER','reports.indicator.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.indicator.read'),
('PROGRAM_MANAGER','reports.indicator.read'),
('PROJECT_MANAGER','reports.indicator.read'),
('PROJECT_OFFICER','reports.indicator.read'),
('SYSTEM_ADMINISTRATOR','reports.indicator.read'),
('PROJECT_OFFICER','reports.beneficiary.read'),
('MONITORING_AND_EVALUATION_OFFICER','reports.beneficiary.read'),
('PROJECT_MANAGER','reports.beneficiary.read'),
('PROGRAM_MANAGER','users.authorize'),
('PROJECT_MANAGER','users.authorize'),
('SYSTEM_ADMINISTRATOR','users.authorize'),
('PROGRAM_MANAGER','assignments.manage'),
('PROJECT_MANAGER','assignments.manage'),
('SYSTEM_ADMINISTRATOR','assignments.manage'),
('SYSTEM_ADMINISTRATOR','settings.read'),
('PROJECT_OFFICER','settings.read'),
('MONITORING_AND_EVALUATION_OFFICER','settings.read'),
('PROJECT_MANAGER','settings.read'),
('PROGRAM_MANAGER','settings.read'),
('GRANT_MANAGER','settings.read'),
('GRANT_MANAGER','projects.detail.read'),
('MONITORING_AND_EVALUATION_OFFICER','projects.detail.read'),
('PROGRAM_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.detail.read'),
('PROJECT_MANAGER','projects.update'),
('GRANT_MANAGER','projects.archive'),
('PROGRAM_MANAGER','projects.archive'),
('PROJECT_MANAGER','projects.archive'),
('SYSTEM_ADMINISTRATOR','projects.archive'),
('MONITORING_AND_EVALUATION_OFFICER','activities.complete'),
('PROJECT_MANAGER','activities.complete'),
('PROJECT_OFFICER','activities.complete'),
('SYSTEM_ADMINISTRATOR','activities.complete'),
('PROJECT_OFFICER','expenses.evidence.submit'),
('MONITORING_AND_EVALUATION_OFFICER','indicators.read'),
('PROJECT_MANAGER','indicators.read'),
('SYSTEM_ADMINISTRATOR','indicators.read'),
('MONITORING_AND_EVALUATION_OFFICER','evaluations.archive'),
('GRANT_MANAGER','evaluations.signoff'),
('PROGRAM_MANAGER','evaluations.signoff'),
('GRANT_MANAGER','assessments.read'),
('MONITORING_AND_EVALUATION_OFFICER','assessments.read'),
('PROGRAM_MANAGER','assessments.read'),
('PROJECT_MANAGER','assessments.read'),
('PROJECT_OFFICER','assessments.read'),
('SYSTEM_ADMINISTRATOR','assessments.read'),
('GRANT_MANAGER','public.approve'),
('PROGRAM_MANAGER','public.approve'),
('PROJECT_MANAGER','public.approve'),
('SYSTEM_ADMINISTRATOR','public.approve'),
('GRANT_MANAGER','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.generate'),
('PROGRAM_MANAGER','forms.generate'),
('PROJECT_MANAGER','forms.generate'),
('PROJECT_OFFICER','forms.generate'),
('SYSTEM_ADMINISTRATOR','forms.generate'),
('MONITORING_AND_EVALUATION_OFFICER','forms.export'),
('PROJECT_OFFICER','forms.export'),
('MONITORING_AND_EVALUATION_OFFICER','forms.import'),
('PROJECT_OFFICER','forms.import'),
('MONITORING_AND_EVALUATION_OFFICER','imports.validate'),
('PROJECT_OFFICER','imports.validate'),
('SYSTEM_ADMINISTRATOR','imports.validate'),
('GRANT_MANAGER','analytics.export'),
('MONITORING_AND_EVALUATION_OFFICER','analytics.export'),
('PROGRAM_MANAGER','analytics.export'),
('PROJECT_MANAGER','analytics.export'),
('SYSTEM_ADMINISTRATOR','analytics.export'),
('GRANT_MANAGER','reports.generate'),
('MONITORING_AND_EVALUATION_OFFICER','reports.generate'),
('PROGRAM_MANAGER','reports.generate'),
('PROJECT_MANAGER','reports.generate'),
('PROJECT_OFFICER','reports.generate'),
('SYSTEM_ADMINISTRATOR','reports.generate'),
('GRANT_MANAGER','reports.export'),
('MONITORING_AND_EVALUATION_OFFICER','reports.export'),
('PROGRAM_MANAGER','reports.export'),
('PROJECT_MANAGER','reports.export'),
('PROJECT_OFFICER','reports.export'),
('SYSTEM_ADMINISTRATOR','reports.export'),
('PROGRAM_MANAGER','audit.read'),
('PROJECT_MANAGER','audit.read'),
('SYSTEM_ADMINISTRATOR','audit.read'),
('SYSTEM_ADMINISTRATOR','settings.configure'),
('SYSTEM_ADMINISTRATOR','backups.create'),
('SYSTEM_ADMINISTRATOR','backups.restore'),
('GRANT_MANAGER','profile.manage'),
('MONITORING_AND_EVALUATION_OFFICER','profile.manage'),
('PROGRAM_MANAGER','profile.manage'),
('PROJECT_MANAGER','profile.manage'),
('PROJECT_OFFICER','profile.manage'),
('SYSTEM_ADMINISTRATOR','profile.manage'),
('PROGRAM_MANAGER','expenses.signoff'),
('GRANT_MANAGER','expenses.signoff')) allowed(role_code,permission_code)
 WHERE allowed.role_code=$1 AND allowed.permission_code=$2)
$matrix$;
REVOKE ALL ON FUNCTION pathways.p09_role_allows(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p09_role_allows(text,text) TO pathways_runtime;

CREATE FUNCTION pathways.p09_can(wanted_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $can$
 SELECT EXISTS(SELECT FROM pathways.system_users u
 JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
 JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
 JOIN pathways.role_permissions rp ON rp.role_id=r.id
 JOIN pathways.permissions p ON p.id=rp.permission_id AND p.is_active AND p.code=wanted_permission AND pathways.p09_role_allows(r.code,wanted_permission)
 WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
 AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
 AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 AND u.account_status='ACTIVE' AND u.archived_at IS NULL)
$can$;
CREATE OR REPLACE FUNCTION pathways.p05_has_project_permission(
  requested_permission text, requested_project uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $permission$
  SELECT COALESCE((
    SELECT true
    FROM pathways.system_users u
    JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
    JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
    JOIN pathways.role_permissions rp ON rp.role_id=r.id
    JOIN pathways.permissions p ON p.id=rp.permission_id AND p.code=requested_permission AND p.is_active AND pathways.p09_role_allows(r.code,requested_permission)
    JOIN pathways.projects pr ON pr.organization_id=u.organization_id
      AND pr.id=requested_project AND pr.archived_at IS NULL
    WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid
      AND u.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid
      AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      AND u.account_status='ACTIVE' AND u.archived_at IS NULL
      AND (
        r.code='SYSTEM_ADMINISTRATOR'
        OR EXISTS (
          SELECT FROM pathways.user_project_assignments a
          WHERE a.organization_id=u.organization_id AND a.user_id=u.id
            AND a.project_id=requested_project AND a.status='ACTIVE' AND a.ended_at IS NULL
        )
        OR (r.code='PROGRAM_MANAGER' AND EXISTS (
          SELECT FROM pathways.programs pg
          WHERE pg.organization_id=u.organization_id AND pg.id=pr.program_id
            AND pg.manager_user_id=u.id AND pg.archived_at IS NULL
        ))
      )
    LIMIT 1
  ),false)
$permission$;
CREATE OR REPLACE FUNCTION pathways.p04_has_project_permission(requested_permission text, requested_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways.p05_has_project_permission(requested_permission,requested_project)
$$;

CREATE OR REPLACE FUNCTION pathways.p06_can(requested_permission text,requested_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways.p05_has_project_permission(requested_permission,requested_project)
$$;

-- Enrollment supporting lookup is encapsulated: it never returns a beneficiary profile.
CREATE OR REPLACE FUNCTION pathways.p04_can_insert_enrollment(requested_project uuid,requested_beneficiary uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM pathways.beneficiaries b
 WHERE b.id=requested_beneficiary AND b.organization_id=nullif(current_setting('app.organization_id',true),'')::uuid AND b.archived_at IS NULL
 AND ((pathways.p05_has_project_permission('beneficiaries.enrollments.manage',requested_project)
   AND (EXISTS(SELECT FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id WHERE u.id=nullif(current_setting('app.user_id',true),'')::uuid AND r.code='SYSTEM_ADMINISTRATOR')
        OR EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=b.organization_id AND e.beneficiary_id=b.id AND pathways.p05_has_project_permission('beneficiaries.enrollments.manage',e.project_id))))
  OR (pathways.p05_has_project_permission('beneficiaries.records.register',requested_project)
      AND b.created_by_id=nullif(current_setting('app.user_id',true),'')::uuid
      AND NOT EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=b.organization_id AND e.beneficiary_id=b.id))))
$$;
CREATE FUNCTION pathways.p09_enroll(wanted_project uuid,wanted_beneficiary uuid,enrolled_on date)
RETURNS TABLE(id uuid,enrollment_date date,status pathways.enrollment_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $enroll$
DECLARE actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid;
 org uuid:=nullif(current_setting('app.organization_id',true),'')::uuid;
BEGIN
 IF NOT pathways.p05_has_project_permission('beneficiaries.enrollments.manage',wanted_project)
 OR enrolled_on IS NULL OR enrolled_on>CURRENT_DATE
 OR NOT EXISTS(SELECT FROM pathways.beneficiaries b WHERE b.id=wanted_beneficiary AND b.organization_id=org AND b.archived_at IS NULL)
 OR NOT (EXISTS(SELECT FROM pathways.system_users u JOIN pathways.roles r ON r.id=u.role_id WHERE u.id=actor AND r.code='SYSTEM_ADMINISTRATOR')
 OR EXISTS(SELECT FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=org AND e.beneficiary_id=wanted_beneficiary
 AND pathways.p05_has_project_permission('beneficiaries.enrollments.manage',e.project_id))) THEN
   RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO pathways.beneficiary_project_enrollments AS e(organization_id,project_id,beneficiary_id,enrollment_date,recorded_by_id)
 VALUES(org,wanted_project,wanted_beneficiary,enrolled_on,actor)
 ON CONFLICT(organization_id,project_id,beneficiary_id) DO NOTHING;
 RETURN QUERY SELECT e.id,e.enrollment_date,e.status FROM pathways.beneficiary_project_enrollments e WHERE e.organization_id=org AND e.project_id=wanted_project AND e.beneficiary_id=wanted_beneficiary;
END $enroll$;

-- A shared SQL role cannot distinguish API response fields. Supporting projects.read
-- stays row-scoped; the API selects only id/code/title/status without detail authority.
-- Prisma can supply client timestamps for INSERT. Stamp these supporting-read
-- timestamps at the database boundary so the exception is tied to this transaction.
CREATE FUNCTION pathways.p09_stamp_supporting_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user='pathways_runtime' THEN
  IF TG_TABLE_NAME='projects' THEN NEW.created_at:=transaction_timestamp();
  ELSE NEW.occurred_at:=transaction_timestamp(); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p09_stamp_supporting_insert() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p09_supporting_insert BEFORE INSERT ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p09_stamp_supporting_insert();
CREATE TRIGGER p09_supporting_insert BEFORE INSERT ON pathways.audit_logs FOR EACH ROW EXECUTE FUNCTION pathways.p09_stamp_supporting_insert();
CREATE POLICY p09_project_select ON pathways.projects AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING(pathways.p05_has_project_permission('projects.read',id) OR (pathways.p09_can('projects.create') AND created_by_id=pathways.runtime_context_user() AND created_at=transaction_timestamp()::timestamptz(3)));
CREATE POLICY p09_project_insert ON pathways.projects AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user() AND pathways.p09_can('projects.create'));
CREATE POLICY p09_project_update ON pathways.projects AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING(pathways.p05_has_project_permission('projects.update',id) OR pathways.p05_has_project_permission('projects.archive',id))
WITH CHECK(organization_id=pathways.runtime_context_organization());

CREATE FUNCTION pathways.p09_guard_project() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT pathways.p05_has_project_permission('projects.update',OLD.id)
 AND (NOT pathways.p05_has_project_permission('projects.archive',OLD.id)
 OR to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','archived_at','updated_at']
 OR NEW.archived_at IS NULL) THEN RAISE EXCEPTION 'Project update authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p09_project_authority BEFORE UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_project();

CREATE POLICY p09_assignment_insert ON pathways.user_project_assignments AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (organization_id=pathways.runtime_context_organization() AND (
 (pathways.p09_can('assignments.manage') AND (pathways.p05_has_project_permission('projects.read',project_id) OR (pathways.p09_can('projects.create') AND EXISTS(SELECT FROM pathways.projects p WHERE p.id=project_id AND p.created_by_id=pathways.runtime_context_user() AND p.created_at=transaction_timestamp()::timestamptz(3))))
  AND EXISTS(SELECT FROM pathways.system_users u WHERE u.id=user_id AND u.organization_id=user_project_assignments.organization_id
             AND pathways.p1_can_manage_role(u.role_id)))
 OR (user_id=pathways.runtime_context_user() AND pathways.p09_can('projects.create')
     AND EXISTS(SELECT FROM pathways.projects p WHERE p.id=project_id AND p.created_by_id=pathways.runtime_context_user() AND p.created_at=transaction_timestamp()::timestamptz(3)))));
CREATE POLICY p09_assignment_update ON pathways.user_project_assignments AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING(pathways.p09_can('assignments.manage') AND pathways.p05_has_project_permission('projects.read',project_id)
 AND EXISTS(SELECT FROM pathways.system_users u WHERE u.id=user_id AND u.organization_id=user_project_assignments.organization_id
            AND pathways.p1_can_manage_role(u.role_id)))
WITH CHECK(organization_id=pathways.runtime_context_organization());
CREATE POLICY p09_user_insert ON pathways.system_users AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK(pathways.p09_can('users.authorize'));
CREATE POLICY p09_user_update ON pathways.system_users AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING(pathways.p09_can('users.authorize')) WITH CHECK(pathways.p09_can('users.authorize'));

DROP POLICY p05_mapping_insert ON pathways.activity_journey_stage_mappings;
CREATE POLICY p05_mapping_insert ON pathways.activity_journey_stage_mappings FOR INSERT TO pathways_runtime
WITH CHECK(organization_id=pathways.runtime_context_organization() AND created_by_id=pathways.runtime_context_user()
 AND (pathways.p05_has_project_permission('activities.create',project_id) OR pathways.p05_has_project_permission('activities.update',project_id)));
DROP POLICY p07_mapping_delete ON pathways.activity_journey_stage_mappings;
CREATE POLICY p05_mapping_delete ON pathways.activity_journey_stage_mappings FOR DELETE TO pathways_runtime
USING(pathways.p05_has_project_permission('activities.update',project_id));

-- General edits and activity accomplishment are separate capabilities.
DROP POLICY p05_activity_update ON pathways.project_activities;
CREATE POLICY p05_activity_update ON pathways.project_activities FOR UPDATE TO pathways_runtime
USING(pathways.p05_has_project_permission('activities.update',project_id)
 OR pathways.p05_has_project_permission('activities.complete',project_id)
 OR pathways.p05_has_project_permission('activities.proof.submit',project_id)
 OR pathways.p05_has_project_permission('evidence.review',project_id))
WITH CHECK(organization_id=pathways.runtime_context_organization());
CREATE FUNCTION pathways.p09_guard_activity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT pathways.p05_has_project_permission('activities.update',OLD.project_id)
 AND to_jsonb(NEW)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at']
 IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','actual_start_date','actual_end_date','completed_at','progress_percent','updated_at'] THEN
   RAISE EXCEPTION 'Activity profile edit authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p09_activity_authority BEFORE UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_activity();
CREATE POLICY p09_insert ON pathways.programs AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p09_can('programs.create'))
;
CREATE POLICY p09_update ON pathways.programs AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p09_can('programs.create'))
WITH CHECK (pathways.p09_can('programs.create'))
;
CREATE POLICY p09_insert ON pathways.project_activities AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('activities.create',project_id))
;
CREATE POLICY p09_insert ON pathways.project_milestones AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('milestones.manage',project_id))
;
CREATE POLICY p09_update ON pathways.project_milestones AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('milestones.manage',project_id))
WITH CHECK (pathways.p05_has_project_permission('milestones.manage',project_id))
;
CREATE POLICY p09_insert ON pathways.digital_forms AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('forms.manage',project_id))
;
CREATE POLICY p09_update ON pathways.digital_forms AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('forms.manage',project_id))
WITH CHECK (pathways.p05_has_project_permission('forms.manage',project_id))
;
CREATE POLICY p09_insert ON pathways.form_fields AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('forms.manage',project_id))
;
CREATE POLICY p09_update ON pathways.form_fields AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('forms.manage',project_id))
WITH CHECK (pathways.p05_has_project_permission('forms.manage',project_id))
;
CREATE POLICY p09_delete ON pathways.form_fields AS RESTRICTIVE FOR DELETE TO pathways_runtime
USING (pathways.p05_has_project_permission('forms.manage',project_id))
;
CREATE POLICY p09_insert ON pathways.metadata_mappings AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('imports.review',project_id))
;
CREATE POLICY p09_update ON pathways.metadata_mappings AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('imports.review',project_id))
WITH CHECK (pathways.p05_has_project_permission('imports.review',project_id))
;
CREATE POLICY p09_delete ON pathways.metadata_mappings AS RESTRICTIVE FOR DELETE TO pathways_runtime
USING (pathways.p05_has_project_permission('imports.review',project_id))
;
CREATE POLICY p09_insert ON pathways.data_import_batches AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('imports.upload',project_id))
;
CREATE POLICY p09_update ON pathways.data_import_batches AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('imports.upload',project_id) OR pathways.p05_has_project_permission('imports.validate',project_id) OR pathways.p05_has_project_permission('imports.process',project_id))
WITH CHECK (pathways.p05_has_project_permission('imports.upload',project_id) OR pathways.p05_has_project_permission('imports.validate',project_id) OR pathways.p05_has_project_permission('imports.process',project_id))
;
CREATE POLICY p09_insert ON pathways.data_import_rows AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('imports.upload',project_id))
;
CREATE POLICY p09_update ON pathways.data_import_rows AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('imports.validate',project_id) OR pathways.p05_has_project_permission('imports.process',project_id))
WITH CHECK (pathways.p05_has_project_permission('imports.validate',project_id) OR pathways.p05_has_project_permission('imports.process',project_id))
;
CREATE POLICY p09_select ON pathways.assessment_results AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('assessments.detail.read',project_id))
;
-- Enrollment support never grants the Administrator a profile-detail query.
CREATE POLICY p09_select ON pathways.beneficiaries AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p09_can('beneficiaries.records.read'));
CREATE POLICY p09_insert ON pathways.beneficiaries AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p09_can('beneficiaries.records.register'));
CREATE POLICY p09_update ON pathways.beneficiaries AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p09_can('beneficiaries.profiles.update') OR pathways.p09_can('beneficiaries.records.archive')) WITH CHECK(pathways.p09_can('beneficiaries.profiles.update') OR pathways.p09_can('beneficiaries.records.archive'));
CREATE POLICY p09_select ON pathways.beneficiary_project_enrollments AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('beneficiaries.records.read',project_id));
CREATE POLICY p09_select ON pathways.beneficiary_identifiers AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p09_can('beneficiaries.records.read'));
CREATE POLICY p09_insert ON pathways.beneficiary_identifiers AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p09_can('beneficiaries.records.register'));
CREATE POLICY p09_select ON pathways.beneficiary_consent_records AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p09_can('beneficiaries.records.read'));
CREATE POLICY p09_insert ON pathways.beneficiary_consent_records AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p09_can('beneficiaries.records.register'));
CREATE POLICY p09_select ON pathways.audit_logs AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p09_can('audit.read') OR (actor_user_id=pathways.runtime_context_user() AND occurred_at=transaction_timestamp()::timestamptz(3)))
;
CREATE POLICY p09_select ON pathways.reports AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('reports.read',project_id))
;
CREATE POLICY p09_insert ON pathways.reports AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('reports.generate',project_id))
;
CREATE POLICY p09_update ON pathways.reports AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('reports.generate',project_id))
WITH CHECK (pathways.p05_has_project_permission('reports.generate',project_id))
;
CREATE POLICY p09_select ON pathways.alert_rules AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p09_can('rules.read'))
;
CREATE POLICY p09_insert ON pathways.alert_rules AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p09_can('rules.create'))
;
CREATE POLICY p09_update ON pathways.alert_rules AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p09_can('rules.update'))
WITH CHECK (pathways.p09_can('rules.update'))
;
CREATE POLICY p09_select ON pathways.rule_based_alerts AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('alerts.read',project_id))
;
CREATE POLICY p09_select ON pathways.decision_recommendations AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('recommendations.read',project_id))
;
CREATE POLICY p09_insert ON pathways.decision_recommendations AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (false)
;
CREATE POLICY p09_update ON pathways.decision_recommendations AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('recommendations.review',project_id))
WITH CHECK (pathways.p05_has_project_permission('recommendations.review',project_id))
;
CREATE POLICY p09_select ON pathways.beneficiary_journey_events AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('journeys.read',project_id))
;
CREATE POLICY p09_insert ON pathways.beneficiary_journey_events AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('participation.record',project_id))
;
CREATE POLICY p09_select ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR SELECT TO pathways_runtime
USING (pathways.p05_has_project_permission('journeys.read',project_id))
;
CREATE POLICY p09_insert ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('participation.record',project_id))
;
CREATE POLICY p09_update ON pathways.beneficiary_activity_participations AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING (pathways.p05_has_project_permission('participation.record',project_id))
WITH CHECK (pathways.p05_has_project_permission('participation.record',project_id))
;

-- Missing feature handlers stay denied at the database write boundary too.
CREATE POLICY p09_expense_insert ON pathways.budget_expense_entries AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK(pathways.p05_has_project_permission('expenses.submit',project_id));
CREATE POLICY p09_expense_update ON pathways.budget_expense_entries AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING(pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id))
WITH CHECK(pathways.p05_has_project_permission('expenses.verify',project_id) OR pathways.p05_has_project_permission('expenses.approve',project_id));

REVOKE ALL ON FUNCTION pathways.p09_can(text),pathways.p09_enroll(uuid,uuid,date),pathways.p09_guard_project(),pathways.p09_guard_activity()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p09_can(text),pathways.p09_enroll(uuid,uuid,date) TO pathways_runtime;

CREATE POLICY p09_scoped_select ON pathways.digital_forms AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('forms.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.form_fields AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('forms.read',project_id));
-- Blank forms do not authorize access to submitted personal responses.
CREATE POLICY p09_select ON pathways.form_submissions AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id) OR pathways.p05_has_project_permission('assessments.detail.read',project_id));
CREATE POLICY p09_select ON pathways.form_response_values AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id) OR pathways.p05_has_project_permission('assessments.detail.read',project_id));
CREATE POLICY p09_insert ON pathways.form_submissions AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id));
CREATE POLICY p09_update ON pathways.form_submissions AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id)) WITH CHECK(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id));
CREATE POLICY p09_insert ON pathways.form_response_values AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id));
CREATE POLICY p09_update ON pathways.form_response_values AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id)) WITH CHECK(pathways.p05_has_project_permission('submissions.write',project_id) OR pathways.p05_has_project_permission('imports.process',project_id));
CREATE POLICY p09_delete ON pathways.form_response_values AS RESTRICTIVE FOR DELETE TO pathways_runtime USING(pathways.p05_has_project_permission('submissions.write',project_id));
CREATE POLICY p09_scoped_select ON pathways.data_import_batches AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.data_import_rows AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.metadata_mappings AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('imports.read',project_id));
-- Executive dashboards use reviewed aggregate functions, not raw indicator
-- configuration/binding/measurement rows for a denied detail tab.
CREATE POLICY p09_scoped_select ON pathways.project_indicators AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p05_has_project_permission('indicators.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_indicator_bindings AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p05_has_project_permission('indicators.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_indicator_measurements AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p05_has_project_permission('indicators.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_milestones AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('activities.read',project_id) OR pathways.p05_has_project_permission('monitoring.read',project_id) OR pathways.p05_has_project_permission('reports.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_budget_records AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('budgets.read',project_id));
CREATE POLICY p09_insert ON pathways.project_budget_records AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('budgets.create',project_id));
CREATE POLICY p09_update ON pathways.project_budget_records AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p05_has_project_permission('budgets.update',project_id)) WITH CHECK(pathways.p05_has_project_permission('budgets.update',project_id));
CREATE POLICY p09_scoped_select ON pathways.budget_expense_entries AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('expenses.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_evaluations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('evaluations.submit',project_id) OR pathways.p05_has_project_permission('evaluations.approve',project_id) OR pathways.p05_has_project_permission('evaluations.signoff',project_id) OR pathways.p05_has_project_permission('monitoring.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('evaluations.submit',project_id) OR pathways.p05_has_project_permission('evaluations.approve',project_id) OR pathways.p05_has_project_permission('evaluations.signoff',project_id) OR pathways.p05_has_project_permission('monitoring.read',project_id));
CREATE POLICY p09_scoped_select ON pathways.project_evaluation_scores AS RESTRICTIVE FOR SELECT TO pathways_runtime USING (pathways.p05_has_project_permission('evaluations.submit',project_id) OR pathways.p05_has_project_permission('evaluations.approve',project_id) OR pathways.p05_has_project_permission('evaluations.signoff',project_id) OR pathways.p05_has_project_permission('monitoring.read',project_id));
CREATE POLICY p09_insert ON pathways.project_evaluations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('evaluations.submit',project_id));
CREATE POLICY p09_update ON pathways.project_evaluations AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING(pathways.p05_has_project_permission('evaluations.submit',project_id) OR pathways.p05_has_project_permission('evaluations.approve',project_id) OR pathways.p05_has_project_permission('evaluations.signoff',project_id) OR pathways.p05_has_project_permission('evaluations.archive',project_id))
WITH CHECK(pathways.p05_has_project_permission(CASE status WHEN 'REVIEWED' THEN 'evaluations.approve' WHEN 'SIGNED_OFF' THEN 'evaluations.signoff' WHEN 'ARCHIVED' THEN 'evaluations.archive' ELSE 'evaluations.submit' END,project_id));
CREATE POLICY p09_insert ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('settings.configure',project_id));
CREATE POLICY p09_update ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p05_has_project_permission('settings.configure',project_id)) WITH CHECK(pathways.p05_has_project_permission('settings.configure',project_id));
CREATE POLICY p09_insert ON pathways.project_evaluation_scores AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p05_has_project_permission('evaluations.submit',project_id));
CREATE POLICY p09_update ON pathways.project_evaluation_scores AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p05_has_project_permission('evaluations.submit',project_id)) WITH CHECK(pathways.p05_has_project_permission('evaluations.submit',project_id));
CREATE POLICY p09_insert ON pathways.rule_based_alerts AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(false);
-- Configuration is organization-wide for Admin. Linked alert reads are only
-- supporting reads for already scoped alerts, never rule-repository access.
CREATE POLICY p09_select ON pathways.alert_rule_conditions AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p09_can('rules.read') OR EXISTS(SELECT FROM pathways.rule_based_alerts a WHERE a.rule_id=alert_rule_conditions.rule_id AND pathways.p05_has_project_permission('alerts.read',a.project_id)));
CREATE POLICY p09_select ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR SELECT TO pathways_runtime USING(pathways.p09_can('rules.read') OR EXISTS(SELECT FROM pathways.rule_based_alerts a WHERE a.rule_id=alert_rule_recommendations.rule_id AND pathways.p05_has_project_permission('alerts.read',a.project_id)));
CREATE POLICY p09_insert ON pathways.alert_rule_conditions AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p09_can('rules.create'));
CREATE POLICY p09_update ON pathways.alert_rule_conditions AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p09_can('rules.update')) WITH CHECK(pathways.p09_can('rules.update'));
CREATE POLICY p09_insert ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK(pathways.p09_can('rules.create'));
CREATE POLICY p09_update ON pathways.alert_rule_recommendations AS RESTRICTIVE FOR UPDATE TO pathways_runtime USING(pathways.p09_can('rules.update')) WITH CHECK(pathways.p09_can('rules.update'));
CREATE FUNCTION pathways.p09_guard_expense_review() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND (
  (OLD.status='PENDING' AND NOT pathways.p05_has_project_permission('expenses.verify',OLD.project_id))
  OR (OLD.status='VERIFIED' AND NOT pathways.p05_has_project_permission('expenses.approve',OLD.project_id))) THEN
  RAISE EXCEPTION 'Financial review stage authority unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p09_guard_expense_review() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p09_expense_review BEFORE UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_expense_review();

-- Archiving a form/indicator is a discretionary action absent from the CSV.
CREATE FUNCTION pathways.p09_guard_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
 AND NOT pathways.p05_has_project_permission(TG_ARGV[0],OLD.project_id) THEN
  RAISE EXCEPTION 'Archive authority unavailable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pathways.p09_guard_archive() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
CREATE TRIGGER p09_form_archive BEFORE UPDATE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_archive('forms.archive');
CREATE TRIGGER p09_indicator_archive BEFORE UPDATE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways.p09_guard_archive('indicators.archive');

DO $postflight$
BEGIN
 IF EXISTS(SELECT r.code,p.code FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id
 EXCEPT SELECT role_code,permission_code FROM rbac_expected)
 OR EXISTS(SELECT role_code,permission_code FROM rbac_expected EXCEPT
 SELECT r.code,p.code FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id) THEN
  RAISE EXCEPTION '0026 exact permission matrix differs'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION '0026 runtime security differs'; END IF;
END $postflight$;
COMMIT;
