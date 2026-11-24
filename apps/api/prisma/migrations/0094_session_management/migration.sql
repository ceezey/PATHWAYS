-- 0094 session management (cr-pathways-session-management); forward migration.
-- app_sessions keeps one row per Supabase session the API has seen: a session is open while it is not ended, started under
-- 12 hours ago and was active in the last 30 minutes. A new session ends the oldest open sessions beyond 3 for the same
-- sign-in identity. The API checks app_session_current next to the unchanged postgres-owned runtime_auth_session_live.
-- Only pathways_runtime may call the functions, and none of them reads the auth schema.
-- prisma owns every table and function used here, so no preprovision is needed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0093_alert_outcome_notes'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0094 requires the verified 0093 state and migration identity'; END IF;
 IF pg_catalog.to_regclass('pathways.app_sessions') IS NOT NULL
 THEN RAISE EXCEPTION '0094 requires the table to not already exist'; END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class
   WHERE oid='pathways.system_users'::pg_catalog.regclass)<>'prisma'
 THEN RAISE EXCEPTION '0094 requires prisma ownership of system_users'; END IF;
END $$;
SELECT pg_catalog.pg_advisory_xact_lock(505005,94);

CREATE TABLE pathways.app_sessions (
 session_id uuid PRIMARY KEY,
 auth_user_id uuid NOT NULL,
 device text,
 started_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_active_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ended_at timestamptz(3),
 end_reason text,
 CONSTRAINT app_sessions_device CHECK (device IS NULL OR pg_catalog.char_length(device) BETWEEN 1 AND 200),
 CONSTRAINT app_sessions_end CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
 CONSTRAINT app_sessions_reason CHECK (end_reason IN
  ('SIGNED_OUT','USER','ADMIN','PASSWORD_CHANGED','ACCOUNT_CHANGED','LIMIT','IDLE','EXPIRED'))
);
CREATE INDEX app_sessions_user_started ON pathways.app_sessions(auth_user_id, started_at DESC);
ALTER TABLE pathways.app_sessions OWNER TO prisma;
ALTER TABLE pathways.app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pathways.app_sessions FROM PUBLIC,anon,authenticated,service_role,pathways_runtime;

