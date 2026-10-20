import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

export async function resolveAssignments(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  userIds: string[],
) {
  const ids = userIds.map((id) => id.toLowerCase())
  const assignments = await tx.userProjectAssignment.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId,
      userId: { in: ids },
      status: 'ACTIVE',
      endedAt: null,
      user: {
        accountStatus: 'ACTIVE',
        archivedAt: null,
        role: { code: 'PROJECT_OFFICER', isActive: true },
      },
    },
    select: { id: true, userId: true },
    take: 50,
  })
  if (
    assignments.length !== ids.length ||
    new Set(assignments.map((row) => row.userId)).size !== ids.length
  ) {
    throw new BadRequestException(
      'Every activity assignee must be an active Project Officer assigned to this project.',
    )
  }
  return assignments
}

export async function resolveIndicators(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  indicatorIds: string[] | undefined,
) {
  if (indicatorIds === undefined) return undefined
  const ids = indicatorIds.map((id) => id.toLowerCase())
  if (ids.length === 0) return []
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'indicators.update')) {
    throw new ForbiddenException('Indicator-link authority is missing.')
  }
  const rows = await tx.projectIndicator.findMany({
    where: {
      id: { in: ids },
      organizationId: actor.organizationId,
      projectId,
      archivedAt: null,
    },
    select: { id: true },
    take: 101,
  })
  if (rows.length !== ids.length || new Set(rows.map((row) => row.id)).size !== ids.length) {
    throw new BadRequestException('Every connected indicator must belong to this project.')
  }
  return ids
}

export async function resolveJourneyStage(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  journeyStageId: string | null | undefined,
) {
  if (journeyStageId === undefined || journeyStageId === null) return journeyStageId
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'journeys.read')) {
    throw new ForbiddenException('Journey-stage link authority is missing.')
  }
  const id = journeyStageId.toLowerCase()
  const stage = await tx.journeyStage.findFirst({
    where: { id, organizationId: actor.organizationId, projectId, archivedAt: null },
    select: { id: true },
  })
  if (!stage)
    throw new BadRequestException('The selected journey stage must belong to this project.')
  return stage.id
}

export async function replaceActivityLinks(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityId: string,
  indicatorIds: string[] | undefined,
  journeyStageId: string | null | undefined,
) {
  if (indicatorIds !== undefined) {
    await tx.activityIndicatorLink.deleteMany({
      where: { organizationId: actor.organizationId, projectId, activityId },
    })
    if (indicatorIds.length) {
      await tx.activityIndicatorLink.createMany({
        data: indicatorIds.map((indicatorId) => ({
          organizationId: actor.organizationId,
          projectId,
          activityId,
          indicatorId,
          createdById: actor.userId,
        })),
      })
    }
  }
  if (journeyStageId !== undefined) {
    await tx.activityJourneyStageMapping.deleteMany({
      where: { organizationId: actor.organizationId, projectId, activityId },
    })
    if (journeyStageId) {
      await tx.activityJourneyStageMapping.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          activityId,
          stageId: journeyStageId,
          sequenceOrder: 1,
          createdById: actor.userId,
        },
      })
    }
  }
}
