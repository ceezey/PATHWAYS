-- Included inside the guarded reader's REPEATABLE READ, READ ONLY transaction.
-- Returns booleans/counts only; it never returns session rows or identifiers.
WITH helper AS (
  SELECT p.*
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)')
), same_name AS (
  SELECT count(*)::integer AS count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'pathways' AND p.proname = 'runtime_auth_session_live'
)
SELECT jsonb_build_object(
  'kind', 'liveness',
  'present', EXISTS (SELECT FROM helper),
  'sameNameCount', (SELECT count FROM same_name),
  'providerCompatible',
    EXISTS (SELECT FROM pg_class WHERE oid = 'auth.sessions'::regclass
      AND relkind = 'r' AND relowner = 'supabase_auth_admin'::regrole
      AND relrowsecurity AND NOT relforcerowsecurity)
    AND has_table_privilege('postgres', 'auth.sessions', 'SELECT')
    AND has_function_privilege('postgres', 'auth.uid()', 'EXECUTE')
    AND (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'auth.sessions'::regclass AND attnum > 0 AND NOT attisdropped
        AND ((attname IN ('id','user_id') AND atttypid = 'uuid'::regtype AND attnotnull)
          OR (attname = 'not_after' AND atttypid = 'timestamptz'::regtype))) = 3
    AND EXISTS (SELECT FROM pg_constraint k
      WHERE k.conrelid = 'auth.sessions'::regclass AND k.contype = 'p'
        AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = k.conrelid AND attname = 'id')]::smallint[]),
  'valid', coalesce((SELECT
    p.proowner = 'postgres'::regrole
    AND p.prosecdef
    AND p.prorettype = 'boolean'::regtype
    AND p.provolatile = 's'
    AND p.proconfig = ARRAY['search_path=pg_catalog','row_security=on']
    AND md5(p.prosrc) = '9158fa6d1f37a5143c17b1f839110d9c'
    AND obj_description(p.oid, 'pg_proc') =
      'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1'
    AND has_function_privilege('pathways_runtime', p.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT FROM aclexplode(p.proacl) a
      WHERE a.grantee NOT IN (p.proowner, 'pathways_runtime'::regrole)
        OR (a.grantee <> p.proowner AND a.is_grantable)
    )
    AND NOT has_schema_privilege('pathways_runtime', 'auth', 'USAGE')
    AND NOT has_table_privilege('pathways_runtime', 'auth.sessions', 'SELECT')
    AND NOT EXISTS (
      SELECT FROM pg_depend d
      WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
        AND d.deptype NOT IN ('i','e')
    )
    FROM helper p), false),
  'runtimeDirectSessionSelect', has_table_privilege(
    'pathways_runtime', 'auth.sessions', 'SELECT'
  ),
  'runtimeAuthUsage', has_schema_privilege('pathways_runtime', 'auth', 'USAGE')
)::text;
