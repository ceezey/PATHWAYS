import type { Prisma } from '@prisma/client'
import { DEVELOPER_AUTH_UUID } from '../src/modules/auth/developer-access'
import { assertCanonicalReferenceData } from './canonical-seed'

export const approvedOrganization = {
  name: 'Plan International Pilipinas',
  code: 'PLAN_PH',
} as const

/** Read-only final assertion. Never bootstraps or repairs a partial state. */
export async function verifyDeveloperBootstrap(tx: Prisma.TransactionClient) {
  await assertCanonicalReferenceData(tx)
  const organizations = await tx.organization.findMany()
  const profiles = await tx.systemUser.findMany({ include: { role: true } })
  const organization = organizations[0]
  const profile = profiles[0]
  if (
    organizations.length !== 1 ||
    profiles.length !== 1 ||
    organization.name !== approvedOrganization.name ||
    organization.code !== approvedOrganization.code ||
    organization.status !== 'ACTIVE' ||
    organization.archivedAt ||
    profile.authUserId !== DEVELOPER_AUTH_UUID ||
    profile.organizationId !== organization.id ||
    profile.role.code !== 'SYSTEM_ADMINISTRATOR' ||
    !profile.role.isActive ||
    profile.accountStatus !== 'ACTIVE' ||
    profile.archivedAt ||
    !profile.activatedAt ||
    profile.fullName !== 'Dev Cian'
  )
    throw new Error('Completed developer bootstrap differs.')
  return { userId: profile.id, organizationId: organization.id, authUserId: profile.authUserId }
}

/** Separate reviewed operation. Never silently adopts another organization. */
export async function bootstrapDeveloperOrganization(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(505005, 2)::text`
  await assertCanonicalReferenceData(tx)
  const organizations = await tx.organization.findMany()
  if (organizations.length === 0) {
    if ((await tx.systemUser.count()) !== 0) throw new Error('Unexpected profile state.')
    return tx.organization.create({
      data: approvedOrganization,
      select: { id: true, name: true, code: true },
    })
  }
  const organization = organizations[0]
  if (
    organizations.length !== 1 ||
    organization.name !== approvedOrganization.name ||
    organization.code !== approvedOrganization.code ||
    organization.status !== 'ACTIVE' ||
    organization.archivedAt
  ) {
    throw new Error('Organization differs from the exact approved bootstrap.')
  }
  return { id: organization.id, name: organization.name, code: organization.code }
}

/** UUID linkage only. Email is copied privately from that exact Auth row as a
 * required profile field, never used as the lookup key or printed in evidence.
 */
export async function bootstrapDeveloperAdministrator(
  tx: Prisma.TransactionClient,
  strongUniquePasswordConfirmed: boolean,
) {
  if (!strongUniquePasswordConfirmed) throw new Error('Private password confirmation is required.')
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(505005, 2)::text`
  await assertCanonicalReferenceData(tx)
  const organizations = await tx.organization.findMany()
  const organization = organizations[0]
  if (
    organizations.length !== 1 ||
    organization.code !== approvedOrganization.code ||
    organization.name !== approvedOrganization.name ||
    organization.status !== 'ACTIVE' ||
    organization.archivedAt
  ) {
    throw new Error('Reviewed organization bootstrap must be completed separately.')
  }
  const [auth] = await tx.$queryRaw<Array<{ email: string; eligible: boolean }>>`
    SELECT email, (email_confirmed_at IS NOT NULL AND NOT is_anonymous
      AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until < now())
      AND email IS NOT NULL AND btrim(email) <> ''
      AND EXISTS (SELECT FROM auth.mfa_factors f WHERE f.user_id = u.id
        AND f.factor_type = 'totp' AND f.status = 'verified')) AS eligible
    FROM auth.users u WHERE id = ${DEVELOPER_AUTH_UUID}::uuid FOR SHARE
  `
  if (!auth?.eligible)
    throw new Error('Designated Auth identity or verified MFA precondition failed.')
  const profiles = await tx.systemUser.findMany({ include: { role: true } })
  if (profiles.length) {
    const profile = profiles[0]
    if (
      profiles.length !== 1 ||
      profile.authUserId !== DEVELOPER_AUTH_UUID ||
      profile.organizationId !== organization.id ||
      profile.role.code !== 'SYSTEM_ADMINISTRATOR' ||
      profile.accountStatus !== 'ACTIVE' ||
      profile.archivedAt ||
      profile.fullName !== 'Dev Cian'
    ) {
      throw new Error('Existing profile differs; no automatic elevation or overwrite.')
    }
    return { userId: profile.id, organizationId: organization.id, authUserId: profile.authUserId }
  }
  const role = await tx.role.findUniqueOrThrow({ where: { code: 'SYSTEM_ADMINISTRATOR' } })
  const activatedAt = new Date()
  const profile = await tx.systemUser.create({
    data: {
      organizationId: organization.id,
      roleId: role.id,
      authUserId: DEVELOPER_AUTH_UUID,
      fullName: 'Dev Cian',
      email: auth.email,
      accountStatus: 'ACTIVE',
      invitedAt: activatedAt,
      activatedAt,
    },
    select: { id: true },
  })
  return { userId: profile.id, organizationId: organization.id, authUserId: DEVELOPER_AUTH_UUID }
}
