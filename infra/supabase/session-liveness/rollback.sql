-- REVIEW-ONLY emergency containment for resequenced 0006. Never run automatically.
-- First close protected application access / stop the new API. A removed helper
-- makes the new verifier return 503; do not re-enable the old verifier as a bypass.
-- The applied Prisma ledger is preserved. Reintroduce through a NEW reviewed
-- forward migration; do not edit 0006 or use migrate resolve/reset/db push.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $rollback_preflight$
DECLARE helper pg_proc%ROWTYPE;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres'
     OR (current_database() <> 'postgres' AND NOT coalesce(
       current_database() ~ '^pathways_liveness_[a-z0-9_]+$'
       AND inet_server_addr() = '127.0.0.1'::inet, false)) THEN
    RAISE EXCEPTION '0006 rollback requires the reviewed administrator and database target';
  END IF;
  IF to_regclass('public._prisma_migrations') IS NULL
     OR (SELECT count(*) FROM public._prisma_migrations) <> 6
     OR EXISTS (
       SELECT FROM (VALUES
         ('0001_init', '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab'),
         ('0002_pathways_foundation', 'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2'),
         ('0003_pathways_projects_collection', '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b'),
         ('0004_pathways_finance_evaluation_decisions', '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b'),
         ('0005_supabase_security_adapter', '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc'),
         ('0006_auth_session_liveness', '8034f7910e09fae33c6f10d7bec434cf0bc65555e057aa2dd262d35a9b8ade00')
       ) AS expected(name, checksum)
       WHERE (SELECT count(*) FROM public._prisma_migrations m
         WHERE m.migration_name = expected.name AND m.checksum = expected.checksum
           AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL) <> 1
     ) OR EXISTS (
       SELECT FROM public._prisma_migrations
       WHERE migration_name NOT IN (
         '0001_init','0002_pathways_foundation','0003_pathways_projects_collection',
         '0004_pathways_finance_evaluation_decisions','0005_supabase_security_adapter',
         '0006_auth_session_liveness'
       ) OR finished_at IS NULL OR rolled_back_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION '0006 rollback requires the exact completed migration prefix';
  END IF;
  SELECT * INTO helper FROM pg_proc
    WHERE oid = to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)');
  IF NOT FOUND THEN
    RAISE EXCEPTION '0006 helper absent; inspect state instead of repeating rollback';
  END IF;
  IF helper.proowner <> 'postgres'::regrole OR NOT helper.prosecdef
     OR helper.prorettype <> 'boolean'::regtype OR helper.provolatile <> 's'
     OR helper.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog','row_security=on']
     OR md5(helper.prosrc) <> '9158fa6d1f37a5143c17b1f839110d9c'
     OR obj_description(helper.oid, 'pg_proc') IS DISTINCT FROM
       'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1'
     OR EXISTS (SELECT FROM aclexplode(helper.proacl) a
       WHERE a.grantee NOT IN (helper.proowner, 'pathways_runtime'::regrole)
         OR (a.grantee <> helper.proowner AND a.is_grantable)) THEN
    RAISE EXCEPTION '0006 helper differs from the reviewed rollback target';
  END IF;
END
$rollback_preflight$;

REVOKE EXECUTE ON FUNCTION pathways.runtime_auth_session_live(uuid, uuid) FROM pathways_runtime;
DROP FUNCTION pathways.runtime_auth_session_live(uuid, uuid) RESTRICT;
COMMIT;
