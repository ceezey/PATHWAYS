// Login-only repair; import-safe SQL builder, never connects or deploys itself.
// This is NOT application of migration 0007 and never writes a migration ledger.
// Before a future 0007 deployment, retire this exact helper under the same
// deployment transaction, or review exact-definition adoption. Do not blindly
// run 0007 over it, use CREATE OR REPLACE, or mark the whole migration applied.
export const ledgerNames = [
  '0001_init',
  '0002_pathways_foundation',
  '0003_pathways_projects_collection',
  '0004_pathways_finance_evaluation_decisions',
  '0005_supabase_security_adapter',
  '0006_auth_session_liveness',
]

// Exact discovery body already reviewed in 0007; no write-capable helper,
// profile privileges, role-permission mappings, policies or Auth operations.
export const discoveryBody = `
  SELECT u.id, u.organization_id
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    AND u.account_status='ACTIVE' AND u.archived_at IS NULL
    AND o.status='ACTIVE' AND o.archived_at IS NULL AND r.is_active
`

export function buildLoginHelperSql(ledger, { rollback = false } = {}) {
  if (
    !Array.isArray(ledger) ||
    ledger.length !== 6 ||
    ledger.some((row, i) => row.name !== ledgerNames[i] || !/^[a-f0-9]{64}$/.test(row.checksum)) ||
    typeof rollback !== 'boolean'
  ) {
    throw new Error('LOGIN_HELPER_INPUT_REJECTED')
  }
  const expected = ledger.map((row) => `('${row.name}','${row.checksum}')`).join(',')
  const definition = `CREATE FUNCTION pathways.p1_workspace_for_auth()
RETURNS TABLE(user_id uuid, organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $body$${discoveryBody}$body$`
  const exactHelper = `EXISTS (
    SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure('pathways.p1_workspace_for_auth()')
      AND p.proowner='prisma'::regrole AND p.prosecdef AND NOT p.proisstrict
      AND p.provolatile='s' AND l.lanname='sql'
      AND p.proconfig=ARRAY['search_path=""']
      AND p.prosrc=$body$${discoveryBody}$body$
      AND pg_get_function_result(p.oid)='TABLE(user_id uuid, organization_id uuid)'
      AND (SELECT count(*)=2 FROM aclexplode(p.proacl))
      AND NOT EXISTS (SELECT FROM aclexplode(p.proacl) a
        WHERE a.grantee NOT IN ('prisma'::regrole,'pathways_runtime'::regrole)
          OR a.grantor<>'prisma'::regrole OR a.privilege_type<>'EXECUTE'
          OR a.is_grantable)
  )`
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='2000ms';
SET LOCAL statement_timeout='15000ms';
SET LOCAL ROLE prisma;
DO $repair$
DECLARE before_security text; after_security text; before_ledger text;
BEGIN
  IF current_user<>'prisma' OR NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname='pathways_runtime'
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
  ) THEN RAISE EXCEPTION 'LOGIN_HELPER_ROLE_REJECTED'; END IF;
  IF (SELECT count(*) FROM public._prisma_migrations)<>6 OR EXISTS (
    SELECT FROM public._prisma_migrations m FULL JOIN (VALUES ${expected}) e(name,checksum)
      ON m.migration_name=e.name
    WHERE m.migration_name IS NULL OR e.name IS NULL OR m.checksum<>e.checksum
      OR m.finished_at IS NULL OR m.rolled_back_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'LOGIN_HELPER_LEDGER_REJECTED'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='pathways' AND c.relname IN ('system_users','roles','organizations')
        AND c.relowner='prisma'::regrole AND c.relrowsecurity
        AND NOT c.relforcerowsecurity)<>3
    OR NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='pathways.system_users'::regclass
      AND polname='p4_runtime_lock' AND polcmd='w'
      AND pg_get_expr(polwithcheck,polrelid)='false')
    OR to_regprocedure('pathways.p1_can_manage_role(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'LOGIN_HELPER_SCHEMA_REJECTED'; END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY migration_name)::text,'[]'))
    INTO before_ledger FROM public._prisma_migrations m;
  SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),
    (SELECT jsonb_agg(jsonb_build_array(oid,relowner,relacl,relrowsecurity,relforcerowsecurity)
      ORDER BY oid) FROM pg_class),
    (SELECT jsonb_agg(jsonb_build_array(attrelid,attnum,attacl) ORDER BY attrelid,attnum)
      FROM pg_attribute WHERE attacl IS NOT NULL)
  )::text) INTO before_security;
  ${
    rollback
      ? `IF NOT ${exactHelper} THEN RAISE EXCEPTION 'LOGIN_HELPER_DEFINITION_REJECTED'; END IF;
  DROP FUNCTION pathways.p1_workspace_for_auth() RESTRICT;
  IF to_regprocedure('pathways.p1_workspace_for_auth()') IS NOT NULL
    THEN RAISE EXCEPTION 'LOGIN_HELPER_ROLLBACK_FAILED'; END IF;`
      : `IF to_regprocedure('pathways.p1_workspace_for_auth()') IS NOT NULL
    THEN RAISE EXCEPTION 'LOGIN_HELPER_ALREADY_PRESENT'; END IF;
  EXECUTE $ddl$${definition}$ddl$;
  REVOKE ALL ON FUNCTION pathways.p1_workspace_for_auth()
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION pathways.p1_workspace_for_auth() TO pathways_runtime;
  IF NOT ${exactHelper} THEN RAISE EXCEPTION 'LOGIN_HELPER_POSTFLIGHT_FAILED'; END IF;`
  }
  SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),
    (SELECT jsonb_agg(jsonb_build_array(oid,relowner,relacl,relrowsecurity,relforcerowsecurity)
      ORDER BY oid) FROM pg_class),
    (SELECT jsonb_agg(jsonb_build_array(attrelid,attnum,attacl) ORDER BY attrelid,attnum)
      FROM pg_attribute WHERE attacl IS NOT NULL)
  )::text) INTO after_security;
  IF before_security IS DISTINCT FROM after_security OR before_ledger IS DISTINCT FROM (
    SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY migration_name)::text,'[]'))
      FROM public._prisma_migrations m
  ) THEN RAISE EXCEPTION 'LOGIN_HELPER_UNRELATED_CHANGE'; END IF;
END;
$repair$;
COMMIT;`
}
