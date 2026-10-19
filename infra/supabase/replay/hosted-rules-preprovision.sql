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
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='prisma' AND rolcanlogin AND rolinherit
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolreplication)
  OR NOT pg_catalog.pg_has_role('postgres','prisma','USAGE') OR NOT pg_catalog.pg_has_role('postgres','prisma','SET')
  OR EXISTS(SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
  OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0030_core_profile_partners'
   AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  OR EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0031_f10_f11_rules_runtime'
   AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
  RAISE EXCEPTION 'Verified migration principal, owner-access path and clean ledger through0030 required';
 END IF;
 IF EXISTS(SELECT FROM pg_catalog.pg_database d CROSS JOIN LATERAL
  pg_catalog.aclexplode(COALESCE(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
  WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type IN ('CREATE','TEMPORARY'))
  OR EXISTS(SELECT FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL
   pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
   WHERE a.grantee=0 AND a.privilege_type='CREATE') THEN
  RAISE EXCEPTION 'Separately reviewed PUBLIC ACL reconciliation required';
 END IF;
END $$;
-- Save this captured original value in the protected rollout receipt and pass it
-- unchanged to cleanup, including after failure. Full original ACL parity is a gate.
SELECT pg_catalog.has_database_privilege('prisma',current_database(),'CREATE') AS original_prisma_database_create \gset
\echo 'Original prisma database CREATE:' :original_prisma_database_create
DO $$ DECLARE name text;r record;machine boolean; BEGIN
 FOREACH name IN ARRAY ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner','pathways_rules_worker','pathways_rules_sweeper'] LOOP
  machine:=name IN ('pathways_rules_worker','pathways_rules_sweeper');
  SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname=name;
  IF NOT FOUND THEN
   EXECUTE pg_catalog.format('CREATE ROLE %I %s NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION %s',
    name,CASE WHEN machine THEN 'LOGIN' ELSE 'NOLOGIN' END,CASE WHEN machine THEN 'CONNECTION LIMIT 0' ELSE '' END);
  ELSIF r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
   OR r.rolcanlogin IS DISTINCT FROM machine OR (machine AND r.rolconnlimit<>0)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid AND NOT
    ((m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
      AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper)
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR (NOT machine AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
      AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
      AND NOT m.admin_option AND m.inherit_option AND m.set_option))) THEN
   RAISE EXCEPTION 'Unsafe or unreviewed preexisting feature role';
  END IF;
 END LOOP;
END $$;
GRANT rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner TO prisma WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY postgres;
GRANT CREATE ON SCHEMA pathways TO rules_store_owner,rules_lease_owner,rules_projection_owner,rules_commit_owner,rules_sweep_owner,rules_enqueue_owner,rules_human_owner,rules_context_owner,rules_eligibility_owner,rules_config_owner,rules_capacity_owner,rules_source_proof_owner,rules_outcome_owner,rules_runtime_guard_owner;
\if :original_prisma_database_create
\else
GRANT CREATE ON DATABASE postgres TO prisma;
\endif
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
COMMIT;
