-- Proposed atomic 0031 F10/F11 source. No activation/credentials.
BEGIN;
DO $$ BEGIN IF current_user<>'prisma' OR NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='0030_core_profile_partners' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION '0031 requires the verified 0030 baseline'; END IF; END $$;
-- SQL wrappers have forward references; final native fixtures must execute every ABI.
SET LOCAL check_function_bodies=off;

-- runtime-prerequisites.proposed.sql
-- DBA exact preprovision required; this migration never creates roles.
DO $$ DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
BEGIN
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 IF postgres_oid IS NULL OR prisma_oid IS NULL OR hosted IS NULL OR
  (NOT hosted AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE oid=postgres_oid AND rolsuper)) THEN
  RAISE EXCEPTION 'Exact DBA role provisioning required' USING ERRCODE='55000';
 END IF;
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner','pathways_rules_worker','pathways_rules_sweeper'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option) OR (role_name<>ALL(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) AND m.member=prisma_oid AND m.grantor=postgres_oid AND NOT m.admin_option AND m.inherit_option AND m.set_option)))
   OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND
    (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) <> (CASE WHEN hosted THEN 1 ELSE 0 END)
   OR (role_name<>ALL(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) AND (SELECT count(*) FROM pg_catalog.pg_auth_members m
    WHERE m.roleid=existing.oid AND m.member=prisma_oid AND m.grantor=postgres_oid AND NOT m.admin_option AND m.inherit_option AND m.set_option)<>1)
   OR EXISTS(SELECT FROM pg_catalog.pg_roles app WHERE app.rolname=ANY(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker','pathways_rules_sweeper'])
    AND app.oid<>existing.oid AND (pg_catalog.pg_has_role(app.oid,existing.oid,'MEMBER') OR pg_catalog.pg_has_role(app.oid,existing.oid,'USAGE') OR pg_catalog.pg_has_role(app.oid,existing.oid,'SET')))
 THEN
   RAISE EXCEPTION 'Exact DBA role provisioning required' USING ERRCODE='55000';
  END IF;
 END LOOP;
END $$;
CREATE SCHEMA pathways_rules_internal AUTHORIZATION rules_store_owner;
GRANT USAGE,CREATE ON SCHEMA pathways_rules_internal TO prisma,rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
REVOKE ALL ON SCHEMA pathways_rules_internal FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT USAGE ON SCHEMA pathways_rules_internal,pathways TO rules_lease_owner,rules_projection_owner,rules_commit_owner,
 rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,
 rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner,pathways_rules_worker,pathways_rules_sweeper;
-- Every actual CREATE is also individually revoked in final atomic extraction.
ALTER DEFAULT PRIVILEGES IN SCHEMA pathways_rules_internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pathways_rules_internal REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE pathways_rules_internal.project_state (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,lock_revision bigint NOT NULL DEFAULT 0 CHECK(lock_revision>=0),
 source_watermark bigint NOT NULL DEFAULT 0 CHECK(source_watermark>=0),required_generation bigint NOT NULL DEFAULT 0 CHECK(required_generation>=0),
 acknowledged_generation bigint NOT NULL DEFAULT 0 CHECK(acknowledged_generation>=0),evaluation_sequence bigint NOT NULL DEFAULT 0 CHECK(evaluation_sequence>=0),
 PRIMARY KEY(organization_id,project_id),CHECK(acknowledged_generation<=required_generation)
);
-- No project FK: first state lock must precede every existing source row lock.
CREATE TABLE pathways_rules_internal.calendar_configuration (
 singleton boolean PRIMARY KEY CHECK(singleton),zone text NOT NULL CHECK(zone='Asia/Manila'),version bigint NOT NULL CHECK(version>0),
 approval_reference text NOT NULL CHECK(approval_reference='cr-pathways-f10-f11-runtime-authority@2026-09-26'),
 approved_proposal_sha256 text NOT NULL CHECK(approved_proposal_sha256='a469543c660a6e4fae6c8b7939b2fd27eb5cd9f7c09525ceca7037bfcfa26016')
);
INSERT INTO pathways_rules_internal.calendar_configuration VALUES(true,'Asia/Manila',1,
 'cr-pathways-f10-f11-runtime-authority@2026-09-26','a469543c660a6e4fae6c8b7939b2fd27eb5cd9f7c09525ceca7037bfcfa26016');
CREATE TABLE pathways_rules_internal.jobs (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),organization_id uuid NOT NULL,project_id uuid NOT NULL,
 pending_since timestamptz NOT NULL,next_attempt_at timestamptz NOT NULL,last_attempt_at timestamptz,
 state text NOT NULL CHECK(state IN ('PENDING','LEASED','FAILED','IDLE')),
 lease_hash bytea CHECK(lease_hash IS NULL OR pg_catalog.octet_length(lease_hash)=32),lease_session name,lease_expires_at timestamptz,
 claim_generation bigint CHECK(claim_generation IS NULL OR claim_generation>=0),claim_watermark bigint CHECK(claim_watermark IS NULL OR claim_watermark>=0),
 stale_attempts integer NOT NULL DEFAULT 0 CHECK(stale_attempts>=0),operational_failures integer NOT NULL DEFAULT 0 CHECK(operational_failures>=0),
 UNIQUE(organization_id,project_id),UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways_rules_internal.project_state(organization_id,project_id),
 CHECK((state='LEASED' AND lease_hash IS NOT NULL AND lease_session IS NOT NULL AND lease_expires_at IS NOT NULL
  AND claim_generation IS NOT NULL AND claim_watermark IS NOT NULL)
  OR (state<>'LEASED' AND lease_hash IS NULL AND lease_session IS NULL AND lease_expires_at IS NULL AND claim_generation IS NULL AND claim_watermark IS NULL))
);
CREATE INDEX f10_jobs_ready ON pathways_rules_internal.jobs(next_attempt_at,last_attempt_at,pending_since,id) WHERE state IN ('PENDING','LEASED');
CREATE TABLE pathways_rules_internal.work_items (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,project_id uuid NOT NULL,generation bigint NOT NULL CHECK(generation>0),
 identity_kind text NOT NULL CHECK(identity_kind IN ('SOURCE','HOURLY','RULE','ELIGIBILITY','CALENDAR')),
 identity_id text NOT NULL CHECK(pg_catalog.octet_length(identity_id) BETWEEN 1 AND 256),
 source_watermark bigint CHECK(source_watermark IS NULL OR source_watermark>=0),
 source_kind text CHECK(source_kind IS NULL OR source_kind IN ('PROJECT','ACTIVITY','INDICATOR','INDICATOR_MEASUREMENT')),
 source_record_id uuid,actor_id uuid,queued_at timestamptz NOT NULL,
 UNIQUE(organization_id,project_id,id),UNIQUE(organization_id,project_id,generation),UNIQUE(organization_id,project_id,identity_kind,identity_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways_rules_internal.project_state(organization_id,project_id),
 CHECK(identity_kind<>'SOURCE' OR (identity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND source_watermark IS NOT NULL AND source_kind IS NOT NULL AND source_record_id IS NOT NULL AND actor_id IS NOT NULL)),
 CHECK(identity_kind NOT IN ('HOURLY','ELIGIBILITY','CALENDAR') OR actor_id IS NULL)
);
ALTER TABLE pathways_rules_internal.project_state OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.calendar_configuration OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.jobs OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.work_items OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.project_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.project_state FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.calendar_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.calendar_configuration FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.work_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.project_state,pathways_rules_internal.calendar_configuration,
 pathways_rules_internal.jobs,pathways_rules_internal.work_items FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- runtime-readiness.proposed.sql
-- Owner-only catalog readiness; no new application capability or mutable flag.
CREATE FUNCTION pathways_rules_internal.assert_runtime_provisioned()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
BEGIN
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 IF postgres_oid IS NULL OR prisma_oid IS NULL OR hosted IS NULL OR
  (NOT hosted AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE oid=postgres_oid AND rolsuper)) THEN
  RAISE EXCEPTION 'Rules runtime provisioning incomplete' USING ERRCODE='42501';
 END IF;
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner','pathways_rules_worker','pathways_rules_sweeper'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)))
   OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND
    (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)) <> (CASE WHEN hosted THEN 1 ELSE 0 END)
   OR EXISTS(SELECT FROM pg_catalog.pg_roles app WHERE app.rolname=ANY(ARRAY['anon','authenticated','service_role','pathways_runtime','pathways_rules_worker','pathways_rules_sweeper'])
    AND app.oid<>existing.oid AND (pg_catalog.pg_has_role(app.oid,existing.oid,'MEMBER') OR pg_catalog.pg_has_role(app.oid,existing.oid,'USAGE') OR pg_catalog.pg_has_role(app.oid,existing.oid,'SET')))
   OR pg_catalog.has_database_privilege(existing.oid,pg_catalog.current_database(),'CREATE')
   OR pg_catalog.has_database_privilege(existing.oid,pg_catalog.current_database(),'TEMPORARY')
   OR EXISTS(SELECT FROM pg_catalog.pg_namespace n WHERE pg_catalog.has_schema_privilege(existing.oid,n.oid,'CREATE')
    AND NOT(role_name='rules_store_owner' AND n.nspname='pathways_rules_internal' AND n.nspowner=existing.oid))
 THEN
   RAISE EXCEPTION 'Rules runtime provisioning incomplete' USING ERRCODE='42501';
  END IF;
 END LOOP;
END $$;
ALTER FUNCTION pathways_rules_internal.assert_runtime_provisioned() OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_runtime_provisioned() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- runtime-schema.proposed.sql
-- Proposed0031 additive final runtime schema. Not installed/executed.
-- Execute after provisioned safe split owners/private schema and source state,
-- calendar/jobs/work-items DDL; do NOT reuse obsolete fixture prerequisites.
ALTER TABLE pathways.alert_rules
 ADD COLUMN project_id uuid,
 ADD COLUMN runtime_contract_version text CHECK(runtime_contract_version IS NULL OR runtime_contract_version='f10.v1'),
 ADD COLUMN logical_rule_id uuid,
 ADD COLUMN display_code text,
 ADD COLUMN template_origin_id uuid,
 ADD COLUMN conditions_json jsonb,
 ADD COLUMN definition_digest bytea,
 ADD CONSTRAINT f10_rule_project_scope FOREIGN KEY(organization_id,project_id) REFERENCES pathways.projects(organization_id,id),
 ADD CONSTRAINT f10_rule_template_scope FOREIGN KEY(organization_id,template_origin_id) REFERENCES pathways.alert_rules(organization_id,id),
 ADD CONSTRAINT f10_rule_runtime_shape CHECK(runtime_contract_version IS NULL OR
  (logical_rule_id IS NOT NULL AND display_code IS NOT NULL AND display_code ~ '^[A-Z][A-Z0-9_-]{1,79}$'
   AND code=CASE WHEN project_id IS NULL THEN 'F10T:'||logical_rule_id::text ELSE 'F10P:'||project_id::text||':'||logical_rule_id::text END
   AND conditions_json IS NOT NULL AND pg_catalog.jsonb_typeof(conditions_json)='object'
   AND definition_digest IS NOT NULL AND pg_catalog.octet_length(definition_digest)=32)),
 ADD CONSTRAINT f10_rule_scoped_id UNIQUE(organization_id,project_id,id);
CREATE UNIQUE INDEX f10_rule_logical_version ON pathways.alert_rules(organization_id,project_id,logical_rule_id,version)
 WHERE runtime_contract_version='f10.v1';
CREATE UNIQUE INDEX f10_one_active_logical_rule ON pathways.alert_rules(organization_id,project_id,logical_rule_id)
 WHERE runtime_contract_version='f10.v1' AND status='ACTIVE';
CREATE INDEX f10_rule_directory ON pathways.alert_rules(organization_id,project_id,created_at,id)
 WHERE runtime_contract_version='f10.v1';
ALTER TABLE pathways.rule_based_alerts
 ALTER COLUMN evaluated_by_id DROP NOT NULL,
 ADD COLUMN runtime_contract_version text CHECK(runtime_contract_version IS NULL OR runtime_contract_version='f10.v1'),
 ADD COLUMN attribution text NOT NULL DEFAULT 'HUMAN' CHECK(attribution IN ('HUMAN','SYSTEM')),
 ADD COLUMN lifecycle text,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN episode_number bigint,
 ADD COLUMN affected_kind text,
 ADD COLUMN affected_id uuid,
 ADD COLUMN latest_evaluation_id uuid,
 ADD COLUMN origin_snapshot_id uuid,
 ADD CONSTRAINT f10_alert_runtime_shape CHECK(
  (runtime_contract_version IS NULL AND attribution='HUMAN' AND evaluated_by_id IS NOT NULL
   AND lifecycle IS NULL AND episode_number IS NULL AND affected_kind IS NULL AND affected_id IS NULL AND latest_evaluation_id IS NULL AND origin_snapshot_id IS NULL)
  OR (runtime_contract_version IS NOT NULL AND runtime_contract_version='f10.v1' AND attribution='SYSTEM' AND evaluated_by_id IS NULL
   AND lifecycle IS NOT NULL AND lifecycle IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')
   AND episode_number IS NOT NULL AND episode_number>0 AND affected_kind IN ('PROJECT','INDICATOR','ACTIVITY')
   AND affected_kind IS NOT NULL AND affected_id IS NOT NULL AND latest_evaluation_id IS NOT NULL AND origin_snapshot_id IS NOT NULL));
CREATE UNIQUE INDEX f10_alert_episode ON pathways.rule_based_alerts(organization_id,project_id,rule_id,affected_kind,affected_id,episode_number)
 WHERE runtime_contract_version='f10.v1';
CREATE INDEX f10_alert_directory ON pathways.rule_based_alerts(organization_id,project_id,evaluated_at,id)
 WHERE runtime_contract_version='f10.v1';
ALTER TABLE pathways.decision_recommendations
 ALTER COLUMN proposed_by_id DROP NOT NULL,
 ADD COLUMN attribution text NOT NULL DEFAULT 'HUMAN' CHECK(attribution IN ('HUMAN','SYSTEM'));
-- revision/runtime_contract_version/private_review_id and exact original+runtime
-- p3_decision_values branches come from recommendation-private-review.sql.
ALTER TABLE pathways_rules_internal.project_state ADD COLUMN bootstrap_complete boolean NOT NULL DEFAULT false;
CREATE TABLE pathways_rules_internal.eligibility (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL,project_id uuid NOT NULL,indicator_id uuid NOT NULL,
 definition_revision integer NOT NULL CHECK(definition_revision>0),
 classification_revision bigint NOT NULL CHECK(classification_revision>0),
 decision text NOT NULL CHECK(decision IN ('ALLOWED_NON_SENSITIVE','DENIED')),
 approved_at timestamptz NOT NULL,expires_at timestamptz,
 approval_reference uuid NOT NULL,
 source_fingerprint bytea NOT NULL CHECK(pg_catalog.octet_length(source_fingerprint)=32),
 audience text NOT NULL CHECK(audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS'),
 UNIQUE(organization_id,project_id,id),UNIQUE(organization_id,project_id,indicator_id,classification_revision),
 CHECK(expires_at IS NULL OR expires_at>approved_at),
 FOREIGN KEY(organization_id,project_id,indicator_id) REFERENCES pathways.project_indicators(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.rule_bindings (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,rule_version_id uuid NOT NULL,condition_id text NOT NULL CHECK(condition_id ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
 metric_key text NOT NULL,indicator_id uuid,activity_id uuid,definition_revision integer,classification_id uuid,
 source_fingerprint bytea,
 PRIMARY KEY(organization_id,project_id,rule_version_id,condition_id),
 FOREIGN KEY(organization_id,project_id,rule_version_id) REFERENCES pathways.alert_rules(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,indicator_id) REFERENCES pathways.project_indicators(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,activity_id) REFERENCES pathways.project_activities(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,classification_id) REFERENCES pathways_rules_internal.eligibility(organization_id,project_id,id),
 CHECK((metric_key IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT')
   AND indicator_id IS NOT NULL AND activity_id IS NULL AND definition_revision>0 AND definition_revision IS NOT NULL
   AND classification_id IS NOT NULL AND source_fingerprint IS NOT NULL AND pg_catalog.octet_length(source_fingerprint)=32)
  OR (metric_key='ACTIVITY_OVERDUE_DAYS' AND activity_id IS NOT NULL AND indicator_id IS NULL
   AND definition_revision IS NULL AND classification_id IS NULL AND source_fingerprint IS NULL)
  OR (metric_key IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
    'ACTIVITY_OVERDUE_COUNT','ACTIVITY_COMPLETION_PERCENT')
   AND indicator_id IS NULL AND activity_id IS NULL AND definition_revision IS NULL AND classification_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX f10_eligibility_latest ON pathways_rules_internal.eligibility(organization_id,project_id,indicator_id,classification_revision DESC);
CREATE TABLE pathways_rules_internal.projection_context (
 transaction_id xid8 NOT NULL,backend_pid integer NOT NULL,login_name name NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('CAPTURE','COMMIT')),
 job_id uuid NOT NULL,snapshot_id uuid,lease_hash bytea NOT NULL CHECK(pg_catalog.octet_length(lease_hash)=32),
 organization_id uuid NOT NULL,project_id uuid NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid,login_name),
 CHECK((purpose='CAPTURE' AND snapshot_id IS NULL) OR (purpose='COMMIT' AND snapshot_id IS NOT NULL))
);
CREATE TABLE pathways_rules_internal.snapshots (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),job_id uuid NOT NULL,
 organization_id uuid NOT NULL,project_id uuid NOT NULL,
 lease_hash bytea NOT NULL CHECK(pg_catalog.octet_length(lease_hash)=32),lease_session name NOT NULL,
 required_generation bigint NOT NULL CHECK(required_generation>=0),source_watermark bigint NOT NULL CHECK(source_watermark>=0),
 calendar_version bigint NOT NULL CHECK(calendar_version>0),as_of timestamptz NOT NULL,reporting_date date NOT NULL,zone text NOT NULL,
 manifest jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(manifest)='array'),
 observations jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(observations)='object'),
 source_inputs jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(source_inputs)='object'),
 canonical_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(canonical_payload)='object'),
 digest bytea NOT NULL CHECK(pg_catalog.octet_length(digest)=32),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,job_id) REFERENCES pathways_rules_internal.jobs(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.acknowledgements (
 snapshot_id uuid PRIMARY KEY,job_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 snapshot_digest bytea NOT NULL CHECK(pg_catalog.octet_length(snapshot_digest)=32),
 lease_hash bytea NOT NULL CHECK(pg_catalog.octet_length(lease_hash)=32),lease_session name NOT NULL,
 required_generation bigint NOT NULL,source_watermark bigint NOT NULL,calendar_version bigint NOT NULL,
 evaluation_sequence bigint NOT NULL CHECK(evaluation_sequence>0),committed_at timestamptz NOT NULL,
 UNIQUE(organization_id,project_id,snapshot_id),UNIQUE(organization_id,project_id,evaluation_sequence),
 FOREIGN KEY(organization_id,project_id,snapshot_id) REFERENCES pathways_rules_internal.snapshots(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,job_id) REFERENCES pathways_rules_internal.jobs(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.evaluations (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),snapshot_id uuid NOT NULL,
 organization_id uuid NOT NULL,project_id uuid NOT NULL,rule_version_id uuid NOT NULL,
 affected_kind text NOT NULL CHECK(affected_kind IN ('PROJECT','INDICATOR','ACTIVITY')),affected_id uuid NOT NULL,
 evaluation_sequence bigint NOT NULL CHECK(evaluation_sequence>0),result text NOT NULL CHECK(result IN ('TRUE','FALSE','UNAVAILABLE')),
 evidence jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(evidence)='object'),superseded boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,project_id,id),UNIQUE(snapshot_id,rule_version_id,affected_kind,affected_id),
 FOREIGN KEY(organization_id,project_id,snapshot_id) REFERENCES pathways_rules_internal.snapshots(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,rule_version_id) REFERENCES pathways.alert_rules(organization_id,project_id,id)
);
ALTER TABLE pathways.rule_based_alerts ADD CONSTRAINT f10_alert_latest_evaluation
 FOREIGN KEY(organization_id,project_id,latest_evaluation_id) REFERENCES pathways_rules_internal.evaluations(organization_id,project_id,id);
CREATE TABLE pathways_rules_internal.episode_cursors (
 organization_id uuid NOT NULL,project_id uuid NOT NULL,rule_version_id uuid NOT NULL,
 affected_kind text NOT NULL CHECK(affected_kind IN ('PROJECT','INDICATOR','ACTIVITY')),affected_id uuid NOT NULL,
 last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence>=0),latched boolean NOT NULL DEFAULT false,
 last_result text CHECK(last_result IN ('TRUE','FALSE','UNAVAILABLE')),episode_number bigint NOT NULL DEFAULT 0 CHECK(episode_number>=0),alert_id uuid,
 CHECK((last_sequence=0)=(last_result IS NULL)),
 CHECK((episode_number=0 AND alert_id IS NULL AND NOT latched) OR (episode_number>0 AND alert_id IS NOT NULL)),
 PRIMARY KEY(organization_id,project_id,rule_version_id,affected_kind,affected_id),
 FOREIGN KEY(organization_id,project_id,rule_version_id) REFERENCES pathways.alert_rules(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.work_coverage (
 work_item_id uuid PRIMARY KEY,organization_id uuid NOT NULL,project_id uuid NOT NULL,acknowledgement_snapshot_id uuid NOT NULL,
 FOREIGN KEY(organization_id,project_id,work_item_id) REFERENCES pathways_rules_internal.work_items(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,acknowledgement_snapshot_id) REFERENCES pathways_rules_internal.acknowledgements(organization_id,project_id,snapshot_id)
);
CREATE TABLE pathways_rules_internal.sweep_cursor (
 singleton boolean PRIMARY KEY CHECK(singleton),slot timestamptz NOT NULL,last_organization_id uuid,last_project_id uuid,
 exhausted boolean NOT NULL DEFAULT false,CHECK((last_organization_id IS NULL)=(last_project_id IS NULL))
);
INSERT INTO pathways_rules_internal.sweep_cursor VALUES(true,pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',NULL,NULL,false);
CREATE INDEX f10_evaluation_history ON pathways_rules_internal.evaluations(organization_id,project_id,rule_version_id,evaluation_sequence,id);
ALTER TABLE pathways.rule_based_alerts ADD CONSTRAINT f10_alert_origin_snapshot
 FOREIGN KEY(organization_id,project_id,origin_snapshot_id) REFERENCES pathways_rules_internal.snapshots(organization_id,project_id,id);
-- All private table ownership/FORCE-RLS/REVOKE statements are installed in the
-- explicit final owner-policy section; no default/public/login access is allowed.


-- recommendation-private-review.proposed.sql
-- PROPOSAL ONLY / NOT EXECUTED. Install only in reviewed forward migration.
-- Prerequisites: exact outcome marker/policies/owners and runtime trigger validator.
ALTER TABLE pathways.decision_recommendations
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  ADD COLUMN runtime_contract_version text,
  ADD COLUMN private_review_id uuid;
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT f10_recommendation_actor CHECK(
  (runtime_contract_version IS NULL AND attribution='HUMAN' AND proposed_by_id IS NOT NULL)
  OR (runtime_contract_version IS NOT NULL AND runtime_contract_version='f10.v1' AND attribution='SYSTEM' AND proposed_by_id IS NULL));
CREATE TABLE pathways_rules_internal.recommendation_reviews (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  recommendation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_receipt_id uuid NOT NULL,
  note text NOT NULL CHECK(pg_catalog.length(pg_catalog.btrim(note)) BETWEEN 1 AND 2000),
  occurred_at timestamptz(3) NOT NULL,
  UNIQUE(organization_id,project_id,recommendation_id,id),
  UNIQUE(organization_id,project_id,recommendation_id),
  FOREIGN KEY(organization_id,project_id,recommendation_id)
    REFERENCES pathways.decision_recommendations(organization_id,project_id,id)
);
-- Existing scoped recommendation UNIQUE must be installed first if absent.
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT f10_private_review_scope
  FOREIGN KEY(organization_id,project_id,id,private_review_id)
  REFERENCES pathways_rules_internal.recommendation_reviews
    (organization_id,project_id,recommendation_id,id);
-- No legacy row backfill/discriminator promotion; original expression retained below.
ALTER TABLE pathways.decision_recommendations DROP CONSTRAINT p3_decision_values;
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT p3_decision_values CHECK (
  (runtime_contract_version IS NULL AND private_review_id IS NULL AND
(((length(btrim(title)) > 0) AND (length(btrim(text)) > 0) AND (((source_rule_recommendation_id IS NULL) AND (source_snapshot IS NULL)) OR ((source_rule_recommendation_id IS NOT NULL) AND (alert_id IS NOT NULL) AND (jsonb_typeof(source_snapshot) = 'object'::text))) AND (((status = 'NEW'::pathways.decision_status) AND (reviewed_by_id IS NULL) AND (reviewed_at IS NULL) AND (review_note IS NULL) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = 'REVIEWED'::pathways.decision_status) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NULL) AND (outcome_by_id IS NULL) AND (outcome_at IS NULL) AND (outcome_note IS NULL)) OR ((status = ANY (ARRAY['RESOLVED'::pathways.decision_status, 'DISMISSED'::pathways.decision_status])) AND (reviewed_by_id IS NOT NULL) AND (reviewed_at >= proposed_at) AND (review_note IS NOT NULL) AND (length(btrim(review_note)) > 0) AND (outcome IS NOT NULL) AND (outcome_by_id IS NOT NULL) AND (outcome_at >= reviewed_at) AND (outcome_note IS NOT NULL) AND (length(btrim(outcome_note)) > 0))) AND ((reviewed_by_id IS NULL) OR (reviewed_by_id <> proposed_by_id)) AND ((outcome_by_id IS NULL) OR (outcome_by_id <> proposed_by_id)) AND ((status <> 'DISMISSED'::pathways.decision_status) OR (outcome = 'DECLINE'::pathways.decision_outcome)) AND ((status <> 'RESOLVED'::pathways.decision_status) OR (outcome <> 'DECLINE'::pathways.decision_outcome)))))
  OR
  (runtime_contract_version IS NOT NULL AND runtime_contract_version='f10.v1'
    AND pg_catalog.length(pg_catalog.btrim(title))>0
    AND pg_catalog.length(pg_catalog.btrim(text))>0
    AND source_rule_recommendation_id IS NOT NULL AND alert_id IS NOT NULL
    AND source_snapshot IS NOT NULL AND pg_catalog.jsonb_typeof(source_snapshot)='object'
    AND review_note IS NULL AND outcome IS NULL AND outcome_by_id IS NULL
    AND outcome_at IS NULL AND outcome_note IS NULL
    AND ((status='NEW' AND reviewed_by_id IS NULL AND reviewed_at IS NULL
      AND private_review_id IS NULL)
      OR (status='REVIEWED' AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL
        AND reviewed_at>=proposed_at AND private_review_id IS NOT NULL))
    AND (reviewed_by_id IS NULL OR proposed_by_id IS NULL OR reviewed_by_id<>proposed_by_id))
);
ALTER TABLE pathways_rules_internal.recommendation_reviews OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.recommendation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.recommendation_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.recommendation_reviews
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,
    pathways_rules_worker,pathways_rules_sweeper,rules_human_owner;
-- Grant note SELECT/INSERT only to rules_outcome_owner after exact FEATURE_HUMAN
-- actor/operation/preview-bound RLS is supplied. No interim permissive policy.
-- Trigger validator must enforce immutable discriminator, private event actor/time/
-- receipt identity, NEW->REVIEWED only, exactly revision+1 on successful review or
-- newly appended outcome, and no revision increment on a committed retry.
-- This excerpt deliberately grants NO authority before those missing bodies.


-- feature-human-storage.proposed.sql
-- Exact candidate0031 packet. Not installed or executed. Apply atomically only
-- after full0031 owners/runtime discriminator/legacy guards and C review.
-- Existing rules_store_owner/rules_outcome_owner/rules_human_owner are split
-- NOLOGIN,NOBYPASSRLS owners from the approved authority matrix.
CREATE TABLE pathways_rules_internal.feature_operation_context (
 transaction_id xid8 NOT NULL, backend_pid integer NOT NULL, login_name name NOT NULL,
 organization_id uuid NOT NULL, project_id uuid NOT NULL, actor_id uuid NOT NULL,
 operation_id uuid NOT NULL, purpose text NOT NULL CHECK(purpose='FEATURE_HUMAN'),
 operation_code text NOT NULL CHECK(operation_code IN
  ('ALERT_REVIEW','ALERT_DISPOSITION','ALERT_PREVIEW','ALERT_CONFIRM',
   'RECOMMENDATION_REVIEW','RECOMMENDATION_PREVIEW','RECOMMENDATION_CONFIRM')),
 alert_id uuid NOT NULL, recommendation_id uuid,
 preview_id uuid, canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
 PRIMARY KEY(transaction_id,backend_pid,login_name),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES pathways.decision_recommendations(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.feature_operation_receipts (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL, project_id uuid NOT NULL, actor_id uuid NOT NULL,
 client_operation_id uuid NOT NULL, operation_code text NOT NULL,
 alert_id uuid NOT NULL, recommendation_id uuid, preview_id uuid,
 canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
 safe_result jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(safe_result)='object'),
 occurred_at timestamptz(3) NOT NULL,
 UNIQUE(organization_id,project_id,id),
 UNIQUE(organization_id,actor_id,client_operation_id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES pathways.decision_recommendations(organization_id,project_id,id)
);
CREATE TABLE pathways_rules_internal.alert_reviews (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL, project_id uuid NOT NULL, alert_id uuid NOT NULL,
 actor_id uuid NOT NULL, operation_receipt_id uuid NOT NULL,
 state_before text NOT NULL CHECK(state_before IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')),
 state_after text NOT NULL CHECK(state_after=CASE WHEN state_before='NEW' THEN 'REVIEWED' ELSE state_before END),
 note text NOT NULL CHECK(pg_catalog.length(pg_catalog.btrim(note)) BETWEEN 1 AND 2000),
 occurred_at timestamptz(3) NOT NULL,
 UNIQUE(organization_id,project_id,id),
 UNIQUE(organization_id,project_id,alert_id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,operation_receipt_id) REFERENCES pathways_rules_internal.feature_operation_receipts(organization_id,project_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE pathways_rules_internal.lifecycle_events (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL, project_id uuid NOT NULL, alert_id uuid NOT NULL,
 actor_kind text NOT NULL CHECK(actor_kind IN ('HUMAN','SYSTEM')), actor_id uuid,
 state_before text, state_after text NOT NULL CHECK(state_after IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')),
 note text, evaluation_id uuid, operation_receipt_id uuid,
 occurred_at timestamptz(3) NOT NULL,
 CHECK((actor_kind='HUMAN' AND actor_id IS NOT NULL AND operation_receipt_id IS NOT NULL AND evaluation_id IS NULL)
    OR (actor_kind='SYSTEM' AND actor_id IS NULL AND operation_receipt_id IS NULL AND evaluation_id IS NOT NULL AND note IS NULL)),
 CHECK(note IS NULL OR pg_catalog.length(pg_catalog.btrim(note)) BETWEEN 1 AND 2000),
 CHECK(actor_kind<>'HUMAN' OR state_after NOT IN ('RESOLVED','DISMISSED') OR note IS NOT NULL),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,operation_receipt_id) REFERENCES pathways_rules_internal.feature_operation_receipts(organization_id,project_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE pathways_rules_internal.decisions (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL, project_id uuid NOT NULL, alert_id uuid NOT NULL,
 recommendation_id uuid, actor_id uuid NOT NULL, operation_receipt_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('ACCEPT','PARTIALLY_ACCEPT','DECLINE','ESCALATE')),
 note text NOT NULL CHECK(pg_catalog.length(pg_catalog.btrim(note)) BETWEEN 1 AND 2000),
 client_operation_id uuid NOT NULL, request_digest bytea NOT NULL CHECK(pg_catalog.octet_length(request_digest)=32),
 created_at timestamptz(3) NOT NULL,
 UNIQUE(organization_id,project_id,id), UNIQUE(organization_id,actor_id,client_operation_id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES pathways.decision_recommendations(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,operation_receipt_id) REFERENCES pathways_rules_internal.feature_operation_receipts(organization_id,project_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE pathways_rules_internal.outcome_previews (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 organization_id uuid NOT NULL, project_id uuid NOT NULL, actor_id uuid NOT NULL,
 alert_id uuid NOT NULL, recommendation_id uuid,
 operation_kind text NOT NULL CHECK(operation_kind IN ('ALERT_OUTCOME','RECOMMENDATION_OUTCOME','COMBINED_OUTCOME')),
 creating_operation_code text NOT NULL CHECK(creating_operation_code IN ('ALERT_PREVIEW','RECOMMENDATION_PREVIEW')),
 write_alert boolean NOT NULL, write_recommendation boolean NOT NULL,
 expected_alert_revision bigint, expected_recommendation_revision bigint,
 outcome text NOT NULL CHECK(outcome IN ('ACCEPT','PARTIALLY_ACCEPT','DECLINE','ESCALATE')),
 private_note text NOT NULL CHECK(pg_catalog.length(pg_catalog.btrim(private_note)) BETWEEN 1 AND 2000),
 classification_fingerprint bytea NOT NULL CHECK(pg_catalog.octet_length(classification_fingerprint)=32),
 recipient_fingerprint bytea NOT NULL CHECK(pg_catalog.octet_length(recipient_fingerprint)=32),
 request_digest bytea NOT NULL CHECK(pg_catalog.octet_length(request_digest)=32),
 message text NOT NULL CHECK(pg_catalog.length(message) BETWEEN 1 AND 500),
 recipients jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(recipients)='array' AND pg_catalog.jsonb_array_length(recipients)<=1000),
 created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL,
 consumed_by_decision uuid,
 CHECK(expires_at=created_at+interval '5 minutes'),
 CHECK(write_alert OR write_recommendation),
 CHECK(write_alert=(expected_alert_revision IS NOT NULL) AND (expected_alert_revision IS NULL OR expected_alert_revision>0)),
 CHECK(write_recommendation=(expected_recommendation_revision IS NOT NULL) AND (expected_recommendation_revision IS NULL OR expected_recommendation_revision>0)),
 CHECK(NOT write_recommendation OR recommendation_id IS NOT NULL),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,recommendation_id) REFERENCES pathways.decision_recommendations(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,consumed_by_decision) REFERENCES pathways_rules_internal.decisions(organization_id,project_id,id)
);
CREATE INDEX f10_decisions_alert_history_idx ON pathways_rules_internal.decisions(organization_id,project_id,alert_id,created_at,id);
CREATE INDEX f10_lifecycle_alert_history_idx ON pathways_rules_internal.lifecycle_events(organization_id,project_id,alert_id,occurred_at,id);
CREATE INDEX f10_preview_actor_scope_idx ON pathways_rules_internal.outcome_previews(organization_id,project_id,actor_id,id);

-- Current marker must originate from a separately validated fixed human
-- operation; source receipts, CAPTURE/COMMIT context and request GUCs never count.
CREATE FUNCTION pathways_rules_internal.feature_human_scope(wanted_org uuid,wanted_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND EXISTS(
  SELECT FROM pathways_rules_internal.feature_operation_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.purpose='FEATURE_HUMAN'
   AND c.organization_id=wanted_org AND c.project_id=wanted_project
   AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND CASE c.operation_code
    WHEN 'ALERT_REVIEW' THEN pathways.p06_can('alerts.review',wanted_project)
    WHEN 'ALERT_DISPOSITION' THEN pathways.p06_can('alerts.outcome.record',wanted_project)
    WHEN 'ALERT_PREVIEW' THEN pathways.p06_can('alerts.outcome.record',wanted_project)
    WHEN 'ALERT_CONFIRM' THEN pathways.p06_can('alerts.outcome.record',wanted_project)
    WHEN 'RECOMMENDATION_REVIEW' THEN pathways.p06_can('recommendations.review',wanted_project)
    WHEN 'RECOMMENDATION_PREVIEW' THEN pathways.p06_can('recommendations.outcome.record',wanted_project)
    WHEN 'RECOMMENDATION_CONFIRM' THEN pathways.p06_can('recommendations.outcome.record',wanted_project)
    ELSE false END IS TRUE)
$$;
ALTER FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
-- Owner-only helper. No human direct EXECUTE or private note SELECT.

ALTER TABLE pathways_rules_internal.feature_operation_context OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.feature_operation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.feature_operation_context FORCE ROW LEVEL SECURITY;
CREATE POLICY f10_feature_context_owner ON pathways_rules_internal.feature_operation_context FOR ALL TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND transaction_id=pg_catalog.pg_current_xact_id()
  AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (CASE operation_code WHEN 'ALERT_REVIEW' THEN pathways.p06_can('alerts.review',project_id) WHEN 'ALERT_DISPOSITION' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'ALERT_PREVIEW' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'ALERT_CONFIRM' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'RECOMMENDATION_REVIEW' THEN pathways.p06_can('recommendations.review',project_id) WHEN 'RECOMMENDATION_PREVIEW' THEN pathways.p06_can('recommendations.outcome.record',project_id) WHEN 'RECOMMENDATION_CONFIRM' THEN pathways.p06_can('recommendations.outcome.record',project_id) ELSE false END IS TRUE))
 WITH CHECK(session_user='pathways_runtime' AND transaction_id=pg_catalog.pg_current_xact_id()
  AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (CASE operation_code WHEN 'ALERT_REVIEW' THEN pathways.p06_can('alerts.review',project_id) WHEN 'ALERT_DISPOSITION' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'ALERT_PREVIEW' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'ALERT_CONFIRM' THEN pathways.p06_can('alerts.outcome.record',project_id) WHEN 'RECOMMENDATION_REVIEW' THEN pathways.p06_can('recommendations.review',project_id) WHEN 'RECOMMENDATION_PREVIEW' THEN pathways.p06_can('recommendations.outcome.record',project_id) WHEN 'RECOMMENDATION_CONFIRM' THEN pathways.p06_can('recommendations.outcome.record',project_id) ELSE false END IS TRUE));
GRANT SELECT,INSERT,DELETE ON pathways_rules_internal.feature_operation_context TO rules_outcome_owner;

-- Catalog/table authority statements are deliberately explicit. Human reader
-- never obtains notes, private_note, recipients, hashes or note-presence flags.
ALTER TABLE pathways_rules_internal.feature_operation_receipts OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.alert_reviews OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.lifecycle_events OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.decisions OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.outcome_previews OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.feature_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.feature_operation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.alert_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.alert_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.lifecycle_events FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.outcome_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.outcome_previews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.feature_operation_context,pathways_rules_internal.feature_operation_receipts,
 pathways_rules_internal.alert_reviews,pathways_rules_internal.lifecycle_events,
 pathways_rules_internal.decisions,pathways_rules_internal.outcome_previews
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper,rules_human_owner;
-- Policies/installer/remover/immutable guards must accompany exact fixed
-- wrappers before ANY further column privileges are granted. Until then these
-- storage tables are intentionally inaccessible and cannot be registered live.


-- runtime-intents.proposed.sql
-- Proposed0031 exact intent storage/row comparator. Not installed or executed.
-- Fixed configuration/commit/outcome builders must create complete intents from
-- validated DB rows, never a caller-owned expected-row or executable expression.
CREATE TABLE pathways_rules_internal.runtime_mutation_intents (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 transaction_id xid8 NOT NULL, backend_pid integer NOT NULL, login_name name NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('CONFIGURATION','COMMIT','FEATURE_HUMAN')),
 organization_id uuid NOT NULL, project_id uuid, operation_id uuid NOT NULL,
 relation_oid oid NOT NULL, action text NOT NULL CHECK(action IN ('INSERT','UPDATE')),
 record_id uuid NOT NULL, expected_old jsonb, expected_new jsonb NOT NULL,
 consumed boolean NOT NULL DEFAULT false,
 CHECK(pg_catalog.jsonb_typeof(expected_new)='object'),
 CHECK((action='INSERT' AND expected_old IS NULL) OR
       (action='UPDATE' AND pg_catalog.jsonb_typeof(expected_old)='object')),
 UNIQUE(transaction_id,backend_pid,login_name,relation_oid,action,record_id)
);
CREATE TABLE pathways_rules_internal.configuration_context (
 transaction_id xid8 NOT NULL, backend_pid integer NOT NULL, login_name name NOT NULL,
 organization_id uuid NOT NULL, project_id uuid, actor_id uuid NOT NULL,
 operation_id uuid NOT NULL, operation_code text NOT NULL CHECK(operation_code IN ('RULE_CREATE','RULE_DRAFT','RULE_ACTIVATE','RULE_ARCHIVE')),
 target_rule_id uuid NOT NULL, predecessor_rule_id uuid,
 canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
 admitted_generation bigint, admitted_watermark bigint,
 PRIMARY KEY(transaction_id,backend_pid,login_name),
 CHECK((project_id IS NULL AND admitted_generation IS NULL AND admitted_watermark IS NULL)
  OR (project_id IS NOT NULL AND admitted_generation>=0 AND admitted_watermark>=0 AND admitted_generation IS NOT NULL AND admitted_watermark IS NOT NULL))
);
ALTER TABLE pathways_rules_internal.configuration_context OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.configuration_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.configuration_context FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.configuration_context FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper,rules_human_owner;
ALTER TABLE pathways_rules_internal.runtime_mutation_intents OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.runtime_mutation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.runtime_mutation_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.runtime_mutation_intents FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper,rules_human_owner;

CREATE FUNCTION pathways_rules_internal.assert_runtime_mutation(
 wanted_relation oid,wanted_action text,old_row jsonb,new_row jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent pathways_rules_internal.runtime_mutation_intents;
 config pathways_rules_internal.configuration_context;
 relation_name text; row_id uuid; org uuid; project uuid; permission text; human_rule uuid;
BEGIN
 IF wanted_action NOT IN ('INSERT','UPDATE') OR new_row IS NULL
  OR pg_catalog.jsonb_typeof(new_row)<>'object'
  OR (wanted_action='INSERT' AND old_row IS NOT NULL)
  OR (wanted_action='UPDATE' AND (old_row IS NULL OR pg_catalog.jsonb_typeof(old_row)<>'object'))
  OR wanted_relation NOT IN ('pathways.alert_rules'::regclass,'pathways.alert_rule_recommendations'::regclass,
    'pathways.rule_based_alerts'::regclass,'pathways.decision_recommendations'::regclass) THEN
  RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 row_id:=(new_row->>'id')::uuid; org:=(new_row->>'organization_id')::uuid;
 project:=(new_row->>'project_id')::uuid;
 IF wanted_relation='pathways.alert_rule_recommendations'::regclass THEN
  SELECT r.project_id INTO project FROM pathways.alert_rules r
   WHERE r.id=(new_row->>'rule_id')::uuid AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'Runtime parent unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF row_id IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 SELECT i.* INTO intent FROM pathways_rules_internal.runtime_mutation_intents i
  WHERE i.transaction_id=pg_catalog.pg_current_xact_id() AND i.backend_pid=pg_catalog.pg_backend_pid()
   AND i.login_name=session_user AND i.relation_oid=wanted_relation AND i.action=wanted_action
   AND i.record_id=row_id AND i.organization_id=org AND NOT i.consumed
  FOR NO KEY UPDATE;
 IF NOT FOUND OR intent.expected_old IS DISTINCT FROM old_row OR intent.expected_new IS DISTINCT FROM new_row
  OR intent.project_id IS DISTINCT FROM project THEN
  RAISE EXCEPTION 'Runtime mutation unavailable' USING ERRCODE='42501'; END IF;
 IF old_row IS NOT NULL AND ((old_row->'id',old_row->'organization_id',old_row->'project_id')
      IS DISTINCT FROM (new_row->'id',new_row->'organization_id',new_row->'project_id')) THEN
  RAISE EXCEPTION 'Runtime scope is immutable' USING ERRCODE='23514'; END IF;
 IF old_row IS NOT NULL AND new_row->'runtime_contract_version' IS DISTINCT FROM old_row->'runtime_contract_version' THEN
  RAISE EXCEPTION 'Runtime contract is immutable' USING ERRCODE='23514'; END IF;
 relation_name:=CASE wanted_relation WHEN 'pathways.alert_rules'::regclass THEN 'RULE'
  WHEN 'pathways.alert_rule_recommendations'::regclass THEN 'TEMPLATE'
  WHEN 'pathways.rule_based_alerts'::regclass THEN 'ALERT' ELSE 'RECOMMENDATION' END;

 IF intent.purpose='COMMIT' THEN
  IF session_user<>'pathways_rules_worker' OR relation_name NOT IN ('ALERT','RECOMMENDATION')
   OR project IS NULL OR NOT EXISTS(
    SELECT FROM pathways_rules_internal.projection_context c
    JOIN pathways_rules_internal.jobs j ON j.id=c.job_id AND j.organization_id=c.organization_id AND j.project_id=c.project_id
    JOIN pathways_rules_internal.snapshots s ON s.id=c.snapshot_id AND s.job_id=j.id
      AND s.organization_id=j.organization_id AND s.project_id=j.project_id
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.purpose='COMMIT' AND c.snapshot_id=intent.operation_id
     AND c.organization_id=org AND c.project_id=project AND j.state='LEASED'
     AND j.lease_session=session_user AND j.lease_hash=c.lease_hash AND s.lease_hash=c.lease_hash
     AND j.lease_expires_at>pg_catalog.clock_timestamp()+interval '3 seconds'
     AND c.expires_at=j.lease_expires_at) THEN
   RAISE EXCEPTION 'Runtime commit unavailable' USING ERRCODE='42501'; END IF;
  IF wanted_action='INSERT' AND (
    new_row->>'attribution' IS DISTINCT FROM 'SYSTEM'
    OR (relation_name='ALERT' AND new_row->'evaluated_by_id' IS DISTINCT FROM 'null'::jsonb)
    OR (relation_name='RECOMMENDATION' AND new_row->'proposed_by_id' IS DISTINCT FROM 'null'::jsonb)) THEN
   RAISE EXCEPTION 'Runtime system attribution required' USING ERRCODE='23514'; END IF;
  IF wanted_action='UPDATE' AND (relation_name<>'ALERT'
   OR (new_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at'])
      IS DISTINCT FROM (old_row-ARRAY['lifecycle','revision','latest_evaluation_id','updated_at'])) THEN
   RAISE EXCEPTION 'Runtime commit write set unavailable' USING ERRCODE='23514'; END IF;
 ELSIF intent.purpose='FEATURE_HUMAN' THEN
  IF session_user<>'pathways_runtime' OR relation_name NOT IN ('ALERT','RECOMMENDATION')
   OR wanted_action<>'UPDATE' OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   OR pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
   OR NOT EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project
     AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_id=intent.operation_id
     AND ((relation_name='ALERT' AND c.alert_id=row_id)
       OR (relation_name='RECOMMENDATION' AND c.recommendation_id=row_id))
     AND (relation_name<>'ALERT' OR c.operation_code='ALERT_REVIEW'
       OR pathways.p06_can('alerts.outcome.record',project) IS TRUE)
     AND (relation_name<>'RECOMMENDATION' OR c.operation_code='RECOMMENDATION_REVIEW'
       OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE)) THEN
   RAISE EXCEPTION 'Runtime human mutation unavailable' USING ERRCODE='42501'; END IF;
  IF relation_name='ALERT' THEN human_rule:=(new_row->>'rule_id')::uuid;
  ELSE SELECT a.rule_id INTO human_rule FROM pathways.rule_based_alerts a
   WHERE a.id=(new_row->>'alert_id')::uuid AND a.organization_id=org AND a.project_id=project
    AND a.runtime_contract_version='f10.v1'; END IF;
  IF human_rule IS NULL OR pathways_rules_internal.rule_exposure_allowed(human_rule) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Runtime human exposure unavailable' USING ERRCODE='42501'; END IF;
  IF (relation_name='ALERT' AND (new_row-ARRAY['lifecycle','revision','updated_at'])
      IS DISTINCT FROM (old_row-ARRAY['lifecycle','revision','updated_at']))
   OR (relation_name='RECOMMENDATION' AND (new_row-ARRAY['status','revision','private_review_id','reviewed_by_id','reviewed_at','updated_at'])
      IS DISTINCT FROM (old_row-ARRAY['status','revision','private_review_id','reviewed_by_id','reviewed_at','updated_at'])) THEN
   RAISE EXCEPTION 'Runtime human write set unavailable' USING ERRCODE='23514'; END IF;
 ELSIF intent.purpose='CONFIGURATION' THEN
  IF session_user<>'pathways_runtime' OR relation_name NOT IN ('RULE','TEMPLATE')
   OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid THEN
   RAISE EXCEPTION 'Runtime configuration context unavailable' USING ERRCODE='42501'; END IF;
  SELECT c.* INTO config FROM pathways_rules_internal.configuration_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.organization_id=org AND c.project_id IS NOT DISTINCT FROM project
    AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_id=intent.operation_id
    AND ((relation_name='RULE' AND (c.target_rule_id=row_id OR
       (c.operation_code='RULE_ACTIVATE' AND wanted_action='UPDATE' AND c.predecessor_rule_id=row_id)))
      OR (relation_name='TEMPLATE' AND c.target_rule_id=(new_row->>'rule_id')::uuid));
  IF NOT FOUND THEN RAISE EXCEPTION 'Runtime configuration context unavailable' USING ERRCODE='42501'; END IF;
  permission:=CASE config.operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END;
  IF pathways.p09_can(permission) IS DISTINCT FROM true
   OR (project IS NOT NULL AND pathways.p06_can(permission,project) IS DISTINCT FROM true) OR
    (project IS NOT NULL AND NOT EXISTS(SELECT FROM pathways_rules_internal.project_state s
      WHERE s.organization_id=org AND s.project_id=project AND s.bootstrap_complete
       AND s.required_generation=config.admitted_generation AND s.source_watermark=config.admitted_watermark)) THEN
   RAISE EXCEPTION 'Runtime configuration authority unavailable' USING ERRCODE='42501'; END IF;
  IF relation_name='RULE' THEN
   IF new_row->>'runtime_contract_version' IS DISTINCT FROM 'f10.v1'
    OR (wanted_action='INSERT' AND (new_row->>'status' IS DISTINCT FROM 'DRAFT'
      OR new_row->>'created_by_id' IS DISTINCT FROM config.actor_id::text
      OR new_row->'activated_at' IS DISTINCT FROM 'null'::jsonb)) THEN
    RAISE EXCEPTION 'Runtime draft origin unavailable' USING ERRCODE='23514'; END IF;
   IF wanted_action='UPDATE' THEN
    IF (new_row-ARRAY['status','activated_by_id','activated_at','archived_at','updated_at'])
       IS DISTINCT FROM (old_row-ARRAY['status','activated_by_id','activated_at','archived_at','updated_at'])
     OR NOT ((config.operation_code='RULE_ACTIVATE' AND old_row->>'status'='DRAFT' AND new_row->>'status'='ACTIVE'
       AND new_row->>'activated_by_id'=config.actor_id::text AND new_row->'activated_at'<>'null'::jsonb)
      OR (config.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE') AND old_row->>'status'='ACTIVE' AND new_row->>'status'='ARCHIVED'
       AND new_row->'activated_by_id'=old_row->'activated_by_id' AND new_row->'activated_at'=old_row->'activated_at'
       AND new_row->'archived_at'<>'null'::jsonb)) THEN
     RAISE EXCEPTION 'Activated runtime rule is immutable' USING ERRCODE='23514'; END IF;
   END IF;
  ELSE
   IF wanted_action<>'INSERT' OR new_row->>'created_by_id' IS DISTINCT FROM config.actor_id::text
    OR NOT EXISTS(SELECT FROM pathways.alert_rules r WHERE r.id=config.target_rule_id
      AND r.organization_id=org AND r.project_id IS NOT DISTINCT FROM project
      AND r.runtime_contract_version='f10.v1' AND r.status='DRAFT' AND r.activated_at IS NULL) THEN
    RAISE EXCEPTION 'Activated runtime templates are immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Runtime purpose unavailable' USING ERRCODE='42501'; END IF;

 IF relation_name='ALERT' THEN
  IF new_row->>'lifecycle' IS NULL OR new_row->>'revision' IS NULL
   OR new_row->>'lifecycle' NOT IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')
   OR (new_row->>'revision')::bigint<=0
   OR (old_row IS NOT NULL AND (new_row->>'revision')::bigint<>(old_row->>'revision')::bigint+1)
   OR (wanted_action='INSERT' AND (new_row->>'lifecycle'<>'NEW' OR (new_row->>'revision')::bigint<>1)) THEN
   RAISE EXCEPTION 'Runtime lifecycle unavailable' USING ERRCODE='23514'; END IF;
  IF old_row IS NOT NULL AND old_row->>'lifecycle' IN ('RESOLVED','DISMISSED','AUTO_RESOLVED')
    AND new_row->>'lifecycle' IS DISTINCT FROM old_row->>'lifecycle' THEN
   RAISE EXCEPTION 'Terminal runtime lifecycle is immutable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='COMMIT' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.evaluations e
   WHERE e.id=(new_row->>'latest_evaluation_id')::uuid AND e.snapshot_id=intent.operation_id
    AND e.organization_id=org AND e.project_id=project
    AND e.rule_version_id=(new_row->>'rule_id')::uuid
    AND (wanted_action<>'INSERT' OR (e.result='TRUE' AND e.evidence=new_row->'evaluated_snapshot'))) THEN
   RAISE EXCEPTION 'Runtime evaluation provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='COMMIT' AND old_row IS NOT NULL
   AND new_row->>'lifecycle' IS DISTINCT FROM old_row->>'lifecycle'
   AND NOT (old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED')
    AND new_row->>'lifecycle'='AUTO_RESOLVED' AND EXISTS(
     SELECT FROM pathways_rules_internal.evaluations e WHERE e.id=(new_row->>'latest_evaluation_id')::uuid
      AND e.snapshot_id=intent.operation_id AND e.organization_id=org AND e.project_id=project AND e.result='FALSE')) THEN
   RAISE EXCEPTION 'Runtime automatic clearance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' THEN
   IF NOT EXISTS(
    SELECT FROM pathways_rules_internal.feature_operation_context c
    JOIN pathways_rules_internal.feature_operation_receipts o ON o.client_operation_id=c.operation_id
     AND o.organization_id=c.organization_id AND o.project_id=c.project_id AND o.actor_id=c.actor_id
    WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
     AND c.login_name=session_user AND c.operation_id=intent.operation_id AND c.alert_id=row_id
     AND c.organization_id=org AND c.project_id=project
     AND o.alert_id=row_id AND o.operation_code=c.operation_code AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
     AND ((c.operation_code='ALERT_REVIEW'
       AND new_row->>'lifecycle'=CASE WHEN old_row->>'lifecycle'='NEW' THEN 'REVIEWED' ELSE old_row->>'lifecycle' END
       AND EXISTS(
       SELECT FROM pathways_rules_internal.alert_reviews r WHERE r.organization_id=org AND r.project_id=project
        AND r.alert_id=row_id AND r.operation_receipt_id=o.id AND r.actor_id=c.actor_id
        AND r.state_before=old_row->>'lifecycle' AND r.state_after=new_row->>'lifecycle'))
      OR (c.operation_code='ALERT_DISPOSITION' AND old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED') AND EXISTS(
       SELECT FROM pathways_rules_internal.lifecycle_events e WHERE e.organization_id=org AND e.project_id=project
        AND e.alert_id=row_id AND e.operation_receipt_id=o.id AND e.actor_id=c.actor_id AND e.actor_kind='HUMAN'
        AND e.state_before=old_row->>'lifecycle' AND e.state_after=new_row->>'lifecycle'
        AND e.state_after IN ('RESOLVED','DISMISSED')))
      OR (c.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM') AND EXISTS(
       SELECT FROM pathways_rules_internal.decisions d WHERE d.organization_id=org AND d.project_id=project
        AND d.alert_id=row_id AND d.operation_receipt_id=o.id AND d.actor_id=c.actor_id
        AND d.client_operation_id=c.operation_id
        AND ((d.outcome IN ('ACCEPT','PARTIALLY_ACCEPT') AND
          ((old_row->>'lifecycle' IN ('NEW','REVIEWED','ACTIONED') AND new_row->>'lifecycle'='ACTIONED')
           OR (old_row->>'lifecycle' IN ('RESOLVED','DISMISSED','AUTO_RESOLVED') AND new_row->>'lifecycle'=old_row->>'lifecycle')))
          OR (d.outcome IN ('DECLINE','ESCALATE') AND new_row->>'lifecycle'=old_row->>'lifecycle')))))) THEN
    RAISE EXCEPTION 'Runtime human event provenance unavailable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSEIF relation_name='RECOMMENDATION' THEN
  IF new_row->>'runtime_contract_version' IS DISTINCT FROM 'f10.v1'
   OR new_row->>'status' IS NULL OR new_row->>'revision' IS NULL OR new_row->>'status' NOT IN ('NEW','REVIEWED')
   OR new_row->'review_note' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'outcome_note' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'outcome' IS DISTINCT FROM 'null'::jsonb
   OR (new_row->>'revision')::bigint<=0
   OR (old_row IS NOT NULL AND (new_row->>'revision')::bigint<>(old_row->>'revision')::bigint+1) THEN
   RAISE EXCEPTION 'Runtime recommendation unavailable' USING ERRCODE='23514'; END IF;
  IF wanted_action='INSERT' AND (new_row->>'status'<>'NEW' OR (new_row->>'revision')::bigint<>1
   OR new_row->'private_review_id' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'reviewed_by_id' IS DISTINCT FROM 'null'::jsonb
   OR new_row->'reviewed_at' IS DISTINCT FROM 'null'::jsonb) THEN
   RAISE EXCEPTION 'Runtime recommendation origin unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='COMMIT' AND NOT EXISTS(
   SELECT FROM pathways.rule_based_alerts a
   JOIN pathways_rules_internal.evaluations e ON e.id=a.latest_evaluation_id
    AND e.organization_id=a.organization_id AND e.project_id=a.project_id AND e.rule_version_id=a.rule_id
   JOIN pathways.alert_rule_recommendations t ON t.id=(new_row->>'source_rule_recommendation_id')::uuid
    AND t.organization_id=a.organization_id AND t.rule_id=a.rule_id
   WHERE a.id=(new_row->>'alert_id')::uuid AND a.organization_id=org AND a.project_id=project
    AND e.snapshot_id=intent.operation_id AND e.result='TRUE'
    AND new_row->>'title'=t.title AND new_row->>'text'=t.text
    AND new_row->'source_snapshot'->>'evaluationId'=e.id::text) THEN
   RAISE EXCEPTION 'Runtime recommendation provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'='REVIEWED'
   AND (new_row->'private_review_id',new_row->'reviewed_by_id',new_row->'reviewed_at',new_row->'status')
    IS DISTINCT FROM (old_row->'private_review_id',old_row->'reviewed_by_id',old_row->'reviewed_at',old_row->'status') THEN
   RAISE EXCEPTION 'Runtime review event is immutable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'=new_row->>'status'
   AND (new_row->'private_review_id',new_row->'reviewed_by_id',new_row->'reviewed_at')
    IS DISTINCT FROM (old_row->'private_review_id',old_row->'reviewed_by_id',old_row->'reviewed_at') THEN
   RAISE EXCEPTION 'Runtime decision cannot alter review provenance' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'='NEW' AND new_row->>'status'='REVIEWED' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.recommendation_reviews r
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.id=r.operation_receipt_id
    AND o.organization_id=r.organization_id AND o.project_id=r.project_id
   WHERE r.id=(new_row->>'private_review_id')::uuid AND r.organization_id=org AND r.project_id=project
    AND r.recommendation_id=row_id AND r.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
    AND r.actor_id=(new_row->>'reviewed_by_id')::uuid AND r.occurred_at=(new_row->>'reviewed_at')::timestamptz
    AND o.actor_id=r.actor_id AND o.client_operation_id=intent.operation_id
    AND o.operation_code='RECOMMENDATION_REVIEW') THEN
   RAISE EXCEPTION 'Runtime review provenance unavailable' USING ERRCODE='23514'; END IF;
  IF intent.purpose='FEATURE_HUMAN' AND old_row->>'status'=new_row->>'status' AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.decisions d
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.id=d.operation_receipt_id
    AND o.organization_id=d.organization_id AND o.project_id=d.project_id
   WHERE d.organization_id=org AND d.project_id=project AND d.recommendation_id=row_id
    AND d.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND d.client_operation_id=intent.operation_id
    AND o.actor_id=d.actor_id AND o.client_operation_id=d.client_operation_id
    AND o.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM')) THEN
   RAISE EXCEPTION 'Runtime decision provenance unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE pathways_rules_internal.runtime_mutation_intents i SET consumed=true
  WHERE i.id=intent.id AND NOT i.consumed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Runtime intent already consumed' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
-- NO new function/table grant is issued until fixed intent builders, guard-owner
-- column RLS, complete provenance and current authority contexts pass review.


-- configuration-storage.proposed.sql
-- Proposed0031 private append-only human configuration receipts.
CREATE TABLE pathways_rules_internal.configuration_receipts (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),organization_id uuid NOT NULL,project_id uuid,
 actor_id uuid NOT NULL,client_operation_id uuid NOT NULL,operation_code text NOT NULL
 CHECK(operation_code IN ('RULE_CREATE','RULE_DRAFT','RULE_ACTIVATE','RULE_ARCHIVE')),
 rule_id uuid NOT NULL,canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
 safe_result jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(safe_result)='object'),private_note text,
 occurred_at timestamptz(3) NOT NULL,
 UNIQUE(organization_id,actor_id,client_operation_id),
 CHECK((operation_code='RULE_ARCHIVE' AND private_note IS NOT NULL
  AND pg_catalog.length(pg_catalog.btrim(private_note)) BETWEEN 1 AND 2000)
  OR (operation_code<>'RULE_ARCHIVE' AND private_note IS NULL)),
 FOREIGN KEY(organization_id,rule_id) REFERENCES pathways.alert_rules(organization_id,id)
);
ALTER TABLE pathways_rules_internal.configuration_receipts OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.configuration_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.configuration_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.configuration_receipts FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,
 pathways_rules_worker,pathways_rules_sweeper,rules_human_owner;

CREATE FUNCTION pathways_rules_internal.enqueue_configuration_work()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker pathways_rules_internal.configuration_context;receipt uuid;generation bigint;moment timestamptz;
BEGIN
 SELECT c.* INTO marker FROM pathways_rules_internal.configuration_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE');
 IF NOT FOUND OR session_user<>'pathways_runtime' OR marker.project_id IS NULL
  OR pathways.p06_can(CASE marker.operation_code WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END,marker.project_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 SELECT o.id INTO receipt FROM pathways_rules_internal.configuration_receipts o
  WHERE o.organization_id=marker.organization_id AND o.project_id=marker.project_id AND o.actor_id=marker.actor_id
   AND o.client_operation_id=marker.operation_id AND o.operation_code=marker.operation_code
   AND o.rule_id=marker.target_rule_id AND o.canonical_request_hash=marker.canonical_request_hash;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM pathways.alert_rules r WHERE r.id=marker.target_rule_id
  AND r.organization_id=marker.organization_id AND r.project_id=marker.project_id
  AND r.runtime_contract_version='f10.v1' AND r.status::text=CASE marker.operation_code WHEN 'RULE_ACTIVATE' THEN 'ACTIVE' ELSE 'ARCHIVED' END) THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pathways_rules_internal.work_items w WHERE w.organization_id=marker.organization_id
  AND w.project_id=marker.project_id AND w.identity_kind='RULE' AND w.identity_id=receipt::text) THEN
  RAISE EXCEPTION 'Duplicate rule invalidation' USING ERRCODE='23514'; END IF;
 moment:=pg_catalog.clock_timestamp();
 UPDATE pathways_rules_internal.project_state s SET required_generation=s.required_generation+1
  WHERE s.organization_id=marker.organization_id AND s.project_id=marker.project_id AND s.bootstrap_complete
   AND s.required_generation=marker.admitted_generation AND s.source_watermark=marker.admitted_watermark
  RETURNING s.required_generation INTO generation;
 IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.work_items(id,organization_id,project_id,generation,identity_kind,identity_id,actor_id,queued_at)
 VALUES(pg_catalog.gen_random_uuid(),marker.organization_id,marker.project_id,generation,'RULE',receipt::text,marker.actor_id,moment);
 INSERT INTO pathways_rules_internal.jobs(id,organization_id,project_id,pending_since,next_attempt_at,state)
 VALUES(pg_catalog.gen_random_uuid(),marker.organization_id,marker.project_id,moment,moment,'PENDING')
 ON CONFLICT(organization_id,project_id) DO UPDATE
 SET state=CASE WHEN pathways_rules_internal.jobs.state='LEASED' THEN 'LEASED' ELSE 'PENDING' END,
  pending_since=CASE WHEN pathways_rules_internal.jobs.state='IDLE' THEN EXCLUDED.pending_since ELSE pathways_rules_internal.jobs.pending_since END,
  next_attempt_at=CASE WHEN pathways_rules_internal.jobs.state IN ('IDLE','FAILED')
   THEN EXCLUDED.next_attempt_at ELSE pathways_rules_internal.jobs.next_attempt_at END,
  operational_failures=0;
END $$;
ALTER FUNCTION pathways_rules_internal.enqueue_configuration_work() OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.enqueue_configuration_work()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.enqueue_configuration_work() TO rules_config_owner;


-- source-storage-bootstrap.proposed.sql
-- DISPOSABLE FORWARD DDL/BODY EXCERPTS. NOT EXECUTED / NOT AN INSTALLABLE MIGRATION.
-- Prerequisites: reviewed private schema/roles/project_state and calendar tables.
-- Complete source proof triggers/finish builders require exact-content review as
-- specified in source-matrix-integration.md. Applied migration bytes untouched.



CREATE TABLE pathways_rules_internal.source_operation_catalog (
  operation_code text PRIMARY KEY,
  permission_code text NOT NULL,
  request_kind text NOT NULL CHECK(request_kind IN ('CLIENT_MUTATION','CLIENT_MEASUREMENT','PROOF_FINALIZE','CONFIGURATION')),
  source_table text NOT NULL CHECK(source_table IN ('projects','project_activities','project_indicators','project_indicator_measurements','alert_rules')),
  maximum_work text NOT NULL CHECK(maximum_work IN ('W_G','G_ONLY'))
);
INSERT INTO pathways_rules_internal.source_operation_catalog VALUES
 ('PROJECT_UPDATE','projects.update','CLIENT_MUTATION','projects','W_G'),
 ('ACTIVITY_CREATE','activities.create','CLIENT_MUTATION','project_activities','W_G'),
 ('ACTIVITY_UPDATE','activities.update','CLIENT_MUTATION','project_activities','W_G'),
 ('ACTIVITY_START','activities.complete','CLIENT_MUTATION','project_activities','W_G'),
 ('ACTIVITY_CANCEL','activities.update','CLIENT_MUTATION','project_activities','W_G'),
 ('ACTIVITY_REVIEW','evidence.review','CLIENT_MUTATION','project_activities','W_G'),
 ('ACTIVITY_PROOF_FINALIZE','activities.proof.submit','PROOF_FINALIZE','project_activities','W_G'),
 ('INDICATOR_CREATE','indicators.create','CLIENT_MUTATION','project_indicators','G_ONLY'),
 ('INDICATOR_UPDATE','indicators.update','CLIENT_MUTATION','project_indicators','G_ONLY'),
 ('INDICATOR_ARCHIVE','indicators.archive','CLIENT_MUTATION','project_indicators','G_ONLY'),
 ('INDICATOR_MEASUREMENT','indicators.update','CLIENT_MEASUREMENT','project_indicator_measurements','W_G'),
 ('RULE_ACTIVATION','rules.activate','CONFIGURATION','alert_rules','G_ONLY'),
 ('RULE_CREATE','rules.create','CONFIGURATION','alert_rules','G_ONLY'),
 ('RULE_DRAFT','rules.update','CONFIGURATION','alert_rules','G_ONLY'),
 ('RULE_ACTIVATE','rules.activate','CONFIGURATION','alert_rules','G_ONLY'),
 ('RULE_ARCHIVE','rules.update','CONFIGURATION','alert_rules','G_ONLY');

CREATE TABLE pathways_rules_internal.source_operation_context (
  handle uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  transaction_id xid8 NOT NULL,
  backend_pid integer NOT NULL,
  login_name name NOT NULL CHECK(login_name='pathways_runtime'),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_code text NOT NULL REFERENCES pathways_rules_internal.source_operation_catalog,
  request_kind text NOT NULL,
  request_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('MUTATION','MEASUREMENT','FINALIZE','CONFIGURATION')),
  canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
  source_record_id uuid NOT NULL,
  source_before_fingerprint bytea,
  source_after_fingerprint bytea,
  source_revision text,
  proven_work text CHECK(proven_work IN ('NONE','W_G','G_ONLY')),
  proof_relation text,
  proof_action text CHECK(proof_action IN ('INSERT','UPDATE')),
  sealed boolean NOT NULL DEFAULT false,
  UNIQUE(transaction_id,backend_pid,login_name,handle),
  FOREIGN KEY(organization_id,project_id)
    REFERENCES pathways_rules_internal.project_state(organization_id,project_id)
);
CREATE TABLE pathways_rules_internal.source_operation_receipts (
  operation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_code text NOT NULL REFERENCES pathways_rules_internal.source_operation_catalog,
  request_kind text NOT NULL,
  request_id uuid NOT NULL,
  phase text NOT NULL,
  canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
  source_record_id uuid NOT NULL,
  source_revision text NOT NULL,
  source_before_fingerprint bytea,
  source_after_fingerprint bytea,
  work_mode text NOT NULL CHECK(work_mode IN ('NONE','W_G','G_ONLY')),
  work_item_id uuid,
  committed_at timestamptz(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE(organization_id,actor_id,request_kind,request_id,phase),
  UNIQUE(organization_id,project_id,operation_id),
  FOREIGN KEY(organization_id,project_id)
    REFERENCES pathways_rules_internal.project_state(organization_id,project_id),
  CHECK((work_mode='NONE')=(work_item_id IS NULL))
);
-- Final extraction adds scoped work_item_id FK after work_items creation.

CREATE FUNCTION pathways.f10_bootstrap_project(wanted_project uuid,operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; actor uuid; needed_permission text; ready boolean;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
  IF session_user IS DISTINCT FROM 'pathways_runtime' THEN
    RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION 'Human mutation isolation unavailable' USING ERRCODE='25001';
  END IF;
  org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;
  actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
  SELECT c.permission_code INTO needed_permission
    FROM pathways_rules_internal.source_operation_catalog c WHERE c.operation_code=operation;
  IF org IS NULL OR actor IS NULL OR needed_permission IS NULL
    OR pathways.p06_can(needed_permission,wanted_project) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501';
  END IF;
  SELECT s.bootstrap_complete INTO ready FROM pathways_rules_internal.project_state s
    WHERE s.organization_id=org AND s.project_id=wanted_project FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    INSERT INTO pathways_rules_internal.project_state(organization_id,project_id)
      VALUES(org,wanted_project) ON CONFLICT(organization_id,project_id) DO NOTHING;
    SELECT s.bootstrap_complete INTO ready FROM pathways_rules_internal.project_state s
      WHERE s.organization_id=org AND s.project_id=wanted_project FOR NO KEY UPDATE;
  END IF;
  -- A state lock or conflict wait can outlive current human authority. Re-resolve
  -- after the final state lock, before ready return/validation/readiness UPDATE.
  IF nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid IS DISTINCT FROM org
    OR nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS DISTINCT FROM actor
    OR pathways.p06_can(needed_permission,wanted_project) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project)
    OR NOT EXISTS(SELECT 1 FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton) THEN
    RAISE EXCEPTION 'Bootstrap unavailable' USING ERRCODE='55000';
  END IF;
  IF ready THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM pathways.alert_rules r
    WHERE r.organization_id=org AND r.project_id=wanted_project
      AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE') THEN
    -- Existing monitored projects need separately reviewed bootstrap+initial-job
    -- in one approved forward transaction. This helper cannot mark them ready
    -- without that job and cannot silently late-enqueue from a source writer.
    RAISE EXCEPTION 'Bootstrap required' USING ERRCODE='55000';
  END IF;
  UPDATE pathways_rules_internal.project_state s SET bootstrap_complete=true
    WHERE s.organization_id=org AND s.project_id=wanted_project;
END $$;

CREATE FUNCTION pathways.f10_source_acknowledgement(wanted_project uuid,operation text,
  wanted_request_kind text,wanted_request uuid,wanted_phase text,canonical_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; actor uuid; needed_permission text;
  receipt pathways_rules_internal.source_operation_receipts; requested_hash bytea;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
  -- Recovery is read-only. Initialization belongs to a NEW source attempt,
  -- after this current-authority acknowledgement lookup, never to recovery.
  IF session_user IS DISTINCT FROM 'pathways_runtime' THEN
    RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501';
  END IF;
  org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
  SELECT c.permission_code INTO needed_permission
    FROM pathways_rules_internal.source_operation_catalog c
    WHERE c.operation_code=operation AND c.request_kind=wanted_request_kind;
  IF org IS NULL OR actor IS NULL OR needed_permission IS NULL
    OR pathways.p06_can(needed_permission,wanted_project) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501';
  END IF;
  IF wanted_request_kind NOT IN ('CLIENT_MUTATION','CLIENT_MEASUREMENT','PROOF_FINALIZE','CONFIGURATION')
    OR wanted_phase IS NULL
    OR pg_catalog.jsonb_typeof(canonical_request) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(canonical_request::text)>65536 OR wanted_request IS NULL
    OR (wanted_request_kind='PROOF_FINALIZE' AND wanted_phase IS DISTINCT FROM 'FINALIZE')
    OR (wanted_request_kind='CLIENT_MUTATION' AND wanted_phase IS DISTINCT FROM 'MUTATION')
    OR (wanted_request_kind='CLIENT_MEASUREMENT' AND wanted_phase IS DISTINCT FROM 'MEASUREMENT')
    OR (wanted_request_kind='CONFIGURATION' AND wanted_phase IS DISTINCT FROM 'CONFIGURATION') THEN
    RAISE EXCEPTION 'Invalid mutation request' USING ERRCODE='22023';
  END IF;
  requested_hash:=pg_catalog.sha256(pg_catalog.convert_to(canonical_request::text,'UTF8'));
  SELECT r.* INTO receipt FROM pathways_rules_internal.source_operation_receipts r
    WHERE r.organization_id=org AND r.actor_id=actor
      AND r.request_kind=wanted_request_kind AND r.request_id=wanted_request AND r.phase=wanted_phase;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF receipt.project_id IS DISTINCT FROM wanted_project OR receipt.operation_code IS DISTINCT FROM operation
    OR receipt.canonical_request_hash IS DISTINCT FROM requested_hash THEN
    RAISE EXCEPTION 'Mutation request conflicts' USING ERRCODE='23505';
  END IF;
  -- Narrow acknowledgement only; no source ID/revision/value/note/cache is returned.
  -- Current source/detail projections remain separately authorized API reads.
  RETURN pg_catalog.jsonb_build_object('requestId',wanted_request,'committed',true,'replayed',true);
END $$;

ALTER TABLE pathways_rules_internal.source_operation_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_operation_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_operation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_operation_context FORCE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY f10_catalog_read ON pathways_rules_internal.source_operation_catalog
  FOR SELECT TO rules_enqueue_owner,rules_source_proof_owner USING(true);
CREATE POLICY f10_human_marker ON pathways_rules_internal.source_operation_context
  FOR ALL TO rules_enqueue_owner,rules_source_proof_owner
  USING(transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
    AND login_name=session_user AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p06_can((SELECT cat.permission_code FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=source_operation_context.operation_code),project_id) IS TRUE))
  WITH CHECK(transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
    AND login_name=session_user AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p06_can((SELECT cat.permission_code FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=source_operation_context.operation_code),project_id) IS TRUE));
CREATE POLICY f10_human_receipt_select ON pathways_rules_internal.source_operation_receipts
  FOR SELECT TO rules_enqueue_owner
  USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p06_can((SELECT cat.permission_code FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=source_operation_receipts.operation_code),project_id) IS TRUE));
CREATE POLICY f10_human_receipt_insert ON pathways_rules_internal.source_operation_receipts
  FOR INSERT TO rules_enqueue_owner
  WITH CHECK(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
    AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p06_can((SELECT cat.permission_code FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=source_operation_receipts.operation_code),project_id) IS TRUE));
-- No UPDATE/DELETE policy or privilege on receipts; immutable trigger also required.

ALTER TABLE pathways_rules_internal.source_operation_catalog OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.source_operation_context OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.source_operation_receipts OWNER TO rules_store_owner;
ALTER FUNCTION pathways.f10_bootstrap_project(uuid,text) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_bootstrap_project(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.f10_bootstrap_project(uuid,text) TO pathways_runtime,rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb)
  TO pathways_runtime,rules_config_owner;
GRANT SELECT ON pathways_rules_internal.source_operation_catalog TO rules_enqueue_owner,rules_source_proof_owner;
GRANT SELECT,INSERT ON pathways_rules_internal.source_operation_receipts TO rules_enqueue_owner;
GRANT SELECT,INSERT,DELETE ON pathways_rules_internal.source_operation_context TO rules_enqueue_owner;
GRANT SELECT,UPDATE(source_before_fingerprint,source_after_fingerprint,source_revision,
  proven_work,proof_relation,proof_action,sealed)
  ON pathways_rules_internal.source_operation_context TO rules_source_proof_owner;
-- No legacy context-helper grants: fixed owners read trusted request GUCs under existing current-authority gates.
GRANT EXECUTE ON FUNCTION pathways.p06_can(text,uuid) TO rules_enqueue_owner;
GRANT SELECT(id,organization_id) ON pathways.projects TO rules_enqueue_owner;
GRANT SELECT(id,organization_id,project_id,runtime_contract_version,status)
  ON pathways.alert_rules TO rules_enqueue_owner;
GRANT SELECT(version,zone,singleton) ON pathways_rules_internal.calendar_configuration TO rules_enqueue_owner;
GRANT SELECT,INSERT ON pathways_rules_internal.project_state TO rules_enqueue_owner;
GRANT UPDATE(bootstrap_complete,lock_revision,source_watermark,required_generation)
  ON pathways_rules_internal.project_state TO rules_enqueue_owner;
-- Owner/policy/default ACL installation must be one reviewed transaction. These
-- grants require matching scoped source/state/calendar policies in final SQL;
-- granting ACL without those policy bodies is NOT approved extraction/installation.


-- source-proof.proposed.sql
-- DISPOSABLE CANDIDATE ONLY. NO SQL EXECUTED. NOT AN INSTALLABLE MIGRATION.
-- Depends on source-bootstrap-receipts.sql tables/roles and the exact human begin
-- and finish builders still to be supplied. No generic JSON-intent installer.
-- SOURCE_HUMAN only: alert_rules FEATURE_HUMAN guards are a separate authority.
--
-- BEGIN dependency, exact required contract:
-- after current-authority/state/anchor/source locks, a strict operation-specific
-- typed builder reserves the root UUID; computes root-before and expected-after
-- BUSINESS row hashes using source_business_fingerprint below; stores all fields
-- below by INSERT under rules_enqueue_owner, never caller-supplied proof hashes.
-- It pins immutable proof reservation/review ID/action and manual classification
-- metadata after reading current authorized source rows. Canonical business hash
-- includes ALL companion writes; finish must verify those companions too.
-- updated_at/created_at/recorded_at are excluded from business matching only:
-- source_revision still records actual timestamp/definition revision.
--
-- Existing context is transaction-private; new NOT NULL additions require this
-- table be empty before extraction. Do NOT invent defaults/backfill proof.
ALTER TABLE pathways_rules_internal.source_operation_context
 ADD COLUMN root_relation_oid oid NOT NULL,
 ADD COLUMN root_action text NOT NULL CHECK(root_action IN ('INSERT','UPDATE')),
 ADD COLUMN expected_after_business_hash bytea NOT NULL
   CHECK(pg_catalog.octet_length(expected_after_business_hash)=32),
 ADD COLUMN expected_before_business_hash bytea
   CHECK(expected_before_business_hash IS NULL OR pg_catalog.octet_length(expected_before_business_hash)=32),
 ADD COLUMN related_update_id uuid,
 ADD COLUMN review_action text CHECK(review_action IN ('APPROVE','RETURN')),
 ADD COLUMN manual_definition_revision integer,
 ADD COLUMN manual_definition_fingerprint bytea
   CHECK(manual_definition_fingerprint IS NULL OR pg_catalog.octet_length(manual_definition_fingerprint)=32),
 ADD COLUMN manual_classification_id uuid;

ALTER TABLE pathways_rules_internal.source_operation_receipts
 ADD COLUMN proof_handle uuid NOT NULL,
 ADD COLUMN proof_transaction_id xid8 NOT NULL,
 ADD COLUMN proof_backend_pid integer NOT NULL,
 ADD COLUMN proof_login name NOT NULL CHECK(proof_login='pathways_runtime');
ALTER TABLE pathways_rules_internal.source_operation_receipts
 ADD CONSTRAINT f10_receipt_proof_once UNIQUE(proof_handle);
-- No FK to ephemeral context: finish deletes the context after immutable receipt.
-- Proof fields are never exposed in human acknowledgements.

CREATE FUNCTION pathways_rules_internal.source_business_fingerprint(row_value jsonb)
RETURNS bytea LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.sha256(pg_catalog.convert_to(
   (row_value-ARRAY['created_at','updated_at','recorded_at'])::text,'UTF8'))
$$;
ALTER FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb) OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb)
 TO rules_enqueue_owner;

CREATE FUNCTION pathways_rules_internal.guard_source_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user IS DISTINCT FROM 'pathways_runtime' THEN
  RAISE EXCEPTION 'Source context unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.transaction_id IS DISTINCT FROM pg_catalog.pg_current_xact_id()
   OR OLD.backend_pid IS DISTINCT FROM pg_catalog.pg_backend_pid()
   OR OLD.login_name IS DISTINCT FROM session_user
   OR OLD.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   OR OLD.actor_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid THEN
   RAISE EXCEPTION 'Source context unavailable' USING ERRCODE='42501';
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.transaction_id IS DISTINCT FROM pg_catalog.pg_current_xact_id()
  OR NEW.backend_pid IS DISTINCT FROM pg_catalog.pg_backend_pid()
  OR NEW.login_name IS DISTINCT FROM session_user
  OR NEW.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  OR NEW.actor_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Source context unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed OR NEW.proven_work IS NOT NULL OR NEW.proof_relation IS NOT NULL
   OR NEW.proof_action IS NOT NULL OR NEW.source_after_fingerprint IS NOT NULL
   OR NEW.source_revision IS NOT NULL
   OR ((NEW.root_action='INSERT') IS DISTINCT FROM (NEW.expected_before_business_hash IS NULL)) THEN
   RAISE EXCEPTION 'Unproven source context' USING ERRCODE='22023';
  END IF;
  IF (NEW.request_kind='CLIENT_MUTATION' AND NEW.phase IS DISTINCT FROM 'MUTATION')
   OR (NEW.request_kind='CLIENT_MEASUREMENT' AND NEW.phase IS DISTINCT FROM 'MEASUREMENT')
   OR (NEW.request_kind='PROOF_FINALIZE' AND NEW.phase IS DISTINCT FROM 'FINALIZE')
   OR NEW.request_kind NOT IN ('CLIENT_MUTATION','CLIENT_MEASUREMENT','PROOF_FINALIZE') THEN
   RAISE EXCEPTION 'Invalid source request phase' USING ERRCODE='22023';
  END IF;
 ELSE
  IF OLD.sealed OR NOT NEW.sealed
   OR (pg_catalog.to_jsonb(NEW)-ARRAY['source_before_fingerprint','source_after_fingerprint',
         'source_revision','proven_work','proof_relation','proof_action','sealed'])
      IS DISTINCT FROM
      (pg_catalog.to_jsonb(OLD)-ARRAY['source_before_fingerprint','source_after_fingerprint',
         'source_revision','proven_work','proof_relation','proof_action','sealed'])
   OR NEW.proof_action IS DISTINCT FROM NEW.root_action
   OR NEW.source_before_fingerprint IS DISTINCT FROM NEW.expected_before_business_hash
   OR NEW.source_after_fingerprint IS DISTINCT FROM NEW.expected_after_business_hash
   OR NEW.source_revision IS NULL OR NEW.proven_work IS NULL OR NEW.proof_relation IS NULL THEN
   RAISE EXCEPTION 'Invalid source proof transition' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways_rules_internal.guard_source_context() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_source_context()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,rules_enqueue_owner;
CREATE TRIGGER f10_guard_source_context BEFORE INSERT OR UPDATE OR DELETE
 ON pathways_rules_internal.source_operation_context FOR EACH ROW
 EXECUTE FUNCTION pathways_rules_internal.guard_source_context();

CREATE FUNCTION pathways_rules_internal.prove_source_root_dml()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c pathways_rules_internal.source_operation_context; needed_permission text;
 cat pathways_rules_internal.source_operation_catalog; matches bigint;
 next_row jsonb:=pg_catalog.to_jsonb(NEW); previous_row jsonb;
 before_hash bytea; after_hash bytea; meaningful boolean; work text;
 root_id uuid; org uuid; project uuid; needed text; revision text;
 proof pathways.activity_updates; definition pathways.project_indicators; eligible boolean;
BEGIN
 -- No direct function call or caller-built relation identity supplies provenance.
 IF TG_WHEN IS DISTINCT FROM 'AFTER' OR TG_LEVEL IS DISTINCT FROM 'ROW'
  OR TG_OP NOT IN ('INSERT','UPDATE') OR session_user IS DISTINCT FROM 'pathways_runtime' THEN
  RAISE EXCEPTION 'Source proof unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_RELID NOT IN ('pathways.projects'::regclass,'pathways.project_activities'::regclass,
   'pathways.project_indicators'::regclass,'pathways.project_indicator_measurements'::regclass) THEN
  RAISE EXCEPTION 'Source relation unavailable' USING ERRCODE='42501';
 END IF;
 root_id:=(next_row->>'id')::uuid; org:=(next_row->>'organization_id')::uuid;
 project:=CASE WHEN TG_RELID='pathways.projects'::regclass THEN root_id
   ELSE (next_row->>'project_id')::uuid END;
 SELECT pg_catalog.count(*) INTO matches
 FROM pathways_rules_internal.source_operation_context x
 WHERE x.transaction_id=pg_catalog.pg_current_xact_id() AND x.backend_pid=pg_catalog.pg_backend_pid()
  AND x.login_name=session_user AND x.organization_id=org AND x.project_id=project
  AND x.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND x.source_record_id=root_id
  AND x.root_relation_oid=TG_RELID;
 -- Marker-free existing human writers retain their existing behavior during
 -- proposal rollout. Once hooks are enabled, source participation/enforcement is
 -- an explicit rollout prerequisite; absence MUST NOT be treated as receipt proof.
 IF matches=0 THEN
  IF TG_RELID='pathways.projects'::regclass AND TG_OP='INSERT' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Source operation required' USING ERRCODE='42501';
 END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Ambiguous source proof' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO STRICT c FROM pathways_rules_internal.source_operation_context x
 WHERE x.transaction_id=pg_catalog.pg_current_xact_id() AND x.backend_pid=pg_catalog.pg_backend_pid()
  AND x.login_name=session_user AND x.organization_id=org AND x.project_id=project
  AND x.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND x.source_record_id=root_id
  AND x.root_relation_oid=TG_RELID;
 SELECT x.* INTO STRICT cat FROM pathways_rules_internal.source_operation_catalog x
 WHERE x.operation_code=c.operation_code;
 IF c.sealed OR c.root_action IS DISTINCT FROM TG_OP
  OR c.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  OR c.request_kind IS DISTINCT FROM cat.request_kind
  OR pathways.p06_can(cat.permission_code,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Source proof unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  previous_row:=pg_catalog.to_jsonb(OLD);
  IF (previous_row->>'id')::uuid IS DISTINCT FROM root_id
   OR (previous_row->>'organization_id')::uuid IS DISTINCT FROM org
   OR (TG_RELID<>'pathways.projects'::regclass AND
       (previous_row->>'project_id')::uuid IS DISTINCT FROM project) THEN
   RAISE EXCEPTION 'Source reparenting forbidden' USING ERRCODE='22023';
  END IF;
  before_hash:=pathways_rules_internal.source_business_fingerprint(previous_row);
 END IF;
 after_hash:=pathways_rules_internal.source_business_fingerprint(next_row);
 IF before_hash IS DISTINCT FROM c.expected_before_business_hash
  OR after_hash IS DISTINCT FROM c.expected_after_business_hash THEN
  RAISE EXCEPTION 'Source DML differs from validated request' USING ERRCODE='22023';
 END IF;
 IF TG_RELID='pathways.projects'::regclass THEN
  IF cat.source_table<>'projects' OR c.operation_code<>'PROJECT_UPDATE' OR TG_OP<>'UPDATE' THEN
   RAISE EXCEPTION 'Invalid project operation' USING ERRCODE='22023';
  END IF;
  meaningful:=(previous_row->'status',previous_row->'start_date',previous_row->'end_date')
   IS DISTINCT FROM (next_row->'status',next_row->'start_date',next_row->'end_date');
 ELSIF TG_RELID='pathways.project_activities'::regclass THEN
  IF cat.source_table<>'project_activities'
   OR c.operation_code NOT IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE','ACTIVITY_START',
       'ACTIVITY_CANCEL','ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE')
   OR ((c.operation_code='ACTIVITY_CREATE') IS DISTINCT FROM (TG_OP='INSERT')) THEN
   RAISE EXCEPTION 'Invalid activity operation' USING ERRCODE='22023';
  END IF;
  IF TG_OP='INSERT' AND (next_row->>'created_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Activity creator mismatch' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='ACTIVITY_START' AND
    (previous_row->>'status' IS DISTINCT FROM 'NOT_STARTED' OR next_row->>'status' IS DISTINCT FROM 'IN_PROGRESS') THEN
   RAISE EXCEPTION 'Invalid activity start' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='ACTIVITY_CANCEL' AND
    (previous_row->>'status' NOT IN ('NOT_STARTED','IN_PROGRESS')
      OR next_row->>'status' IS DISTINCT FROM 'CANCELLED') THEN
   RAISE EXCEPTION 'Invalid activity cancellation' USING ERRCODE='22023';
  END IF;
  IF c.operation_code IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE') THEN
   IF c.related_update_id IS NULL THEN RAISE EXCEPTION 'Missing proof root' USING ERRCODE='22023'; END IF;
   SELECT u.id,u.organization_id,u.project_id,u.activity_id,u.submitted_by_id,u.progress_percent,
     u.status,u.reviewed_by_id INTO proof.id,proof.organization_id,proof.project_id,proof.activity_id,
     proof.submitted_by_id,proof.progress_percent,proof.status,proof.reviewed_by_id
   FROM pathways.activity_updates u WHERE u.organization_id=org AND u.project_id=project
    AND u.id=c.related_update_id AND u.activity_id=root_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Proof root unavailable' USING ERRCODE='22023'; END IF;
   IF c.operation_code='ACTIVITY_PROOF_FINALIZE' THEN
    IF c.request_kind<>'PROOF_FINALIZE' OR c.request_id<>proof.id OR c.phase<>'FINALIZE'
     OR proof.submitted_by_id IS DISTINCT FROM c.actor_id OR proof.status::text<>'PENDING'
     OR previous_row->>'status' NOT IN ('IN_PROGRESS','FOR_REVIEW')
     OR next_row->>'status' IS DISTINCT FROM 'FOR_REVIEW'
     OR (next_row->>'progress_percent')::integer IS DISTINCT FROM proof.progress_percent
     OR EXISTS(SELECT 1 FROM pathways.evidence_media e WHERE e.organization_id=org
         AND e.project_id=project AND e.activity_update_id=proof.id
         AND (NOT e.storage_ready OR e.activity_id IS DISTINCT FROM root_id
           OR e.submitted_by_id IS DISTINCT FROM c.actor_id)) THEN
     RAISE EXCEPTION 'Invalid proof finalization' USING ERRCODE='22023';
    END IF;
   ELSE
    IF proof.submitted_by_id=c.actor_id OR proof.reviewed_by_id IS DISTINCT FROM c.actor_id
     OR c.review_action IS NULL OR previous_row->>'status' IS DISTINCT FROM 'FOR_REVIEW'
     OR (c.review_action='APPROVE' AND (proof.status::text<>'APPROVED' OR next_row->>'status' IS DISTINCT FROM CASE WHEN proof.progress_percent=100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END))
     OR (c.review_action='RETURN' AND (proof.status::text<>'REJECTED' OR next_row->>'status' IS DISTINCT FROM 'IN_PROGRESS')) THEN
     RAISE EXCEPTION 'Invalid proof review' USING ERRCODE='22023';
    END IF;
   END IF;
  END IF;
  meaningful:=TG_OP='INSERT' OR
    (previous_row->'status',previous_row->'planned_start_date',previous_row->'planned_end_date',
     previous_row->'actual_start_date',previous_row->'actual_end_date',previous_row->'archived_at')
    IS DISTINCT FROM
    (next_row->'status',next_row->'planned_start_date',next_row->'planned_end_date',
     next_row->'actual_start_date',next_row->'actual_end_date',next_row->'archived_at');
 ELSIF TG_RELID='pathways.project_indicators'::regclass THEN
  IF cat.source_table<>'project_indicators'
   OR c.operation_code NOT IN ('INDICATOR_CREATE','INDICATOR_UPDATE','INDICATOR_ARCHIVE')
   OR ((c.operation_code='INDICATOR_CREATE') IS DISTINCT FROM (TG_OP='INSERT')) THEN
   RAISE EXCEPTION 'Invalid indicator operation' USING ERRCODE='22023';
  END IF;
  IF TG_OP='INSERT' AND (next_row->>'created_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Indicator creator mismatch' USING ERRCODE='22023';
  END IF;
  IF c.operation_code='INDICATOR_ARCHIVE' AND
    (previous_row->'archived_at'<>'null'::jsonb OR next_row->'archived_at'='null'::jsonb) THEN
   RAISE EXCEPTION 'Invalid indicator archive' USING ERRCODE='22023';
  END IF;
  meaningful:=TG_OP='INSERT' OR before_hash IS DISTINCT FROM after_hash;
 ELSE
  IF cat.source_table<>'project_indicator_measurements' OR c.operation_code<>'INDICATOR_MEASUREMENT'
   OR TG_OP<>'INSERT' OR c.request_kind<>'CLIENT_MEASUREMENT' OR c.phase<>'MEASUREMENT'
   OR (next_row->>'client_measurement_id')::uuid IS DISTINCT FROM c.request_id
   OR (next_row->>'recorded_by_id')::uuid IS DISTINCT FROM c.actor_id THEN
   RAISE EXCEPTION 'Invalid measurement identity' USING ERRCODE='22023';
  END IF;
  -- Existing p06_guard_measurement remains the domain/correction validator.
  -- Only current approved MANUAL metadata can classify the inserted root W_G.
  -- Fingerprint is generated by the fixed begin definition builder; no supplied
  -- eligibility flag or measurement VALUE query enters this proof routine.
  SELECT i.id,i.organization_id,i.project_id,i.revision,i.measurement_mode,
      i.period_start,i.period_end,i.archived_at
   INTO definition.id,definition.organization_id,definition.project_id,definition.revision,
      definition.measurement_mode,definition.period_start,definition.period_end,definition.archived_at
  FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project
   AND i.id=(next_row->>'indicator_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Measurement definition missing' USING ERRCODE='22023'; END IF;
  SELECT EXISTS(
   SELECT 1 FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=org AND e.project_id=project AND e.indicator_id=definition.id
    AND e.id=c.manual_classification_id AND e.definition_revision=definition.revision
    AND definition.revision=c.manual_definition_revision
    AND e.source_fingerprint=c.manual_definition_fingerprint
    AND e.decision='ALLOWED_NON_SENSITIVE' AND e.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    AND e.approved_at<=pg_catalog.clock_timestamp()
    AND (e.expires_at IS NULL OR e.expires_at>pg_catalog.clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.eligibility newer
      WHERE newer.organization_id=e.organization_id AND newer.project_id=e.project_id
       AND newer.indicator_id=e.indicator_id AND newer.classification_revision>e.classification_revision)
  ) INTO eligible;
  meaningful:=eligible AND definition.measurement_mode::text='MANUAL' AND definition.archived_at IS NULL
   AND definition.period_start IS NOT DISTINCT FROM (next_row->>'period_start')::date
   AND definition.period_end IS NOT DISTINCT FROM (next_row->>'period_end')::date
   AND NOT EXISTS(SELECT 1 FROM pathways.project_indicator_bindings b
    WHERE b.organization_id=org AND b.project_id=project AND b.indicator_id=definition.id);
 END IF;
 work:=CASE WHEN meaningful THEN cat.maximum_work ELSE 'NONE' END;
 revision:=CASE WHEN TG_RELID='pathways.project_indicators'::regclass
   THEN next_row->>'revision' WHEN TG_RELID='pathways.project_indicator_measurements'::regclass
   THEN root_id::text ELSE next_row->>'updated_at' END;
 IF revision IS NULL THEN RAISE EXCEPTION 'Missing source revision' USING ERRCODE='22023'; END IF;
 UPDATE pathways_rules_internal.source_operation_context x SET
  source_before_fingerprint=before_hash, source_after_fingerprint=after_hash,
  source_revision=revision, proven_work=work, proof_relation=TG_RELID::regclass::text,
  proof_action=TG_OP, sealed=true WHERE x.handle=c.handle AND NOT x.sealed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source proof already consumed' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways_rules_internal.prove_source_root_dml() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.prove_source_root_dml()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,rules_enqueue_owner;

CREATE TRIGGER f10_prove_project_source AFTER INSERT OR UPDATE ON pathways.projects
 FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.prove_source_root_dml();
CREATE TRIGGER f10_prove_activity_source AFTER INSERT OR UPDATE ON pathways.project_activities
 FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.prove_source_root_dml();
CREATE TRIGGER f10_prove_indicator_source AFTER INSERT OR UPDATE ON pathways.project_indicators
 FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.prove_source_root_dml();
CREATE TRIGGER f10_prove_measurement_source AFTER INSERT OR UPDATE ON pathways.project_indicator_measurements
 FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.prove_source_root_dml();

CREATE FUNCTION pathways_rules_internal.guard_source_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c pathways_rules_internal.source_operation_context; needed_permission text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Source receipt is immutable' USING ERRCODE='55000'; END IF;
 IF session_user IS DISTINCT FROM 'pathways_runtime'
  OR NEW.proof_transaction_id IS DISTINCT FROM pg_catalog.pg_current_xact_id()
  OR NEW.proof_backend_pid IS DISTINCT FROM pg_catalog.pg_backend_pid()
  OR NEW.proof_login IS DISTINCT FROM session_user THEN
  RAISE EXCEPTION 'Receipt proof unavailable' USING ERRCODE='42501';
 END IF;
 SELECT x.* INTO c FROM pathways_rules_internal.source_operation_context x
 WHERE x.handle=NEW.proof_handle AND x.transaction_id=NEW.proof_transaction_id
  AND x.backend_pid=NEW.proof_backend_pid AND x.login_name=NEW.proof_login;
 IF NOT FOUND OR c.sealed IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Receipt proof unavailable' USING ERRCODE='42501';
 END IF;
 IF FOUND THEN
  SELECT cat.permission_code INTO needed_permission
   FROM pathways_rules_internal.source_operation_catalog cat
   WHERE cat.operation_code=c.operation_code;
 END IF;
 IF needed_permission IS NULL OR pathways.p06_can(needed_permission,NEW.project_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Receipt authority unavailable' USING ERRCODE='42501';
 END IF;
 IF NOT FOUND OR NOT c.sealed OR NEW.organization_id IS DISTINCT FROM c.organization_id
  OR NEW.project_id IS DISTINCT FROM c.project_id OR NEW.actor_id IS DISTINCT FROM c.actor_id
  OR NEW.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  OR NEW.actor_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  OR NEW.operation_code IS DISTINCT FROM c.operation_code
  OR NEW.request_kind IS DISTINCT FROM c.request_kind OR NEW.request_id IS DISTINCT FROM c.request_id
  OR NEW.phase IS DISTINCT FROM c.phase OR NEW.canonical_request_hash IS DISTINCT FROM c.canonical_request_hash
  OR NEW.source_record_id IS DISTINCT FROM c.source_record_id
  OR NEW.source_revision IS DISTINCT FROM c.source_revision
  OR NEW.source_before_fingerprint IS DISTINCT FROM c.source_before_fingerprint
  OR NEW.source_after_fingerprint IS DISTINCT FROM c.source_after_fingerprint
  OR (NEW.work_mode IS DISTINCT FROM c.proven_work AND NOT (
       NEW.work_mode='NONE' AND NOT EXISTS(SELECT 1 FROM pathways.alert_rules r
         WHERE r.organization_id=c.organization_id AND r.project_id=c.project_id
          AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE'))) THEN
  RAISE EXCEPTION 'Receipt does not match sealed source proof' USING ERRCODE='22023';
 END IF;
 NEW.committed_at:=pg_catalog.clock_timestamp();
 RETURN NEW;
END $$;
ALTER FUNCTION pathways_rules_internal.guard_source_receipt() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_source_receipt()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,rules_enqueue_owner;
CREATE TRIGGER f10_guard_source_receipt BEFORE INSERT OR UPDATE OR DELETE
 ON pathways_rules_internal.source_operation_receipts FOR EACH ROW
 EXECUTE FUNCTION pathways_rules_internal.guard_source_receipt();

-- Exact incremental ACLs. Existing context RLS f10_human_marker already matches
-- current transaction/backend/session/org/actor; INSERT/DELETE remain enqueue-only.
-- No SOURCE_HUMAN owner receives numeric measurement SELECT or worker authority.
GRANT EXECUTE ON FUNCTION pathways.p06_can(text,uuid) TO rules_source_proof_owner;
GRANT SELECT(id,organization_id,project_id,activity_id,submitted_by_id,progress_percent,status,reviewed_by_id)
 ON pathways.activity_updates TO rules_source_proof_owner;
GRANT SELECT(id,organization_id,project_id,activity_id,activity_update_id,storage_ready,submitted_by_id)
 ON pathways.evidence_media TO rules_source_proof_owner;
GRANT SELECT(id,organization_id,project_id,revision,measurement_mode,period_start,period_end,archived_at)
 ON pathways.project_indicators TO rules_source_proof_owner;
GRANT SELECT(organization_id,project_id,indicator_id) ON pathways.project_indicator_bindings TO rules_source_proof_owner;
GRANT SELECT(id,organization_id,project_id,runtime_contract_version,status)
 ON pathways.alert_rules TO rules_source_proof_owner;
GRANT SELECT(id,organization_id,project_id,indicator_id,definition_revision,classification_revision,
 source_fingerprint,decision,audience,approved_at,expires_at)
 ON pathways_rules_internal.eligibility TO rules_source_proof_owner;
CREATE POLICY f10_proof_update_read ON pathways.activity_updates FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('activities.proof.submit',project_id) IS TRUE
    OR pathways.p06_can('evidence.review',project_id) IS TRUE));
CREATE POLICY f10_proof_media_read ON pathways.evidence_media FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('activities.proof.submit',project_id) IS TRUE
    OR pathways.p06_can('evidence.review',project_id) IS TRUE));
CREATE POLICY f10_proof_definition_read ON pathways.project_indicators FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('indicators.update',project_id) IS TRUE);
CREATE POLICY f10_proof_binding_read ON pathways.project_indicator_bindings FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('indicators.update',project_id) IS TRUE);
CREATE POLICY f10_proof_classification_read ON pathways_rules_internal.eligibility FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('indicators.update',project_id) IS TRUE);
CREATE POLICY f10_proof_runtime_rule_metadata ON pathways.alert_rules FOR SELECT TO rules_source_proof_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.organization_id=alert_rules.organization_id
    AND c.project_id=alert_rules.project_id
    AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid));

-- REMAINING exact dependencies, NOT approval flags or fabricated validators:
-- 1. Typed per-operation canonical begin builders must construct exact expected
-- business-row hashes, validate companion writes and bind proof/measurement roots.
-- They must retain canonical comparison of omitted/null semantics and existing
-- measurement request_hash; trigger cannot reconstruct full request from root alone.
-- 2. Finish must recheck current authority after waiting, require sealed marker,
-- lock/create queue before receipt INSERT, issue DB receipt UUID itself, validate
-- source root still matches proof, and atomically associate work_item identity,
-- source watermark/generation and original ack. Deferred scoped work_item FK +
-- immutable work association verifier must permit receipt-before-work WRITE order
-- while enforcing queue-before-receipt LOCK order. No such finish is implemented here.
-- 3. Install only in reviewed transaction with role/default ACL catalog checks,
-- exact source table RLS enablement already present, measurement/domain and source
-- root no-delete guards preserved; proof guards introduce no user-table mutation.
-- 4. Runtime-enabled source writers must be instrumented and maintenance writers
-- explicitly gated. Marker-free paths return no proof rather than silently minting
-- receipts; installation alone does NOT prove full source participation/enforcement.
-- 5. Actual source trigger ordering, proof status names, populated upgrade and
-- revocation/FK/correction-chain/concurrency tests require replay; nothing ran.


-- source-validation.proposed.sql
-- Candidate only. Fixed source input grammar; no caller row hashes or work flags.
CREATE FUNCTION pathways_rules_internal.canonical_source_request(operation text,body jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[]; required text[]; k text; v jsonb; item jsonb; normalized jsonb:=body; maximum_length integer;
BEGIN
 IF pg_catalog.jsonb_typeof(body) IS DISTINCT FROM 'object' OR pg_catalog.octet_length(body::text)>65536 THEN
  RAISE EXCEPTION 'Invalid source request' USING ERRCODE='22023'; END IF;
 CASE operation
 WHEN 'PROJECT_UPDATE' THEN
  allowed:=ARRAY['expectedUpdatedAt','code','title','description','objectives','implementationArea','implementingPartners',
   'implementingPartnerNames','sector','targetBeneficiaries','startDate','endDate','status','programId','programManagerId',
   'projectManagerId','monitoringOfficerId','projectOfficerIds','projectBudget']; required:=ARRAY['expectedUpdatedAt','title','status'];
 WHEN 'ACTIVITY_CREATE','ACTIVITY_UPDATE' THEN
  allowed:=ARRAY['code','title','description','activityType','plannedStartDate','plannedEndDate','timelineOverrideJustification',
   'targetBeneficiaries','budgetAllocation','assignedUserIds','indicatorIds','journeyStageId'];
  required:=ARRAY['title','plannedStartDate','plannedEndDate','assignedUserIds'];
  IF operation='ACTIVITY_UPDATE' THEN allowed:=pg_catalog.array_append(allowed,'expectedUpdatedAt'); required:=pg_catalog.array_append(required,'expectedUpdatedAt'); END IF;
 WHEN 'ACTIVITY_START','ACTIVITY_CANCEL' THEN
  allowed:=ARRAY['expectedUpdatedAt','status','reason']; required:=ARRAY['expectedUpdatedAt','status'];
 WHEN 'ACTIVITY_REVIEW' THEN
  allowed:=ARRAY['updateId','decision','reason','expectedUpdatedAt']; required:=allowed;
 WHEN 'ACTIVITY_PROOF_FINALIZE' THEN
  allowed:=ARRAY['updateId','progressPercent','note','files']; required:=allowed;
 WHEN 'INDICATOR_CREATE' THEN
  allowed:=ARRAY['code','name','description','unitLabel','dataSource','mode','numericKind','direction','displayPrecision',
   'periodStart','periodEnd','baseline','target','binding'];
  required:=ARRAY['code','name','unitLabel','dataSource','mode','numericKind','direction','displayPrecision','periodStart','periodEnd','baseline','target'];
 WHEN 'INDICATOR_UPDATE' THEN allowed:=ARRAY['name','description','expectedRevision']; required:=ARRAY['name','expectedRevision'];
 WHEN 'INDICATOR_ARCHIVE' THEN allowed:=ARRAY['expectedRevision']; required:=allowed;
 WHEN 'INDICATOR_MEASUREMENT' THEN
  allowed:=ARRAY['periodStart','periodEnd','value','source','note','correctsMeasurementId','correctionReason'];
  required:=ARRAY['periodStart','periodEnd','value','source'];
 ELSE RAISE EXCEPTION 'Unknown source operation' USING ERRCODE='22023'; END CASE;
 IF body-allowed<>'{}'::jsonb OR NOT(body ?& required) THEN
  RAISE EXCEPTION 'Invalid source fields' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT e.key,e.value FROM pg_catalog.jsonb_each(body) e LOOP
  IF v='null'::jsonb THEN
   IF k=ANY(required) AND k NOT IN ('baseline','target') THEN
    RAISE EXCEPTION 'Required source field is null' USING ERRCODE='22023'; END IF;
   IF k NOT IN ('description','objectives','implementationArea','implementingPartners','sector','targetBeneficiaries',
     'programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','baseline','target')
    AND NOT(operation='PROJECT_UPDATE' AND k IN ('code','startDate','endDate'))
    AND NOT(operation IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE') AND k IN ('code','activityType','timelineOverrideJustification')) THEN
    RAISE EXCEPTION 'Invalid null source field' USING ERRCODE='22023'; END IF;
  ELSIF k IN ('expectedRevision','displayPrecision','targetBeneficiaries','progressPercent') THEN
   IF pg_catalog.jsonb_typeof(v)<>'number' OR v::text !~ '^(0|[1-9][0-9]{0,9})$'
    OR v::text::numeric>2147483647 OR (k='expectedRevision' AND v::text::int<1)
    OR (k='displayPrecision' AND v::text::int>4) OR (k='progressPercent' AND v::text::int>100) THEN
    RAISE EXCEPTION 'Invalid source integer' USING ERRCODE='22023'; END IF;
  ELSIF k IN ('assignedUserIds','indicatorIds','projectOfficerIds','implementingPartnerNames') THEN
   IF pg_catalog.jsonb_typeof(v)<>'array' OR pg_catalog.jsonb_array_length(v)>
     (CASE k WHEN 'indicatorIds' THEN 100 WHEN 'implementingPartnerNames' THEN 20 ELSE 50 END)
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v) e WHERE pg_catalog.jsonb_typeof(e)<>'string') THEN
    RAISE EXCEPTION 'Invalid source collection' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT e FROM pg_catalog.jsonb_array_elements(v) e LOOP
    IF k='implementingPartnerNames' THEN
     IF pg_catalog.char_length(pg_catalog.btrim(item#>>'{}')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid partner name' USING ERRCODE='22023'; END IF;
    ELSIF (item#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     RAISE EXCEPTION 'Invalid source UUID' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(v))<>
     (SELECT pg_catalog.count(DISTINCT e) FROM pg_catalog.jsonb_array_elements(v) e) THEN
    RAISE EXCEPTION 'Duplicate source collection item' USING ERRCODE='22023'; END IF;
   SELECT coalesce(pg_catalog.jsonb_agg(e ORDER BY e),'[]'::jsonb) INTO v FROM pg_catalog.jsonb_array_elements(v) e;
   normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],v);
  ELSIF k='files' THEN
   IF pg_catalog.jsonb_typeof(v)<>'array' OR pg_catalog.jsonb_array_length(v) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Invalid proof files' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT e FROM pg_catalog.jsonb_array_elements(v) e LOOP
    IF pg_catalog.jsonb_typeof(item)<>'object' OR item-ARRAY['fileName','sha256','contentType','byteSize']<>'{}'::jsonb
     OR NOT(item ?& ARRAY['fileName','sha256','contentType','byteSize'])
     OR pg_catalog.jsonb_typeof(item->'fileName') IS DISTINCT FROM 'string'
     OR pg_catalog.char_length(item->>'fileName') NOT BETWEEN 1 AND 128 OR (item->>'fileName') ~ '[/\\]'
     OR pg_catalog.jsonb_typeof(item->'sha256') IS DISTINCT FROM 'string' OR (item->>'sha256') !~ '^[0-9a-f]{64}$'
     OR pg_catalog.jsonb_typeof(item->'contentType') IS DISTINCT FROM 'string'
     OR item->>'contentType' NOT IN ('image/jpeg','image/png','image/webp','video/mp4','application/pdf')
     OR pg_catalog.jsonb_typeof(item->'byteSize') IS DISTINCT FROM 'number' OR (item->>'byteSize') !~ '^[1-9][0-9]{0,7}$'
     OR (item->>'byteSize')::bigint>10485760 THEN
     RAISE EXCEPTION 'Invalid proof metadata' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT pg_catalog.sum((e->>'byteSize')::bigint) FROM pg_catalog.jsonb_array_elements(v) e)>26214400 THEN
    RAISE EXCEPTION 'Proof total exceeds bound' USING ERRCODE='22023'; END IF;
   SELECT pg_catalog.jsonb_agg(e ORDER BY e->>'fileName',e->>'sha256',e->>'contentType',(e->>'byteSize')::bigint)
    INTO v FROM pg_catalog.jsonb_array_elements(v) e;
   normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],v);
  ELSIF k='binding' THEN
   IF pg_catalog.jsonb_typeof(v)<>'object' OR v-ARRAY['recipe','activityId','formId','formVersion','fieldId']<>'{}'::jsonb
    OR NOT(v?'recipe') OR v->>'recipe' NOT IN ('ACTIVITY_COMPLETION_PERCENTAGE','PARTICIPATION_RECORD_COUNT',
     'DISTINCT_ATTENDING_INDIVIDUALS','EFFECTIVE_JOURNEY_EVENT_COUNT','ATTENDANCE_RECORDS_PER_INDIVIDUAL') THEN
    RAISE EXCEPTION 'Invalid source binding' USING ERRCODE='22023'; END IF;
   -- Native P06 guard independently validates recipe parents and their domain types.
  ELSE
   IF pg_catalog.jsonb_typeof(v)<>'string' OR pg_catalog.char_length(v#>>'{}')>4000 THEN
    RAISE EXCEPTION 'Invalid source text' USING ERRCODE='22023'; END IF;
   IF k IN ('programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','updateId','correctsMeasurementId')
    AND (v#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid source UUID' USING ERRCODE='22023'; END IF;
   IF k IN ('startDate','endDate','plannedStartDate','plannedEndDate','periodStart','periodEnd')
    AND ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR pg_catalog.to_char((v#>>'{}')::date,'YYYY-MM-DD') IS DISTINCT FROM (v#>>'{}')) THEN
    RAISE EXCEPTION 'Invalid source date' USING ERRCODE='22023'; END IF;
   IF k='expectedUpdatedAt' AND ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR pg_catalog.to_char((v#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM (v#>>'{}')) THEN
    RAISE EXCEPTION 'Invalid source version' USING ERRCODE='22023'; END IF;
   IF k IN ('projectBudget','budgetAllocation') AND (v#>>'{}') !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Invalid source budget' USING ERRCODE='22023'; END IF;
   IF k IN ('baseline','target','value') AND (v#>>'{}') !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN
    RAISE EXCEPTION 'Invalid source decimal' USING ERRCODE='22023'; END IF;
   IF k IN ('baseline','target','value') THEN normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],pg_catalog.to_jsonb(pg_catalog.trim_scale((v#>>'{}')::numeric)::text)); END IF;
   maximum_length:=CASE k WHEN 'title' THEN 160 WHEN 'name' THEN 160 WHEN 'code' THEN 40 WHEN 'unitLabel' THEN 80
    WHEN 'dataSource' THEN 300 WHEN 'source' THEN 300 WHEN 'implementationArea' THEN 240 WHEN 'sector' THEN 160
    WHEN 'implementingPartners' THEN 1000 WHEN 'reason' THEN 1000 WHEN 'correctionReason' THEN 1000
    WHEN 'activityType' THEN 80 WHEN 'timelineOverrideJustification' THEN 1000
    WHEN 'description' THEN CASE WHEN operation LIKE 'ACTIVITY_%' THEN 4000 ELSE 2000 END
    WHEN 'note' THEN CASE WHEN operation='ACTIVITY_PROOF_FINALIZE' THEN 4000 ELSE 1000 END ELSE 4000 END;
   IF pg_catalog.char_length(pg_catalog.btrim(v#>>'{}'))>maximum_length
    OR (k='title' AND pg_catalog.char_length(pg_catalog.btrim(v#>>'{}'))<3)
    OR (k IN ('name','unitLabel','dataSource','source','reason','correctionReason') AND pg_catalog.btrim(v#>>'{}')='') THEN
    RAISE EXCEPTION 'Invalid source text bound' USING ERRCODE='22023'; END IF;
   IF k NOT IN ('expectedUpdatedAt','startDate','endDate','plannedStartDate','plannedEndDate','periodStart','periodEnd',
    'programId','programManagerId','projectManagerId','monitoringOfficerId','journeyStageId','updateId','correctsMeasurementId',
    'baseline','target','value') THEN normalized:=pg_catalog.jsonb_set(normalized,ARRAY[k],pg_catalog.to_jsonb(pg_catalog.btrim(v#>>'{}'))); END IF;
  END IF;
 END LOOP;
 IF operation='PROJECT_UPDATE' AND body->>'status' NOT IN ('PLANNED','ONGOING','COMPLETED','ON_HOLD','CANCELLED')
  OR operation='ACTIVITY_START' AND body->>'status'<>'IN_PROGRESS'
  OR operation='ACTIVITY_CANCEL' AND (body->>'status'<>'CANCELLED' OR pg_catalog.btrim(body->>'reason') IS NULL OR pg_catalog.btrim(body->>'reason')='')
  OR operation='ACTIVITY_REVIEW' AND (body->>'decision' NOT IN ('APPROVE','RETURN') OR pg_catalog.btrim(body->>'reason')='') THEN
  RAISE EXCEPTION 'Invalid source action' USING ERRCODE='22023'; END IF;
 IF operation='INDICATOR_CREATE' AND (body->>'mode' NOT IN ('MANUAL','DERIVED')
  OR body->>'numericKind' NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
  OR body->>'direction' NOT IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','DESCRIPTIVE')
  OR ((body->>'mode'='DERIVED') IS DISTINCT FROM (body?'binding'))
  OR (body->>'code') !~ '^[A-Z][A-Z0-9_-]{1,39}$') THEN RAISE EXCEPTION 'Invalid indicator definition' USING ERRCODE='22023'; END IF;
 RETURN normalized;
END $$;
ALTER FUNCTION pathways_rules_internal.canonical_source_request(text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.canonical_source_request(text,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- source-operation.proposed.sql
-- Candidate fixed source entrypoints. Runtime is granted only begin/finish.
ALTER TABLE pathways_rules_internal.source_operation_context
 ADD COLUMN canonical_body jsonb NOT NULL,
 ADD COLUMN generated_at timestamptz(3) NOT NULL;
ALTER TABLE pathways_rules_internal.source_operation_receipts
 ADD COLUMN work_generation bigint, ADD COLUMN work_watermark bigint,
 ADD CONSTRAINT f10_source_work_numbers CHECK(
  (work_mode='NONE' AND work_generation IS NULL AND work_watermark IS NULL)
  OR (work_mode<>'NONE' AND work_generation IS NOT NULL AND work_generation>0
   AND work_watermark IS NOT NULL AND work_watermark>=0)),
 ADD CONSTRAINT f10_source_work_fk FOREIGN KEY(organization_id,project_id,work_item_id)
 REFERENCES pathways_rules_internal.work_items(organization_id,project_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX f10_completed_source_tx_idx ON pathways_rules_internal.source_operation_receipts
 (proof_transaction_id,proof_backend_pid,proof_login,organization_id,project_id,source_record_id);

CREATE FUNCTION pathways_rules_internal.read_source_row(operation text,org uuid,project uuid,source uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 CASE operation
 WHEN 'PROJECT_UPDATE' THEN SELECT pg_catalog.to_jsonb(p) INTO result FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
 WHEN 'ACTIVITY_CREATE','ACTIVITY_UPDATE','ACTIVITY_START','ACTIVITY_CANCEL','ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE' THEN
  SELECT pg_catalog.to_jsonb(a) INTO result FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project AND a.id=read_source_row.source;
 WHEN 'INDICATOR_CREATE','INDICATOR_UPDATE','INDICATOR_ARCHIVE' THEN
  SELECT pg_catalog.to_jsonb(i) INTO result FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=project AND i.id=read_source_row.source;
 WHEN 'INDICATOR_MEASUREMENT' THEN
  SELECT pg_catalog.to_jsonb(m) INTO result FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project AND m.id=read_source_row.source;
 ELSE RAISE EXCEPTION 'Unknown source operation' USING ERRCODE='22023'; END CASE;
 RETURN result;
END $$;

CREATE FUNCTION pathways.f10_begin_source_operation(operation text,wanted_project uuid,wanted_source uuid,
 wanted_kind text,wanted_request uuid,wanted_phase text,body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE org uuid; actor uuid; cat pathways_rules_internal.source_operation_catalog;
 request jsonb; recovered jsonb; project_row pathways.projects; before_row jsonb; after_row jsonb; patch jsonb;
 source uuid; handle_id uuid; relation_oid oid; action text; generated_at timestamptz(3); reporting_date date;
 related pathways.activity_updates; definition pathways.project_indicators; manual_class uuid; manual_fp bytea;
 k text; db_key text; value jsonb; normalized_value text; request_hash text; compact text;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user IS DISTINCT FROM 'pathways_runtime' OR wanted_project IS NULL OR wanted_request IS NULL
  OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 SELECT c.* INTO cat FROM pathways_rules_internal.source_operation_catalog c
  WHERE c.operation_code=operation AND c.request_kind=wanted_kind AND c.request_kind<>'CONFIGURATION';
 IF NOT FOUND OR org IS NULL OR actor IS NULL OR pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 IF (wanted_kind='CLIENT_MUTATION' AND wanted_phase IS DISTINCT FROM 'MUTATION')
  OR (wanted_kind='CLIENT_MEASUREMENT' AND wanted_phase IS DISTINCT FROM 'MEASUREMENT')
  OR (wanted_kind='PROOF_FINALIZE' AND wanted_phase IS DISTINCT FROM 'FINALIZE') THEN
  RAISE EXCEPTION 'Invalid source key' USING ERRCODE='22023'; END IF;
 body:=pathways_rules_internal.canonical_source_request(operation,body);request:=body;
 -- Source id is included by SQL, preventing reuse against a different resource.
 request:=pg_catalog.jsonb_build_object('operation',operation,'sourceId',wanted_source,'body',request);
 recovered:=pathways.f10_source_acknowledgement(wanted_project,operation,wanted_kind,wanted_request,wanted_phase,request);
 IF recovered IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('kind','REPLAY','acknowledgement',recovered); END IF;
 PERFORM pathways.f10_bootstrap_project(wanted_project,operation);
 PERFORM pathways_rules_internal.lock_source_request_identity(org,actor,wanted_kind,wanted_request,wanted_phase);
 PERFORM pathways_rules_internal.assert_source_request_live(org,actor,wanted_kind,wanted_request,wanted_phase);
 recovered:=pathways.f10_source_acknowledgement(wanted_project,operation,wanted_kind,wanted_request,wanted_phase,request);
 IF recovered IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('kind','REPLAY','acknowledgement',recovered); END IF;
 IF EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user) THEN
  RAISE EXCEPTION 'Nested source operation unavailable' USING ERRCODE='55000'; END IF;
 SELECT p.* INTO project_row FROM pathways.projects p WHERE p.organization_id=org AND p.id=wanted_project
  AND p.archived_at IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND OR pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true
  OR nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS DISTINCT FROM actor OR nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid IS DISTINCT FROM org THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 IF operation IN ('ACTIVITY_CREATE','INDICATOR_CREATE') AND wanted_source IS NOT NULL
  OR operation NOT IN ('ACTIVITY_CREATE','INDICATOR_CREATE','PROJECT_UPDATE') AND wanted_source IS NULL
  OR operation='PROJECT_UPDATE' AND wanted_source IS DISTINCT FROM wanted_project THEN
  RAISE EXCEPTION 'Invalid source root' USING ERRCODE='22023'; END IF;
 action:=CASE WHEN operation IN ('ACTIVITY_CREATE','INDICATOR_CREATE','INDICATOR_MEASUREMENT') THEN 'INSERT' ELSE 'UPDATE' END;
 source:=CASE WHEN action='INSERT' THEN pg_catalog.gen_random_uuid() ELSE wanted_source END;
 -- Definition locks precede activities. Measurement sourceId denotes its parent definition.
 IF operation LIKE 'INDICATOR_%' AND operation<>'INDICATOR_CREATE' THEN
  SELECT i.* INTO definition FROM pathways.project_indicators i WHERE i.organization_id=org AND i.project_id=wanted_project
   AND i.id=wanted_source FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF operation LIKE 'ACTIVITY_%' AND operation<>'ACTIVITY_CREATE' THEN
  PERFORM 1 FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=wanted_project
   AND a.id=source AND a.archived_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 before_row:=CASE WHEN action='UPDATE' THEN pathways_rules_internal.read_source_row(operation,org,wanted_project,source) ELSE NULL END;
 IF action='UPDATE' AND before_row IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
 generated_at:=greatest(pg_catalog.clock_timestamp()::timestamptz(3),project_row.updated_at+interval '1 millisecond',
  CASE WHEN before_row IS NOT NULL THEN (before_row->>'updated_at')::timestamptz+interval '1 millisecond' END);
 IF operation IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE') THEN
  SELECT u.* INTO related FROM pathways.activity_updates u WHERE u.organization_id=org AND u.project_id=wanted_project
   AND u.activity_id=source AND u.id=(body->>'updateId')::uuid FOR NO KEY UPDATE;
  IF NOT FOUND OR related.status::text<>'PENDING' THEN RAISE EXCEPTION 'Proof unavailable' USING ERRCODE='40001'; END IF;
  generated_at:=greatest(generated_at,related.updated_at+interval '1 millisecond');
  -- These exact evidence rows are protected before any readiness/review write.
  PERFORM e.id FROM pathways.evidence_media e WHERE e.organization_id=org AND e.project_id=wanted_project
   AND e.activity_id=source AND e.activity_update_id=related.id ORDER BY e.id FOR NO KEY UPDATE;
  IF operation='ACTIVITY_REVIEW' AND (related.submitted_by_id=actor OR before_row->>'status'<>'FOR_REVIEW'
   OR related.updated_at IS DISTINCT FROM (body->>'expectedUpdatedAt')::timestamptz) THEN
   RAISE EXCEPTION 'Proof changed' USING ERRCODE='40001'; END IF;
  IF operation='ACTIVITY_PROOF_FINALIZE' AND (related.submitted_by_id IS DISTINCT FROM actor OR related.id IS DISTINCT FROM wanted_request
   OR before_row->>'status' NOT IN ('IN_PROGRESS','FOR_REVIEW') OR related.progress_percent IS DISTINCT FROM (body->>'progressPercent')::int
   OR related.note IS DISTINCT FROM body->>'note') THEN
   RAISE EXCEPTION 'Proof changed' USING ERRCODE='40001'; END IF;
 END IF;
 IF action='UPDATE' AND operation NOT IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE','INDICATOR_UPDATE','INDICATOR_ARCHIVE')
  AND (before_row->>'updated_at')::timestamptz IS DISTINCT FROM (body->>'expectedUpdatedAt')::timestamptz
  OR operation IN ('INDICATOR_UPDATE','INDICATOR_ARCHIVE') AND definition.revision IS DISTINCT FROM (body->>'expectedRevision')::int THEN
  RAISE EXCEPTION 'Source changed' USING ERRCODE='40001'; END IF;
 SELECT (generated_at AT TIME ZONE c.zone)::date INTO reporting_date FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF reporting_date IS NULL THEN RAISE EXCEPTION 'Calendar unavailable' USING ERRCODE='55000'; END IF;
 after_row:=before_row;
 CASE operation
 WHEN 'PROJECT_UPDATE' THEN
  patch:=pg_catalog.jsonb_build_object('code',coalesce(body->>'code',before_row->>'code'),'title',pg_catalog.btrim(body->>'title'),
   'description',nullif(pg_catalog.btrim(body->>'description'),''),'objectives',nullif(pg_catalog.btrim(body->>'objectives'),''),
   'implementation_area',nullif(pg_catalog.btrim(body->>'implementationArea'),''),'start_date',body->>'startDate','end_date',body->>'endDate',
   'status',body->>'status','program_id',body->>'programId');
  FOREACH k IN ARRAY ARRAY['implementingPartners','sector','targetBeneficiaries','programManagerId'] LOOP
   IF body?k THEN db_key:=CASE k WHEN 'implementingPartners' THEN 'implementing_partners' WHEN 'targetBeneficiaries' THEN 'target_beneficiaries'
     WHEN 'programManagerId' THEN 'program_manager_id' ELSE k END;
    patch:=patch||pg_catalog.jsonb_build_object(db_key,CASE WHEN k IN ('implementingPartners','sector') THEN pg_catalog.to_jsonb(nullif(pg_catalog.btrim(body->>k),'')) ELSE body->k END); END IF;
  END LOOP;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.projects,before_row||patch)); relation_oid:='pathways.projects'::regclass;
 WHEN 'ACTIVITY_CREATE','ACTIVITY_UPDATE' THEN
  IF action='INSERT' THEN after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'created_by_id',actor,'status','NOT_STARTED','progress_percent',0))); END IF;
  patch:=pg_catalog.jsonb_build_object('code',coalesce(body->>'code',after_row->>'code','ACT-'||pg_catalog.upper(pg_catalog.substr(source::text,1,8))),
   'title',pg_catalog.btrim(body->>'title'),'description',nullif(pg_catalog.btrim(body->>'description'),''),
   'activity_type',nullif(pg_catalog.btrim(body->>'activityType'),''),'planned_start_date',body->>'plannedStartDate','planned_end_date',body->>'plannedEndDate');
  IF (body->>'plannedStartDate')::date<project_row.start_date OR (body->>'plannedEndDate')::date>project_row.end_date THEN
   IF nullif(pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')),'') IS NULL THEN
    RAISE EXCEPTION 'Timeline justification required' USING ERRCODE='22023'; END IF;
   patch:=patch||pg_catalog.jsonb_build_object('timeline_override_justification',pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')));
  END IF;
  patch:=patch||pg_catalog.jsonb_build_object('timeline_override_justification',nullif(pg_catalog.btrim(coalesce(body->>'timelineOverrideJustification',before_row->>'timeline_override_justification')),''));
  IF body?'targetBeneficiaries' OR action='INSERT' THEN patch:=patch||pg_catalog.jsonb_build_object('target_beneficiaries',body->'targetBeneficiaries'); END IF;
  IF action='UPDATE' AND before_row->>'status' IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Terminal activity' USING ERRCODE='40001'; END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,after_row||patch)); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_START' THEN
  IF before_row->>'status'<>'NOT_STARTED' THEN RAISE EXCEPTION 'Invalid start' USING ERRCODE='40001'; END IF;
  after_row:=before_row||pg_catalog.jsonb_build_object('status','IN_PROGRESS','actual_start_date',reporting_date); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_CANCEL' THEN
  IF before_row->>'status' NOT IN ('NOT_STARTED','IN_PROGRESS') THEN RAISE EXCEPTION 'Invalid cancellation' USING ERRCODE='40001'; END IF;
  after_row:=before_row||pg_catalog.jsonb_build_object('status','CANCELLED','cancelled_at',generated_at,'cancellation_reason',pg_catalog.btrim(body->>'reason')); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_REVIEW' THEN
  patch:=pg_catalog.jsonb_build_object('status',CASE WHEN body->>'decision'='APPROVE' AND related.progress_percent=100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,'progress_percent',related.progress_percent);
  IF body->>'decision'='APPROVE' AND related.progress_percent=100 THEN patch:=patch||pg_catalog.jsonb_build_object('actual_end_date',reporting_date,'reviewed_by_id',actor,'reviewed_at',generated_at); END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_activities,before_row||patch)); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'ACTIVITY_PROOF_FINALIZE' THEN
  after_row:=before_row||pg_catalog.jsonb_build_object('status','FOR_REVIEW','progress_percent',related.progress_percent); relation_oid:='pathways.project_activities'::regclass;
 WHEN 'INDICATOR_CREATE' THEN
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicators,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'created_by_id',actor,'code',body->>'code',
    'name',body->>'name','description',body->>'description','indicator_type','OUTPUT','unit',CASE body->>'numericKind' WHEN 'COUNT' THEN 'COUNT' WHEN 'PERCENTAGE' THEN 'PERCENTAGE' ELSE 'OTHER' END,
    'is_saddd_related',false,'status','NOT_STARTED','revision',1,'unit_label',body->>'unitLabel','data_source',body->>'dataSource',
    'measurement_mode',body->>'mode','numeric_kind',body->>'numericKind','direction',body->>'direction','display_precision',body->'displayPrecision',
    'period_start',body->>'periodStart','period_end',body->>'periodEnd','baseline_value',body->>'baseline','target_value',body->>'target'))); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_UPDATE' THEN
  after_row:=before_row||pg_catalog.jsonb_build_object('name',body->>'name','description',body->>'description','revision',definition.revision+1); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_ARCHIVE' THEN
  IF definition.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Indicator archived' USING ERRCODE='40001'; END IF;
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicators,before_row||pg_catalog.jsonb_build_object('archived_at',generated_at,'revision',definition.revision+1))); relation_oid:='pathways.project_indicators'::regclass;
 WHEN 'INDICATOR_MEASUREMENT' THEN
  IF definition.measurement_mode IS DISTINCT FROM 'MANUAL' OR definition.archived_at IS NOT NULL
   OR definition.period_start IS DISTINCT FROM (body->>'periodStart')::date OR definition.period_end IS DISTINCT FROM (body->>'periodEnd')::date THEN
   RAISE EXCEPTION 'Measurement definition changed' USING ERRCODE='40001'; END IF;
  normalized_value:=pg_catalog.trim_scale((body->>'value')::numeric)::text;
  -- Compact ordered JSON matches P06's original request_hash. Each value is JSON encoded independently.
  compact:='{"projectId":'||pg_catalog.to_jsonb(wanted_project::text)::text||',"indicatorId":'||pg_catalog.to_jsonb(wanted_source::text)::text||
   ',"periodStart":'||(body->'periodStart')::text||',"periodEnd":'||(body->'periodEnd')::text||',"value":'||pg_catalog.to_jsonb(normalized_value)::text||
   ',"source":'||(body->'source')::text||',"note":'||coalesce((body->'note')::text,'null')||',"correctsMeasurementId":'||coalesce((body->'correctsMeasurementId')::text,'null')||
   ',"correctionReason":'||coalesce((body->'correctionReason')::text,'null')||'}';
  request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(compact,'UTF8')),'hex');
  after_row:=pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::pathways.project_indicator_measurements,
   pg_catalog.jsonb_build_object('id',source,'organization_id',org,'project_id',wanted_project,'indicator_id',wanted_source,
    'period_start',body->>'periodStart','period_end',body->>'periodEnd','value',normalized_value,'source',body->>'source','note',body->>'note',
    'client_measurement_id',wanted_request,'request_hash',request_hash,'corrects_measurement_id',body->>'correctsMeasurementId','correction_reason',body->>'correctionReason','recorded_by_id',actor)));
  relation_oid:='pathways.project_indicator_measurements'::regclass;
  SELECT e.id,e.source_fingerprint INTO manual_class,manual_fp FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=org AND e.project_id=wanted_project AND e.indicator_id=wanted_source
    AND e.definition_revision=definition.revision
    AND e.source_fingerprint=pathways_rules_internal.indicator_source_fingerprint(definition.id,definition.revision,definition.measurement_mode,definition.numeric_kind,NULL,NULL,NULL)
    AND e.decision='ALLOWED_NON_SENSITIVE'
    AND e.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS' AND e.approved_at<=generated_at AND (e.expires_at IS NULL OR e.expires_at>generated_at)
    AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.eligibility newer WHERE newer.organization_id=e.organization_id
     AND newer.project_id=e.project_id AND newer.indicator_id=e.indicator_id AND newer.classification_revision>e.classification_revision);
 END CASE;
 IF pathways.p06_can(cat.permission_code,wanted_project) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways_rules_internal.source_operation_context(transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,
  operation_code,request_kind,request_id,phase,canonical_request_hash,source_record_id,root_relation_oid,root_action,
  expected_before_business_hash,expected_after_business_hash,related_update_id,review_action,manual_definition_revision,
  manual_definition_fingerprint,manual_classification_id,canonical_body,generated_at,companion_before)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,org,wanted_project,actor,operation,wanted_kind,wanted_request,wanted_phase,
  pg_catalog.sha256(pg_catalog.convert_to(request::text,'UTF8')),source,relation_oid,action,
  CASE WHEN before_row IS NOT NULL THEN pathways_rules_internal.source_business_fingerprint(before_row) END,
  pathways_rules_internal.source_business_fingerprint(after_row),related.id,CASE WHEN operation='ACTIVITY_REVIEW' THEN body->>'decision' END,
  CASE WHEN operation='INDICATOR_MEASUREMENT' THEN definition.revision END,manual_fp,manual_class,body,generated_at,
  pathways_rules_internal.source_companion_state(operation,org,wanted_project,source)) RETURNING handle INTO handle_id;
 RETURN pg_catalog.jsonb_build_object('kind','NEW','operationHandle',handle_id,'reservedRecordId',CASE WHEN action='INSERT' THEN source ELSE NULL END,
  'generatedValues',pg_catalog.jsonb_build_object('timestamp',pathways_rules_internal.utc_milliseconds(generated_at),'businessDate',reporting_date,
   'normalizedValue',normalized_value,'requestHash',request_hash));
END $$;


-- source-companion-preservation.proposed.sql
-- Preserve omitted companions as well as verifying requested replacements.
ALTER TABLE pathways_rules_internal.source_operation_context ADD COLUMN companion_before jsonb NOT NULL;
CREATE FUNCTION pathways_rules_internal.source_companion_state(operation text,org uuid,project uuid,source uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb:='{}'; value jsonb; k text; role_code text;
BEGIN
 IF operation='PROJECT_UPDATE' THEN
  FOREACH k IN ARRAY ARRAY['projectManagerId','monitoringOfficerId','projectOfficerIds'] LOOP
   role_code:=CASE k WHEN 'projectManagerId' THEN 'PROJECT_MANAGER' WHEN 'monitoringOfficerId' THEN 'MONITORING_AND_EVALUATION_OFFICER' ELSE 'PROJECT_OFFICER' END;
   SELECT coalesce(pg_catalog.jsonb_agg(a.user_id::text ORDER BY a.user_id),'[]'::jsonb) INTO value
    FROM pathways.user_project_assignments a JOIN pathways.system_users u ON u.organization_id=a.organization_id AND u.id=a.user_id
    JOIN pathways.roles r ON r.id=u.role_id WHERE a.organization_id=org AND a.project_id=project AND a.status='ACTIVE' AND a.ended_at IS NULL AND r.code=role_code;
   result:=result||pg_catalog.jsonb_build_object(k,value);
  END LOOP;
  SELECT coalesce(pg_catalog.jsonb_agg(i.normalized_name ORDER BY i.normalized_name),'[]'::jsonb) INTO value FROM pathways.project_implementing_partners l
   JOIN pathways.implementing_partners i ON i.organization_id=l.organization_id AND i.id=l.partner_id WHERE l.organization_id=org AND l.project_id=project;
  result:=result||pg_catalog.jsonb_build_object('implementingPartnerNames',value);
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('amount',b.planned_budget::text,'currency',b.currency) ORDER BY b.planned_budget,b.currency)
   INTO value FROM pathways.project_budget_records b WHERE b.organization_id=org AND b.project_id=project AND b.activity_id IS NULL
    AND b.category='PROJECT_PROFILE_TOTAL' AND b.archived_at IS NULL;
  result:=result||pg_catalog.jsonb_build_object('projectBudget',value);
 ELSIF operation IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE') THEN
  SELECT coalesce(pg_catalog.jsonb_agg(l.indicator_id::text ORDER BY l.indicator_id),'[]'::jsonb) INTO value FROM pathways.activity_indicator_links l
   WHERE l.organization_id=org AND l.project_id=project AND l.activity_id=source;
  result:=result||pg_catalog.jsonb_build_object('indicatorIds',value);
  SELECT coalesce(pg_catalog.jsonb_agg(l.stage_id::text ORDER BY l.stage_id),'[]'::jsonb) INTO value FROM pathways.activity_journey_stage_mappings l
   WHERE l.organization_id=org AND l.project_id=project AND l.activity_id=source;
  result:=result||pg_catalog.jsonb_build_object('journeyStageId',value);
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('amount',b.planned_budget::text,'currency',b.currency) ORDER BY b.planned_budget,b.currency)
   INTO value FROM pathways.project_budget_records b WHERE b.organization_id=org AND b.project_id=project AND b.activity_id=source
    AND b.category='ACTIVITY_PROFILE_TOTAL' AND b.archived_at IS NULL;
  result:=result||pg_catalog.jsonb_build_object('budgetAllocation',value);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION pathways_rules_internal.assert_omitted_source_companions(c pathways_rules_internal.source_operation_context)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actual jsonb; omitted text[];
BEGIN
 SELECT coalesce(pg_catalog.array_agg(k),'{}'::text[]) INTO omitted FROM pg_catalog.jsonb_object_keys(c.companion_before) k WHERE NOT(c.canonical_body?k);
 actual:=pathways_rules_internal.source_companion_state(c.operation_code,c.organization_id,c.project_id,c.source_record_id);
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(omitted) k WHERE actual->k IS DISTINCT FROM c.companion_before->k) THEN
  RAISE EXCEPTION 'Omitted source companion changed' USING ERRCODE='22023'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.source_companion_state(text,uuid,uuid,uuid) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways_rules_internal.assert_omitted_source_companions(pathways_rules_internal.source_operation_context) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_companion_state(text,uuid,uuid,uuid),
 pathways_rules_internal.assert_omitted_source_companions(pathways_rules_internal.source_operation_context)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- native-math.proposed.sql
-- Proposed0031 exact existing native math extraction. Not executed.
-- PROPOSED ONLY: no installation/replay authorized by this file.
-- Extract atomically with reviewed OWNER/REVOKE/GRANT and invoke from evaluate_node
-- BEFORE any state/availability branch. INVOKER helper EXECUTE only for
-- rules_projection_owner/rules_commit_owner; never worker/browser/runtime directly.
CREATE FUNCTION pathways_rules_internal.validate_metric_cell(cell jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE actual numeric;
BEGIN
  IF pg_catalog.jsonb_typeof(cell) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid metric cell' USING ERRCODE='22023';
  END IF;
  IF NOT (cell ?& ARRAY['state','value','reason'])
    OR (cell-ARRAY['state','value','reason']) <> '{}'::jsonb
    OR pg_catalog.jsonb_typeof(cell->'state') IS DISTINCT FROM 'string'
    OR cell->>'state' NOT IN ('AVAILABLE','ZERO','MISSING','NOT_APPLICABLE','SUPPRESSED') THEN
    RAISE EXCEPTION 'Invalid metric cell' USING ERRCODE='22023';
  END IF;
  IF cell->>'state' IN ('AVAILABLE','ZERO') THEN
    IF pg_catalog.jsonb_typeof(cell->'value') IS DISTINCT FROM 'string'
      OR cell->'reason' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Invalid visible metric cell' USING ERRCODE='22023';
    END IF;
    actual:=pathways_rules_internal.decimal_value(cell->>'value');
    IF (cell->>'state'='ZERO' AND cell->>'value' IS DISTINCT FROM '0')
      OR (cell->>'state'='AVAILABLE' AND actual=0) THEN
      RAISE EXCEPTION 'Invalid canonical metric zero' USING ERRCODE='22023';
    END IF;
  ELSE
    IF cell->'value' IS DISTINCT FROM 'null'::jsonb
      OR pg_catalog.jsonb_typeof(cell->'reason') IS DISTINCT FROM 'string'
      OR cell->>'reason' NOT IN (
        'NO_MEASUREMENT','UNSUPPORTED_SOURCE','MISSING_DATES','INVALID_DATES',
        'ZERO_DENOMINATOR','EMPTY_POPULATION','SUPPRESSED','NOT_APPLICABLE',
        'LEGACY_REVIEW_REQUIRED','INVALID_METRIC','BELOW_REPRESENTABLE_PRECISION',
        'PROGRESS_OUT_OF_RANGE','BASELINE_TARGET_DIRECTION_REQUIRED','DIRECTION_CONFLICT'
      ) THEN
      RAISE EXCEPTION 'Invalid unavailable metric cell' USING ERRCODE='22023';
    END IF;
  END IF;
END $$;

ALTER FUNCTION pathways_rules_internal.validate_metric_cell(jsonb)
  OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.validate_metric_cell(jsonb)
  FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,
    pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.validate_metric_cell(jsonb)
  TO rules_projection_owner,rules_commit_owner;
-- decimal_value(text) needs the same projection/commit-only EXECUTE contract.
-- Install ownership/default privileges and these ACLs in the same transaction;
-- do not install this excerpt independently of prerequisite roles/schema/functions.

CREATE FUNCTION pathways_rules_internal.decimal_value(input text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF input IS NULL OR input !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$'
    OR pg_catalog.length(input)>20 THEN
    RAISE EXCEPTION 'Invalid typed decimal' USING ERRCODE='22023';
  END IF;
  RETURN input::numeric;
END $$;

CREATE FUNCTION pathways_rules_internal.numeric_cell(value numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE normalized text;
BEGIN
  IF value IS NULL OR value::text IN ('NaN','Infinity','-Infinity') OR value<>pg_catalog.round(value,4)
    OR pg_catalog.abs(value)>99999999999999.9999::numeric THEN
    RAISE EXCEPTION 'Invalid typed decimal' USING ERRCODE='22023';
  END IF;
  normalized:=pg_catalog.trim_scale(value)::text;
  RETURN pg_catalog.jsonb_build_object('state',CASE WHEN value=0 THEN 'ZERO' ELSE 'AVAILABLE' END,
    'value',normalized,'reason',NULL);
END $$;

CREATE FUNCTION pathways_rules_internal.unavailable_cell(reason text,state text DEFAULT 'MISSING')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF reason IS NULL OR reason NOT IN ('NO_MEASUREMENT','UNSUPPORTED_SOURCE','MISSING_DATES','INVALID_DATES',
      'ZERO_DENOMINATOR','EMPTY_POPULATION','SUPPRESSED','NOT_APPLICABLE','LEGACY_REVIEW_REQUIRED',
      'INVALID_METRIC','BELOW_REPRESENTABLE_PRECISION','PROGRESS_OUT_OF_RANGE',
      'BASELINE_TARGET_DIRECTION_REQUIRED','DIRECTION_CONFLICT')
    OR state IS NULL OR state NOT IN ('MISSING','NOT_APPLICABLE','SUPPRESSED') THEN
    RAISE EXCEPTION 'Invalid metric state' USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object('state',state,'value',NULL,'reason',reason);
END $$;

CREATE FUNCTION pathways_rules_internal.progress_cell(actual text,baseline text,target text,direction text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE a numeric; b numeric; t numeric; delta numeric; numerator numeric;
  quotient numeric; rounded numeric; negative boolean;
BEGIN
  IF actual IS NULL THEN
    RETURN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT');
  END IF;
  IF direction IS NULL OR direction='DESCRIPTIVE' OR baseline IS NULL OR target IS NULL THEN
    RETURN pathways_rules_internal.unavailable_cell('BASELINE_TARGET_DIRECTION_REQUIRED','NOT_APPLICABLE');
  END IF;
  IF direction NOT IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER') THEN
    RAISE EXCEPTION 'Invalid direction' USING ERRCODE='22023';
  END IF;
  a:=pathways_rules_internal.decimal_value(actual)*10000;
  b:=pathways_rules_internal.decimal_value(baseline)*10000;
  t:=pathways_rules_internal.decimal_value(target)*10000;
  delta:=t-b;
  IF delta=0 THEN
    RETURN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR','NOT_APPLICABLE');
  END IF;
  IF (direction='HIGHER_IS_BETTER' AND delta<0) OR (direction='LOWER_IS_BETTER' AND delta>0) THEN
    RETURN pathways_rules_internal.unavailable_cell('DIRECTION_CONFLICT','NOT_APPLICABLE');
  END IF;
  numerator:=(a-b)*100*10000;
  negative:=(numerator<0)<>(delta<0);
  quotient:=pg_catalog.div(pg_catalog.abs(numerator),pg_catalog.abs(delta));
  IF pg_catalog.mod(pg_catalog.abs(numerator),pg_catalog.abs(delta))*2>=pg_catalog.abs(delta) THEN
    quotient:=quotient+1;
  END IF;
  rounded:=CASE WHEN negative THEN -quotient ELSE quotient END;
  IF numerator<>0 AND rounded=0 THEN
    RETURN pathways_rules_internal.unavailable_cell('BELOW_REPRESENTABLE_PRECISION');
  END IF;
  IF pg_catalog.abs(rounded)>999999999999999999::numeric THEN
    RETURN pathways_rules_internal.unavailable_cell('PROGRESS_OUT_OF_RANGE');
  END IF;
  RETURN pathways_rules_internal.numeric_cell(rounded/10000);
END $$;

-- node evaluation is reachable only through validated bounded immutable tree wrapper.
-- Every leaf is evaluated, including when another leaf determines the group verdict.
CREATE FUNCTION pathways_rules_internal.evaluate_node(node jsonb,observations jsonb,group_depth integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE child jsonb; evaluated jsonb; leaf jsonb; cell jsonb; evidence jsonb:='[]'::jsonb;
  verdict text; saw_true boolean:=false; saw_false boolean:=false; saw_unknown boolean:=false;
  value numeric; lower_bound numeric; upper_bound numeric; comparison boolean;
BEGIN
  IF node->>'kind'='GROUP' THEN
    IF group_depth>=4 OR node->>'mode' IS NULL OR node->>'mode' NOT IN ('AND','OR')
      OR pg_catalog.jsonb_typeof(node->'children') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(node->'children') NOT BETWEEN 1 AND 32 THEN
      RAISE EXCEPTION 'Invalid bounded group' USING ERRCODE='22023';
    END IF;
    FOR child IN SELECT v.value FROM pg_catalog.jsonb_array_elements(node->'children') v LOOP
      evaluated:=pathways_rules_internal.evaluate_node(child,observations,group_depth+1);
      saw_true:=saw_true OR evaluated->>'result'='TRUE';
      saw_false:=saw_false OR evaluated->>'result'='FALSE';
      saw_unknown:=saw_unknown OR evaluated->>'result'='UNAVAILABLE';
      evidence:=evidence||(evaluated->'conditions');
    END LOOP;
    verdict:=CASE WHEN node->>'mode'='AND' AND saw_false THEN 'FALSE'
      WHEN node->>'mode'='OR' AND saw_true THEN 'TRUE'
      WHEN saw_unknown THEN 'UNAVAILABLE'
      WHEN node->>'mode'='AND' THEN 'TRUE' ELSE 'FALSE' END;
    RETURN pg_catalog.jsonb_build_object('result',verdict,'conditions',evidence);
  END IF;
  IF node->>'kind' IS DISTINCT FROM 'CONDITION' OR NOT (observations ? (node->>'id')) THEN
    RAISE EXCEPTION 'Incomplete condition observations' USING ERRCODE='22023';
  END IF;
  leaf:=observations->(node->>'id');
  IF leaf->>'metric' IS DISTINCT FROM node->>'metric' THEN
    RAISE EXCEPTION 'Substituted metric' USING ERRCODE='22023';
  END IF;
  cell:=leaf->'cell';
  PERFORM pathways_rules_internal.validate_metric_cell(cell);
  IF node->>'operator' IS NULL OR node->>'operator' NOT IN ('LT','LTE','EQ','GTE','GT','BETWEEN') THEN
    RAISE EXCEPTION 'Invalid typed operator' USING ERRCODE='22023';
  END IF;
  lower_bound:=pathways_rules_internal.decimal_value(node->>'threshold');
  IF node->>'operator'='BETWEEN' THEN
    upper_bound:=pathways_rules_internal.decimal_value(node->>'thresholdMaximum');
    IF lower_bound>upper_bound THEN RAISE EXCEPTION 'Invalid bounds' USING ERRCODE='22023'; END IF;
  ELSIF node ? 'thresholdMaximum' THEN
    RAISE EXCEPTION 'Invalid upper threshold' USING ERRCODE='22023';
  END IF;
  IF cell->>'state' IN ('AVAILABLE','ZERO') THEN
    IF pg_catalog.jsonb_typeof(cell->'value') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid typed metric value' USING ERRCODE='22023';
    END IF;
    value:=pathways_rules_internal.decimal_value(cell->>'value');
    IF (node->>'metric' IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND value<0)
      OR (node->>'metric'='ACTIVITY_COMPLETION_PERCENT' AND value>100)
      OR (node->>'metric' IN ('PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND value<>pg_catalog.trunc(value)) THEN
      RAISE EXCEPTION 'Invalid observed metric domain' USING ERRCODE='22023';
    END IF;
    IF cell->'reason' IS DISTINCT FROM 'null'::jsonb OR
      (cell->>'state'='ZERO' AND value<>0) OR (cell->>'state'='AVAILABLE' AND value=0) THEN
      RAISE EXCEPTION 'Invalid metric state' USING ERRCODE='22023';
    END IF;
    comparison:=CASE node->>'operator' WHEN 'LT' THEN value<lower_bound
      WHEN 'LTE' THEN value<=lower_bound WHEN 'EQ' THEN value=lower_bound
      WHEN 'GTE' THEN value>=lower_bound WHEN 'GT' THEN value>lower_bound
      WHEN 'BETWEEN' THEN value BETWEEN lower_bound AND upper_bound ELSE NULL END;
    IF comparison IS NULL THEN RAISE EXCEPTION 'Invalid typed operator' USING ERRCODE='22023'; END IF;
    verdict:=CASE WHEN comparison THEN 'TRUE' ELSE 'FALSE' END;
  ELSIF cell->>'state' IN ('MISSING','NOT_APPLICABLE','SUPPRESSED')
    AND cell->'value'='null'::jsonb AND pg_catalog.jsonb_typeof(cell->'reason')='string' THEN
    verdict:='UNAVAILABLE';
  ELSE RAISE EXCEPTION 'Invalid metric state' USING ERRCODE='22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object('result',verdict,'conditions',pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('conditionId',node->>'id','result',verdict,'metric',node->>'metric',
      'operator',node->>'operator','threshold',node->>'threshold',
      'thresholdMaximum',node->>'thresholdMaximum','cell',cell)));
END $$;

CREATE FUNCTION pathways_rules_internal.evaluate_snapshot_rule(tree jsonb,observations jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE pending jsonb[]:=ARRAY[tree]; current_node jsonb; children jsonb[];
  condition_ids text[]:=ARRAY[]::text[]; nodes integer:=0; n integer;
  threshold_value numeric; threshold_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(observations) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid observation manifest' USING ERRCODE='22023';
  END IF;
  WHILE pg_catalog.cardinality(pending)>0 LOOP
    n:=pg_catalog.cardinality(pending); current_node:=pending[n];
    pending:=pending[1:n-1]; nodes:=nodes+1;
    IF nodes>160 OR pg_catalog.jsonb_typeof(current_node) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid bounded tree' USING ERRCODE='22023';
    END IF;
    IF current_node->>'kind'='GROUP' THEN
      IF (current_node-ARRAY['kind','mode','children'])<>'{}'::jsonb
        OR current_node->>'mode' IS NULL OR current_node->>'mode' NOT IN ('AND','OR')
        OR pg_catalog.jsonb_typeof(current_node->'children') IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_array_length(current_node->'children') NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'Invalid bounded group' USING ERRCODE='22023';
      END IF;
      SELECT pg_catalog.array_agg(v.value) INTO children
        FROM pg_catalog.jsonb_array_elements(current_node->'children') v;
      pending:=pending||children;
    ELSIF current_node->>'kind'='CONDITION' THEN
      IF (current_node-ARRAY['kind','id','metric','operator','threshold','thresholdMaximum','indicatorId','activityId'])<>'{}'::jsonb
        OR pg_catalog.jsonb_typeof(current_node->'id') IS DISTINCT FROM 'string'
        OR current_node->>'id' !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
        OR current_node->>'id'=ANY(condition_ids) OR pg_catalog.cardinality(condition_ids)>=32 THEN
        RAISE EXCEPTION 'Invalid bounded condition set' USING ERRCODE='22023';
      END IF;
      IF pg_catalog.jsonb_typeof(current_node->'metric') IS DISTINCT FROM 'string'
        OR current_node->>'metric' NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT',
          'PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
          'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS')
        OR pg_catalog.jsonb_typeof(current_node->'operator') IS DISTINCT FROM 'string'
        OR current_node->>'operator' NOT IN ('LT','LTE','EQ','GTE','GT','BETWEEN')
        OR pg_catalog.jsonb_typeof(current_node->'threshold') IS DISTINCT FROM 'string'
        OR ((current_node->>'operator'='BETWEEN') IS DISTINCT FROM (current_node ? 'thresholdMaximum')) THEN
        RAISE EXCEPTION 'Invalid typed condition' USING ERRCODE='22023';
      END IF;
      IF current_node->>'operator'='BETWEEN' AND
        pg_catalog.jsonb_typeof(current_node->'thresholdMaximum') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Invalid typed upper threshold' USING ERRCODE='22023';
      END IF;
      IF ((current_node->>'metric' LIKE 'INDICATOR_%') IS DISTINCT FROM (current_node ? 'indicatorId'))
        OR ((current_node->>'metric'='ACTIVITY_OVERDUE_DAYS') IS DISTINCT FROM (current_node ? 'activityId')) THEN
        RAISE EXCEPTION 'Invalid typed record binding' USING ERRCODE='22023';
      END IF;
      IF current_node ? 'indicatorId' THEN
        IF pg_catalog.jsonb_typeof(current_node->'indicatorId') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Invalid indicator binding' USING ERRCODE='22023';
        END IF;
        PERFORM (current_node->>'indicatorId')::uuid;
      END IF;
      IF current_node ? 'activityId' THEN
        IF pg_catalog.jsonb_typeof(current_node->'activityId') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Invalid activity binding' USING ERRCODE='22023';
        END IF;
        PERFORM (current_node->>'activityId')::uuid;
      END IF;
      FOR threshold_text IN SELECT current_node->>'threshold'
        UNION ALL SELECT current_node->>'thresholdMaximum' WHERE current_node ? 'thresholdMaximum' LOOP
        threshold_value:=pathways_rules_internal.decimal_value(threshold_text);
        IF (current_node->>'metric' IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_OVERDUE_DAYS',
              'ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND threshold_value<0)
          OR (current_node->>'metric'='ACTIVITY_COMPLETION_PERCENT' AND threshold_value>100)
          OR (current_node->>'metric' IN ('PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS',
              'ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS') AND threshold_value<>pg_catalog.trunc(threshold_value)) THEN
          RAISE EXCEPTION 'Invalid metric threshold domain' USING ERRCODE='22023';
        END IF;
      END LOOP;
      condition_ids:=pg_catalog.array_append(condition_ids,current_node->>'id');
    ELSE RAISE EXCEPTION 'Invalid rule node' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(condition_ids)=0 OR
    (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(observations))
      <>pg_catalog.cardinality(condition_ids) OR
    EXISTS (SELECT 1 FROM pg_catalog.unnest(condition_ids) c(id) WHERE NOT (observations ? c.id)) THEN
    RAISE EXCEPTION 'Incomplete observation manifest' USING ERRCODE='22023';
  END IF;
  RETURN pathways_rules_internal.evaluate_node(tree,observations,0);
END $$;



-- committed-acknowledgement.proposed.sql
-- Proposed0031 preserved private immutable acknowledgement helper. Not executed.
CREATE FUNCTION pathways_rules_internal.committed_acknowledgement(
  wanted_job uuid,original_nonce text,wanted_snapshot uuid,wanted_digest bytea)
RETURNS TABLE(required_generation bigint,source_watermark bigint,calendar_version bigint,
              evaluation_sequence bigint,committed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
  IF original_nonce IS NULL OR original_nonce !~ '^[0-9a-f]{64}$'
    OR wanted_digest IS NULL OR pg_catalog.octet_length(wanted_digest)<>32 THEN
    RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT a.required_generation,a.source_watermark,a.calendar_version,a.evaluation_sequence,a.committed_at
    FROM pathways_rules_internal.acknowledgements a
    JOIN pathways_rules_internal.snapshots s ON s.id=a.snapshot_id
      AND s.job_id=a.job_id AND s.organization_id=a.organization_id AND s.project_id=a.project_id
    WHERE a.snapshot_id=wanted_snapshot AND a.job_id=wanted_job
      AND a.snapshot_digest=wanted_digest AND s.digest=wanted_digest
      AND a.lease_session=session_user AND s.lease_session=session_user
      AND a.lease_hash=pg_catalog.sha256(pg_catalog.convert_to(original_nonce,'UTF8'))
      AND s.lease_hash=a.lease_hash
      AND s.required_generation=a.required_generation AND s.source_watermark=a.source_watermark
      AND s.calendar_version=a.calendar_version;
END $$;



-- machine-lease.proposed.sql
-- Proposed0031 machine lease/calendar slice. Review-only; not installed/executed.
-- Dependencies: runtime-prerequisites/schema and utc_milliseconds(timestamptz).
-- This slice never reads source metrics or accepts caller organization/project.
CREATE FUNCTION pathways_rules_internal.assert_session(expected name)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE safe boolean;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF expected NOT IN ('pathways_rules_worker','pathways_rules_sweeper')
  OR session_user IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
  AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
  AND NOT EXISTS(SELECT FROM pg_catalog.pg_shdepend d
   WHERE d.refclassid='pg_catalog.pg_authid'::regclass AND d.refobjid=r.oid AND d.deptype='o')
  AND NOT pg_catalog.has_database_privilege(expected,pg_catalog.current_database(),'CREATE')
  AND NOT pg_catalog.has_database_privilege(expected,pg_catalog.current_database(),'TEMPORARY')
  AND NOT EXISTS(SELECT FROM pg_catalog.pg_namespace n
   WHERE pg_catalog.has_schema_privilege(expected,n.oid,'CREATE'))
 INTO safe FROM pg_catalog.pg_roles r WHERE r.rolname=expected;
 IF safe IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.assert_session(name) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_session(name)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.assert_session(name)
 TO rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_context_owner,rules_runtime_guard_owner;

CREATE FUNCTION pathways_rules_internal.read_rule_calendar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE calendar record;
BEGIN
 IF session_user NOT IN ('pathways_rules_worker','pathways_rules_sweeper') THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.assert_session(session_user);
 SELECT c.version,c.zone INTO calendar FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND OR calendar.version<=0 OR calendar.zone IS DISTINCT FROM 'Asia/Manila' THEN
  RAISE EXCEPTION 'Rules calendar unavailable' USING ERRCODE='55000'; END IF;
 RETURN pg_catalog.jsonb_build_object('version',calendar.version::text,'zone',calendar.zone);
END $$;
ALTER FUNCTION pathways_rules_internal.read_rule_calendar() OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.read_rule_calendar()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.read_rule_calendar() TO pathways_rules_worker,pathways_rules_sweeper;
GRANT SELECT(singleton,version,zone) ON pathways_rules_internal.calendar_configuration TO rules_projection_owner;
CREATE POLICY f10_machine_singleton_calendar ON pathways_rules_internal.calendar_configuration
 FOR SELECT TO rules_projection_owner USING(singleton AND session_user IN ('pathways_rules_worker','pathways_rules_sweeper'));

CREATE FUNCTION pathways_rules_internal.claim_rule_project()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source pathways_rules_internal.project_state;job pathways_rules_internal.jobs;nonce text;moment timestamptz;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 -- ONE candidate, state as the ONLY locking target. No queue-first lock, no
 -- second project's state after locking this project's queue. Busy state skips.
 SELECT s.* INTO source FROM pathways_rules_internal.project_state s
 JOIN pathways_rules_internal.jobs j ON j.organization_id=s.organization_id AND j.project_id=s.project_id
 WHERE s.bootstrap_complete AND s.required_generation>s.acknowledged_generation
  AND j.state IN ('PENDING','LEASED') AND j.next_attempt_at<=pg_catalog.clock_timestamp()
  AND (j.state='PENDING' OR j.lease_expires_at<=pg_catalog.clock_timestamp())
 ORDER BY j.last_attempt_at NULLS FIRST,j.pending_since,j.id
 LIMIT 1 FOR NO KEY UPDATE OF s SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j
 WHERE j.organization_id=source.organization_id AND j.project_id=source.project_id FOR NO KEY UPDATE;
 moment:=pg_catalog.clock_timestamp();
 IF NOT FOUND OR job.state NOT IN ('PENDING','LEASED') OR job.next_attempt_at>moment
  OR (job.state='LEASED' AND job.lease_expires_at>moment) THEN RETURN NULL; END IF;
 -- State is locked through COMMIT; re-read after any queue wait and before
 -- binding fresh G/W. No pending/newer receipt or existing ack is overwritten.
 SELECT s.* INTO source FROM pathways_rules_internal.project_state s
 WHERE s.organization_id=source.organization_id AND s.project_id=source.project_id;
 IF NOT source.bootstrap_complete OR source.required_generation<=source.acknowledged_generation THEN RETURN NULL; END IF;
 nonce:=pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 UPDATE pathways_rules_internal.jobs j SET state='LEASED',
  lease_hash=pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8')),lease_session=session_user,
  lease_expires_at=moment+interval '120 seconds',claim_generation=source.required_generation,
  claim_watermark=source.source_watermark,last_attempt_at=moment
 WHERE j.id=job.id AND j.organization_id=source.organization_id AND j.project_id=source.project_id;
 RETURN pg_catalog.jsonb_build_object('jobId',job.id,'leaseNonce',nonce,
  'leaseExpiresAt',pathways_rules_internal.utc_milliseconds(moment+interval '120 seconds'));
END $$;
ALTER FUNCTION pathways_rules_internal.claim_rule_project() OWNER TO rules_lease_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.claim_rule_project()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.claim_rule_project() TO pathways_rules_worker;

CREATE FUNCTION pathways_rules_internal.release_or_retry_rule_job(wanted_job uuid,nonce text,reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope record;source pathways_rules_internal.project_state;job pathways_rules_internal.jobs;
 moment timestamptz;stale_count integer;failure_count integer;delay_seconds integer;next_state text;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR wanted_job IS NULL
  OR nonce IS NULL OR pg_catalog.length(nonce)<>64 OR nonce !~ '^[a-f0-9]{64}$'
  OR reason IS NULL OR reason NOT IN ('STALE','OPERATIONAL') THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 -- Unlocked immutable job-scope lookup only; actual authority is rechecked
 -- after state-first and then queue locking. Never trust client scope fields.
 SELECT j.organization_id,j.project_id INTO scope FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('released',false); END IF;
 SELECT s.* INTO source FROM pathways_rules_internal.project_state s
 WHERE s.organization_id=scope.organization_id AND s.project_id=scope.project_id FOR NO KEY UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('released',false); END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job
  AND j.organization_id=scope.organization_id AND j.project_id=scope.project_id FOR NO KEY UPDATE;
 moment:=pg_catalog.clock_timestamp();
 IF NOT FOUND OR job.state<>'LEASED' OR job.lease_session IS DISTINCT FROM session_user
  OR job.lease_hash IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8'))
  OR job.lease_expires_at<=moment OR source.required_generation<=source.acknowledged_generation
  OR EXISTS(SELECT FROM pathways_rules_internal.acknowledgements a WHERE a.job_id=job.id
   AND a.organization_id=job.organization_id AND a.project_id=job.project_id
   AND a.lease_session=session_user AND a.lease_hash=job.lease_hash) THEN
  RETURN pg_catalog.jsonb_build_object('released',false); END IF;
 stale_count:=job.stale_attempts;failure_count:=job.operational_failures;next_state:='PENDING';
 IF reason='STALE' THEN
  stale_count:=LEAST(stale_count::bigint+1,2147483647)::integer;
  delay_seconds:=(ARRAY[1,2,5,10,30])[LEAST(stale_count,5)];
 ELSE
  failure_count:=LEAST(failure_count::bigint+1,10)::integer;
  delay_seconds:=(ARRAY[5,30,120,300,900])[LEAST(failure_count,5)];
  IF failure_count>=10 THEN next_state:='FAILED'; END IF;
 END IF;
 UPDATE pathways_rules_internal.jobs j SET state=next_state,next_attempt_at=moment+pg_catalog.make_interval(secs=>delay_seconds),
  stale_attempts=stale_count,operational_failures=failure_count,
  lease_hash=NULL,lease_session=NULL,lease_expires_at=NULL,claim_generation=NULL,claim_watermark=NULL
 WHERE j.id=job.id AND j.organization_id=job.organization_id AND j.project_id=job.project_id;
 -- G/W, ackG, pending_since and all source/ack rows are untouched. New real
 -- receipts remain pending; stale backoff survives those receipts.
 RETURN pg_catalog.jsonb_build_object('released',true);
END $$;
ALTER FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text) OWNER TO rules_lease_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text) TO pathways_rules_worker;

-- Purpose-limited metadata privileges only. Owner NOLOGIN/NOBYPASS and tables
-- FORCE RLS are prerequisite. No metric relations, INSERT/DELETE or state G/W
-- UPDATE authority is granted to this lease owner or either machine login.
GRANT SELECT ON pathways_rules_internal.project_state,pathways_rules_internal.jobs TO rules_lease_owner;
GRANT UPDATE(lock_revision) ON pathways_rules_internal.project_state TO rules_lease_owner;
GRANT UPDATE(state,lease_hash,lease_session,lease_expires_at,claim_generation,claim_watermark,last_attempt_at,
 next_attempt_at,stale_attempts,operational_failures) ON pathways_rules_internal.jobs TO rules_lease_owner;
GRANT SELECT(job_id,organization_id,project_id,lease_hash,lease_session) ON pathways_rules_internal.acknowledgements TO rules_lease_owner;
CREATE POLICY f10_lease_state_read ON pathways_rules_internal.project_state FOR SELECT TO rules_lease_owner
 USING(session_user='pathways_rules_worker');
CREATE POLICY f10_lease_state_lock ON pathways_rules_internal.project_state FOR UPDATE TO rules_lease_owner
 USING(session_user='pathways_rules_worker') WITH CHECK(session_user='pathways_rules_worker');
CREATE POLICY f10_lease_job_read ON pathways_rules_internal.jobs FOR SELECT TO rules_lease_owner
 USING(session_user='pathways_rules_worker');
CREATE POLICY f10_lease_job_update ON pathways_rules_internal.jobs FOR UPDATE TO rules_lease_owner
 USING(session_user='pathways_rules_worker') WITH CHECK(session_user='pathways_rules_worker');
CREATE POLICY f10_lease_ack_read ON pathways_rules_internal.acknowledgements FOR SELECT TO rules_lease_owner
 USING(session_user='pathways_rules_worker');


-- machine-context.proposed.sql
-- Proposed0031 fixed CAPTURE/COMMIT contexts. No caller-owned org/project/purpose.
CREATE FUNCTION pathways_rules_internal.lease_metric_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT session_user='pathways_rules_worker' AND EXISTS(
  SELECT FROM pathways_rules_internal.projection_context c JOIN pathways_rules_internal.jobs j
   ON j.id=c.job_id AND j.organization_id=c.organization_id AND j.project_id=c.project_id
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project AND c.purpose IN ('CAPTURE','COMMIT')
   AND j.state='LEASED' AND j.lease_session=session_user AND j.lease_hash=c.lease_hash AND j.lease_expires_at=c.expires_at
   AND c.expires_at>pg_catalog.clock_timestamp()+interval '3 seconds')
$$;
ALTER FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid)
 TO rules_projection_owner,rules_commit_owner,rules_eligibility_owner,rules_runtime_guard_owner;

CREATE FUNCTION pathways_rules_internal.install_capture_context(wanted_job uuid,nonce text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job pathways_rules_internal.jobs;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
  OR nonce IS NULL OR nonce !~ '^[a-f0-9]{64}$' OR wanted_job IS NULL THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job AND j.state='LEASED'
  AND j.lease_session=session_user AND j.lease_hash=pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8'));
 IF NOT FOUND OR job.lease_expires_at<=pg_catalog.clock_timestamp()+interval '3 seconds'
  OR NOT EXISTS(SELECT FROM pathways_rules_internal.project_state s WHERE s.organization_id=job.organization_id
   AND s.project_id=job.project_id AND s.bootstrap_complete AND s.required_generation=job.claim_generation
   AND s.source_watermark=job.claim_watermark) THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.projection_context
 (transaction_id,backend_pid,login_name,purpose,job_id,snapshot_id,lease_hash,organization_id,project_id,expires_at)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,'CAPTURE',job.id,NULL,
  job.lease_hash,job.organization_id,job.project_id,job.lease_expires_at);
END $$;
ALTER FUNCTION pathways_rules_internal.install_capture_context(uuid,text) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_capture_context(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.install_capture_context(uuid,text) TO rules_projection_owner;

CREATE FUNCTION pathways_rules_internal.install_commit_context(wanted_job uuid,nonce text,wanted_snapshot uuid,wanted_digest bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job pathways_rules_internal.jobs; captured pathways_rules_internal.snapshots;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR nonce IS NULL OR nonce !~ '^[a-f0-9]{64}$'
  OR wanted_job IS NULL OR wanted_snapshot IS NULL OR wanted_digest IS NULL OR pg_catalog.octet_length(wanted_digest)<>32 THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job AND j.state='LEASED'
  AND j.lease_session=session_user AND j.lease_hash=pg_catalog.sha256(pg_catalog.convert_to(nonce,'UTF8'));
 SELECT s.* INTO captured FROM pathways_rules_internal.snapshots s WHERE s.id=wanted_snapshot AND s.job_id=wanted_job
  AND s.organization_id=job.organization_id AND s.project_id=job.project_id AND s.lease_session=session_user
  AND s.lease_hash=job.lease_hash AND s.digest=wanted_digest;
 IF NOT FOUND OR job.id IS NULL OR job.lease_expires_at<=pg_catalog.clock_timestamp()+interval '3 seconds'
  OR captured.required_generation IS DISTINCT FROM job.claim_generation OR captured.source_watermark IS DISTINCT FROM job.claim_watermark THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.projection_context
 (transaction_id,backend_pid,login_name,purpose,job_id,snapshot_id,lease_hash,organization_id,project_id,expires_at)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,'COMMIT',job.id,captured.id,
  job.lease_hash,job.organization_id,job.project_id,job.lease_expires_at);
END $$;
ALTER FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea) TO rules_commit_owner;

CREATE FUNCTION pathways_rules_internal.remove_projection_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_rules_worker' THEN RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways_rules_internal.projection_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules context unavailable' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.remove_projection_context() OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.remove_projection_context()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.remove_projection_context() TO rules_projection_owner,rules_commit_owner;

GRANT SELECT,INSERT,DELETE ON pathways_rules_internal.projection_context TO rules_context_owner;
CREATE POLICY f10_projection_context_actual_transaction ON pathways_rules_internal.projection_context FOR ALL TO rules_context_owner
 USING(session_user='pathways_rules_worker' AND transaction_id=pg_catalog.pg_current_xact_id()
  AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user)
 WITH CHECK(session_user='pathways_rules_worker' AND transaction_id=pg_catalog.pg_current_xact_id()
  AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user);
-- No other owner may install/change a context. Actual transaction metadata is
-- separately SELECTed by projection/commit/guard under this same fixed predicate.


-- rule-exposure.proposed.sql
-- Proposed0031 exact all-binding human exposure predicate. Not installed/run.
-- Metadata policies for this owner MUST NOT call this predicate recursively.
CREATE FUNCTION pathways_rules_internal.human_rules_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND org=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND project IS NOT NULL AND nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS NOT NULL
  AND (pathways.p06_can('rules.read',project) IS TRUE OR pathways.p06_can('rules.create',project) IS TRUE
    OR pathways.p06_can('rules.update',project) IS TRUE OR pathways.p06_can('rules.activate',project) IS TRUE
    OR pathways.p06_can('alerts.read',project) IS TRUE OR pathways.p06_can('alerts.review',project) IS TRUE
    OR pathways.p06_can('alerts.outcome.record',project) IS TRUE
    OR pathways.p06_can('recommendations.read',project) IS TRUE
    OR pathways.p06_can('recommendations.review',project) IS TRUE
    OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE)
$$;
ALTER FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.indicator_source_fingerprint(
 indicator uuid,revision integer,mode text,numeric_kind text,recipe text,activity uuid,contract text
) RETURNS bytea LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'indicatorId',indicator,'revision',revision,'measurementMode',mode,'numericKind',numeric_kind,
  'recipe',recipe,'activityId',activity,'contractVersion',contract)::text,'UTF8'))
$$;
ALTER FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text)
 OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.rule_exposure_allowed(wanted_rule uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; project uuid; tree jsonb; leaf_count integer; binding_count integer; permitted boolean;
BEGIN
 IF session_user<>'pathways_runtime' OR wanted_rule IS NULL THEN RETURN false; END IF;
 SELECT r.organization_id,r.project_id,r.conditions_json INTO org,project,tree FROM pathways.alert_rules r
  WHERE r.id=wanted_rule AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR pathways_rules_internal.human_rules_scope(org,project) IS DISTINCT FROM true THEN RETURN false; END IF;
 -- Activated trees were bounded and validated before bindings were persisted.
 -- All leaves must be present; OR never permits partial leaf disclosure.
 WITH RECURSIVE nodes(value,depth) AS (
  SELECT tree,0 UNION ALL
  SELECT child.value,n.depth+1 FROM nodes n
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(CASE WHEN n.value->>'kind'='GROUP'
   AND pg_catalog.jsonb_typeof(n.value->'children')='array' AND n.depth<4 THEN n.value->'children' ELSE '[]'::jsonb END) child
 ) SELECT count(*) FILTER(WHERE value->>'kind'='CONDITION')::integer INTO leaf_count FROM nodes;
 SELECT count(*)::integer INTO binding_count FROM pathways_rules_internal.rule_bindings b
  WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted_rule;
 IF leaf_count NOT BETWEEN 1 AND 32 OR leaf_count<>binding_count THEN RETURN false; END IF;
 SELECT NOT EXISTS(
  SELECT FROM pathways_rules_internal.rule_bindings b
  LEFT JOIN pathways.project_indicators i ON i.id=b.indicator_id AND i.organization_id=b.organization_id AND i.project_id=b.project_id
  LEFT JOIN pathways.project_indicator_bindings source ON source.indicator_id=i.id AND source.organization_id=i.organization_id AND source.project_id=i.project_id
  LEFT JOIN pathways_rules_internal.eligibility recorded ON recorded.id=b.classification_id
   AND recorded.organization_id=b.organization_id AND recorded.project_id=b.project_id AND recorded.indicator_id=b.indicator_id
  LEFT JOIN LATERAL (SELECT e.id,e.decision,e.audience,e.approved_at,e.expires_at,e.definition_revision,e.source_fingerprint
   FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=b.organization_id AND e.project_id=b.project_id AND e.indicator_id=b.indicator_id
   ORDER BY e.classification_revision DESC LIMIT 1) latest ON true
  WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted_rule AND
   ((b.indicator_id IS NOT NULL AND (
    i.id IS NULL OR i.archived_at IS NOT NULL OR i.revision IS DISTINCT FROM b.definition_revision
    OR i.measurement_mode IS NULL OR i.numeric_kind IS NULL
    OR ((i.measurement_mode='MANUAL' AND source.id IS NULL)
     OR (i.measurement_mode='DERIVED' AND i.numeric_kind='PERCENTAGE'
      AND source.recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND source.contract_version='p06.v1' AND source.activity_id IS NULL)) IS DISTINCT FROM true
    OR recorded.id IS NULL OR latest.id IS NULL
    OR recorded.decision IS DISTINCT FROM 'ALLOWED_NON_SENSITIVE' OR latest.decision IS DISTINCT FROM 'ALLOWED_NON_SENSITIVE'
    OR recorded.audience IS DISTINCT FROM 'ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    OR latest.audience IS DISTINCT FROM 'ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    OR recorded.approved_at>pg_catalog.clock_timestamp() OR latest.approved_at>pg_catalog.clock_timestamp()
    OR (recorded.expires_at IS NOT NULL AND recorded.expires_at<=pg_catalog.clock_timestamp())
    OR (latest.expires_at IS NOT NULL AND latest.expires_at<=pg_catalog.clock_timestamp())
    OR recorded.definition_revision IS DISTINCT FROM i.revision OR latest.definition_revision IS DISTINCT FROM i.revision
    OR recorded.source_fingerprint IS DISTINCT FROM b.source_fingerprint
    OR latest.source_fingerprint IS DISTINCT FROM b.source_fingerprint
    OR b.source_fingerprint IS DISTINCT FROM pathways_rules_internal.indicator_source_fingerprint(
     i.id,i.revision,i.measurement_mode,i.numeric_kind,source.recipe,source.activity_id,source.contract_version)))
   OR (b.activity_id IS NOT NULL AND NOT EXISTS(SELECT FROM pathways.project_activities a
    WHERE a.id=b.activity_id AND a.organization_id=org AND a.project_id=project)))
 ) INTO permitted;
 RETURN permitted IS TRUE;
END $$;
ALTER FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid)
 TO rules_capacity_owner,rules_config_owner,rules_human_owner,rules_outcome_owner,rules_runtime_guard_owner;
-- No public boolean/status API. Read wrappers project/count only after this
-- whole-resource predicate. Source owner reads metadata, never measurement or
-- beneficiary/form/journey source values, notes, baseline/target or labels.


-- machine-eligibility.proposed.sql
-- Proposed0031 lease-scoped metadata and indicator numeric-read predicate.
CREATE FUNCTION pathways_rules_internal.eligibility_metadata_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pathways_rules_internal.human_rules_scope(org,project) IS TRUE
  OR pathways_rules_internal.lease_metric_scope(org,project) IS TRUE
$$;
ALTER FUNCTION pathways_rules_internal.eligibility_metadata_scope(uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.eligibility_metadata_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.lease_indicator_allowed(org uuid,project uuid,indicator uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.lease_metric_scope(org,project) IS TRUE AND EXISTS(
  SELECT FROM pathways_rules_internal.rule_bindings b
  JOIN pathways.alert_rules r ON r.id=b.rule_version_id AND r.organization_id=b.organization_id AND r.project_id=b.project_id
  JOIN pathways.project_indicators i ON i.id=b.indicator_id AND i.organization_id=b.organization_id AND i.project_id=b.project_id
  LEFT JOIN pathways.project_indicator_bindings source ON source.indicator_id=i.id AND source.organization_id=i.organization_id AND source.project_id=i.project_id
  JOIN pathways_rules_internal.eligibility recorded ON recorded.id=b.classification_id AND recorded.organization_id=b.organization_id
   AND recorded.project_id=b.project_id AND recorded.indicator_id=b.indicator_id
  JOIN LATERAL(SELECT e.decision,e.audience,e.approved_at,e.expires_at,e.definition_revision,e.source_fingerprint
   FROM pathways_rules_internal.eligibility e WHERE e.organization_id=b.organization_id
   AND e.project_id=b.project_id AND e.indicator_id=b.indicator_id ORDER BY e.classification_revision DESC LIMIT 1) latest ON true
  WHERE b.organization_id=org AND b.project_id=project AND b.indicator_id=indicator
   AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE' AND i.archived_at IS NULL
   AND i.revision=b.definition_revision AND recorded.definition_revision=i.revision AND latest.definition_revision=i.revision
   AND ((i.measurement_mode='MANUAL' AND source.id IS NULL) OR (i.measurement_mode='DERIVED' AND i.numeric_kind='PERCENTAGE'
    AND source.recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND source.contract_version='p06.v1' AND source.activity_id IS NULL)) IS TRUE
   AND recorded.decision='ALLOWED_NON_SENSITIVE' AND latest.decision='ALLOWED_NON_SENSITIVE'
   AND recorded.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS' AND latest.audience='ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
   AND recorded.approved_at<=pg_catalog.clock_timestamp() AND latest.approved_at<=pg_catalog.clock_timestamp()
   AND (recorded.expires_at IS NULL OR recorded.expires_at>pg_catalog.clock_timestamp())
   AND (latest.expires_at IS NULL OR latest.expires_at>pg_catalog.clock_timestamp())
   AND recorded.source_fingerprint=b.source_fingerprint AND latest.source_fingerprint=b.source_fingerprint
   AND b.source_fingerprint=pathways_rules_internal.indicator_source_fingerprint(i.id,i.revision,i.measurement_mode,
    i.numeric_kind,source.recipe,source.activity_id,source.contract_version))
$$;
ALTER FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid)
 TO rules_projection_owner,rules_commit_owner;
-- Source numeric policy must additionally constrain each measurement/indicator
-- to this live lease-bound predicate. No broad source-value SELECT is granted.


-- machine-whole-exposure.proposed.sql
CREATE FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(wanted_rule uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; project uuid; tree jsonb; leaf_count integer; binding_count integer; permitted boolean;
BEGIN
 IF session_user<>'pathways_rules_worker' OR wanted_rule IS NULL THEN RETURN false; END IF;
 SELECT r.organization_id,r.project_id,r.conditions_json INTO org,project,tree FROM pathways.alert_rules r
  WHERE r.id=wanted_rule
   AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true THEN RETURN false; END IF;
 -- Activated trees were bounded and validated before bindings were persisted.
 -- All leaves must be present; OR never permits partial leaf disclosure.
 WITH RECURSIVE nodes(value,depth) AS (
  SELECT tree,0 UNION ALL
  SELECT child.value,n.depth+1 FROM nodes n
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(CASE WHEN n.value->>'kind'='GROUP'
   AND pg_catalog.jsonb_typeof(n.value->'children')='array' AND n.depth<4 THEN n.value->'children' ELSE '[]'::jsonb END) child
 ) SELECT count(*) FILTER(WHERE value->>'kind'='CONDITION')::integer INTO leaf_count FROM nodes;
 SELECT count(*)::integer INTO binding_count FROM pathways_rules_internal.rule_bindings b
  WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted_rule;
 IF leaf_count NOT BETWEEN 1 AND 32 OR leaf_count<>binding_count THEN RETURN false; END IF;
 SELECT NOT EXISTS(
  SELECT FROM pathways_rules_internal.rule_bindings b
  LEFT JOIN pathways.project_indicators i ON i.id=b.indicator_id AND i.organization_id=b.organization_id AND i.project_id=b.project_id
  LEFT JOIN pathways.project_indicator_bindings source ON source.indicator_id=i.id AND source.organization_id=i.organization_id AND source.project_id=i.project_id
  LEFT JOIN pathways_rules_internal.eligibility recorded ON recorded.id=b.classification_id
   AND recorded.organization_id=b.organization_id AND recorded.project_id=b.project_id AND recorded.indicator_id=b.indicator_id
  LEFT JOIN LATERAL (SELECT e.id,e.decision,e.audience,e.approved_at,e.expires_at,e.definition_revision,e.source_fingerprint
   FROM pathways_rules_internal.eligibility e
   WHERE e.organization_id=b.organization_id AND e.project_id=b.project_id AND e.indicator_id=b.indicator_id
   ORDER BY e.classification_revision DESC LIMIT 1) latest ON true
  WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=wanted_rule AND
   ((b.indicator_id IS NOT NULL AND (
    i.id IS NULL OR i.archived_at IS NOT NULL OR i.revision IS DISTINCT FROM b.definition_revision
    OR i.measurement_mode IS NULL OR i.numeric_kind IS NULL
    OR ((i.measurement_mode='MANUAL' AND source.id IS NULL)
     OR (i.measurement_mode='DERIVED' AND i.numeric_kind='PERCENTAGE'
      AND source.recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND source.contract_version='p06.v1' AND source.activity_id IS NULL)) IS DISTINCT FROM true
    OR recorded.id IS NULL OR latest.id IS NULL
    OR recorded.decision IS DISTINCT FROM 'ALLOWED_NON_SENSITIVE' OR latest.decision IS DISTINCT FROM 'ALLOWED_NON_SENSITIVE'
    OR recorded.audience IS DISTINCT FROM 'ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    OR latest.audience IS DISTINCT FROM 'ALL_AUTHORIZED_INTERNAL_ALERT_READERS'
    OR recorded.approved_at>pg_catalog.clock_timestamp() OR latest.approved_at>pg_catalog.clock_timestamp()
    OR (recorded.expires_at IS NOT NULL AND recorded.expires_at<=pg_catalog.clock_timestamp())
    OR (latest.expires_at IS NOT NULL AND latest.expires_at<=pg_catalog.clock_timestamp())
    OR recorded.definition_revision IS DISTINCT FROM i.revision OR latest.definition_revision IS DISTINCT FROM i.revision
    OR recorded.source_fingerprint IS DISTINCT FROM b.source_fingerprint
    OR latest.source_fingerprint IS DISTINCT FROM b.source_fingerprint
    OR b.source_fingerprint IS DISTINCT FROM pathways_rules_internal.indicator_source_fingerprint(
     i.id,i.revision,i.measurement_mode,i.numeric_kind,source.recipe,source.activity_id,source.contract_version)))
   OR (b.activity_id IS NOT NULL AND NOT EXISTS(SELECT FROM pathways.project_activities a
    WHERE a.id=b.activity_id AND a.organization_id=org AND a.project_id=project)))
 ) INTO permitted;
 RETURN permitted IS TRUE;
END $$;
ALTER FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) TO rules_projection_owner,rules_commit_owner;


-- configuration-admission.proposed.sql
-- Proposed0031 exact private admission boundary, not installed/executed.
-- Dependency: complete rule_exposure_allowed(uuid) approved whole-rule predicate,
-- complete project_state bootstrap_complete schema and existing current p06 scope.
-- No candidate, receipt, slot or count parameter is accepted or returned here.
CREATE FUNCTION pathways_rules_internal.configuration_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND org IS NOT NULL AND project IS NOT NULL
  AND org=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS NOT NULL
  AND (pathways.p06_can('rules.create',project) IS TRUE
    OR pathways.p06_can('rules.update',project) IS TRUE
    OR pathways.p06_can('rules.activate',project) IS TRUE)
$$;
ALTER FUNCTION pathways_rules_internal.configuration_scope(uuid,uuid) OWNER TO rules_capacity_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.configuration_scope(uuid,uuid)
 TO rules_config_owner,rules_capacity_owner;

CREATE FUNCTION pathways_rules_internal.configuration_admission(org uuid,project uuid,operation text)
RETURNS TABLE(admitted_generation bigint,admitted_watermark bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE permission text; generation bigint; watermark bigint; bootstrapped boolean;
BEGIN
 permission:=CASE operation WHEN 'RULE_CREATE' THEN 'rules.create'
  WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate'
  WHEN 'RULE_ARCHIVE' THEN 'rules.update' ELSE NULL END;
 IF permission IS NULL OR pathways_rules_internal.configuration_scope(org,project) IS DISTINCT FROM true
  OR pathways.p06_can(permission,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501';
 END IF;
 -- State always precedes candidate, rule, queue and receipt locks. No mutation.
 SELECT s.required_generation,s.source_watermark,s.bootstrap_complete INTO generation,watermark,bootstrapped
 FROM pathways_rules_internal.project_state s
  WHERE s.organization_id=org AND s.project_id=project FOR NO KEY UPDATE;
 -- Revalidate live authority after potentially waiting for protected state.
 IF NOT FOUND OR bootstrapped IS DISTINCT FROM true
  OR pathways_rules_internal.configuration_scope(org,project) IS DISTINCT FROM true
  OR pathways.p06_can(permission,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501';
 END IF;
 -- This owner deliberately sees every ACTIVE contributor's metadata, including
 -- legacy contributors. Exposure filtering belongs inside the predicate, never
 -- on this owner's catalog SELECT policy: otherwise hidden occupancy is missed.
 IF EXISTS(SELECT FROM pathways.alert_rules r
   WHERE r.organization_id=org AND r.project_id=project AND r.status='ACTIVE'
    AND pathways_rules_internal.rule_exposure_allowed(r.id) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT generation,watermark;
END $$;
ALTER FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text) OWNER TO rules_capacity_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text) TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid) TO rules_capacity_owner;

GRANT SELECT(organization_id,project_id,source_watermark,required_generation,bootstrap_complete)
 ON pathways_rules_internal.project_state TO rules_capacity_owner;
-- PostgreSQL row locking requires UPDATE privilege; only inert lock_revision is
-- granted, with no direct login/member access to this NOLOGIN function owner.
GRANT UPDATE(lock_revision) ON pathways_rules_internal.project_state TO rules_capacity_owner;
CREATE POLICY f10_capacity_state_read ON pathways_rules_internal.project_state
 FOR SELECT TO rules_capacity_owner USING(pathways_rules_internal.configuration_scope(organization_id,project_id));
CREATE POLICY f10_capacity_state_lock ON pathways_rules_internal.project_state
 FOR UPDATE TO rules_capacity_owner
 USING(pathways_rules_internal.configuration_scope(organization_id,project_id))
 WITH CHECK(pathways_rules_internal.configuration_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,status,runtime_contract_version)
 ON pathways.alert_rules TO rules_capacity_owner;
CREATE POLICY f10_capacity_all_contributors ON pathways.alert_rules FOR SELECT TO rules_capacity_owner
 USING(pathways_rules_internal.configuration_scope(organization_id,project_id));
CREATE POLICY f10_capacity_scope_guard ON pathways.alert_rules AS RESTRICTIVE FOR SELECT TO rules_capacity_owner
 USING(pathways_rules_internal.configuration_scope(organization_id,project_id));
-- Calling wrappers must invoke this before candidate/receipt lookup on EVERY
-- project create-copy/draft/activate/replace/archive, including committed retry.
-- After ALLOWED only, wrappers check the visible candidate and fixed cap20;
-- atomic replacement retains its existing slot. Unbound Admin templates never
-- use this helper. No capacity boolean or hidden metadata is exposed publicly.


-- configuration-validation.proposed.sql
-- Proposed0031 fixed native typed request validation AFTER admission.
CREATE FUNCTION pathways_rules_internal.validate_configuration_input(input jsonb,operation text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE allowed text[]; pending jsonb[]; current_node jsonb; children jsonb[]; count_nodes integer:=0;
 observations jsonb:='{}'; item jsonb; ids uuid[]:=ARRAY[]::uuid[]; item_id uuid;
BEGIN
 allowed:=CASE operation
  WHEN 'RULE_CREATE' THEN ARRAY['name','severity','conditions','recommendations','code','projectId','templateId','clientOperationId']
  WHEN 'RULE_DRAFT' THEN ARRAY['name','severity','conditions','recommendations','expectedVersion','clientOperationId']
  WHEN 'RULE_ACTIVATE' THEN ARRAY['expectedVersion','clientOperationId']
  WHEN 'RULE_ARCHIVE' THEN ARRAY['expectedVersion','clientOperationId','note'] ELSE NULL END;
 IF allowed IS NULL OR input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object' OR (input-allowed)<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'clientOperationId') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 PERFORM (input->>'clientOperationId')::uuid;
 IF operation<>'RULE_CREATE' AND (pg_catalog.jsonb_typeof(input->'expectedVersion') IS DISTINCT FROM 'number'
  OR (input->>'expectedVersion') !~ '^[1-9][0-9]{0,9}$' OR (input->>'expectedVersion')::numeric>2147483647) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF operation='RULE_CREATE' THEN
  IF pg_catalog.jsonb_typeof(input->'code') IS DISTINCT FROM 'string' OR (input->>'code') !~ '^[A-Z][A-Z0-9_-]{1,79}$'
   OR (input ? 'templateId' AND NOT input ? 'projectId') THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  IF input ? 'projectId' THEN
   IF pg_catalog.jsonb_typeof(input->'projectId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   PERFORM (input->>'projectId')::uuid;
  END IF;
  IF input ? 'templateId' THEN
   IF pg_catalog.jsonb_typeof(input->'templateId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   PERFORM (input->>'templateId')::uuid;
  END IF;
 END IF;
 IF operation='RULE_ARCHIVE' AND (pg_catalog.jsonb_typeof(input->'note') IS DISTINCT FROM 'string'
  OR pg_catalog.length(pg_catalog.btrim(input->>'note')) NOT BETWEEN 1 AND 2000) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF operation IN ('RULE_CREATE','RULE_DRAFT') THEN
  IF pg_catalog.jsonb_typeof(input->'name') IS DISTINCT FROM 'string'
   OR pg_catalog.length(pg_catalog.btrim(input->>'name')) NOT BETWEEN 1 AND 160
   OR pg_catalog.jsonb_typeof(input->'severity') IS DISTINCT FROM 'string'
   OR input->>'severity' NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
   OR pg_catalog.jsonb_typeof(input->'conditions') IS DISTINCT FROM 'object'
   OR pg_catalog.jsonb_typeof(input->'recommendations') IS DISTINCT FROM 'array'
   OR pg_catalog.jsonb_array_length(input->'recommendations') NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(input->'recommendations') LOOP
   IF pg_catalog.jsonb_typeof(item)<>'object' OR (item-ARRAY['id','title','text'])<>'{}'::jsonb
    OR pg_catalog.jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(item->'title') IS DISTINCT FROM 'string'
    OR pg_catalog.length(pg_catalog.btrim(item->>'title')) NOT BETWEEN 1 AND 160
    OR pg_catalog.jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
    OR pg_catalog.length(pg_catalog.btrim(item->>'text')) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   item_id:=(item->>'id')::uuid;
   IF item_id=ANY(ids) THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
   ids:=pg_catalog.array_append(ids,item_id);
  END LOOP;
  -- Bounded iterative traversal constructs only unavailable synthetic cells;
  -- complete shared native evaluator performs strict shape/domain/depth checks.
  pending:=ARRAY[input->'conditions'];
  WHILE pg_catalog.cardinality(pending)>0 LOOP
   current_node:=pending[pg_catalog.cardinality(pending)];pending:=pending[1:pg_catalog.cardinality(pending)-1];
   count_nodes:=count_nodes+1;
   IF count_nodes>160 OR pg_catalog.jsonb_typeof(current_node) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid bounded tree.' USING ERRCODE='22023'; END IF;
   IF current_node->>'kind'='CONDITION' AND current_node->>'id' IS NOT NULL THEN
    observations:=observations||pg_catalog.jsonb_build_object(current_node->>'id',pg_catalog.jsonb_build_object(
     'metric',current_node->>'metric','cell',pg_catalog.jsonb_build_object('state','MISSING','value',NULL,'reason','NO_MEASUREMENT')));
   ELSIF current_node->>'kind'='GROUP' AND pg_catalog.jsonb_typeof(current_node->'children')='array'
    AND pg_catalog.jsonb_array_length(current_node->'children') BETWEEN 1 AND 32 THEN
    SELECT pg_catalog.array_agg(value) INTO children FROM pg_catalog.jsonb_array_elements(current_node->'children');
    pending:=pending||children;
   ELSE RAISE EXCEPTION 'Invalid bounded tree.' USING ERRCODE='22023'; END IF;
  END LOOP;
  PERFORM pathways_rules_internal.evaluate_snapshot_rule(input->'conditions',observations);
 END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;


-- feature-human-context.proposed.sql
-- Proposed0031 exact current-operation marker installers, not installed/executed.
-- Fixed public wrappers owned by rules_outcome_owner are the only callers.
-- Complete whole-rule exposure/owner column policies must precede extraction.
CREATE FUNCTION pathways_rules_internal.install_feature_context(
 project uuid,operation text,alert uuid,recommendation uuid,preview uuid,
 client_operation uuid,request_hash bytea
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; actor uuid; permission text; rule uuid; found_project uuid;
BEGIN
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid; actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 permission:=CASE operation WHEN 'ALERT_REVIEW' THEN 'alerts.review'
  WHEN 'ALERT_DISPOSITION' THEN 'alerts.outcome.record'
  WHEN 'ALERT_PREVIEW' THEN 'alerts.outcome.record' WHEN 'ALERT_CONFIRM' THEN 'alerts.outcome.record'
  WHEN 'RECOMMENDATION_REVIEW' THEN 'recommendations.review'
  WHEN 'RECOMMENDATION_PREVIEW' THEN 'recommendations.outcome.record'
  WHEN 'RECOMMENDATION_CONFIRM' THEN 'recommendations.outcome.record' ELSE NULL END;
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR project IS NULL
  OR alert IS NULL OR client_operation IS NULL OR request_hash IS NULL
  OR pg_catalog.octet_length(request_hash)<>32 OR permission IS NULL
  OR pathways.p06_can(permission,project) IS DISTINCT FROM true
  OR (operation LIKE 'RECOMMENDATION_%' AND recommendation IS NULL)
  OR (operation IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM') AND preview IS NULL)
  OR (operation NOT IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM') AND preview IS NOT NULL)
  OR EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user) THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 -- The state lock is obtained before any resource/preview/receipt lock.
 SELECT s.project_id INTO found_project FROM pathways_rules_internal.project_state s
  WHERE s.organization_id=org AND s.project_id=project AND s.bootstrap_complete FOR NO KEY UPDATE;
 IF NOT FOUND OR pathways.p06_can(permission,project) IS DISTINCT FROM true
  OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  OR actor IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 -- Actual marker authorizes only this fixed operation in this transaction. All
 -- later validation exceptions roll it back; no marker reaches an HTTP caller.
 BEGIN
 INSERT INTO pathways_rules_internal.feature_operation_context
 (transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,
  operation_id,purpose,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,org,project,actor,
  client_operation,'FEATURE_HUMAN',operation,alert,recommendation,preview,request_hash);
 EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501';
 END;
 SELECT a.rule_id INTO rule FROM pathways.rule_based_alerts a
  WHERE a.id=alert AND a.organization_id=org AND a.project_id=project
   AND a.runtime_contract_version='f10.v1';
 IF NOT FOUND OR pathways_rules_internal.rule_exposure_allowed(rule) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 IF recommendation IS NOT NULL AND NOT EXISTS(SELECT FROM pathways.decision_recommendations r
  WHERE r.id=recommendation AND r.organization_id=org AND r.project_id=project
   AND r.alert_id=alert AND r.runtime_contract_version='f10.v1') THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 -- Preview ownership/digests/expiry, secondary grants, exact revisions and fixed
 -- write set are separately validated by the fixed preview/confirm wrappers.
END $$;
ALTER FUNCTION pathways_rules_internal.install_feature_context(uuid,text,uuid,uuid,uuid,uuid,bytea)
 OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_feature_context(uuid,text,uuid,uuid,uuid,uuid,bytea)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.remove_feature_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways_rules_internal.feature_operation_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND (CASE c.operation_code WHEN 'ALERT_REVIEW' THEN pathways.p06_can('alerts.review',c.project_id) WHEN 'ALERT_DISPOSITION' THEN pathways.p06_can('alerts.outcome.record',c.project_id) WHEN 'ALERT_PREVIEW' THEN pathways.p06_can('alerts.outcome.record',c.project_id) WHEN 'ALERT_CONFIRM' THEN pathways.p06_can('alerts.outcome.record',c.project_id) WHEN 'RECOMMENDATION_REVIEW' THEN pathways.p06_can('recommendations.review',c.project_id) WHEN 'RECOMMENDATION_PREVIEW' THEN pathways.p06_can('recommendations.outcome.record',c.project_id) WHEN 'RECOMMENDATION_CONFIRM' THEN pathways.p06_can('recommendations.outcome.record',c.project_id) ELSE false END IS TRUE);
 IF NOT FOUND THEN RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.remove_feature_context() OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.remove_feature_context()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
-- Same owner calls its helpers implicitly. No direct login grants, marker
-- UPDATE, general setter, arbitrary scope GUC or independent context capability.


-- human-review.proposed.sql
-- Proposed0031 exact fixed human review/disposition bodies. Not executed.
CREATE FUNCTION pathways_rules_internal.validate_review_input(input jsonb,disposition boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object'
  OR NOT input ?& ARRAY['expectedRevision','note','clientOperationId']
  OR (input-(ARRAY['expectedRevision','note','clientOperationId']||CASE WHEN disposition THEN ARRAY['action'] ELSE ARRAY[]::text[] END))<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'expectedRevision') IS DISTINCT FROM 'string'
  OR (input->>'expectedRevision') !~ '^[1-9][0-9]{0,18}$'
  OR (input->>'expectedRevision')::numeric>9223372036854775807
  OR pg_catalog.jsonb_typeof(input->'note') IS DISTINCT FROM 'string'
  OR pg_catalog.length(pg_catalog.btrim(input->>'note')) NOT BETWEEN 1 AND 2000
  OR pg_catalog.jsonb_typeof(input->'clientOperationId') IS DISTINCT FROM 'string'
  OR (disposition AND (input->>'action' IS NULL OR input->>'action' NOT IN ('RESOLVE','DISMISS'))) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 PERFORM (input->>'clientOperationId')::uuid;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;

CREATE FUNCTION pathways_rules_internal.install_human_intent(relation oid,before_row jsonb,after_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker pathways_rules_internal.feature_operation_context;
BEGIN
 SELECT c.* INTO marker FROM pathways_rules_internal.feature_operation_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user;
 IF NOT FOUND OR pathways_rules_internal.feature_human_scope(marker.organization_id,marker.project_id) IS DISTINCT FROM true
  OR relation NOT IN ('pathways.rule_based_alerts'::regclass,'pathways.decision_recommendations'::regclass)
  OR before_row IS NULL OR after_row IS NULL OR pg_catalog.jsonb_typeof(before_row)<>'object' OR pg_catalog.jsonb_typeof(after_row)<>'object'
  OR after_row->>'organization_id' IS DISTINCT FROM marker.organization_id::text
  OR after_row->>'project_id' IS DISTINCT FROM marker.project_id::text
  OR (relation='pathways.rule_based_alerts'::regclass AND after_row->>'id' IS DISTINCT FROM marker.alert_id::text)
  OR (relation='pathways.decision_recommendations'::regclass AND after_row->>'id' IS DISTINCT FROM marker.recommendation_id::text) THEN
  RAISE EXCEPTION 'Human operation unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways_rules_internal.runtime_mutation_intents
 (transaction_id,backend_pid,login_name,purpose,organization_id,project_id,operation_id,relation_oid,action,record_id,expected_old,expected_new)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,'FEATURE_HUMAN',marker.organization_id,
  marker.project_id,marker.operation_id,relation,'UPDATE',(after_row->>'id')::uuid,before_row,after_row);
END $$;

CREATE FUNCTION pathways_rules_internal.alert_review_operation(wanted uuid,input jsonb,disposition boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_alert pathways.rule_based_alerts; new_alert pathways.rule_based_alerts;
 org uuid; project uuid; actor uuid; op uuid; hash bytea; operation text; receipt pathways_rules_internal.feature_operation_receipts;
 moment timestamptz(3); result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 operation:=CASE WHEN disposition THEN 'ALERT_DISPOSITION' ELSE 'ALERT_REVIEW' END;
 -- Only metadata needed to derive scope is retrieved before state protection.
 SELECT a.project_id INTO project FROM pathways.rule_based_alerts a WHERE a.id=wanted AND a.organization_id=org
  AND a.runtime_contract_version='f10.v1';
 IF NOT FOUND OR session_user<>'pathways_runtime' OR pathways.p06_can(CASE WHEN disposition THEN 'alerts.outcome.record' ELSE 'alerts.review' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.validate_review_input(input,disposition);
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,operation,wanted,NULL,NULL,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.alert_id IS DISTINCT FROM wanted
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result;PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 SELECT a.* INTO old_alert FROM pathways.rule_based_alerts a WHERE a.id=wanted AND a.organization_id=org
  AND a.project_id=project AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND OR old_alert.revision<>(input->>'expectedRevision')::bigint
  OR (disposition AND old_alert.lifecycle NOT IN ('NEW','REVIEWED','ACTIONED'))
  OR (NOT disposition AND EXISTS(SELECT FROM pathways_rules_internal.alert_reviews r
   WHERE r.organization_id=org AND r.project_id=project AND r.alert_id=wanted)) THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(old_alert.rule_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());new_alert:=old_alert;
 new_alert.lifecycle:=CASE WHEN disposition THEN CASE WHEN input->>'action'='RESOLVE' THEN 'RESOLVED' ELSE 'DISMISSED' END
  WHEN old_alert.lifecycle='NEW' THEN 'REVIEWED' ELSE old_alert.lifecycle END;
 new_alert.revision:=old_alert.revision+1;new_alert.updated_at:=moment;
 result:=pathways_rules_internal.alert_json(wanted)||pg_catalog.jsonb_build_object('lifecycle',new_alert.lifecycle,'revision',new_alert.revision::text);
 receipt.id:=pg_catalog.gen_random_uuid();
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (id,organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(receipt.id,org,project,actor,op,operation,wanted,hash,result,moment);
 IF disposition THEN
  INSERT INTO pathways_rules_internal.lifecycle_events
  (organization_id,project_id,alert_id,actor_kind,actor_id,state_before,state_after,note,operation_receipt_id,occurred_at)
  VALUES(org,project,wanted,'HUMAN',actor,old_alert.lifecycle,new_alert.lifecycle,pg_catalog.btrim(input->>'note'),receipt.id,moment);
 ELSE
  INSERT INTO pathways_rules_internal.alert_reviews
  (organization_id,project_id,alert_id,actor_id,operation_receipt_id,state_before,state_after,note,occurred_at)
  VALUES(org,project,wanted,actor,receipt.id,old_alert.lifecycle,new_alert.lifecycle,pg_catalog.btrim(input->>'note'),moment);
 END IF;
 PERFORM pathways_rules_internal.install_human_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
 UPDATE pathways.rule_based_alerts SET lifecycle=new_alert.lifecycle,revision=new_alert.revision,updated_at=moment
  WHERE id=wanted AND organization_id=org AND project_id=project AND revision=old_alert.revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,CASE WHEN disposition THEN 'alert.disposition' ELSE 'alert.review' END,'RuleBasedAlert',wanted,
  pg_catalog.jsonb_build_object('lifecycle',new_alert.lifecycle,'revision',new_alert.revision::text));
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
END $$;
CREATE FUNCTION pathways.f10_alert_review(wanted uuid,input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.alert_review_operation(wanted,input,false)
$$;
CREATE FUNCTION pathways.f10_alert_disposition(wanted uuid,input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.alert_review_operation(wanted,input,true)
$$;

CREATE FUNCTION pathways.f10_recommendation_review(wanted uuid,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_rec pathways.decision_recommendations;new_rec pathways.decision_recommendations;
 org uuid;project uuid;alert uuid;actor uuid;op uuid;hash bytea;receipt pathways_rules_internal.feature_operation_receipts;
 moment timestamptz(3);review_id uuid;result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 SELECT r.project_id,r.alert_id INTO project,alert FROM pathways.decision_recommendations r
  WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR session_user<>'pathways_runtime' OR pathways.p06_can('recommendations.review',project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.validate_review_input(input,false);
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,'RECOMMENDATION_REVIEW',alert,wanted,NULL,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM 'RECOMMENDATION_REVIEW' OR receipt.recommendation_id IS DISTINCT FROM wanted
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result;PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 SELECT r.* INTO old_rec FROM pathways.decision_recommendations r WHERE r.id=wanted AND r.organization_id=org
  AND r.project_id=project AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND OR old_rec.status<>'NEW' OR old_rec.revision<>(input->>'expectedRevision')::bigint THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT FROM pathways.rule_based_alerts a WHERE a.id=alert AND a.organization_id=org AND a.project_id=project
   AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());review_id:=pg_catalog.gen_random_uuid();new_rec:=old_rec;
 new_rec.status:='REVIEWED';new_rec.revision:=old_rec.revision+1;new_rec.private_review_id:=review_id;
 new_rec.reviewed_by_id:=actor;new_rec.reviewed_at:=moment;new_rec.updated_at:=moment;
 result:=pathways_rules_internal.recommendation_json(wanted)||pg_catalog.jsonb_build_object('status','REVIEWED','revision',new_rec.revision::text,'reviewedAt',moment);
 receipt.id:=pg_catalog.gen_random_uuid();
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (id,organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(receipt.id,org,project,actor,op,'RECOMMENDATION_REVIEW',alert,wanted,hash,result,moment);
 INSERT INTO pathways_rules_internal.recommendation_reviews
 (id,organization_id,project_id,recommendation_id,actor_id,operation_receipt_id,note,occurred_at)
 VALUES(review_id,org,project,wanted,actor,receipt.id,pg_catalog.btrim(input->>'note'),moment);
 PERFORM pathways_rules_internal.install_human_intent('pathways.decision_recommendations'::regclass,pg_catalog.to_jsonb(old_rec),pg_catalog.to_jsonb(new_rec));
 UPDATE pathways.decision_recommendations SET status=new_rec.status,revision=new_rec.revision,private_review_id=review_id,
  reviewed_by_id=actor,reviewed_at=moment,updated_at=moment WHERE id=wanted AND organization_id=org AND project_id=project AND revision=old_rec.revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,'recommendation.review','DecisionRecommendation',wanted,pg_catalog.jsonb_build_object('status','REVIEWED','revision',new_rec.revision::text));
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
END $$;


-- outcome-support.proposed.sql
-- Proposed0031 fixed in-app notification/preview supporting storage and helpers.
CREATE TABLE pathways_rules_internal.notifications (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),organization_id uuid NOT NULL,project_id uuid NOT NULL,
 recipient_id uuid NOT NULL,alert_id uuid NOT NULL,decision_id uuid NOT NULL,
 message text NOT NULL CHECK(pg_catalog.length(message) BETWEEN 1 AND 500),
 delivery_state text NOT NULL CHECK(delivery_state IN ('PENDING','DELIVERED','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),next_attempt_at timestamptz,
 created_at timestamptz(3) NOT NULL,read_at timestamptz(3),
 UNIQUE(decision_id,recipient_id),UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,recipient_id) REFERENCES pathways.system_users(organization_id,id),
 FOREIGN KEY(organization_id,project_id,alert_id) REFERENCES pathways.rule_based_alerts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,decision_id) REFERENCES pathways_rules_internal.decisions(organization_id,project_id,id),
 CHECK(read_at IS NULL OR read_at>=created_at)
);
CREATE INDEX f10_notification_recipient_directory ON pathways_rules_internal.notifications(organization_id,recipient_id,created_at,id);
ALTER TABLE pathways_rules_internal.notifications OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.notifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.notifications FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.outcome_recipients(org uuid,project uuid,actor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(pg_catalog.jsonb_agg(q.id ORDER BY q.id),'[]'::jsonb) FROM (
  SELECT u.id FROM pathways.system_users u
  JOIN pathways.organizations o ON o.id=u.organization_id AND o.status='ACTIVE' AND o.archived_at IS NULL
  JOIN pathways.roles r ON r.id=u.role_id AND r.is_active
  JOIN pathways.projects pr ON pr.organization_id=u.organization_id AND pr.id=project AND pr.archived_at IS NULL
  WHERE u.organization_id=org AND u.id<>actor AND u.account_status='ACTIVE' AND u.archived_at IS NULL
   AND EXISTS(SELECT FROM pathways.role_permissions rp JOIN pathways.permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=r.id AND p.code='alerts.read' AND p.is_active AND pathways.p09_role_allows(r.code,p.code))
   AND (r.code='SYSTEM_ADMINISTRATOR' OR EXISTS(SELECT FROM pathways.user_project_assignments a
    WHERE a.organization_id=org AND a.project_id=project AND a.user_id=u.id AND a.status='ACTIVE' AND a.ended_at IS NULL)
    OR (r.code='PROGRAM_MANAGER' AND EXISTS(SELECT FROM pathways.programs pg
     WHERE pg.id=pr.program_id AND pg.organization_id=org AND pg.manager_user_id=u.id AND pg.archived_at IS NULL)))
  ORDER BY u.id LIMIT 1001) q
$$;
CREATE FUNCTION pathways_rules_internal.classification_fingerprint(wanted_rule uuid)
RETURNS bytea LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('conditionId',b.condition_id,'definitionRevision',b.definition_revision,
   'recordedApproval',b.classification_id,'sourceFingerprint',pg_catalog.encode(b.source_fingerprint,'hex'),
   'latestApproval',latest.id,'latestRevision',latest.classification_revision,'latestExpiresAt',latest.expires_at)
  ORDER BY b.condition_id),'[]'::jsonb)::text,'UTF8'))
 FROM pathways_rules_internal.rule_bindings b
 LEFT JOIN LATERAL (SELECT e.id,e.classification_revision,e.expires_at FROM pathways_rules_internal.eligibility e
  WHERE e.organization_id=b.organization_id AND e.project_id=b.project_id AND e.indicator_id=b.indicator_id
  ORDER BY e.classification_revision DESC LIMIT 1) latest ON true
 WHERE b.rule_version_id=wanted_rule
  AND pathways_rules_internal.eligibility_metadata_scope(b.organization_id,b.project_id) IS TRUE
$$;
CREATE FUNCTION pathways_rules_internal.validate_preview_input(input jsonb,recommendation_route boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE permitted text[];base jsonb;
BEGIN
 permitted:=CASE WHEN recommendation_route THEN ARRAY['expectedAlertRevision'] ELSE ARRAY['recommendationId','expectedRecommendationRevision'] END;
 IF input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object'
  OR (input-(ARRAY['expectedRevision','note','clientOperationId','outcome']||permitted))<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'outcome') IS DISTINCT FROM 'string'
  OR input->>'outcome' NOT IN ('ACCEPT','PARTIALLY_ACCEPT','DECLINE','ESCALATE') THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 base:=input-('outcome'::text)-permitted;PERFORM pathways_rules_internal.validate_review_input(base,false);
 IF recommendation_route AND input->>'outcome' IN ('ACCEPT','PARTIALLY_ACCEPT') AND NOT input ? 'expectedAlertRevision' THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF NOT recommendation_route AND ((input ? 'recommendationId') IS DISTINCT FROM (input ? 'expectedRecommendationRevision')) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF input ? 'recommendationId' THEN
  IF pg_catalog.jsonb_typeof(input->'recommendationId') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
  PERFORM (input->>'recommendationId')::uuid;
 END IF;
 IF input ? 'expectedAlertRevision' THEN PERFORM pathways_rules_internal.validate_review_input(
  pg_catalog.jsonb_set(base,'{expectedRevision}',input->'expectedAlertRevision'),false); END IF;
 IF input ? 'expectedRecommendationRevision' THEN PERFORM pathways_rules_internal.validate_review_input(
  pg_catalog.jsonb_set(base,'{expectedRevision}',input->'expectedRecommendationRevision'),false); END IF;
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;


-- resource-freshness.proposed.sql
-- Proposed0031 dependency-specific metadata fingerprint. No numeric/notes read.
-- Metadata owner policies allow current whole-resource human scope or validated
-- CAPTURE/COMMIT lease scope, never broad worker queries before marker install.
CREATE FUNCTION pathways_rules_internal.rule_dependency_fingerprint(wanted uuid,as_of timestamptz)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;project uuid;calendar_version bigint;day date;binding record;dependencies jsonb:='[]';part jsonb;
BEGIN
 SELECT r.organization_id,r.project_id INTO org,project FROM pathways.alert_rules r
  WHERE r.id=wanted AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR project IS NULL OR as_of IS NULL OR as_of>pg_catalog.clock_timestamp()
  OR ((session_user='pathways_runtime' AND pathways_rules_internal.rule_exposure_allowed(wanted) IS TRUE)
   OR (session_user='pathways_rules_worker' AND pathways_rules_internal.lease_metric_scope(org,project) IS TRUE)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Rule dependency unavailable' USING ERRCODE='42501'; END IF;
 SELECT c.version,(as_of AT TIME ZONE c.zone)::date INTO calendar_version,day
  FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules calendar unavailable' USING ERRCODE='55000'; END IF;
 FOR binding IN SELECT b.condition_id,b.metric_key,b.indicator_id,b.activity_id,b.definition_revision,b.source_fingerprint
  FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=org AND b.project_id=project
   AND b.rule_version_id=wanted ORDER BY b.condition_id LOOP
  IF binding.metric_key IN ('PROJECT_TIMELINE_ELAPSED_PERCENT','PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS') THEN
   SELECT pg_catalog.jsonb_build_object('id',p.id,'start',p.start_date,'end',p.end_date,'status',p.status,'archivedAt',p.archived_at)
    INTO part FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  ELSIF binding.metric_key IN ('ACTIVITY_OVERDUE_COUNT','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_DAYS') THEN
   SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'status',a.status,
    'plannedEnd',a.planned_end_date,'archivedAt',a.archived_at) ORDER BY a.id),'[]'::jsonb) INTO part
    FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project
     AND (binding.activity_id IS NULL OR a.id=binding.activity_id);
  ELSE
   SELECT pg_catalog.jsonb_build_object('definitionRevision',binding.definition_revision,
    'definitionFingerprint',pg_catalog.encode(binding.source_fingerprint,'hex'),'measurementMode',i.measurement_mode,
    'measurementId',CASE WHEN i.measurement_mode='MANUAL' THEN (
     SELECT m.id FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
      AND m.indicator_id=binding.indicator_id AND m.recorded_at<=as_of
      AND m.period_start=i.period_start AND m.period_end=i.period_end
      AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements successor
       WHERE successor.organization_id=m.organization_id AND successor.project_id=m.project_id
        AND successor.indicator_id=m.indicator_id AND successor.corrects_measurement_id=m.id AND successor.recorded_at<=as_of)
     ORDER BY m.period_end DESC,m.recorded_at DESC,m.id DESC LIMIT 1) ELSE NULL END,
    'derivedActivities',CASE WHEN i.measurement_mode='DERIVED' THEN (
     SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'status',a.status,
      'plannedEnd',a.planned_end_date,'archivedAt',a.archived_at) ORDER BY a.id),'[]'::jsonb)
      FROM pathways.project_activities a WHERE a.organization_id=org AND a.project_id=project
       AND a.archived_at IS NULL AND a.status<>'CANCELLED' AND a.planned_end_date BETWEEN i.period_start AND i.period_end) ELSE NULL END)
    INTO part FROM pathways.project_indicators i WHERE i.id=binding.indicator_id AND i.organization_id=org AND i.project_id=project;
  END IF;
  dependencies:=dependencies||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'conditionId',binding.condition_id,'metric',binding.metric_key,'dependency',part));
 END LOOP;
 RETURN pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'calendarVersion',calendar_version::text,'reportingDate',day,'dependencies',dependencies)::text,'UTF8'));
END $$;
ALTER FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz)
 TO rules_projection_owner,rules_commit_owner;

CREATE FUNCTION pathways_rules_internal.resource_freshness(wanted_alert uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;project uuid;rule uuid;active boolean;superseded boolean;snapshot uuid;fingerprint text;
BEGIN
 SELECT a.organization_id,a.project_id,a.rule_id,r.status='ACTIVE',e.superseded,a.origin_snapshot_id
  INTO org,project,rule,active,superseded,snapshot FROM pathways.rule_based_alerts a
  JOIN pathways.alert_rules r ON r.id=a.rule_id AND r.organization_id=a.organization_id AND r.project_id=a.project_id
  JOIN pathways_rules_internal.evaluations e ON e.id=a.latest_evaluation_id AND e.organization_id=a.organization_id AND e.project_id=a.project_id
  WHERE a.id=wanted_alert AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1';
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR (pathways.p06_can('alerts.read',project) IS TRUE OR (pathways.p06_can('recommendations.read',project) IS TRUE
   AND EXISTS(SELECT FROM pathways.decision_recommendations d WHERE d.organization_id=org AND d.project_id=project
    AND d.alert_id=wanted_alert AND d.runtime_contract_version='f10.v1'))) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(rule) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF NOT active OR superseded THEN RETURN 'SUPERSEDED'; END IF;
 SELECT s.source_inputs->'resourceFingerprints'->>rule::text INTO fingerprint FROM pathways_rules_internal.snapshots s
  WHERE s.id=snapshot AND s.organization_id=org AND s.project_id=project;
 IF fingerprint IS NULL OR fingerprint IS DISTINCT FROM pg_catalog.encode(
  pathways_rules_internal.rule_dependency_fingerprint(rule,pg_catalog.clock_timestamp()),'hex') THEN
  RETURN 'SOURCE_CHANGED'; END IF;
 RETURN 'CURRENT';
END $$;
ALTER FUNCTION pathways_rules_internal.resource_freshness(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.resource_freshness(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.resource_freshness(uuid) TO rules_human_owner,rules_outcome_owner;


-- human-read.proposed.sql
-- Proposed0031 fixed human read routines, not installed/executed.
-- All definer owners are NOLOGIN/NOBYPASSRLS and depend on scoped FORCE RLS.
CREATE FUNCTION pathways_rules_internal.rule_json(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',r.id,'projectId',r.project_id,'logicalRuleId',r.logical_rule_id,
  'templateOriginId',r.template_origin_id,'code',r.display_code,'version',r.version,'name',r.name,'severity',r.severity,
  'conditions',r.conditions_json,'recommendations',COALESCE((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text) ORDER BY t.id)
   FROM pathways.alert_rule_recommendations t WHERE t.organization_id=r.organization_id AND t.rule_id=r.id),'[]'::jsonb),
  'status',r.status,'activatedAt',r.activated_at,'archivedAt',r.archived_at)
 FROM pathways.alert_rules r WHERE r.id=wanted AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND r.runtime_contract_version='f10.v1'
$$;
CREATE FUNCTION pathways.f10_rule_get(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project uuid; result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' OR pathways.p09_can('rules.read') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT r.project_id INTO project FROM pathways.alert_rules r WHERE r.id=wanted
  AND r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND r.runtime_contract_version='f10.v1';
 IF NOT FOUND OR (project IS NOT NULL AND (pathways.p06_can('rules.read',project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(wanted) IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 result:=pathways_rules_internal.rule_json(wanted);
 IF result IS NULL THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION pathways_rules_internal.read_page_input(input jsonb,extra_keys text[])
RETURNS TABLE(page_limit integer,after_id uuid,project uuid)
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object'
  OR (input-(ARRAY['limit','cursor','projectId']||extra_keys))<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'limit') IS DISTINCT FROM 'number'
  OR (input->>'limit') !~ '^[0-9]+$' OR (input->>'limit')::integer NOT BETWEEN 1 AND 100
  OR (input ? 'cursor' AND pg_catalog.jsonb_typeof(input->'cursor') IS DISTINCT FROM 'string')
  OR (input ? 'projectId' AND pg_catalog.jsonb_typeof(input->'projectId') IS DISTINCT FROM 'string') THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT (input->>'limit')::integer,(input->>'cursor')::uuid,(input->>'projectId')::uuid;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;

CREATE FUNCTION pathways.f10_rule_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record; ids uuid[]; items jsonb; next_id uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' OR pathways.p09_can('rules.read') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY['kind']);
 IF input ? 'kind' AND (input->>'kind' IS NULL OR input->>'kind' NOT IN ('PROJECT','TEMPLATE')) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF page.project IS NOT NULL AND pathways.p06_can('rules.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.array_agg(q.id ORDER BY q.id) INTO ids FROM (
  SELECT r.id FROM pathways.alert_rules r WHERE r.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND r.runtime_contract_version='f10.v1' AND (page.project IS NULL OR r.project_id=page.project)
   AND (page.after_id IS NULL OR r.id>page.after_id)
   AND (NOT input ? 'kind' OR (input->>'kind'='TEMPLATE' AND r.project_id IS NULL)
    OR (input->>'kind'='PROJECT' AND r.project_id IS NOT NULL))
   AND (r.project_id IS NULL OR (pathways.p06_can('rules.read',r.project_id) IS TRUE
    AND pathways_rules_internal.rule_exposure_allowed(r.id) IS TRUE))
  ORDER BY r.id LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.rule_json(id) ORDER BY id),'[]'::jsonb) INTO items
  FROM pg_catalog.unnest(ids[1:page.page_limit]) id;
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;

CREATE FUNCTION pathways_rules_internal.alert_json(wanted uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',a.id,'projectId',a.project_id,'ruleId',a.rule_id,'ruleVersion',r.version,
  'title',a.title,'explanation',a.message,'severity',a.severity,'lifecycle',a.lifecycle,'revision',a.revision::text,
  'evaluatedAt',a.evaluated_at,'freshness',pathways_rules_internal.resource_freshness(a.id),
  'conditions',r.conditions_json,'asOf',a.evaluated_snapshot->'asOf',
  'reportingDate',a.evaluated_snapshot->'reportingDate','calendar',a.evaluated_snapshot->'calendar',
  'evidence',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'conditionId',leaf->>'conditionId','metric',leaf->>'metric','operator',leaf->>'operator',
   'threshold',leaf->>'threshold','thresholdMaximum',leaf->>'thresholdMaximum',
   'cell',pg_catalog.jsonb_build_object('state',leaf->'cell'->>'state','value',leaf->'cell'->'value','reason',leaf->'cell'->'reason'),
   'unit',leaf->>'unit','result',leaf->>'result') ORDER BY leaf->>'conditionId')
   FROM pg_catalog.jsonb_array_elements(a.evaluated_snapshot->'conditions') leaf),'[]'::jsonb),
  'predefinedRecommendations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',t.id,'title',t.title,'text',t.text) ORDER BY t.id) FROM pathways.alert_rule_recommendations t
   WHERE t.organization_id=a.organization_id AND t.rule_id=a.rule_id),'[]'::jsonb),
  'linkedRecommendationIds',CASE WHEN pathways.p06_can('recommendations.read',a.project_id) IS TRUE THEN
   COALESCE((SELECT pg_catalog.jsonb_agg(d.id ORDER BY d.id) FROM pathways.decision_recommendations d
    WHERE d.organization_id=a.organization_id AND d.project_id=a.project_id AND d.alert_id=a.id
     AND d.runtime_contract_version='f10.v1'),'[]'::jsonb) ELSE '[]'::jsonb END)
 FROM pathways.rule_based_alerts a JOIN pathways.alert_rules r ON r.organization_id=a.organization_id AND r.id=a.rule_id
 WHERE a.id=wanted AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1'
$$;
CREATE FUNCTION pathways.f10_alert_get(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pathways_rules_internal.alert_json(a.id) INTO result FROM pathways.rule_based_alerts a
  WHERE a.id=wanted AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND a.runtime_contract_version='f10.v1' AND pathways.p06_can('alerts.read',a.project_id) IS TRUE
   AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE;
 IF NOT FOUND OR result IS NULL THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION pathways.f10_alert_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record; ids uuid[]; items jsonb; next_id uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY['status']);
 IF input ? 'status' AND (input->>'status' IS NULL OR input->>'status' NOT IN ('NEW','REVIEWED','ACTIONED','RESOLVED','DISMISSED','AUTO_RESOLVED')) THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF page.project IS NOT NULL AND pathways.p06_can('alerts.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.array_agg(q.id ORDER BY q.id) INTO ids FROM (
  SELECT a.id FROM pathways.rule_based_alerts a WHERE a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND a.runtime_contract_version='f10.v1' AND (page.project IS NULL OR a.project_id=page.project)
   AND (page.after_id IS NULL OR a.id>page.after_id) AND (NOT input ? 'status' OR a.lifecycle=input->>'status')
   AND pathways.p06_can('alerts.read',a.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
  ORDER BY a.id LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.alert_json(id) ORDER BY id),'[]'::jsonb) INTO items
  FROM pg_catalog.unnest(ids[1:page.page_limit]) id;
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;

CREATE FUNCTION pathways_rules_internal.recommendation_json(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',d.id,'projectId',d.project_id,'alertId',d.alert_id,'ruleId',a.rule_id,
  'title',d.title,'text',d.text,'basis',d.basis,'status',d.status,'revision',d.revision::text,
  'proposedAt',d.proposed_at,'reviewedAt',d.reviewed_at)
 FROM pathways.decision_recommendations d JOIN pathways.rule_based_alerts a
  ON a.organization_id=d.organization_id AND a.project_id=d.project_id AND a.id=d.alert_id
 WHERE d.id=wanted AND d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND d.runtime_contract_version='f10.v1'
$$;
CREATE FUNCTION pathways.f10_recommendation_get(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pathways_rules_internal.recommendation_json(d.id) INTO result FROM pathways.decision_recommendations d
  JOIN pathways.rule_based_alerts a ON a.organization_id=d.organization_id AND a.project_id=d.project_id AND a.id=d.alert_id
  WHERE d.id=wanted AND d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND d.runtime_contract_version='f10.v1' AND pathways.p06_can('recommendations.read',d.project_id) IS TRUE
   AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE;
 IF NOT FOUND OR result IS NULL THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION pathways.f10_recommendation_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record; ids uuid[]; items jsonb; next_id uuid; alert uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY['alertId']);
 alert:=(input->>'alertId')::uuid;
 IF page.project IS NOT NULL AND pathways.p06_can('recommendations.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.array_agg(q.id ORDER BY q.id) INTO ids FROM (
  SELECT d.id FROM pathways.decision_recommendations d JOIN pathways.rule_based_alerts a
   ON a.organization_id=d.organization_id AND a.project_id=d.project_id AND a.id=d.alert_id
  WHERE d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND d.runtime_contract_version='f10.v1'
   AND (page.project IS NULL OR d.project_id=page.project) AND (alert IS NULL OR d.alert_id=alert)
   AND (page.after_id IS NULL OR d.id>page.after_id)
   AND pathways.p06_can('recommendations.read',d.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
  ORDER BY d.id LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.recommendation_json(id) ORDER BY id),'[]'::jsonb) INTO items
  FROM pg_catalog.unnest(ids[1:page.page_limit]) id;
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
-- Exact function owners/EXECUTE and per-column FORCE-RLS policy installation
-- is applied atomically in final authority section, never via PUBLIC defaults.


-- human-history.proposed.sql
-- Proposed0031 safe alert episode history; never returns note/actor identity.
CREATE FUNCTION pathways_rules_internal.safe_evidence(evidence jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'conditionId',leaf->>'conditionId','metric',leaf->>'metric','operator',leaf->>'operator',
  'threshold',leaf->>'threshold','thresholdMaximum',leaf->>'thresholdMaximum',
  'cell',pg_catalog.jsonb_build_object('state',leaf->'cell'->>'state','value',leaf->'cell'->'value','reason',leaf->'cell'->'reason'),
  'unit',leaf->>'unit','result',leaf->>'result') ORDER BY leaf->>'conditionId'),'[]'::jsonb)
 FROM pg_catalog.jsonb_array_elements(COALESCE(evidence->'conditions','[]'::jsonb)) leaf
$$;
CREATE FUNCTION pathways.f10_alert_history(wanted uuid,input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record;page record;items jsonb;next_id uuid;cursor_at timestamptz;next_episode timestamptz;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT a.organization_id,a.project_id,a.rule_id,a.affected_kind,a.affected_id,a.episode_number,a.evaluated_at
  INTO target FROM pathways.rule_based_alerts a WHERE a.id=wanted
  AND a.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND a.runtime_contract_version='f10.v1'
  AND pathways.p06_can('alerts.read',a.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY[]::text[]);
 SELECT min(a.evaluated_at) INTO next_episode FROM pathways.rule_based_alerts a WHERE a.organization_id=target.organization_id
  AND a.project_id=target.project_id AND a.rule_id=target.rule_id AND a.affected_kind=target.affected_kind
  AND a.affected_id=target.affected_id AND a.episode_number>target.episode_number AND a.runtime_contract_version='f10.v1';
 -- Cursor resolves only within this authorized episode's exact history.
 WITH history AS (
  SELECT e.id,s.as_of AS occurred_at,'SYSTEM'::text AS actor_kind,
   CASE WHEN e.superseded THEN 'SUPERSEDED' ELSE 'EVALUATED' END::text AS kind,
   NULL::text AS lifecycle,NULL::text AS outcome,r.version,
   CASE e.result WHEN 'TRUE' THEN 'Rule conditions matched.' WHEN 'FALSE' THEN 'Rule conditions did not match.' ELSE 'A required metric was unavailable.' END::text AS explanation,
   e.result,pathways_rules_internal.safe_evidence(e.evidence) AS evidence
  FROM pathways_rules_internal.evaluations e JOIN pathways_rules_internal.snapshots s
   ON s.id=e.snapshot_id AND s.organization_id=e.organization_id AND s.project_id=e.project_id
  JOIN pathways.alert_rules r ON r.id=e.rule_version_id AND r.organization_id=e.organization_id
  WHERE e.organization_id=target.organization_id AND e.project_id=target.project_id AND e.rule_version_id=target.rule_id
   AND e.affected_kind=target.affected_kind AND e.affected_id=target.affected_id AND s.as_of>=target.evaluated_at
   AND (next_episode IS NULL OR s.as_of<next_episode)
  UNION ALL
  SELECT h.id,h.occurred_at,h.actor_kind,CASE WHEN h.state_after='NEW' THEN 'CREATED' ELSE h.state_after END,h.state_after,NULL,r.version,
   'Alert lifecycle changed.'::text,NULL,'[]'::jsonb FROM pathways_rules_internal.lifecycle_events h
  JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE h.organization_id=target.organization_id AND h.project_id=target.project_id AND h.alert_id=wanted
  UNION ALL
  SELECT h.id,h.occurred_at,'HUMAN','REVIEWED',h.state_after,NULL,r.version,'Alert reviewed.',NULL,'[]'::jsonb
  FROM pathways_rules_internal.alert_reviews h JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE h.organization_id=target.organization_id AND h.project_id=target.project_id AND h.alert_id=wanted
  UNION ALL
  SELECT d.id,d.created_at,'HUMAN','OUTCOME',NULL,d.outcome,r.version,'A management outcome was recorded.',NULL,'[]'::jsonb
  FROM pathways_rules_internal.decisions d JOIN pathways.alert_rules r ON r.id=target.rule_id AND r.organization_id=target.organization_id
  WHERE d.organization_id=target.organization_id AND d.project_id=target.project_id AND d.alert_id=wanted
 ), cursor_row AS (SELECT occurred_at FROM history WHERE id=page.after_id), selected AS (
  SELECT h.*,row_number() OVER(ORDER BY h.occurred_at DESC,h.id DESC) AS position FROM history h
  WHERE page.after_id IS NULL OR (h.occurred_at,h.id)<((SELECT occurred_at FROM cursor_row),page.after_id)
  ORDER BY h.occurred_at DESC,h.id DESC LIMIT page.page_limit+1
 ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'occurredAt',occurred_at,
  'actorKind',actor_kind,'kind',kind,'lifecycle',lifecycle,'outcome',outcome,'ruleVersion',version,
  'explanation',explanation,'result',result,'evidence',evidence) ORDER BY occurred_at DESC,id DESC)
  FILTER(WHERE position<=page.page_limit),'[]'::jsonb),
  CASE WHEN count(*)>page.page_limit THEN (array_agg(id ORDER BY occurred_at DESC,id DESC))[page.page_limit] ELSE NULL END,
  (SELECT occurred_at FROM cursor_row) INTO items,next_id,cursor_at FROM selected;
 IF page.after_id IS NOT NULL AND cursor_at IS NULL THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_array_length(items)<page.page_limit THEN next_id:=NULL; END IF;
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;


-- human-notifications.proposed.sql
-- Proposed0031 native recipient inbox and current-safe delivery counts.
CREATE FUNCTION pathways_rules_internal.current_decision_delivery(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE project uuid;alert uuid;actor uuid;allowed jsonb;result jsonb;
BEGIN
 actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 SELECT d.project_id,d.alert_id INTO project,alert FROM pathways_rules_internal.decisions d
  WHERE d.id=wanted AND d.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND d.actor_id=actor;
 IF NOT FOUND OR pathways_rules_internal.feature_human_scope(nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 allowed:=pathways_rules_internal.outcome_recipients(nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid,project,actor);
 SELECT pg_catalog.jsonb_build_object('pending',count(*) FILTER(WHERE n.delivery_state='PENDING'),
  'delivered',count(*) FILTER(WHERE n.delivery_state='DELIVERED'),'failed',count(*) FILTER(WHERE n.delivery_state='FAILED'))
 INTO result FROM pathways_rules_internal.notifications n
 WHERE n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND n.project_id=project AND n.alert_id=alert AND n.decision_id=wanted
  AND n.recipient_id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(allowed));
 RETURN result;
END $$;
CREATE FUNCTION pathways_rules_internal.notification_json(wanted uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',n.id,'projectId',n.project_id,'alertId',n.alert_id,'message',n.message,
  'createdAt',n.created_at,'readAt',n.read_at,'deliveryState',n.delivery_state)
 FROM pathways_rules_internal.notifications n WHERE n.id=wanted AND n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND n.recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
$$;
CREATE FUNCTION pathways.f10_notification_list(input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page record;cursor_at timestamptz;ids uuid[];items jsonb;next_id uuid;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT * INTO page FROM pathways_rules_internal.read_page_input(input,ARRAY[]::text[]);
 IF page.project IS NOT NULL AND pathways.p06_can('alerts.read',page.project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF page.after_id IS NOT NULL THEN
  SELECT n.created_at INTO cursor_at FROM pathways_rules_internal.notifications n JOIN pathways.rule_based_alerts a
   ON a.id=n.alert_id AND a.organization_id=n.organization_id AND a.project_id=n.project_id
  WHERE n.id=page.after_id AND n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND n.recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND pathways.p06_can('alerts.read',n.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT pg_catalog.array_agg(q.id ORDER BY q.created_at DESC,q.id DESC) INTO ids FROM (
  SELECT n.id,n.created_at FROM pathways_rules_internal.notifications n JOIN pathways.rule_based_alerts a
   ON a.id=n.alert_id AND a.organization_id=n.organization_id AND a.project_id=n.project_id
  WHERE n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND n.recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND (page.project IS NULL OR n.project_id=page.project)
   AND (page.after_id IS NULL OR (n.created_at,n.id)<(cursor_at,page.after_id))
   AND pathways.p06_can('alerts.read',n.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
  ORDER BY n.created_at DESC,n.id DESC LIMIT page.page_limit+1) q;
 IF pg_catalog.cardinality(ids)>page.page_limit THEN next_id:=ids[page.page_limit]; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pathways_rules_internal.notification_json(id) ORDER BY position),'[]'::jsonb) INTO items
  FROM pg_catalog.unnest(ids[1:page.page_limit]) WITH ORDINALITY value(id,position);
 RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_id);
END $$;
CREATE FUNCTION pathways.f10_notification_read(wanted uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;project uuid;rule uuid;moment timestamptz(3);
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 SELECT n.project_id,a.rule_id INTO project,rule FROM pathways_rules_internal.notifications n JOIN pathways.rule_based_alerts a
  ON a.id=n.alert_id AND a.organization_id=n.organization_id AND a.project_id=n.project_id
 WHERE n.id=wanted AND n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND n.recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND pathways.p06_can('alerts.read',n.project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(a.rule_id) IS TRUE
 ;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 -- Classification writers and source/configuration mutations take state first.
 -- Protect scope/exposure through this inbox mutation using the same order.
 PERFORM 1 FROM pathways_rules_internal.project_state s WHERE s.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND s.project_id=project AND s.bootstrap_complete FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM pathways_rules_internal.notifications n WHERE n.id=wanted
  AND n.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND n.project_id=project
  AND n.recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid FOR NO KEY UPDATE;
 IF NOT FOUND OR pathways.p06_can('alerts.read',project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(rule) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
 UPDATE pathways_rules_internal.notifications SET read_at=moment WHERE id=wanted
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND read_at IS NULL;
 result:=pathways_rules_internal.notification_json(wanted);
 IF result IS NULL THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;


-- configuration-helpers.proposed.sql
-- Proposed0031 private configuration helpers. Not installed or executed.
CREATE FUNCTION pathways_rules_internal.install_configuration_intent(relation oid,before_row jsonb,after_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker pathways_rules_internal.configuration_context; permission text; parent uuid;
BEGIN
 SELECT c.* INTO marker FROM pathways_rules_internal.configuration_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 permission:=CASE marker.operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update'
  WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END;
 IF NOT FOUND OR session_user<>'pathways_runtime' OR permission IS NULL
  OR pathways.p09_can(permission) IS DISTINCT FROM true
  OR (marker.project_id IS NOT NULL AND pathways.p06_can(permission,marker.project_id) IS DISTINCT FROM true)
  OR relation NOT IN ('pathways.alert_rules'::regclass,'pathways.alert_rule_recommendations'::regclass)
  OR after_row IS NULL OR pg_catalog.jsonb_typeof(after_row)<>'object'
  OR (before_row IS NOT NULL AND pg_catalog.jsonb_typeof(before_row)<>'object')
  OR after_row->>'organization_id' IS DISTINCT FROM marker.organization_id::text THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 IF relation='pathways.alert_rules'::regclass THEN
  IF after_row->>'project_id' IS DISTINCT FROM marker.project_id::text
   OR after_row->>'id' IS NULL
   OR ((after_row->>'id')::uuid IS DISTINCT FROM marker.target_rule_id
    AND (after_row->>'id')::uuid IS DISTINCT FROM marker.predecessor_rule_id) THEN
   RAISE EXCEPTION 'Configuration target unavailable' USING ERRCODE='42501'; END IF;
 ELSE
  parent:=(after_row->>'rule_id')::uuid;
  IF before_row IS NOT NULL OR marker.operation_code NOT IN ('RULE_CREATE','RULE_DRAFT')
   OR parent IS DISTINCT FROM marker.target_rule_id OR NOT EXISTS(SELECT FROM pathways.alert_rules r
    WHERE r.id=parent AND r.organization_id=marker.organization_id AND r.project_id IS NOT DISTINCT FROM marker.project_id
     AND r.runtime_contract_version='f10.v1' AND r.status='DRAFT' AND r.created_by_id=marker.actor_id) THEN
   RAISE EXCEPTION 'Configuration template unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO pathways_rules_internal.runtime_mutation_intents
 (transaction_id,backend_pid,login_name,purpose,organization_id,project_id,operation_id,relation_oid,action,record_id,expected_old,expected_new)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,'CONFIGURATION',marker.organization_id,
  marker.project_id,marker.operation_id,relation,CASE WHEN before_row IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
  (after_row->>'id')::uuid,before_row,after_row);
END $$;
ALTER FUNCTION pathways_rules_internal.install_configuration_intent(oid,jsonb,jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_configuration_intent(oid,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.build_configuration_bindings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker pathways_rules_internal.configuration_context; tree jsonb; leaf jsonb;
 indicator pathways.project_indicators; source pathways.project_indicator_bindings;
 approval pathways_rules_internal.eligibility; fingerprint bytea; count_leaves integer:=0;
BEGIN
 SELECT c.* INTO marker FROM pathways_rules_internal.configuration_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_code IN ('RULE_CREATE','RULE_DRAFT');
 IF NOT FOUND OR marker.project_id IS NULL OR session_user<>'pathways_runtime'
  OR pathways.p06_can(CASE marker.operation_code WHEN 'RULE_CREATE' THEN 'rules.create' ELSE 'rules.update' END,marker.project_id) IS DISTINCT FROM true
  OR EXISTS(SELECT FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=marker.organization_id
   AND b.project_id=marker.project_id AND b.rule_version_id=marker.target_rule_id) THEN
  RAISE EXCEPTION 'Rule bindings unavailable' USING ERRCODE='42501'; END IF;
 SELECT r.conditions_json INTO tree FROM pathways.alert_rules r WHERE r.id=marker.target_rule_id
  AND r.organization_id=marker.organization_id AND r.project_id=marker.project_id AND r.runtime_contract_version='f10.v1'
  AND r.status='DRAFT' AND r.activated_at IS NULL AND r.created_by_id=marker.actor_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule bindings unavailable' USING ERRCODE='42501'; END IF;
 FOR leaf IN WITH RECURSIVE nodes(value,depth) AS (
  SELECT tree,0 UNION ALL SELECT child.value,n.depth+1 FROM nodes n CROSS JOIN LATERAL
   pg_catalog.jsonb_array_elements(CASE WHEN n.value->>'kind'='GROUP' AND n.depth<4
    THEN n.value->'children' ELSE '[]'::jsonb END) child
 ) SELECT value FROM nodes WHERE value->>'kind'='CONDITION' ORDER BY value->>'id' LOOP
  count_leaves:=count_leaves+1; indicator:=NULL; source:=NULL; approval:=NULL; fingerprint:=NULL;
  IF leaf->>'metric' IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT') THEN
   -- Retrieve metadata columns only: numeric values and labels are never read here.
   SELECT i.id,i.organization_id,i.project_id,i.revision,i.measurement_mode,i.numeric_kind,i.archived_at
    INTO indicator.id,indicator.organization_id,indicator.project_id,indicator.revision,
     indicator.measurement_mode,indicator.numeric_kind,indicator.archived_at
    FROM pathways.project_indicators i WHERE i.id=(leaf->>'indicatorId')::uuid
     AND i.organization_id=marker.organization_id AND i.project_id=marker.project_id;
   IF NOT FOUND OR indicator.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The rule source is unavailable.' USING ERRCODE='42501'; END IF;
   SELECT b.id,b.recipe,b.activity_id,b.contract_version INTO source.id,source.recipe,source.activity_id,source.contract_version
    FROM pathways.project_indicator_bindings b WHERE b.indicator_id=indicator.id
     AND b.organization_id=marker.organization_id AND b.project_id=marker.project_id;
   IF ((indicator.measurement_mode='MANUAL' AND source.id IS NULL)
    OR (indicator.measurement_mode='DERIVED' AND indicator.numeric_kind='PERCENTAGE'
     AND source.recipe='ACTIVITY_COMPLETION_PERCENTAGE' AND source.contract_version='p06.v1' AND source.activity_id IS NULL)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The rule source is unavailable.' USING ERRCODE='42501'; END IF;
   fingerprint:=pathways_rules_internal.indicator_source_fingerprint(indicator.id,indicator.revision,
    indicator.measurement_mode,indicator.numeric_kind,source.recipe,source.activity_id,source.contract_version);
   SELECT e.id,e.decision,e.audience,e.approved_at,e.expires_at,e.definition_revision,e.source_fingerprint
    INTO approval.id,approval.decision,approval.audience,approval.approved_at,approval.expires_at,approval.definition_revision,approval.source_fingerprint
    FROM pathways_rules_internal.eligibility e WHERE e.organization_id=marker.organization_id
    AND e.project_id=marker.project_id AND e.indicator_id=indicator.id ORDER BY e.classification_revision DESC LIMIT 1;
   IF NOT FOUND OR approval.decision<>'ALLOWED_NON_SENSITIVE'
    OR approval.audience<>'ALL_AUTHORIZED_INTERNAL_ALERT_READERS' OR approval.approved_at>pg_catalog.clock_timestamp()
    OR (approval.expires_at IS NOT NULL AND approval.expires_at<=pg_catalog.clock_timestamp())
    OR approval.definition_revision IS DISTINCT FROM indicator.revision OR approval.source_fingerprint IS DISTINCT FROM fingerprint THEN
    RAISE EXCEPTION 'The rule source is unavailable.' USING ERRCODE='42501'; END IF;
  ELSIF leaf->>'metric'='ACTIVITY_OVERDUE_DAYS' AND NOT EXISTS(SELECT FROM pathways.project_activities a
   WHERE a.id=(leaf->>'activityId')::uuid AND a.organization_id=marker.organization_id AND a.project_id=marker.project_id) THEN
   RAISE EXCEPTION 'The rule source is unavailable.' USING ERRCODE='42501';
  END IF;
  INSERT INTO pathways_rules_internal.rule_bindings
  (organization_id,project_id,rule_version_id,condition_id,metric_key,indicator_id,activity_id,definition_revision,classification_id,source_fingerprint)
  VALUES(marker.organization_id,marker.project_id,marker.target_rule_id,leaf->>'id',leaf->>'metric',
   indicator.id,(leaf->>'activityId')::uuid,indicator.revision,approval.id,fingerprint);
 END LOOP;
 IF count_leaves NOT BETWEEN 1 AND 32 OR pathways_rules_internal.rule_exposure_allowed(marker.target_rule_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The rule source is unavailable.' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.build_configuration_bindings() OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.build_configuration_bindings()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.build_configuration_bindings() TO rules_config_owner;

CREATE FUNCTION pathways_rules_internal.supersede_rule_evaluations(wanted uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker pathways_rules_internal.configuration_context;
BEGIN
 SELECT c.* INTO marker FROM pathways_rules_internal.configuration_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
   AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE');
 IF NOT FOUND OR session_user<>'pathways_runtime' OR marker.project_id IS NULL
  OR (wanted IS DISTINCT FROM marker.predecessor_rule_id
   AND (marker.operation_code<>'RULE_ARCHIVE' OR wanted IS DISTINCT FROM marker.target_rule_id))
  OR pathways.p06_can(CASE marker.operation_code WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END,marker.project_id) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT FROM pathways.alert_rules r WHERE r.id=wanted AND r.organization_id=marker.organization_id
   AND r.project_id=marker.project_id AND r.status='ARCHIVED' AND r.runtime_contract_version='f10.v1')
  OR NOT EXISTS(SELECT FROM pathways_rules_internal.configuration_receipts o WHERE o.organization_id=marker.organization_id
   AND o.project_id=marker.project_id AND o.actor_id=marker.actor_id AND o.client_operation_id=marker.operation_id
   AND o.rule_id=marker.target_rule_id AND o.canonical_request_hash=marker.canonical_request_hash)
  OR NOT EXISTS(SELECT FROM pathways_rules_internal.project_state s WHERE s.organization_id=marker.organization_id
   AND s.project_id=marker.project_id AND s.required_generation=marker.admitted_generation+1
   AND s.source_watermark=marker.admitted_watermark) THEN
  RAISE EXCEPTION 'Rule supersession unavailable' USING ERRCODE='42501'; END IF;
 UPDATE pathways_rules_internal.evaluations e SET superseded=true WHERE e.organization_id=marker.organization_id
  AND e.project_id=marker.project_id AND e.rule_version_id=wanted AND NOT e.superseded;
END $$;
ALTER FUNCTION pathways_rules_internal.supersede_rule_evaluations(uuid) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.supersede_rule_evaluations(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- configuration-operations.proposed.sql
-- Proposed0031 fixed configuration operations. No runtime installation yet.
CREATE FUNCTION pathways_rules_internal.configuration_operation(wanted uuid,input jsonb,operation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;permission text;admitted record;target uuid;logical uuid;
 old_rule pathways.alert_rules;new_rule pathways.alert_rules;predecessor pathways.alert_rules;
 receipt pathways_rules_internal.configuration_receipts;moment timestamptz(3);op uuid;hash bytea;result jsonb;
 recommendation jsonb;templates jsonb:='[]';template pathways.alert_rule_recommendations;capacity integer;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 permission:=CASE operation WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_ACTIVATE' THEN 'rules.activate'
  WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ARCHIVE' THEN 'rules.update' ELSE NULL END;
 IF session_user<>'pathways_runtime' OR org IS NULL OR actor IS NULL OR permission IS NULL
  OR pathways.p09_can(permission) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 IF operation='RULE_CREATE' THEN project:=(input->>'projectId')::uuid;
 ELSE SELECT r.project_id INTO project FROM pathways.alert_rules r WHERE r.id=wanted
  AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
 END IF;
 -- This must precede all candidate validation, capacity and receipt behavior.
 IF project IS NOT NULL THEN
  PERFORM pathways.f10_bootstrap_project(project,operation);
  SELECT * INTO admitted FROM pathways_rules_internal.configuration_admission(org,project,operation);
 END IF;
 PERFORM pathways_rules_internal.validate_configuration_input(input,operation);
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object('resourceId',wanted,'body',input)::text,'UTF8'));
 SELECT o.* INTO receipt FROM pathways_rules_internal.configuration_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.project_id IS DISTINCT FROM project
   OR (operation<>'RULE_CREATE' AND receipt.rule_id IS DISTINCT FROM wanted AND operation<>'RULE_DRAFT')
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  -- Current resource exposure is still required before returning old response.
  IF project IS NOT NULL AND pathways_rules_internal.rule_exposure_allowed(receipt.rule_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501'; END IF;
  RETURN receipt.safe_result;
 END IF;
 IF operation<>'RULE_CREATE' THEN
  SELECT r.* INTO old_rule FROM pathways.alert_rules r WHERE r.id=wanted AND r.organization_id=org
   AND r.project_id IS NOT DISTINCT FROM project AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND OR old_rule.version<>(input->>'expectedVersion')::integer THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());target:=CASE WHEN operation IN ('RULE_CREATE','RULE_DRAFT') THEN pg_catalog.gen_random_uuid() ELSE wanted END;
 logical:=CASE WHEN operation='RULE_CREATE' THEN pg_catalog.gen_random_uuid() ELSE old_rule.logical_rule_id END;
 IF operation='RULE_CREATE' AND input ? 'templateId' AND NOT EXISTS(SELECT FROM pathways.alert_rules r
  WHERE r.id=(input->>'templateId')::uuid AND r.organization_id=org AND r.project_id IS NULL AND r.runtime_contract_version='f10.v1') THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF operation IN ('RULE_ACTIVATE','RULE_ARCHIVE') AND project IS NULL THEN
  RAISE EXCEPTION 'Copy an organization template into a project before activation.' USING ERRCODE='22023'; END IF;
 IF operation='RULE_ACTIVATE' THEN
  IF old_rule.status<>'DRAFT' OR old_rule.activated_at IS NOT NULL THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  SELECT r.* INTO predecessor FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project
   AND r.logical_rule_id=logical AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  SELECT count(*)::integer INTO capacity FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project AND r.status='ACTIVE';
  IF capacity>20 OR (capacity=20 AND predecessor.id IS NULL) THEN
   RAISE EXCEPTION 'The project already has20 active rules.' USING ERRCODE='40001'; END IF;
  IF pathways_rules_internal.rule_exposure_allowed(wanted) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The rule source changed. Create a new draft.' USING ERRCODE='40001'; END IF;
 ELSIF operation='RULE_ARCHIVE' AND old_rule.status<>'ACTIVE' THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 END IF;
 INSERT INTO pathways_rules_internal.configuration_context
 (transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,operation_id,operation_code,
 target_rule_id,predecessor_rule_id,canonical_request_hash,admitted_generation,admitted_watermark)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,org,project,actor,op,operation,
  target,predecessor.id,hash,CASE WHEN project IS NULL THEN NULL ELSE admitted.admitted_generation END,
  CASE WHEN project IS NULL THEN NULL ELSE admitted.admitted_watermark END);
 IF operation IN ('RULE_CREATE','RULE_DRAFT') THEN
  new_rule.id:=target;new_rule.organization_id:=org;new_rule.project_id:=project;new_rule.logical_rule_id:=logical;
  new_rule.runtime_contract_version:='f10.v1';new_rule.code:=CASE WHEN project IS NULL THEN 'F10T:'||logical::text ELSE 'F10P:'||project::text||':'||logical::text END;
  new_rule.display_code:=CASE WHEN operation='RULE_CREATE' THEN input->>'code' ELSE old_rule.display_code END;
  new_rule.version:=CASE WHEN operation='RULE_CREATE' THEN 1 ELSE old_rule.version+1 END;
  new_rule.template_origin_id:=CASE WHEN operation='RULE_CREATE' THEN (input->>'templateId')::uuid ELSE old_rule.template_origin_id END;
  new_rule.name:=pg_catalog.btrim(input->>'name');new_rule.type:='COMBINED_CONDITION';
  new_rule.match_mode:=CASE WHEN input->'conditions'->>'mode'='OR' THEN 'ANY' ELSE 'ALL' END;
  new_rule.severity:=(input->>'severity')::pathways.alert_severity;new_rule.status:='DRAFT';new_rule.conditions_json:=input->'conditions';
  new_rule.created_by_id:=actor;new_rule.created_at:=moment;new_rule.updated_at:=moment;
  FOR recommendation IN SELECT value FROM pg_catalog.jsonb_array_elements(input->'recommendations') LOOP
   templates:=templates||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
    'title',pg_catalog.btrim(recommendation->>'title'),'text',pg_catalog.btrim(recommendation->>'text')));
  END LOOP;
  new_rule.definition_digest:=pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
   'name',new_rule.name,'severity',new_rule.severity,'conditions',new_rule.conditions_json,'recommendations',templates)::text,'UTF8'));
  PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,NULL,pg_catalog.to_jsonb(new_rule));
  INSERT INTO pathways.alert_rules SELECT (new_rule).*;
  FOR recommendation IN SELECT value FROM pg_catalog.jsonb_array_elements(templates) LOOP
   template.id:=(recommendation->>'id')::uuid;template.organization_id:=org;template.rule_id:=target;
   template.title:=recommendation->>'title';template.text:=recommendation->>'text';template.type:='SUGGESTED_ACTION';
   template.created_by_id:=actor;template.created_at:=moment;template.updated_at:=moment;
   PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rule_recommendations'::regclass,NULL,pg_catalog.to_jsonb(template));
   INSERT INTO pathways.alert_rule_recommendations SELECT (template).*;
  END LOOP;
  IF project IS NOT NULL THEN PERFORM pathways_rules_internal.build_configuration_bindings(); END IF;
 ELSE
  IF predecessor.id IS NOT NULL THEN
   new_rule:=predecessor;new_rule.status:='ARCHIVED';new_rule.archived_at:=moment;new_rule.updated_at:=moment;
   PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,pg_catalog.to_jsonb(predecessor),pg_catalog.to_jsonb(new_rule));
   UPDATE pathways.alert_rules SET status='ARCHIVED',archived_at=moment,updated_at=moment
    WHERE id=predecessor.id AND organization_id=org AND project_id=project AND status='ACTIVE';
   IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  END IF;
  new_rule:=old_rule;new_rule.updated_at:=moment;
  IF operation='RULE_ACTIVATE' THEN new_rule.status:='ACTIVE';new_rule.activated_by_id:=actor;new_rule.activated_at:=moment;
  ELSE new_rule.status:='ARCHIVED';new_rule.archived_at:=moment; END IF;
  PERFORM pathways_rules_internal.install_configuration_intent('pathways.alert_rules'::regclass,pg_catalog.to_jsonb(old_rule),pg_catalog.to_jsonb(new_rule));
  UPDATE pathways.alert_rules SET status=new_rule.status,activated_by_id=new_rule.activated_by_id,
   activated_at=new_rule.activated_at,archived_at=new_rule.archived_at,updated_at=moment
   WHERE id=target AND organization_id=org AND project_id=project AND status=old_rule.status;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 END IF;
 result:=pathways_rules_internal.rule_json(target);
 INSERT INTO pathways_rules_internal.configuration_receipts
 (organization_id,project_id,actor_id,client_operation_id,operation_code,rule_id,canonical_request_hash,safe_result,private_note,occurred_at)
 VALUES(org,project,actor,op,operation,target,hash,result,CASE WHEN operation='RULE_ARCHIVE' THEN pg_catalog.btrim(input->>'note') ELSE NULL END,moment);
 IF operation IN ('RULE_ACTIVATE','RULE_ARCHIVE') THEN
  PERFORM pathways_rules_internal.enqueue_configuration_work();
  IF predecessor.id IS NOT NULL THEN PERFORM pathways_rules_internal.supersede_rule_evaluations(predecessor.id); END IF;
  IF operation='RULE_ARCHIVE' THEN PERFORM pathways_rules_internal.supersede_rule_evaluations(target); END IF;
 END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,'rule.'||pg_catalog.lower(pg_catalog.substring(operation,6)),'AlertRule',target,
  pg_catalog.jsonb_build_object('version',new_rule.version,'status',new_rule.status,'templateOriginId',new_rule.template_origin_id));
 IF pathways.p09_can(permission) IS DISTINCT FROM true OR (project IS NOT NULL AND pathways.p06_can(permission,project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Configuration context unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways_rules_internal.configuration_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.actor_id=actor AND c.operation_id=op;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configuration context unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 WHEN object_not_in_prerequisite_state THEN
  RAISE EXCEPTION 'Project rule configuration is unavailable under your current authority.' USING ERRCODE='42501';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
CREATE FUNCTION pathways.f10_rule_create(input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.configuration_operation(NULL,input,'RULE_CREATE')
$$;
CREATE FUNCTION pathways.f10_rule_draft(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.configuration_operation(wanted,input,'RULE_DRAFT')
$$;
CREATE FUNCTION pathways.f10_rule_activate(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.configuration_operation(wanted,input,'RULE_ACTIVATE')
$$;
CREATE FUNCTION pathways.f10_rule_archive(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.configuration_operation(wanted,input,'RULE_ARCHIVE')
$$;


-- outcome-preview.proposed.sql
-- Proposed0031 immutable five-minute human preview, fixed server write set.
CREATE FUNCTION pathways_rules_internal.outcome_preview_operation(wanted uuid,input jsonb,recommendation_route boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;alert uuid;recommendation uuid;op uuid;hash bytea;operation text;
 alert_row pathways.rule_based_alerts;rec_row pathways.decision_recommendations;
 receipt pathways_rules_internal.feature_operation_receipts;preview pathways_rules_internal.outcome_previews;
 write_alert boolean;write_recommendation boolean;recipients jsonb;moment timestamptz(3);message text;result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 operation:=CASE WHEN recommendation_route THEN 'RECOMMENDATION_PREVIEW' ELSE 'ALERT_PREVIEW' END;
 IF recommendation_route THEN
  SELECT r.project_id,r.alert_id INTO project,alert FROM pathways.decision_recommendations r
   WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';
  recommendation:=wanted;
 ELSE
  SELECT a.project_id,a.id INTO project,alert FROM pathways.rule_based_alerts a
   WHERE a.id=wanted AND a.organization_id=org AND a.runtime_contract_version='f10.v1';
  recommendation:=(input->>'recommendationId')::uuid;
 END IF;
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR pathways.p06_can(CASE WHEN recommendation_route THEN 'recommendations.outcome.record' ELSE 'alerts.outcome.record' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.validate_preview_input(input,recommendation_route);
 write_alert:=NOT recommendation_route OR input->>'outcome' IN ('ACCEPT','PARTIALLY_ACCEPT');
 write_recommendation:=recommendation IS NOT NULL;
 IF (write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 op:=(input->>'clientOperationId')::uuid;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,operation,alert,recommendation,NULL,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.alert_id IS DISTINCT FROM alert
   OR receipt.recommendation_id IS DISTINCT FROM recommendation OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result;PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 -- Deterministic resource lock order under already protected state: alert, rec.
 SELECT a.* INTO alert_row FROM pathways.rule_based_alerts a WHERE a.id=alert AND a.organization_id=org
  AND a.project_id=project AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF recommendation IS NOT NULL THEN
  SELECT r.* INTO rec_row FROM pathways.decision_recommendations r WHERE r.id=recommendation AND r.organization_id=org
   AND r.project_id=project AND r.alert_id=alert AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 END IF;
 IF (write_alert AND alert_row.revision<>CASE WHEN recommendation_route THEN (input->>'expectedAlertRevision')::bigint ELSE (input->>'expectedRevision')::bigint END)
  OR (write_recommendation AND rec_row.revision<>CASE WHEN recommendation_route THEN (input->>'expectedRevision')::bigint ELSE (input->>'expectedRecommendationRevision')::bigint END) THEN
  RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(alert_row.rule_id) IS DISTINCT FROM true
  OR (write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 recipients:=pathways_rules_internal.outcome_recipients(org,project,actor);
 IF pg_catalog.jsonb_array_length(recipients)>1000 THEN
  RAISE EXCEPTION 'Notification recipient capacity exceeded.' USING ERRCODE='40001'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());preview.id:=pg_catalog.gen_random_uuid();
 message:='Management outcome: '||pg_catalog.lower(pg_catalog.replace(input->>'outcome','_',' '))||'. Alert: "'||pg_catalog.left(alert_row.title,160)||'".';
 preview.operation_kind:=CASE WHEN write_alert AND write_recommendation THEN 'COMBINED_OUTCOME' WHEN write_alert THEN 'ALERT_OUTCOME' ELSE 'RECOMMENDATION_OUTCOME' END;
 INSERT INTO pathways_rules_internal.outcome_previews
 (id,organization_id,project_id,actor_id,alert_id,recommendation_id,operation_kind,creating_operation_code,write_alert,write_recommendation,
 expected_alert_revision,expected_recommendation_revision,outcome,private_note,classification_fingerprint,recipient_fingerprint,
 request_digest,message,recipients,created_at,expires_at)
 VALUES(preview.id,org,project,actor,alert,recommendation,preview.operation_kind,operation,write_alert,write_recommendation,
 CASE WHEN write_alert THEN alert_row.revision ELSE NULL END,CASE WHEN write_recommendation THEN rec_row.revision ELSE NULL END,
 input->>'outcome',pg_catalog.btrim(input->>'note'),pathways_rules_internal.classification_fingerprint(alert_row.rule_id),
 pg_catalog.sha256(pg_catalog.convert_to(recipients::text,'UTF8')),hash,message,recipients,moment,moment+interval '5 minutes');
 result:=pg_catalog.jsonb_build_object('previewId',preview.id,'expiresAt',moment+interval '5 minutes','operationKind',preview.operation_kind,
  'alertRevision',CASE WHEN write_alert THEN alert_row.revision::text ELSE NULL END,
  'recommendationRevision',CASE WHEN write_recommendation THEN rec_row.revision::text ELSE NULL END,
  'outcome',input->>'outcome','message',message,'recipientCount',pg_catalog.jsonb_array_length(recipients));
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(org,project,actor,op,operation,alert,recommendation,preview.id,hash,result,moment);
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
CREATE FUNCTION pathways.f10_alert_preview(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.outcome_preview_operation(wanted,input,false)
$$;
CREATE FUNCTION pathways.f10_recommendation_preview(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.outcome_preview_operation(wanted,input,true)
$$;


-- outcome-confirm.proposed.sql
-- Proposed0031 exact immutable-preview confirmation and idempotent retry.
CREATE FUNCTION pathways_rules_internal.confirmation_preview_metadata(
 project uuid,alert uuid,recommendation uuid,preview uuid,recommendation_route boolean
) RETURNS TABLE(recommendation_id uuid,write_alert boolean,write_recommendation boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user<>'pathways_runtime' OR project IS NULL OR alert IS NULL OR preview IS NULL
  OR pathways.p06_can(CASE WHEN recommendation_route THEN 'recommendations.outcome.record' ELSE 'alerts.outcome.record' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.recommendation_id,p.write_alert,p.write_recommendation FROM pathways_rules_internal.outcome_previews p
  WHERE p.id=preview AND p.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND p.project_id=project
   AND p.alert_id=alert AND p.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND p.creating_operation_code=CASE WHEN recommendation_route THEN 'RECOMMENDATION_PREVIEW' ELSE 'ALERT_PREVIEW' END
   AND (NOT recommendation_route OR p.recommendation_id=recommendation)
   AND (NOT p.write_alert OR pathways.p06_can('alerts.outcome.record',project) IS TRUE)
   AND (NOT p.write_recommendation OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE);
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean) TO rules_outcome_owner;

CREATE FUNCTION pathways_rules_internal.outcome_confirm_operation(wanted uuid,input jsonb,recommendation_route boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;project uuid;alert uuid;recommendation uuid;preview_id uuid;op uuid;hash bytea;operation text;
 metadata record;preview pathways_rules_internal.outcome_previews;receipt pathways_rules_internal.feature_operation_receipts;
 old_alert pathways.rule_based_alerts;new_alert pathways.rule_based_alerts;
 old_rec pathways.decision_recommendations;new_rec pathways.decision_recommendations;
 recipients jsonb;moment timestamptz(3);decision uuid;result jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 operation:=CASE WHEN recommendation_route THEN 'RECOMMENDATION_CONFIRM' ELSE 'ALERT_CONFIRM' END;
 IF input IS NULL OR pg_catalog.jsonb_typeof(input)<>'object' OR NOT input ?& ARRAY['previewId','clientOperationId']
  OR (input-ARRAY['previewId','clientOperationId'])<>'{}'::jsonb
  OR pg_catalog.jsonb_typeof(input->'previewId') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(input->'clientOperationId') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023'; END IF;
 preview_id:=(input->>'previewId')::uuid;op:=(input->>'clientOperationId')::uuid;
 IF recommendation_route THEN
  SELECT r.project_id,r.alert_id INTO project,alert FROM pathways.decision_recommendations r
   WHERE r.id=wanted AND r.organization_id=org AND r.runtime_contract_version='f10.v1';recommendation:=wanted;
 ELSE
  SELECT a.project_id,a.id INTO project,alert FROM pathways.rule_based_alerts a
   WHERE a.id=wanted AND a.organization_id=org AND a.runtime_contract_version='f10.v1';
 END IF;
 IF NOT FOUND OR session_user<>'pathways_runtime'
  OR pathways.p06_can(CASE WHEN recommendation_route THEN 'recommendations.outcome.record' ELSE 'alerts.outcome.record' END,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 -- Separate read owner can retrieve only own preview target/write metadata,
 -- never private_note/recipients/hash. This prevents a pre-marker note policy.
 SELECT * INTO metadata FROM pathways_rules_internal.confirmation_preview_metadata(project,alert,recommendation,preview_id,recommendation_route);
 recommendation:=metadata.recommendation_id;hash:=pg_catalog.sha256(pg_catalog.convert_to(input::text,'UTF8'));
 PERFORM pathways_rules_internal.install_feature_context(project,operation,alert,recommendation,preview_id,op,hash);
 SELECT o.* INTO receipt FROM pathways_rules_internal.feature_operation_receipts o
  WHERE o.organization_id=org AND o.actor_id=actor AND o.client_operation_id=op;
 IF FOUND THEN
  IF receipt.operation_code IS DISTINCT FROM operation OR receipt.alert_id IS DISTINCT FROM alert
   OR receipt.recommendation_id IS DISTINCT FROM recommendation OR receipt.preview_id IS DISTINCT FROM preview_id
   OR receipt.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'The resource changed. Reload before retrying.' USING ERRCODE='40001'; END IF;
  result:=receipt.safe_result||pg_catalog.jsonb_build_object('delivery',pathways_rules_internal.current_decision_delivery((receipt.safe_result->>'decisionId')::uuid));
  PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
 END IF;
 SELECT a.* INTO old_alert FROM pathways.rule_based_alerts a WHERE a.id=alert AND a.organization_id=org
  AND a.project_id=project AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 IF recommendation IS NOT NULL THEN
  SELECT r.* INTO old_rec FROM pathways.decision_recommendations r WHERE r.id=recommendation AND r.organization_id=org
   AND r.project_id=project AND r.alert_id=alert AND r.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT p.* INTO preview FROM pathways_rules_internal.outcome_previews p WHERE p.id=preview_id
  AND p.organization_id=org AND p.project_id=project AND p.actor_id=actor AND p.alert_id=alert
  AND p.recommendation_id IS NOT DISTINCT FROM recommendation FOR NO KEY UPDATE;
 IF NOT FOUND OR preview.consumed_by_decision IS NOT NULL OR preview.expires_at<=pg_catalog.clock_timestamp()
  OR preview.write_alert IS DISTINCT FROM metadata.write_alert OR preview.write_recommendation IS DISTINCT FROM metadata.write_recommendation
  OR (preview.write_alert AND preview.expected_alert_revision<>old_alert.revision)
  OR (preview.write_recommendation AND preview.expected_recommendation_revision<>old_rec.revision) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(old_alert.rule_id) IS DISTINCT FROM true
  OR (preview.write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (preview.write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 recipients:=pathways_rules_internal.outcome_recipients(org,project,actor);
 IF pg_catalog.jsonb_array_length(recipients)>1000
  OR preview.classification_fingerprint IS DISTINCT FROM pathways_rules_internal.classification_fingerprint(old_alert.rule_id)
  OR preview.recipient_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(recipients::text,'UTF8')) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());decision:=pg_catalog.gen_random_uuid();
 new_alert:=old_alert;new_rec:=old_rec;
 IF preview.write_alert THEN
  new_alert.lifecycle:=CASE WHEN preview.outcome IN ('ACCEPT','PARTIALLY_ACCEPT')
   AND old_alert.lifecycle IN ('NEW','REVIEWED','ACTIONED') THEN 'ACTIONED' ELSE old_alert.lifecycle END;
  new_alert.revision:=old_alert.revision+1;new_alert.updated_at:=moment;
 END IF;
 IF preview.write_recommendation THEN new_rec.revision:=old_rec.revision+1;new_rec.updated_at:=moment; END IF;
 result:=pg_catalog.jsonb_build_object('decisionId',decision,'alertId',alert,'recommendationId',recommendation,
  'alertRevision',new_alert.revision::text,'recommendationRevision',CASE WHEN recommendation IS NULL THEN NULL ELSE new_rec.revision::text END,
  'lifecycle',new_alert.lifecycle,'outcome',preview.outcome,'recordedAt',moment,
  'delivery',pg_catalog.jsonb_build_object('pending',0,'delivered',pg_catalog.jsonb_array_length(recipients),'failed',0));
 receipt.id:=pg_catalog.gen_random_uuid();
 INSERT INTO pathways_rules_internal.feature_operation_receipts
 (id,organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at)
 VALUES(receipt.id,org,project,actor,op,operation,alert,recommendation,preview_id,hash,result,moment);
 INSERT INTO pathways_rules_internal.decisions
 (id,organization_id,project_id,alert_id,recommendation_id,actor_id,operation_receipt_id,outcome,note,client_operation_id,request_digest,created_at)
 VALUES(decision,org,project,alert,recommendation,actor,receipt.id,preview.outcome,preview.private_note,op,hash,moment);
 IF preview.write_alert AND new_alert.lifecycle IS DISTINCT FROM old_alert.lifecycle THEN
  INSERT INTO pathways_rules_internal.lifecycle_events
  (organization_id,project_id,alert_id,actor_kind,actor_id,state_before,state_after,operation_receipt_id,occurred_at)
  VALUES(org,project,alert,'HUMAN',actor,old_alert.lifecycle,new_alert.lifecycle,receipt.id,moment);
 END IF;
 IF preview.write_alert THEN
  PERFORM pathways_rules_internal.install_human_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
  UPDATE pathways.rule_based_alerts SET lifecycle=new_alert.lifecycle,revision=new_alert.revision,updated_at=moment
   WHERE id=alert AND organization_id=org AND project_id=project AND revision=old_alert.revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 END IF;
 IF preview.write_recommendation THEN
  PERFORM pathways_rules_internal.install_human_intent('pathways.decision_recommendations'::regclass,pg_catalog.to_jsonb(old_rec),pg_catalog.to_jsonb(new_rec));
  UPDATE pathways.decision_recommendations SET revision=new_rec.revision,updated_at=moment
   WHERE id=recommendation AND organization_id=org AND project_id=project AND revision=old_rec.revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 END IF;
 UPDATE pathways_rules_internal.outcome_previews SET consumed_by_decision=decision
  WHERE id=preview_id AND organization_id=org AND project_id=project AND actor_id=actor AND consumed_by_decision IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 -- Native delivery means durable placement in the recipient's in-app inbox,
 -- not email or read acknowledgement. No recipient note/body input is accepted.
 INSERT INTO pathways_rules_internal.notifications
  (organization_id,project_id,recipient_id,alert_id,decision_id,message,delivery_state,attempts,created_at)
 SELECT org,project,(value#>>'{}')::uuid,alert,decision,preview.message,'DELIVERED',1,moment
 FROM pg_catalog.jsonb_array_elements(recipients);
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,project,'decision.recorded','RuleDecision',decision,
  pg_catalog.jsonb_build_object('alertId',alert,'recommendationId',recommendation,'outcome',preview.outcome,
   'alertRevision',new_alert.revision::text,'recommendationRevision',CASE WHEN recommendation IS NULL THEN NULL ELSE new_rec.revision::text END));
 IF preview.expires_at<=pg_catalog.clock_timestamp()
  OR preview.recipient_fingerprint IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(
   pathways_rules_internal.outcome_recipients(org,project,actor)::text,'UTF8')) THEN
  RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001'; END IF;
 IF pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR pathways_rules_internal.rule_exposure_allowed(old_alert.rule_id) IS DISTINCT FROM true
  OR (preview.write_alert AND pathways.p06_can('alerts.outcome.record',project) IS DISTINCT FROM true)
  OR (preview.write_recommendation AND pathways.p06_can('recommendations.outcome.record',project) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'Resource access is unavailable.' USING ERRCODE='42501'; END IF;
 PERFORM pathways_rules_internal.remove_feature_context();RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'The resource changed. Request a new preview.' USING ERRCODE='40001';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed rules request.' USING ERRCODE='22023';
END $$;
CREATE FUNCTION pathways.f10_alert_confirm(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.outcome_confirm_operation(wanted,input,false)
$$;
CREATE FUNCTION pathways.f10_recommendation_confirm(wanted uuid,input jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.outcome_confirm_operation(wanted,input,true)
$$;


-- metric-projection.proposed.sql
-- Proposed0031 fixed eight-metric provider. Only validated lease scope, never
-- free SQL/form/beneficiary/journey/legacy-current-value retrieval.
CREATE FUNCTION pathways_rules_internal.project_metric_observation(
 org uuid,project uuid,metric text,indicator uuid,activity uuid,as_of timestamptz,day date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cell jsonb;current_cell jsonb;unit text;start_on date;end_on date;project_status text;archived timestamptz;
 definition record;actual numeric;population bigint;completed bigint;missing bigint;overdue bigint;days integer;
BEGIN
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true OR as_of IS NULL OR day IS NULL
  OR metric NOT IN ('INDICATOR_CURRENT_VALUE','INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT',
   'PROJECT_REMAINING_DAYS','PROJECT_OVERDUE_DAYS','ACTIVITY_COMPLETION_PERCENT','ACTIVITY_OVERDUE_COUNT','ACTIVITY_OVERDUE_DAYS')
  OR ((metric LIKE 'INDICATOR_%') IS DISTINCT FROM (indicator IS NOT NULL))
  OR ((metric='ACTIVITY_OVERDUE_DAYS') IS DISTINCT FROM (activity IS NOT NULL)) THEN
  RAISE EXCEPTION 'Metric projection unavailable' USING ERRCODE='42501'; END IF;
 IF metric LIKE 'INDICATOR_%' THEN
  unit:=CASE WHEN metric='INDICATOR_PROGRESS_PERCENT' THEN 'PERCENT' ELSE 'VALUE' END;
  IF pathways_rules_internal.lease_indicator_allowed(org,project,indicator) IS DISTINCT FROM true THEN
   cell:=pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED');
  ELSE
   SELECT i.measurement_mode,i.numeric_kind,i.direction,i.unit_label,i.baseline_value,i.target_value,i.period_start,i.period_end
    INTO definition FROM pathways.project_indicators i WHERE i.id=indicator AND i.organization_id=org AND i.project_id=project;
   IF NOT FOUND THEN RAISE EXCEPTION 'Indicator projection unavailable' USING ERRCODE='42501'; END IF;
   IF metric='INDICATOR_CURRENT_VALUE' THEN unit:=COALESCE(definition.unit_label,'VALUE'); END IF;
   IF definition.measurement_mode='MANUAL' THEN
    SELECT m.value INTO actual FROM pathways.project_indicator_measurements m WHERE m.organization_id=org AND m.project_id=project
     AND m.indicator_id=indicator AND m.period_start=definition.period_start AND m.period_end=definition.period_end AND m.recorded_at<=as_of
     AND NOT EXISTS(SELECT FROM pathways.project_indicator_measurements next_measurement WHERE next_measurement.organization_id=org
      AND next_measurement.project_id=project AND next_measurement.indicator_id=indicator AND next_measurement.corrects_measurement_id=m.id
      AND next_measurement.recorded_at<=as_of) ORDER BY m.recorded_at DESC,m.id DESC LIMIT 1;
    current_cell:=CASE WHEN actual IS NULL THEN pathways_rules_internal.unavailable_cell('NO_MEASUREMENT')
     ELSE pathways_rules_internal.numeric_cell(actual) END;
   ELSE
    SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED') INTO population,completed FROM pathways.project_activities a
     WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
      AND a.planned_end_date BETWEEN definition.period_start AND definition.period_end;
    IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
    current_cell:=CASE WHEN population=0 THEN pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR')
     ELSE pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER') END;
   END IF;
   IF current_cell->>'value' IS NOT NULL AND (
    definition.numeric_kind NOT IN ('COUNT','SIGNED_CHANGE','PERCENTAGE','RATIO','NON_NEGATIVE')
    OR (definition.numeric_kind<>'SIGNED_CHANGE' AND (current_cell->>'value')::numeric<0)
    OR (definition.numeric_kind='COUNT' AND (current_cell->>'value')::numeric<>pg_catalog.trunc((current_cell->>'value')::numeric))
    OR (definition.numeric_kind='PERCENTAGE' AND (current_cell->>'value')::numeric>100)) THEN
    current_cell:=pathways_rules_internal.unavailable_cell('INVALID_METRIC'); END IF;
   cell:=CASE WHEN metric='INDICATOR_CURRENT_VALUE' OR current_cell->>'value' IS NULL THEN current_cell
    ELSE pathways_rules_internal.progress_cell(current_cell->>'value',definition.baseline_value::text,
     definition.target_value::text,definition.direction) END;
  END IF;
 ELSIF metric LIKE 'PROJECT_%' THEN
  unit:=CASE WHEN metric='PROJECT_TIMELINE_ELAPSED_PERCENT' THEN 'PERCENT' ELSE 'DAYS' END;
  SELECT p.start_date,p.end_date,p.status::text,p.archived_at INTO start_on,end_on,project_status,archived
   FROM pathways.projects p WHERE p.organization_id=org AND p.id=project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project projection unavailable' USING ERRCODE='42501'; END IF;
  IF archived IS NOT NULL OR project_status NOT IN ('PLANNED','ONGOING') THEN
   cell:=pathways_rules_internal.unavailable_cell('NOT_APPLICABLE','NOT_APPLICABLE');
  ELSIF start_on IS NULL OR end_on IS NULL THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSIF start_on>end_on OR start_on<date '1900-01-01' OR end_on>date '2100-12-31' THEN
   cell:=pathways_rules_internal.unavailable_cell('INVALID_DATES');
  ELSIF metric='PROJECT_REMAINING_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(end_on-day);
  ELSIF metric='PROJECT_OVERDUE_DAYS' THEN cell:=pathways_rules_internal.numeric_cell(GREATEST(0,day-end_on));
  ELSIF end_on=start_on THEN cell:=pathways_rules_internal.unavailable_cell('ZERO_DENOMINATOR');
  ELSE cell:=pathways_rules_internal.progress_cell(GREATEST(0,day-start_on)::text,'0',(end_on-start_on)::text,'HIGHER_IS_BETTER'); END IF;
 ELSE
  unit:=CASE WHEN metric='ACTIVITY_COMPLETION_PERCENT' THEN 'PERCENT' WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END;
  SELECT count(*),count(*) FILTER(WHERE a.status='COMPLETED'),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND (a.planned_end_date IS NULL OR a.planned_end_date<date '1900-01-01' OR a.planned_end_date>date '2100-12-31')),
   count(*) FILTER(WHERE a.status<>'COMPLETED' AND a.planned_end_date<day),
   max(CASE WHEN a.status='COMPLETED' THEN 0 ELSE GREATEST(0,day-a.planned_end_date) END)
   INTO population,completed,missing,overdue,days FROM pathways.project_activities a
   WHERE a.organization_id=org AND a.project_id=project AND a.archived_at IS NULL AND a.status<>'CANCELLED'
    AND (activity IS NULL OR a.id=activity);
  IF population>1000 THEN RAISE EXCEPTION 'Activity projection exceeds approved bound' USING ERRCODE='54000'; END IF;
  IF population=0 THEN cell:=pathways_rules_internal.unavailable_cell('EMPTY_POPULATION');
  ELSIF metric='ACTIVITY_COMPLETION_PERCENT' THEN cell:=pathways_rules_internal.progress_cell(completed::text,'0',population::text,'HIGHER_IS_BETTER');
  ELSIF missing>0 THEN cell:=pathways_rules_internal.unavailable_cell('MISSING_DATES');
  ELSE cell:=pathways_rules_internal.numeric_cell(CASE WHEN metric='ACTIVITY_OVERDUE_COUNT' THEN overdue ELSE days END); END IF;
 END IF;
 PERFORM pathways_rules_internal.validate_metric_cell(cell);
 RETURN pg_catalog.jsonb_build_object('metric',metric,'cell',cell,'unit',unit);
END $$;
ALTER FUNCTION pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamptz,date) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamptz,date)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;


-- machine-capture.proposed.sql
-- Proposed0031 executable-shape coherent capture. Needs exact ACL/native replay.
CREATE FUNCTION pathways_rules_internal.utc_milliseconds(value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
ALTER FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) TO rules_lease_owner,rules_commit_owner;

CREATE FUNCTION pathways_rules_internal.capture_rule_snapshot(wanted_job uuid,nonce text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context pathways_rules_internal.projection_context;state pathways_rules_internal.project_state;calendar record;
 rule record;binding record;observations jsonb:='{}';rule_observations jsonb;manifest jsonb:='[]';source_inputs jsonb;
 fingerprints jsonb:='{}';observation jsonb;recommendations jsonb;classification bytea;canonical jsonb;digest bytea;
 snapshot uuid:=pg_catalog.gen_random_uuid();as_of timestamptz(3);day date;rules_seen integer:=0;eligible boolean;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 PERFORM pathways_rules_internal.install_capture_context(wanted_job,nonce);
 SELECT c.* INTO context FROM pathways_rules_internal.projection_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.purpose='CAPTURE';
 IF NOT FOUND THEN RAISE EXCEPTION 'Capture context unavailable' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO state FROM pathways_rules_internal.project_state s WHERE s.organization_id=context.organization_id AND s.project_id=context.project_id;
 SELECT c.version,c.zone INTO calendar FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND OR state.organization_id IS NULL OR NOT state.bootstrap_complete THEN
  RAISE EXCEPTION 'Capture source unavailable' USING ERRCODE='55000'; END IF;
 as_of:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());day:=(as_of AT TIME ZONE calendar.zone)::date;
 FOR rule IN SELECT r.id,r.logical_rule_id,r.version,r.conditions_json,r.definition_digest,r.name,r.severity
  FROM pathways.alert_rules r WHERE r.organization_id=context.organization_id AND r.project_id=context.project_id
   AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE' ORDER BY r.id LOOP
  rules_seen:=rules_seen+1;
  IF rules_seen>20 THEN RAISE EXCEPTION 'Active rules exceed approved bound' USING ERRCODE='54000'; END IF;
  rule_observations:='{}';eligible:=pathways_rules_internal.lease_rule_exposure_allowed(rule.id);
  FOR binding IN SELECT b.condition_id,b.metric_key,b.indicator_id,b.activity_id FROM pathways_rules_internal.rule_bindings b
   WHERE b.organization_id=context.organization_id AND b.project_id=context.project_id AND b.rule_version_id=rule.id ORDER BY b.condition_id LOOP
   IF eligible THEN
    observation:=pathways_rules_internal.project_metric_observation(context.organization_id,context.project_id,
     binding.metric_key,binding.indicator_id,binding.activity_id,as_of,day);
   ELSE
    observation:=pg_catalog.jsonb_build_object('metric',binding.metric_key,'cell',pathways_rules_internal.unavailable_cell('SUPPRESSED','SUPPRESSED'),
     'unit',CASE WHEN binding.metric_key='INDICATOR_CURRENT_VALUE' THEN 'VALUE'
      WHEN binding.metric_key IN ('INDICATOR_PROGRESS_PERCENT','PROJECT_TIMELINE_ELAPSED_PERCENT','ACTIVITY_COMPLETION_PERCENT') THEN 'PERCENT'
      WHEN binding.metric_key='ACTIVITY_OVERDUE_COUNT' THEN 'COUNT' ELSE 'DAYS' END);
   END IF;
   rule_observations:=rule_observations||pg_catalog.jsonb_build_object(binding.condition_id,observation);
  END LOOP;
  -- Validates the complete bounded tree, bindings, cells and domains now; no
  -- partial or substituted leaf may reach the immutable captured manifest.
  PERFORM pathways_rules_internal.evaluate_snapshot_rule(rule.conditions_json,rule_observations);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text,'type',t.type)
   ORDER BY t.id),'[]'::jsonb) INTO recommendations FROM pathways.alert_rule_recommendations t
   WHERE t.organization_id=context.organization_id AND t.rule_id=rule.id;
  IF pg_catalog.jsonb_array_length(recommendations) NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Predefined recommendations unavailable' USING ERRCODE='55000'; END IF;
  classification:=pathways_rules_internal.classification_fingerprint(rule.id);
  manifest:=manifest||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('ruleId',rule.id,'logicalRuleId',rule.logical_rule_id,
   'version',rule.version,'conditions',rule.conditions_json,'definitionDigest',pg_catalog.encode(rule.definition_digest,'hex'),
   'name',rule.name,'severity',rule.severity,'recommendations',recommendations,'eligible',eligible,'classificationFingerprint',pg_catalog.encode(classification,'hex')));
  observations:=observations||pg_catalog.jsonb_build_object(rule.id::text,rule_observations);
  fingerprints:=fingerprints||pg_catalog.jsonb_build_object(rule.id::text,
   pg_catalog.encode(pathways_rules_internal.rule_dependency_fingerprint(rule.id,as_of),'hex'));
 END LOOP;
 source_inputs:=pg_catalog.jsonb_build_object('resourceFingerprints',fingerprints);
 canonical:=pg_catalog.jsonb_build_object('organizationId',context.organization_id,'projectId',context.project_id,'jobId',context.job_id,
  'requiredGeneration',state.required_generation::text,'sourceWatermark',state.source_watermark::text,
  'calendar',pg_catalog.jsonb_build_object('version',calendar.version::text,'zone',calendar.zone),
  'asOf',pathways_rules_internal.utc_milliseconds(as_of),'reportingDate',day,'manifest',manifest,
  'observations',observations,'sourceInputs',source_inputs);
 digest:=pg_catalog.sha256(pg_catalog.convert_to(canonical::text,'UTF8'));
 IF pathways_rules_internal.lease_metric_scope(context.organization_id,context.project_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.snapshots(id,job_id,organization_id,project_id,lease_hash,lease_session,
  required_generation,source_watermark,calendar_version,as_of,reporting_date,zone,manifest,observations,source_inputs,canonical_payload,digest)
 VALUES(snapshot,context.job_id,context.organization_id,context.project_id,context.lease_hash,session_user,
  state.required_generation,state.source_watermark,calendar.version,as_of,day,calendar.zone,manifest,observations,source_inputs,canonical,digest);
 PERFORM pathways_rules_internal.remove_projection_context();
 RETURN pg_catalog.jsonb_build_object('snapshotId',snapshot,'digest',pg_catalog.encode(digest,'hex'),
  'requiredGeneration',state.required_generation::text,'sourceWatermark',state.source_watermark::text,'calendarVersion',calendar.version::text,
  'asOf',pathways_rules_internal.utc_milliseconds(as_of),'reportingDate',day,'zone',calendar.zone);
END $$;
ALTER FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text) TO pathways_rules_worker;


-- machine-commit.proposed.sql
-- Proposed0031 bounded all-or-nothing commit; stale validation precedes DML.
CREATE FUNCTION pathways_rules_internal.install_commit_intent(relation oid,before_row jsonb,after_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context pathways_rules_internal.projection_context;
BEGIN
 SELECT c.* INTO context FROM pathways_rules_internal.projection_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.purpose='COMMIT';
 IF NOT FOUND OR pathways_rules_internal.lease_metric_scope(context.organization_id,context.project_id) IS DISTINCT FROM true
  OR relation NOT IN ('pathways.rule_based_alerts'::regclass,'pathways.decision_recommendations'::regclass)
  OR after_row IS NULL OR pg_catalog.jsonb_typeof(after_row)<>'object'
  OR after_row->>'organization_id' IS DISTINCT FROM context.organization_id::text
  OR after_row->>'project_id' IS DISTINCT FROM context.project_id::text THEN
  RAISE EXCEPTION 'Commit intent unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways_rules_internal.runtime_mutation_intents
 (transaction_id,backend_pid,login_name,purpose,organization_id,project_id,operation_id,relation_oid,action,record_id,expected_old,expected_new)
 VALUES(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),session_user,'COMMIT',context.organization_id,context.project_id,
  context.snapshot_id,relation,CASE WHEN before_row IS NULL THEN 'INSERT' ELSE 'UPDATE' END,(after_row->>'id')::uuid,before_row,after_row);
END $$;
ALTER FUNCTION pathways_rules_internal.install_commit_intent(oid,jsonb,jsonb) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_commit_intent(oid,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE FUNCTION pathways_rules_internal.commit_rule_snapshot(wanted_job uuid,nonce text,wanted_snapshot uuid,wanted_digest bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE org uuid;project uuid;state pathways_rules_internal.project_state;job pathways_rules_internal.jobs;
 captured pathways_rules_internal.snapshots;ack record;calendar record;entry jsonb;current_rule record;templates jsonb;
 result jsonb;evidence jsonb;leaf jsonb;condition_units jsonb;sequence bigint;moment timestamptz(3);evaluation uuid;
 cursor pathways_rules_internal.episode_cursors;affected_kind text;affected uuid;indicator uuid;activity uuid;
 old_alert pathways.rule_based_alerts;new_alert pathways.rule_based_alerts;recommendation pathways.decision_recommendations;
 template jsonb;rule_id uuid;matched boolean;row_count integer;observed jsonb;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_worker');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR nonce IS NULL OR nonce !~ '^[a-f0-9]{64}$'
  OR wanted_job IS NULL OR wanted_snapshot IS NULL OR wanted_digest IS NULL OR pg_catalog.octet_length(wanted_digest)<>32 THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 -- Derive scope from private job metadata, then take state before queue/resource.
 SELECT j.organization_id,j.project_id INTO org,project FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO state FROM pathways_rules_internal.project_state s WHERE s.organization_id=org AND s.project_id=project FOR NO KEY UPDATE;
 IF NOT FOUND OR NOT state.bootstrap_complete THEN RAISE EXCEPTION 'Rules bootstrap unavailable' USING ERRCODE='55000'; END IF;
 -- Immutable original capability recovery is read-only even after lease expiry,
 -- newer work, terminal human outcomes or another worker has claimed the job.
 SELECT * INTO ack FROM pathways_rules_internal.committed_acknowledgement(wanted_job,nonce,wanted_snapshot,wanted_digest);
 IF FOUND THEN RETURN pg_catalog.jsonb_build_object('requiredGeneration',ack.required_generation::text,
  'sourceWatermark',ack.source_watermark::text,'calendarVersion',ack.calendar_version::text,
  'evaluationSequence',ack.evaluation_sequence::text,'committedAt',pathways_rules_internal.utc_milliseconds(ack.committed_at)); END IF;
 SELECT j.* INTO job FROM pathways_rules_internal.jobs j WHERE j.id=wanted_job AND j.organization_id=org AND j.project_id=project FOR NO KEY UPDATE;
 PERFORM pathways_rules_internal.install_commit_context(wanted_job,nonce,wanted_snapshot,wanted_digest);
 SELECT s.* INTO captured FROM pathways_rules_internal.snapshots s WHERE s.id=wanted_snapshot AND s.job_id=wanted_job
  AND s.organization_id=org AND s.project_id=project;
 SELECT c.version,c.zone INTO calendar FROM pathways_rules_internal.calendar_configuration c WHERE c.singleton;
 IF NOT FOUND OR captured.id IS NULL OR captured.digest IS DISTINCT FROM wanted_digest
  OR pg_catalog.sha256(pg_catalog.convert_to(captured.canonical_payload::text,'UTF8')) IS DISTINCT FROM captured.digest
  OR captured.required_generation IS DISTINCT FROM state.required_generation OR captured.source_watermark IS DISTINCT FROM state.source_watermark
  OR captured.calendar_version IS DISTINCT FROM calendar.version OR captured.zone IS DISTINCT FROM calendar.zone
  OR job.claim_generation IS DISTINCT FROM state.required_generation OR job.claim_watermark IS DISTINCT FROM state.source_watermark THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 SELECT count(*)::integer INTO row_count FROM pathways.alert_rules r WHERE r.organization_id=org AND r.project_id=project
  AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1';
 IF row_count<>pg_catalog.jsonb_array_length(captured.manifest) THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(captured.manifest) LOOP
  rule_id:=(entry->>'ruleId')::uuid;
  SELECT r.version,r.definition_digest,r.conditions_json,r.name,r.severity INTO current_rule FROM pathways.alert_rules r
   WHERE r.id=rule_id AND r.organization_id=org AND r.project_id=project AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1';
  IF NOT FOUND OR current_rule.version IS DISTINCT FROM (entry->>'version')::integer
   OR pg_catalog.encode(current_rule.definition_digest,'hex') IS DISTINCT FROM entry->>'definitionDigest'
   OR current_rule.conditions_json IS DISTINCT FROM entry->'conditions' OR current_rule.name IS DISTINCT FROM entry->>'name'
   OR current_rule.severity::text IS DISTINCT FROM entry->>'severity'
   OR pathways_rules_internal.lease_rule_exposure_allowed(rule_id) IS DISTINCT FROM (entry->>'eligible')::boolean
   OR pg_catalog.encode(pathways_rules_internal.classification_fingerprint(rule_id),'hex') IS DISTINCT FROM entry->>'classificationFingerprint'
   OR pg_catalog.encode(pathways_rules_internal.rule_dependency_fingerprint(rule_id,captured.as_of),'hex')
    IS DISTINCT FROM captured.source_inputs->'resourceFingerprints'->>rule_id::text THEN
   RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.id,'title',t.title,'text',t.text,'type',t.type)
   ORDER BY t.id),'[]'::jsonb) INTO templates FROM pathways.alert_rule_recommendations t WHERE t.organization_id=org AND t.rule_id=rule_id;
  IF templates IS DISTINCT FROM entry->'recommendations' THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 END LOOP;
 -- No writes above. Now each actual evaluation/episode is fixed from the trusted
 -- immutable captured observations and bounded deterministic evaluator.
 sequence:=state.evaluation_sequence+1;moment:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(captured.manifest) ORDER BY value->>'ruleId' LOOP
  rule_id:=(entry->>'ruleId')::uuid;result:=pathways_rules_internal.evaluate_snapshot_rule(entry->'conditions',captured.observations->rule_id::text);
  condition_units:='[]';observed:='{}';
  FOR leaf IN SELECT value FROM pg_catalog.jsonb_array_elements(result->'conditions') ORDER BY value->>'conditionId' LOOP
   condition_units:=condition_units||pg_catalog.jsonb_build_array(leaf||pg_catalog.jsonb_build_object('unit',
    captured.observations->rule_id::text->(leaf->>'conditionId')->>'unit'));
   observed:=observed||pg_catalog.jsonb_build_object(leaf->>'conditionId',leaf->'cell');
  END LOOP;
  evidence:=result||pg_catalog.jsonb_build_object('conditions',condition_units,'snapshotId',captured.id,
   'asOf',pathways_rules_internal.utc_milliseconds(captured.as_of),'reportingDate',captured.reporting_date,
   'calendar',pg_catalog.jsonb_build_object('zone',captured.zone,'version',captured.calendar_version::text));
  SELECT CASE WHEN count(DISTINCT b.indicator_id)=1 AND bool_and(b.indicator_id IS NOT NULL) THEN min(b.indicator_id::text)::uuid END,
   CASE WHEN count(DISTINCT b.activity_id)=1 AND bool_and(b.activity_id IS NOT NULL) THEN min(b.activity_id::text)::uuid END
   INTO indicator,activity FROM pathways_rules_internal.rule_bindings b WHERE b.organization_id=org AND b.project_id=project AND b.rule_version_id=rule_id;
  affected_kind:=CASE WHEN indicator IS NOT NULL THEN 'INDICATOR' WHEN activity IS NOT NULL THEN 'ACTIVITY' ELSE 'PROJECT' END;
  affected:=COALESCE(indicator,activity,project);evaluation:=pg_catalog.gen_random_uuid();
  INSERT INTO pathways_rules_internal.evaluations(id,snapshot_id,organization_id,project_id,rule_version_id,affected_kind,affected_id,
   evaluation_sequence,result,evidence,superseded) VALUES(evaluation,captured.id,org,project,rule_id,affected_kind,affected,sequence,result->>'result',evidence,false);
  INSERT INTO pathways_rules_internal.episode_cursors(organization_id,project_id,rule_version_id,affected_kind,affected_id)
   VALUES(org,project,rule_id,affected_kind,affected) ON CONFLICT DO NOTHING;
  SELECT c.* INTO cursor FROM pathways_rules_internal.episode_cursors c WHERE c.organization_id=org AND c.project_id=project
   AND c.rule_version_id=rule_id AND c.affected_kind=affected_kind AND c.affected_id=affected FOR NO KEY UPDATE;
  IF NOT FOUND OR cursor.last_sequence>=sequence OR (cursor.latched AND cursor.alert_id IS NULL)
   OR (cursor.episode_number>0 AND cursor.alert_id IS NULL) THEN
   RAISE EXCEPTION 'Episode cursor is inconsistent' USING ERRCODE='55000'; END IF;
  old_alert:=NULL;new_alert:=NULL;
  IF result->>'result'='TRUE' AND NOT cursor.latched THEN
   new_alert.id:=pg_catalog.gen_random_uuid();new_alert.organization_id:=org;new_alert.project_id:=project;new_alert.rule_id:=rule_id;
   new_alert.indicator_id:=indicator;new_alert.activity_id:=activity;new_alert.title:=entry->>'name';new_alert.message:='Rule conditions matched.';
   new_alert.severity:=(entry->>'severity')::pathways.alert_severity;new_alert.observed_values:=observed;new_alert.evaluated_snapshot:=evidence;
   new_alert.evaluated_by_id:=NULL;new_alert.evaluated_at:=captured.as_of;new_alert.created_at:=moment;new_alert.updated_at:=moment;
   new_alert.runtime_contract_version:='f10.v1';new_alert.attribution:='SYSTEM';new_alert.lifecycle:='NEW';new_alert.revision:=1;
   new_alert.episode_number:=cursor.episode_number+1;new_alert.affected_kind:=affected_kind;new_alert.affected_id:=affected;new_alert.latest_evaluation_id:=evaluation;new_alert.origin_snapshot_id:=captured.id;
   PERFORM pathways_rules_internal.install_commit_intent('pathways.rule_based_alerts'::regclass,NULL,pg_catalog.to_jsonb(new_alert));
   INSERT INTO pathways.rule_based_alerts SELECT (new_alert).*;
   INSERT INTO pathways_rules_internal.lifecycle_events(organization_id,project_id,alert_id,actor_kind,state_before,state_after,evaluation_id,occurred_at)
    VALUES(org,project,new_alert.id,'SYSTEM',NULL,'NEW',evaluation,moment);
   FOR template IN SELECT value FROM pg_catalog.jsonb_array_elements(entry->'recommendations') LOOP
    recommendation:=NULL;recommendation.id:=pg_catalog.gen_random_uuid();recommendation.organization_id:=org;recommendation.project_id:=project;
    recommendation.alert_id:=new_alert.id;recommendation.source_rule_recommendation_id:=(template->>'id')::uuid;
    recommendation.title:=template->>'title';recommendation.text:=template->>'text';recommendation.type:=(template->>'type')::pathways.recommendation_type;
    recommendation.basis:=CASE affected_kind WHEN 'INDICATOR' THEN 'KPI'::pathways.recommendation_basis ELSE 'COMBINED'::pathways.recommendation_basis END;
    recommendation.source_snapshot:=evidence||pg_catalog.jsonb_build_object('evaluationId',evaluation);recommendation.proposed_by_id:=NULL;
    recommendation.proposed_at:=moment;recommendation.status:='NEW';recommendation.created_at:=moment;recommendation.updated_at:=moment;
    recommendation.revision:=1;recommendation.runtime_contract_version:='f10.v1';recommendation.attribution:='SYSTEM';
    PERFORM pathways_rules_internal.install_commit_intent('pathways.decision_recommendations'::regclass,NULL,pg_catalog.to_jsonb(recommendation));
    INSERT INTO pathways.decision_recommendations SELECT (recommendation).*;
   END LOOP;
  ELSIF cursor.alert_id IS NOT NULL THEN
   SELECT a.* INTO old_alert FROM pathways.rule_based_alerts a WHERE a.id=cursor.alert_id AND a.organization_id=org AND a.project_id=project
    AND a.rule_id=rule_id AND a.runtime_contract_version='f10.v1' FOR NO KEY UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Episode cursor unavailable' USING ERRCODE='55000'; END IF;
   new_alert:=old_alert;new_alert.latest_evaluation_id:=evaluation;new_alert.revision:=old_alert.revision+1;new_alert.updated_at:=moment;
   IF result->>'result'='FALSE' AND old_alert.lifecycle IN ('NEW','REVIEWED','ACTIONED') THEN new_alert.lifecycle:='AUTO_RESOLVED'; END IF;
   PERFORM pathways_rules_internal.install_commit_intent('pathways.rule_based_alerts'::regclass,pg_catalog.to_jsonb(old_alert),pg_catalog.to_jsonb(new_alert));
   UPDATE pathways.rule_based_alerts SET latest_evaluation_id=evaluation,revision=new_alert.revision,lifecycle=new_alert.lifecycle,updated_at=moment
    WHERE id=old_alert.id AND organization_id=org AND project_id=project AND revision=old_alert.revision;
   IF NOT FOUND THEN RAISE EXCEPTION 'The rules resource changed.' USING ERRCODE='40001'; END IF;
   IF new_alert.lifecycle IS DISTINCT FROM old_alert.lifecycle THEN
    INSERT INTO pathways_rules_internal.lifecycle_events(organization_id,project_id,alert_id,actor_kind,state_before,state_after,evaluation_id,occurred_at)
     VALUES(org,project,new_alert.id,'SYSTEM',old_alert.lifecycle,new_alert.lifecycle,evaluation,moment);
   END IF;
  END IF;
  UPDATE pathways_rules_internal.episode_cursors SET last_sequence=sequence,last_result=result->>'result',
   latched=CASE result->>'result' WHEN 'TRUE' THEN true WHEN 'FALSE' THEN false ELSE cursor.latched END,
   episode_number=CASE WHEN result->>'result'='TRUE' AND NOT cursor.latched THEN cursor.episode_number+1 ELSE cursor.episode_number END,
   alert_id=COALESCE(new_alert.id,cursor.alert_id) WHERE organization_id=org AND project_id=project
    AND rule_version_id=rule_id AND episode_cursors.affected_kind=affected_kind AND affected_id=affected AND last_sequence=cursor.last_sequence;
  IF NOT FOUND THEN RAISE EXCEPTION 'Episode sequence changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 IF pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways_rules_internal.acknowledgements(snapshot_id,job_id,organization_id,project_id,snapshot_digest,lease_hash,lease_session,
  required_generation,source_watermark,calendar_version,evaluation_sequence,committed_at)
 VALUES(captured.id,job.id,org,project,captured.digest,job.lease_hash,session_user,captured.required_generation,
  captured.source_watermark,captured.calendar_version,sequence,moment);
 INSERT INTO pathways_rules_internal.work_coverage(work_item_id,organization_id,project_id,acknowledgement_snapshot_id)
  SELECT w.id,w.organization_id,w.project_id,captured.id FROM pathways_rules_internal.work_items w WHERE w.organization_id=org AND w.project_id=project
   AND w.generation<=captured.required_generation AND NOT EXISTS(SELECT FROM pathways_rules_internal.work_coverage coverage WHERE coverage.work_item_id=w.id);
 UPDATE pathways_rules_internal.project_state SET acknowledged_generation=captured.required_generation,evaluation_sequence=sequence
  WHERE organization_id=org AND project_id=project AND required_generation=captured.required_generation AND source_watermark=captured.source_watermark;
 IF NOT FOUND THEN RAISE EXCEPTION 'The rules source changed.' USING ERRCODE='40001'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,project_id,action,entity_type,entity_id,changes)
  VALUES(org,project,'rules.system.evaluated','RulesSnapshot',captured.id,pg_catalog.jsonb_build_object('attribution','SYSTEM','evaluatedRuleCount',row_count));
 -- Remove live-marker before releasing lease; no later source reads/writes.
 PERFORM pathways_rules_internal.remove_projection_context();
 UPDATE pathways_rules_internal.jobs AS j SET state='IDLE',lease_hash=NULL,lease_session=NULL,lease_expires_at=NULL,claim_generation=NULL,claim_watermark=NULL,
  stale_attempts=0,operational_failures=0 WHERE j.id=job.id AND j.organization_id=org AND j.project_id=project AND j.lease_hash=job.lease_hash AND j.state='LEASED';
 IF NOT FOUND THEN RAISE EXCEPTION 'The rules lease changed.' USING ERRCODE='40001'; END IF;
 RETURN pg_catalog.jsonb_build_object('requiredGeneration',captured.required_generation::text,'sourceWatermark',captured.source_watermark::text,
  'calendarVersion',captured.calendar_version::text,'evaluationSequence',sequence::text,'committedAt',pathways_rules_internal.utc_milliseconds(moment));
END $$;
ALTER FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) TO pathways_rules_worker;


-- machine-sweep.proposed.sql
-- Proposed0031 fixed bounded continuation; no metrics, leases or initialization.
CREATE FUNCTION pathways_rules_internal.sweep_rule_projects()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cursor pathways_rules_internal.sweep_cursor;anchor record;state_ready boolean;generation bigint;
 current_slot timestamptz;identity text;processed integer:=0;continued boolean:=false;moment timestamptz;
BEGIN
 PERFORM pathways_rules_internal.assert_session('pathways_rules_sweeper');
 IF pg_catalog.current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Rules operation unavailable' USING ERRCODE='42501'; END IF;
 SELECT c.* INTO cursor FROM pathways_rules_internal.sweep_cursor c WHERE c.singleton FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sweep continuation unavailable' USING ERRCODE='55000'; END IF;
 current_slot:=pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF cursor.exhausted THEN
  IF current_slot<=cursor.slot THEN RETURN pg_catalog.jsonb_build_object('processed',0,'continued',false); END IF;
  UPDATE pathways_rules_internal.sweep_cursor SET slot=current_slot,last_organization_id=NULL,last_project_id=NULL,exhausted=false WHERE singleton;
  cursor.slot:=current_slot;cursor.last_organization_id:=NULL;cursor.last_project_id:=NULL;cursor.exhausted:=false;
 END IF;
 -- Every continuation reuses this persisted slot, even across hour rollover.
 identity:=pg_catalog.to_char(cursor.slot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:00:00"Z"');
 FOR anchor IN SELECT DISTINCT p.organization_id,p.id AS project_id FROM pathways.projects p JOIN pathways.alert_rules r
  ON r.organization_id=p.organization_id AND r.project_id=p.id AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE'
  WHERE p.archived_at IS NULL AND (cursor.last_organization_id IS NULL
   OR (p.organization_id,p.id)>(cursor.last_organization_id,cursor.last_project_id))
  ORDER BY p.organization_id,p.id LIMIT 101 LOOP
  IF processed=100 THEN continued:=true;EXIT; END IF;
  SELECT s.bootstrap_complete INTO state_ready FROM pathways_rules_internal.project_state s
   WHERE s.organization_id=anchor.organization_id AND s.project_id=anchor.project_id FOR NO KEY UPDATE;
  IF NOT FOUND OR state_ready IS DISTINCT FROM true THEN
   -- Cursor/job/work all roll back: absent protected state is never fabricated
   -- or silently counted as completed coverage by a sweeper.
   RAISE EXCEPTION 'Rules bootstrap required' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT FROM pathways.projects p JOIN pathways.alert_rules r ON r.organization_id=p.organization_id AND r.project_id=p.id
   WHERE p.organization_id=anchor.organization_id AND p.id=anchor.project_id AND p.archived_at IS NULL
    AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE') AND NOT EXISTS(
   SELECT FROM pathways_rules_internal.work_items w WHERE w.organization_id=anchor.organization_id AND w.project_id=anchor.project_id
    AND w.identity_kind='HOURLY' AND w.identity_id=identity) THEN
   moment:=pg_catalog.clock_timestamp();
   UPDATE pathways_rules_internal.project_state SET required_generation=required_generation+1
    WHERE organization_id=anchor.organization_id AND project_id=anchor.project_id AND bootstrap_complete
    RETURNING required_generation INTO generation;
   IF NOT FOUND THEN RAISE EXCEPTION 'Rules bootstrap required' USING ERRCODE='55000'; END IF;
   INSERT INTO pathways_rules_internal.work_items(id,organization_id,project_id,generation,identity_kind,identity_id,queued_at)
    VALUES(pg_catalog.gen_random_uuid(),anchor.organization_id,anchor.project_id,generation,'HOURLY',identity,moment);
   INSERT INTO pathways_rules_internal.jobs(id,organization_id,project_id,pending_since,next_attempt_at,state)
    VALUES(pg_catalog.gen_random_uuid(),anchor.organization_id,anchor.project_id,moment,moment,'PENDING')
    ON CONFLICT(organization_id,project_id) DO UPDATE
    SET state=CASE WHEN pathways_rules_internal.jobs.state='LEASED' THEN 'LEASED' ELSE 'PENDING' END,
     pending_since=CASE WHEN pathways_rules_internal.jobs.state='IDLE' THEN EXCLUDED.pending_since ELSE pathways_rules_internal.jobs.pending_since END,
     next_attempt_at=CASE WHEN pathways_rules_internal.jobs.state IN ('IDLE','FAILED') THEN EXCLUDED.next_attempt_at ELSE pathways_rules_internal.jobs.next_attempt_at END,
     operational_failures=0;
  END IF;
  processed:=processed+1;
  UPDATE pathways_rules_internal.sweep_cursor SET last_organization_id=anchor.organization_id,last_project_id=anchor.project_id WHERE singleton;
 END LOOP;
 UPDATE pathways_rules_internal.sweep_cursor SET exhausted=NOT continued WHERE singleton;
 RETURN pg_catalog.jsonb_build_object('processed',processed,'continued',continued);
END $$;
ALTER FUNCTION pathways_rules_internal.sweep_rule_projects() OWNER TO rules_sweep_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.sweep_rule_projects()
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.sweep_rule_projects() TO pathways_rules_sweeper;


-- source-finish.proposed.sql
-- Fixed companion checks run before receipt/queue state is acknowledged.
CREATE FUNCTION pathways_rules_internal.assert_source_companions(c pathways_rules_internal.source_operation_context)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE body jsonb:=c.canonical_body; expected jsonb; actual jsonb; k text; role_code text; budget numeric; count_rows bigint;
BEGIN
 PERFORM pathways_rules_internal.assert_omitted_source_companions(c);
 IF c.operation_code='PROJECT_UPDATE' THEN
  FOREACH k IN ARRAY ARRAY['projectManagerId','monitoringOfficerId','projectOfficerIds'] LOOP
   IF body?k THEN
    role_code:=CASE k WHEN 'projectManagerId' THEN 'PROJECT_MANAGER' WHEN 'monitoringOfficerId' THEN 'MONITORING_AND_EVALUATION_OFFICER' ELSE 'PROJECT_OFFICER' END;
    expected:=CASE WHEN k='projectOfficerIds' THEN body->k WHEN body->k='null'::jsonb THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array(body->k) END;
    SELECT coalesce(pg_catalog.jsonb_agg(a.user_id::text ORDER BY a.user_id),'[]'::jsonb) INTO actual
     FROM pathways.user_project_assignments a JOIN pathways.system_users u ON u.organization_id=a.organization_id AND u.id=a.user_id
     JOIN pathways.roles r ON r.id=u.role_id WHERE a.organization_id=c.organization_id AND a.project_id=c.project_id
      AND a.status::text='ACTIVE' AND a.ended_at IS NULL AND r.code::text=role_code;
    SELECT coalesce(pg_catalog.jsonb_agg(e ORDER BY e),'[]'::jsonb) INTO expected FROM pg_catalog.jsonb_array_elements(expected) e;
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Project companion differs' USING ERRCODE='22023'; END IF;
   END IF;
  END LOOP;
  IF body?'implementingPartnerNames' THEN
   SELECT coalesce(pg_catalog.jsonb_agg(DISTINCT pg_catalog.lower(pg_catalog.btrim(e#>>'{}')) ORDER BY pg_catalog.lower(pg_catalog.btrim(e#>>'{}'))),'[]'::jsonb)
    INTO expected FROM pg_catalog.jsonb_array_elements(body->'implementingPartnerNames') e;
   SELECT coalesce(pg_catalog.jsonb_agg(i.normalized_name ORDER BY i.normalized_name),'[]'::jsonb) INTO actual
    FROM pathways.project_implementing_partners l JOIN pathways.implementing_partners i ON i.organization_id=l.organization_id AND i.id=l.partner_id
    WHERE l.organization_id=c.organization_id AND l.project_id=c.project_id;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Partner companion differs' USING ERRCODE='22023'; END IF;
  END IF;
 ELSIF c.operation_code IN ('ACTIVITY_CREATE','ACTIVITY_UPDATE') THEN
  SELECT coalesce(pg_catalog.jsonb_agg(p.user_id::text ORDER BY p.user_id),'[]'::jsonb) INTO actual
   FROM pathways.project_activity_assignments a JOIN pathways.user_project_assignments p
    ON p.organization_id=a.organization_id AND p.project_id=a.project_id AND p.id=a.project_assignment_id
   WHERE a.organization_id=c.organization_id AND a.project_id=c.project_id AND a.activity_id=c.source_record_id
    AND a.status::text='ACTIVE' AND a.ended_at IS NULL AND p.status::text='ACTIVE' AND p.ended_at IS NULL;
  SELECT coalesce(pg_catalog.jsonb_agg(e ORDER BY e),'[]'::jsonb) INTO expected FROM pg_catalog.jsonb_array_elements(body->'assignedUserIds') e;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Assignment companion differs' USING ERRCODE='22023'; END IF;
  IF body?'indicatorIds' OR c.operation_code='ACTIVITY_CREATE' THEN
   SELECT coalesce(pg_catalog.jsonb_agg(l.indicator_id::text ORDER BY l.indicator_id),'[]'::jsonb) INTO actual
    FROM pathways.activity_indicator_links l WHERE l.organization_id=c.organization_id AND l.project_id=c.project_id AND l.activity_id=c.source_record_id;
   SELECT coalesce(pg_catalog.jsonb_agg(e ORDER BY e),'[]'::jsonb) INTO expected FROM pg_catalog.jsonb_array_elements(coalesce(body->'indicatorIds','[]'::jsonb)) e;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Indicator companion differs' USING ERRCODE='22023'; END IF;
  END IF;
  IF body?'journeyStageId' OR c.operation_code='ACTIVITY_CREATE' THEN
   SELECT coalesce(pg_catalog.jsonb_agg(l.stage_id::text ORDER BY l.stage_id),'[]'::jsonb) INTO actual
    FROM pathways.activity_journey_stage_mappings l WHERE l.organization_id=c.organization_id AND l.project_id=c.project_id AND l.activity_id=c.source_record_id;
   expected:=CASE WHEN body->>'journeyStageId' IS NULL THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array(body->>'journeyStageId') END;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Journey companion differs' USING ERRCODE='22023'; END IF;
  END IF;
 ELSIF c.operation_code='INDICATOR_CREATE' THEN
  SELECT pg_catalog.jsonb_build_object('recipe',b.recipe,'activityId',b.activity_id,'formId',b.form_id,'formVersion',b.form_version,'fieldId',b.field_id)
   INTO actual FROM pathways.project_indicator_bindings b WHERE b.organization_id=c.organization_id AND b.project_id=c.project_id AND b.indicator_id=c.source_record_id;
  expected:=CASE WHEN body?'binding' THEN pg_catalog.jsonb_build_object('recipe',body->'binding'->>'recipe',
   'activityId',body->'binding'->>'activityId','formId',body->'binding'->>'formId','formVersion',body->'binding'->'formVersion','fieldId',body->'binding'->>'fieldId') END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Definition companion differs' USING ERRCODE='22023'; END IF;
 ELSIF c.operation_code IN ('ACTIVITY_REVIEW','ACTIVITY_PROOF_FINALIZE') THEN
  IF c.operation_code='ACTIVITY_PROOF_FINALIZE' THEN
   SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('fileName',e.file_name,'sha256',pg_catalog.btrim(e.sha256),'contentType',e.content_type,'byteSize',e.byte_size)
    ORDER BY e.file_name,e.sha256,e.content_type,e.byte_size),'[]'::jsonb) INTO actual FROM pathways.evidence_media e
    WHERE e.organization_id=c.organization_id AND e.project_id=c.project_id AND e.activity_id=c.source_record_id AND e.activity_update_id=c.related_update_id;
   SELECT pg_catalog.jsonb_agg(e ORDER BY e->>'fileName',e->>'sha256',e->>'contentType',(e->>'byteSize')::bigint) INTO expected FROM pg_catalog.jsonb_array_elements(body->'files') e;
   IF actual IS DISTINCT FROM expected OR EXISTS(SELECT 1 FROM pathways.evidence_media e WHERE e.organization_id=c.organization_id
    AND e.project_id=c.project_id AND e.activity_update_id=c.related_update_id AND (NOT e.storage_ready OR e.submitted_by_id<>c.actor_id OR e.status::text<>'PENDING')) THEN
    RAISE EXCEPTION 'Proof companion differs' USING ERRCODE='22023'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM pathways.activity_updates u WHERE u.organization_id=c.organization_id AND u.project_id=c.project_id
    AND u.id=c.related_update_id AND u.reviewed_by_id=c.actor_id AND u.reviewed_at=c.generated_at AND u.review_reason=pg_catalog.btrim(body->>'reason')
    AND u.status::text=CASE WHEN c.review_action='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END)
    OR EXISTS(SELECT 1 FROM pathways.evidence_media e WHERE e.organization_id=c.organization_id AND e.project_id=c.project_id AND e.activity_update_id=c.related_update_id
     AND (NOT e.storage_ready OR CASE WHEN c.review_action='APPROVE' THEN
      e.status::text IS DISTINCT FROM 'VERIFIED' OR e.verified_by_id IS DISTINCT FROM c.actor_id OR e.verified_at IS DISTINCT FROM c.generated_at
      ELSE e.status::text IS DISTINCT FROM 'REJECTED' OR e.rejected_by_id IS DISTINCT FROM c.actor_id OR e.rejected_at IS DISTINCT FROM c.generated_at
       OR e.rejection_reason IS DISTINCT FROM pg_catalog.btrim(body->>'reason') END)) THEN
    RAISE EXCEPTION 'Review companion differs' USING ERRCODE='22023'; END IF;
  END IF;
 END IF;
 k:=CASE WHEN c.operation_code='PROJECT_UPDATE' THEN 'projectBudget' ELSE 'budgetAllocation' END;
 IF body?k THEN
  IF pathways.p06_can('budgets.create',c.project_id) IS DISTINCT FROM true
   OR (c.operation_code<>'ACTIVITY_CREATE' AND pathways.p06_can('budgets.update',c.project_id) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Budget unavailable' USING ERRCODE='42501'; END IF;
  SELECT pg_catalog.count(*),pg_catalog.min(b.planned_budget) INTO count_rows,budget FROM pathways.project_budget_records b
   WHERE b.organization_id=c.organization_id AND b.project_id=c.project_id AND b.archived_at IS NULL AND b.currency='PHP'
    AND b.activity_id IS NOT DISTINCT FROM CASE WHEN k='projectBudget' THEN NULL::uuid ELSE c.source_record_id END
    AND b.category=CASE WHEN k='projectBudget' THEN 'PROJECT_PROFILE_TOTAL' ELSE 'ACTIVITY_PROFILE_TOTAL' END;
  IF count_rows<>1 OR budget IS DISTINCT FROM (body->>k)::numeric THEN RAISE EXCEPTION 'Budget companion differs' USING ERRCODE='22023'; END IF;
 END IF;
END $$;

CREATE FUNCTION pathways.f10_finish_source_operation(operation_handle uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c pathways_rules_internal.source_operation_context; permission text; current_row jsonb; mode text;
 receipt_id uuid:=pg_catalog.gen_random_uuid(); work_id uuid; generation bigint; watermark bigint; source_kind text;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user IS DISTINCT FROM 'pathways_runtime' OR operation_handle IS NULL
  OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO c FROM pathways_rules_internal.source_operation_context x WHERE x.handle=operation_handle
  AND x.transaction_id=pg_catalog.pg_current_xact_id() AND x.backend_pid=pg_catalog.pg_backend_pid() AND x.login_name=session_user
  AND x.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND x.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 IF NOT FOUND OR c.sealed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Source proof unavailable' USING ERRCODE='42501'; END IF;
 SELECT cat.permission_code INTO permission FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=c.operation_code;
 IF permission IS NULL OR pathways.p06_can(permission,c.project_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 current_row:=pathways_rules_internal.read_source_row(c.operation_code,c.organization_id,c.project_id,c.source_record_id);
 IF current_row IS NULL OR pathways_rules_internal.source_business_fingerprint(current_row) IS DISTINCT FROM c.expected_after_business_hash THEN
  RAISE EXCEPTION 'Source differs from proof' USING ERRCODE='22023'; END IF;
 PERFORM pathways_rules_internal.assert_source_companions(c);
 -- Queue anchor and lock precede every receipt write, including NONE acknowledgements.
 INSERT INTO pathways_rules_internal.jobs(id,organization_id,project_id,state,pending_since,next_attempt_at)
  VALUES(pg_catalog.gen_random_uuid(),c.organization_id,c.project_id,'IDLE',pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp())
  ON CONFLICT(organization_id,project_id) DO NOTHING;
 PERFORM 1 FROM pathways_rules_internal.jobs j WHERE j.organization_id=c.organization_id AND j.project_id=c.project_id FOR NO KEY UPDATE;
 IF pathways.p06_can(permission,c.project_id) IS DISTINCT FROM true OR nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS DISTINCT FROM c.actor_id THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 mode:=CASE WHEN EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=c.organization_id AND r.project_id=c.project_id
  AND r.runtime_contract_version='f10.v1' AND r.status='ACTIVE') THEN c.proven_work ELSE 'NONE' END;
 IF mode<>'NONE' THEN
  UPDATE pathways_rules_internal.project_state s SET required_generation=s.required_generation+1,
   source_watermark=s.source_watermark+CASE WHEN mode='W_G' THEN 1 ELSE 0 END WHERE s.organization_id=c.organization_id AND s.project_id=c.project_id
   RETURNING s.required_generation,s.source_watermark INTO generation,watermark;
  work_id:=pg_catalog.gen_random_uuid();
 END IF;
 INSERT INTO pathways_rules_internal.source_operation_receipts(operation_id,organization_id,project_id,actor_id,operation_code,
  request_kind,request_id,phase,canonical_request_hash,source_record_id,source_revision,source_before_fingerprint,source_after_fingerprint,
  work_mode,work_item_id,work_generation,work_watermark,proof_handle,proof_transaction_id,proof_backend_pid,proof_login)
 VALUES(receipt_id,c.organization_id,c.project_id,c.actor_id,c.operation_code,c.request_kind,c.request_id,c.phase,c.canonical_request_hash,
  c.source_record_id,c.source_revision,c.source_before_fingerprint,c.source_after_fingerprint,mode,work_id,generation,watermark,
  c.handle,c.transaction_id,c.backend_pid,c.login_name);
 IF mode<>'NONE' THEN
  source_kind:=CASE WHEN c.operation_code='PROJECT_UPDATE' THEN 'PROJECT' WHEN c.operation_code LIKE 'ACTIVITY_%' THEN 'ACTIVITY'
   WHEN c.operation_code='INDICATOR_MEASUREMENT' THEN 'INDICATOR_MEASUREMENT' ELSE 'INDICATOR' END;
  INSERT INTO pathways_rules_internal.work_items(id,organization_id,project_id,generation,identity_kind,identity_id,source_watermark,
   source_kind,source_record_id,actor_id,queued_at) VALUES(work_id,c.organization_id,c.project_id,generation,'SOURCE',receipt_id::text,watermark,
   source_kind,c.source_record_id,c.actor_id,pg_catalog.clock_timestamp());
  UPDATE pathways_rules_internal.jobs j SET pending_since=CASE WHEN j.state IN ('IDLE','FAILED') THEN pg_catalog.clock_timestamp() ELSE j.pending_since END,
   next_attempt_at=CASE WHEN j.state IN ('IDLE','FAILED') THEN pg_catalog.clock_timestamp() ELSE j.next_attempt_at END,
   state=CASE WHEN j.state='LEASED' THEN 'LEASED' ELSE 'PENDING' END,operational_failures=0
   WHERE j.organization_id=c.organization_id AND j.project_id=c.project_id;
 END IF;
 IF pathways.p06_can(permission,c.project_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways_rules_internal.source_operation_context x WHERE x.handle=c.handle;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 RETURN pg_catalog.jsonb_build_object('requestId',c.request_id,'committed',true,'replayed',false);
END $$;


-- source-completion.proposed.sql
-- An immutable receipt must survive context cleanup; unfinished or later-changed
-- source roots cannot commit merely by changing constraint timing.
CREATE FUNCTION pathways_rules_internal.assert_source_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r pathways_rules_internal.source_operation_receipts; row_value jsonb; permission text;
BEGIN
 IF NEW.login_name IS DISTINCT FROM session_user OR session_user IS DISTINCT FROM 'pathways_runtime'
  OR NEW.transaction_id IS DISTINCT FROM pg_catalog.pg_current_xact_id() OR NEW.backend_pid IS DISTINCT FROM pg_catalog.pg_backend_pid()
  OR NEW.organization_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid OR NEW.actor_id IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Source completion unavailable' USING ERRCODE='42501'; END IF;
 SELECT cat.permission_code INTO permission FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=NEW.operation_code;
 IF pathways.p06_can(permission,NEW.project_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Source completion unavailable' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO r FROM pathways_rules_internal.source_operation_receipts x WHERE x.proof_handle=NEW.handle
  AND x.organization_id=NEW.organization_id AND x.project_id=NEW.project_id AND x.actor_id=NEW.actor_id;
 IF NOT FOUND OR r.operation_code IS DISTINCT FROM NEW.operation_code OR r.request_kind IS DISTINCT FROM NEW.request_kind
  OR r.request_id IS DISTINCT FROM NEW.request_id OR r.phase IS DISTINCT FROM NEW.phase
  OR r.canonical_request_hash IS DISTINCT FROM NEW.canonical_request_hash OR r.source_record_id IS DISTINCT FROM NEW.source_record_id
  OR r.proof_transaction_id IS DISTINCT FROM NEW.transaction_id OR r.proof_backend_pid IS DISTINCT FROM NEW.backend_pid
  OR r.proof_login IS DISTINCT FROM NEW.login_name OR r.source_before_fingerprint IS DISTINCT FROM NEW.expected_before_business_hash
  OR r.source_after_fingerprint IS DISTINCT FROM NEW.expected_after_business_hash
  OR EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_context c WHERE c.handle=NEW.handle) THEN
  RAISE EXCEPTION 'Source operation unfinished' USING ERRCODE='23514'; END IF;
 row_value:=pathways_rules_internal.read_source_row(NEW.operation_code,NEW.organization_id,NEW.project_id,NEW.source_record_id);
 IF row_value IS NULL OR pathways_rules_internal.source_business_fingerprint(row_value) IS DISTINCT FROM NEW.expected_after_business_hash THEN
  RAISE EXCEPTION 'Source changed after completion' USING ERRCODE='23514'; END IF;
 PERFORM pathways_rules_internal.assert_source_companions(NEW);
 IF r.work_mode<>'NONE' AND NOT EXISTS(SELECT 1 FROM pathways_rules_internal.work_items w WHERE w.organization_id=r.organization_id
  AND w.project_id=r.project_id AND w.id=r.work_item_id AND w.identity_kind='SOURCE' AND w.identity_id=r.operation_id::text
  AND w.source_record_id=r.source_record_id AND w.actor_id=r.actor_id AND w.generation=r.work_generation AND w.source_watermark=r.work_watermark
  AND w.source_kind=CASE WHEN r.operation_code='PROJECT_UPDATE' THEN 'PROJECT' WHEN r.operation_code LIKE 'ACTIVITY_%' THEN 'ACTIVITY'
   WHEN r.operation_code='INDICATOR_MEASUREMENT' THEN 'INDICATOR_MEASUREMENT' ELSE 'INDICATOR' END) THEN
  RAISE EXCEPTION 'Source work missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER f10_source_completion AFTER INSERT ON pathways_rules_internal.source_operation_context
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.assert_source_completed();

CREATE FUNCTION pathways_rules_internal.fence_completed_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE root_id uuid:=OLD.id; org uuid:=OLD.organization_id; project uuid; relation_name text;
BEGIN
 IF TG_WHEN IS DISTINCT FROM 'BEFORE' OR TG_LEVEL IS DISTINCT FROM 'ROW' OR TG_OP NOT IN ('UPDATE','DELETE') THEN
  RAISE EXCEPTION 'Invalid source fence' USING ERRCODE='42501'; END IF;
 project:=CASE WHEN TG_RELID='pathways.projects'::regclass THEN root_id ELSE (pg_catalog.to_jsonb(OLD)->>'project_id')::uuid END;
 IF session_user='pathways_runtime' AND EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_receipts r
  WHERE r.proof_transaction_id=pg_catalog.pg_current_xact_id() AND r.proof_backend_pid=pg_catalog.pg_backend_pid() AND r.proof_login=session_user
   AND r.organization_id=org AND r.project_id=project AND r.source_record_id=root_id) THEN
  RAISE EXCEPTION 'Finalized source is immutable in this transaction' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER f10_fence_project_source BEFORE UPDATE OR DELETE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.fence_completed_source();
CREATE TRIGGER f10_fence_activity_source BEFORE UPDATE OR DELETE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.fence_completed_source();
CREATE TRIGGER f10_fence_indicator_source BEFORE UPDATE OR DELETE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.fence_completed_source();
CREATE TRIGGER f10_fence_measurement_source BEFORE UPDATE OR DELETE ON pathways.project_indicator_measurements FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.fence_completed_source();

ALTER FUNCTION pathways_rules_internal.read_source_row(text,uuid,uuid,uuid) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways_rules_internal.assert_source_companions(pathways_rules_internal.source_operation_context) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways_rules_internal.assert_source_completed() OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways_rules_internal.fence_completed_source() OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways.f10_finish_source_operation(uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.read_source_row(text,uuid,uuid,uuid),
 pathways_rules_internal.assert_source_companions(pathways_rules_internal.source_operation_context),pathways_rules_internal.assert_source_completed(),
 pathways_rules_internal.fence_completed_source(),pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb),
 pathways.f10_finish_source_operation(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb),pathways.f10_finish_source_operation(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) TO rules_enqueue_owner;


-- source-policies.proposed.sql
-- No machine role can read or invoke these human source helpers.
CREATE FUNCTION pathways_rules_internal.source_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND org=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS NOT NULL AND project IS NOT NULL AND
  (pathways.p06_can('projects.update',project) IS TRUE OR pathways.p06_can('activities.create',project) IS TRUE
   OR pathways.p06_can('activities.update',project) IS TRUE OR pathways.p06_can('activities.complete',project) IS TRUE
   OR pathways.p06_can('evidence.review',project) IS TRUE OR pathways.p06_can('activities.proof.submit',project) IS TRUE
   OR pathways.p06_can('indicators.create',project) IS TRUE OR pathways.p06_can('indicators.update',project) IS TRUE
   OR pathways.p06_can('indicators.archive',project) IS TRUE OR pathways.p06_can('rules.create',project) IS TRUE
   OR pathways.p06_can('rules.update',project) IS TRUE OR pathways.p06_can('rules.activate',project) IS TRUE)
$$;
ALTER FUNCTION pathways_rules_internal.source_scope(uuid,uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;

CREATE POLICY f10_enqueue_state_read ON pathways_rules_internal.project_state FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_state_insert ON pathways_rules_internal.project_state FOR INSERT TO rules_enqueue_owner
 WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_state_update ON pathways_rules_internal.project_state FOR UPDATE TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_calendar_read ON pathways_rules_internal.calendar_configuration FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid IS NOT NULL AND nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS NOT NULL);
CREATE POLICY f10_enqueue_project_read ON pathways.projects FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,id));
CREATE POLICY f10_enqueue_project_lock ON pathways.projects FOR UPDATE TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,id)) WITH CHECK(pathways_rules_internal.source_scope(organization_id,id));
CREATE POLICY f10_enqueue_activity_read ON pathways.project_activities FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_activity_lock ON pathways.project_activities FOR UPDATE TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_indicator_read ON pathways.project_indicators FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_indicator_lock ON pathways.project_indicators FOR UPDATE TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT,UPDATE(updated_at) ON pathways.projects,pathways.project_activities,pathways.project_indicators TO rules_enqueue_owner;
-- Full business-row matching is restricted to authorized root writes. The new
-- measurement row is the actor's own currently protected root, not a metric feed.
GRANT SELECT ON pathways.project_indicator_measurements TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_measurement_read ON pathways.project_indicator_measurements FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND recorded_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('indicators.update',project_id) IS TRUE);
GRANT SELECT ON pathways.activity_updates TO rules_enqueue_owner;
GRANT UPDATE(updated_at) ON pathways.activity_updates TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_proof_read ON pathways.activity_updates FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)));
CREATE POLICY f10_enqueue_proof_lock ON pathways.activity_updates FOR UPDATE TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)))
 WITH CHECK(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)));
GRANT SELECT(id,organization_id,project_id,activity_id,activity_update_id,file_name,sha256,content_type,byte_size,storage_ready,
 status,submitted_by_id,verified_by_id,verified_at,rejected_by_id,rejected_at,rejection_reason),UPDATE(updated_at) ON pathways.evidence_media TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_media_read ON pathways.evidence_media FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)));
CREATE POLICY f10_enqueue_media_lock ON pathways.evidence_media FOR UPDATE TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)))
 WITH CHECK(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('evidence.review',project_id) IS TRUE
   OR (submitted_by_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways.p06_can('activities.proof.submit',project_id) IS TRUE)));
-- No object key, bytes, identifying flag, consent flag, private download or
-- Beneficiary/form/journey-event payload is granted to the source owner.
GRANT SELECT(id,organization_id,project_id,indicator_id,recipe,activity_id,form_id,form_version,field_id)
 ON pathways.project_indicator_bindings TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_binding_metadata ON pathways.project_indicator_bindings FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,indicator_id,definition_revision,classification_revision,source_fingerprint,decision,audience,approved_at,expires_at)
 ON pathways_rules_internal.eligibility TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_classification_read ON pathways_rules_internal.eligibility FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('indicators.update',project_id) IS TRUE);
GRANT EXECUTE ON FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text) TO rules_enqueue_owner;
GRANT SELECT(id,organization_id,project_id,status,runtime_contract_version) ON pathways.alert_rules TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_active_manifest ON pathways.alert_rules FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,user_id,status,ended_at) ON pathways.user_project_assignments TO rules_enqueue_owner;
GRANT SELECT(id,organization_id,role_id) ON pathways.system_users TO rules_enqueue_owner;
GRANT SELECT(id,code) ON pathways.roles TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_assignment_read ON pathways.user_project_assignments FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_user_role_metadata ON pathways.system_users FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM pathways.user_project_assignments a WHERE a.organization_id=system_users.organization_id AND a.user_id=system_users.id
   AND pathways_rules_internal.source_scope(a.organization_id,a.project_id)));
CREATE POLICY f10_enqueue_role_metadata ON pathways.roles FOR SELECT TO rules_enqueue_owner USING(session_user='pathways_runtime');
GRANT SELECT(id,organization_id,project_id,activity_id,project_assignment_id,status,ended_at) ON pathways.project_activity_assignments TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_activity_assignment_read ON pathways.project_activity_assignments FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT(organization_id,project_id,activity_id,indicator_id) ON pathways.activity_indicator_links TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_indicator_link_read ON pathways.activity_indicator_links FOR SELECT TO rules_enqueue_owner USING(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT(organization_id,project_id,activity_id,stage_id) ON pathways.activity_journey_stage_mappings TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_journey_link_read ON pathways.activity_journey_stage_mappings FOR SELECT TO rules_enqueue_owner USING(pathways_rules_internal.source_scope(organization_id,project_id));
GRANT SELECT(organization_id,project_id,activity_id,category,currency,planned_budget,archived_at) ON pathways.project_budget_records TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_budget_check ON pathways.project_budget_records FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('budgets.create',project_id) IS TRUE AND (pathways.p06_can('budgets.update',project_id) IS TRUE
   OR EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_context c WHERE c.organization_id=project_budget_records.organization_id
    AND c.project_id=project_budget_records.project_id AND c.source_record_id=project_budget_records.activity_id AND c.operation_code='ACTIVITY_CREATE'
    AND c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user)));
GRANT SELECT(organization_id,project_id,partner_id) ON pathways.project_implementing_partners TO rules_enqueue_owner;
GRANT SELECT(id,organization_id,normalized_name) ON pathways.implementing_partners TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_partner_link ON pathways.project_implementing_partners FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('projects.update',project_id) IS TRUE);
CREATE POLICY f10_enqueue_partner_metadata ON pathways.implementing_partners FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON pathways_rules_internal.jobs,pathways_rules_internal.work_items TO rules_enqueue_owner;
GRANT UPDATE(pending_since,next_attempt_at,state,operational_failures) ON pathways_rules_internal.jobs TO rules_enqueue_owner;
CREATE POLICY f10_enqueue_job_read ON pathways_rules_internal.jobs FOR SELECT TO rules_enqueue_owner USING(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_job_insert ON pathways_rules_internal.jobs FOR INSERT TO rules_enqueue_owner WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_job_update ON pathways_rules_internal.jobs FOR UPDATE TO rules_enqueue_owner USING(pathways_rules_internal.source_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.source_scope(organization_id,project_id));
CREATE POLICY f10_enqueue_work_read ON pathways_rules_internal.work_items FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND identity_kind='SOURCE' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid);
CREATE POLICY f10_enqueue_work_insert ON pathways_rules_internal.work_items FOR INSERT TO rules_enqueue_owner
 WITH CHECK(identity_kind='SOURCE' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM pathways_rules_internal.source_operation_receipts r WHERE r.operation_id::text=work_items.identity_id
   AND r.organization_id=work_items.organization_id AND r.project_id=work_items.project_id AND r.actor_id=work_items.actor_id
   AND r.work_item_id=work_items.id AND r.work_generation=work_items.generation AND r.work_watermark=work_items.source_watermark));


CREATE POLICY f10_enqueue_rule_work_read ON pathways_rules_internal.work_items FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND identity_kind='RULE'
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND source_watermark IS NULL AND source_kind IS NULL AND source_record_id IS NULL
  AND EXISTS(SELECT FROM pathways_rules_internal.configuration_context c
   JOIN pathways_rules_internal.configuration_receipts r ON r.organization_id=c.organization_id
    AND r.project_id=c.project_id AND r.actor_id=c.actor_id AND r.client_operation_id=c.operation_id
    AND r.operation_code=c.operation_code AND r.rule_id=c.target_rule_id AND r.canonical_request_hash=c.canonical_request_hash
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE')
    AND c.organization_id=work_items.organization_id AND c.project_id=work_items.project_id
    AND c.actor_id=work_items.actor_id AND r.id::text=work_items.identity_id
    AND pathways.p06_can(CASE c.operation_code WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END,c.project_id) IS TRUE));
CREATE POLICY f10_enqueue_rule_work_insert ON pathways_rules_internal.work_items FOR INSERT TO rules_enqueue_owner
 WITH CHECK(session_user='pathways_runtime' AND identity_kind='RULE'
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND source_watermark IS NULL AND source_kind IS NULL AND source_record_id IS NULL
  AND EXISTS(SELECT FROM pathways_rules_internal.configuration_context c
   JOIN pathways_rules_internal.configuration_receipts r ON r.organization_id=c.organization_id
    AND r.project_id=c.project_id AND r.actor_id=c.actor_id AND r.client_operation_id=c.operation_id
    AND r.operation_code=c.operation_code AND r.rule_id=c.target_rule_id AND r.canonical_request_hash=c.canonical_request_hash
   JOIN pathways_rules_internal.project_state s ON s.organization_id=c.organization_id AND s.project_id=c.project_id
   JOIN pathways.alert_rules a ON a.organization_id=c.organization_id AND a.project_id=c.project_id AND a.id=c.target_rule_id
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.operation_code IN ('RULE_ACTIVATE','RULE_ARCHIVE')
    AND c.organization_id=work_items.organization_id AND c.project_id=work_items.project_id
    AND c.actor_id=work_items.actor_id AND r.id::text=work_items.identity_id
    AND work_items.generation=c.admitted_generation+1 AND s.required_generation=work_items.generation
    AND s.bootstrap_complete AND s.source_watermark=c.admitted_watermark
    AND a.runtime_contract_version='f10.v1' AND a.status::text=CASE c.operation_code WHEN 'RULE_ACTIVATE' THEN 'ACTIVE' ELSE 'ARCHIVED' END
    AND pathways.p06_can(CASE c.operation_code WHEN 'RULE_ACTIVATE' THEN 'rules.activate' ELSE 'rules.update' END,c.project_id) IS TRUE));

-- eligibility-human-policies.proposed.sql
-- Proposed0031 exact metadata-only human predicate authority.
GRANT EXECUTE ON FUNCTION pathways.p06_can(text,uuid)
 TO rules_eligibility_owner,rules_capacity_owner,rules_config_owner,rules_human_owner,rules_outcome_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid)
 TO rules_capacity_owner,rules_config_owner,rules_human_owner,rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,runtime_contract_version,conditions_json,status,activated_at,created_by_id)
 ON pathways.alert_rules TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_rule_metadata ON pathways.alert_rules FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
CREATE POLICY f10_eligibility_rule_metadata_guard ON pathways.alert_rules AS RESTRICTIVE FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,revision,measurement_mode,numeric_kind,period_start,period_end,archived_at)
 ON pathways.project_indicators TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_indicator_metadata ON pathways.project_indicators FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
CREATE POLICY f10_eligibility_indicator_metadata_guard ON pathways.project_indicators AS RESTRICTIVE FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,indicator_id,recipe,activity_id,contract_version)
 ON pathways.project_indicator_bindings TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_binding_metadata ON pathways.project_indicator_bindings FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
CREATE POLICY f10_eligibility_binding_metadata_guard ON pathways.project_indicator_bindings AS RESTRICTIVE FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id) ON pathways.project_activities TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_activity_metadata ON pathways.project_activities FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
CREATE POLICY f10_eligibility_activity_metadata_guard ON pathways.project_activities AS RESTRICTIVE FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,indicator_id,definition_revision,classification_revision,
 decision,approved_at,expires_at,source_fingerprint,audience)
 ON pathways_rules_internal.eligibility TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_current_scope ON pathways_rules_internal.eligibility FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(organization_id,project_id,rule_version_id,condition_id,metric_key,indicator_id,activity_id,
 definition_revision,classification_id,source_fingerprint)
 ON pathways_rules_internal.rule_bindings TO rules_eligibility_owner;
CREATE POLICY f10_eligibility_rule_binding_scope ON pathways_rules_internal.rule_bindings FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
-- Forward classification authoring remains administrator-approved SQL only.
-- No executable classifier/approver is granted to human or machine logins.


-- configuration-policies.proposed.sql
-- Proposed0031 exact configuration marker, private receipt and binding policies.
CREATE FUNCTION pathways_rules_internal.configuration_record_scope(org uuid,project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT session_user='pathways_runtime' AND EXISTS(SELECT FROM pathways_rules_internal.configuration_context c
  WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
   AND c.login_name=session_user AND c.organization_id=org AND c.project_id IS NOT DISTINCT FROM project
   AND c.organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
   AND pathways.p09_can(CASE c.operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update'
    WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END) IS TRUE
   AND (project IS NULL OR pathways.p06_can(CASE c.operation_code WHEN 'RULE_CREATE' THEN 'rules.create'
    WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END,project) IS TRUE))
$$;
ALTER FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid)
 TO rules_eligibility_owner,rules_runtime_guard_owner,rules_enqueue_owner;

GRANT SELECT,INSERT,DELETE ON pathways_rules_internal.configuration_context TO rules_config_owner;
CREATE POLICY f10_configuration_current_actor ON pathways_rules_internal.configuration_context FOR ALL TO rules_config_owner
 USING(session_user='pathways_runtime' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p09_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END) IS TRUE AND (project_id IS NULL OR pathways.p06_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END,project_id) IS TRUE)))
 WITH CHECK(session_user='pathways_runtime' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p09_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END) IS TRUE AND (project_id IS NULL OR pathways.p06_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END,project_id) IS TRUE)));
GRANT SELECT ON pathways_rules_internal.configuration_context TO rules_eligibility_owner,rules_runtime_guard_owner,rules_enqueue_owner;
CREATE POLICY f10_configuration_helper_metadata ON pathways_rules_internal.configuration_context
 FOR SELECT TO rules_eligibility_owner,rules_runtime_guard_owner,rules_enqueue_owner
 USING(session_user='pathways_runtime' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p09_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END) IS TRUE AND (project_id IS NULL OR pathways.p06_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update' WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END,project_id) IS TRUE)));

GRANT SELECT,INSERT ON pathways_rules_internal.configuration_receipts TO rules_config_owner;
CREATE POLICY f10_configuration_receipt_current_actor_read ON pathways_rules_internal.configuration_receipts FOR SELECT TO rules_config_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND pathways.p09_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update'
   WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END) IS TRUE
  AND (project_id IS NULL OR pathways.p06_can(CASE operation_code WHEN 'RULE_CREATE' THEN 'rules.create' WHEN 'RULE_DRAFT' THEN 'rules.update'
   WHEN 'RULE_ACTIVATE' THEN 'rules.activate' WHEN 'RULE_ARCHIVE' THEN 'rules.update' END,project_id) IS TRUE));
CREATE POLICY f10_configuration_receipt_current_actor_insert ON pathways_rules_internal.configuration_receipts FOR INSERT TO rules_config_owner
 WITH CHECK(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE
  AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND EXISTS(SELECT FROM pathways_rules_internal.configuration_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user
    AND c.organization_id=configuration_receipts.organization_id AND c.actor_id=configuration_receipts.actor_id
    AND c.operation_id=configuration_receipts.client_operation_id AND c.operation_code=configuration_receipts.operation_code
    AND c.target_rule_id=configuration_receipts.rule_id AND c.canonical_request_hash=configuration_receipts.canonical_request_hash));
GRANT SELECT(id,organization_id,project_id,actor_id,client_operation_id,operation_code,rule_id,canonical_request_hash)
 ON pathways_rules_internal.configuration_receipts TO rules_enqueue_owner;
CREATE POLICY f10_configuration_receipt_enqueue_proof ON pathways_rules_internal.configuration_receipts FOR SELECT TO rules_enqueue_owner
 USING(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid);

GRANT INSERT(organization_id,project_id,rule_version_id,condition_id,metric_key,indicator_id,activity_id,
 definition_revision,classification_id,source_fingerprint) ON pathways_rules_internal.rule_bindings TO rules_eligibility_owner;
CREATE POLICY f10_configuration_binding_insert ON pathways_rules_internal.rule_bindings FOR INSERT TO rules_eligibility_owner
 WITH CHECK(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE
  AND EXISTS(SELECT FROM pathways_rules_internal.configuration_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
   AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.organization_id=rule_bindings.organization_id
   AND c.project_id=rule_bindings.project_id AND c.target_rule_id=rule_bindings.rule_version_id AND c.operation_code IN ('RULE_CREATE','RULE_DRAFT')));
GRANT SELECT(organization_id,project_id,required_generation,source_watermark) ON pathways_rules_internal.project_state TO rules_config_owner;
CREATE POLICY f10_configuration_state_metadata ON pathways_rules_internal.project_state FOR SELECT TO rules_config_owner
 USING(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE);
GRANT SELECT(id,organization_id,project_id,rule_version_id,superseded),UPDATE(superseded)
 ON pathways_rules_internal.evaluations TO rules_config_owner;
CREATE POLICY f10_configuration_evaluation_metadata ON pathways_rules_internal.evaluations FOR SELECT TO rules_config_owner
 USING(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_configuration_supersede_fixed ON pathways_rules_internal.evaluations FOR UPDATE TO rules_config_owner
 USING(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE AND NOT superseded)
 WITH CHECK(pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE AND superseded);
-- The fixed helper proves archived target/receipt and exactlyG+1/W unchanged;
-- owner has no UPDATE privilege for evidence, sequence, rule, scope or snapshot.


-- feature-human-policies.proposed.sql
-- Proposed0031 exact actor/operation-scoped private storage policies.
-- Not installed/executed. Requires fixed wrappers plus append-only guards.
CREATE FUNCTION pathways_rules_internal.feature_record_scope(
 org uuid,project uuid,alert uuid,recommendation uuid,actor uuid,client_operation uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.feature_human_scope(org,project) IS TRUE
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project
    AND c.actor_id=actor AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND c.alert_id=alert
    AND c.recommendation_id IS NOT DISTINCT FROM recommendation
    AND c.operation_id=client_operation)
$$;
ALTER FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid)
 OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid)
 TO rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) TO rules_runtime_guard_owner;
GRANT SELECT(transaction_id,backend_pid,login_name,organization_id,project_id,actor_id,
 operation_id,purpose,operation_code,alert_id,recommendation_id,preview_id,canonical_request_hash)
 ON pathways_rules_internal.feature_operation_context TO rules_runtime_guard_owner;
CREATE POLICY f10_feature_context_guard_read ON pathways_rules_internal.feature_operation_context
 FOR SELECT TO rules_runtime_guard_owner
 USING(transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE);

-- Receipts are readable by the current actor under the current operation before
-- hash comparison. Mismatched committed retries must conflict, not appear absent.
CREATE POLICY f10_receipt_actor_read ON pathways_rules_internal.feature_operation_receipts
 FOR SELECT TO rules_outcome_owner,rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_record_scope(organization_id,project_id,alert_id,recommendation_id,actor_id,client_operation_id));
CREATE POLICY f10_receipt_actor_insert ON pathways_rules_internal.feature_operation_receipts
 FOR INSERT TO rules_outcome_owner
 WITH CHECK(pathways_rules_internal.feature_record_scope(organization_id,project_id,alert_id,recommendation_id,actor_id,client_operation_id));
GRANT SELECT(id,organization_id,project_id,actor_id,client_operation_id,operation_code,
 alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at),
 INSERT(id,organization_id,project_id,actor_id,client_operation_id,operation_code,
 alert_id,recommendation_id,preview_id,canonical_request_hash,safe_result,occurred_at)
 ON pathways_rules_internal.feature_operation_receipts TO rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,actor_id,client_operation_id,operation_code,alert_id,recommendation_id)
 ON pathways_rules_internal.feature_operation_receipts TO rules_runtime_guard_owner;

CREATE POLICY f10_alert_review_actor_read ON pathways_rules_internal.alert_reviews
 FOR SELECT TO rules_outcome_owner,rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE
  AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.alert_id=alert_reviews.alert_id AND c.operation_code='ALERT_REVIEW'));
CREATE POLICY f10_alert_review_actor_insert ON pathways_rules_internal.alert_reviews
 FOR INSERT TO rules_outcome_owner
 WITH CHECK(pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE
  AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   JOIN pathways_rules_internal.feature_operation_receipts o ON o.client_operation_id=c.operation_id
    AND o.organization_id=c.organization_id AND o.project_id=c.project_id AND o.actor_id=c.actor_id
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.alert_id=alert_reviews.alert_id AND c.operation_code='ALERT_REVIEW'
    AND o.id=alert_reviews.operation_receipt_id AND o.operation_code='ALERT_REVIEW'));
GRANT SELECT(id,organization_id,project_id,alert_id,actor_id,operation_receipt_id,state_before,state_after,note,occurred_at),
 INSERT(id,organization_id,project_id,alert_id,actor_id,operation_receipt_id,state_before,state_after,note,occurred_at)
 ON pathways_rules_internal.alert_reviews TO rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,alert_id,actor_id,operation_receipt_id,state_before,state_after,occurred_at)
 ON pathways_rules_internal.alert_reviews TO rules_runtime_guard_owner;

CREATE POLICY f10_decision_actor_read ON pathways_rules_internal.decisions
 FOR SELECT TO rules_outcome_owner,rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_record_scope(organization_id,project_id,alert_id,recommendation_id,actor_id,client_operation_id));
CREATE POLICY f10_decision_actor_insert ON pathways_rules_internal.decisions
 FOR INSERT TO rules_outcome_owner
 WITH CHECK(pathways_rules_internal.feature_record_scope(organization_id,project_id,alert_id,recommendation_id,actor_id,client_operation_id)
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.operation_id=decisions.client_operation_id
    AND c.operation_code IN ('ALERT_CONFIRM','RECOMMENDATION_CONFIRM')));
GRANT SELECT(id,organization_id,project_id,alert_id,recommendation_id,actor_id,operation_receipt_id,
 outcome,note,client_operation_id,request_digest,created_at),
 INSERT(id,organization_id,project_id,alert_id,recommendation_id,actor_id,operation_receipt_id,
 outcome,note,client_operation_id,request_digest,created_at)
 ON pathways_rules_internal.decisions TO rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,alert_id,recommendation_id,actor_id,operation_receipt_id,
 outcome,client_operation_id,created_at)
 ON pathways_rules_internal.decisions TO rules_runtime_guard_owner;
-- Other private rows, preview consumption, recommendation review and machine
-- lifecycle provenance require their own exact policies before full extraction.
-- No human read owner/login receives notes or note-presence metadata here.


-- feature-preview-policies.proposed.sql
-- Proposed0031 outcome-only private preview and recommendation-review rights.
CREATE FUNCTION pathways_rules_internal.feature_preview_scope(org uuid,project uuid,alert uuid,recommendation uuid,actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pathways_rules_internal.feature_human_scope(org,project) IS TRUE AND actor=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project AND c.actor_id=actor
    AND c.alert_id=alert AND c.recommendation_id IS NOT DISTINCT FROM recommendation
    AND c.operation_code IN ('ALERT_PREVIEW','ALERT_CONFIRM','RECOMMENDATION_PREVIEW','RECOMMENDATION_CONFIRM'))
$$;
ALTER FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid) TO rules_runtime_guard_owner;
GRANT SELECT,INSERT ON pathways_rules_internal.outcome_previews TO rules_outcome_owner;
GRANT UPDATE(consumed_by_decision) ON pathways_rules_internal.outcome_previews TO rules_outcome_owner;
CREATE POLICY f10_preview_owner_read ON pathways_rules_internal.outcome_previews FOR SELECT TO rules_outcome_owner
 USING(pathways_rules_internal.feature_preview_scope(organization_id,project_id,alert_id,recommendation_id,actor_id) IS TRUE);
CREATE POLICY f10_preview_owner_insert ON pathways_rules_internal.outcome_previews FOR INSERT TO rules_outcome_owner
 WITH CHECK(pathways_rules_internal.feature_preview_scope(organization_id,project_id,alert_id,recommendation_id,actor_id) IS TRUE
  AND consumed_by_decision IS NULL AND (NOT write_alert OR pathways.p06_can('alerts.outcome.record',project_id) IS TRUE)
  AND (NOT write_recommendation OR pathways.p06_can('recommendations.outcome.record',project_id) IS TRUE));
CREATE POLICY f10_preview_owner_consume ON pathways_rules_internal.outcome_previews FOR UPDATE TO rules_outcome_owner
 USING(pathways_rules_internal.feature_preview_scope(organization_id,project_id,alert_id,recommendation_id,actor_id) IS TRUE AND consumed_by_decision IS NULL)
 WITH CHECK(pathways_rules_internal.feature_preview_scope(organization_id,project_id,alert_id,recommendation_id,actor_id) IS TRUE
  AND consumed_by_decision IS NOT NULL AND (NOT write_alert OR pathways.p06_can('alerts.outcome.record',project_id) IS TRUE)
  AND (NOT write_recommendation OR pathways.p06_can('recommendations.outcome.record',project_id) IS TRUE));
GRANT SELECT(id,organization_id,project_id,actor_id,alert_id,recommendation_id,operation_kind,creating_operation_code,write_alert,write_recommendation,
 expected_alert_revision,expected_recommendation_revision,outcome,created_at,expires_at,consumed_by_decision)
 ON pathways_rules_internal.outcome_previews TO rules_human_owner,rules_runtime_guard_owner;
CREATE POLICY f10_preview_fixed_confirmation_metadata ON pathways_rules_internal.outcome_previews FOR SELECT TO rules_human_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND ((creating_operation_code='ALERT_PREVIEW' AND pathways.p06_can('alerts.outcome.record',project_id) IS TRUE)
   OR (creating_operation_code='RECOMMENDATION_PREVIEW' AND pathways.p06_can('recommendations.outcome.record',project_id) IS TRUE))
  AND (NOT write_alert OR pathways.p06_can('alerts.outcome.record',project_id) IS TRUE)
  AND (NOT write_recommendation OR pathways.p06_can('recommendations.outcome.record',project_id) IS TRUE));
CREATE POLICY f10_preview_guard_fixed_metadata ON pathways_rules_internal.outcome_previews FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_preview_scope(organization_id,project_id,alert_id,recommendation_id,actor_id) IS TRUE);
-- No note, fingerprint, recipient list, digest, message or presence flag grant
-- is added to human readers/guard. Fixed confirmation metadata helper selects
-- only owned resource IDs, purpose and required write flags/revision tokens.

GRANT SELECT,INSERT ON pathways_rules_internal.recommendation_reviews TO rules_outcome_owner;
CREATE POLICY f10_recommendation_review_actor ON pathways_rules_internal.recommendation_reviews FOR SELECT TO rules_outcome_owner
 USING(pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
   AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.recommendation_id=recommendation_reviews.recommendation_id
   AND c.operation_code='RECOMMENDATION_REVIEW'));
CREATE POLICY f10_recommendation_review_actor_insert ON pathways_rules_internal.recommendation_reviews FOR INSERT TO rules_outcome_owner
 WITH CHECK(pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT FROM pathways_rules_internal.feature_operation_context c JOIN pathways_rules_internal.feature_operation_receipts o
   ON o.organization_id=c.organization_id AND o.project_id=c.project_id AND o.actor_id=c.actor_id AND o.client_operation_id=c.operation_id
   WHERE c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user
    AND c.operation_code='RECOMMENDATION_REVIEW' AND c.recommendation_id=recommendation_reviews.recommendation_id
    AND o.id=recommendation_reviews.operation_receipt_id));
GRANT SELECT(id,organization_id,project_id,recommendation_id,actor_id,operation_receipt_id,occurred_at)
 ON pathways_rules_internal.recommendation_reviews TO rules_runtime_guard_owner;
CREATE POLICY f10_recommendation_review_guard_metadata ON pathways_rules_internal.recommendation_reviews FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid);


-- projection-authority.proposed.sql
-- Numeric source reads are admitted by a live lease AND exact current metadata
-- eligibility. Neither machine login is granted a table privilege.
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid) TO rules_projection_owner,rules_commit_owner,rules_eligibility_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.eligibility_metadata_scope(uuid,uuid) TO rules_eligibility_owner;
GRANT SELECT(id,organization_id,start_date,end_date,status,archived_at) ON pathways.projects TO rules_projection_owner,rules_commit_owner,rules_eligibility_owner;
CREATE POLICY f10_projection_project_metadata ON pathways.projects FOR SELECT TO rules_projection_owner,rules_commit_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,id));
CREATE POLICY f10_freshness_project_metadata ON pathways.projects FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,id));
GRANT SELECT(id,organization_id,project_id,status,planned_start_date,planned_end_date,actual_start_date,actual_end_date,archived_at)
 ON pathways.project_activities TO rules_projection_owner,rules_commit_owner,rules_eligibility_owner;
CREATE POLICY f10_projection_activity_metadata ON pathways.project_activities FOR SELECT TO rules_projection_owner,rules_commit_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,measurement_mode,numeric_kind,direction,display_precision,period_start,period_end,revision,
 baseline_value,target_value,unit_label,archived_at) ON pathways.project_indicators TO rules_projection_owner;
CREATE POLICY f10_projection_indicator_numeric ON pathways.project_indicators FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,id));
CREATE POLICY f10_projection_indicator_numeric_guard ON pathways.project_indicators AS RESTRICTIVE FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,id));
GRANT SELECT(id,organization_id,project_id,indicator_id,recipe,activity_id,contract_version) ON pathways.project_indicator_bindings TO rules_projection_owner;
CREATE POLICY f10_projection_indicator_binding ON pathways.project_indicator_bindings FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,indicator_id));
GRANT SELECT(id,organization_id,project_id,indicator_id,period_start,period_end,value,corrects_measurement_id,recorded_at)
 ON pathways.project_indicator_measurements TO rules_projection_owner;
CREATE POLICY f10_projection_measurement_numeric ON pathways.project_indicator_measurements FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,indicator_id));
CREATE POLICY f10_projection_measurement_numeric_guard ON pathways.project_indicator_measurements AS RESTRICTIVE FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_indicator_allowed(organization_id,project_id,indicator_id));
GRANT SELECT(id,organization_id,project_id,indicator_id,period_start,period_end,corrects_measurement_id,recorded_at)
 ON pathways.project_indicator_measurements TO rules_eligibility_owner;
CREATE POLICY f10_freshness_measurement_metadata ON pathways.project_indicator_measurements FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.eligibility_metadata_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,logical_rule_id,version,conditions_json,definition_digest,name,severity,runtime_contract_version,status,archived_at)
 ON pathways.alert_rules TO rules_projection_owner,rules_commit_owner;
CREATE POLICY f10_projection_active_rules ON pathways.alert_rules FOR SELECT TO rules_projection_owner,rules_commit_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,rule_id,title,text,type) ON pathways.alert_rule_recommendations TO rules_projection_owner,rules_commit_owner;
CREATE POLICY f10_projection_predefined ON pathways.alert_rule_recommendations FOR SELECT TO rules_projection_owner,rules_commit_owner
 USING(EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.id=alert_rule_recommendations.rule_id
  AND r.organization_id=alert_rule_recommendations.organization_id AND r.runtime_contract_version='f10.v1'
  AND pathways_rules_internal.lease_metric_scope(r.organization_id,r.project_id)));
GRANT SELECT(organization_id,project_id,rule_version_id,condition_id,metric_key,indicator_id,activity_id,definition_revision,classification_id,source_fingerprint)
 ON pathways_rules_internal.rule_bindings TO rules_projection_owner,rules_commit_owner;
CREATE POLICY f10_projection_rule_bindings ON pathways_rules_internal.rule_bindings FOR SELECT TO rules_projection_owner,rules_commit_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
-- Eligibility's own narrowly scoped metadata policy is used by the fixed
-- classification helpers; projection never needs classification note/value ACLs.
GRANT SELECT(id,organization_id,project_id,source_inputs,as_of) ON pathways_rules_internal.snapshots TO rules_eligibility_owner;
CREATE POLICY f10_freshness_snapshot_metadata ON pathways_rules_internal.snapshots FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,rule_id,latest_evaluation_id,origin_snapshot_id,runtime_contract_version)
 ON pathways.rule_based_alerts TO rules_eligibility_owner;
CREATE POLICY f10_freshness_alert_metadata ON pathways.rule_based_alerts FOR SELECT TO rules_eligibility_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.human_rules_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,alert_id,runtime_contract_version) ON pathways.decision_recommendations TO rules_eligibility_owner;
CREATE POLICY f10_freshness_linked_recommendation ON pathways.decision_recommendations FOR SELECT TO rules_eligibility_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.human_rules_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,superseded) ON pathways_rules_internal.evaluations TO rules_eligibility_owner;
CREATE POLICY f10_freshness_evaluation_metadata ON pathways_rules_internal.evaluations FOR SELECT TO rules_eligibility_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,project_id));


-- feature-authority.proposed.sql
-- Explicit DTO column grants exclude legacy private notes and note-presence data.
GRANT SELECT(id,organization_id,project_id,logical_rule_id,template_origin_id,display_code,version,name,severity,conditions_json,
 status,activated_at,archived_at,runtime_contract_version) ON pathways.alert_rules TO rules_human_owner;
CREATE POLICY f10_human_rule_read ON pathways.alert_rules FOR SELECT TO rules_human_owner
 USING(runtime_contract_version='f10.v1' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND ((project_id IS NULL AND pathways.p09_can('rules.read') IS TRUE)
   OR (project_id IS NOT NULL AND pathways_rules_internal.human_rules_scope(organization_id,project_id)
    AND pathways_rules_internal.rule_exposure_allowed(id))));
GRANT SELECT(id,organization_id,project_id,rule_id,title,message,severity,lifecycle,revision,evaluated_at,evaluated_snapshot,
 affected_kind,affected_id,episode_number,runtime_contract_version) ON pathways.rule_based_alerts TO rules_human_owner;
CREATE POLICY f10_human_alert_read ON pathways.rule_based_alerts FOR SELECT TO rules_human_owner
 USING(runtime_contract_version='f10.v1' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p06_can('alerts.read',project_id) IS TRUE OR pathways.p06_can('recommendations.read',project_id) IS TRUE)
  AND pathways_rules_internal.rule_exposure_allowed(rule_id));
GRANT SELECT(id,organization_id,project_id,alert_id,title,text,basis,status,revision,proposed_at,reviewed_at,runtime_contract_version)
 ON pathways.decision_recommendations TO rules_human_owner;
CREATE POLICY f10_human_recommendation_read ON pathways.decision_recommendations FOR SELECT TO rules_human_owner
 USING(runtime_contract_version='f10.v1' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways.p06_can('recommendations.read',project_id) IS TRUE
  AND EXISTS(SELECT 1 FROM pathways.rule_based_alerts a WHERE a.organization_id=decision_recommendations.organization_id
   AND a.project_id=decision_recommendations.project_id AND a.id=decision_recommendations.alert_id
   AND pathways_rules_internal.rule_exposure_allowed(a.rule_id)));
GRANT SELECT(id,organization_id,rule_id,title,text) ON pathways.alert_rule_recommendations TO rules_human_owner;
CREATE POLICY f10_human_predefined_read ON pathways.alert_rule_recommendations FOR SELECT TO rules_human_owner
 USING(EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=alert_rule_recommendations.organization_id AND r.id=alert_rule_recommendations.rule_id));

GRANT SELECT(id,organization_id,rule_id,title,text) ON pathways.alert_rule_recommendations TO rules_outcome_owner;
CREATE POLICY f10_outcome_predefined_read ON pathways.alert_rule_recommendations FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime'
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM pathways.rule_based_alerts a
   JOIN pathways_rules_internal.feature_operation_context c
    ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.alert_id=a.id
   WHERE a.organization_id=alert_rule_recommendations.organization_id
    AND a.rule_id=alert_rule_recommendations.rule_id AND a.runtime_contract_version='f10.v1'
    AND c.transaction_id=pg_catalog.pg_current_xact_id() AND c.backend_pid=pg_catalog.pg_backend_pid()
    AND c.login_name=session_user AND c.purpose='FEATURE_HUMAN'
    AND c.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
    AND c.operation_code IN('ALERT_REVIEW','ALERT_DISPOSITION')
    AND pathways_rules_internal.feature_human_scope(a.organization_id,a.project_id)
    AND pathways_rules_internal.rule_exposure_allowed(a.rule_id)));

-- Mutating owners match full runtime business tuples, whose legacy note columns
-- are required NULL by the f10 constraint/guard. Existing legacy rows stay hidden.
GRANT SELECT,INSERT ON pathways.alert_rules,pathways.alert_rule_recommendations TO rules_config_owner;
GRANT UPDATE(status,activated_by_id,activated_at,archived_at,updated_at) ON pathways.alert_rules TO rules_config_owner;
CREATE POLICY f10_config_rule_read ON pathways.alert_rules FOR SELECT TO rules_config_owner
 USING(organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p09_can('rules.read') IS TRUE);
CREATE POLICY f10_config_rule_insert ON pathways.alert_rules FOR INSERT TO rules_config_owner
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.configuration_record_scope(organization_id,project_id));
CREATE POLICY f10_config_rule_update ON pathways.alert_rules FOR UPDATE TO rules_config_owner
 USING(runtime_contract_version='f10.v1' AND session_user='pathways_runtime'
  AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid IS NOT NULL
  AND ((project_id IS NULL AND pathways.p09_can('rules.update') IS TRUE)
   OR (project_id IS NOT NULL AND (pathways.p06_can('rules.update',project_id) IS TRUE
    OR pathways.p06_can('rules.activate',project_id) IS TRUE))))
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.configuration_record_scope(organization_id,project_id));
CREATE POLICY f10_config_template_read ON pathways.alert_rule_recommendations FOR SELECT TO rules_config_owner
 USING(EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=alert_rule_recommendations.organization_id AND r.id=alert_rule_recommendations.rule_id));
CREATE POLICY f10_config_template_insert ON pathways.alert_rule_recommendations FOR INSERT TO rules_config_owner
 WITH CHECK(EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=alert_rule_recommendations.organization_id
  AND r.id=alert_rule_recommendations.rule_id AND r.runtime_contract_version='f10.v1'
  AND pathways_rules_internal.configuration_record_scope(r.organization_id,r.project_id)));
GRANT SELECT ON pathways.rule_based_alerts,pathways.decision_recommendations TO rules_commit_owner,rules_outcome_owner;
GRANT INSERT ON pathways.rule_based_alerts,pathways.decision_recommendations TO rules_commit_owner;
GRANT UPDATE(latest_evaluation_id,lifecycle,revision,updated_at) ON pathways.rule_based_alerts TO rules_commit_owner;
GRANT UPDATE(lifecycle,revision,updated_at) ON pathways.rule_based_alerts TO rules_outcome_owner;
GRANT UPDATE(status,revision,private_review_id,reviewed_by_id,reviewed_at,updated_at) ON pathways.decision_recommendations TO rules_outcome_owner;
CREATE POLICY f10_commit_alert_read ON pathways.rule_based_alerts FOR SELECT TO rules_commit_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_alert_insert ON pathways.rule_based_alerts FOR INSERT TO rules_commit_owner
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_alert_update ON pathways.rule_based_alerts FOR UPDATE TO rules_commit_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id))
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_recommendation_read ON pathways.decision_recommendations FOR SELECT TO rules_commit_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_recommendation_insert ON pathways.decision_recommendations FOR INSERT TO rules_commit_owner
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_outcome_alert_read ON pathways.rule_based_alerts FOR SELECT TO rules_outcome_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.human_rules_scope(organization_id,project_id)
  AND pathways_rules_internal.rule_exposure_allowed(rule_id));
CREATE POLICY f10_outcome_alert_update ON pathways.rule_based_alerts FOR UPDATE TO rules_outcome_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.feature_human_scope(organization_id,project_id))
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.feature_human_scope(organization_id,project_id));
CREATE POLICY f10_outcome_recommendation_read ON pathways.decision_recommendations FOR SELECT TO rules_outcome_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.human_rules_scope(organization_id,project_id));
CREATE POLICY f10_outcome_recommendation_update ON pathways.decision_recommendations FOR UPDATE TO rules_outcome_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.feature_human_scope(organization_id,project_id))
 WITH CHECK(runtime_contract_version='f10.v1' AND pathways_rules_internal.feature_human_scope(organization_id,project_id));

-- Public human history contains lifecycle/result metadata only. No actor IDs,
-- note columns, note flags, decision digest, preview capability or recipients.
GRANT SELECT(id,organization_id,project_id,alert_id,actor_kind,state_before,state_after,occurred_at)
 ON pathways_rules_internal.lifecycle_events TO rules_human_owner;
GRANT SELECT(id,organization_id,project_id,alert_id,state_after,occurred_at) ON pathways_rules_internal.alert_reviews TO rules_human_owner;
GRANT SELECT(id,organization_id,project_id,alert_id,outcome,created_at) ON pathways_rules_internal.decisions TO rules_human_owner;
GRANT SELECT(id,organization_id,project_id,rule_version_id,snapshot_id,affected_kind,affected_id,result,evidence,superseded)
 ON pathways_rules_internal.evaluations TO rules_human_owner;
GRANT SELECT(id,organization_id,project_id,as_of) ON pathways_rules_internal.snapshots TO rules_human_owner;
CREATE POLICY f10_human_lifecycle_read ON pathways_rules_internal.lifecycle_events FOR SELECT TO rules_human_owner
 USING(EXISTS(SELECT 1 FROM pathways.rule_based_alerts a WHERE a.organization_id=lifecycle_events.organization_id AND a.project_id=lifecycle_events.project_id
  AND a.id=lifecycle_events.alert_id AND pathways.p06_can('alerts.read',a.project_id) IS TRUE));
CREATE POLICY f10_human_review_history ON pathways_rules_internal.alert_reviews FOR SELECT TO rules_human_owner
 USING(EXISTS(SELECT 1 FROM pathways.rule_based_alerts a WHERE a.organization_id=alert_reviews.organization_id AND a.project_id=alert_reviews.project_id
  AND a.id=alert_reviews.alert_id AND pathways.p06_can('alerts.read',a.project_id) IS TRUE));
CREATE POLICY f10_human_decision_history ON pathways_rules_internal.decisions FOR SELECT TO rules_human_owner
 USING(EXISTS(SELECT 1 FROM pathways.rule_based_alerts a WHERE a.organization_id=decisions.organization_id AND a.project_id=decisions.project_id
  AND a.id=decisions.alert_id AND pathways.p06_can('alerts.read',a.project_id) IS TRUE));
CREATE POLICY f10_human_evaluation_history ON pathways_rules_internal.evaluations FOR SELECT TO rules_human_owner
 USING(pathways.p06_can('alerts.read',project_id) IS TRUE AND pathways_rules_internal.rule_exposure_allowed(rule_version_id));
CREATE POLICY f10_human_snapshot_dates ON pathways_rules_internal.snapshots FOR SELECT TO rules_human_owner
 USING(pathways.p06_can('alerts.read',project_id) IS TRUE AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid);

GRANT SELECT(id,organization_id,project_id,alert_id,actor_kind,actor_id,state_before,state_after,evaluation_id,operation_receipt_id,occurred_at)
 ON pathways_rules_internal.lifecycle_events TO rules_runtime_guard_owner;
GRANT SELECT,INSERT ON pathways_rules_internal.lifecycle_events TO rules_outcome_owner,rules_commit_owner;
CREATE POLICY f10_lifecycle_human_insert ON pathways_rules_internal.lifecycle_events FOR INSERT TO rules_outcome_owner
 WITH CHECK(actor_kind='HUMAN' AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways_rules_internal.feature_human_scope(organization_id,project_id));
CREATE POLICY f10_lifecycle_system_insert ON pathways_rules_internal.lifecycle_events FOR INSERT TO rules_commit_owner
 WITH CHECK(actor_kind='SYSTEM' AND actor_id IS NULL AND note IS NULL AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_lifecycle_event_guard ON pathways_rules_internal.lifecycle_events FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.feature_human_scope(organization_id,project_id) OR pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_lifecycle_human_read ON pathways_rules_internal.lifecycle_events FOR SELECT TO rules_outcome_owner USING(pathways_rules_internal.feature_human_scope(organization_id,project_id));
CREATE POLICY f10_lifecycle_system_read ON pathways_rules_internal.lifecycle_events FOR SELECT TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));

-- Native in-app placement: the recipient sees only their current authorized
-- alert/message. Confirmation owner reads own decision recipients for safe counts.
GRANT SELECT,INSERT ON pathways_rules_internal.notifications TO rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,recipient_id,alert_id,message,delivery_state,created_at,read_at),UPDATE(read_at)
 ON pathways_rules_internal.notifications TO rules_human_owner;
CREATE POLICY f10_notification_recipient_read ON pathways_rules_internal.notifications FOR SELECT TO rules_human_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  AND pathways.p06_can('alerts.read',project_id) IS TRUE AND EXISTS(SELECT 1 FROM pathways.rule_based_alerts a WHERE a.organization_id=notifications.organization_id
   AND a.project_id=notifications.project_id AND a.id=notifications.alert_id AND pathways_rules_internal.rule_exposure_allowed(a.rule_id)));
CREATE POLICY f10_notification_recipient_read_stamp ON pathways_rules_internal.notifications FOR UPDATE TO rules_human_owner
 USING(recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('alerts.read',project_id) IS TRUE)
 WITH CHECK(recipient_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('alerts.read',project_id) IS TRUE);
CREATE POLICY f10_notification_decision_read ON pathways_rules_internal.notifications FOR SELECT TO rules_outcome_owner
 USING(EXISTS(SELECT 1 FROM pathways_rules_internal.decisions d WHERE d.id=notifications.decision_id AND d.organization_id=notifications.organization_id
  AND d.project_id=notifications.project_id AND d.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid));
CREATE POLICY f10_notification_decision_insert ON pathways_rules_internal.notifications FOR INSERT TO rules_outcome_owner
 WITH CHECK(delivery_state='DELIVERED' AND attempts=1 AND read_at IS NULL AND EXISTS(SELECT 1 FROM pathways_rules_internal.decisions d
  WHERE d.id=notifications.decision_id AND d.organization_id=notifications.organization_id AND d.project_id=notifications.project_id
   AND d.actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways_rules_internal.feature_human_scope(d.organization_id,d.project_id)));


-- mutation-authority.proposed.sql
-- State-lock and provenance metadata; no source numeric read for human outcomes.
GRANT SELECT(organization_id,project_id,bootstrap_complete,lock_revision),UPDATE(lock_revision)
 ON pathways_rules_internal.project_state TO rules_outcome_owner,rules_human_owner;
CREATE POLICY f10_feature_state_read ON pathways_rules_internal.project_state FOR SELECT TO rules_outcome_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,project_id));
CREATE POLICY f10_feature_state_lock ON pathways_rules_internal.project_state FOR UPDATE TO rules_outcome_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.human_rules_scope(organization_id,project_id));
CREATE POLICY f10_inbox_state_read ON pathways_rules_internal.project_state FOR SELECT TO rules_human_owner
 USING(organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('alerts.read',project_id) IS TRUE);
CREATE POLICY f10_inbox_state_lock ON pathways_rules_internal.project_state FOR UPDATE TO rules_human_owner
 USING(organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('alerts.read',project_id) IS TRUE)
 WITH CHECK(organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND pathways.p06_can('alerts.read',project_id) IS TRUE);
GRANT SELECT(id,organization_id,project_id,version,conditions_json,status,runtime_contract_version) ON pathways.alert_rules TO rules_outcome_owner,rules_runtime_guard_owner;
GRANT SELECT(activated_at) ON pathways.alert_rules TO rules_runtime_guard_owner;
CREATE POLICY f10_outcome_rule_metadata ON pathways.alert_rules FOR SELECT TO rules_outcome_owner
 USING(runtime_contract_version='f10.v1' AND pathways_rules_internal.human_rules_scope(organization_id,project_id));
CREATE POLICY f10_guard_rule_metadata ON pathways.alert_rules FOR SELECT TO rules_runtime_guard_owner
 USING(runtime_contract_version='f10.v1' AND (pathways_rules_internal.human_rules_scope(organization_id,project_id)
  OR pathways_rules_internal.lease_metric_scope(organization_id,project_id) OR pathways_rules_internal.configuration_record_scope(organization_id,project_id)));
GRANT SELECT(id,organization_id,project_id,rule_id,latest_evaluation_id,runtime_contract_version) ON pathways.rule_based_alerts TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_alert_metadata ON pathways.rule_based_alerts FOR SELECT TO rules_runtime_guard_owner
 USING(runtime_contract_version='f10.v1' AND (pathways_rules_internal.human_rules_scope(organization_id,project_id) OR pathways_rules_internal.lease_metric_scope(organization_id,project_id)));
GRANT SELECT(id,organization_id,rule_id,title,text,type) ON pathways.alert_rule_recommendations TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_predefined_metadata ON pathways.alert_rule_recommendations FOR SELECT TO rules_runtime_guard_owner
 USING(EXISTS(SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=alert_rule_recommendations.organization_id AND r.id=alert_rule_recommendations.rule_id));
GRANT SELECT(id,organization_id,project_id,rule_version_id,snapshot_id,result,evidence) ON pathways_rules_internal.evaluations TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_evaluation_provenance ON pathways_rules_internal.evaluations FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(organization_id,project_id,source_watermark,required_generation,bootstrap_complete) ON pathways_rules_internal.project_state TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_admitted_state ON pathways_rules_internal.project_state FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.configuration_record_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,state,lease_hash,lease_session,lease_expires_at) ON pathways_rules_internal.jobs TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_lease_metadata ON pathways_rules_internal.jobs FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(id,job_id,organization_id,project_id,lease_hash,lease_session,required_generation,source_watermark,digest)
 ON pathways_rules_internal.snapshots TO rules_runtime_guard_owner;
CREATE POLICY f10_guard_snapshot_metadata ON pathways_rules_internal.snapshots FOR SELECT TO rules_runtime_guard_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));

-- Receipt audits contain controlled event/revision metadata. No private note,
-- preview, bearer capability, copied metric or recipient identity is logged.
GRANT INSERT(organization_id,actor_user_id,project_id,action,entity_type,entity_id,changes) ON pathways.audit_logs
 TO rules_config_owner,rules_outcome_owner,rules_commit_owner;
CREATE POLICY f10_configuration_audit ON pathways.audit_logs FOR INSERT TO rules_config_owner
 WITH CHECK(actor_user_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND pathways_rules_internal.configuration_record_scope(organization_id,project_id));
CREATE POLICY f10_outcome_audit ON pathways.audit_logs FOR INSERT TO rules_outcome_owner
 WITH CHECK(actor_user_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways_rules_internal.feature_human_scope(organization_id,project_id));
CREATE POLICY f10_system_audit ON pathways.audit_logs FOR INSERT TO rules_commit_owner
 WITH CHECK(actor_user_id IS NULL AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));

-- Recipient enumeration receives only membership/grant metadata, never names,
-- contact details, email, auth UUIDs, profile notes or Beneficiary information.
GRANT SELECT(id,organization_id,role_id,account_status,archived_at) ON pathways.system_users TO rules_outcome_owner;
GRANT SELECT(id,status,archived_at) ON pathways.organizations TO rules_outcome_owner;
GRANT SELECT(id,code,is_active) ON pathways.roles,pathways.permissions TO rules_outcome_owner;
GRANT SELECT(role_id,permission_id) ON pathways.role_permissions TO rules_outcome_owner;
GRANT SELECT(id,organization_id,project_id,user_id,status,ended_at) ON pathways.user_project_assignments TO rules_outcome_owner;
GRANT SELECT(id,organization_id,program_id,archived_at) ON pathways.projects TO rules_outcome_owner;
GRANT SELECT(id,organization_id,manager_user_id,archived_at) ON pathways.programs TO rules_outcome_owner;
CREATE POLICY f10_recipient_user_metadata ON pathways.system_users FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
  AND (pathways.p09_can('alerts.outcome.record') IS TRUE OR pathways.p09_can('recommendations.outcome.record') IS TRUE));
CREATE POLICY f10_recipient_org_metadata ON pathways.organizations FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY f10_recipient_role_metadata ON pathways.roles FOR SELECT TO rules_outcome_owner USING(session_user='pathways_runtime');
CREATE POLICY f10_recipient_permission_metadata ON pathways.permissions FOR SELECT TO rules_outcome_owner USING(session_user='pathways_runtime');
CREATE POLICY f10_recipient_grant_metadata ON pathways.role_permissions FOR SELECT TO rules_outcome_owner USING(session_user='pathways_runtime');
CREATE POLICY f10_recipient_assignment_metadata ON pathways.user_project_assignments FOR SELECT TO rules_outcome_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,project_id));
CREATE POLICY f10_recipient_project_metadata ON pathways.projects FOR SELECT TO rules_outcome_owner
 USING(pathways_rules_internal.human_rules_scope(organization_id,id));
CREATE POLICY f10_recipient_program_metadata ON pathways.programs FOR SELECT TO rules_outcome_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid);


-- machine-storage-policies.proposed.sql
-- Proposed0031 private machine policies. No table grant to either LOGIN.
GRANT SELECT ON pathways_rules_internal.jobs,pathways_rules_internal.snapshots TO rules_context_owner;
GRANT SELECT(organization_id,project_id,bootstrap_complete,required_generation,source_watermark)
 ON pathways_rules_internal.project_state TO rules_context_owner;
CREATE POLICY f10_context_job_validation ON pathways_rules_internal.jobs FOR SELECT TO rules_context_owner USING(session_user='pathways_rules_worker');
CREATE POLICY f10_context_snapshot_validation ON pathways_rules_internal.snapshots FOR SELECT TO rules_context_owner USING(session_user='pathways_rules_worker');
CREATE POLICY f10_context_state_validation ON pathways_rules_internal.project_state FOR SELECT TO rules_context_owner USING(session_user='pathways_rules_worker');
GRANT SELECT ON pathways_rules_internal.projection_context TO rules_projection_owner,rules_commit_owner,rules_runtime_guard_owner;
CREATE POLICY f10_context_actual_metadata ON pathways_rules_internal.projection_context FOR SELECT TO rules_projection_owner,rules_commit_owner,rules_runtime_guard_owner
 USING(session_user='pathways_rules_worker' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user);
GRANT SELECT ON pathways_rules_internal.project_state TO rules_projection_owner,rules_commit_owner;
GRANT SELECT ON pathways_rules_internal.jobs,pathways_rules_internal.snapshots,pathways_rules_internal.acknowledgements TO rules_commit_owner;
-- Commit needs only private job/snapshot metadata before installing a marker to
-- derive state scope and recover an immutable original capability. Fixed body
-- validates nonce/digest and actual session; no free SELECT wrapper is exposed.
CREATE POLICY f10_commit_state_lookup ON pathways_rules_internal.project_state FOR SELECT TO rules_commit_owner USING(session_user='pathways_rules_worker');
CREATE POLICY f10_projection_state_current ON pathways_rules_internal.project_state FOR SELECT TO rules_projection_owner
 USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_commit_job_lookup ON pathways_rules_internal.jobs FOR SELECT TO rules_commit_owner USING(session_user='pathways_rules_worker');
CREATE POLICY f10_commit_snapshot_lookup ON pathways_rules_internal.snapshots FOR SELECT TO rules_commit_owner USING(session_user='pathways_rules_worker');
CREATE POLICY f10_commit_ack_lookup ON pathways_rules_internal.acknowledgements FOR SELECT TO rules_commit_owner USING(session_user='pathways_rules_worker');
GRANT INSERT ON pathways_rules_internal.snapshots TO rules_projection_owner;
CREATE POLICY f10_capture_snapshot_insert ON pathways_rules_internal.snapshots FOR INSERT TO rules_projection_owner
 WITH CHECK(lease_session=session_user AND pathways_rules_internal.lease_metric_scope(organization_id,project_id) IS TRUE
  AND EXISTS(SELECT FROM pathways_rules_internal.projection_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
   AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.purpose='CAPTURE'
   AND c.job_id=snapshots.job_id AND c.lease_hash=snapshots.lease_hash));
GRANT UPDATE(lock_revision,acknowledged_generation,evaluation_sequence) ON pathways_rules_internal.project_state TO rules_commit_owner;
CREATE POLICY f10_commit_state_lock_and_ack ON pathways_rules_internal.project_state FOR UPDATE TO rules_commit_owner
 USING(session_user='pathways_rules_worker') WITH CHECK(session_user='pathways_rules_worker');
GRANT UPDATE(state,lease_hash,lease_session,lease_expires_at,claim_generation,claim_watermark,stale_attempts,operational_failures)
 ON pathways_rules_internal.jobs TO rules_commit_owner;
CREATE POLICY f10_commit_matching_job_release ON pathways_rules_internal.jobs FOR UPDATE TO rules_commit_owner
 USING(session_user='pathways_rules_worker') WITH CHECK(session_user='pathways_rules_worker');
GRANT SELECT,INSERT ON pathways_rules_internal.evaluations,pathways_rules_internal.episode_cursors,
 pathways_rules_internal.work_coverage TO rules_commit_owner;
GRANT INSERT ON pathways_rules_internal.acknowledgements TO rules_commit_owner;
GRANT UPDATE(last_sequence,latched,last_result,episode_number,alert_id) ON pathways_rules_internal.episode_cursors TO rules_commit_owner;
CREATE POLICY f10_commit_evaluation_read ON pathways_rules_internal.evaluations FOR SELECT TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_evaluation_insert ON pathways_rules_internal.evaluations FOR INSERT TO rules_commit_owner WITH CHECK(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_episode_read ON pathways_rules_internal.episode_cursors FOR SELECT TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_episode_insert ON pathways_rules_internal.episode_cursors FOR INSERT TO rules_commit_owner WITH CHECK(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_episode_update ON pathways_rules_internal.episode_cursors FOR UPDATE TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id)) WITH CHECK(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_ack_insert ON pathways_rules_internal.acknowledgements FOR INSERT TO rules_commit_owner WITH CHECK(lease_session=session_user AND pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_coverage_read ON pathways_rules_internal.work_coverage FOR SELECT TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
CREATE POLICY f10_commit_coverage_insert ON pathways_rules_internal.work_coverage FOR INSERT TO rules_commit_owner WITH CHECK(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(id,organization_id,project_id,generation,identity_kind,identity_id) ON pathways_rules_internal.work_items TO rules_commit_owner;
CREATE POLICY f10_commit_pending_work ON pathways_rules_internal.work_items FOR SELECT TO rules_commit_owner USING(pathways_rules_internal.lease_metric_scope(organization_id,project_id));
GRANT SELECT(singleton,zone,version) ON pathways_rules_internal.calendar_configuration TO rules_commit_owner,rules_eligibility_owner;
CREATE POLICY f10_commit_calendar_metadata ON pathways_rules_internal.calendar_configuration FOR SELECT TO rules_commit_owner USING(singleton AND session_user='pathways_rules_worker');
CREATE POLICY f10_eligibility_calendar_metadata ON pathways_rules_internal.calendar_configuration FOR SELECT TO rules_eligibility_owner
 USING(singleton AND session_user IN ('pathways_runtime','pathways_rules_worker'));

GRANT SELECT,UPDATE(slot,last_organization_id,last_project_id,exhausted) ON pathways_rules_internal.sweep_cursor TO rules_sweep_owner;
GRANT SELECT(id,organization_id,archived_at) ON pathways.projects TO rules_sweep_owner;
GRANT SELECT(organization_id,project_id,status,runtime_contract_version) ON pathways.alert_rules TO rules_sweep_owner;
CREATE POLICY f10_sweep_active_rule_metadata ON pathways.alert_rules FOR SELECT TO rules_sweep_owner
 USING(session_user='pathways_rules_sweeper' AND project_id IS NOT NULL AND status='ACTIVE' AND runtime_contract_version='f10.v1');
CREATE POLICY f10_sweep_unarchived_project_metadata ON pathways.projects FOR SELECT TO rules_sweep_owner
 USING(session_user='pathways_rules_sweeper' AND archived_at IS NULL AND EXISTS(
  SELECT 1 FROM pathways.alert_rules r WHERE r.organization_id=projects.organization_id AND r.project_id=projects.id
   AND r.status='ACTIVE' AND r.runtime_contract_version='f10.v1'));
GRANT SELECT(organization_id,project_id,required_generation,source_watermark,bootstrap_complete),UPDATE(lock_revision,required_generation)
 ON pathways_rules_internal.project_state TO rules_sweep_owner;
GRANT SELECT,INSERT ON pathways_rules_internal.jobs,pathways_rules_internal.work_items TO rules_sweep_owner;
GRANT UPDATE(state,pending_since,next_attempt_at,operational_failures) ON pathways_rules_internal.jobs TO rules_sweep_owner;
CREATE POLICY f10_sweep_cursor_scope ON pathways_rules_internal.sweep_cursor FOR ALL TO rules_sweep_owner USING(singleton AND session_user='pathways_rules_sweeper') WITH CHECK(singleton AND session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_state_read ON pathways_rules_internal.project_state FOR SELECT TO rules_sweep_owner USING(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_state_update ON pathways_rules_internal.project_state FOR UPDATE TO rules_sweep_owner USING(session_user='pathways_rules_sweeper') WITH CHECK(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_job_read ON pathways_rules_internal.jobs FOR SELECT TO rules_sweep_owner USING(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_job_insert ON pathways_rules_internal.jobs FOR INSERT TO rules_sweep_owner WITH CHECK(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_job_update ON pathways_rules_internal.jobs FOR UPDATE TO rules_sweep_owner USING(session_user='pathways_rules_sweeper') WITH CHECK(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_work_read ON pathways_rules_internal.work_items FOR SELECT TO rules_sweep_owner USING(session_user='pathways_rules_sweeper');
CREATE POLICY f10_sweep_work_insert ON pathways_rules_internal.work_items FOR INSERT TO rules_sweep_owner WITH CHECK(session_user='pathways_rules_sweeper' AND identity_kind='HOURLY' AND actor_id IS NULL);


-- private-storage-authority.proposed.sql
-- Proposed0031 explicit ownership/forced RLS, executed atomically before enable.
-- All names below are newly created feature storage, never existing core data.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['eligibility','rule_bindings','projection_context','snapshots','acknowledgements','evaluations',
  'episode_cursors','work_coverage','sweep_cursor','runtime_mutation_intents','configuration_context','configuration_receipts',
  'feature_operation_context','feature_operation_receipts','alert_reviews','lifecycle_events','decisions','outcome_previews',
  'recommendation_reviews','notifications'] LOOP
  EXECUTE pg_catalog.format('ALTER TABLE pathways_rules_internal.%I OWNER TO rules_store_owner',table_name);
  EXECUTE pg_catalog.format('ALTER TABLE pathways_rules_internal.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE pg_catalog.format('ALTER TABLE pathways_rules_internal.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE pg_catalog.format('REVOKE ALL ON TABLE pathways_rules_internal.%I FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper',table_name);
 END LOOP;
END $$;

GRANT SELECT,INSERT ON pathways_rules_internal.runtime_mutation_intents TO rules_config_owner,rules_outcome_owner,rules_commit_owner;
GRANT SELECT,UPDATE(consumed) ON pathways_rules_internal.runtime_mutation_intents TO rules_runtime_guard_owner;
CREATE POLICY f10_intent_configuration_read ON pathways_rules_internal.runtime_mutation_intents FOR SELECT TO rules_config_owner
 USING(purpose='CONFIGURATION' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_configuration_insert ON pathways_rules_internal.runtime_mutation_intents FOR INSERT TO rules_config_owner
 WITH CHECK(purpose='CONFIGURATION' AND NOT consumed AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.configuration_record_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_human_read ON pathways_rules_internal.runtime_mutation_intents FOR SELECT TO rules_outcome_owner
 USING(purpose='FEATURE_HUMAN' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_human_insert ON pathways_rules_internal.runtime_mutation_intents FOR INSERT TO rules_outcome_owner
 WITH CHECK(purpose='FEATURE_HUMAN' AND NOT consumed AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.feature_human_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_commit_read ON pathways_rules_internal.runtime_mutation_intents FOR SELECT TO rules_commit_owner
 USING(purpose='COMMIT' AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.lease_metric_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_commit_insert ON pathways_rules_internal.runtime_mutation_intents FOR INSERT TO rules_commit_owner
 WITH CHECK(purpose='COMMIT' AND NOT consumed AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid()
  AND login_name=session_user AND pathways_rules_internal.lease_metric_scope(organization_id,project_id) IS TRUE);
CREATE POLICY f10_intent_guard_read ON pathways_rules_internal.runtime_mutation_intents FOR SELECT TO rules_runtime_guard_owner
 USING(transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user
  AND CASE purpose WHEN 'CONFIGURATION' THEN pathways_rules_internal.configuration_record_scope(organization_id,project_id)
   WHEN 'FEATURE_HUMAN' THEN pathways_rules_internal.feature_human_scope(organization_id,project_id)
   WHEN 'COMMIT' THEN pathways_rules_internal.lease_metric_scope(organization_id,project_id) ELSE false END IS TRUE);
CREATE POLICY f10_intent_guard_consume ON pathways_rules_internal.runtime_mutation_intents FOR UPDATE TO rules_runtime_guard_owner
 USING(NOT consumed AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user)
 WITH CHECK(consumed AND transaction_id=pg_catalog.pg_current_xact_id() AND backend_pid=pg_catalog.pg_backend_pid() AND login_name=session_user);
-- Guard owns only its exact comparator function. Builders receive no UPDATE or
-- DELETE intent authority, and no login receives private storage privileges.


-- append-authority.proposed.sql
CREATE FUNCTION pathways_rules_internal.reject_runtime_record_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Runtime history is immutable' USING ERRCODE='55000';
END $$;
ALTER FUNCTION pathways_rules_internal.reject_runtime_record_mutation() OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.reject_runtime_record_mutation() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['work_items','eligibility','snapshots','acknowledgements','work_coverage',
  'configuration_receipts','feature_operation_receipts','alert_reviews','recommendation_reviews','lifecycle_events','decisions'] LOOP
  EXECUTE pg_catalog.format('CREATE TRIGGER f10_append_only BEFORE UPDATE OR DELETE ON pathways_rules_internal.%I FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.reject_runtime_record_mutation()',table_name);
 END LOOP;
END $$;
CREATE FUNCTION pathways_rules_internal.guard_private_runtime_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_value jsonb:=pg_catalog.to_jsonb(NEW); org uuid; project uuid; actor uuid;
 context pathways_rules_internal.feature_operation_context;
BEGIN
 IF TG_OP<>'INSERT' OR TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' THEN RAISE EXCEPTION 'Private event unavailable' USING ERRCODE='42501'; END IF;
 org:=(row_value->>'organization_id')::uuid;project:=(row_value->>'project_id')::uuid;actor:=(row_value->>'actor_id')::uuid;
 IF row_value->>'actor_kind'='SYSTEM' THEN
  IF session_user<>'pathways_rules_worker' OR actor IS NOT NULL OR row_value->'note'<>'null'::jsonb
   OR pathways_rules_internal.lease_metric_scope(org,project) IS DISTINCT FROM true
   OR NOT EXISTS(SELECT 1 FROM pathways_rules_internal.evaluations e WHERE e.organization_id=org AND e.project_id=project
    AND e.id=(row_value->>'evaluation_id')::uuid) THEN RAISE EXCEPTION 'System event provenance unavailable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 SELECT c.* INTO context FROM pathways_rules_internal.feature_operation_context c WHERE c.transaction_id=pg_catalog.pg_current_xact_id()
  AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.login_name=session_user AND c.organization_id=org AND c.project_id=project;
 IF NOT FOUND OR session_user<>'pathways_runtime' OR actor IS DISTINCT FROM context.actor_id OR actor IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  OR pathways_rules_internal.feature_human_scope(org,project) IS DISTINCT FROM true
  OR (row_value->>'alert_id')::uuid IS DISTINCT FROM context.alert_id AND row_value?'alert_id'
  OR (row_value->>'recommendation_id')::uuid IS DISTINCT FROM context.recommendation_id AND row_value?'recommendation_id'
  OR NOT EXISTS(SELECT 1 FROM pathways_rules_internal.feature_operation_receipts o WHERE o.organization_id=org AND o.project_id=project
   AND o.actor_id=actor AND o.id=(row_value->>'operation_receipt_id')::uuid AND o.client_operation_id=context.operation_id) THEN
  RAISE EXCEPTION 'Human event provenance unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pathways_rules_internal.guard_private_runtime_event() OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_private_runtime_event() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
CREATE TRIGGER f10_private_event_proof BEFORE INSERT ON pathways_rules_internal.lifecycle_events FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.guard_private_runtime_event();
CREATE TRIGGER f10_private_review_proof BEFORE INSERT ON pathways_rules_internal.alert_reviews FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.guard_private_runtime_event();
CREATE TRIGGER f10_private_rec_review_proof BEFORE INSERT ON pathways_rules_internal.recommendation_reviews FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.guard_private_runtime_event();
CREATE TRIGGER f10_private_decision_proof BEFORE INSERT ON pathways_rules_internal.decisions FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.guard_private_runtime_event();


-- source-abandonment.proposed.sql
-- Separate proposed technical recovery packet. No initial PROJECT_CREATE path.
CREATE TABLE pathways_rules_internal.source_request_abandonments (
 organization_id uuid NOT NULL,actor_id uuid NOT NULL,request_kind text NOT NULL,
 request_id uuid NOT NULL,phase text NOT NULL,project_id uuid NOT NULL,operation_code text NOT NULL,
 source_record_id uuid,canonical_request_hash bytea NOT NULL CHECK(pg_catalog.octet_length(canonical_request_hash)=32),
 abandoned_at timestamptz(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(organization_id,actor_id,request_kind,request_id,phase),
 FOREIGN KEY(operation_code) REFERENCES pathways_rules_internal.source_operation_catalog(operation_code),
 FOREIGN KEY(organization_id,project_id) REFERENCES pathways_rules_internal.project_state(organization_id,project_id),
 CHECK((request_kind='CLIENT_MUTATION' AND phase='MUTATION') OR (request_kind='CLIENT_MEASUREMENT' AND phase='MEASUREMENT')
  OR (request_kind='PROOF_FINALIZE' AND phase='FINALIZE'))
);
ALTER TABLE pathways_rules_internal.source_request_abandonments OWNER TO rules_store_owner;
ALTER TABLE pathways_rules_internal.source_request_abandonments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways_rules_internal.source_request_abandonments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pathways_rules_internal.source_request_abandonments FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT SELECT,INSERT ON pathways_rules_internal.source_request_abandonments TO rules_enqueue_owner;
CREATE POLICY f10_source_abandonment_read ON pathways_rules_internal.source_request_abandonments FOR SELECT TO rules_enqueue_owner
 USING(session_user='pathways_runtime' AND organization_id=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid AND actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND (pathways.p06_can((SELECT cat.permission_code FROM pathways_rules_internal.source_operation_catalog cat WHERE cat.operation_code=source_request_abandonments.operation_code),project_id) IS TRUE));
CREATE POLICY f10_source_abandonment_insert ON pathways_rules_internal.source_request_abandonments FOR INSERT TO rules_enqueue_owner
 WITH CHECK(actor_id=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid AND pathways_rules_internal.source_scope(organization_id,project_id));
CREATE TRIGGER f10_source_abandonment_immutable BEFORE UPDATE OR DELETE ON pathways_rules_internal.source_request_abandonments
 FOR EACH ROW EXECUTE FUNCTION pathways_rules_internal.reject_runtime_record_mutation();

CREATE FUNCTION pathways_rules_internal.lock_source_request_identity(org uuid,actor uuid,kind text,request uuid,phase text)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'f10-source-request:'||org::text||':'||actor::text||':'||kind||':'||request::text||':'||phase,0))
$$;
CREATE FUNCTION pathways_rules_internal.assert_source_request_live(org uuid,actor uuid,kind text,request uuid,phase text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pathways_rules_internal.source_request_abandonments a WHERE a.organization_id=org
  AND a.actor_id=actor AND a.request_kind=kind AND a.request_id=request AND a.phase=assert_source_request_live.phase) THEN
  RAISE EXCEPTION 'This mutation request was abandoned. Reload before starting a new request.' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION pathways.f10_abandon_source_operation(operation text,wanted_project uuid,wanted_source uuid,
 wanted_kind text,wanted_request uuid,wanted_phase text,body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;actor uuid;permission text;canonical jsonb;hash bytea;ack jsonb;tombstone pathways_rules_internal.source_request_abandonments;
BEGIN
 PERFORM pathways_rules_internal.assert_runtime_provisioned();
 IF session_user<>'pathways_runtime' OR wanted_project IS NULL OR wanted_request IS NULL
  OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 org:=nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid;actor:=nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid;
 SELECT c.permission_code INTO permission FROM pathways_rules_internal.source_operation_catalog c WHERE c.operation_code=operation
  AND c.request_kind=wanted_kind AND c.request_kind<>'CONFIGURATION';
 IF org IS NULL OR actor IS NULL OR permission IS NULL OR pathways.p06_can(permission,wanted_project) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 IF (wanted_kind='CLIENT_MUTATION' AND wanted_phase IS DISTINCT FROM 'MUTATION')
  OR (wanted_kind='CLIENT_MEASUREMENT' AND wanted_phase IS DISTINCT FROM 'MEASUREMENT')
  OR (wanted_kind='PROOF_FINALIZE' AND wanted_phase IS DISTINCT FROM 'FINALIZE')
  OR (operation IN ('ACTIVITY_CREATE','INDICATOR_CREATE') AND wanted_source IS NOT NULL)
  OR (operation NOT IN ('ACTIVITY_CREATE','INDICATOR_CREATE','PROJECT_UPDATE') AND wanted_source IS NULL)
  OR (operation='PROJECT_UPDATE' AND wanted_source IS DISTINCT FROM wanted_project) THEN
  RAISE EXCEPTION 'Invalid source key' USING ERRCODE='22023'; END IF;
 canonical:=pg_catalog.jsonb_build_object('operation',operation,'sourceId',wanted_source,
  'body',pathways_rules_internal.canonical_source_request(operation,body));
 hash:=pg_catalog.sha256(pg_catalog.convert_to(canonical::text,'UTF8'));
 -- All source attempts/abandonments take state then identity, never the reverse.
 PERFORM pathways.f10_bootstrap_project(wanted_project,operation);
 PERFORM pathways_rules_internal.lock_source_request_identity(org,actor,wanted_kind,wanted_request,wanted_phase);
 IF pathways.p06_can(permission,wanted_project) IS DISTINCT FROM true OR actor IS DISTINCT FROM nullif(pg_catalog.current_setting('app.user_id',true),'')::uuid
  OR org IS DISTINCT FROM nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid THEN RAISE EXCEPTION 'Mutation unavailable' USING ERRCODE='42501'; END IF;
 ack:=pathways.f10_source_acknowledgement(wanted_project,operation,wanted_kind,wanted_request,wanted_phase,canonical);
 IF ack IS NOT NULL THEN RETURN ack; END IF;
 SELECT a.* INTO tombstone FROM pathways_rules_internal.source_request_abandonments a WHERE a.organization_id=org AND a.actor_id=actor
  AND a.request_kind=wanted_kind AND a.request_id=wanted_request AND a.phase=wanted_phase;
 IF FOUND THEN
  IF tombstone.project_id IS DISTINCT FROM wanted_project OR tombstone.operation_code IS DISTINCT FROM operation
   OR tombstone.source_record_id IS DISTINCT FROM wanted_source OR tombstone.canonical_request_hash IS DISTINCT FROM hash THEN
   RAISE EXCEPTION 'Mutation request conflicts' USING ERRCODE='23505'; END IF;
 ELSE
  INSERT INTO pathways_rules_internal.source_request_abandonments(organization_id,actor_id,request_kind,request_id,phase,project_id,
   operation_code,source_record_id,canonical_request_hash) VALUES(org,actor,wanted_kind,wanted_request,wanted_phase,wanted_project,operation,wanted_source,hash);
 END IF;
 RETURN pg_catalog.jsonb_build_object('requestId',wanted_request,'abandoned',true);
END $$;
ALTER FUNCTION pathways_rules_internal.lock_source_request_identity(uuid,uuid,text,uuid,text) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways_rules_internal.assert_source_request_live(uuid,uuid,text,uuid,text) OWNER TO rules_enqueue_owner;
ALTER FUNCTION pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lock_source_request_identity(uuid,uuid,text,uuid,text),
 pathways_rules_internal.assert_source_request_live(uuid,uuid,text,uuid,text),pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb) TO pathways_runtime;


-- native-helper-authority.proposed.sql
-- Proposed0031 pure helper ACLs; no relation authority or direct login calls.
ALTER FUNCTION pathways_rules_internal.decimal_value(text) OWNER TO rules_projection_owner;
ALTER FUNCTION pathways_rules_internal.numeric_cell(numeric) OWNER TO rules_projection_owner;
ALTER FUNCTION pathways_rules_internal.unavailable_cell(text,text) OWNER TO rules_projection_owner;
ALTER FUNCTION pathways_rules_internal.progress_cell(text,text,text,text) OWNER TO rules_projection_owner;
ALTER FUNCTION pathways_rules_internal.evaluate_node(jsonb,jsonb,integer) OWNER TO rules_projection_owner;
ALTER FUNCTION pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.decimal_value(text),pathways_rules_internal.numeric_cell(numeric),
 pathways_rules_internal.unavailable_cell(text,text),pathways_rules_internal.progress_cell(text,text,text,text),
 pathways_rules_internal.evaluate_node(jsonb,jsonb,integer),pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.decimal_value(text),pathways_rules_internal.numeric_cell(numeric),
 pathways_rules_internal.unavailable_cell(text,text),pathways_rules_internal.progress_cell(text,text,text,text),
 pathways_rules_internal.evaluate_node(jsonb,jsonb,integer),pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb),
 pathways_rules_internal.validate_metric_cell(jsonb) TO rules_commit_owner,rules_config_owner;
-- Configuration invokes only bounded synthetic cells for structured-condition
-- validation after admission, so these IMMUTABLE INVOKER grants read no values.
ALTER FUNCTION pathways_rules_internal.committed_acknowledgement(uuid,text,uuid,bytea) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.committed_acknowledgement(uuid,text,uuid,bytea)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.classification_fingerprint(uuid) OWNER TO rules_eligibility_owner;
ALTER FUNCTION pathways_rules_internal.classification_fingerprint(uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION pathways_rules_internal.classification_fingerprint(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.classification_fingerprint(uuid) TO rules_projection_owner,rules_commit_owner,rules_outcome_owner;
GRANT EXECUTE ON FUNCTION pathways.p06_can(text,uuid),pathways.p09_can(text),pathways.p09_role_allows(text,text)
 TO rules_human_owner,rules_outcome_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_runtime_guard_owner,rules_enqueue_owner,rules_source_proof_owner;


-- legacy-trigger-dispatch.proposed.sql
-- DISPOSABLE GENERATED FORWARD DISPATCH EXCERPTS; NOT EXECUTED.
-- Runtime validator/builders/schema/ACLs are required prerequisites, NOT STUBBED HERE.
-- Original legacy bodies below are extracted unchanged; applied SQL is untouched.

CREATE OR REPLACE FUNCTION pathways.p3_guard_rule() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $f10$
DECLARE contract text;
BEGIN
IF TG_OP='UPDATE' AND NEW.runtime_contract_version IS DISTINCT FROM OLD.runtime_contract_version THEN
 RAISE EXCEPTION 'Runtime contract is immutable' USING ERRCODE='23514'; END IF;
contract:=CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.runtime_contract_version ELSE NEW.runtime_contract_version END;
IF contract IS NOT NULL THEN
 IF contract <> 'f10.v1' THEN RAISE EXCEPTION 'Unsupported runtime contract' USING ERRCODE='23514'; END IF;
 PERFORM pathways_rules_internal.assert_runtime_mutation(TG_RELID,TG_OP,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
  CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END IF;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule version must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','ACTIVE') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid rule lifecycle'; END IF;
   IF NEW.status='ACTIVE' AND (
    NOT EXISTS(SELECT FROM pathways.alert_rule_conditions WHERE rule_id=NEW.id)
    OR NOT EXISTS(SELECT FROM pathways.alert_rule_recommendations WHERE rule_id=NEW.id)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activation requires conditions and a human-review recommendation template';
   END IF;
  ELSIF NOT (OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['updated_at','status','archived_at'])=(to_jsonb(OLD)-ARRAY['updated_at','status','archived_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule version is immutable; create a new version';
  END IF;
 END IF;
 RETURN NEW;
END;
END $f10$;
ALTER FUNCTION pathways.p3_guard_rule() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_rule() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

CREATE OR REPLACE FUNCTION pathways.p3_guard_rule_child() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $f10$
DECLARE contract text;
BEGIN
IF TG_OP='UPDATE' AND NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN
 RAISE EXCEPTION 'Rule child cannot be reassigned' USING ERRCODE='23514'; END IF;
SELECT r.runtime_contract_version INTO contract FROM pathways.alert_rules r
 WHERE r.id=CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.rule_id ELSE NEW.rule_id END
 AND r.organization_id=CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.organization_id ELSE NEW.organization_id END;
IF NOT FOUND THEN RAISE EXCEPTION 'Rule parent unavailable' USING ERRCODE='23514'; END IF;
IF contract IS NOT NULL THEN
 IF contract <> 'f10.v1' THEN RAISE EXCEPTION 'Unsupported runtime contract' USING ERRCODE='23514'; END IF;
 PERFORM pathways_rules_internal.assert_runtime_mutation(TG_RELID,TG_OP,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
  CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END IF;
DECLARE parent pathways.alert_rules; rule_id uuid;
BEGIN
 rule_id:=CASE WHEN TG_OP='DELETE' THEN OLD.rule_id ELSE NEW.rule_id END;
 SELECT * INTO parent FROM pathways.alert_rules WHERE id=rule_id FOR UPDATE;
 IF NOT FOUND OR parent.status<>'DRAFT' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Conditions and recommendation templates are immutable after activation';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF parent.organization_id<>NEW.organization_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child organization mismatch'; END IF;
 IF TG_OP='UPDATE' AND NEW.rule_id<>OLD.rule_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child cannot be reassigned'; END IF;
 RETURN NEW;
END;
END $f10$;
ALTER FUNCTION pathways.p3_guard_rule_child() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_rule_child() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

CREATE OR REPLACE FUNCTION pathways.p3_guard_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $f10$
DECLARE contract text;
BEGIN
IF TG_OP='UPDATE' AND (NEW.rule_id IS DISTINCT FROM OLD.rule_id
 OR NEW.runtime_contract_version IS DISTINCT FROM OLD.runtime_contract_version) THEN
 RAISE EXCEPTION 'Alert contract and parent are immutable' USING ERRCODE='23514'; END IF;
SELECT r.runtime_contract_version INTO contract FROM pathways.alert_rules r
 WHERE r.id=CASE WHEN TG_OP='UPDATE' THEN OLD.rule_id ELSE NEW.rule_id END
 AND r.organization_id=CASE WHEN TG_OP='UPDATE' THEN OLD.organization_id ELSE NEW.organization_id END;
IF NOT FOUND THEN RAISE EXCEPTION 'Rule parent unavailable' USING ERRCODE='23514'; END IF;
IF contract IS DISTINCT FROM
 (CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.runtime_contract_version ELSE NEW.runtime_contract_version END) THEN
 RAISE EXCEPTION 'Alert contract does not match parent' USING ERRCODE='23514'; END IF;
IF contract IS NOT NULL THEN
 IF contract <> 'f10.v1' THEN RAISE EXCEPTION 'Unsupported runtime contract' USING ERRCODE='23514'; END IF;
 PERFORM pathways_rules_internal.assert_runtime_mutation(TG_RELID,TG_OP,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
  CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END IF;
DECLARE rule pathways.alert_rules;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluated rule snapshot is immutable'; END IF;
 SELECT * INTO rule FROM pathways.alert_rules WHERE id=NEW.rule_id FOR SHARE;
 IF NOT FOUND OR rule.organization_id<>NEW.organization_id OR rule.status<>'ACTIVE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Alert requires an active rule in its organization';
 END IF;
 NEW.evaluated_snapshot:=pathways.p3_evaluate_rule(NEW.rule_id,NEW.observed_values);
 IF NOT (NEW.evaluated_snapshot->>'matched')::boolean THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Nonmatching evaluation cannot create an alert'; END IF;
 NEW.severity:=rule.severity;
 RETURN NEW;
END;
END $f10$;
ALTER FUNCTION pathways.p3_guard_alert() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_alert() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

CREATE OR REPLACE FUNCTION pathways.p3_guard_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $f10$
DECLARE contract text;
BEGIN
IF TG_OP='UPDATE' AND (NEW.alert_id IS DISTINCT FROM OLD.alert_id
 OR NEW.runtime_contract_version IS DISTINCT FROM OLD.runtime_contract_version) THEN
 RAISE EXCEPTION 'Recommendation contract and parent are immutable' USING ERRCODE='23514'; END IF;
IF (CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.alert_id ELSE NEW.alert_id END) IS NOT NULL THEN
SELECT r.runtime_contract_version INTO contract FROM pathways.rule_based_alerts a
 JOIN pathways.alert_rules r ON r.id=a.rule_id AND r.organization_id=a.organization_id
 WHERE a.id=CASE WHEN TG_OP='UPDATE' THEN OLD.alert_id ELSE NEW.alert_id END
 AND a.organization_id=CASE WHEN TG_OP='UPDATE' THEN OLD.organization_id ELSE NEW.organization_id END
 AND a.project_id=CASE WHEN TG_OP='UPDATE' THEN OLD.project_id ELSE NEW.project_id END;
 IF NOT FOUND THEN RAISE EXCEPTION 'Alert parent unavailable' USING ERRCODE='23514'; END IF;
END IF;
IF contract IS DISTINCT FROM
 (CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.runtime_contract_version ELSE NEW.runtime_contract_version END) THEN
 RAISE EXCEPTION 'Recommendation contract does not match parent' USING ERRCODE='23514'; END IF;
IF contract IS NOT NULL THEN
 IF contract <> 'f10.v1' THEN RAISE EXCEPTION 'Unsupported runtime contract' USING ERRCODE='23514'; END IF;
 PERFORM pathways_rules_internal.assert_runtime_mutation(TG_RELID,TG_OP,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
  CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END IF;
DECLARE alert pathways.rule_based_alerts; template pathways.alert_rule_recommendations;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'NEW' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must begin unreviewed'; END IF;
  IF NEW.alert_id IS NOT NULL THEN
   SELECT * INTO alert FROM pathways.rule_based_alerts WHERE id=NEW.alert_id FOR SHARE;
   IF NOT FOUND OR alert.organization_id<>NEW.organization_id OR alert.project_id<>NEW.project_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation and alert scope must agree';
   END IF;
  END IF;
  IF NEW.source_rule_recommendation_id IS NOT NULL THEN
   SELECT * INTO template FROM pathways.alert_rule_recommendations WHERE id=NEW.source_rule_recommendation_id FOR SHARE;
   IF NOT FOUND OR alert.id IS NULL OR template.organization_id<>NEW.organization_id OR template.rule_id<>alert.rule_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must come from the evaluated alert rule';
   END IF;
   SELECT x INTO NEW.source_snapshot FROM jsonb_array_elements(alert.evaluated_snapshot->'recommendations') x WHERE x->>'id'=template.id::text;
   IF NEW.source_snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation template is missing from evaluated history'; END IF;
   NEW.title:=NEW.source_snapshot->>'title'; NEW.text:=NEW.source_snapshot->>'text'; NEW.type:=(NEW.source_snapshot->>'type')::pathways.recommendation_type;
  END IF;
 ELSE
  IF NOT ((OLD.status='NEW' AND NEW.status='REVIEWED') OR (OLD.status='REVIEWED' AND NEW.status IN ('RESOLVED','DISMISSED'))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A human review is required before a recommendation outcome';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note']) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation content and evaluated provenance are immutable';
  END IF;
  IF OLD.status='REVIEWED' AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_note) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_note) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation review history is immutable';
  END IF;
 END IF;
 -- This guard records human decisions only. It deliberately performs no DML.
 RETURN NEW;
END;
END $f10$;
ALTER FUNCTION pathways.p3_guard_decision() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p3_guard_decision() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- Exact generated function ownership/ACL closure, limited to declared candidates.
ALTER FUNCTION pathways_rules_internal.assert_runtime_provisioned() OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_runtime_provisioned() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.enqueue_configuration_work() OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.enqueue_configuration_work() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_bootstrap_project(uuid,text) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_bootstrap_project(uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb) OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.guard_source_context() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_source_context() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.prove_source_root_dml() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.prove_source_root_dml() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.guard_source_receipt() OWNER TO rules_source_proof_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_source_receipt() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.canonical_source_request(text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.canonical_source_request(text,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.read_source_row(text,uuid,uuid,uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.read_source_row(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.source_companion_state(text,uuid,uuid,uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_companion_state(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_omitted_source_companions(pathways_rules_internal.source_operation_context) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_omitted_source_companions(pathways_rules_internal.source_operation_context) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.validate_metric_cell(jsonb) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.validate_metric_cell(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.decimal_value(text) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.decimal_value(text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.numeric_cell(numeric) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.numeric_cell(numeric) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.unavailable_cell(text,text) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.unavailable_cell(text,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.progress_cell(text,text,text,text) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.progress_cell(text,text,text,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.evaluate_node(jsonb,jsonb,integer) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.evaluate_node(jsonb,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.committed_acknowledgement(uuid,text,uuid,bytea) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.committed_acknowledgement(uuid,text,uuid,bytea) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_session(name) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_session(name) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.read_rule_calendar() OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.read_rule_calendar() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.claim_rule_project() OWNER TO rules_lease_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.claim_rule_project() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text) OWNER TO rules_lease_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_capture_context(uuid,text) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_capture_context(uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea) OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.remove_projection_context() OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.remove_projection_context() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.eligibility_metadata_scope(uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.eligibility_metadata_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.configuration_scope(uuid,uuid) OWNER TO rules_capacity_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text) OWNER TO rules_capacity_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.validate_configuration_input(jsonb,text) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.validate_configuration_input(jsonb,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_feature_context(uuid,text,uuid,uuid,uuid,uuid,bytea) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_feature_context(uuid,text,uuid,uuid,uuid,uuid,bytea) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.remove_feature_context() OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.remove_feature_context() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.validate_review_input(jsonb,boolean) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.validate_review_input(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_human_intent(oid,jsonb,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_human_intent(oid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.alert_review_operation(uuid,jsonb,boolean) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.alert_review_operation(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_review(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_review(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_disposition(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_disposition(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_recommendation_review(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_recommendation_review(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.outcome_recipients(uuid,uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.outcome_recipients(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.classification_fingerprint(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.classification_fingerprint(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.validate_preview_input(jsonb,boolean) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.validate_preview_input(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.resource_freshness(uuid) OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.resource_freshness(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.rule_json(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.rule_json(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_get(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_get(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.read_page_input(jsonb,text[]) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.read_page_input(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_list(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.alert_json(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.alert_json(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_get(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_get(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_list(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.recommendation_json(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.recommendation_json(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_recommendation_get(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_recommendation_get(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_recommendation_list(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_recommendation_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.safe_evidence(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.safe_evidence(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_history(uuid,jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_history(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.current_decision_delivery(uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.current_decision_delivery(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.notification_json(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.notification_json(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_notification_list(jsonb) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_notification_list(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_notification_read(uuid) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways.f10_notification_read(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_configuration_intent(oid,jsonb,jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_configuration_intent(oid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.build_configuration_bindings() OWNER TO rules_eligibility_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.build_configuration_bindings() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.supersede_rule_evaluations(uuid) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.supersede_rule_evaluations(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.configuration_operation(uuid,jsonb,text) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_operation(uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_create(jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_create(jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_draft(uuid,jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_draft(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_activate(uuid,jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_activate(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_rule_archive(uuid,jsonb) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways.f10_rule_archive(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.outcome_preview_operation(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_preview(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_preview(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_recommendation_preview(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_recommendation_preview(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean) OWNER TO rules_human_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.outcome_confirm_operation(uuid,jsonb,boolean) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.outcome_confirm_operation(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_alert_confirm(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_alert_confirm(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_recommendation_confirm(uuid,jsonb) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways.f10_recommendation_confirm(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamptz,date) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.project_metric_observation(uuid,uuid,text,uuid,uuid,timestamptz,date) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text) OWNER TO rules_projection_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.install_commit_intent(oid,jsonb,jsonb) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.install_commit_intent(oid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) OWNER TO rules_commit_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.sweep_rule_projects() OWNER TO rules_sweep_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.sweep_rule_projects() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_source_companions(pathways_rules_internal.source_operation_context) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_source_companions(pathways_rules_internal.source_operation_context) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_finish_source_operation(uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_finish_source_operation(uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_source_completed() OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_source_completed() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.fence_completed_source() OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.fence_completed_source() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.source_scope(uuid,uuid) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.source_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid) OWNER TO rules_config_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid) OWNER TO rules_outcome_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.reject_runtime_record_mutation() OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.reject_runtime_record_mutation() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.guard_private_runtime_event() OWNER TO rules_runtime_guard_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.guard_private_runtime_event() FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.lock_source_request_identity(uuid,uuid,text,uuid,text) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.lock_source_request_identity(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways_rules_internal.assert_source_request_live(uuid,uuid,text,uuid,text) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_source_request_live(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
ALTER FUNCTION pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb) OWNER TO rules_enqueue_owner;
REVOKE ALL ON FUNCTION pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_rules_worker,pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways.f10_bootstrap_project(uuid,text) TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.alert_json(uuid) TO rules_outcome_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.assert_runtime_provisioned() TO rules_config_owner,rules_enqueue_owner,rules_human_owner,rules_outcome_owner,rules_projection_owner,rules_lease_owner,rules_commit_owner,rules_sweep_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.assert_session(name) TO rules_commit_owner,rules_lease_owner,rules_projection_owner,rules_sweep_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.build_configuration_bindings() TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.classification_fingerprint(uuid) TO rules_commit_owner,rules_outcome_owner,rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.configuration_admission(uuid,uuid,text) TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.configuration_record_scope(uuid,uuid) TO rules_eligibility_owner,rules_enqueue_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.confirmation_preview_metadata(uuid,uuid,uuid,uuid,boolean) TO rules_outcome_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.enqueue_configuration_work() TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.evaluate_snapshot_rule(jsonb,jsonb) TO rules_commit_owner,rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_human_scope(uuid,uuid) TO rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_preview_scope(uuid,uuid,uuid,uuid,uuid) TO rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.feature_record_scope(uuid,uuid,uuid,uuid,uuid,uuid) TO rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.human_rules_scope(uuid,uuid) TO rules_human_owner,rules_outcome_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.indicator_source_fingerprint(uuid,integer,text,text,text,uuid,text) TO rules_enqueue_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.install_capture_context(uuid,text) TO rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.install_commit_context(uuid,text,uuid,bytea) TO rules_commit_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_indicator_allowed(uuid,uuid,uuid) TO rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_metric_scope(uuid,uuid) TO rules_commit_owner,rules_eligibility_owner,rules_projection_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.lease_rule_exposure_allowed(uuid) TO rules_commit_owner,rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.recommendation_json(uuid) TO rules_outcome_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.remove_projection_context() TO rules_commit_owner,rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.resource_freshness(uuid) TO rules_human_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_dependency_fingerprint(uuid,timestamptz) TO rules_commit_owner,rules_projection_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_exposure_allowed(uuid) TO rules_capacity_owner,rules_config_owner,rules_human_owner,rules_outcome_owner,rules_runtime_guard_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.rule_json(uuid) TO rules_config_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.source_business_fingerprint(jsonb) TO rules_enqueue_owner;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.utc_milliseconds(timestamptz) TO rules_commit_owner,rules_enqueue_owner,rules_lease_owner;
GRANT EXECUTE ON FUNCTION pathways.f10_bootstrap_project(uuid,text) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_source_acknowledgement(uuid,text,text,uuid,text,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_begin_source_operation(text,uuid,uuid,text,uuid,text,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_review(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_disposition(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_recommendation_review(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_get(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_list(jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_get(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_list(jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_recommendation_get(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_recommendation_list(jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_history(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_notification_list(jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_notification_read(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_create(jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_draft(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_activate(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_rule_archive(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_preview(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_recommendation_preview(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_alert_confirm(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_recommendation_confirm(uuid,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_finish_source_operation(uuid) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.f10_abandon_source_operation(text,uuid,uuid,text,uuid,text,jsonb) TO pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.claim_rule_project() TO pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.capture_rule_snapshot(uuid,text) TO pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.commit_rule_snapshot(uuid,text,uuid,bytea) TO pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.release_or_retry_rule_job(uuid,text,text) TO pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.read_rule_calendar() TO pathways_rules_worker;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.sweep_rule_projects() TO pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.read_rule_calendar() TO pathways_rules_sweeper;
GRANT EXECUTE ON FUNCTION pathways_rules_internal.assert_runtime_mutation(oid,text,jsonb,jsonb) TO rules_config_owner,rules_commit_owner,rules_outcome_owner;

SET LOCAL check_function_bodies=on;
COMMIT;
