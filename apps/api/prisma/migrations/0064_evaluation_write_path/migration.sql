-- cr-pathways-evaluation-write-path: opens the in-app evaluation write path left reserved by the
-- revised RBAC baseline (0027). Monitoring and Evaluation Officer gets evaluations.submit and sole
-- hold of evaluations.weights.configure (System Administrator loses it, keeping settings.configure
-- for the seed's criteria initialize path); Project Manager gets evaluations.approve and
-- evaluations.signoff, reviewing and signing off the same evaluation in one sitting. Three changes
-- to pathways.project_evaluations: the p3_evaluation_values CHECK no longer requires signed_off_by_id
-- to differ from reviewed_by_id (it still must differ from evaluated_by_id); p3_guard_evaluation adds
-- a SUBMITTED -> DRAFT "return for correction" transition that clears evaluated_at and overall_score
-- while freezing every other recorded field; and two new RESTRICTIVE policies bind evaluated_by_id,
-- reviewed_by_id and signed_off_by_id to the calling session on the statement that sets each one, so a
-- runtime caller can only ever record themselves as having acted. The p09_update WITH CHECK is
-- rebuilt because no UPDATE could previously reach DRAFT: the DRAFT case now accepts either
-- evaluations.submit (the evaluator's own in-progress draft) or evaluations.approve (the Project
-- Manager's return). RLS cannot see the prior status, so p3_guard_evaluation rejects runtime DRAFT->DRAFT edits without evaluations.submit.
-- project_evaluation_criteria INSERT
-- now also accepts evaluations.weights.configure (previously settings.configure only), so Monitoring
-- and Evaluation Officer can start a criteria set; the UPDATE policy already required
-- evaluations.weights.configure, so dropping p10_guard_evaluation_weight (which blocked that same
-- holder from editing anything but weight) is what actually lets the role edit and publish a draft.
-- All changes stay inside the existing prisma-owned tables and functions; no new table, no
-- preprovisioned owner role is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0063_rules_scope_memo'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0064 requires the verified 0063 state and migration identity'; END IF;
 IF to_regprocedure('pathways.p09_role_allows_0048(text,text)') IS NULL
 THEN RAISE EXCEPTION '0064 requires the p09_role_allows_0048 chain left by 0051'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_evaluations'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_evaluation_criteria'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0064 requires prisma ownership of the evaluation tables'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- Role ceiling: revoke SA's evaluations.weights.configure, grant M&E evaluations.submit and
-- PM evaluations.approve/evaluations.signoff. CREATE OR REPLACE in place (not a rename-then-create)
-- keeps the existing ACL, matching the fix 0054 made after 0047/0051 reset it by creating anew.
CREATE OR REPLACE FUNCTION pathways.p09_role_allows(role_code text,wanted_permission text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $matrix$
 SELECT ($1='MONITORING_AND_EVALUATION_OFFICER' AND $2='evaluations.submit')
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

DELETE FROM pathways.role_permissions rp USING pathways.roles r, pathways.permissions p
WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='SYSTEM_ADMINISTRATOR' AND p.code='evaluations.weights.configure';

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code='evaluations.submit'
WHERE r.code='MONITORING_AND_EVALUATION_OFFICER'
ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code IN ('evaluations.approve','evaluations.signoff')
WHERE r.code='PROJECT_MANAGER'
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- Let evaluations.weights.configure holders start a criteria set too (settings.configure, i.e. the
-- seed's System Administrator path, is unaffected and stays alongside it).
DROP POLICY p09_insert ON pathways.project_evaluation_criteria;
CREATE POLICY p09_insert ON pathways.project_evaluation_criteria AS RESTRICTIVE FOR INSERT TO pathways_runtime
WITH CHECK (pathways.p05_has_project_permission('settings.configure',project_id)
 OR pathways.p05_has_project_permission('evaluations.weights.configure',project_id));

-- This trigger existed only to stop a settings.configure-less weights.configure holder from editing
-- criterion definitions. Since System Administrator no longer holds evaluations.weights.configure,
-- the one role left with UPDATE access on this table is exactly the role that should be able to
-- edit and publish its own draft; p3_guard_criterion still freezes a row once PUBLISHED.
DROP TRIGGER p10_evaluation_weight ON pathways.project_evaluation_criteria;
DROP FUNCTION pathways.p10_guard_evaluation_weight();

-- Reviewer and signer may now be the same person (Project Manager reviews and signs off in one
-- sitting); both must still differ from the evaluator.
ALTER TABLE pathways.project_evaluations DROP CONSTRAINT p3_evaluation_values;
ALTER TABLE pathways.project_evaluations ADD CONSTRAINT p3_evaluation_values CHECK (
 (length(btrim(title)) > 0) AND (period_end >= period_start)
 AND ((overall_score IS NULL) OR ((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)))
 AND (
  ((status = 'DRAFT'::pathways.evaluation_status) AND (evaluated_at IS NULL) AND (overall_score IS NULL)
   AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_feedback IS NULL)
   AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL))
  OR ((status = 'SUBMITTED'::pathways.evaluation_status) AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL)
   AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_feedback IS NULL)
   AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL))
  OR ((status = 'REVIEWED'::pathways.evaluation_status) AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL)
   AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= evaluated_at) AND (length(btrim(review_feedback)) > 0)
   AND (signed_off_by_id IS NULL) AND (signed_off_at IS NULL) AND (archived_at IS NULL))
  OR ((status = ANY (ARRAY['SIGNED_OFF'::pathways.evaluation_status,'ARCHIVED'::pathways.evaluation_status]))
   AND (evaluated_at IS NOT NULL) AND (overall_score IS NOT NULL)
   AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= evaluated_at) AND (length(btrim(review_feedback)) > 0)
   AND (signed_off_by_id IS NOT NULL) AND (signed_off_at >= reviewed_at)
   AND (((status = 'SIGNED_OFF'::pathways.evaluation_status) AND (archived_at IS NULL))
    OR ((status = 'ARCHIVED'::pathways.evaluation_status) AND (archived_at >= signed_off_at))))
 )
 AND ((reviewed_by_id IS NULL) OR (reviewed_by_id <> evaluated_by_id))
 AND ((signed_off_by_id IS NULL) OR (signed_off_by_id <> evaluated_by_id))
);