-- The one place the 12-hour and 30-minute limits live.
CREATE FUNCTION pathways.app_session_open(started_at timestamptz, last_active_at timestamptz, ended_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$
 SELECT ended_at IS NULL AND started_at > pg_catalog.statement_timestamp() - interval '12 hours'
  AND last_active_at > pg_catalog.statement_timestamp() - interval '30 minutes'
$$;

-- True when the verified subject's session is open. Read-only, so it runs inside read-only verification transactions.
CREATE FUNCTION pathways.app_session_current(p_subject uuid, p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT SESSION_USER = 'pathways_runtime' AND EXISTS(SELECT FROM pathways.app_sessions s
  WHERE s.session_id = p_session AND s.auth_user_id = p_subject
   AND pathways.app_session_open(s.started_at, s.last_active_at, s.ended_at))
$$;

-- Records activity. A new session is inserted and ends the oldest open sessions beyond 3; a session past a limit is
-- marked IDLE or EXPIRED and never revived. Returns the number of sessions the limit ended.
CREATE FUNCTION pathways.app_session_touch(p_subject uuid, p_session uuid, p_device text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE prior pathways.app_sessions%ROWTYPE; now_ts timestamptz := pg_catalog.statement_timestamp(); ended integer;
BEGIN
 IF SESSION_USER <> 'pathways_runtime' OR p_subject IS NULL OR p_session IS NULL THEN
  RAISE EXCEPTION 'app_session_touch is runtime-only' USING ERRCODE = '42501';
 END IF;
 SELECT s.* INTO prior FROM pathways.app_sessions s WHERE s.session_id = p_session FOR UPDATE;
 IF FOUND THEN
  IF prior.auth_user_id <> p_subject OR prior.ended_at IS NOT NULL THEN RETURN 0; END IF;
  IF pathways.app_session_open(prior.started_at, prior.last_active_at, NULL) THEN
   UPDATE pathways.app_sessions s SET last_active_at = now_ts WHERE s.session_id = p_session;
  ELSE
   UPDATE pathways.app_sessions s SET ended_at = now_ts,
    end_reason = CASE WHEN prior.started_at <= now_ts - interval '12 hours' THEN 'EXPIRED' ELSE 'IDLE' END
   WHERE s.session_id = p_session;
  END IF;
  RETURN 0;
 END IF;
 -- Serializes new sessions of one identity so two sign-ins cannot both keep 3 others.
 PERFORM pg_catalog.pg_advisory_xact_lock(505094, pg_catalog.hashtext(p_subject::text));
 INSERT INTO pathways.app_sessions(session_id, auth_user_id, device, started_at, last_active_at)
 VALUES (p_session, p_subject, pg_catalog.left(pg_catalog.nullif(pg_catalog.btrim(p_device), ''), 200), now_ts, now_ts)
 ON CONFLICT (session_id) DO NOTHING;
 IF NOT FOUND THEN RETURN 0; END IF;
 UPDATE pathways.app_sessions s SET ended_at = now_ts, end_reason = 'LIMIT'
 WHERE s.session_id IN (SELECT o.session_id FROM pathways.app_sessions o
  WHERE o.auth_user_id = p_subject AND pathways.app_session_open(o.started_at, o.last_active_at, o.ended_at)
  ORDER BY o.started_at DESC, o.session_id DESC OFFSET 3);
 GET DIAGNOSTICS ended = ROW_COUNT;
 RETURN ended;
END $$;

-- The verified subject's open sessions, newest first.
CREATE FUNCTION pathways.app_session_list(p_subject uuid, p_session uuid)
RETURNS TABLE(session_id uuid, device text, started_at timestamptz, last_active_at timestamptz, is_current boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT s.session_id, s.device, s.started_at, s.last_active_at, s.session_id = p_session
 FROM pathways.app_sessions s
 WHERE SESSION_USER = 'pathways_runtime' AND s.auth_user_id = p_subject
  AND pathways.app_session_open(s.started_at, s.last_active_at, s.ended_at)
 ORDER BY s.started_at DESC, s.session_id DESC
 LIMIT 10
$$;

-- Ends one of the subject's own open sessions (p_target), or all except p_keep. Returns the number ended.
CREATE FUNCTION pathways.app_session_end(p_subject uuid, p_target uuid, p_keep uuid, p_reason text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE ended integer;
BEGIN
 IF SESSION_USER <> 'pathways_runtime' OR p_subject IS NULL OR (p_target IS NULL) = (p_keep IS NULL)
  OR p_reason IS NULL OR p_reason NOT IN ('SIGNED_OUT','USER','PASSWORD_CHANGED') THEN
  RAISE EXCEPTION 'app_session_end refused' USING ERRCODE = '42501';
 END IF;
 UPDATE pathways.app_sessions s SET ended_at = pg_catalog.statement_timestamp(), end_reason = p_reason
 WHERE s.auth_user_id = p_subject AND pathways.app_session_open(s.started_at, s.last_active_at, s.ended_at)
  AND (s.session_id = p_target OR (p_target IS NULL AND s.session_id <> p_keep));
 GET DIAGNOSTICS ended = ROW_COUNT;
 RETURN ended;
END $$;

-- Ends every open session of a system user in the verified organization. Returns the number ended.
CREATE FUNCTION pathways.app_session_end_user(p_user uuid, p_reason text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE subject uuid; ended integer;
BEGIN
 IF SESSION_USER <> 'pathways_runtime' OR p_user IS NULL
  OR p_reason IS NULL OR p_reason NOT IN ('ADMIN','ACCOUNT_CHANGED') THEN
  RAISE EXCEPTION 'app_session_end_user refused' USING ERRCODE = '42501';
 END IF;
 SELECT u.auth_user_id INTO subject FROM pathways.system_users u
 WHERE u.id = p_user AND u.organization_id = pathways.runtime_context_organization();
 IF subject IS NULL THEN RETURN 0; END IF;
 UPDATE pathways.app_sessions s SET ended_at = pg_catalog.statement_timestamp(), end_reason = p_reason
 WHERE s.auth_user_id = subject AND pathways.app_session_open(s.started_at, s.last_active_at, s.ended_at);
 GET DIAGNOSTICS ended = ROW_COUNT;
 RETURN ended;
END $$;

ALTER FUNCTION pathways.app_session_open(timestamptz,timestamptz,timestamptz) OWNER TO prisma;
ALTER FUNCTION pathways.app_session_current(uuid,uuid) OWNER TO prisma;
ALTER FUNCTION pathways.app_session_touch(uuid,uuid,text) OWNER TO prisma;
ALTER FUNCTION pathways.app_session_list(uuid,uuid) OWNER TO prisma;
ALTER FUNCTION pathways.app_session_end(uuid,uuid,uuid,text) OWNER TO prisma;
ALTER FUNCTION pathways.app_session_end_user(uuid,text) OWNER TO prisma;
REVOKE ALL ON FUNCTION pathways.app_session_open(timestamptz,timestamptz,timestamptz),
 pathways.app_session_current(uuid,uuid), pathways.app_session_touch(uuid,uuid,text), pathways.app_session_list(uuid,uuid),
 pathways.app_session_end(uuid,uuid,uuid,text), pathways.app_session_end_user(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pathways.app_session_current(uuid,uuid), pathways.app_session_touch(uuid,uuid,text),
 pathways.app_session_list(uuid,uuid), pathways.app_session_end(uuid,uuid,uuid,text), pathways.app_session_end_user(uuid,text)
 TO pathways_runtime;

DO $$ BEGIN
 IF has_table_privilege('pathways_runtime','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('service_role','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
  OR has_function_privilege('pathways_runtime','pathways.app_session_open(timestamptz,timestamptz,timestamptz)','EXECUTE')
  OR NOT has_function_privilege('pathways_runtime','pathways.app_session_touch(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','pathways.app_session_touch(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('anon','pathways.app_session_current(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION '0094 grant postcondition failed'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pathways' AND p.proname LIKE 'app\_session\_%' AND pg_catalog.pg_get_userbyid(p.proowner)='prisma'
    AND p.proconfig=ARRAY['search_path=""'])<>6
 THEN RAISE EXCEPTION '0094 function postconditions failed'; END IF;
END $$;
COMMIT;
