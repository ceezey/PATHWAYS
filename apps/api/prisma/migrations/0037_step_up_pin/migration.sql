-- Predecessor assertion is 0035, not 0036: 0036 (import pipeline) lands in the same release wave.
-- cr-pathways-beneficiary-step-up-pin: user-set, session-bound Beneficiary step-up PIN fallback.
-- Additive only: two RLS tables without API-role grants, owner-only helpers and SECURITY DEFINER
-- functions for pathways_runtime. No existing table, policy, grant or ledger row changes.
-- The PIN and its bcrypt hash never enter audit rows or error messages.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0035_admin_read_access' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regclass('pathways.user_step_up_pins') IS NOT NULL OR to_regclass('pathways.beneficiary_step_up_grants') IS NOT NULL
 OR to_regprocedure('pathways.runtime_context_organization()') IS NULL
 THEN RAISE EXCEPTION '0037 requires the verified 0035 state and migration identity'; END IF;
 -- Fail closed unless pgcrypto is installed in schema extensions (Supabase layout) and the
 -- migration owner can call it (DBA prerequisite: hosted-step-up-pin-preprovision.sql).
 IF to_regnamespace('extensions') IS NULL
 OR NOT EXISTS(SELECT FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto' AND n.nspname='extensions') THEN
   RAISE EXCEPTION '0037 requires pgcrypto installed in schema extensions'; END IF;
 IF NOT has_schema_privilege('extensions','USAGE') THEN
   RAISE EXCEPTION '0037 requires USAGE on schema extensions for prisma (run hosted-step-up-pin-preprovision.sql)'; END IF;
 IF to_regprocedure('extensions.crypt(text,text)') IS NULL OR to_regprocedure('extensions.gen_salt(text,integer)') IS NULL
 OR NOT has_function_privilege('extensions.crypt(text,text)','EXECUTE')
 OR NOT has_function_privilege('extensions.gen_salt(text,integer)','EXECUTE') THEN
   RAISE EXCEPTION '0037 requires executable extensions.crypt and extensions.gen_salt'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,1);

