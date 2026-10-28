-- 0081 submission check once (cr-pathways-import-processing-speed); forward migration.
-- p2_assert_submission fired for every value written and every submission write, 24 times per imported registration row,
-- and every firing re-checked the whole submission. Under forced RLS one check costs about 340 ms as pathways_runtime, so a
-- 10-row promotion chunk outran its 30 s transaction and every row was processed again one by one.
-- A value-side firing now skips when the parent row was written by this top-level transaction (the parent's own queued event
-- checks it), a submission-side firing skips when its row version was superseded, and the check reads the form's fields and
-- the submission's values once each, with the same tests and the same 23514.
-- Accepted residual: in IMMEDIATE mode a value changed after its top-level parent was checked is left to p2_guard_response,
-- which refuses it for every role that cannot disable triggers.
-- Owner, SECURITY INVOKER, volatility, search_path, ACL and the trigger shape stay unchanged (asserted below).
-- No table, policy, trigger or grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE fn record; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0080_participant_file_import'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0081 requires the verified 0080 state and migration identity'; END IF;
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p2_assert_submission()');
 -- Only the reviewed 0029 definition, or this migration's own on a rerun, may be replaced.
 IF NOT FOUND OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR fn.prosecdef OR fn.provolatile<>'v'
  OR fn.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR pg_catalog.md5(fn.prosrc) NOT IN ('bdab09e69d63997a88072686a7e8dfbf','0f40da2a9ce96a69f423323036a35d1e')
 THEN RAISE EXCEPTION '0081 requires the reviewed 0029 p2_assert_submission definition'; END IF;
 PERFORM pg_catalog.set_config('pathways_0081.acl',coalesce(fn.proacl::text,''),true);
 -- The skips rely on both deferred completeness triggers calling this function and on the enabled response guard.
 IF (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgfoid=fn.oid AND t.tgdeferrable AND t.tginitdeferred AND t.tgenabled='O'
   AND ((t.tgname='p2_response_complete' AND t.tgrelid='pathways.form_response_values'::pg_catalog.regclass)
    OR (t.tgname='p2_submission_complete' AND t.tgrelid='pathways.form_submissions'::pg_catalog.regclass)))<>2
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname='p2_response' AND t.tgenabled='O'
   AND t.tgrelid='pathways.form_response_values'::pg_catalog.regclass AND t.tgfoid='pathways.p2_guard_response()'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0081 requires the reviewed completeness and response guard triggers'; END IF;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,1);

CREATE OR REPLACE FUNCTION pathways.p2_assert_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent pathways.form_submissions%ROWTYPE; sid uuid; wanted_org uuid; wanted_project uuid; wanted_form uuid; parent_xmin xid;
BEGIN
  IF TG_TABLE_NAME='form_submissions' THEN
    sid:=NEW.id; wanted_org:=NEW.organization_id; wanted_project:=NEW.project_id; wanted_form:=NEW.form_id;
  ELSE
    IF TG_OP='DELETE' THEN
      sid:=OLD.submission_id; wanted_org:=OLD.organization_id; wanted_project:=OLD.project_id; wanted_form:=OLD.form_id;
    ELSE
      sid:=NEW.submission_id; wanted_org:=NEW.organization_id; wanted_project:=NEW.project_id; wanted_form:=NEW.form_id;
    END IF;
  END IF;
  SELECT * INTO parent FROM pathways.form_submissions s
    WHERE s.id=sid AND s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=wanted_form;
  IF parent.id IS NULL THEN
    RAISE EXCEPTION 'Submission validation context unavailable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='form_submissions' THEN
    -- A superseded row version is checked by the event the newer version queued.
    IF NEW IS DISTINCT FROM parent THEN RETURN NULL; END IF;
  ELSE
    SELECT s.xmin INTO parent_xmin FROM pathways.form_submissions s
      WHERE s.id=sid AND s.organization_id=wanted_org AND s.project_id=wanted_project AND s.form_id=wanted_form;
    -- A parent written by this top-level transaction is checked by its own event; one written in a subtransaction gets the full check.
    IF parent_xmin=pg_catalog.xid(pg_catalog.pg_current_xact_id()) THEN RETURN NULL; END IF;
  END IF;
  IF parent.status IN ('VALIDATED','PROCESSED') AND EXISTS (
    WITH f AS MATERIALIZED (
      SELECT * FROM pathways.form_fields f
      WHERE f.organization_id=parent.organization_id AND f.project_id=parent.project_id AND f.form_id=parent.form_id
    ), v AS MATERIALIZED (
      SELECT * FROM pathways.form_response_values v
      WHERE v.submission_id=parent.id AND v.organization_id=parent.organization_id
        AND v.project_id=parent.project_id AND v.form_id=parent.form_id
    )
    SELECT FROM f LEFT JOIN v ON v.field_id=f.id
    WHERE (f.is_required AND v.id IS NULL) OR (v.id IS NOT NULL AND NOT pathways.p2_valid_response(f,v.value)))
  THEN RAISE EXCEPTION 'Validated submission is missing required or valid responses' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

-- Postconditions: the reviewed body, owner, invoker mode, volatility, return type, empty search_path, the saved ACL and the trigger shape.
DO $$ DECLARE fn record; BEGIN
 SELECT p.* INTO fn FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p2_assert_submission()'::pg_catalog.regprocedure;
 IF pg_catalog.md5(fn.prosrc)<>'0f40da2a9ce96a69f423323036a35d1e' OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma'
  OR fn.prosecdef OR fn.provolatile<>'v' OR fn.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0081.acl')
  OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgfoid=fn.oid AND t.tgdeferrable AND t.tginitdeferred AND t.tgenabled='O'
   AND ((t.tgname='p2_response_complete' AND t.tgrelid='pathways.form_response_values'::pg_catalog.regclass)
    OR (t.tgname='p2_submission_complete' AND t.tgrelid='pathways.form_submissions'::pg_catalog.regclass)))<>2
  OR NOT EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgname='p2_response' AND t.tgenabled='O'
   AND t.tgrelid='pathways.form_response_values'::pg_catalog.regclass AND t.tgfoid='pathways.p2_guard_response()'::pg_catalog.regprocedure)
 THEN RAISE EXCEPTION '0081 p2_assert_submission postcondition failed'; END IF;
END $$;
COMMIT;
