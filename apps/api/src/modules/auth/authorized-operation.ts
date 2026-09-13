import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import type { PrismaService } from '@app/prisma/prisma.service'
import { readApplicationProfile } from './application-profile.service'
import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'
import type { ApplicationIdentity } from './developer-access'

export async function withAuthorizedOperation<T>(
  prisma: PrismaService,
  identity: ApplicationIdentity,
  permission: AtomicPermission,
  work: (tx: Prisma.TransactionClient, profile: ApplicationIdentity) => Promise<T>,
) {
  if (!identity || identity.aal !== 'aal2') throw new ForbiddenException('Verified MFA required.')
  try {
    return await prisma.withVerifiedContext(
      {
        authSubject: identity.id,
        organizationId: identity.organizationId,
        userId: identity.userId,
      },
      async (tx) => {
        const profile = await readApplicationProfile(
          tx,
          identity.id,
          identity.organizationId,
          identity.userId,
        )
        if (!hasAtomicPermission(profile.roles[0], profile.permissions, permission)) {
          throw new ForbiddenException('Required application permission is missing.')
        }
        return work(tx, profile)
      },
    )
  } catch (error) {
    if (error instanceof HttpException) throw error
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null
    if (code === 'P2002') {
      throw new ConflictException('A record with that stable or idempotency key already exists.')
    }
    if (code === 'P2034') {
      throw new ConflictException('A concurrent change was detected; retry the request.')
    }
    throw new ForbiddenException('Application scope could not be verified.')
  }
}
