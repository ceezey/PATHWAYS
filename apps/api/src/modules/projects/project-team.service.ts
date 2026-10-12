import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
  type CanonicalRole,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  canAssignRole,
  isCanonicalRole,
} from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

const projectTeamRoles = [
  'PROJECT_MANAGER',
  'MONITORING_AND_EVALUATION_OFFICER',
  'PROJECT_OFFICER',
] as const
type ProjectTeamRole = (typeof projectTeamRoles)[number]

export async function replaceTeamAssignments(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: CreateProjectRequest | UpdateProjectRequest,
  creating: boolean,
) {
  const actorRole = actor.roles[0]
  if (!isCanonicalRole(actorRole)) throw new ForbiddenException('Assignment authority is missing.')

  const requested = new Map<ProjectTeamRole, string[]>()
  if (input.projectManagerId !== undefined) {
    requested.set('PROJECT_MANAGER', input.projectManagerId ? [input.projectManagerId] : [])
  } else if (creating && actorRole === 'PROJECT_MANAGER') {
    requested.set('PROJECT_MANAGER', [actor.userId])
  }
  if (input.monitoringOfficerId !== undefined) {
    requested.set(
      'MONITORING_AND_EVALUATION_OFFICER',
      input.monitoringOfficerId ? [input.monitoringOfficerId] : [],
    )
  }
  if (input.projectOfficerIds !== undefined) {
    requested.set('PROJECT_OFFICER', input.projectOfficerIds)
  }
  if (requested.size === 0) return

  for (const [role, ids] of requested) {
    const normalized = [...new Set(ids.map((id) => id.toLowerCase()))]
    requested.set(role, normalized)
    const selfManagerSelection =
      actorRole === 'PROJECT_MANAGER' &&
      role === 'PROJECT_MANAGER' &&
      normalized.length === 1 &&
      normalized[0] === actor.userId.toLowerCase()
    if (!selfManagerSelection && !canAssignRole(actorRole, role as CanonicalRole)) {
      throw new ForbiddenException('Assignment authority is missing.')
    }
    if (actorRole === 'PROJECT_MANAGER' && role === 'PROJECT_MANAGER' && !selfManagerSelection) {
      throw new ForbiddenException('A Project Manager cannot transfer their own project authority.')
    }
  }

  const desiredIds = [...new Set([...requested.values()].flat())]
  const users = desiredIds.length
    ? await tx.systemUser.findMany({
        where: {
          id: { in: desiredIds },
          organizationId: actor.organizationId,
          accountStatus: 'ACTIVE',
          archivedAt: null,
          role: { code: { in: [...requested.keys()] }, isActive: true },
        },
        select: { id: true, role: { select: { code: true } } },
        take: 51,
      })
    : []
  const valid = new Set(
    users
      .filter((user) => requested.get(user.role.code as ProjectTeamRole)?.includes(user.id))
      .map((user) => user.id),
  )
  if (valid.size !== desiredIds.length) {
    throw new BadRequestException('One or more selected project team members are unavailable.')
  }

  const current = await tx.userProjectAssignment.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId,
      status: 'ACTIVE',
      endedAt: null,
      user: { role: { code: { in: [...requested.keys()] } } },
    },
    select: { id: true, userId: true, user: { select: { role: { select: { code: true } } } } },
    take: 100,
  })
  const ending = current.filter(
    (assignment) =>
      !requested.get(assignment.user.role.code as ProjectTeamRole)?.includes(assignment.userId),
  )
  if (actorRole === 'PROJECT_MANAGER' && ending.some((row) => row.userId === actor.userId)) {
    throw new ForbiddenException('A Project Manager cannot remove their own project authority.')
  }
  if (ending.length) {
    const endingIds = ending.map((assignment) => assignment.id)
    const now = new Date()
    await tx.projectActivityAssignment.updateMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        projectAssignmentId: { in: endingIds },
        status: 'ACTIVE',
      },
      data: { status: 'REMOVED', endedAt: now, endReason: 'Project team updated.' },
    })
    await tx.userProjectAssignment.updateMany({
      where: { id: { in: endingIds }, organizationId: actor.organizationId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: now, endReason: 'Project team updated.' },
    })
  }
  const existing = new Set(
    current.filter((assignment) => !ending.includes(assignment)).map((row) => row.userId),
  )
  const additions = desiredIds.filter((userId) => !existing.has(userId))
  if (additions.length) {
    await tx.userProjectAssignment.createMany({
      data: additions.map((userId) => ({
        organizationId: actor.organizationId,
        projectId,
        userId,
        assignedById: actor.userId,
      })),
    })
  }
}
