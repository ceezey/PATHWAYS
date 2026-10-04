import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ActivityExtension } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'
import type {
  DecideActivityExtensionDto,
  RequestActivityExtensionDto,
  VerifyActivityExtensionDto,
} from './activity-extensions.dto'

type Tx = Prisma.TransactionClient

const person = { select: { id: true, fullName: true } } as const
const extensionSelection = {
  id: true,
  projectId: true,
  activityId: true,
  currentEndDate: true,
  requestedEndDate: true,
  reason: true,
  status: true,
  requestedById: true,
  requestedAt: true,
  verifiedById: true,
  verifiedAt: true,
  verificationNote: true,
  decidedAt: true,
  decisionNote: true,
  clientMutationId: true,
  updatedAt: true,
  requestedBy: person,
  verifiedBy: person,
  decidedBy: person,
} as const
type ExtensionRow = Prisma.ActivityExtensionRequestGetPayload<{
  select: typeof extensionSelection
}>

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)
const named = (value: { id: string; fullName: string } | null) =>
  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null

export function mapExtension(row: ExtensionRow): ActivityExtension {
  return {
    id: row.id,
    projectId: row.projectId,
    activityId: row.activityId,
    currentEndDate: day(row.currentEndDate),
    requestedEndDate: day(row.requestedEndDate) as string,
    reason: row.reason,
    status: row.status as ActivityExtension['status'],
    requestedBy: named(row.requestedBy) as { id: string; name: string },
    requestedAt: row.requestedAt.toISOString(),
    verifiedBy: named(row.verifiedBy),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationNote: row.verificationNote,
    decidedBy: named(row.decidedBy),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    updatedAt: row.updatedAt.toISOString(),
  }
}

// Maps database refusals raised by RLS, CHECKs and unique keys to the documented HTTP codes.
function writeError(error: unknown): never {
  if (error instanceof Error && 'getStatus' in error) throw error
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const meta = (record.meta ?? {}) as Record<string, unknown>
  const code = String(meta.code ?? record.code ?? '')
  if (code === '42501')
    throw new ForbiddenException('The extension request is unavailable under your access.')
  if (['P2002', '23505', '40001'].includes(code))
    throw new ConflictException('This request changed; reload before deciding.')
  if (['22023', '23514'].includes(code)) throw new BadRequestException('Invalid extension request.')
  throw error
}

function soleRole(actor: ApplicationIdentity, role: string, permission: string) {
  if (
    actor.roles.length !== 1 ||
    actor.roles[0] !== role ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  )
    throw new ForbiddenException('This extension step is unavailable for your role.')
}

function sameInstant(expected: string, actual: Date) {
  const parsed = new Date(expected)
  if (Number.isNaN(parsed.valueOf()) || parsed.valueOf() !== actual.valueOf())
    throw new ConflictException('This request changed; reload before deciding.')
  return parsed
}

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

  private audit(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    action: string,
    entityId: string,
    changes: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId,
        action,
        entityType: 'ActivityExtensionRequest',
        entityId,
        changes,
      },
    })
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
    input: RequestActivityExtensionDto,
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
        await this.audit(
          tx,
          actor,
          activity.projectId,
          'ACTIVITY_EXTENSION_REQUESTED',
          created.id,
          {
            activityId: activity.id,
            from: currentEnd,
            to: input.requestedEndDate,
          },
        )
        return this.readBack(tx, actor, created.id)
      },
    )
  }

  verify(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    requestId: string,
    input: VerifyActivityExtensionDto,
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
      await this.audit(tx, actor, activity.projectId, `ACTIVITY_EXTENSION_${status}`, row.id, {
        activityId: activity.id,
      })
      return this.readBack(tx, actor, row.id)
    })
  }

  decide(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    requestId: string,
    input: DecideActivityExtensionDto,
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
        await this.audit(
          tx,
          actor,
          activity.projectId,
          input.decision === 'APPROVE'
            ? 'ACTIVITY_EXTENSION_APPROVED'
            : 'ACTIVITY_EXTENSION_DECLINED',
          row.id,
          { activityId: activity.id, from: day(activity.plannedEndDate), to: requestedEnd },
        )
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
    input: DecideActivityExtensionDto,
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
