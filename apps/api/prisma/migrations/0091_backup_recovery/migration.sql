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
-- It then adds pathways.recovery_points with its row security and the two actor checks p91_backup_actor and p91_backup_job_actor.
-- It then adds p91_current_migration for the runtime and the six p91_job_* functions, the only entry of the daily job login.
-- It then adds p91_backup_tables, the ordered organization table list, owned by the backup owner.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE fn record;postgres_oid oid;prisma_oid oid;bootstrap_oid oid;hosted boolean; BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0089_project_map_pins'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0091 requires the verified 0089 state and migration identity'; END IF;
 IF pg_catalog.to_regclass('pathways.recovery_points') IS NOT NULL
 THEN RAISE EXCEPTION '0091 requires the recovery points table to not already exist'; END IF;
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

-- 3. Recovery points: one row per point of an organization, readable with backups.create or backups.restore.
CREATE TABLE pathways.recovery_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    point_type text NOT NULL,
    status text DEFAULT 'CREATING' NOT NULL,
    file_mode text NOT NULL,
    created_by_id uuid,
    started_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    captured_at timestamp(3) with time zone,
    completed_at timestamp(3) with time zone,
    migration_name text,
    size_bytes bigint,
    manifest_sha256 text,
    failure_reason text,
    CONSTRAINT recovery_points_type_check CHECK (point_type IN ('MANUAL','AUTOMATIC','PRE_RESTORE')),
    CONSTRAINT recovery_points_status_check CHECK (status IN ('CREATING','READY','FAILED','UNAVAILABLE')),
    CONSTRAINT recovery_points_file_mode_check CHECK (file_mode IN ('manifest','copy')),
    CONSTRAINT recovery_points_migration_name_check CHECK (char_length(migration_name) BETWEEN 1 AND 255),
    CONSTRAINT recovery_points_size_bytes_check CHECK (size_bytes >= 0),
    CONSTRAINT recovery_points_manifest_sha256_check CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT recovery_points_failure_reason_check CHECK (char_length(btrim(failure_reason)) BETWEEN 1 AND 500),
    -- Only the daily job writes a point without a creator.
    CONSTRAINT recovery_points_creator_check CHECK ((point_type = 'AUTOMATIC') = (created_by_id IS NULL)),
    CONSTRAINT recovery_points_state_check CHECK (
     (status = 'CREATING' AND completed_at IS NULL AND failure_reason IS NULL)
     OR (status = 'READY' AND captured_at IS NOT NULL AND completed_at IS NOT NULL AND migration_name IS NOT NULL
      AND size_bytes IS NOT NULL AND manifest_sha256 IS NOT NULL AND failure_reason IS NULL)
     OR (status = 'FAILED' AND completed_at IS NOT NULL AND failure_reason IS NOT NULL)
     OR (status = 'UNAVAILABLE' AND manifest_sha256 IS NOT NULL AND failure_reason IS NOT NULL))
);
ALTER TABLE pathways.recovery_points OWNER TO prisma;
ALTER TABLE ONLY pathways.recovery_points ADD CONSTRAINT recovery_points_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pathways.recovery_points
 ADD CONSTRAINT recovery_points_organization_fk FOREIGN KEY (organization_id)
 REFERENCES pathways.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY pathways.recovery_points
 ADD CONSTRAINT recovery_points_created_by_fk FOREIGN KEY (organization_id, created_by_id)
 REFERENCES pathways.system_users(organization_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX recovery_points_list_idx ON pathways.recovery_points (organization_id, point_type, started_at DESC);

-- 4. The actor checks: a signed-in user holding a wanted permission, or the daily job login with no user at all.
CREATE FUNCTION pathways.p91_backup_actor(wanted_permissions text[]) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT nullif(current_setting('app.organization_id',true),'') IS NOT NULL
  AND nullif(current_setting('app.user_id',true),'') IS NOT NULL
  AND EXISTS(SELECT FROM pg_catalog.unnest(wanted_permissions) w(code) WHERE pathways.p09_can(w.code))
$$;
ALTER FUNCTION pathways.p91_backup_actor(text[]) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p91_backup_actor(text[]) FROM PUBLIC,anon,authenticated,service_role,pathways_backup_job;
GRANT EXECUTE ON FUNCTION pathways.p91_backup_actor(text[]) TO pathways_runtime;
-- session_user is the login, which no caller can set; the job functions of this migration are its only callers.
CREATE FUNCTION pathways.p91_backup_job_actor(wanted_org uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT session_user = 'pathways_backup_job'
  AND coalesce(current_setting('app.user_id',true),'') = ''
  AND coalesce(current_setting('request.jwt.claim.sub',true),'') = ''
  AND EXISTS(SELECT FROM pathways.organizations o WHERE o.id = wanted_org AND o.status = 'ACTIVE' AND o.archived_at IS NULL)
$$;
ALTER FUNCTION pathways.p91_backup_job_actor(uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p91_backup_job_actor(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime,pathways_backup_job;

-- 5. Row security: users act in their own organization; the prisma policies serve only the job login inside the job functions.
ALTER TABLE ONLY pathways.recovery_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY pathways.recovery_points FORCE ROW LEVEL SECURITY;
CREATE POLICY p91_recovery_points_select ON pathways.recovery_points
 FOR SELECT TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p91_backup_actor(ARRAY['backups.create','backups.restore'])
 );
CREATE POLICY p91_recovery_points_insert ON pathways.recovery_points
 FOR INSERT TO pathways_runtime WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND status = 'CREATING'
  AND created_by_id = nullif(current_setting('app.user_id', true), '')::uuid
  AND ((point_type = 'MANUAL' AND pathways.p91_backup_actor(ARRAY['backups.create']))
   OR (point_type = 'PRE_RESTORE' AND pathways.p91_backup_actor(ARRAY['backups.restore'])))
 );
CREATE POLICY p91_recovery_points_update ON pathways.recovery_points
 FOR UPDATE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p91_backup_actor(ARRAY['backups.create','backups.restore'])
 ) WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND pathways.p91_backup_actor(ARRAY['backups.create','backups.restore'])
 );
