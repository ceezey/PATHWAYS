-- cr-pathways-import-throughput-and-pdf: approve text-layer PDF as an import file type.
-- Additive only. Adds one enum value; no table, column, policy, grant or staged-row shape
-- changes. PostgreSQL permits ADD VALUE inside a transaction block, but the new value must
-- not be used before commit, so this migration only checks the catalog for it (0034 precedent).
-- The batch storage guard derives the object extension from lower(file_type), so PDF objects
-- use a .pdf key without a guard change. PostgreSQL has no DROP VALUE; rollback leaves it unused.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0035_admin_read_access' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='import_file_type' AND t.typtype='e')
 OR (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='import_file_type' AND e.enumlabel IN ('CSV','XLSX','XLS','JSON','OTHER')) <> 5
 THEN RAISE EXCEPTION '0036 requires the verified 0035 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

ALTER TYPE pathways.import_file_type ADD VALUE IF NOT EXISTS 'PDF';

DO $$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='import_file_type') <> 6
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='pathways' AND t.typname='import_file_type' AND e.enumlabel='PDF')
 THEN RAISE EXCEPTION '0036 import file type verification failed'; END IF;
END $$;
COMMIT;
