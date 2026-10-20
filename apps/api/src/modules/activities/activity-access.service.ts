import { ForbiddenException, NotFoundException } from '@nestjs/common'

import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { activitySelection, personalAssignmentCount } from './activities.mapper'

/**
 * Reads one activity of a project already verified by `requireScopedProjectRow` in this same
 * transaction. Post-write read-backs use it so project scope is not resolved twice.
 */
export async function readScopedActivity(
  tx: Tx,
  actor: ApplicationIdentity,
  verifiedProjectId: string,
  activityId: string,
) {
  if (!UUID_PATTERN.test(activityId)) throw new NotFoundException('Activity unavailable.')
  const activity = await tx.projectActivity.findFirst({
    relationLoadStrategy: 'join',
    where: {
      id: activityId.toLowerCase(),
      organizationId: actor.organizationId,
      projectId: verifiedProjectId,
      archivedAt: null,
    },
    select: { ...activitySelection, ...personalAssignmentCount(actor) },
  })
  if (!activity) throw new NotFoundException('Activity unavailable.')
  return activity
}

export async function requireProjectActivity(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityId: string,
) {
  const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
  const activity = await readScopedActivity(tx, actor, project.id, activityId)
  return { project, activity }
}

export async function requireActivity(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityId: string,
) {
  return (await requireProjectActivity(tx, actor, projectId, activityId)).activity
}

export async function requireActiveAssignment(
  tx: Tx,
  actor: ApplicationIdentity,
  activity: { id: string; projectId: string },
) {
  const assigned = await tx.projectActivityAssignment.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: activity.projectId,
      activityId: activity.id,
      status: 'ACTIVE',
      endedAt: null,
      projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
    },
    select: { id: true },
  })
  if (!assigned) throw new ForbiddenException('An active activity assignment is required.')
}
