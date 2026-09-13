-- P01: permit narrowly governed application-profile administration through the
-- non-owner runtime while retaining RLS and the canonical role ceiling.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'prisma' AND NOT (
    current_user = 'postgres'
    AND (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1')
  ) THEN
    RAISE EXCEPTION 'P01 migration requires prisma or a loopback-only replay administrator';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected NOBYPASSRLS pathways_runtime role is missing';
  END IF;
  IF to_regclass('pathways.system_users') IS NULL
     OR to_regclass('pathways.user_project_assignments') IS NULL THEN
    RAISE EXCEPTION 'P01 foundation tables are missing';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relname='system_users' AND p.polname='p4_runtime_lock'
  ) THEN
    RAISE EXCEPTION 'Expected 0005 system-user lock policy is missing';
  END IF;
END
$preflight$;

-- Backend-only discovery bridges a verified Auth subject to its single v1
-- application profile. The function is not exposed to Supabase API roles and
-- returns selectors only; every subsequent request re-enters the full RLS
-- context and active profile/role/assignment checks.
CREATE FUNCTION pathways.p1_workspace_for_auth()
RETURNS TABLE(user_id uuid, organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.organization_id
  FROM pathways.system_users AS u
  JOIN pathways.organizations AS o ON o.id=u.organization_id
  JOIN pathways.roles AS r ON r.id=u.role_id
  WHERE u.auth_user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    AND u.account_status='ACTIVE' AND u.archived_at IS NULL
    AND o.status='ACTIVE' AND o.archived_at IS NULL AND r.is_active
$$;

REVOKE ALL ON FUNCTION pathways.p1_workspace_for_auth()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p1_workspace_for_auth() TO pathways_runtime;

CREATE FUNCTION pathways.p1_can_manage_role(target_role_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT CASE actor_role.code
      WHEN 'SYSTEM_ADMINISTRATOR' THEN target_role.code IN (
        'SYSTEM_ADMINISTRATOR','PROGRAM_MANAGER','GRANT_MANAGER','PROJECT_MANAGER',
        'MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER'
      )
      WHEN 'PROGRAM_MANAGER' THEN target_role.code IN (
        'PROJECT_MANAGER','MONITORING_AND_EVALUATION_OFFICER'
      )
      WHEN 'PROJECT_MANAGER' THEN target_role.code IN (
        'PROJECT_OFFICER','MONITORING_AND_EVALUATION_OFFICER'
      )
      ELSE false
    END
    FROM pathways.system_users actor
    JOIN pathways.roles actor_role ON actor_role.id=actor.role_id AND actor_role.is_active
    JOIN pathways.roles target_role ON target_role.id=target_role_id AND target_role.is_active
    WHERE actor.id=(SELECT pathways.runtime_context_user())
      AND actor.organization_id=(SELECT pathways.runtime_context_organization())
      AND actor.account_status='ACTIVE' AND actor.archived_at IS NULL
  ),false)
$$;

REVOKE ALL ON FUNCTION pathways.p1_can_manage_role(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pathways.p1_can_manage_role(uuid) TO pathways_runtime;

-- Existing managed databases already have canonical reference rows. Fresh
-- replays seed them after migrations, where the same mapping comes from the
-- checked-in policy. This grants no runtime write access to governed mappings.
INSERT INTO pathways.role_permissions (role_id,permission_id)
SELECT r.id,p.id
FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE r.code='SYSTEM_ADMINISTRATOR' AND p.code='projects.create'
ON CONFLICT (role_id,permission_id) DO NOTHING;

DROP POLICY p4_runtime_lock ON pathways.system_users;

GRANT INSERT (organization_id,role_id,auth_user_id,full_name,email,position_title,
  contact_number,account_status,activated_at)
ON pathways.system_users TO pathways_runtime;
GRANT UPDATE (role_id,full_name,position_title,contact_number,account_status,
  activated_at,suspended_at,deactivated_at,archived_at,updated_at)
ON pathways.system_users TO pathways_runtime;

CREATE POLICY p1_runtime_insert ON pathways.system_users
FOR INSERT TO pathways_runtime
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND account_status='ACTIVE' AND archived_at IS NULL
  AND auth_user_id IS NOT NULL
  AND (SELECT pathways.p1_can_manage_role(role_id))
);

CREATE POLICY p1_runtime_update ON pathways.system_users
FOR UPDATE TO pathways_runtime
USING (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND id<>(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p1_can_manage_role(role_id))
)
WITH CHECK (
  organization_id=(SELECT pathways.runtime_context_organization())
  AND id<>(SELECT pathways.runtime_context_user())
  AND (SELECT pathways.p1_can_manage_role(role_id))
);

COMMIT;