-- One PIN per system user. bcrypt cost 10 (cr section 3.3; local measurement ~50 ms).
CREATE TABLE pathways.user_step_up_pins (
 organization_id uuid NOT NULL,
 user_id uuid NOT NULL,
 pin_hash text NOT NULL,
 failed_attempts smallint NOT NULL DEFAULT 0,
 locked_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT user_step_up_pins_pkey PRIMARY KEY(organization_id,user_id),
 CONSTRAINT user_step_up_pins_user_fkey FOREIGN KEY(organization_id,user_id)
  REFERENCES pathways.system_users(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT user_step_up_pins_attempts CHECK(failed_attempts BETWEEN 0 AND 5),
 CONSTRAINT user_step_up_pins_lock CHECK((locked_at IS NOT NULL)=(failed_attempts=5)),
 CONSTRAINT user_step_up_pins_bcrypt CHECK(pin_hash ~ '^\$2a\$(1[0-9]|2[0-9]|3[01])\$[./0-9A-Za-z]{53}$')
);
-- One live grant row per user and verified Auth session; 15 minutes from PIN verification.
CREATE TABLE pathways.beneficiary_step_up_grants (
 organization_id uuid NOT NULL,
 user_id uuid NOT NULL,
 session_id uuid NOT NULL,
 method text NOT NULL,
 verified_at timestamptz(3) NOT NULL,
 expires_at timestamptz(3) NOT NULL,
 CONSTRAINT beneficiary_step_up_grants_pkey PRIMARY KEY(organization_id,user_id,session_id),
 CONSTRAINT beneficiary_step_up_grants_user_fkey FOREIGN KEY(organization_id,user_id)
  REFERENCES pathways.system_users(organization_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT beneficiary_step_up_grants_method CHECK(method='PIN'),
 CONSTRAINT beneficiary_step_up_grants_window CHECK(expires_at=verified_at+interval '15 minutes')
);
ALTER TABLE pathways.user_step_up_pins OWNER TO prisma;
ALTER TABLE pathways.beneficiary_step_up_grants OWNER TO prisma;
ALTER TABLE pathways.user_step_up_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.beneficiary_step_up_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.user_step_up_pins,pathways.beneficiary_step_up_grants
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- Owner-only helpers. 6-12 ASCII digits; all-identical and strictly ascending or descending runs rejected.
CREATE FUNCTION pathways.step_up_pin_acceptable(candidate text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $$
DECLARE i integer; step integer; ascending boolean:=true; descending boolean:=true; repeated boolean:=true;
BEGIN
 IF candidate IS NULL OR candidate !~ '^[0-9]{6,12}$' THEN RETURN false; END IF;
 FOR i IN 2..length(candidate) LOOP
  step:=ascii(substr(candidate,i,1))-ascii(substr(candidate,i-1,1));
  ascending:=ascending AND step=1; descending:=descending AND step=-1; repeated:=repeated AND step=0;
 END LOOP;
 RETURN NOT(ascending OR descending OR repeated);
END $$;

-- Actor and organization come only from the verified transaction context.
CREATE FUNCTION pathways.step_up_pin_actor(OUT org uuid,OUT actor uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $$
BEGIN
 org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 actor:=nullif(current_setting('app.user_id',true),'')::uuid;
 IF org IS NULL OR actor IS NULL OR pathways.runtime_context_organization() IS DISTINCT FROM org
 OR NOT EXISTS(SELECT FROM pathways.system_users u WHERE u.organization_id=org AND u.id=actor
  AND u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  AND u.account_status='ACTIVE' AND u.archived_at IS NULL)
 THEN RAISE EXCEPTION 'Step-up PIN unavailable' USING ERRCODE='42501'; END IF;
END $$;

-- The database cannot verify a TOTP claim. The API asserts it from verified signed claims;
-- this bounds the asserted time to the same 15-minute window with 30-second skew.
CREATE FUNCTION pathways.step_up_pin_totp_fresh(totp_verified_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$
 SELECT totp_verified_at IS NOT NULL
  AND totp_verified_at >= statement_timestamp()-interval '15 minutes'
  AND totp_verified_at <= statement_timestamp()+interval '30 seconds'
$$;

CREATE FUNCTION pathways.step_up_pin_audit(org uuid,actor uuid,wanted_action text,details jsonb) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO '' AS $$
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 VALUES(org,actor,wanted_action,'BeneficiaryStepUp',actor::text,details)
$$;

-- Status: PIN state and this session's live grant. No attempt counts are returned.
CREATE FUNCTION pathways.step_up_pin_status(wanted_session uuid)
RETURNS TABLE(pin_state text,grant_expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE who record;
BEGIN
 SELECT * INTO who FROM pathways.step_up_pin_actor();
 IF wanted_session IS NULL THEN RAISE EXCEPTION 'Step-up PIN unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT
  coalesce((SELECT CASE WHEN p.locked_at IS NULL THEN 'SET' ELSE 'LOCKED' END FROM pathways.user_step_up_pins p
   WHERE p.organization_id=who.org AND p.user_id=who.actor),'NONE'),
  (SELECT g.expires_at FROM pathways.beneficiary_step_up_grants g
   WHERE g.organization_id=who.org AND g.user_id=who.actor AND g.session_id=wanted_session
   AND g.expires_at>statement_timestamp());
END $$;

-- First PIN only, inside an API-asserted fresh TOTP step-up.
CREATE FUNCTION pathways.step_up_pin_set(new_pin text,totp_verified_at timestamptz) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE who record; affected integer;
BEGIN
 SELECT * INTO who FROM pathways.step_up_pin_actor();
 IF NOT pathways.step_up_pin_totp_fresh(totp_verified_at) THEN RETURN 'TOTP_REQUIRED'; END IF;
 IF NOT pathways.step_up_pin_acceptable(new_pin) THEN
  RAISE EXCEPTION 'Step-up PIN rejected' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM pathways.user_step_up_pins p WHERE p.organization_id=who.org AND p.user_id=who.actor) THEN
  RETURN 'EXISTS'; END IF;
 INSERT INTO pathways.user_step_up_pins(organization_id,user_id,pin_hash)
 VALUES(who.org,who.actor,extensions.crypt(new_pin,extensions.gen_salt('bf',10)))
 ON CONFLICT(organization_id,user_id) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RETURN 'EXISTS'; END IF;
 PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_SET',jsonb_build_object('method','TOTP'));
 RETURN 'SET';
END $$;

-- Row-locked compare. Parallel attempts serialize on the row, so failures cannot exceed 5,
-- and a locked PIN is never compared.
CREATE FUNCTION pathways.step_up_pin_verify(candidate text,wanted_session uuid)
RETURNS TABLE(outcome text,expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE who record; stored pathways.user_step_up_pins%ROWTYPE; attempts integer;
 verified timestamptz:=date_trunc('milliseconds',statement_timestamp());
BEGIN
 SELECT * INTO who FROM pathways.step_up_pin_actor();
 IF wanted_session IS NULL THEN RAISE EXCEPTION 'Step-up PIN unavailable' USING ERRCODE='42501'; END IF;
 SELECT p.* INTO stored FROM pathways.user_step_up_pins p
 WHERE p.organization_id=who.org AND p.user_id=who.actor FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_SET'::text,NULL::timestamptz; RETURN; END IF;
 IF stored.locked_at IS NOT NULL THEN
  PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_FAILED',
   jsonb_build_object('method','PIN','outcome','LOCKED'));
  RETURN QUERY SELECT 'LOCKED'::text,NULL::timestamptz; RETURN;
 END IF;
 IF candidate IS NOT NULL AND candidate ~ '^[0-9]{6,12}$'
 AND extensions.crypt(candidate,stored.pin_hash)=stored.pin_hash THEN
  IF stored.failed_attempts<>0 THEN
   UPDATE pathways.user_step_up_pins p SET failed_attempts=0,updated_at=verified
   WHERE p.organization_id=who.org AND p.user_id=who.actor;
  END IF;
  DELETE FROM pathways.beneficiary_step_up_grants g
  WHERE g.organization_id=who.org AND g.user_id=who.actor AND g.session_id<>wanted_session AND g.expires_at<=verified;
  INSERT INTO pathways.beneficiary_step_up_grants(organization_id,user_id,session_id,method,verified_at,expires_at)
  VALUES(who.org,who.actor,wanted_session,'PIN',verified,verified+interval '15 minutes')
  ON CONFLICT(organization_id,user_id,session_id)
  DO UPDATE SET method='PIN',verified_at=EXCLUDED.verified_at,expires_at=EXCLUDED.expires_at;
  RETURN QUERY SELECT 'ACCEPTED'::text,verified+interval '15 minutes'; RETURN;
 END IF;
 attempts:=stored.failed_attempts+1;
 UPDATE pathways.user_step_up_pins p SET failed_attempts=attempts,
  locked_at=CASE WHEN attempts>=5 THEN verified ELSE NULL END,updated_at=verified
 WHERE p.organization_id=who.org AND p.user_id=who.actor;
 PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_FAILED',
  jsonb_build_object('method','PIN','outcome','INCORRECT'));
 IF attempts>=5 THEN
  DELETE FROM pathways.beneficiary_step_up_grants g WHERE g.organization_id=who.org AND g.user_id=who.actor;
  PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_LOCKED',jsonb_build_object('method','PIN'));
  RETURN QUERY SELECT 'LOCKED'::text,NULL::timestamptz; RETURN;
 END IF;
 RETURN QUERY SELECT 'INCORRECT'::text,NULL::timestamptz;
END $$;

-- Change with the current PIN (counted like a verification) or an API-asserted fresh TOTP.
-- A locked PIN changes only with a TOTP verification newer than the lock. Existing grants end.
CREATE FUNCTION pathways.step_up_pin_change(new_pin text,current_pin text,totp_verified_at timestamptz) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE who record; stored pathways.user_step_up_pins%ROWTYPE; attempts integer; proof text;
 changed timestamptz:=date_trunc('milliseconds',statement_timestamp());
BEGIN
 SELECT * INTO who FROM pathways.step_up_pin_actor();
 IF NOT pathways.step_up_pin_acceptable(new_pin) THEN
  RAISE EXCEPTION 'Step-up PIN rejected' USING ERRCODE='22023'; END IF;
 SELECT p.* INTO stored FROM pathways.user_step_up_pins p
 WHERE p.organization_id=who.org AND p.user_id=who.actor FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_SET'; END IF;
 IF current_pin IS NOT NULL THEN
  proof:='PIN';
  IF stored.locked_at IS NOT NULL THEN
   PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_FAILED',
    jsonb_build_object('method','PIN','outcome','LOCKED'));
   RETURN 'LOCKED';
  END IF;
  IF current_pin !~ '^[0-9]{6,12}$' OR extensions.crypt(current_pin,stored.pin_hash)<>stored.pin_hash THEN
   attempts:=stored.failed_attempts+1;
   UPDATE pathways.user_step_up_pins p SET failed_attempts=attempts,
    locked_at=CASE WHEN attempts>=5 THEN changed ELSE NULL END,updated_at=changed
   WHERE p.organization_id=who.org AND p.user_id=who.actor;
   PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_FAILED',
    jsonb_build_object('method','PIN','outcome','INCORRECT'));
   IF attempts>=5 THEN
    DELETE FROM pathways.beneficiary_step_up_grants g WHERE g.organization_id=who.org AND g.user_id=who.actor;
    PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_LOCKED',jsonb_build_object('method','PIN'));
    RETURN 'LOCKED';
   END IF;
   RETURN 'INCORRECT';
  END IF;
 ELSE
  proof:='TOTP';
  IF NOT pathways.step_up_pin_totp_fresh(totp_verified_at)
  OR (stored.locked_at IS NOT NULL AND totp_verified_at<=stored.locked_at) THEN RETURN 'TOTP_REQUIRED'; END IF;
 END IF;
 UPDATE pathways.user_step_up_pins p SET pin_hash=extensions.crypt(new_pin,extensions.gen_salt('bf',10)),
  failed_attempts=0,locked_at=NULL,updated_at=changed
 WHERE p.organization_id=who.org AND p.user_id=who.actor;
 DELETE FROM pathways.beneficiary_step_up_grants g WHERE g.organization_id=who.org AND g.user_id=who.actor;
 PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_CHANGED',jsonb_build_object('method',proof));
 IF stored.locked_at IS NOT NULL THEN
  PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_UNLOCKED',jsonb_build_object('method','TOTP'));
 END IF;
 RETURN 'CHANGED';
END $$;

-- Only a TOTP verification newer than the lock unlocks; the counter clears with it.
CREATE FUNCTION pathways.step_up_pin_unlock(totp_verified_at timestamptz) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE who record; stored pathways.user_step_up_pins%ROWTYPE;
BEGIN
 SELECT * INTO who FROM pathways.step_up_pin_actor();
 SELECT p.* INTO stored FROM pathways.user_step_up_pins p
 WHERE p.organization_id=who.org AND p.user_id=who.actor FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_SET'; END IF;
 IF stored.locked_at IS NULL THEN RETURN 'SET'; END IF;
 IF NOT pathways.step_up_pin_totp_fresh(totp_verified_at) OR totp_verified_at<=stored.locked_at THEN
  RETURN 'TOTP_REQUIRED'; END IF;
 UPDATE pathways.user_step_up_pins p SET failed_attempts=0,locked_at=NULL,
  updated_at=date_trunc('milliseconds',statement_timestamp())
 WHERE p.organization_id=who.org AND p.user_id=who.actor;
 PERFORM pathways.step_up_pin_audit(who.org,who.actor,'BENEFICIARY_STEP_UP_PIN_UNLOCKED',jsonb_build_object('method','TOTP'));
 RETURN 'UNLOCKED';
END $$;

ALTER FUNCTION pathways.step_up_pin_acceptable(text) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_actor() OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_totp_fresh(timestamptz) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_audit(uuid,uuid,text,jsonb) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_status(uuid) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_set(text,timestamptz) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_verify(text,uuid) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_change(text,text,timestamptz) OWNER TO prisma;
ALTER FUNCTION pathways.step_up_pin_unlock(timestamptz) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.step_up_pin_acceptable(text),pathways.step_up_pin_actor(),
 pathways.step_up_pin_totp_fresh(timestamptz),pathways.step_up_pin_audit(uuid,uuid,text,jsonb),
 pathways.step_up_pin_status(uuid),pathways.step_up_pin_set(text,timestamptz),
 pathways.step_up_pin_verify(text,uuid),pathways.step_up_pin_change(text,text,timestamptz),
 pathways.step_up_pin_unlock(timestamptz)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.step_up_pin_status(uuid),pathways.step_up_pin_set(text,timestamptz),
 pathways.step_up_pin_verify(text,uuid),pathways.step_up_pin_change(text,text,timestamptz),
 pathways.step_up_pin_unlock(timestamptz) TO pathways_runtime;

-- Postconditions: RLS on, no policies, no API-role table grants, exact function security.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('user_step_up_pins','beneficiary_step_up_grants')
  AND (NOT c.relrowsecurity OR pg_catalog.pg_get_userbyid(c.relowner)<>'prisma'))
 OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='pathways' AND c.relname IN('user_step_up_pins','beneficiary_step_up_grants'))<>2
 OR EXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid IN
  ('pathways.user_step_up_pins'::regclass,'pathways.beneficiary_step_up_grants'::regclass))
 OR EXISTS(SELECT FROM (VALUES('pathways_runtime'),('anon'),('authenticated'),('service_role')) r(name)
  CROSS JOIN (VALUES('pathways.user_step_up_pins'),('pathways.beneficiary_step_up_grants')) t(name)
  WHERE has_table_privilege(r.name,t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 OR EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways' AND p.proname LIKE 'step\_up\_pin\_%'
  AND (pg_catalog.pg_get_userbyid(p.proowner)<>'prisma' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']
   OR p.prosecdef<>(p.proname IN('step_up_pin_status','step_up_pin_set','step_up_pin_verify','step_up_pin_change','step_up_pin_unlock'))
   OR has_function_privilege('pathways_runtime',p.oid,'EXECUTE')<>p.prosecdef
   OR EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime')))))
 OR (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='pathways' AND p.proname LIKE 'step\_up\_pin\_%')<>9
 THEN RAISE EXCEPTION '0037 step-up PIN security postconditions failed'; END IF;
END $$;
COMMIT;
