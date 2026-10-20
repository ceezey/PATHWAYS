import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { hasAtomicPermission, isCanonicalRole } from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from './application-identity'

type ProfileRow = {
  id: string
  organizationId: string
  organization: { name: string }
  fullName: string
  role: { code: string; rolePermissions: { permission: { code: string } }[] }
  assignedProjectIds: unknown
}

/** Re-read inside each business transaction; never authorize from cached roles. */
export async function readApplicationProfile(
  transaction: Prisma.TransactionClient,
  authSubject: string,
  organizationId: string,
  userId: string,
): Promise<ApplicationIdentity> {
  // Compare assigned_at with the database clock that stamps it, not the host clock.
  // The default Prisma relation strategy performs several sequential reads here.
  // Join the same active profile/organization/role/grants/assignments in one
  // parameterized SELECT, on the SAME runtime transaction and under the SAME
  // table RLS. No definer helper, global/request cache or prior authority.
  const rows = await transaction.$queryRaw<ProfileRow[]>`
    SELECT u.id::text AS id, u.organization_id::text AS "organizationId",
      u.full_name AS "fullName", jsonb_build_object('name', o.name) AS organization,
      jsonb_build_object('code', r.code, 'rolePermissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('permission', jsonb_build_object('code', p.code))
          ORDER BY p.code)
        FROM pathways.role_permissions rp
        JOIN pathways.permissions p ON p.id = rp.permission_id AND p.is_active
        WHERE rp.role_id = r.id
      ), '[]'::jsonb)) AS role,
      COALESCE((
        SELECT jsonb_agg(scoped.project_id ORDER BY scoped.project_id)
        FROM (
          SELECT DISTINCT a.project_id::text AS project_id
          FROM pathways.user_project_assignments a
          JOIN pathways.projects project
            ON project.id = a.project_id AND project.organization_id = a.organization_id
          WHERE a.organization_id = u.organization_id AND a.user_id = u.id
            AND a.status = 'ACTIVE' AND a.ended_at IS NULL
            AND a.assigned_at <= clock_timestamp()
            AND project.archived_at IS NULL
        ) scoped
      ), '[]'::jsonb) AS "assignedProjectIds"
    FROM pathways.system_users u
    JOIN pathways.organizations o ON o.id = u.organization_id
    JOIN pathways.roles r ON r.id = u.role_id
    WHERE u.id = ${userId}::uuid AND u.auth_user_id = ${authSubject}::uuid
      AND u.organization_id = ${organizationId}::uuid
      AND u.account_status = 'ACTIVE' AND u.archived_at IS NULL
      AND o.status = 'ACTIVE' AND o.archived_at IS NULL AND r.is_active
  `
  const profile = rows[0]
  if (rows.length !== 1 || !profile || !isCanonicalRole(profile.role.code)) {
    throw new ForbiddenException('No active application profile.')
  }
  if (
    !Array.isArray(profile.assignedProjectIds) ||
    !profile.assignedProjectIds.every(
      (projectId): projectId is string =>
        typeof projectId === 'string' && UUID_PATTERN.test(projectId),
    )
  ) {
    throw new Error('Database assignment authority result is invalid.')
  }
  return {
    id: authSubject,
    aal: 'aal2',
    userId: profile.id,
    organizationId: profile.organizationId,
    organizationName: profile.organization.name,
    fullName: profile.fullName,
    roles: [profile.role.code],
    permissions: profile.role.rolePermissions
      .map(({ permission }) => permission.code)
      .filter((code) => hasAtomicPermission(profile.role.code, [code], code)),
    assignedProjectIds: [...new Set(profile.assignedProjectIds)],
  }
}
