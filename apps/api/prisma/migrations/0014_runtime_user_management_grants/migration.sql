-- P07 forward correction:
-- User Management is an application-runtime workflow. RLS already limits
-- organization, actor and manageable roles, but the runtime also requires
-- the table-level command privileges before PostgreSQL evaluates those policies.
--
-- Keep this narrow: no DELETE, no ownership, no DDL and no grant option.

DO $$
BEGIN
  IF to_regrole('pathways_runtime') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_ROLE_MISSING';
  END IF;

  IF to_regclass('pathways.system_users') IS NULL THEN
    RAISE EXCEPTION 'PATHWAYS_SYSTEM_USERS_TABLE_MISSING';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE
ON TABLE pathways.system_users
TO pathways_runtime;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE pathways.system_users
FROM pathways_runtime;

DO $$
BEGIN
  IF NOT has_table_privilege(
    'pathways_runtime',
    'pathways.system_users',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_SYSTEM_USERS_SELECT_MISSING';
  END IF;

  IF NOT has_table_privilege(
    'pathways_runtime',
    'pathways.system_users',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_SYSTEM_USERS_INSERT_MISSING';
  END IF;

  IF NOT has_table_privilege(
    'pathways_runtime',
    'pathways.system_users',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_SYSTEM_USERS_UPDATE_MISSING';
  END IF;

  IF has_table_privilege(
    'pathways_runtime',
    'pathways.system_users',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'PATHWAYS_RUNTIME_SYSTEM_USERS_DELETE_MUST_REMAIN_DENIED';
  END IF;
END
$$;