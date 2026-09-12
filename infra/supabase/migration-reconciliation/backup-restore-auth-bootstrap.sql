-- Minimal synthetic Auth surface needed only after application data has been
-- restored and before post-data foreign keys/policies are installed.
-- It copies only distinct referenced UUIDs already present in the restored
-- pathways.system_users table; it never copies hosted Auth rows or attributes.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'pathways_phase4_backup_restore'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR to_regclass('pathways.system_users') IS NULL
     OR to_regnamespace('auth') IS NOT NULL THEN
    RAISE EXCEPTION 'Synthetic Auth bootstrap target refused';
  END IF;
END
$guard$;

CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
ALTER TABLE auth.users OWNER TO supabase_auth_admin;

INSERT INTO auth.users (id)
SELECT DISTINCT auth_user_id
FROM pathways.system_users
WHERE auth_user_id IS NOT NULL;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$function$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

GRANT USAGE ON SCHEMA auth TO postgres;
GRANT REFERENCES (id) ON auth.users TO postgres;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;
