-- cr-pathways-activity-extension-request: a Project Officer assigned to an activity requests a later planned end date
-- with a reason; the M&E officer verifies or returns it; the Project Manager approves or declines it. Approval moves the
-- activity planned end date through the API's ACTIVITY_UPDATE rule source operation, not through this table.
-- One prisma-owned table with composite FKs, RLS enabled and forced, append-only fields (no UPDATE on request content,
-- no DELETE), column-level UPDATE for the review fields only. Separation of duties and one open request per activity are
-- enforced here. Only prisma-owned helpers are used, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0060_rules_budget_beneficiary_survey_metrics'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0061 requires the verified 0060 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname='activity_extension_requests')
 THEN RAISE EXCEPTION '0061 requires the table to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.projects'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0061 requires prisma ownership of its referenced tables'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0061 requires prisma ownership of pathways.p05_has_project_permission'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE TABLE pathways.activity_extension_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    current_end_date date,
    requested_end_date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'PENDING' NOT NULL,
    requested_by_id uuid NOT NULL,
    requested_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_by_id uuid,
    verified_at timestamp(3) with time zone,
    verification_note text,
    decided_by_id uuid,
    decided_at timestamp(3) with time zone,
    decision_note text,
    client_mutation_id uuid NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT activity_extension_requests_status_check CHECK (
     status = ANY (ARRAY['PENDING','VERIFIED','RETURNED','APPROVED','DECLINED'])),
    CONSTRAINT activity_extension_requests_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_date_check CHECK (current_end_date IS NULL OR requested_end_date > current_end_date),
    CONSTRAINT activity_extension_requests_verification_note_check CHECK (
     verification_note IS NULL OR char_length(btrim(verification_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_decision_note_check CHECK (
     decision_note IS NULL OR char_length(btrim(decision_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_extension_requests_verifier_check CHECK (verified_by_id IS NULL OR verified_by_id <> requested_by_id),
    CONSTRAINT activity_extension_requests_decider_check CHECK (
     decided_by_id IS NULL OR (decided_by_id <> requested_by_id AND decided_by_id IS DISTINCT FROM verified_by_id)),
    CONSTRAINT activity_extension_requests_state_check CHECK (
     (status = 'PENDING' AND verified_by_id IS NULL AND decided_by_id IS NULL)
     OR (status IN ('VERIFIED','RETURNED') AND verified_by_id IS NOT NULL AND verified_at IS NOT NULL AND decided_by_id IS NULL)
     OR (status IN ('APPROVED','DECLINED') AND verified_by_id IS NOT NULL AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL))
);

ALTER TABLE pathways.activity_extension_requests OWNER TO prisma;
ALTER TABLE ONLY pathways.activity_extension_requests ADD CONSTRAINT activity_extension_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_scope_key UNIQUE (organization_id, project_id, activity_id, id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_client_key UNIQUE (organization_id, client_mutation_id);
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_project_fk FOREIGN KEY (organization_id, project_id)
 REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_activity_fk FOREIGN KEY (organization_id, project_id, activity_id)
 REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_requested_by_fk FOREIGN KEY (organization_id, requested_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_verified_by_fk FOREIGN KEY (organization_id, verified_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_extension_requests
 ADD CONSTRAINT activity_extension_requests_decided_by_fk FOREIGN KEY (organization_id, decided_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX activity_extension_requests_open_key ON pathways.activity_extension_requests
 (organization_id, project_id, activity_id) WHERE status IN ('PENDING','VERIFIED');
CREATE INDEX activity_extension_requests_status_idx
 ON pathways.activity_extension_requests (organization_id, project_id, status, requested_at);
CREATE INDEX activity_extension_requests_requested_by_idx
 ON pathways.activity_extension_requests (organization_id, requested_by_id);

ALTER TABLE ONLY pathways.activity_extension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.activity_extension_requests FORCE ROW LEVEL SECURITY;

-- Reads follow activity read scope; the context is read directly, never through postgres-owned wrappers.
CREATE POLICY p05_activity_extension_requests_select ON pathways.activity_extension_requests
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('activities.read', activity_extension_requests.project_id)
 );
CREATE POLICY p05_activity_extension_requests_insert ON pathways.activity_extension_requests
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND requested_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND status = 'PENDING'
  AND pathways.p05_has_project_permission('activities.proof.submit', activity_extension_requests.project_id)
 );
CREATE POLICY p05_activity_extension_requests_update ON pathways.activity_extension_requests
 FOR UPDATE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND (pathways.p05_has_project_permission('evidence.review', activity_extension_requests.project_id)
   OR pathways.p05_has_project_permission('activities.update', activity_extension_requests.project_id))
 ) WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND (verified_by_id IS NULL OR decided_by_id IS NOT NULL OR verified_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
  AND (decided_by_id IS NULL OR decided_by_id = nullif(current_setting('app.user_id', true), '')::uuid)
 );

-- Review steps only move forward: PENDING to VERIFIED or RETURNED, VERIFIED to APPROVED or DECLINED.
CREATE FUNCTION pathways.activity_extension_requests_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','RETURNED'))
  OR (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','DECLINED')
   AND NEW.verified_by_id=OLD.verified_by_id AND NEW.verified_at=OLD.verified_at
   AND NEW.verification_note IS NOT DISTINCT FROM OLD.verification_note))
 THEN RAISE EXCEPTION 'Extension request review cannot move from % to %',OLD.status,NEW.status
  USING ERRCODE='23514', CONSTRAINT='activity_extension_requests_transition_check'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways.activity_extension_requests_transition() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.activity_extension_requests_transition() FROM PUBLIC;
CREATE TRIGGER activity_extension_requests_transition BEFORE UPDATE ON pathways.activity_extension_requests
 FOR EACH ROW EXECUTE FUNCTION pathways.activity_extension_requests_transition();

-- Request content is immutable; only the review fields can change, and nothing is deleted.
REVOKE ALL ON TABLE pathways.activity_extension_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT ON TABLE pathways.activity_extension_requests TO pathways_runtime;
GRANT UPDATE (status, verified_by_id, verified_at, verification_note, decided_by_id, decided_at, decision_note, updated_at)
 ON TABLE pathways.activity_extension_requests TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_extension_requests'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0061 ownership postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_extension_requests'::pg_catalog.regclass
  AND c.contype='c' AND c.convalidated)<>8
 THEN RAISE EXCEPTION '0061 check constraint postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_extension_requests'::pg_catalog.regclass
  AND c.contype='f')<>6
 THEN RAISE EXCEPTION '0061 foreign key postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.activity_extension_requests'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0061 row level security postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.activity_extension_requests'::pg_catalog.regclass)<>3
 THEN RAISE EXCEPTION '0061 policy postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.activity_extension_requests','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.activity_extension_requests','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_extension_requests','DELETE')
  AND has_column_privilege('pathways_runtime','pathways.activity_extension_requests','status','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','reason','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_extension_requests','requested_end_date','UPDATE')
  AND NOT has_table_privilege('anon','pathways.activity_extension_requests','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated','pathways.activity_extension_requests','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role','pathways.activity_extension_requests','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION '0061 grant postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.activity_extension_requests'::pg_catalog.regclass
  AND tgname='activity_extension_requests_transition' AND tgenabled='O')
 THEN RAISE EXCEPTION '0061 transition trigger postcondition failed'; END IF;
END $$;
COMMIT;
