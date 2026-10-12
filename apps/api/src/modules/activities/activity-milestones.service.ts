import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import type { SaveMilestoneRequest, UpdateMilestoneRequest } from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { validateActivityDates } from './activities.helpers'

// Lists, creates and updates the milestones of one project.
@Injectable()
export class ActivityMilestonesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listMilestones(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
      return tx.projectMilestone.findMany({
        where: { organizationId: actor.organizationId, projectId: project.id, archivedAt: null },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    })
  }

  createMilestone(identity: ApplicationIdentity, projectId: string, input: SaveMilestoneRequest) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (input.targetDate) {
          validateActivityDates(input.targetDate, input.targetDate, project)
        }
        const row = await tx.projectMilestone.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'MILESTONE_CREATED',
          entityType: 'ProjectMilestone',
          entityId: row.id,
        })
        return row
      },
    )
  }

  updateMilestone(
    identity: ApplicationIdentity,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (!UUID_PATTERN.test(milestoneId)) throw new NotFoundException('Milestone unavailable.')
        if (input.targetDate) {
          validateActivityDates(input.targetDate, input.targetDate, project)
        }
        if (input.status === 'COMPLETED' && !input.completionDate) {
          throw new BadRequestException('A completed milestone requires its completion date.')
        }
        if (input.completionDate) {
          validateActivityDates(input.completionDate, input.completionDate, project)
        }
        const expected = new Date(input.expectedUpdatedAt)
        const changed = await tx.projectMilestone.updateMany({
          where: {
            id: milestoneId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: project.id,
            archivedAt: null,
            updatedAt: expected,
          },
          data: {
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
            status: input.status,
            completionDate:
              input.status === 'COMPLETED' && input.completionDate
                ? new Date(`${input.completionDate}T00:00:00.000Z`)
                : null,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Milestone changed; reload before saving.')
        const row = await tx.projectMilestone.findUniqueOrThrow({
          where: { id: milestoneId.toLowerCase() },
        })
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'MILESTONE_UPDATED',
          entityType: 'ProjectMilestone',
          entityId: row.id,
          changes: { status: row.status },
        })
        return row
      },
    )
  }
}