-- Pre-restore retention runs under backups.restore, so that permission may delete pre-restore points.
CREATE POLICY p91_recovery_points_delete ON pathways.recovery_points
 FOR DELETE TO pathways_runtime USING (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND (pathways.p91_backup_actor(ARRAY['backups.create'])
   OR (point_type = 'PRE_RESTORE' AND pathways.p91_backup_actor(ARRAY['backups.restore'])))
 );
CREATE POLICY p91_recovery_points_job_select ON pathways.recovery_points
 FOR SELECT TO prisma USING (pathways.p91_backup_job_actor(organization_id));
CREATE POLICY p91_recovery_points_job_write ON pathways.recovery_points
 FOR ALL TO prisma USING (point_type = 'AUTOMATIC' AND pathways.p91_backup_job_actor(organization_id))
 WITH CHECK (point_type = 'AUTOMATIC' AND pathways.p91_backup_job_actor(organization_id));

-- 6. Grants: the type, mode, organization, creator and start never change.
REVOKE ALL ON TABLE pathways.recovery_points FROM PUBLIC,anon,authenticated,service_role,pathways_backup_job;
GRANT SELECT, INSERT, DELETE ON TABLE pathways.recovery_points TO pathways_runtime;
GRANT UPDATE (status, captured_at, completed_at, migration_name, size_bytes, manifest_sha256, failure_reason)
 ON TABLE pathways.recovery_points TO pathways_runtime;

