-- Actual API-role negative probes. No Auth/Storage writes; always rollback.
BEGIN;
DO $api_negative$
DECLARE role_name text; probe text; denied boolean;
BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'Unexpected administrator security-test session';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
    FOREACH probe IN ARRAY ARRAY[
      'CREATE TEMP TABLE phase4_api_temp_denied(id integer)',
      'CREATE TABLE pathways.phase4_api_ddl_denied(id integer)',
      'SELECT count(*) FROM pathways.organizations'
    ] LOOP
      denied:=false;
      BEGIN EXECUTE probe;
      EXCEPTION WHEN insufficient_privilege THEN denied:=true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'API-role privilege regression'; END IF;
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$api_negative$;
ROLLBACK;
SELECT 'API_ROLE_NEGATIVE_PROBES_9=PASS';
