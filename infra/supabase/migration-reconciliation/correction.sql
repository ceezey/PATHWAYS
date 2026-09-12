-- Retire only the reviewed, unreferenced zero-argument public audit function.
-- The operator wrapper supplies the approved PATHWAYS-dev connection and
-- ON_ERROR_STOP. This transaction refuses every recorded form of drift.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '20s';
SET LOCAL search_path = pg_catalog;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('PATHWAYS:retire:public.pathways_prevent_audit_mutation()', 0)
);

DO $guard$
DECLARE
  target_oid oid;
  target_count integer;
  actual_acl jsonb;
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR current_setting('transaction_read_only') <> 'off'
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 189999 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRECTION_TARGET_REFUSED';
  END IF;

  IF to_regclass('public._prisma_migrations') IS NULL
     OR to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
     OR (SELECT count(*) FROM public._prisma_migrations) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public._prisma_migrations
       WHERE migration_name = '0001_init'
         AND checksum = '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL
         AND coalesce(length(logs), 0) = 0
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRECTION_LEDGER_REFUSED';
  END IF;

  SELECT count(*), min(p.oid)
  INTO target_count, target_oid
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pathways_prevent_audit_mutation';

  IF target_count <> 1
     OR target_oid IS NULL
     OR pg_catalog.pg_get_function_identity_arguments(target_oid) <> '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRECTION_SIGNATURE_REFUSED';
  END IF;

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
  )
  INTO actual_acl
  FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
  WHERE p.oid = target_oid;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_language l ON l.oid = p.prolang
       WHERE p.oid = target_oid
         AND p.pronargs = 0
         AND p.prokind = 'f'
         AND p.prorettype = 'pg_catalog.trigger'::regtype
         AND l.lanname = 'plpgsql'
         AND pg_catalog.pg_get_userbyid(p.proowner) = 'prisma'
         AND NOT p.prosecdef
         AND p.provolatile = 'v'
         AND p.proparallel = 'u'
         AND NOT p.proisstrict
         AND NOT p.proleakproof
         AND p.proconfig IS NULL
         AND p.procost = 100
         AND p.prorows = 0
         AND encode(
           extensions.digest(
             convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8'),
             'sha256'
           ),
           'hex'
         ) = 'efbe62e1fdc7cacb75a44dea4c5d91892c9a4f1e98031582127e5089ddb8dd02'
     )
     OR actual_acl <> '[["prisma", "prisma", "EXECUTE", false]]'::jsonb
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgfoid = target_oid)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_depend d
       WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
         AND d.refobjid = target_oid
         AND d.deptype <> 'e'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_depend d
       WHERE d.classid = 'pg_catalog.pg_proc'::regclass
         AND d.objid = target_oid
         AND d.deptype = 'e'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRECTION_DEFINITION_REFUSED';
  END IF;
END
$guard$;

DROP FUNCTION public.pathways_prevent_audit_mutation() RESTRICT;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'pathways_prevent_audit_mutation'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRECTION_POSTFLIGHT_REFUSED';
  END IF;
END
$postflight$;

COMMIT;
SELECT 'PATHWAYS_AUDIT_FUNCTION_CORRECTION_COMMITTED';