-- 7. The latest applied migration, which capture stamps on a point and restore compares.
CREATE FUNCTION pathways.p91_current_migration() RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT max(migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
$$;
ALTER FUNCTION pathways.p91_current_migration() OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p91_current_migration() FROM PUBLIC,anon,authenticated,service_role,pathways_backup_job;
GRANT EXECUTE ON FUNCTION pathways.p91_current_migration() TO pathways_runtime;

-- 8. The daily job: only the job login runs these, and the job policies keep their writes on AUTOMATIC rows.
GRANT USAGE ON SCHEMA pathways TO pathways_backup_job;
CREATE FUNCTION pathways.p91_job_organizations() RETURNS SETOF uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF session_user <> 'pathways_backup_job' OR coalesce(current_setting('app.user_id',true),'') <> ''
  OR coalesce(current_setting('request.jwt.claim.sub',true),'') <> ''
 THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.id FROM pathways.organizations o WHERE o.status = 'ACTIVE' AND o.archived_at IS NULL ORDER BY o.id;
END $$;
-- Stale automatic points fail first; a point started in the last 10 minutes makes the job busy, which is audited.
CREATE FUNCTION pathways.p91_job_begin_point(wanted_org uuid, wanted_file_mode text) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE point_id uuid;
BEGIN
 IF NOT pathways.p91_backup_job_actor(wanted_org) THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 UPDATE pathways.recovery_points SET status = 'FAILED', completed_at = now(), failure_reason = 'The backup did not finish.'
  WHERE organization_id = wanted_org AND point_type = 'AUTOMATIC' AND status = 'CREATING' AND started_at < now() - interval '10 minutes';
 IF EXISTS(SELECT FROM pathways.recovery_points WHERE organization_id = wanted_org AND status = 'CREATING'
  AND started_at >= now() - interval '10 minutes') THEN
  INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
  VALUES (wanted_org,NULL,'BACKUP_FAILED','RECOVERY_POINT',NULL,'{"pointType":"AUTOMATIC","code":"BUSY"}');
  RETURN NULL;
 END IF;
 INSERT INTO pathways.recovery_points(organization_id,point_type,file_mode) VALUES (wanted_org,'AUTOMATIC',wanted_file_mode)
  RETURNING id INTO point_id;
 RETURN point_id;
END $$;
CREATE FUNCTION pathways.p91_job_finish_point(wanted_org uuid, point_id uuid, outcome jsonb) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NOT pathways.p91_backup_job_actor(wanted_org) THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(outcome) IS DISTINCT FROM 'object'
  OR NOT outcome ?& ARRAY['capturedAt','migration','sizeBytes','manifestSha256','changes']
  OR (SELECT count(*) FROM jsonb_object_keys(outcome)) <> 5
 THEN RAISE EXCEPTION 'Invalid backup outcome' USING ERRCODE='22023'; END IF;
 UPDATE pathways.recovery_points SET status = 'READY', captured_at = (outcome->>'capturedAt')::timestamptz, completed_at = now(),
  migration_name = outcome->>'migration', size_bytes = (outcome->>'sizeBytes')::bigint, manifest_sha256 = outcome->>'manifestSha256'
  WHERE id = point_id AND organization_id = wanted_org AND point_type = 'AUTOMATIC' AND status = 'CREATING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES (wanted_org,NULL,'BACKUP_CREATED','RECOVERY_POINT',point_id::text,outcome->'changes');
END $$;
-- The parameters are qualified because failure_reason is also a column name.
CREATE FUNCTION pathways.p91_job_fail_point(wanted_org uuid, point_id uuid, failure_reason text, changes jsonb) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NOT pathways.p91_backup_job_actor(wanted_org) THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 UPDATE pathways.recovery_points SET status = 'FAILED', completed_at = now(), failure_reason = p91_job_fail_point.failure_reason
  WHERE id = point_id AND organization_id = wanted_org AND point_type = 'AUTOMATIC' AND status = 'CREATING';
 IF NOT FOUND THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES (wanted_org,NULL,'BACKUP_FAILED','RECOVERY_POINT',point_id::text,p91_job_fail_point.changes);
END $$;
-- Finished automatic points older than the 7th newest READY one, oldest first; 7 equals BACKUP_RETENTION.AUTOMATIC.
CREATE FUNCTION pathways.p91_job_retention_points(wanted_org uuid) RETURNS SETOF uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NOT pathways.p91_backup_job_actor(wanted_org) THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id FROM pathways.recovery_points r
  WHERE r.organization_id = wanted_org AND r.point_type = 'AUTOMATIC' AND r.status <> 'CREATING'
   AND r.started_at < (SELECT k.started_at FROM pathways.recovery_points k WHERE k.organization_id = wanted_org
    AND k.point_type = 'AUTOMATIC' AND k.status = 'READY' ORDER BY k.started_at DESC, k.id DESC OFFSET 6 LIMIT 1)
  ORDER BY r.started_at, r.id;
END $$;
CREATE FUNCTION pathways.p91_job_delete_point(wanted_org uuid, point_id uuid) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF NOT pathways.p91_backup_job_actor(wanted_org) THEN RAISE EXCEPTION 'Backup access denied' USING ERRCODE='42501'; END IF;
 DELETE FROM pathways.recovery_points WHERE id = point_id AND organization_id = wanted_org
  AND point_id IN (SELECT pathways.p91_job_retention_points(wanted_org));
 RETURN FOUND;
END $$;
ALTER FUNCTION pathways.p91_job_organizations() OWNER TO prisma;
ALTER FUNCTION pathways.p91_job_begin_point(uuid,text) OWNER TO prisma;
ALTER FUNCTION pathways.p91_job_finish_point(uuid,uuid,jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p91_job_fail_point(uuid,uuid,text,jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.p91_job_retention_points(uuid) OWNER TO prisma;
ALTER FUNCTION pathways.p91_job_delete_point(uuid,uuid) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p91_job_organizations(), pathways.p91_job_begin_point(uuid,text),
 pathways.p91_job_finish_point(uuid,uuid,jsonb), pathways.p91_job_fail_point(uuid,uuid,text,jsonb),
 pathways.p91_job_retention_points(uuid), pathways.p91_job_delete_point(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.p91_job_organizations(), pathways.p91_job_begin_point(uuid,text),
 pathways.p91_job_finish_point(uuid,uuid,jsonb), pathways.p91_job_fail_point(uuid,uuid,text,jsonb),
 pathways.p91_job_retention_points(uuid), pathways.p91_job_delete_point(uuid,uuid)
 TO pathways_backup_job;

-- 9. The ordered organization tables, parents before children, which capture walks forward and restore walks both ways.
-- Two foreign keys point back up the list and are dropped and re-added by restore: budget_expense_entries_receipt_evidence_fkey
-- and f10_private_review_scope. Audit history is captured but never restored. The backup owner reaches every table through
-- prisma, rules_store_owner and report_projection_owner, which the runtime suite asserts. The owner sets its own ACL, so it
-- borrows USAGE as well as CREATE on the schema to name the function, and returns both.
GRANT USAGE, CREATE ON SCHEMA pathways TO pathways_backup_owner;
SET LOCAL ROLE pathways_backup_owner;
CREATE FUNCTION pathways.p91_backup_tables() RETURNS TABLE(table_order integer, table_name text, restore boolean)
 LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path TO '' SET lock_timeout TO '5s' AS $$
 SELECT v.n, v.t, v.t <> 'pathways.audit_logs' FROM (VALUES
   (1,'pathways.audit_logs'),(2,'pathways.beneficiaries'),(3,'pathways.implementing_partners'),
   (4,'pathways.indicator_library_entries'),(5,'pathways.programs'),(6,'pathways_rules_internal.project_state'),
   (7,'pathways.beneficiary_identifiers'),(8,'pathways.projects'),(9,'pathways.alert_rules'),
   (10,'pathways.alert_rule_conditions'),(11,'pathways.alert_rule_recommendations'),(12,'pathways_rules_internal.configuration_receipts'),
   (13,'pathways_rules_internal.jobs'),(14,'pathways_rules_internal.source_request_abandonments'),(15,'pathways_rules_internal.work_items'),
   (16,'pathways_rules_internal.source_operation_receipts'),(17,'pathways.beneficiary_project_enrollments'),(18,'pathways.journey_stages'),
   (19,'pathways.project_activities'),(20,'pathways.project_evaluation_criteria'),(21,'pathways.project_evaluations'),
   (22,'pathways.project_implementing_partners'),(23,'pathways.project_indicators'),(24,'pathways.project_map_pins'),
   (25,'pathways.project_milestones'),(26,'pathways.project_publications'),(27,'pathways.sensitive_aggregate_releases'),
   (28,'pathways.survey_period_releases'),(29,'pathways.user_project_assignments'),(30,'pathways_rules_internal.snapshots'),
   (31,'pathways.activity_escalations'),(32,'pathways.activity_extension_requests'),(33,'pathways.activity_indicator_links'),
   (34,'pathways.activity_journey_stage_mappings'),(35,'pathways.activity_overdue_explanations'),(36,'pathways.activity_updates'),
   (37,'pathways.digital_forms'),(38,'pathways.project_activity_assignments'),(39,'pathways.project_budget_records'),
   (40,'pathways.project_evaluation_scores'),(41,'pathways.project_indicator_measurements'),(42,'pathways.publication_requests'),
   (43,'pathways_rules_internal.acknowledgements'),(44,'pathways_rules_internal.eligibility'),(45,'pathways_rules_internal.evaluations'),
   (46,'pathways.budget_expense_entries'),(47,'pathways.data_import_batches'),(48,'pathways.form_fields'),
   (49,'pathways.reports'),(50,'pathways.rule_based_alerts'),(51,'pathways.survey_aggregate_releases'),
   (52,'pathways_rules_internal.rule_bindings'),(53,'pathways_rules_internal.work_coverage'),(54,'pathways.data_import_rows'),
   (55,'pathways.decision_recommendations'),(56,'pathways.expense_signoffs'),(57,'pathways.import_value_rejections'),
   (58,'pathways.metadata_mappings'),(59,'pathways.project_indicator_bindings'),(60,'pathways_rules_internal.episode_cursors'),
   (61,'pathways.form_submissions'),(62,'pathways_rules_internal.feature_operation_receipts'),(63,'pathways_rules_internal.recommendation_reviews'),
   (64,'pathways.assessment_results'),(65,'pathways.beneficiary_activity_participations'),(66,'pathways.beneficiary_consent_records'),
   (67,'pathways.evidence_media'),(68,'pathways.form_response_values'),(69,'pathways_rules_internal.alert_reviews'),
   (70,'pathways_rules_internal.decisions'),(71,'pathways_rules_internal.lifecycle_events'),(72,'pathways.beneficiary_journey_events'),
   (73,'pathways_rules_internal.notifications'),(74,'pathways_rules_internal.outcome_previews')
 ) v(n,t)
$$;
REVOKE ALL ON FUNCTION pathways.p91_backup_tables() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.p91_backup_tables() TO pathways_runtime;
RESET ROLE;
REVOKE USAGE, CREATE ON SCHEMA pathways FROM pathways_backup_owner;

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
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity AND pg_catalog.pg_get_userbyid(relowner)='prisma' FROM pg_catalog.pg_class
   WHERE oid='pathways.recovery_points'::pg_catalog.regclass)
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.recovery_points'::pg_catalog.regclass
   AND polroles=ARRAY['pathways_runtime'::pg_catalog.regrole::oid])<>4
  OR (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.recovery_points'::pg_catalog.regclass
   AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid])<>2
  OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.recovery_points'::pg_catalog.regclass
   AND contype='c' AND convalidated)<>9
  OR pg_catalog.has_table_privilege('pathways_runtime','pathways.recovery_points','UPDATE')
  OR pg_catalog.has_column_privilege('pathways_runtime','pathways.recovery_points','point_type','UPDATE')
  OR pg_catalog.has_table_privilege('pathways_backup_job','pathways.recovery_points','SELECT,INSERT,UPDATE,DELETE')
  OR NOT pg_catalog.has_function_privilege('pathways_runtime','pathways.p91_backup_actor(text[])','EXECUTE')
  OR pg_catalog.has_function_privilege('pathways_runtime','pathways.p91_backup_job_actor(uuid)','EXECUTE')
  OR pg_catalog.has_function_privilege('pathways_backup_job','pathways.p91_backup_job_actor(uuid)','EXECUTE')
 THEN RAISE EXCEPTION '0091 recovery points postcondition failed'; END IF;
 -- Each helper is a prisma definer with an empty search_path whose only EXECUTE grants are the owner's and its one caller's.
 FOR fn IN SELECT w.sig, w.vol, w.caller, p.oid, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM (VALUES ('pathways.p91_current_migration()','s','pathways_runtime'),
   ('pathways.p91_job_organizations()','s','pathways_backup_job'),
   ('pathways.p91_job_begin_point(uuid,text)','v','pathways_backup_job'),
   ('pathways.p91_job_finish_point(uuid,uuid,jsonb)','v','pathways_backup_job'),
   ('pathways.p91_job_fail_point(uuid,uuid,text,jsonb)','v','pathways_backup_job'),
   ('pathways.p91_job_retention_points(uuid)','s','pathways_backup_job'),
   ('pathways.p91_job_delete_point(uuid,uuid)','v','pathways_backup_job')) w(sig,vol,caller)
  LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) LOOP
  IF fn.oid IS NULL OR pg_catalog.pg_get_userbyid(fn.proowner)<>'prisma' OR NOT fn.prosecdef OR fn.provolatile<>fn.vol
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR (SELECT pg_catalog.array_agg(s.e ORDER BY s.e) FROM (SELECT pg_catalog.pg_get_userbyid(a.grantee)||':'||a.privilege_type
     ||':'||a.is_grantable::text AS e FROM pg_catalog.aclexplode(fn.proacl) a) s)
    IS DISTINCT FROM ARRAY[fn.caller||':EXECUTE:false','prisma:EXECUTE:false']
  THEN RAISE EXCEPTION '0091 % postcondition failed',fn.sig; END IF;
 END LOOP;
 -- The table list is a backup owner definer with an empty search_path and a 5s lock timeout, executable by the runtime alone.
 IF NOT EXISTS(SELECT FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('pathways.p91_backup_tables()')
   AND pg_catalog.pg_get_userbyid(p.proowner)='pathways_backup_owner' AND p.prosecdef AND p.provolatile='i'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""','lock_timeout=5s']
   AND (SELECT pg_catalog.array_agg(s.e ORDER BY s.e) FROM (SELECT pg_catalog.pg_get_userbyid(a.grantee)||':'||a.privilege_type
     ||':'||a.is_grantable::text AS e FROM pg_catalog.aclexplode(p.proacl) a) s)
    IS NOT DISTINCT FROM ARRAY['pathways_backup_owner:EXECUTE:false','pathways_runtime:EXECUTE:false'])
  OR pg_catalog.has_schema_privilege('pathways_backup_owner','pathways','CREATE')
 THEN RAISE EXCEPTION '0091 pathways.p91_backup_tables() postcondition failed'; END IF;
 IF NOT pg_catalog.has_schema_privilege('pathways_backup_job','pathways','USAGE')
  OR pg_catalog.has_schema_privilege('pathways_backup_job','pathways','CREATE')
  OR EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('pathways','pathways_rules_internal') AND c.relkind IN ('r','p','v','m','f')
    AND (pg_catalog.has_table_privilege('pathways_backup_job',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_any_column_privilege('pathways_backup_job',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 THEN RAISE EXCEPTION '0091 backup job privilege postcondition failed'; END IF;
END $$;
COMMIT;
