-- Retry-only prerequisite for a disposable loopback restore.
-- NEVER execute this file against a hosted database.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'pathways_phase4_backup_restore'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR to_regrole('prisma') IS NULL
     OR to_regrole('supabase_auth_admin') IS NULL
     OR to_regrole('supabase_admin') IS NOT NULL THEN
    RAISE EXCEPTION 'Retry-only synthetic role target refused';
  END IF;
END
$guard$;

CREATE ROLE supabase_admin
  NOLOGIN
  NOSUPERUSER
  NOINHERIT
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'supabase_admin'
      AND rolcanlogin = false
      AND rolsuper = false
      AND rolinherit = false
      AND rolcreatedb = false
      AND rolcreaterole = false
      AND rolreplication = false
      AND rolbypassrls = false
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = 'supabase_admin'
       OR granted_role.rolname = 'supabase_admin'
  ) THEN
    RAISE EXCEPTION 'Retry-only synthetic role verification failed';
  END IF;
END
$verify$;

COMMIT;
