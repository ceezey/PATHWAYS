-- cr-pathways-activity-escalation: any role holding activities.escalations.raise raises an escalation on an activity with a
-- reason; the Project Manager forwards it to the program level or resolves it; the Program Manager resolves a forwarded one.
-- One prisma-owned table with composite FKs, RLS enabled and forced, immutable content, column-level UPDATE for the decision
-- fields only and no DELETE. Separation of duties, state order, one open escalation per activity and the acting role are
-- enforced here. Only prisma-owned helpers are used, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0069_evaluation_auto_scoring'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0070 requires the verified 0069 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname='activity_escalations')
 THEN RAISE EXCEPTION '0070 requires the table to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.projects'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.roles'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0070 requires prisma ownership of its referenced tables'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0070 requires prisma ownership of pathways.p05_has_project_permission'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE TABLE pathways.activity_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'OPEN' NOT NULL,
    raised_by_id uuid NOT NULL,
    raised_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    forwarded_by_id uuid,
    forwarded_at timestamp(3) with time zone,
    forward_note text,
    resolved_by_id uuid,
    resolved_at timestamp(3) with time zone,
    resolution_note text,
    resolution_level text,
    client_mutation_id uuid NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT activity_escalations_status_check CHECK (status = ANY (ARRAY['OPEN','FORWARDED','RESOLVED'])),
    CONSTRAINT activity_escalations_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_escalations_forward_note_check CHECK (
     forward_note IS NULL OR char_length(btrim(forward_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_escalations_resolution_note_check CHECK (
     resolution_note IS NULL OR char_length(btrim(resolution_note)) BETWEEN 10 AND 2000),
    CONSTRAINT activity_escalations_level_check CHECK (resolution_level IS NULL OR resolution_level = ANY (ARRAY['PROJECT','PROGRAM'])),
    CONSTRAINT activity_escalations_resolver_check CHECK (
     resolved_by_id IS NULL OR (resolved_by_id <> raised_by_id AND resolved_by_id IS DISTINCT FROM forwarded_by_id)),
    CONSTRAINT activity_escalations_state_check CHECK (
     (status = 'OPEN' AND forwarded_by_id IS NULL AND forwarded_at IS NULL AND forward_note IS NULL
      AND resolved_by_id IS NULL AND resolved_at IS NULL AND resolution_note IS NULL AND resolution_level IS NULL)
     OR (status = 'FORWARDED' AND forwarded_by_id IS NOT NULL AND forwarded_at IS NOT NULL AND forward_note IS NOT NULL
      AND resolved_by_id IS NULL AND resolved_at IS NULL AND resolution_note IS NULL AND resolution_level IS NULL)
     OR (status = 'RESOLVED' AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL
      AND ((resolution_level = 'PROJECT' AND forwarded_by_id IS NULL AND forwarded_at IS NULL AND forward_note IS NULL)
       OR (resolution_level = 'PROGRAM' AND forwarded_by_id IS NOT NULL AND forwarded_at IS NOT NULL AND forward_note IS NOT NULL))))
);

ALTER TABLE pathways.activity_escalations OWNER TO prisma;
ALTER TABLE ONLY pathways.activity_escalations ADD CONSTRAINT activity_escalations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_scope_key UNIQUE (organization_id, project_id, activity_id, id);
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_client_key UNIQUE (organization_id, client_mutation_id);
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_project_fk FOREIGN KEY (organization_id, project_id)
 REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_activity_fk FOREIGN KEY (organization_id, project_id, activity_id)
 REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_raised_by_fk FOREIGN KEY (organization_id, raised_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_forwarded_by_fk FOREIGN KEY (organization_id, forwarded_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.activity_escalations
 ADD CONSTRAINT activity_escalations_resolved_by_fk FOREIGN KEY (organization_id, resolved_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX activity_escalations_open_key ON pathways.activity_escalations
 (organization_id, project_id, activity_id) WHERE status IN ('OPEN','FORWARDED');
CREATE INDEX activity_escalations_status_idx
 ON pathways.activity_escalations (organization_id, project_id, status, raised_at);
CREATE INDEX activity_escalations_raised_by_idx
 ON pathways.activity_escalations (organization_id, raised_by_id);

ALTER TABLE ONLY pathways.activity_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.activity_escalations FORCE ROW LEVEL SECURITY;

-- The context is read directly, never through postgres-owned wrappers.
CREATE POLICY p05_activity_escalations_select ON pathways.activity_escalations
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('activities.escalations.read', activity_escalations.project_id)
 );
CREATE POLICY p05_activity_escalations_insert ON pathways.activity_escalations
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND raised_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND status = 'OPEN'
  AND pathways.p05_has_project_permission('activities.escalations.raise', activity_escalations.project_id)
 );
-- The acting role is checked against the caller's own system_users and roles rows, which pathways_runtime can already read.
CREATE POLICY p05_activity_escalations_update ON pathways.activity_escalations
 FOR UPDATE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND status IN ('OPEN','FORWARDED')
  AND pathways.p05_has_project_permission('activities.escalations.read', activity_escalations.project_id)
 ) WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND ((status = 'FORWARDED'
    AND forwarded_by_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND pathways.p05_has_project_permission('activities.update', activity_escalations.project_id)
    AND EXISTS(SELECT 1 FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id
     WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND u.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid AND r.code = 'PROJECT_MANAGER'))
   OR (status = 'RESOLVED' AND resolution_level = 'PROJECT'
    AND resolved_by_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND pathways.p05_has_project_permission('activities.update', activity_escalations.project_id)
    AND EXISTS(SELECT 1 FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id
     WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND u.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid AND r.code = 'PROJECT_MANAGER'))
   OR (status = 'RESOLVED' AND resolution_level = 'PROGRAM'
    AND resolved_by_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS(SELECT 1 FROM pathways.system_users u JOIN pathways.roles r ON r.id = u.role_id
     WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
      AND u.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid AND r.code = 'PROGRAM_MANAGER')))
 );

-- Steps only move forward: OPEN to FORWARDED, OPEN to RESOLVED (PROJECT), FORWARDED to RESOLVED (PROGRAM, forward fields kept).
CREATE FUNCTION pathways.activity_escalations_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT ((OLD.status='OPEN' AND NEW.status='FORWARDED')
  OR (OLD.status='OPEN' AND NEW.status='RESOLVED' AND NEW.resolution_level='PROJECT')
  OR (OLD.status='FORWARDED' AND NEW.status='RESOLVED' AND NEW.resolution_level='PROGRAM'
   AND NEW.forwarded_by_id IS NOT DISTINCT FROM OLD.forwarded_by_id AND NEW.forwarded_at IS NOT DISTINCT FROM OLD.forwarded_at
   AND NEW.forward_note IS NOT DISTINCT FROM OLD.forward_note))
 THEN RAISE EXCEPTION 'Escalation cannot move from % to %',OLD.status,NEW.status
  USING ERRCODE='23514', CONSTRAINT='activity_escalations_transition_check'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways.activity_escalations_transition() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.activity_escalations_transition() FROM PUBLIC;
CREATE TRIGGER activity_escalations_transition BEFORE UPDATE ON pathways.activity_escalations
 FOR EACH ROW EXECUTE FUNCTION pathways.activity_escalations_transition();

-- Escalation content is immutable; only the decision fields can change, and nothing is deleted.
REVOKE ALL ON TABLE pathways.activity_escalations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT ON TABLE pathways.activity_escalations TO pathways_runtime;
GRANT UPDATE (status, forwarded_by_id, forwarded_at, forward_note, resolved_by_id, resolved_at, resolution_note, resolution_level, updated_at)
 ON TABLE pathways.activity_escalations TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_escalations'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0070 ownership postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_escalations'::pg_catalog.regclass
  AND c.contype='c' AND c.convalidated)<>7
 THEN RAISE EXCEPTION '0070 check constraint postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_escalations'::pg_catalog.regclass
  AND c.contype='f')<>6
 THEN RAISE EXCEPTION '0070 foreign key postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.activity_escalations'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0070 row level security postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.activity_escalations'::pg_catalog.regclass)<>3
 THEN RAISE EXCEPTION '0070 policy postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.activity_escalations','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.activity_escalations','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_escalations','DELETE')
  AND has_column_privilege('pathways_runtime','pathways.activity_escalations','status','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_escalations','reason','UPDATE')
  AND NOT has_column_privilege('pathways_runtime','pathways.activity_escalations','raised_by_id','UPDATE')
  AND NOT has_table_privilege('anon','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role','pathways.activity_escalations','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION '0070 grant postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.activity_escalations'::pg_catalog.regclass
  AND tgname='activity_escalations_transition' AND tgenabled='O')
 THEN RAISE EXCEPTION '0070 transition trigger postcondition failed'; END IF;
END $$;
COMMIT;
