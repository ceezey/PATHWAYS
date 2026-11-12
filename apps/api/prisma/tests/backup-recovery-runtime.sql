-- cr-pathways-backup-recovery (0091): disposable checks for the backup owner and job roles, the widened provisioning
-- assertions and the recovery point functions. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0091 applied.
-- Success prints BACKUP_RECOVERY_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Backup recovery checks require a disposable local database'; END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a9100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('p91.passed',(coalesce(nullif(current_setting('p91.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Two documents must be equal; the failure shows both.
CREATE FUNCTION pg_temp.same(label text, got jsonb, wanted jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF got IS NULL OR got IS DISTINCT FROM wanted THEN RAISE EXCEPTION 'Assertion % gave % not %',label,got,wanted; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must fail with the expected SQLSTATE and a message that mentions the needle.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Rows a statement changed, so a policy that hides rows shows as zero.
CREATE FUNCTION pg_temp.changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n; 0 clears every app and jwt setting.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(org_n)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;

-- provisioning: the backup owner holds exactly its three permanent memberships, the widened assertions accept them and
-- nothing else, and the job login holds no membership.
SELECT pg_temp.ok('backup owner profile', (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='pathways_backup_owner'));
SELECT pg_temp.same('backup owner memberships', (SELECT jsonb_agg(r.rolname ORDER BY r.rolname) FROM pg_auth_members m
 JOIN pg_roles r ON r.oid=m.roleid WHERE m.member='pathways_backup_owner'::regrole AND m.inherit_option AND NOT m.set_option
 AND NOT m.admin_option AND m.grantor='postgres'::regrole), '["prisma","report_projection_owner","rules_store_owner"]');
SELECT pg_temp.ok('nobody is a member of the backup owner', NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid='pathways_backup_owner'::regrole));
SELECT pg_temp.ok('prisma keeps no chain', NOT EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 WHERE m.member='prisma'::regrole AND r.rolname IN ('pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner')));
SELECT pathways_rules_internal.assert_runtime_provisioned(), pathways.p34_assert_projection_provisioned();
SELECT pg_temp.ok('assertions accept the backup owner', true);
CREATE ROLE p91_probe NOLOGIN NOINHERIT;
GRANT rules_store_owner, report_projection_owner TO p91_probe;
SELECT pg_temp.refused('rules assertion refuses another member', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
SELECT pg_temp.refused('projection assertion refuses another member', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
REVOKE rules_store_owner, report_projection_owner FROM p91_probe; DROP ROLE p91_probe;
GRANT rules_store_owner TO pathways_backup_owner WITH SET TRUE GRANTED BY postgres;
SELECT pg_temp.refused('a SET-enabled backup membership is refused', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
GRANT rules_store_owner TO pathways_backup_owner WITH SET FALSE GRANTED BY postgres;
-- Neither assertion lists prisma, so only the after-loop check sees a SET-enabled prisma membership.
GRANT prisma TO pathways_backup_owner WITH SET TRUE GRANTED BY postgres;
SELECT pg_temp.refused('a SET-enabled prisma membership is refused', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
GRANT prisma TO pathways_backup_owner WITH SET FALSE GRANTED BY postgres;
GRANT finance_operation_owner TO pathways_backup_owner GRANTED BY postgres;
SELECT pg_temp.refused('an extra backup membership is refused', 'SELECT pathways.p34_assert_projection_provisioned()', '42501', 'Core projection provisioning incomplete');
REVOKE finance_operation_owner FROM pathways_backup_owner GRANTED BY postgres;
-- The replay cluster's bootstrap superuser is postgres, so the other grantor is a probe role holding ADMIN on prisma,
-- which neither assertion inspects as a member, leaving the grantor check as the only reason to refuse.
CREATE ROLE p91_grantor NOLOGIN NOINHERIT;
GRANT prisma TO p91_grantor WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY postgres;
REVOKE prisma FROM pathways_backup_owner GRANTED BY postgres;
GRANT prisma TO pathways_backup_owner WITH INHERIT TRUE, SET FALSE GRANTED BY p91_grantor;
SELECT pg_temp.ok('grantor probe is not postgres', (SELECT grantor FROM pg_auth_members WHERE member='pathways_backup_owner'::regrole
 AND roleid='prisma'::regrole)='p91_grantor'::regrole);
SELECT pg_temp.refused('a backup membership granted by another role is refused', 'SELECT pathways_rules_internal.assert_runtime_provisioned()', '42501', 'Rules runtime provisioning incomplete');
REVOKE prisma FROM pathways_backup_owner GRANTED BY p91_grantor;
GRANT prisma TO pathways_backup_owner WITH INHERIT TRUE, SET FALSE GRANTED BY postgres;
REVOKE prisma FROM p91_grantor GRANTED BY postgres; DROP ROLE p91_grantor;
SELECT pathways_rules_internal.assert_runtime_provisioned();
SELECT pg_temp.ok('migration ledger readable by the backup owner', has_table_privilege('pathways_backup_owner','public._prisma_migrations','SELECT'));
SELECT pg_temp.ok('backup job login profile', (SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconnlimit=0 FROM pg_roles WHERE rolname='pathways_backup_job'));
-- hosted, postgres_oid and bootstrap_oid are computed as the 0031 and 0034 assertions compute them.
SELECT pg_temp.ok('backup job has no membership either way except the hosted bootstrap ADMIN row', NOT EXISTS(SELECT FROM pg_auth_members m,
 (SELECT p.oid AS postgres_oid, b.oid AS bootstrap_oid, NOT p.rolsuper AND p.rolcreaterole AND p.rolcanlogin AND b.oid IS NOT NULL AS hosted
  FROM pg_roles p LEFT JOIN pg_roles b ON b.rolname='supabase_admin' AND b.rolsuper WHERE p.rolname='postgres') h
 WHERE (m.member='pathways_backup_job'::regrole OR m.roleid='pathways_backup_job'::regrole)
 AND NOT (h.hosted AND m.roleid='pathways_backup_job'::regrole AND m.member=h.postgres_oid AND m.grantor=h.bootstrap_oid AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)));

SELECT 'BACKUP_RECOVERY_RUNTIME=PASS ('||current_setting('p91.passed')||')' AS result \gset
ROLLBACK;
\echo :result
