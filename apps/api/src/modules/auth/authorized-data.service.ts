import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { aggregateOnlyRoles } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import { PrismaService } from '../../prisma/prisma.service'
import { withAuthorizedOperation } from './authorized-operation'
@Injectable()
export class AuthorizedDataService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  projects(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', (tx, profile) =>
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
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, profile) => {
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
      },
    )
  }

  beneficiaryAggregate(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.aggregates.read',
      async (tx, profile) => {
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
      },
    )
  }
}
