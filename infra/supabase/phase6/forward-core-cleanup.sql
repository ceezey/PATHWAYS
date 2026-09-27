-- Owned disposable local CI only. Never use on hosted databases.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT IN ('pathways_phase4_phase6_replay','pathways_phase4_baseline','pathways_phase4_forward_fault','pathways_phase4_forward_restore','pathways_phase4_core_fault','pathways_phase4_core_retry')
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55448
 OR current_user<>'postgres' OR session_user<>'postgres'
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolsuper)
 THEN RAISE EXCEPTION 'Only owned disposable55448 local superuser profile permitted'; END IF; END $$;
-- Preserve owner authority until schema grant removal completes.
REVOKE CREATE ON SCHEMA pathways FROM public_projection_owner,report_projection_owner,finance_operation_owner;
REVOKE public_projection_owner,report_projection_owner,finance_operation_owner FROM prisma GRANTED BY postgres RESTRICT;
-- Retain only completed feature ownership; failed installation restores baseline helper ACLs.
DO $context_cleanup$ BEGIN
 IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0034_core_feature_completion' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
  REVOKE EXECUTE ON FUNCTION pathways.runtime_context_organization(),pathways.runtime_context_user() FROM report_projection_owner,finance_operation_owner RESTRICT;
 END IF;
END $context_cleanup$;
COMMIT;
-- No helper EXECUTE grant to LOGIN DBA: canonical catalog-only readiness.
DO $$ DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;
BEGIN
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 IF postgres_oid IS NULL OR prisma_oid IS NULL OR hosted IS NULL OR
  (NOT hosted AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE oid=postgres_oid AND rolsuper)) THEN
  RAISE EXCEPTION 'Core projection provisioning incomplete' USING ERRCODE='42501';
 END IF;
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['public_projection_owner','report_projection_owner','finance_operation_owner'] LOOP
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
    )
 THEN
   RAISE EXCEPTION 'Core projection provisioning incomplete' USING ERRCODE='42501';
  END IF;
 END LOOP;
END $$;

DO $context_verify$ BEGIN
 IF EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0034_core_feature_completion' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
 <<p34_context_helper_acl>>
DECLARE
 ctx_name text;ctx_fn record;ctx_owner oid;ctx_expected oid[];
BEGIN
 SELECT oid INTO ctx_owner FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT pg_catalog.array_agg(oid ORDER BY oid) INTO ctx_expected FROM pg_catalog.pg_roles
 WHERE rolname=ANY(ARRAY['postgres','pathways_runtime','report_projection_owner','finance_operation_owner']);
 IF ctx_owner IS NULL OR pg_catalog.cardinality(ctx_expected)<>4 THEN RAISE EXCEPTION 'Core context helper principals unavailable' USING ERRCODE='42501'; END IF;
 FOREACH ctx_name IN ARRAY ARRAY['runtime_context_organization','runtime_context_user'] LOOP
  SELECT p.* INTO ctx_fn FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure(pg_catalog.format('pathways.%I()',ctx_name));
  IF NOT FOUND OR ctx_fn.proowner<>ctx_owner OR ctx_fn.prorettype<>'pg_catalog.uuid'::pg_catalog.regtype
   OR ctx_fn.proretset OR ctx_fn.prokind<>'f' OR NOT ctx_fn.prosecdef OR ctx_fn.provolatile<>'s'
   OR ctx_fn.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR ctx_fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR pg_catalog.md5(pg_catalog.regexp_replace(ctx_fn.prosrc,'[[:space:]]','','g'))<>
    (CASE ctx_name WHEN 'runtime_context_organization' THEN '2d76aa3b324899355b56837213df25a0' ELSE 'f27cc6e4905d203b147f022435e6cb61' END)
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a
    WHERE a.grantor<>ctx_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR NOT (a.grantee=ANY(ctx_expected)))
   OR (SELECT pg_catalog.array_agg(a.grantee ORDER BY a.grantee) FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a) IS DISTINCT FROM ctx_expected
  THEN RAISE EXCEPTION 'Core context helper definition or exact ACL differs' USING ERRCODE='42501'; END IF;
 END LOOP;
END p34_context_helper_acl;
 ELSE
 <<p34_context_helper_acl>>
DECLARE
 ctx_name text;ctx_fn record;ctx_owner oid;ctx_expected oid[];
BEGIN
 SELECT oid INTO ctx_owner FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT pg_catalog.array_agg(oid ORDER BY oid) INTO ctx_expected FROM pg_catalog.pg_roles
 WHERE rolname=ANY(ARRAY['postgres','pathways_runtime']);
 IF ctx_owner IS NULL OR pg_catalog.cardinality(ctx_expected)<>2 THEN RAISE EXCEPTION 'Core context helper principals unavailable' USING ERRCODE='42501'; END IF;
 FOREACH ctx_name IN ARRAY ARRAY['runtime_context_organization','runtime_context_user'] LOOP
  SELECT p.* INTO ctx_fn FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure(pg_catalog.format('pathways.%I()',ctx_name));
  IF NOT FOUND OR ctx_fn.proowner<>ctx_owner OR ctx_fn.prorettype<>'pg_catalog.uuid'::pg_catalog.regtype
   OR ctx_fn.proretset OR ctx_fn.prokind<>'f' OR NOT ctx_fn.prosecdef OR ctx_fn.provolatile<>'s'
   OR ctx_fn.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR ctx_fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR pg_catalog.md5(pg_catalog.regexp_replace(ctx_fn.prosrc,'[[:space:]]','','g'))<>
    (CASE ctx_name WHEN 'runtime_context_organization' THEN '2d76aa3b324899355b56837213df25a0' ELSE 'f27cc6e4905d203b147f022435e6cb61' END)
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a
    WHERE a.grantor<>ctx_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR NOT (a.grantee=ANY(ctx_expected)))
   OR (SELECT pg_catalog.array_agg(a.grantee ORDER BY a.grantee) FROM pg_catalog.aclexplode(coalesce(ctx_fn.proacl,pg_catalog.acldefault('f',ctx_fn.proowner))) a) IS DISTINCT FROM ctx_expected
  THEN RAISE EXCEPTION 'Core context helper definition or exact ACL differs' USING ERRCODE='42501'; END IF;
 END LOOP;
END p34_context_helper_acl;
 END IF;
END $context_verify$;
