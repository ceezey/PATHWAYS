import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { CreateActivityEscalation, DecideActivityEscalation } from '@pathways/shared'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { requireActiveAssignment } from '../activities/activity-access.service'
import { STALE, sameInstant, soleRole, writeError } from './activity-escalations.helpers'
import { escalationSelection, mapEscalation } from './activity-escalations.mapper'

type Step = 'FORWARD' | 'RESOLVE' | 'PROGRAM_RESOLVE'

@Injectable()
export class ActivityEscalationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Reads only the activity columns aggregate roles may see; escalation never writes the activity.
  private async requireActivity(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
  ) {
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(activityId))
      throw new NotFoundException('Activity unavailable.')
    const activity = await tx.projectActivity.findFirst({
      where: {
        id: activityId.toLowerCase(),
        projectId: projectId.toLowerCase(),
        organizationId: actor.organizationId,
        archivedAt: null,
        project: projectScope(actor),
      },
      select: { id: true, projectId: true, status: true },
    })
    if (!activity) throw new NotFoundException('Activity unavailable.')
    return activity
  }

  private async requireEscalation(
    tx: Tx,
    actor: ApplicationIdentity,
    activity: { id: string; projectId: string },
    escalationId: string,
  ) {
    if (!UUID_PATTERN.test(escalationId)) throw new NotFoundException('Escalation unavailable.')
    const row = await tx.activityEscalation.findFirst({
      where: {
        id: escalationId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: activity.projectId,
        activityId: activity.id,
      },
      select: escalationSelection,
    })
    if (!row) throw new NotFoundException('Escalation unavailable.')
    return row
  }

  private readBack(tx: Tx, actor: ApplicationIdentity, id: string) {
    return tx.activityEscalation
      .findFirstOrThrow({
        where: { id, organizationId: actor.organizationId },
        select: escalationSelection,
      })
      .then(mapEscalation)
  }

  list(identity: ApplicationIdentity, projectId: string, activityId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.escalations.read',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        const rows = await tx.activityEscalation.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
          },
          select: escalationSelection,
          orderBy: [{ raisedAt: 'desc' }, { id: 'desc' }],
          take: 20,
        })
        return rows.map(mapEscalation)
      },
    )
  }

  raise(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: CreateActivityEscalation,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.escalations.raise',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        const clientMutationId = input.clientMutationId.toLowerCase()
        const reason = input.reason.trim()
        if (reason.length < 10 || reason.length > 2000)
          throw new BadRequestException('The reason must be 10 to 2000 characters.')
        const existing = await tx.activityEscalation.findFirst({
          where: { organizationId: actor.organizationId, clientMutationId },
          select: escalationSelection,
        })
        if (existing) {
          if (
            existing.activityId !== activity.id ||
            existing.raisedById !== actor.userId ||
            existing.reason !== reason
          )
            throw new ConflictException('The escalation id was reused with different input.')
          return mapEscalation(existing)
        }
        if (['COMPLETED', 'CANCELLED'].includes(activity.status))
          throw new ConflictException('A finished activity cannot be escalated.')
        if (actor.roles[0] === 'PROJECT_OFFICER') await requireActiveAssignment(tx, actor, activity)
        const open = await tx.activityEscalation.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: { in: ['OPEN', 'FORWARDED'] },
          },
          select: { id: true },
        })
        if (open) throw new ConflictException('This activity already has an open escalation.')
        const created = await tx.activityEscalation
          .create({
            data: {
              organizationId: actor.organizationId,
              projectId: activity.projectId,
              activityId: activity.id,
              reason,
              raisedById: actor.userId,
              clientMutationId,
            },
            select: { id: true },
          })
          .catch(writeError)
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_ESCALATION_RAISED',
          entityType: 'ActivityEscalation',
          entityId: created.id,
          changes: { activityId: activity.id },
        })
        return this.readBack(tx, actor, created.id)
      },
    )
  }

  forward(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    escalationId: string,
    input: DecideActivityEscalation,
  ) {
    return this.step('FORWARD', identity, projectId, activityId, escalationId, input)
  }

  resolve(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    escalationId: string,
    input: DecideActivityEscalation,
  ) {
    return this.step('RESOLVE', identity, projectId, activityId, escalationId, input)
  }

  programResolve(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    escalationId: string,
    input: DecideActivityEscalation,
  ) {
    return this.step('PROGRAM_RESOLVE', identity, projectId, activityId, escalationId, input)
  }

  // One tier transition; the activity row and rule sources are never touched.
  private step(
    step: Step,
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    escalationId: string,
    input: DecideActivityEscalation,
  ) {
    const program = step === 'PROGRAM_RESOLVE'
    const permission = program ? 'activities.escalations.read' : 'activities.update'
    return withAuthorizedOperation(this.prisma, identity, permission, async (tx, actor) => {
      soleRole(actor, program ? 'PROGRAM_MANAGER' : 'PROJECT_MANAGER', permission)
      const activity = await this.requireActivity(tx, actor, projectId, activityId)
      const row = await this.requireEscalation(tx, actor, activity, escalationId)
      if (step === 'RESOLVE' && row.raisedById === actor.userId)
        throw new ForbiddenException('You cannot resolve an escalation you raised.')
      if (program && (row.raisedById === actor.userId || row.forwardedById === actor.userId))
        throw new ForbiddenException('The raiser and forwarder cannot resolve this escalation.')
      const from = program ? 'FORWARDED' : 'OPEN'
      if (row.status !== from) throw new ConflictException(STALE)
      const expected = sameInstant(input.expectedUpdatedAt, row.updatedAt)
      const note = input.note.trim()
      const now = new Date()
      const data =
        step === 'FORWARD'
          ? {
              status: 'FORWARDED',
              forwardedById: actor.userId,
              forwardedAt: now,
              forwardNote: note,
            }
          : {
              status: 'RESOLVED',
              resolvedById: actor.userId,
              resolvedAt: now,
              resolutionNote: note,
              resolutionLevel: program ? 'PROGRAM' : 'PROJECT',
            }
      const changed = await tx.activityEscalation
        .updateMany({
          where: {
            id: row.id,
            organizationId: actor.organizationId,
            status: from,
            updatedAt: expected,
          },
          data: { ...data, updatedAt: now },
        })
        .catch(writeError)
      if (changed.count !== 1) throw new ConflictException(STALE)
      await writeAuditLog(tx, actor, {
        projectId: activity.projectId,
        action:
          step === 'FORWARD' ? 'ACTIVITY_ESCALATION_FORWARDED' : 'ACTIVITY_ESCALATION_RESOLVED',
        entityType: 'ActivityEscalation',
        entityId: row.id,
        changes:
          step === 'FORWARD'
            ? { activityId: activity.id }
            : { activityId: activity.id, level: program ? 'PROGRAM' : 'PROJECT' },
      })
      return this.readBack(tx, actor, row.id)
    })
  }
}
