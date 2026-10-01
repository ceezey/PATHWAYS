-- cr-pathways-signin-lockout (migration 0052): behavioral checks for
-- pathways.p52_password_verification_attempt. Synthetic fixtures only; everything rolls back.
-- Run as a local superuser against a disposable pathways_phase2_* or pathways_phase4_* replay
-- database (or the local stack database) that already has 0052 applied.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF (current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' AND current_database() <> 'postgres')
 OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0052 password hook checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE sph_results(check_name text PRIMARY KEY) ON COMMIT DROP;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO sph_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.hook(uid uuid) RETURNS text LANGUAGE sql AS $$
 SELECT pathways.p52_password_verification_attempt(jsonb_build_object('user_id',uid,'valid',true))->>'decision'
$$;

INSERT INTO auth.users(id,email) VALUES
 ('7b000000-0000-4000-8000-000000000501','Hook-Probe@Example.Test'),
 ('7b000000-0000-4000-8000-000000000502','hook-clear@example.test');
INSERT INTO pathways.signin_lockouts(identifier_hash,failed_attempts,locked_until)
 VALUES(pathways.signin_lockout_hash('hook-probe@example.test'),5,now()+interval '15 minutes');
INSERT INTO pathways.signin_lockouts(identifier_hash,failed_attempts)
 VALUES(pathways.signin_lockout_hash('hook-clear@example.test'),3);

CREATE FUNCTION pg_temp.as_auth_admin(uid uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN
 SET LOCAL ROLE supabase_auth_admin;
 d:=pathways.p52_password_verification_attempt(jsonb_build_object('user_id',uid,'valid',true))->>'decision';
 RESET ROLE;
 RETURN d;
END $$;
SELECT pg_temp.ok(pg_temp.as_auth_admin('7b000000-0000-4000-8000-000000000501')='reject','hook works under supabase_auth_admin');
SELECT pg_temp.ok(pg_temp.hook('7b000000-0000-4000-8000-000000000501')='reject','locked user rejected even with valid password');
SELECT pg_temp.ok((pathways.p52_password_verification_attempt(jsonb_build_object('user_id','7b000000-0000-4000-8000-000000000501','valid',true))->>'should_logout_user')='false','reject does not log out');
SELECT pg_temp.ok(pg_temp.hook('7b000000-0000-4000-8000-000000000502')='continue','failures below the threshold continue');
UPDATE pathways.signin_lockouts SET locked_until=now()-interval '1 minute' WHERE identifier_hash=pathways.signin_lockout_hash('hook-probe@example.test');
SELECT pg_temp.ok(pg_temp.hook('7b000000-0000-4000-8000-000000000501')='continue','expired lock continues');
DELETE FROM pathways.signin_lockouts;
SELECT pg_temp.ok(pg_temp.hook('7b000000-0000-4000-8000-000000000501')='continue','unlocked valid password continues');
SELECT pg_temp.ok(pg_temp.hook('7b000000-0000-4000-8000-000000000999')='continue','unknown user id continues');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime','pathways.p52_password_verification_attempt(jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','pathways.p52_password_verification_attempt(jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','pathways.p52_password_verification_attempt(jsonb)','EXECUTE')
 AND has_function_privilege('supabase_auth_admin','pathways.p52_password_verification_attempt(jsonb)','EXECUTE'),'only supabase_auth_admin may execute the hook');

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM sph_results;
 IF total<>8 THEN RAISE EXCEPTION '0052 password hook checks expected 8 assertions, recorded %',total; END IF;
 RAISE NOTICE 'SIGNIN_PASSWORD_HOOK_RUNTIME=PASS (% assertions)',total;
END $$;
ROLLBACK;
