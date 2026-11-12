-- 0091 backup recovery (cr-pathways-backup-recovery); forward migration.
-- Per-organization recovery points are captured and restored by SECURITY DEFINER functions owned by pathways_backup_owner,
-- which inherits prisma, rules_store_owner and report_projection_owner. This part widens the two provisioning assertions so
-- they accept exactly that role's three permanent memberships (INHERIT only, granted by postgres) and nothing else:
-- pathways_rules_internal.assert_runtime_provisioned (owner rules_context_owner, in the rules_store_owner schema) and
-- pathways.p34_assert_projection_provisioned (owner report_projection_owner). Each body keeps its earlier text except the
-- widened membership clause; owner, SECURITY INVOKER, volatility, search_path and ACL stay unchanged (asserted below).
-- DBA prerequisite: run hosted-backup-preprovision.sql first (creates the backup owner and job roles and a temporary SET-only
-- membership from prisma to the backup, rules store, rules context and report owners) and hosted-backup-cleanup.sql
-- afterwards, also after a failure; until the cleanup runs, both assertions and the backup functions fail closed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE fn record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0089_project_map_pins'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0091 requires the verified 0089 state and migration identity'; END IF;
 IF EXISTS(SELECT FROM unnest(ARRAY['pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner']) o
  WHERE NOT pg_catalog.pg_has_role('prisma',o,'SET') OR pg_catalog.pg_has_role('prisma',o,'USAGE'))
 THEN RAISE EXCEPTION '0091 requires the temporary SET-only chain (run hosted-backup-preprovision.sql)'; END IF;
 SELECT oid INTO postgres_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO prisma_oid FROM pg_catalog.pg_roles WHERE rolname='prisma';
 SELECT oid INTO bootstrap_oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin' AND rolsuper;
 SELECT NOT rolsuper AND rolcreaterole AND rolcanlogin AND bootstrap_oid IS NOT NULL INTO hosted
  FROM pg_catalog.pg_roles WHERE oid=postgres_oid;
 -- Neither role holds a membership; their only members are the hosted bootstrap ADMIN row and, for the owner, the prisma chain.
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE ((rolname='pathways_backup_owner' AND NOT rolcanlogin)
   OR (rolname='pathways_backup_job' AND rolcanlogin))
   AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)<>2
  OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.member,m.roleid)
   WHERE r.rolname IN ('pathways_backup_owner','pathways_backup_job') AND NOT coalesce(
    (m.roleid=r.oid AND hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
    OR (m.roleid=r.oid AND r.rolname='pathways_backup_owner' AND m.member=prisma_oid AND m.grantor=postgres_oid
     AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option),false))
 THEN RAISE EXCEPTION '0091 requires the reviewed backup owner and backup job roles'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways')<>'prisma'
  OR (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='pathways_rules_internal')<>'rules_store_owner'
  OR pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_context_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0091 requires the reviewed schema owners and no earlier schema CREATE'; END IF;
 -- Only the reviewed 0031 and 0034 definitions, or this migration's own on a rerun, may be replaced; their ACLs are kept.
 -- The functions are found by name because prisma holds no USAGE on pathways_rules_internal.
 FOR fn IN SELECT w.n, w.nsp, w.name, w.owner, w.md5, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways_rules_internal','assert_runtime_provisioned','rules_context_owner',ARRAY['fcb17774553a9954fbb452d42480e502','e0253a20a840859753e73997c2ff1c86']),
   (1,'pathways','p34_assert_projection_provisioned','report_projection_owner',ARRAY['42aaa8fba273b9e0eb72ce6b3be34ab5','cbe9a226514bb68959b55b4bafaa9db7'])) w(n,nsp,name,owner,md5)
  LEFT JOIN (pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace)
   ON s.nspname=w.nsp AND p.proname=w.name AND p.pronargs=0 LOOP
  IF fn.prosrc IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>fn.owner OR fn.prosecdef OR fn.provolatile<>'s'
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR pg_catalog.md5(fn.prosrc)<>ALL(fn.md5)
  THEN RAISE EXCEPTION '0091 requires the reviewed definition of %.%',fn.nsp,fn.name; END IF;
  PERFORM pg_catalog.set_config('pathways_0091.acl_'||fn.n,coalesce(fn.proacl::text,''),true);
 END LOOP;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,1);

