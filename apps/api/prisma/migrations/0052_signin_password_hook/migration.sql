-- cr-pathways-signin-lockout: Supabase password-verification hook that refuses direct
-- grant_type=password calls for a locked email. Read-only: failures are still counted by the API.
-- Runs as supabase_auth_admin (SECURITY INVOKER) so it can read auth.users, and reuses the
-- 0046 owner-only signin_lockout_remaining definer to read the lockout table.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0051_indicator_library' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regprocedure('pathways.p52_password_verification_attempt(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION '0052 requires the verified 0051 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,3);

-- plpgsql, so prisma (which cannot see auth) can create it; the body runs as supabase_auth_admin.
CREATE FUNCTION pathways.p52_password_verification_attempt(event jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $$
BEGIN
 IF pathways.signin_lockout_remaining(
  (SELECT u.email::text FROM auth.users u WHERE u.id=(event->>'user_id')::uuid)) > 0 THEN
  RETURN pg_catalog.jsonb_build_object('decision','reject','message','Sign-in is temporarily locked.','should_logout_user',false);
 END IF;
 RETURN pg_catalog.jsonb_build_object('decision','continue');
END $$;
ALTER FUNCTION pathways.p52_password_verification_attempt(jsonb) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.p52_password_verification_attempt(jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT USAGE ON SCHEMA pathways TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION pathways.p52_password_verification_attempt(jsonb),
 pathways.signin_lockout_remaining(text) TO supabase_auth_admin;
COMMIT;
