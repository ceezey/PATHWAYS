-- AAD Stage 4 amendment, resequenced while still unapplied. Review this
-- migration AND its rollback before hosted use.
-- One administrator-owned boolean helper; no Auth rows, table grants or RLS changes.
-- The operator must independently verify the exact PATHWAYS-dev connection.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

DO $preflight$
DECLARE
  local_test boolean := (
      current_database() ~ '^pathways_liveness_[a-z0-9_]+$'
      OR current_database() = 'pathways_phase4_phase6_replay'
    )
    AND inet_server_addr() = '127.0.0.1'::inet;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres'
     OR (current_database() <> 'postgres' AND NOT coalesce(local_test, false)) THEN
    RAISE EXCEPTION '0006 requires the reviewed administrator and database target';
  END IF;
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION '0006 requires the existing public migration ledger';
  END IF;
  IF EXISTS (
    SELECT FROM (VALUES
      ('0001_init', '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab'),
      ('0002_pathways_foundation', 'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2'),
      ('0003_pathways_projects_collection', '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b'),
      ('0004_pathways_finance_evaluation_decisions', '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b'),
      ('0005_supabase_security_adapter', '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc')
    ) AS expected(name, checksum)
    WHERE (SELECT count(*) FROM public._prisma_migrations m
           WHERE m.migration_name = expected.name AND m.checksum = expected.checksum
             AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL) <> 1
  ) OR EXISTS (
    SELECT FROM public._prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
      AND migration_name <> '0006_auth_session_liveness'
  ) OR EXISTS (
    SELECT FROM public._prisma_migrations
    WHERE migration_name = '0006_auth_session_liveness' AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) OR (SELECT count(*) FROM public._prisma_migrations) NOT IN (5, 6)
  OR EXISTS (
    SELECT FROM public._prisma_migrations
    WHERE migration_name NOT IN (
      '0001_init',
      '0002_pathways_foundation',
      '0003_pathways_projects_collection',
      '0004_pathways_finance_evaluation_decisions',
      '0005_supabase_security_adapter',
      '0006_auth_session_liveness'
    ) OR rolled_back_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '0006 prior migration history does not match the reviewed prefix';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'pathways'
                 AND nspowner = 'prisma'::regrole)
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pathways_runtime'
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
       AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
     OR EXISTS (SELECT FROM pg_auth_members WHERE member = 'pathways_runtime'::regrole
       OR (roleid = 'pathways_runtime'::regrole AND NOT (
         -- Supabase's verified administrator-only grant manages this role;
         -- it does not let postgres inherit or SET ROLE to the runtime.
         member = 'postgres'::regrole AND admin_option
         AND NOT inherit_option AND NOT set_option)))
     OR has_schema_privilege('pathways_runtime', 'pathways', 'CREATE')
     OR has_schema_privilege('pathways_runtime', 'auth', 'USAGE')
     OR has_table_privilege('pathways_runtime', 'auth.sessions', 'SELECT') THEN
    RAISE EXCEPTION '0006 runtime/schema privileges differ from the reviewed boundary';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_class WHERE oid = 'auth.sessions'::regclass
       AND relkind = 'r' AND relowner = 'supabase_auth_admin'::regrole
       AND relrowsecurity AND NOT relforcerowsecurity)
     OR NOT has_table_privilege('postgres', 'auth.sessions', 'SELECT')
     OR NOT has_function_privilege('postgres', 'auth.uid()', 'EXECUTE')
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'auth.sessions'::regclass
       AND attnum > 0 AND NOT attisdropped AND (
         (attname IN ('id','user_id') AND atttypid = 'uuid'::regtype AND attnotnull)
         OR (attname = 'not_after' AND atttypid = 'timestamptz'::regtype))) <> 3
     OR NOT EXISTS (SELECT FROM pg_constraint k
       WHERE k.conrelid = 'auth.sessions'::regclass AND k.contype = 'p'
         AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute
           WHERE attrelid = k.conrelid AND attname = 'id')]::smallint[]) THEN
    RAISE EXCEPTION '0006 managed session schema or administrator capability differs';
  END IF;
  -- Reject every overload; never replace an unexpected existing object.
  IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'pathways' AND p.proname = 'runtime_auth_session_live') THEN
    RAISE EXCEPTION '0006 session helper already exists; inspect before recovery';
  END IF;
END
$preflight$;

CREATE FUNCTION pathways.runtime_auth_session_live(p_subject uuid, p_session uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $liveness$
BEGIN
  -- The API has verified the JWT before setting this transaction-local subject.
  -- auth.uid() supplies a consistency check, not cryptographic authentication.
  -- Runtime credentials/arbitrary SQL must remain inaccessible to end users.
  IF session_user <> 'pathways_runtime' OR p_subject IS NULL OR p_session IS NULL
     OR auth.uid() IS DISTINCT FROM p_subject THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT FROM auth.sessions AS s
    WHERE s.id = p_session AND s.user_id = p_subject
      AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END
$liveness$;

ALTER FUNCTION pathways.runtime_auth_session_live(uuid, uuid) OWNER TO postgres;
COMMENT ON FUNCTION pathways.runtime_auth_session_live(uuid, uuid)
  IS 'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1';
REVOKE ALL ON FUNCTION pathways.runtime_auth_session_live(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Managed default ACLs may name additional roles. Remove their privileges on
-- this newly created helper only; do not alter any role, schema or default ACL.
DO $acl$
DECLARE grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT pg_get_userbyid(a.grantee)
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid = 'pathways.runtime_auth_session_live(uuid,uuid)'::regprocedure
      AND a.grantee <> 0 AND a.grantee <> p.proowner
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION pathways.runtime_auth_session_live(uuid,uuid) FROM %I', grantee_name);
  END LOOP;
END
$acl$;
GRANT EXECUTE ON FUNCTION pathways.runtime_auth_session_live(uuid, uuid) TO pathways_runtime;

DO $postflight$
BEGIN
  IF NOT has_function_privilege('pathways_runtime',
       'pathways.runtime_auth_session_live(uuid,uuid)', 'EXECUTE')
     OR EXISTS (SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE p.oid = 'pathways.runtime_auth_session_live(uuid,uuid)'::regprocedure
         AND (a.grantee NOT IN (p.proowner, 'pathways_runtime'::regrole)
           OR (a.grantee <> p.proowner AND a.is_grantable))) THEN
    RAISE EXCEPTION '0006 helper execute ACL failed verification';
  END IF;
END
$postflight$;
COMMIT;
