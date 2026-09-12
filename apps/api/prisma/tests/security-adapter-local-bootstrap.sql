-- Synthetic provider prerequisites. NEVER execute on a hosted database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'pathways_phase4_%'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Only disposable local Phase 4 databases are permitted';
  END IF;
END $$;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'prisma','anon','authenticated','service_role','authenticator',
    'dashboard_user','supabase_auth_admin','supabase_storage_admin',
    'supabase_etl_admin','supabase_read_only_user','supabase_realtime_admin',
    'supabase_replication_admin','supabase_privileged_role'
  ] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',role_name);
    END IF;
  END LOOP;
END $$;
ALTER ROLE prisma LOGIN BYPASSRLS CREATEDB;
GRANT prisma TO postgres;
GRANT supabase_privileged_role TO postgres, supabase_etl_admin;
GRANT anon, authenticated, service_role TO authenticator;
GRANT authenticator TO supabase_storage_admin;
GRANT CREATE ON DATABASE :DBNAME TO prisma, supabase_etl_admin, supabase_storage_admin;
GRANT CREATE, TEMPORARY, CONNECT ON DATABASE :DBNAME TO dashboard_user;
GRANT USAGE, CREATE ON SCHEMA public TO prisma;

CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  not_after timestamptz
);
ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
  )::uuid
$$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT REFERENCES(id) ON auth.users TO postgres;
GRANT SELECT ON auth.sessions TO postgres;

-- Empty provider-shaped fixture for actual-login negative access tests. This
-- is not a real Storage object and is never created on a hosted database.
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
CREATE TABLE storage.objects (id uuid PRIMARY KEY);
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
COMMIT;
