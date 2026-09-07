-- Phase 4 only: replace PUBLIC's TEMPORARY privilege with the reviewed allowlist.
-- Rehearse this file and its exact inverse in a disposable local database first.
-- Execute with an approved administrator connection and ON_ERROR_STOP enabled.
-- The runner MUST independently verify PATHWAYS-dev project ref
-- pdqwsknbzkdtiwjjibqt, the approved Session Pooler, and the maintenance window.
-- A database name alone cannot establish the Supabase project identity.
-- Do not run on production or another project. No migration ledger is modified.
-- Run the before/after service smoke tests externally; on regression immediately
-- run restore-temp-privileges.sql. Preserve evidence and stop all other work.
-- No CONNECT, CREATE, role membership, ownership, or grant option is changed.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $phase4_temp_apply$
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
    -- Each tuple is [grantee, grantor, privilege, grant_option]. This is the
    -- captured live baseline, not a computed approximation of effective access.
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
    phase4_expected_before jsonb;
    phase4_expected_after jsonb;
    phase4_actual_acl jsonb;
    phase4_group_members text[];
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Phase 4 TEMP adapter requires current_user postgres';
    END IF;

    IF phase4_database <> 'postgres'
       AND phase4_database !~ '^pathways_phase4_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Phase 4 TEMP adapter database-name guard failed';
    END IF;

    IF (SELECT pg_get_userbyid(datdba) FROM pg_database
        WHERE datname = phase4_database) <> 'postgres' THEN
        RAISE EXCEPTION 'Phase 4 TEMP adapter database-owner guard failed';
    END IF;

    IF (SELECT count(*) FROM pg_roles
        WHERE rolname::text = ANY (phase4_allowlist)) <> cardinality(phase4_allowlist) THEN
        RAISE EXCEPTION 'Phase 4 TEMP preservation allowlist is incomplete';
    END IF;

    SELECT array_agg(DISTINCT member_role.rolname::text
                     ORDER BY member_role.rolname::text)
      INTO phase4_group_members
      FROM pg_auth_members membership
      JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
     WHERE granted_role.rolname = 'supabase_privileged_role';

    IF phase4_group_members IS DISTINCT FROM
       ARRAY['postgres', 'supabase_etl_admin']::text[] THEN
        RAISE EXCEPTION 'Phase 4 privileged-role membership differs from reviewed baseline';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_roles runtime_role
          JOIN pg_roles allowed_role
            ON allowed_role.rolname::text = ANY (phase4_allowlist)
         WHERE runtime_role.rolname = 'pathways_runtime'
           AND pg_has_role(runtime_role.oid, allowed_role.oid, 'MEMBER')
    ) THEN
        RAISE EXCEPTION 'Phase 4 runtime must not be a member of a TEMP allowlisted role';
    END IF;

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_expected_before
      FROM jsonb_array_elements(phase4_original_acl) AS original(entry);

    SELECT jsonb_agg(entry ORDER BY entry::text)
      INTO phase4_expected_after
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

    IF phase4_actual_acl IS DISTINCT FROM phase4_expected_before THEN
        RAISE EXCEPTION 'Phase 4 TEMP baseline ACL differs; no privileges changed';
    END IF;

    -- Only fixed, reviewed identifiers appear in the grantee list. Identifier
    -- quoting of the database permits the disposable local rehearsal target.
    EXECUTE format(
        'GRANT TEMPORARY ON DATABASE %I TO prisma, authenticator, '
        'supabase_auth_admin, supabase_storage_admin, supabase_etl_admin, '
        'supabase_read_only_user, supabase_realtime_admin, '
        'supabase_replication_admin, supabase_privileged_role',
        phase4_database
    );
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', phase4_database);

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

    IF phase4_actual_acl IS DISTINCT FROM phase4_expected_after THEN
        RAISE EXCEPTION 'Phase 4 TEMP postcondition ACL failed; transaction must roll back';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE rolname::text = ANY (phase4_allowlist || ARRAY['postgres', 'dashboard_user'])
           AND NOT has_database_privilege(oid, phase4_database, 'TEMPORARY')
    ) THEN
        RAISE EXCEPTION 'Phase 4 TEMP managed-service or migration preservation failed';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE rolname IN ('anon', 'authenticated', 'service_role', 'pathways_runtime')
           AND has_database_privilege(oid, phase4_database, 'TEMPORARY')
    ) THEN
        RAISE EXCEPTION 'Phase 4 TEMP runtime or API-role denial failed';
    END IF;

    RAISE NOTICE 'Phase 4 TEMP ACL assertions passed; commit and external smoke checks still required';
END;
$phase4_temp_apply$;

COMMIT;
