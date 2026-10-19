-- original_prisma_database_create must come from the protected preprovision receipt.
\if :{?original_prisma_database_create}
\else
\echo 'Captured original Prisma database CREATE value required'
\quit 2
\endif
-- Hosted control-plane only. Independently pin the TLS session endpoint to
-- target_project_ref before invocation; SQL database names do not identify a project.
-- This script never provisions machine passwords, dispatchers or schedules.
\set ON_ERROR_STOP on
\if :{?target_project_ref}
\else
\echo 'Explicit independently pinned target_project_ref required'
\quit 2
\endif
\if :{?expected_database}
\else
\echo 'Explicit expected_database required'
\quit 2
\endif
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT current_database()=:'expected_database' AND current_database()='postgres'
 AND :'target_project_ref' IN ('pdqwsknbzkdtiwjjibqt','klbtoqdalmcsfjqophty')
 AND current_user='postgres' AND session_user='postgres'
 AND current_setting('server_version_num')::integer>=160000
 AND EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND NOT rolsuper AND rolcreaterole AND rolcanlogin)
 AND EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper)
 AS target_verified \gset
\if :target_verified
\else
\echo 'Reviewed ordinary hosted postgres profile and pinned target required'
ROLLBACK;
\quit 2
\endif
SELECT :'original_prisma_database_create' IN ('t','f','true','false','1','0') AS original_value_valid \gset
\if :original_value_valid
\else
ROLLBACK;
\echo 'Invalid captured original Prisma database CREATE value'
\quit 2
\endif
-- Keep owner access until schema rights are removed. The exact temporary
-- membership graph must have been independently checked before cleanup.
DO $$ BEGIN
 IF NOT pg_catalog.pg_has_role('postgres','prisma','USAGE') OR NOT pg_catalog.pg_has_role('postgres','prisma','SET') THEN
  RAISE EXCEPTION 'Original migration owner-access path unavailable'; END IF;
END $$;
REVOKE CREATE ON SCHEMA pathways FROM rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
SELECT pg_catalog.to_regnamespace('pathways_rules_internal') IS NOT NULL AS private_schema_present \gset
\if :private_schema_present
-- Requires the reviewed temporary SET chain; ADMIN-only creator grants are insufficient.
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
REVOKE ALL ON SCHEMA pathways_rules_internal FROM prisma;
RESET ROLE;
\endif
REVOKE rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner FROM prisma GRANTED BY postgres RESTRICT;
\if :original_prisma_database_create
-- Original CREATE is preserved; do not remove a preexisting capability.
\else
REVOKE CREATE ON DATABASE postgres FROM prisma;
\endif
COMMIT;
-- Authority removal stays committed if verification fails. Catalog-only readiness
-- needs no new private schema USAGE or helper EXECUTE for the hosted LOGIN DBA.
DO $$ DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
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
