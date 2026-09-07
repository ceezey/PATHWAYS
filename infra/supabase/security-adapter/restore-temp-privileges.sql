-- Phase 4 only: exact inverse of apply-temp-privileges.sql after a regression.
-- Rehearse before live application. Run with ON_ERROR_STOP and the same approved
-- administrator connection after independently verifying PATHWAYS-dev project
-- ref pdqwsknbzkdtiwjjibqt and the approved Session Pooler in the external runner.
-- The name guard cannot identify the Supabase project by itself.
-- This is NOT a migration rollback and never modifies a migration ledger.
-- Refuse ACL drift rather than silently overwriting unrelated privilege work.
-- Restore only the single PUBLIC TEMP grant and remove only the nine direct
-- TEMP grants introduced by the paired apply file; no CASCADE or broad REVOKE.
-- After restoration, repeat service smoke tests, preserve evidence, and stop.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $phase4_temp_restore$
DECLARE
    phase4_database text := current_database();
    phase4_allowlist constant text[] := ARRAY[
        'prisma',
        'authenticator',
        'supabase_auth_admin',
        'supabase_storage_admin',
        'supabase_etl_admin',
        'supabase_read_only_user',
        'supabase_realtime_admin',
        'supabase_replication_admin',
        'supabase_privileged_role'
    ];
    phase4_original_acl constant jsonb := '[
        ["PUBLIC", "postgres", "CONNECT", false],
        ["PUBLIC", "postgres", "TEMPORARY", false],
        ["dashboard_user", "postgres", "CONNECT", false],
        ["dashboard_user", "postgres", "CREATE", false],
        ["dashboard_user", "postgres", "TEMPORARY", false],
        ["postgres", "postgres", "CONNECT", false],
        ["postgres", "postgres", "CREATE", false],
        ["postgres", "postgres", "TEMPORARY", false],
        ["supabase_etl_admin", "postgres", "CREATE", false],
        ["supabase_storage_admin", "postgres", "CREATE", false]
    ]'::jsonb;
    phase4_expected_original jsonb;
    phase4_expected_applied jsonb;
    phase4_actual_acl jsonb;
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Phase 4 TEMP restore requires current_user postgres';
    END IF;

    IF phase4_database <> 'postgres'
       AND phase4_database !~ '^pathways_phase4_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Phase 4 TEMP restore database-name guard failed';
    END IF;

    IF (SELECT pg_get_userbyid(datdba) FROM pg_database
        WHERE datname = phase4_database) <> 'postgres' THEN
        RAISE EXCEPTION 'Phase 4 TEMP restore database-owner guard failed';
    END IF;

    IF (SELECT count(*) FROM pg_roles
        WHERE rolname::text = ANY (phase4_allowlist)) <> cardinality(phase4_allowlist) THEN
        RAISE EXCEPTION 'Phase 4 TEMP restore allowlist is incomplete';
    END IF;

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_expected_original
      FROM jsonb_array_elements(phase4_original_acl) AS original(entry);

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_expected_applied
      FROM (
          SELECT entry
            FROM jsonb_array_elements(phase4_original_acl) AS original(entry)
           WHERE NOT (entry ->> 0 = 'PUBLIC' AND entry ->> 2 = 'TEMPORARY')
          UNION ALL
          SELECT jsonb_build_array(role_name, 'postgres', 'TEMPORARY', false)
            FROM unnest(phase4_allowlist) AS allowed(role_name)
      ) AS expected(entry);

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_actual_acl
      FROM (
          SELECT jsonb_build_array(
              CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
                   ELSE pg_get_userbyid(privilege.grantee) END,
              pg_get_userbyid(privilege.grantor),
              privilege.privilege_type,
              privilege.is_grantable
          ) AS entry
            FROM pg_database database_row
            CROSS JOIN LATERAL aclexplode(database_row.datacl) AS privilege
           WHERE database_row.datname = phase4_database
      ) AS actual;

    IF phase4_actual_acl IS DISTINCT FROM phase4_expected_applied THEN
        RAISE EXCEPTION 'Phase 4 TEMP restore detected ACL drift; no privileges changed';
    END IF;

    EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO PUBLIC', phase4_database);
    EXECUTE format(
        'REVOKE TEMPORARY ON DATABASE %I FROM prisma, authenticator, '
        'supabase_auth_admin, supabase_storage_admin, supabase_etl_admin, '
        'supabase_read_only_user, supabase_realtime_admin, '
        'supabase_replication_admin, supabase_privileged_role',
        phase4_database
    );

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_actual_acl
      FROM (
          SELECT jsonb_build_array(
              CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
                   ELSE pg_get_userbyid(privilege.grantee) END,
              pg_get_userbyid(privilege.grantor),
              privilege.privilege_type,
              privilege.is_grantable
          ) AS entry
            FROM pg_database database_row
            CROSS JOIN LATERAL aclexplode(database_row.datacl) AS privilege
           WHERE database_row.datname = phase4_database
      ) AS actual;

    IF phase4_actual_acl IS DISTINCT FROM phase4_expected_original THEN
        RAISE EXCEPTION 'Phase 4 TEMP original ACL restoration failed; transaction must roll back';
    END IF;

    RAISE NOTICE 'Phase 4 original TEMP ACL assertions passed; commit and service smoke checks still required';
END;
$phase4_temp_restore$;

COMMIT;