-- The return transition targets NEW.status='DRAFT', which the baseline WITH CHECK sent to its
-- ELSE case (evaluations.submit) because no UPDATE could reach DRAFT before this migration. The
-- Project Manager returning an evaluation holds only evaluations.approve, so DRAFT now accepts
-- either holder: submit for the Monitoring and Evaluation Officer's own in-progress draft (for
-- example saving commentary before submitting), approve for the Project Manager's return. The
-- USING clause (which rows are visible at all) and every other status case are unchanged.
DROP POLICY p09_update ON pathways.project_evaluations;
CREATE POLICY p09_update ON pathways.project_evaluations AS RESTRICTIVE FOR UPDATE TO pathways_runtime
USING ((pathways.p05_has_project_permission('evaluations.submit'::text, project_id)
 OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id)
 OR pathways.p05_has_project_permission('evaluations.signoff'::text, project_id)
 OR pathways.p05_has_project_permission('evaluations.archive'::text, project_id)))
WITH CHECK (
CASE status
    WHEN 'REVIEWED'::pathways.evaluation_status THEN pathways.p05_has_project_permission('evaluations.approve'::text, project_id)
    WHEN 'SIGNED_OFF'::pathways.evaluation_status THEN pathways.p05_has_project_permission('evaluations.signoff'::text, project_id)
    WHEN 'ARCHIVED'::pathways.evaluation_status THEN pathways.p05_has_project_permission('evaluations.archive'::text, project_id)
    WHEN 'DRAFT'::pathways.evaluation_status THEN pathways.p05_has_project_permission('evaluations.submit'::text, project_id)
     OR pathways.p05_has_project_permission('evaluations.approve'::text, project_id)
    ELSE pathways.p05_has_project_permission('evaluations.submit'::text, project_id)
END);

