import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { isCanonicalRole } from './authorization-policy'
import { type ApplicationIdentity, UUID_PATTERN } from './developer-access'

/** Re-read inside each business transaction; never authorize from cached roles. */
export async function readApplicationProfile(
  transaction: Prisma.TransactionClient,
  authSubject: string,
  organizationId: string,
  userId: string,
): Promise<ApplicationIdentity> {
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
  if (!profile || !isCanonicalRole(profile.role.code)) {
    throw new ForbiddenException('No active application profile.')
  }
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
    fullName: profile.fullName,
    roles: [profile.role.code],
    permissions: profile.role.rolePermissions.map(({ permission }) => permission.code),
    assignedProjectIds: [...new Set(assignments.map(({ projectId }) => projectId))],
  }
}

@Injectable()
export class ApplicationProfileService {
  private readonly logger = new Logger(ApplicationProfileService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(
    authSubject: string,
    organizationSelector: unknown,
    userSelector: unknown,
  ): Promise<ApplicationIdentity> {
    if (
      typeof organizationSelector !== 'string' ||
      typeof userSelector !== 'string' ||
      !UUID_PATTERN.test(organizationSelector) ||
      !UUID_PATTERN.test(userSelector)
    ) {
      throw new ForbiddenException('A provisioned application context is required.')
    }
    const organizationId = organizationSelector.toLowerCase()
    const userId = userSelector.toLowerCase()
    try {
      // Headers are untrusted selectors ONLY. Immutable 0005 RLS checks all three
      // identifiers against the active database linkage before allowing any read.
      return await this.prisma.withVerifiedContext(
        { authSubject, organizationId, userId },
        (transaction) => readApplicationProfile(transaction, authSubject, organizationId, userId),
      )
    } catch (error) {
      // Fixed diagnostics only: never serialize provider errors, SQL, headers,
      // selectors, JWTs or connection settings into logs or public responses.
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : ''
      this.logger.warn({
        event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
        reason: /^P\d{4}$/.test(code) ? code : 'CONTEXT_OR_PROFILE_UNAVAILABLE',
      })
      if (code === 'P2028' || code === 'P2024') {
        throw new ServiceUnavailableException(
          'Application access verification is temporarily unavailable. Retry shortly.',
        )
      }
      throw new ForbiddenException(
        'Application access is unavailable for this identity and context.',
      )
    }
  }
}
