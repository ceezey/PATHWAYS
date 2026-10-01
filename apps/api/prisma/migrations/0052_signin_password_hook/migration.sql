-- cr-pathways-signin-lockout: Supabase password-verification hook that refuses direct
-- grant_type=password calls for a locked email. Read-only: failures are still counted by the API.
-- Runs as supabase_auth_admin (SECURITY INVOKER) so it can read auth.users, and reaches the
-- 0046 lockout definer through a pathways_auth helper, so pathways itself is never exposed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0051_indicator_library' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regnamespace('pathways_auth') IS NOT NULL
 THEN RAISE EXCEPTION '0052 requires the verified 0051 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,3);

-- Dedicated schema: supabase_auth_admin gets USAGE here only, never on pathways.
CREATE SCHEMA pathways_auth AUTHORIZATION prisma;
REVOKE ALL ON SCHEMA pathways_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA pathways_auth TO supabase_auth_admin;

-- Definer helper owned by prisma, the only owner able to run the 0046 lockout definer.
CREATE FUNCTION pathways_auth.lockout_remaining(email text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT pathways.signin_lockout_remaining(email)
$$;
ALTER FUNCTION pathways_auth.lockout_remaining(text) OWNER TO prisma;

-- Invoker hook: runs as supabase_auth_admin, which can read auth.users.
-- An error in the helper fails closed and blocks all password sign-ins.
CREATE FUNCTION pathways_auth.password_verification_attempt(event jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $$
BEGIN
 IF pathways_auth.lockout_remaining(
  (SELECT u.email::text FROM auth.users u WHERE u.id=(event->>'user_id')::uuid)) > 0 THEN
  RETURN pg_catalog.jsonb_build_object('decision','reject','message','Sign-in is temporarily locked.','should_logout_user',false);
 END IF;
 RETURN pg_catalog.jsonb_build_object('decision','continue');
END $$;
ALTER FUNCTION pathways_auth.password_verification_attempt(jsonb) OWNER TO prisma;

REVOKE ALL ON FUNCTION pathways_auth.lockout_remaining(text),pathways_auth.password_verification_attempt(jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways_auth.lockout_remaining(text),pathways_auth.password_verification_attempt(jsonb)
 TO supabase_auth_admin;
COMMIT;
