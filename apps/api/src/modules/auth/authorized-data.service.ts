import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { readApplicationProfile } from './application-profile.service'
import {
  type AtomicPermission,
  aggregateOnlyRoles,
  hasAtomicPermission,
} from './authorization-policy'
import { type ApplicationIdentity, UUID_PATTERN } from './developer-access'

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

@Injectable()
export class AuthorizedDataService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async authorized<T>(
    identity: ApplicationIdentity,
    permission: AtomicPermission,
    work: (tx: Prisma.TransactionClient, profile: ApplicationIdentity) => Promise<T>,
  ) {
    if (!identity || identity.aal !== 'aal2') throw new ForbiddenException('Verified MFA required.')
    try {
      return await this.prisma.withVerifiedContext(
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
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error
      throw new ForbiddenException('Application scope could not be verified.')
    }
  }

  projects(identity: ApplicationIdentity) {
    return this.authorized(identity, 'projects.read', (tx, profile) =>
      tx.project.findMany({
        where: projectScope(profile),
        select: { id: true, code: true, title: true, status: true },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    )
  }

  private async requireProject(
    tx: Prisma.TransactionClient,
    profile: ApplicationIdentity,
    projectId: string,
  ) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(profile), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  beneficiaries(identity: ApplicationIdentity, projectId: string) {
    return this.authorized(identity, 'beneficiaries.records.read', async (tx, profile) => {
      if (aggregateOnlyRoles.includes(profile.roles[0]))
        throw new ForbiddenException('Aggregate access only.')
      const id = await this.requireProject(tx, profile, projectId)
      return tx.beneficiaryProjectEnrollment.findMany({
        where: {
          organizationId: profile.organizationId,
          projectId: id,
          beneficiary: { organizationId: profile.organizationId, archivedAt: null },
        },
        select: {
          id: true,
          projectId: true,
          status: true,
          beneficiary: { select: { id: true, code: true, firstName: true, lastName: true } },
        },
        orderBy: { id: 'asc' },
        take: 100,
      })
    })
  }

  beneficiaryAggregate(identity: ApplicationIdentity, projectId: string) {
    return this.authorized(identity, 'beneficiaries.aggregates.read', async (tx, profile) => {
      const id = await this.requireProject(tx, profile, projectId)
      // SQL COUNT in the database: no names, IDs, rows or raw records are fetched
      // then hidden in JavaScript. No client-supplied filters/dimensions.
      const enrollmentCount = await tx.beneficiaryProjectEnrollment.count({
        where: {
          organizationId: profile.organizationId,
          projectId: id,
          beneficiary: { organizationId: profile.organizationId, archivedAt: null },
        },
      })
      return { projectId: id, enrollmentCount }
    })
  }
}
