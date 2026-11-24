-- cr-pathways-session-management (0094): disposable checks for pathways.app_sessions and its runtime functions.
-- Synthetic fixtures only; everything rolls back. Run as a local superuser against a disposable pathways_phase2_* or
-- phase4/phase6 replay database that already has 0094 applied. Success prints SESSION_MANAGEMENT_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Session management checks require a disposable local database'; END IF;
END $$;

ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM set_config('sm.passed',(coalesce(nullif(current_setting('sm.passed',true),''),'0')::integer+1)::text,true);
END $$;
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
 IF got IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Assertion % gave % not %',label,got,expected; END IF;
 PERFORM set_config('sm.passed',(coalesce(nullif(current_setting('sm.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(user_n-10)::text,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',pg_temp.u(org_n)::text,true),
  set_config('app.user_id',pg_temp.u(user_n)::text,true);
END $$;
CREATE FUNCTION pg_temp.state(session_n integer) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(end_reason,'OPEN') FROM pathways.app_sessions WHERE session_id=pg_temp.u(session_n)
$$;

-- Catalog: prisma owns the table with no API-role grants; only the five runtime functions are executable by pathways_runtime.
SELECT pg_temp.ok('catalog', (SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.app_sessions'::regclass)
 AND NOT has_table_privilege('pathways_runtime','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_function_privilege('pathways_runtime','pathways.app_session_open(timestamptz,timestamptz,timestamptz)','EXECUTE')
 AND has_function_privilege('pathways_runtime','pathways.app_session_end_user(uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','pathways.app_session_current(uuid,uuid)','EXECUTE'));

-- Fixtures: organization A with users 21 (jwt 11) and 22 (jwt 12); organization B with user 31 (jwt 21).
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(21));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'SM_A','Synthetic sessions organization A'),
 (pg_temp.u(2),'SM_B','Synthetic sessions organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,v.org,r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(1),'SYSTEM_ADMINISTRATOR',pg_temp.u(11),'Synthetic SM admin','sm-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(1),'PROJECT_OFFICER',pg_temp.u(12),'Synthetic SM officer','sm-b@example.invalid'),
 (pg_temp.u(31),pg_temp.u(2),'SYSTEM_ADMINISTRATOR',pg_temp.u(21),'Synthetic SM outsider','sm-c@example.invalid')) v(id,org,role_code,auth_id,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;

-- Only pathways_runtime may call the functions.
SELECT pg_temp.refused('owner cannot touch', format('SELECT pathways.app_session_touch(%L,%L,NULL)',pg_temp.u(12),pg_temp.u(101)),'42501');
SELECT pg_temp.ok('owner sees no current session', NOT pathways.app_session_current(pg_temp.u(12),pg_temp.u(101)));

SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
-- First sight inserts an open session; the device text is trimmed to 200 characters.
SELECT pg_temp.ok('first touch ends none', pathways.app_session_touch(pg_temp.u(12),pg_temp.u(101),repeat('x',250))=0);
SELECT pg_temp.ok('first touch is current', pathways.app_session_current(pg_temp.u(12),pg_temp.u(101)));
SELECT pg_temp.ok('another subject is not current', NOT pathways.app_session_current(pg_temp.u(11),pg_temp.u(101)));
SELECT pg_temp.ok('a foreign subject cannot touch it', pathways.app_session_touch(pg_temp.u(11),pg_temp.u(101),NULL)=0);
SELECT pg_temp.ok('unknown session is not current', NOT pathways.app_session_current(pg_temp.u(12),pg_temp.u(199)));
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('device trimmed', (SELECT char_length(device)=200 AND auth_user_id=pg_temp.u(12)
 FROM pathways.app_sessions WHERE session_id=pg_temp.u(101)));

-- Limit: sessions 102 to 104 arrive later; the fourth open session ends the oldest (101).
UPDATE pathways.app_sessions SET started_at=now()-interval '4 minutes' WHERE session_id=pg_temp.u(101);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
SELECT pathways.app_session_touch(pg_temp.u(12),pg_temp.u(102),'Phone');
SELECT pathways.app_session_touch(pg_temp.u(12),pg_temp.u(103),'Tablet');
RESET SESSION AUTHORIZATION;
UPDATE pathways.app_sessions SET started_at=now()-interval '3 minutes' WHERE session_id=pg_temp.u(102);
UPDATE pathways.app_sessions SET started_at=now()-interval '2 minutes' WHERE session_id=pg_temp.u(103);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
SELECT pg_temp.ok('three open sessions keep all', pathways.app_session_current(pg_temp.u(12),pg_temp.u(101)));
SELECT pg_temp.ok('fourth session ends one', pathways.app_session_touch(pg_temp.u(12),pg_temp.u(104),'Laptop')=1);
SELECT pg_temp.ok('oldest ended by limit', pg_temp.state(101)='LIMIT' AND NOT pathways.app_session_current(pg_temp.u(12),pg_temp.u(101)));
SELECT pg_temp.ok('newer three stay open', pathways.app_session_current(pg_temp.u(12),pg_temp.u(102))
 AND pathways.app_session_current(pg_temp.u(12),pg_temp.u(103)) AND pathways.app_session_current(pg_temp.u(12),pg_temp.u(104)));
SELECT pg_temp.ok('ended session is never revived', pathways.app_session_touch(pg_temp.u(12),pg_temp.u(101),NULL)=0
 AND pg_temp.state(101)='LIMIT');
SELECT pg_temp.ok('list shows three, newest first, current flagged', (SELECT array_agg(session_id ORDER BY ord)=
  ARRAY[pg_temp.u(104),pg_temp.u(103),pg_temp.u(102)] AND bool_or(is_current AND session_id=pg_temp.u(103))
  FROM pathways.app_session_list(pg_temp.u(12),pg_temp.u(103)) WITH ORDINALITY
   l(session_id,device,started_at,last_active_at,is_current,ord)));
SELECT pg_temp.ok('another subject lists nothing', NOT EXISTS(SELECT FROM pathways.app_session_list(pg_temp.u(11),pg_temp.u(103))));
RESET SESSION AUTHORIZATION;

-- Idle and expiry: an idle session is not current and the next touch marks it IDLE; same for 12 hours.
UPDATE pathways.app_sessions SET last_active_at=now()-interval '31 minutes' WHERE session_id=pg_temp.u(102);
UPDATE pathways.app_sessions SET started_at=now()-interval '13 hours' WHERE session_id=pg_temp.u(103);
UPDATE pathways.app_sessions SET last_active_at=now()-interval '29 minutes' WHERE session_id=pg_temp.u(104);
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
SELECT pg_temp.ok('idle is not current', NOT pathways.app_session_current(pg_temp.u(12),pg_temp.u(102)));
SELECT pg_temp.ok('expired is not current', NOT pathways.app_session_current(pg_temp.u(12),pg_temp.u(103)));
SELECT pathways.app_session_touch(pg_temp.u(12),pg_temp.u(102),NULL), pathways.app_session_touch(pg_temp.u(12),pg_temp.u(103),NULL);
SELECT pg_temp.ok('touch marks idle and expired', pg_temp.state(102)='IDLE' AND pg_temp.state(103)='EXPIRED');
SELECT pg_temp.ok('29 minutes is still open', pathways.app_session_current(pg_temp.u(12),pg_temp.u(104)));
SELECT pathways.app_session_touch(pg_temp.u(12),pg_temp.u(104),NULL);
RESET SESSION AUTHORIZATION;
SELECT pg_temp.ok('touch refreshes activity', (SELECT last_active_at > now()-interval '1 minute'
 FROM pathways.app_sessions WHERE session_id=pg_temp.u(104)));

-- Own revocation: one session, or every session but the current one; the reason is checked.
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.act_as(22);
SELECT pathways.app_session_touch(pg_temp.u(12),pg_temp.u(105),NULL), pathways.app_session_touch(pg_temp.u(12),pg_temp.u(106),NULL);
SELECT pg_temp.ok('end one own session', pathways.app_session_end(pg_temp.u(12),pg_temp.u(105),NULL,'USER')=1
 AND pg_temp.state(105)='USER');
SELECT pg_temp.ok('a foreign subject ends nothing', pathways.app_session_end(pg_temp.u(11),pg_temp.u(106),NULL,'USER')=0);
SELECT pg_temp.ok('end others keeps the current', pathways.app_session_end(pg_temp.u(12),NULL,pg_temp.u(106),'PASSWORD_CHANGED')=1
 AND pg_temp.state(104)='PASSWORD_CHANGED' AND pg_temp.state(106)='OPEN');
SELECT pg_temp.refused('target and keep together', format('SELECT pathways.app_session_end(%L,%L,%L,%L)',
 pg_temp.u(12),pg_temp.u(106),pg_temp.u(106),'USER'),'42501');
SELECT pg_temp.refused('admin reason refused for own end', format('SELECT pathways.app_session_end(%L,%L,NULL,%L)',
 pg_temp.u(12),pg_temp.u(106),'ADMIN'),'42501');

-- Organization revocation: an admin of A ends user 22's sessions; an admin of B cannot.
SELECT pathways.app_session_touch(pg_temp.u(11),pg_temp.u(111),NULL);
SELECT pg_temp.act_as(31,2);
SELECT pg_temp.ok('other organization ends nothing', pathways.app_session_end_user(pg_temp.u(22),'ADMIN')=0
 AND pg_temp.state(106)='OPEN');
SELECT pg_temp.act_as(21);
SELECT pg_temp.ok('same organization ends all', pathways.app_session_end_user(pg_temp.u(22),'ADMIN')=1
 AND pg_temp.state(106)='ADMIN' AND pg_temp.state(111)='OPEN');
SELECT pg_temp.refused('own reason refused for user end', format('SELECT pathways.app_session_end_user(%L,%L)',
 pg_temp.u(22),'USER'),'42501');
RESET SESSION AUTHORIZATION;

SELECT 'SESSION_MANAGEMENT_RUNTIME=PASS ('||current_setting('sm.passed')||')' AS result \gset
ROLLBACK;
\echo :result
