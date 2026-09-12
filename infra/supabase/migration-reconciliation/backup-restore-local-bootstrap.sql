-- Provider-shaped prerequisites for a disposable loopback restore only.
-- NEVER execute this file against a hosted database.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'pathways_phase4_backup_restore'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres'
     OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Only the exact disposable loopback restore is permitted';
  END IF;
END
$guard$;

DO $roles$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'prisma', 'anon', 'authenticated', 'service_role', 'authenticator',
    'dashboard_user', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_etl_admin', 'supabase_read_only_user', 'supabase_realtime_admin',
    'supabase_replication_admin', 'supabase_privileged_role', 'pathways_runtime'
  ] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        role_name
      );
    END IF;
  END LOOP;
END
$roles$;

REVOKE TEMPORARY ON DATABASE pathways_phase4_backup_restore FROM PUBLIC;

COMMIT;
