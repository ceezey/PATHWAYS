-- cr-pathways-assessment-score-entry: adds assessments.record for Project Officer, Monitoring and Evaluation
-- Officer and Project Manager (the roles that read assessment detail), so they can record pre and post test
-- scores in the app. The p09_role_allows ceiling is replaced in place with the new pairs added, three
-- role_permissions rows are granted, and a RESTRICTIVE INSERT policy on pathways.assessment_results requires
-- the permission for the project. The invoker p3_guard_source locks the source submission and form FOR SHARE,
-- which runtime UPDATE policies hide for VALIDATED rows, so assessment_results alone moves to a prisma-owned
-- definer copy of the same checks; evidence_media keeps p3_guard_source. Grants and other triggers are unchanged.
-- Only prisma-owned objects are touched, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0070_activity_escalations'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0071 requires the verified 0070 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pathways.permissions WHERE code='assessments.record')
  OR EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.assessment_results'::pg_catalog.regclass AND polname='p09_insert')
  OR to_regprocedure('pathways.p3_guard_assessment_source()') IS NOT NULL
 THEN RAISE EXCEPTION '0071 requires the permission, the insert policy and the assessment source guard to not already exist'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname='p3_30_source' AND NOT tgisinternal
  AND tgfoid='pathways.p3_guard_source()'::pg_catalog.regprocedure
  AND tgrelid IN ('pathways.assessment_results'::pg_catalog.regclass,'pathways.evidence_media'::pg_catalog.regclass))<>2
 THEN RAISE EXCEPTION '0071 requires p3_30_source on assessment_results and evidence_media to call p3_guard_source'; END IF;
 IF (SELECT count(*) FROM pathways.roles WHERE code IN ('PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER') AND is_active)<>3
 THEN RAISE EXCEPTION '0071 requires the three active recording roles'; END IF;
 IF to_regprocedure('pathways.p09_role_allows_0048(text,text)') IS NULL
 THEN RAISE EXCEPTION '0071 requires the p09_role_allows_0048 chain left by 0051'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.assessment_results'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.form_submissions'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.digital_forms'::pg_catalog.regclass)<>'prisma'
  OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.form_submissions'::pg_catalog.regclass)
  OR (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='pathways.digital_forms'::pg_catalog.regclass)
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
   WHERE oid='pathways.p09_role_allows(text,text)'::pg_catalog.regprocedure)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
   WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0071 requires prisma ownership of the source tables (without forced RLS), p09_role_allows and p05_has_project_permission'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

INSERT INTO pathways.permissions(code,name) VALUES ('assessments.record','assessments.record');

-- Role ceiling: the 0064 definition with the assessments.record pairs added; CREATE OR REPLACE keeps the ACL.
CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1 IN ('PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER') AND $2='assessments.record')
  OR ($1='MONITORING_AND_EVALUATION_OFFICER' AND $2='evaluations.submit')
  OR ($1='PROJECT_MANAGER' AND $2 IN ('evaluations.approve','evaluations.signoff'))
  OR (NOT ($1='SYSTEM_ADMINISTRATOR' AND $2='evaluations.weights.configure')
   AND (
    ($1 IN ('PROGRAM_MANAGER','GRANT_MANAGER') AND $2='activities.read')
    OR (NOT (($1='PROGRAM_MANAGER' AND $2='projects.archive')
     OR ($1='GRANT_MANAGER' AND $2='projects.archive')
     OR ($1='SYSTEM_ADMINISTRATOR' AND $2='budgets.read')
     OR ($1='PROJECT_OFFICER' AND $2='activities.create')
     OR ($1='PROJECT_OFFICER' AND $2='dashboards.customize')
     OR ($1='PROJECT_OFFICER' AND $2='assessments.read')
     OR ($1='PROJECT_OFFICER' AND $2='analytics.saddd.read'))
    AND (($1 IN ('SYSTEM_ADMINISTRATOR','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
      AND $2 IN ('indicators.library.read','indicators.library.create','indicators.library.archive'))
     OR pathways.p09_role_allows_0048($1,$2)))
   ))
$matrix$;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='assessments.record'
WHERE r.code IN ('PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER')
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- The database, not only the API, requires assessments.record for the project on every runtime insert.
CREATE POLICY p09_insert ON pathways.assessment_results AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('assessments.record',project_id));

-- The assessment_results branch of p3_guard_source as a definer, so its FOR SHARE provenance reads ignore runtime RLS.
CREATE FUNCTION pathways.p3_guard_assessment_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE submission pathways.form_submissions; form pathways.digital_forms;
BEGIN
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recorded assessment provenance is immutable';
 END IF;
 IF NEW.source_submission_id IS NOT NULL THEN
  SELECT * INTO submission FROM pathways.form_submissions WHERE id=NEW.source_submission_id FOR SHARE;
  IF NOT FOUND OR submission.organization_id<>NEW.organization_id OR submission.project_id<>NEW.project_id
   OR submission.status NOT IN ('VALIDATED','PROCESSED') OR submission.is_dummy_record
   OR submission.enrollment_id IS DISTINCT FROM NEW.enrollment_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Source must be a validated nondummy submission for this scope and enrollment';
  END IF;
  SELECT * INTO form FROM pathways.digital_forms WHERE id=submission.form_id FOR SHARE;
  IF form.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Assessment/evidence activity must agree with its source form';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways.p3_guard_assessment_source() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_assessment_source() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

DROP TRIGGER p3_30_source ON pathways.assessment_results;
CREATE TRIGGER p3_30_source BEFORE INSERT OR UPDATE ON pathways.assessment_results
 FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_assessment_source();

-- Postconditions.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid='pathways.assessment_results'::pg_catalog.regclass
  AND p.polname='p09_insert' AND NOT p.polpermissive AND p.polcmd='a'
  AND p.polroles=ARRAY['pathways_runtime'::pg_catalog.regrole::oid])
 THEN RAISE EXCEPTION '0071 insert policy postcondition failed'; END IF;
 IF (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
  JOIN pathways.permissions p ON p.id=rp.permission_id WHERE p.code='assessments.record'
  AND r.code IN ('PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER','PROJECT_MANAGER'))<>3
  OR (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.permissions p ON p.id=rp.permission_id
   WHERE p.code='assessments.record')<>3
 THEN RAISE EXCEPTION '0071 grant postcondition failed'; END IF;
 IF NOT (pathways.p09_role_allows('PROJECT_OFFICER','assessments.record')
  AND pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','assessments.record')
  AND pathways.p09_role_allows('PROJECT_MANAGER','assessments.record')
  AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','assessments.record')
  AND NOT pathways.p09_role_allows('PROGRAM_MANAGER','assessments.record')
  AND NOT pathways.p09_role_allows('GRANT_MANAGER','assessments.record'))
 THEN RAISE EXCEPTION '0071 role ceiling postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p3_guard_assessment_source()'::pg_catalog.regprocedure
  AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.proconfig=ARRAY['search_path=""']
  AND NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION '0071 assessment source guard postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.assessment_results'::pg_catalog.regclass
   AND tgname='p3_30_source' AND tgenabled='O' AND tgfoid='pathways.p3_guard_assessment_source()'::pg_catalog.regprocedure)
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.evidence_media'::pg_catalog.regclass
   AND tgname='p3_30_source' AND tgenabled='O' AND tgfoid='pathways.p3_guard_source()'::pg_catalog.regprocedure)
  OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='pathways.p3_guard_source()'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0071 source trigger postcondition failed'; END IF;
END $$;
COMMIT;