-- Adds one return transition (SUBMITTED -> DRAFT) to the lifecycle guard; every other branch is
-- unchanged from the baseline trigger.
CREATE OR REPLACE FUNCTION pathways.p3_guard_evaluation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE weights numeric; result numeric; count_scores bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   -- Only the evaluator role may edit a draft at runtime; RLS cannot see the prior status.
   IF NEW.status='DRAFT' AND current_user='pathways_runtime'
    AND NOT pathways.p05_has_project_permission('evaluations.submit',NEW.project_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Draft evaluation edits require evaluations.submit';
   END IF;
   IF NEW.status NOT IN ('DRAFT','SUBMITTED') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must be submitted before review'; END IF;
   IF NEW.status='SUBMITTED' THEN
    SELECT sum((criterion_snapshot->>'weight_percentage')::numeric),sum(weighted_score),count(*)
     INTO weights,result,count_scores FROM pathways.project_evaluation_scores WHERE evaluation_id=NEW.id;
    IF count_scores=0 OR weights<>100 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation submission requires criteria weights totaling 100'; END IF;
    NEW.overall_score:=round(result,4);
   END IF;
  ELSIF OLD.status='SUBMITTED' AND NEW.status='DRAFT' THEN
   -- Commentary may change here too: it carries the Project Manager's return reason, shown
   -- back to the Monitoring and Evaluation Officer alongside the reopened draft.
   IF (to_jsonb(NEW)-ARRAY['updated_at','status','evaluated_at','overall_score','commentary'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','evaluated_at','overall_score','commentary']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Returned evaluation must not change recorded content';
   END IF;
   IF NEW.evaluated_at IS NOT NULL OR NEW.overall_score IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Returned evaluation must clear its submission state';
   END IF;
  ELSE
   IF NOT ((OLD.status='SUBMITTED' AND NEW.status='REVIEWED')
    OR (OLD.status='REVIEWED' AND NEW.status='SIGNED_OFF')
    OR (OLD.status='SIGNED_OFF' AND NEW.status='ARCHIVED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation content is immutable';
   END IF;
   IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation snapshot and evaluator history are immutable';
   END IF;
   IF OLD.status IN ('REVIEWED','SIGNED_OFF') AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_feedback) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_feedback) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation review history is immutable';
   END IF;
   IF OLD.status='SIGNED_OFF' AND ROW(NEW.signed_off_by_id,NEW.signed_off_at) IS DISTINCT FROM ROW(OLD.signed_off_by_id,OLD.signed_off_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Signoff history is immutable';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

ALTER FUNCTION pathways.p3_guard_evaluation() OWNER TO prisma;

-- Bind evaluated_by_id/reviewed_by_id/signed_off_by_id to the calling session on the statement that
-- sets each one, so a holder of evaluations.submit/approve/signoff can only ever record themselves.
-- Scoped to the transition that sets each column (status becomes SUBMITTED/REVIEWED/SIGNED_OFF), so
-- a later, unrelated transition (for example a future ARCHIVED holder) is unaffected.
CREATE POLICY p05_evaluation_actor_insert ON pathways.project_evaluations
 AS RESTRICTIVE FOR INSERT TO pathways_runtime WITH CHECK (
  evaluated_by_id = nullif(current_setting('app.user_id', true), '')::uuid
 );
CREATE POLICY p05_evaluation_actor_update ON pathways.project_evaluations
 AS RESTRICTIVE FOR UPDATE TO pathways_runtime WITH CHECK (
  (status <> 'SUBMITTED' OR evaluated_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
  AND (status <> 'REVIEWED' OR reviewed_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
  AND (status <> 'SIGNED_OFF' OR signed_off_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
 );

DO $$ BEGIN
 IF pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','evaluations.weights.configure')
 OR NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','evaluations.weights.configure')
 OR NOT pathways.p09_role_allows('MONITORING_AND_EVALUATION_OFFICER','evaluations.submit')
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','evaluations.approve')
 OR NOT pathways.p09_role_allows('PROJECT_MANAGER','evaluations.signoff')
 OR pathways.p09_role_allows('PROJECT_OFFICER','evaluations.submit')
 OR NOT pathways.p09_role_allows('PROGRAM_MANAGER','activities.read')
 OR NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','settings.configure')
 OR EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgname='p10_evaluation_weight')
 OR to_regprocedure('pathways.p10_guard_evaluation_weight()') IS NOT NULL
 OR (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname='pathways' AND tablename='project_evaluations' AND policyname='p09_update')<>1
 OR position('Draft evaluation edits require evaluations.submit' IN pg_catalog.pg_get_functiondef('pathways.p3_guard_evaluation()'::pg_catalog.regprocedure))=0
 THEN RAISE EXCEPTION '0064 verification failed'; END IF;
END $$;
COMMIT;
