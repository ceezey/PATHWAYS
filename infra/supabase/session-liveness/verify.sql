-- Read-only, non-secret catalog evidence after an independently authorized apply.
-- No Auth rows, identities, sessions, tokens, settings values or URLs are returned.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SELECT
  p.proowner = 'postgres'::regrole AS expected_owner,
  p.prosecdef AS security_definer,
  p.prorettype = 'boolean'::regtype AS boolean_result,
  p.provolatile = 's' AS stable,
  p.proconfig = ARRAY['search_path=pg_catalog','row_security=on'] AS fixed_configuration,
  md5(p.prosrc) = '9158fa6d1f37a5143c17b1f839110d9c' AS reviewed_body,
  obj_description(p.oid, 'pg_proc') =
    'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1'
    AS reviewed_comment,
  has_function_privilege('pathways_runtime', p.oid, 'EXECUTE') AS runtime_execute,
  NOT EXISTS (SELECT FROM aclexplode(p.proacl) a
    WHERE a.grantee NOT IN (p.proowner, 'pathways_runtime'::regrole)
      OR (a.grantee <> p.proowner AND a.is_grantable)) AS restricted_acl,
  NOT has_schema_privilege('pathways_runtime', 'auth', 'USAGE') AS no_runtime_auth_usage,
  NOT has_table_privilege('pathways_runtime', 'auth.sessions', 'SELECT') AS no_session_table_select
FROM pg_proc p
WHERE p.oid = to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)');
COMMIT;
