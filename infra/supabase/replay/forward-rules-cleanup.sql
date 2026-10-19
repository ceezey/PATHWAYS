-- Owned synthetic replay DBA only; same grantor as preprovision. Run after
-- successful deploy; also run after failed/rolled-back deployment before retry.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_fault','pathways_phase4_forward_restore') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM current_setting('pathways.replay_port', true)::int OR current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'Only root-owned disposable replay port target is permitted'; END IF; END $$;
REVOKE rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner FROM prisma;
REVOKE CREATE ON SCHEMA pathways FROM rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
DO $$ BEGIN IF EXISTS(SELECT FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal') THEN
 EXECUTE 'REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner';
 EXECUTE 'REVOKE ALL ON SCHEMA pathways_rules_internal FROM prisma';
END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE r.rolname=ANY(ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner']) AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')) THEN RAISE EXCEPTION 'Temporary migration membership remains'; END IF; END $$;
-- On successful deploy, this authoritative check must PASS before runtime tests
-- or activation. A failed deployment has no helper and still needs ACL cleanup.
DO $$ BEGIN IF pg_catalog.to_regprocedure('pathways_rules_internal.assert_runtime_provisioned()') IS NOT NULL THEN PERFORM pathways_rules_internal.assert_runtime_provisioned(); END IF; END $$;
COMMIT;
