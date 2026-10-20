import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from './application-identity'

/** Organization predicates are always present, even for administrators.
 * Portfolio scope is backed by managed programs or explicit active assignments,
 * never a browser-supplied project list or all organizations.
 */
export function projectScope(profile: ApplicationIdentity): Prisma.ProjectWhereInput {
  const base = { organizationId: profile.organizationId, archivedAt: null }
  if (profile.roles[0] === 'SYSTEM_ADMINISTRATOR') return base
  if (profile.roles[0] === 'PROGRAM_MANAGER') {
    return {
      ...base,
      OR: [
        { id: { in: profile.assignedProjectIds } },
        {
          program: {
            organizationId: profile.organizationId,
            managerUserId: profile.userId,
            archivedAt: null,
          },
        },
      ],
    }
  }
  // No grant-portfolio membership model exists. Explicit active assignments are
  // the conservative ceiling for Grant Manager until separately governed.
  return { ...base, id: { in: profile.assignedProjectIds } }
}
