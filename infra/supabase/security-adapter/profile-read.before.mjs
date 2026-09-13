// Test-only reference: the pre-correction profile reader, retained for direct
// query/result/round-trip comparisons. Never imported by application code.
export async function readBefore(transaction, authSubject, organizationId, userId, policy) {
  const profile = await transaction.systemUser.findFirst({
    where: {
      id: userId,
      authUserId: authSubject,
      organizationId,
      accountStatus: 'ACTIVE',
      archivedAt: null,
      organization: { status: 'ACTIVE', archivedAt: null },
      role: { isActive: true },
    },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { name: true } },
      fullName: true,
      role: {
        select: {
          code: true,
          rolePermissions: {
            where: { permission: { isActive: true } },
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  })
  if (!profile || !policy.isCanonicalRole(profile.role.code)) throw new Error('PROFILE_DENIED')
  const assignments = await transaction.userProjectAssignment.findMany({
    where: {
      organizationId,
      userId,
      status: 'ACTIVE',
      endedAt: null,
      assignedAt: { lte: new Date() },
      project: { organizationId, archivedAt: null },
    },
    select: { projectId: true },
  })
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
      .filter((code) => policy.hasAtomicPermission(profile.role.code, [code], code)),
    assignedProjectIds: [...new Set(assignments.map(({ projectId }) => projectId))],
  }
}
