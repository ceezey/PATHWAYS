-- Read-only state check for the exact correction target. The wrapper supplies
-- BEGIN ... READ ONLY, timeouts and ROLLBACK.
WITH target AS (
  SELECT p.*
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pathways_prevent_audit_mutation'
), exact_target AS (
  SELECT p.*
  FROM target p
  WHERE pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
), target_acl AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_array(
        CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
        pg_catalog.pg_get_userbyid(acl.grantor),
        acl.privilege_type,
        acl.is_grantable
      )
      ORDER BY
        CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END COLLATE "C",
        pg_catalog.pg_get_userbyid(acl.grantor) COLLATE "C",
        acl.privilege_type COLLATE "C",
        acl.is_grantable
    ),
    '[]'::jsonb
  ) AS value
  FROM exact_target p
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
)
SELECT jsonb_build_object(
  'database', current_database(),
  'user', current_user,
  'sessionUser', session_user,
  'readOnly', current_setting('transaction_read_only') = 'on',
  'sameNameCount', (SELECT count(*) FROM target),
  'exactCount', (SELECT count(*) FROM exact_target),
  'definitionMatches', coalesce((
    SELECT encode(
      extensions.digest(convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8'), 'sha256'),
      'hex'
    ) = 'efbe62e1fdc7cacb75a44dea4c5d91892c9a4f1e98031582127e5089ddb8dd02'
    FROM exact_target p
  ), false),
  'ownerMatches', coalesce((SELECT pg_catalog.pg_get_userbyid(p.proowner) = 'prisma' FROM exact_target p), false),
  'securityInvoker', coalesce((SELECT NOT p.prosecdef FROM exact_target p), false),
  'aclMatches', coalesce((SELECT value = '[["prisma", "prisma", "EXECUTE", false]]'::jsonb FROM target_acl), false),
  'attachedTriggers', coalesce((SELECT count(*) FROM pg_catalog.pg_trigger t JOIN exact_target p ON p.oid = t.tgfoid), 0),
  'dependents', coalesce((
    SELECT count(*)
    FROM pg_catalog.pg_depend d
    JOIN exact_target p ON d.refclassid = 'pg_catalog.pg_proc'::regclass
      AND d.refobjid = p.oid
      AND d.deptype <> 'e'
  ), 0)
) AS correction_target_state;
