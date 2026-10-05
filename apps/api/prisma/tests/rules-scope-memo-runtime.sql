-- Migration 0063: behavioral checks for the per-transaction memo in pathways_rules_internal.human_rules_scope.
-- Synthetic fixtures only. It reuses the committed users and projects of f10-f11-rules-runtime.sql, so run it right after
-- that suite against the same disposable pathways_phase2_* or pathways_phase4_* replay database with 0063 applied.
-- The function is called like the RLS policies do: session_user pathways_runtime, current_user a rules owner role.
\set ON_ERROR_STOP on

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION '0063 rules scope memo checks require a disposable local database'; END IF;
END $$;

CREATE TEMP TABLE m_results(check_name text PRIMARY KEY);
GRANT INSERT, SELECT ON m_results TO PUBLIC;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 INSERT INTO m_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('7e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Human session as the runtime login, acting through the rules owner role that the policies run under.
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE 'SET LOCAL SESSION AUTHORIZATION pathways_runtime';
 EXECUTE 'SET LOCAL ROLE rules_human_owner';
 PERFORM set_config('request.jwt.claim.sub',pg_temp.u(200+n)::text,true),
  set_config('app.organization_id',pg_temp.u(1)::text,true),set_config('app.user_id',pg_temp.u(100+n)::text,true);
END $$;
CREATE FUNCTION pg_temp.slot(project uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT 'pathways_rules_scope.p'||replace(project::text,'-','')
$$;
CREATE FUNCTION pg_temp.scope(project uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT pathways_rules_internal.human_rules_scope(pg_temp.u(1),project)
$$;
-- The pre-0063 body: ten uncached p06_can checks.
CREATE FUNCTION pg_temp.legacy(project uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT pathways.p06_can('rules.read',project) IS TRUE OR pathways.p06_can('rules.create',project) IS TRUE
  OR pathways.p06_can('rules.update',project) IS TRUE OR pathways.p06_can('rules.activate',project) IS TRUE
  OR pathways.p06_can('alerts.read',project) IS TRUE OR pathways.p06_can('alerts.review',project) IS TRUE
  OR pathways.p06_can('alerts.outcome.record',project) IS TRUE OR pathways.p06_can('recommendations.read',project) IS TRUE
  OR pathways.p06_can('recommendations.review',project) IS TRUE OR pathways.p06_can('recommendations.outcome.record',project) IS TRUE
$$;

-- Users: 102 Project Manager of P16 (permitted), 104 Project Manager of another project only (not permitted on P16).
BEGIN;
GRANT rules_human_owner TO pathways_runtime WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres;

-- (a) The memoized result matches the pre-0063 semantics for a permitted and a non-permitted user, cold and warm.
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pg_temp.legacy(pg_temp.u(316)) AND pg_temp.scope(pg_temp.u(316)) AND pg_temp.scope(pg_temp.u(316)),
 'a a permitted user is in scope cold and from the memo');
SELECT pg_temp.act(4);
SELECT pg_temp.ok(NOT pg_temp.legacy(pg_temp.u(316)) AND NOT pg_temp.scope(pg_temp.u(316)),
 'a2 a user without rules or alerts permission is out of scope');
SELECT pg_temp.ok(NOT pg_temp.scope(pg_temp.u(316)) AND NOT pg_temp.scope(NULL)
 AND NOT pathways_rules_internal.human_rules_scope(pg_temp.u(2),pg_temp.u(316)),
 'a3 a repeated, null-project or foreign-organization call stays out of scope');

-- (b) A memoized true for one actor is ignored when app.user_id changes inside the transaction.
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pg_temp.scope(pg_temp.u(316)) AND current_setting(pg_temp.slot(pg_temp.u(316)),true)=pg_temp.u(102)::text||':t',
 'b the permitted actor memoized a true result');
SELECT pg_temp.act(4);
SELECT pg_temp.ok(NOT pg_temp.scope(pg_temp.u(316)) AND current_setting(pg_temp.slot(pg_temp.u(316)),true)=pg_temp.u(104)::text||':f',
 'b2 an actor change recomputes instead of reusing the other actor result');
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pg_temp.scope(pg_temp.u(316)),'b3 switching back recomputes the permitted actor again');

-- (c) A slot value forged for another actor does not grant access.
SELECT pg_temp.act(4);
SELECT set_config(pg_temp.slot(pg_temp.u(316)),pg_temp.u(102)::text||':t',true);
SELECT pg_temp.ok(NOT pg_temp.scope(pg_temp.u(316)),'c a true slot forged for another actor does not grant access');
SELECT set_config(pg_temp.slot(pg_temp.u(316)),'t',true);
SELECT pg_temp.ok(NOT pg_temp.scope(pg_temp.u(316)),'c2 a malformed slot value does not grant access');

-- (d) A session other than pathways_runtime never gets in scope, even with a populated slot.
SELECT pg_temp.act(2);
SELECT set_config(pg_temp.slot(pg_temp.u(316)),pg_temp.u(102)::text||':t',true);
RESET SESSION AUTHORIZATION;
SET LOCAL ROLE rules_human_owner;
SELECT pg_temp.ok(session_user<>'pathways_runtime' AND NOT pg_temp.scope(pg_temp.u(316)),
 'd a non-runtime session_user is out of scope despite a memoized true');

-- (e1) The memo slot exists inside the transaction that computed it.
SELECT pg_temp.act(2);
SELECT pg_temp.ok(pg_temp.scope(pg_temp.u(316)) AND current_setting(pg_temp.slot(pg_temp.u(316)),true) IS NOT NULL
 AND current_setting(pg_temp.slot(pg_temp.u(316)),true)<>'','e1 the memo slot is set inside the transaction');
RESET SESSION AUTHORIZATION;
REVOKE rules_human_owner FROM pathways_runtime GRANTED BY postgres;
COMMIT;

-- (e) The memo is transaction-local: nothing survives into a new transaction, and the temporary membership is gone.
BEGIN;
SELECT pg_temp.ok(coalesce(current_setting(pg_temp.slot(pg_temp.u(316)),true),'')='','e a new transaction starts without the memo');
SELECT pg_temp.ok(NOT pg_has_role('pathways_runtime','rules_human_owner','MEMBER'),'e2 the temporary test membership was revoked');
COMMIT;

DO $$ DECLARE total integer; BEGIN
 SELECT count(*) INTO total FROM m_results;
 IF total<>12 THEN RAISE EXCEPTION '0063 rules scope memo checks expected 12 assertions, recorded %',total; END IF;
 RAISE NOTICE 'RULES_SCOPE_MEMO_RUNTIME=PASS (% assertions)',total;
END $$;
