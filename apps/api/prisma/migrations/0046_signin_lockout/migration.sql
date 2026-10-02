-- cr-pathways-signin-lockout: API-side sign-in failure counter (G-F1-10).
-- Additive only: one RLS table without API-role grants and owner-only SECURITY DEFINER
-- functions for pathways_runtime. Only a SHA-256 of the lowercased email is stored.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0045_f9_descriptive_aggregates' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR to_regclass('pathways.signin_lockouts') IS NOT NULL
 THEN RAISE EXCEPTION '0046 requires the verified 0045 state and migration identity'; END IF;
END $$;
SELECT pg_advisory_xact_lock(505005,2);

CREATE TABLE pathways.signin_lockouts (
 identifier_hash text PRIMARY KEY,
 failed_attempts smallint NOT NULL DEFAULT 0,
 locked_until timestamptz(3),
 last_failed_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT signin_lockouts_hash CHECK(identifier_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT signin_lockouts_attempts CHECK(failed_attempts BETWEEN 0 AND 5)
);
ALTER TABLE pathways.signin_lockouts OWNER TO prisma;
ALTER TABLE pathways.signin_lockouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.signin_lockouts FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

CREATE FUNCTION pathways.signin_lockout_hash(identifier text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO '' AS $$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(identifier)),'UTF8')),'hex')
$$;

-- Seconds of lockout remaining, or 0 when sign-in may proceed.
CREATE FUNCTION pathways.signin_lockout_remaining(identifier text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT coalesce((SELECT greatest(0,ceil(extract(epoch FROM l.locked_until-statement_timestamp()))::integer)
  FROM pathways.signin_lockouts l WHERE l.identifier_hash=pathways.signin_lockout_hash(identifier)),0)
$$;

-- Counts one failure: 5 failures within 15 minutes lock for 15 minutes. Returns seconds locked, else 0.
CREATE FUNCTION pathways.signin_lockout_failure(identifier text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE h text:=pathways.signin_lockout_hash(identifier); now_ts timestamptz:=statement_timestamp();
 prior pathways.signin_lockouts%ROWTYPE; attempts integer;
BEGIN
 DELETE FROM pathways.signin_lockouts WHERE last_failed_at<now_ts-interval '1 day' AND (locked_until IS NULL OR locked_until<now_ts);
 SELECT l.* INTO prior FROM pathways.signin_lockouts l WHERE l.identifier_hash=h FOR UPDATE;
 IF FOUND AND prior.locked_until>now_ts THEN RETURN ceil(extract(epoch FROM prior.locked_until-now_ts))::integer; END IF;
 attempts:=CASE WHEN FOUND AND prior.last_failed_at>=now_ts-interval '15 minutes' THEN prior.failed_attempts+1 ELSE 1 END;
 INSERT INTO pathways.signin_lockouts(identifier_hash,failed_attempts,locked_until,last_failed_at)
 VALUES(h,least(attempts,5),CASE WHEN attempts>=5 THEN now_ts+interval '15 minutes' END,now_ts)
 ON CONFLICT(identifier_hash) DO UPDATE SET failed_attempts=EXCLUDED.failed_attempts,
  locked_until=EXCLUDED.locked_until,last_failed_at=EXCLUDED.last_failed_at;
 IF attempts<5 THEN RETURN 0; END IF;
 -- Audit only real accounts; an unknown identifier has no organization to attribute.
 INSERT INTO pathways.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,changes)
 SELECT u.organization_id,u.id,'SIGN_IN_LOCKED','Authentication',u.id::text,
  jsonb_build_object('failedAttempts',5,'lockMinutes',15)
 FROM pathways.system_users u WHERE pg_catalog.lower(u.email)=pg_catalog.lower(pg_catalog.btrim(identifier));
 RETURN 900;
END $$;

CREATE FUNCTION pathways.signin_lockout_reset(identifier text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
 DELETE FROM pathways.signin_lockouts WHERE identifier_hash=pathways.signin_lockout_hash(identifier)
$$;

ALTER FUNCTION pathways.signin_lockout_hash(text) OWNER TO prisma;
ALTER FUNCTION pathways.signin_lockout_remaining(text) OWNER TO prisma;
ALTER FUNCTION pathways.signin_lockout_failure(text) OWNER TO prisma;
ALTER FUNCTION pathways.signin_lockout_reset(text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.signin_lockout_hash(text),pathways.signin_lockout_remaining(text),
 pathways.signin_lockout_failure(text),pathways.signin_lockout_reset(text)
 FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;
GRANT EXECUTE ON FUNCTION pathways.signin_lockout_remaining(text),pathways.signin_lockout_failure(text),
 pathways.signin_lockout_reset(text) TO pathways_runtime;
COMMIT;
