-- Dry run for hosted-defense-demo-wipe.sql: row counts per table, then ROLLBACK; nothing is changed.
-- Run in the Supabase SQL editor as postgres. Also proves postgres can obtain TRUNCATE rights via temporary role membership.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres'
     OR NOT EXISTS(SELECT FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'Run as postgres (BYPASSRLS, non-superuser) in database postgres';
  END IF;
  IF pg_catalog.to_regnamespace('pathways') IS NULL OR pg_catalog.to_regnamespace('pathways_rules_internal') IS NULL THEN
    RAISE EXCEPTION 'pathways schemas missing';
  END IF;
  IF (SELECT count(*) FROM (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor')) k(s,t) WHERE pg_catalog.to_regclass(format('%I.%I',s,t)) IS NOT NULL)<>10 THEN
    RAISE EXCEPTION 'Expected kept tables missing';
  END IF;
  IF to_regclass('pathways.survey_period_releases') IS NULL THEN RAISE EXCEPTION 'Migrations through 0060 not applied'; END IF;
END $$;

-- Temporary membership only in owner roles postgres does not already inherit.
CREATE TEMP TABLE _wipe_grants(role_name name) ON COMMIT DROP;
DO $$
DECLARE r name;
BEGIN
  FOR r IN SELECT DISTINCT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c
           WHERE c.relkind='r' AND c.relnamespace IN ('pathways'::regnamespace,'pathways_rules_internal'::regnamespace)
  LOOP
    IF NOT pg_catalog.pg_has_role('postgres', r, 'USAGE') THEN
      EXECUTE format('GRANT %I TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres', r);
      INSERT INTO _wipe_grants VALUES (r);
    END IF;
  END LOOP;
END $$;

-- Every table to wipe must be truncatable by postgres once membership is in place.
SELECT n.nspname||'.'||c.relname AS not_truncatable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('pathways','pathways_rules_internal')
  AND (n.nspname,c.relname) NOT IN (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor'))
  AND NOT has_table_privilege('postgres', c.oid, 'TRUNCATE');

SELECT role_name AS membership_granted_then_rolled_back FROM _wipe_grants;

SELECT n.nspname||'.'||c.relname AS table_name, CASE WHEN (n.nspname,c.relname) IN (VALUES ('pathways','organizations'),('pathways','roles'),('pathways','permissions'),('pathways','role_permissions'),
 ('pathways','system_users'),('pathways','user_step_up_pins'),('pathways','signin_lockouts'),
 ('pathways_rules_internal','source_operation_catalog'),('pathways_rules_internal','calendar_configuration'),
 ('pathways_rules_internal','sweep_cursor')) THEN 'KEEP' ELSE 'WIPE' END AS action,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS row_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('pathways','pathways_rules_internal')
ORDER BY action, 1;

ROLLBACK;
