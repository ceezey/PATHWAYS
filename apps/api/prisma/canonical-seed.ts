import type { Prisma } from '@prisma/client'
import {
  isCanonicalRole,
  permissionCodes,
  roleNames,
  rolePermissions,
} from '../src/modules/auth/authorization-policy'

/** Internal implementation; caller must guard target and open a transaction.
 * Existing exact data is untouched, including IDs/timestamps. Drift fails closed.
 * No profile, organization, Auth, Storage or other business write is permitted.
 */
export async function seedCanonicalReferenceData(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(505005, 1)::text`
  const existingRoles = await tx.role.findMany()
  const existingPermissions = await tx.permission.findMany()
  const existingMappings = await tx.rolePermission.findMany({
    include: { role: { select: { code: true } }, permission: { select: { code: true } } },
  })
  for (const role of existingRoles) {
    if (!isCanonicalRole(role.code) || role.name !== roleNames[role.code] || !role.isActive) {
      throw new Error('Canonical role drift; no repair is automatic.')
    }
  }
  for (const permission of existingPermissions) {
    if (
      !permissionCodes.some((code) => code === permission.code) ||
      permission.name !== permission.code ||
      !permission.isActive
    ) {
      throw new Error('Canonical permission drift; no repair is automatic.')
    }
  }
  for (const mapping of existingMappings) {
    if (
      !isCanonicalRole(mapping.role.code) ||
      !rolePermissions[mapping.role.code].some((code) => code === mapping.permission.code)
    ) {
      throw new Error('Unexpected role-permission mapping; no deletion is automatic.')
    }
  }
  const missingRoles = Object.entries(roleNames)
    .filter(([code]) => !existingRoles.some((role) => role.code === code))
    .map(([code, name]) => ({ code, name }))
  const missingPermissions = permissionCodes
    .filter((code) => !existingPermissions.some((permission) => permission.code === code))
    .map((code) => ({ code, name: code }))
  if (missingRoles.length) await tx.role.createMany({ data: missingRoles })
  if (missingPermissions.length) await tx.permission.createMany({ data: missingPermissions })
  const roles = await tx.role.findMany()
  const permissions = await tx.permission.findMany()
  const missingMappings: { roleId: string; permissionId: string }[] = []
  for (const role of roles) {
    if (!isCanonicalRole(role.code)) throw new Error('Unexpected role.')
    for (const code of rolePermissions[role.code]) {
      const permission = permissions.find((item) => item.code === code)
      if (!permission) throw new Error('Missing canonical permission.')
      if (
        !existingMappings.some(
          (mapping) => mapping.roleId === role.id && mapping.permissionId === permission.id,
        )
      ) {
        missingMappings.push({ roleId: role.id, permissionId: permission.id })
      }
    }
  }
  if (missingMappings.length) await tx.rolePermission.createMany({ data: missingMappings })
  return {
    roles: roles.length,
    permissions: permissions.length,
    mappings: await tx.rolePermission.count(),
  }
}

export async function assertCanonicalReferenceData(tx: Prisma.TransactionClient) {
  const roles = await tx.role.findMany({
    include: {
      rolePermissions: { include: { permission: true } },
    },
  })
  if (roles.length !== 6 || (await tx.permission.count()) !== permissionCodes.length) {
    throw new Error('Canonical reference count differs.')
  }
  for (const role of roles) {
    if (!isCanonicalRole(role.code) || !role.isActive || role.name !== roleNames[role.code]) {
      throw new Error('Canonical role differs.')
    }
    const expected = [...rolePermissions[role.code]].sort()
    const actual = role.rolePermissions
      .map(({ permission }) => {
        if (!permission.isActive || permission.name !== permission.code)
          throw new Error('Permission differs.')
        return permission.code
      })
      .sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new Error('Canonical mapping differs.')
  }
}
