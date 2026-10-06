-- Migration 0065: behavioral checks for pathways.p06_zone_is_valid and its two callers.
-- Synthetic fixtures only. Run only against the guarded disposable replay database with 0065 applied; it rolls back.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR current_user <> 'postgres'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION '0065 zone memo checks require a disposable local database';
  END IF;
END $$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('65000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '0065 assertion failed: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_22023(statement text, message text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> message THEN RAISE EXCEPTION '0065 wrong message for %: %', label, SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION '0065 expected 22023: %', label;
END $$;

-- Helper results and caching.
SELECT pg_temp.ok(pathways.p06_zone_is_valid('Asia/Manila') AND NOT pathways.p06_zone_is_valid('Not/AZone')
  AND NOT pathways.p06_zone_is_valid(NULL) AND NOT pathways.p06_zone_is_valid(repeat('a', 101)),
  'helper accepts Asia/Manila and rejects an unknown zone, NULL and 101 characters');
SELECT set_config('pathways_zone.valid', '', true);
SELECT pg_temp.ok(NOT pathways.p06_zone_is_valid('Not/AZone') AND coalesce(current_setting('pathways_zone.valid', true), '') = '',
  'an invalid zone is not cached');
SELECT pg_temp.ok(pathways.p06_zone_is_valid('Asia/Manila') AND current_setting('pathways_zone.valid', true) = 'Asia/Manila',
  'a valid zone is stored in the transaction-local setting');
SELECT pg_temp.ok(pathways.p06_zone_is_valid('Asia/Manila') AND pathways.p06_zone_is_valid('Asia/Manila'),
  'a repeat call in the same transaction still returns true from the setting');
SELECT pg_temp.ok(NOT pathways.p06_zone_is_valid('Not/AZone') AND current_setting('pathways_zone.valid', true) = 'Asia/Manila',
  'an invalid zone leaves the remembered zone untouched');
SELECT pg_temp.ok(NOT has_function_privilege('pathways_runtime', 'pathways.p06_zone_is_valid(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'pathways.p06_zone_is_valid(text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'pathways.p06_zone_is_valid(text)', 'EXECUTE'),
  'helper is not executable by the runtime or Data API roles');

SELECT set_config('pathways_zone.valid', '', true);
SELECT pg_temp.ok(NOT pathways.p06_zone_is_valid(''), 'an empty zone is rejected after the setting was used');

-- Callers: an authorized actor (Project Manager with analytics.read) in a fresh setting state.
INSERT INTO auth.users(id) VALUES (pg_temp.u(101));
INSERT INTO pathways.organizations(id, code, name) VALUES (pg_temp.u(1), 'ZONE_MEMO_A', 'Zone memo organization');
INSERT INTO pathways.roles(id, code, name) VALUES (pg_temp.u(11), 'PROJECT_MANAGER', 'Project Manager')
  ON CONFLICT (code) DO NOTHING;
INSERT INTO pathways.permissions(id, code, name) VALUES (pg_temp.u(21), 'analytics.read', 'analytics.read')
  ON CONFLICT (code) DO UPDATE SET is_active = true;
INSERT INTO pathways.role_permissions(role_id, permission_id)
  SELECT r.id, p.id FROM pathways.roles r, pathways.permissions p WHERE r.code = 'PROJECT_MANAGER' AND p.code = 'analytics.read'
  ON CONFLICT DO NOTHING;
INSERT INTO pathways.system_users(id, organization_id, role_id, auth_user_id, full_name, email, account_status, activated_at)
  SELECT pg_temp.u(31), pg_temp.u(1), r.id, pg_temp.u(101), 'Zone memo manager', 'zone-memo@example.invalid', 'ACTIVE', now()
  FROM pathways.roles r WHERE r.code = 'PROJECT_MANAGER';
SELECT set_config('request.jwt.claim.sub', pg_temp.u(101)::text, true),
  set_config('app.organization_id', pg_temp.u(1)::text, true), set_config('app.user_id', pg_temp.u(31)::text, true),
  set_config('pathways_zone.valid', '', true);

SELECT pg_temp.expect_22023(
  format('SELECT pathways.p06_assert_scope(%L::uuid, ARRAY[]::uuid[], %L, %L::date, %L::date, %L)',
    pg_temp.u(1), 'analytics.read', '2026-06-01', '2026-06-30', 'Not/AZone'),
  'Invalid bounded monitoring period', 'p06_assert_scope rejects an invalid zone');
SELECT pathways.p06_assert_scope(pg_temp.u(1), ARRAY[]::uuid[], 'analytics.read', DATE '2026-06-01', DATE '2026-06-30', 'Asia/Manila');
SELECT pg_temp.expect_22023(
  format('SELECT pathways.p06_assert_scope(%L::uuid, ARRAY[]::uuid[], %L, %L::date, %L::date, %L)',
    pg_temp.u(1), 'analytics.read', '2026-06-01', '2026-06-30', ''),
  'Invalid bounded monitoring period', 'p06_assert_scope rejects an empty zone');
SELECT pg_temp.expect_22023(
  format('SELECT pathways.p06_home_dashboard(%L::uuid, ARRAY[]::uuid[], %L::date, %L::date, %L)',
    pg_temp.u(1), '2026-06-01', '2026-06-30', ''),
  'Invalid bounded dashboard period', 'p06_home_dashboard rejects an empty zone');
SELECT pathways.p06_assert_scope(pg_temp.u(1), ARRAY[]::uuid[], 'analytics.read', DATE '2026-06-01', DATE '2026-06-30', 'Asia/Manila');
SELECT pg_temp.ok(current_setting('pathways_zone.valid', true) = 'Asia/Manila', 'p06_assert_scope accepts Asia/Manila and remembers it');
SELECT pg_temp.expect_22023(
  format('SELECT pathways.p06_home_dashboard(%L::uuid, ARRAY[]::uuid[], %L::date, %L::date, %L)',
    pg_temp.u(1), '2026-06-01', '2026-06-30', 'Not/AZone'),
  'Invalid bounded dashboard period', 'p06_home_dashboard rejects an invalid zone');
SELECT pg_temp.ok(pathways.p06_home_dashboard(pg_temp.u(1), ARRAY[]::uuid[], DATE '2026-06-01', DATE '2026-06-30', 'Asia/Manila') IS NOT NULL,
  'p06_home_dashboard accepts Asia/Manila');

ROLLBACK;
SELECT 'ZONE_CHECK_MEMO_RUNTIME=PASS';
