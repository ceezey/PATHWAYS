-- cr-pathways-activity-overdue-explanation: when an activity is overdue, the M&E officer (or a
-- Project Manager, Program Manager or Grant Manager holding monitoring.review) may record a
-- reason category plus a written explanation. It is a prompt, not a block: the activity stays
-- usable whether or not an explanation has been recorded. The history is append-only, with the
-- recording actor and time; no UPDATE or DELETE grant is issued to pathways_runtime.
--
-- Developer decision (2026-09-29, final): category is one of WEATHER, SECURITY, FUNDING,
-- COMMUNITY, LOGISTICS or OTHER; explanation is 10-2000 trimmed characters.
--
-- This migration creates one new prisma-owned table, pathways.activity_overdue_explanations,
-- with composite FKs scoped by (organization_id, project_id) and (organization_id, project_id,
-- activity_id), mirroring the sibling activity_updates child table. RLS is enabled and forced.
-- Its SELECT/INSERT policies mirror activity_updates' scoping (organization match plus
-- pathways.p05_has_project_permission), read directly from current_setting('app.organization_id')
-- and current_setting('app.user_id') rather than the postgres-owned runtime_context_organization/
-- runtime_context_user wrappers: only prisma-owned helpers are used, so no preprovision, role
-- switch or grant lending is needed. No postgres-owned function is called.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0042_proof_session_beneficiary_count'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0043 requires the verified 0042 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname='activity_overdue_explanations')
 THEN RAISE EXCEPTION '0043 requires the table to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.project_activities'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.projects'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.organizations'::pg_catalog.regclass)<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0043 requires prisma ownership of its referenced tables'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
  WHERE oid='pathways.p05_has_project_permission(text,uuid)'::pg_catalog.regprocedure)<>'prisma'
 THEN RAISE EXCEPTION '0043 requires prisma ownership of pathways.p05_has_project_permission'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

CREATE TABLE pathways.activity_overdue_explanations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    category text NOT NULL,
    explanation text NOT NULL,
    recorded_by_id uuid NOT NULL,
    recorded_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    client_mutation_id uuid NOT NULL,
    CONSTRAINT activity_overdue_explanations_category_check CHECK (
     category = ANY (ARRAY['WEATHER','SECURITY','FUNDING','COMMUNITY','LOGISTICS','OTHER'])),
    CONSTRAINT activity_overdue_explanations_explanation_check CHECK (
     char_length(btrim(explanation)) BETWEEN 10 AND 2000)
);

ALTER TABLE pathways.activity_overdue_explanations OWNER TO prisma;

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_scope_key UNIQUE (organization_id, project_id, activity_id, id);

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_client_key UNIQUE (organization_id, client_mutation_id);

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_project_fk FOREIGN KEY (organization_id, project_id)
 REFERENCES pathways.projects(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_activity_fk FOREIGN KEY (organization_id, project_id, activity_id)
 REFERENCES pathways.project_activities(organization_id, project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY pathways.activity_overdue_explanations
 ADD CONSTRAINT activity_overdue_explanations_recorded_by_fk FOREIGN KEY (organization_id, recorded_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX activity_overdue_explanations_activity_time_idx
 ON pathways.activity_overdue_explanations (organization_id, project_id, activity_id, recorded_at);

CREATE INDEX activity_overdue_explanations_recorded_by_idx
 ON pathways.activity_overdue_explanations (organization_id, recorded_by_id);

ALTER TABLE ONLY pathways.activity_overdue_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.activity_overdue_explanations FORCE ROW LEVEL SECURITY;

-- Scoping mirrors activity_updates' p05_activity_updates_select/insert policies, reading the
-- application context directly rather than through the postgres-owned runtime_context_* wrappers.
CREATE POLICY p05_activity_overdue_explanations_select ON pathways.activity_overdue_explanations
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p05_has_project_permission('monitoring.review', activity_overdue_explanations.project_id)
 );

CREATE POLICY p05_activity_overdue_explanations_insert ON pathways.activity_overdue_explanations
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND recorded_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND pathways.p05_has_project_permission('monitoring.review', activity_overdue_explanations.project_id)
 );

-- Append-only: no UPDATE or DELETE grant is issued.
GRANT SELECT, INSERT ON TABLE pathways.activity_overdue_explanations TO pathways_runtime;

-- Postconditions.
DO $$ BEGIN
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='pathways.activity_overdue_explanations'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0043 ownership postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_overdue_explanations'::pg_catalog.regclass
  AND c.conname='activity_overdue_explanations_category_check' AND c.contype='c' AND c.convalidated)
 THEN RAISE EXCEPTION '0043 category constraint postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_overdue_explanations'::pg_catalog.regclass
  AND c.conname='activity_overdue_explanations_explanation_check' AND c.contype='c' AND c.convalidated)
 THEN RAISE EXCEPTION '0043 explanation constraint postcondition failed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_overdue_explanations'::pg_catalog.regclass
  AND c.conname='activity_overdue_explanations_client_key' AND c.contype='u')
 THEN RAISE EXCEPTION '0043 client key postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='pathways.activity_overdue_explanations'::pg_catalog.regclass
  AND c.contype='f')<>4
 THEN RAISE EXCEPTION '0043 foreign key postcondition failed'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid='pathways.activity_overdue_explanations'::pg_catalog.regclass)
 THEN RAISE EXCEPTION '0043 row level security postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.activity_overdue_explanations'::pg_catalog.regclass)<>2
 THEN RAISE EXCEPTION '0043 policy postcondition failed'; END IF;
 IF NOT (has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','SELECT')
  AND has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','INSERT')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','UPDATE')
  AND NOT has_table_privilege('pathways_runtime','pathways.activity_overdue_explanations','DELETE'))
 THEN RAISE EXCEPTION '0043 grant postcondition failed'; END IF;
 IF NOT (has_function_privilege('prisma','pathways.p05_has_project_permission(text,uuid)','EXECUTE')
  AND has_function_privilege('pathways_runtime','pathways.p05_has_project_permission(text,uuid)','EXECUTE'))
 THEN RAISE EXCEPTION '0043 helper privilege postcondition failed'; END IF;
END $$;
COMMIT;
