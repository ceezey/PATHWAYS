import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  CreateActivityExtensionRequest,
  DecideActivityExtensionRequest,
  VerifyActivityExtensionRequest,
} from '@pathways/shared'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'
import { sameInstant, soleRole, writeError } from './activity-extensions.helpers'
import {
  type ExtensionRow,
  day,
  extensionSelection,
  mapExtension,
} from './activity-extensions.mapper'

@Injectable()
export class ActivityExtensionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        activityType: true,
        timelineOverrideJustification: true,
        plannedStartDate: true,
        plannedEndDate: true,
        status: true,
        updatedAt: true,
        project: { select: { endDate: true } },
      },
    })
    if (!activity) throw new NotFoundException('Activity unavailable.')
    return activity
  }

  private async requireRequest(
    tx: Tx,
    actor: ApplicationIdentity,
    activity: { id: string; projectId: string },
    requestId: string,
  ) {
    if (!UUID_PATTERN.test(requestId)) throw new NotFoundException('Extension request unavailable.')
    const row = await tx.activityExtensionRequest.findFirst({
      where: {
        id: requestId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: activity.projectId,
        activityId: activity.id,
      },
      select: extensionSelection,
    })
    if (!row) throw new NotFoundException('Extension request unavailable.')
    return row
  }

  private readBack(tx: Tx, actor: ApplicationIdentity, id: string) {
    return tx.activityExtensionRequest
      .findFirstOrThrow({
        where: { id, organizationId: actor.organizationId },
        select: extensionSelection,
      })
      .then(mapExtension)
  }

  list(identity: ApplicationIdentity, projectId: string, activityId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      const activity = await this.requireActivity(tx, actor, projectId, activityId)
      const rows = await tx.activityExtensionRequest.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
        },
        select: extensionSelection,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: 20,
      })
      return rows.map(mapExtension)
    })
  }

  request(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: CreateActivityExtensionRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        const clientMutationId = input.clientMutationId.toLowerCase()
        const reason = input.reason.trim()
        if (reason.length < 10 || reason.length > 2000)
          throw new BadRequestException('The reason must be 10 to 2000 characters.')
        const existing = await tx.activityExtensionRequest.findFirst({
          where: { organizationId: actor.organizationId, clientMutationId },
          select: extensionSelection,
        })
        if (existing) {
          if (
            existing.activityId !== activity.id ||
            existing.requestedById !== actor.userId ||
            day(existing.requestedEndDate) !== input.requestedEndDate ||
            existing.reason !== reason
          )
            throw new ConflictException('The extension request id was reused with different input.')
          return mapExtension(existing)
        }
        if (['COMPLETED', 'CANCELLED'].includes(activity.status))
          throw new ConflictException('A finished activity cannot be extended.')
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
        const currentEnd = day(activity.plannedEndDate)
        if (currentEnd && input.requestedEndDate <= currentEnd)
          throw new BadRequestException('The new end date must be later than the current one.')
        const open = await tx.activityExtensionRequest.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: { in: ['PENDING', 'VERIFIED'] },
          },
          select: { id: true },
        })
        if (open)
          throw new ConflictException('This activity already has an open extension request.')
        const created = await tx.activityExtensionRequest
          .create({
            data: {
              organizationId: actor.organizationId,
              projectId: activity.projectId,
              activityId: activity.id,
              currentEndDate: activity.plannedEndDate,
              requestedEndDate: new Date(`${input.requestedEndDate}T00:00:00.000Z`),
              reason,
              requestedById: actor.userId,
              clientMutationId,
            },
            select: { id: true },
          })
          .catch(writeError)
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_EXTENSION_REQUESTED',
          entityType: 'ActivityExtensionRequest',
          entityId: created.id,
          changes: { activityId: activity.id, from: currentEnd, to: input.requestedEndDate },
        })
        return this.readBack(tx, actor, created.id)
      },
    )
  }

  verify(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    requestId: string,
    input: VerifyActivityExtensionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'evidence.review', async (tx, actor) => {
      soleRole(actor, 'MONITORING_AND_EVALUATION_OFFICER', 'evidence.review')
      const activity = await this.requireActivity(tx, actor, projectId, activityId)
      const row = await this.requireRequest(tx, actor, activity, requestId)
      if (row.requestedById === actor.userId)
        throw new ForbiddenException('You cannot verify your own extension request.')
      if (row.status !== 'PENDING')
        throw new ConflictException('This request changed; reload before deciding.')
      const expected = sameInstant(input.expectedUpdatedAt, row.updatedAt)
      const status = input.decision === 'VERIFY' ? 'VERIFIED' : 'RETURNED'
      const now = new Date()
      const changed = await tx.activityExtensionRequest
        .updateMany({
          where: {
            id: row.id,
            organizationId: actor.organizationId,
            status: 'PENDING',
            updatedAt: expected,
          },
          data: {
            status,
            verifiedById: actor.userId,
            verifiedAt: now,
            verificationNote: input.note.trim(),
            updatedAt: now,
          },
        })
        .catch(writeError)
      if (changed.count !== 1)
        throw new ConflictException('This request changed; reload before deciding.')
      await writeAuditLog(tx, actor, {
        projectId: activity.projectId,
        action: `ACTIVITY_EXTENSION_${status}`,
        entityType: 'ActivityExtensionRequest',
        entityId: row.id,
        changes: { activityId: activity.id },
      })
      return this.readBack(tx, actor, row.id)
    })
  }

  decide(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    requestId: string,
    input: DecideActivityExtensionRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        soleRole(actor, 'PROJECT_MANAGER', 'activities.update')
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        const row = await this.requireRequest(tx, actor, activity, requestId)
        if (row.requestedById === actor.userId || row.verifiedById === actor.userId)
          throw new ForbiddenException('The requester and verifier cannot decide this request.')
        if (row.status !== 'VERIFIED')
          throw new ConflictException('This request changed; reload before deciding.')
        const expected = sameInstant(input.expectedUpdatedAt, row.updatedAt)
        const note = input.note.trim()
        const requestedEnd = day(row.requestedEndDate) as string
        let decidedAt = new Date()
        if (input.decision === 'APPROVE') {
          decidedAt = await this.moveEndDate(tx, actor, activity, row, input)
        }
        const changed = await tx.activityExtensionRequest
          .updateMany({
            where: {
              id: row.id,
              organizationId: actor.organizationId,
              status: 'VERIFIED',
              updatedAt: expected,
            },
            data: {
              status: input.decision === 'APPROVE' ? 'APPROVED' : 'DECLINED',
              decidedById: actor.userId,
              decidedAt,
              decisionNote: note,
              updatedAt: decidedAt,
            },
          })
          .catch(writeError)
        if (changed.count !== 1)
          throw new ConflictException('This request changed; reload before deciding.')
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action:
            input.decision === 'APPROVE'
              ? 'ACTIVITY_EXTENSION_APPROVED'
              : 'ACTIVITY_EXTENSION_DECLINED',
          entityType: 'ActivityExtensionRequest',
          entityId: row.id,
          changes: {
            activityId: activity.id,
            from: day(activity.plannedEndDate),
            to: requestedEnd,
          },
        })
        return this.readBack(tx, actor, row.id)
      },
      { transactionTimeoutMs: 20_000 },
    )
  }

  // Moves the planned end date through the ACTIVITY_UPDATE rule source operation so rules re-evaluate.
  private async moveEndDate(
    tx: Tx,
    actor: ApplicationIdentity,
    activity: Awaited<ReturnType<ActivityExtensionsService['requireActivity']>>,
    row: ExtensionRow,
    input: DecideActivityExtensionRequest,
  ) {
    if (['COMPLETED', 'CANCELLED'].includes(activity.status))
      throw new ConflictException('A finished activity cannot be extended.')
    const activityExpected = sameInstant(input.activityExpectedUpdatedAt, activity.updatedAt)
    const plannedStartDate = day(activity.plannedStartDate)
    const plannedEndDate = day(row.requestedEndDate) as string
    if (!plannedStartDate) throw new ConflictException('The activity has no planned start date.')
    const projectEnd = day(activity.project.endDate)
    const existing = activity.timelineOverrideJustification?.trim() || null
    const justification =
      existing ?? (projectEnd && plannedEndDate > projectEnd ? row.reason.trim() : null)
    const assignees = await tx.projectActivityAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: activity.projectId,
        activityId: activity.id,
        status: 'ACTIVE',
        endedAt: null,
      },
      select: { projectAssignment: { select: { userId: true } } },
      take: 50,
    })
    const body = sourceMutationBody({
      title: activity.title,
      description: activity.description,
      activityType: activity.activityType,
      plannedStartDate,
      plannedEndDate,
      assignedUserIds: assignees.map((entry) => entry.projectAssignment.userId),
      expectedUpdatedAt: input.activityExpectedUpdatedAt,
      ...(justification && !existing ? { timelineOverrideJustification: justification } : {}),
    })
    const source = await beginRuleSourceOperation(
      tx,
      'ACTIVITY_UPDATE',
      activity.projectId,
      activity.id,
      { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
      body,
    )
    if (source.kind === 'REPLAY')
      throw new ConflictException('This request changed; reload before deciding.')
    const timestamp = new Date(source.generatedValues.timestamp)
    const moved = await tx.projectActivity.updateMany({
      where: { id: activity.id, organizationId: actor.organizationId, updatedAt: activityExpected },
      data: {
        plannedEndDate: new Date(`${plannedEndDate}T00:00:00.000Z`),
        timelineOverrideJustification: justification,
        updatedAt: timestamp,
      },
    })
    if (moved.count !== 1) throw new ConflictException('Activity changed; reload before deciding.')
    await finishRuleSourceOperation(tx, source.operationHandle, input.clientMutationId)
    return timestamp
  }
}
