-- CI-only owned synthetic replay; never use against hosted databases.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_fault','pathways_phase4_forward_restore') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int OR current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Only root-owned disposable replay port target is permitted'; END IF; END $$;
DO $$ DECLARE role_name text;r record; BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolinherit AND NOT rolsuper AND NOT rolcreaterole) THEN RAISE EXCEPTION 'Unexpected migration principal'; END IF;
 FOREACH role_name IN ARRAY ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner','pathways_rules_worker','pathways_rules_sweeper'] LOOP
  SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname=role_name;
  IF NOT FOUND THEN EXECUTE pg_catalog.format('CREATE ROLE %I %s NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',role_name,CASE WHEN role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) THEN 'LOGIN' ELSE 'NOLOGIN' END);
  ELSIF r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
    OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR (m.roleid=r.oid AND (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']) OR m.member<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') OR m.admin_option OR NOT m.inherit_option OR NOT m.set_option))) THEN RAISE EXCEPTION 'Unsafe preexisting role'; END IF;
 END LOOP;
END $$;
GRANT rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner TO prisma WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
GRANT CREATE ON SCHEMA pathways TO rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
-- PUBLIC CREATE/TEMP reconciliation remains explicit DBA work, not silently
-- rewritten by this shared deployment script. Existing local runner already
-- revokes PUBLIC CREATE/TEMP; readiness rejects unsafe resulting rights.
COMMIT;