-- 1. The report projection assertion; prisma, the pathways schema owner, lends CREATE for the one statement.
GRANT CREATE ON SCHEMA pathways TO report_projection_owner;
SET LOCAL ROLE report_projection_owner;
CREATE OR REPLACE FUNCTION pathways.p34_assert_projection_provisioned()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;backup_oid oid;
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
 SELECT oid INTO backup_oid FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_owner';
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['public_projection_owner','report_projection_owner','finance_operation_owner'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR (role_name='report_projection_owner' AND backup_oid IS NOT NULL AND m.member=backup_oid AND m.grantor=postgres_oid
      AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)))
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
 IF backup_oid IS NOT NULL AND (
  EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.oid=backup_oid AND (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
   OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication))
  OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=backup_oid AND (m.admin_option OR m.set_option
   OR NOT m.inherit_option OR m.grantor<>postgres_oid
   OR m.roleid NOT IN (prisma_oid,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_store_owner'),
    (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='report_projection_owner'))))
  OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=backup_oid AND NOT
   (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)))
 THEN RAISE EXCEPTION 'Core projection provisioning incomplete' USING ERRCODE='42501'; END IF;
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
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pathways FROM report_projection_owner;

-- 2. The rules assertion; rules_store_owner, the pathways_rules_internal schema owner, lends CREATE for the one statement.
SET LOCAL ROLE rules_store_owner;
GRANT CREATE ON SCHEMA pathways_rules_internal TO rules_context_owner;
RESET ROLE;
SET LOCAL ROLE rules_context_owner;
CREATE OR REPLACE FUNCTION pathways_rules_internal.assert_runtime_provisioned()
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text;existing record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean;backup_oid oid;
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
 SELECT oid INTO backup_oid FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_owner';
 -- Hosted creator ADMIN authority is an explicitly trusted control-plane boundary.
 -- It grants neither inherited privileges nor SET ROLE; do not remove its bootstrap grant.
 FOREACH role_name IN ARRAY ARRAY['rules_store_owner','rules_lease_owner','rules_projection_owner','rules_commit_owner','rules_sweep_owner','rules_enqueue_owner','rules_human_owner','rules_context_owner','rules_eligibility_owner','rules_config_owner','rules_capacity_owner','rules_source_proof_owner','rules_outcome_owner','rules_runtime_guard_owner','pathways_rules_worker','pathways_rules_sweeper'] LOOP
  SELECT r.* INTO existing FROM pg_catalog.pg_roles r WHERE r.rolname=role_name;
  IF NOT FOUND OR existing.rolsuper OR existing.rolbypassrls OR existing.rolinherit OR existing.rolcreatedb OR existing.rolcreaterole OR existing.rolreplication
   OR existing.rolcanlogin IS DISTINCT FROM (role_name=ANY(ARRAY['pathways_rules_worker','pathways_rules_sweeper']))
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=existing.oid)
   OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=existing.oid AND NOT
    ((hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR (role_name='rules_store_owner' AND backup_oid IS NOT NULL AND m.member=backup_oid AND m.grantor=postgres_oid
      AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)))
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
 IF backup_oid IS NOT NULL AND (
  EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.oid=backup_oid AND (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
   OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication))
  OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=backup_oid AND (m.admin_option OR m.set_option
   OR NOT m.inherit_option OR m.grantor<>postgres_oid
   OR m.roleid NOT IN (prisma_oid,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='rules_store_owner'),
    (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='report_projection_owner'))))
  OR EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid=backup_oid AND NOT
   (hosted AND m.member=postgres_oid AND m.grantor=bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)))
 THEN RAISE EXCEPTION 'Rules runtime provisioning incomplete' USING ERRCODE='42501'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE rules_store_owner;
REVOKE CREATE ON SCHEMA pathways_rules_internal FROM rules_context_owner;
RESET ROLE;

-- Postconditions: the widened bodies, owners, invoker mode, volatility, empty search_path, the saved ACLs and no lent CREATE.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT w.n, w.nsp, w.name, w.owner, w.md5, p.prosrc, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES (0,'pathways_rules_internal','assert_runtime_provisioned','rules_context_owner','e0253a20a840859753e73997c2ff1c86'),
   (1,'pathways','p34_assert_projection_provisioned','report_projection_owner','cbe9a226514bb68959b55b4bafaa9db7')) w(n,nsp,name,owner,md5)
  LEFT JOIN (pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace)
   ON s.nspname=w.nsp AND p.proname=w.name AND p.pronargs=0 LOOP
  IF fn.prosrc IS NULL OR pg_catalog.md5(fn.prosrc)<>fn.md5 OR pg_catalog.pg_get_userbyid(fn.proowner)<>fn.owner
   OR fn.prosecdef OR fn.provolatile<>'s' OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR coalesce(fn.proacl::text,'') IS DISTINCT FROM pg_catalog.current_setting('pathways_0091.acl_'||fn.n)
  THEN RAISE EXCEPTION '0091 %.% postcondition failed',fn.nsp,fn.name; END IF;
 END LOOP;
 IF pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE')
  OR pg_catalog.has_schema_privilege('rules_context_owner','pathways_rules_internal','CREATE')
 THEN RAISE EXCEPTION '0091 lent schema CREATE remains'; END IF;
END $$;
COMMIT;
