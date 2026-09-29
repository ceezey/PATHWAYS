import { randomUUID } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { aggregateOnlyRoles, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import type { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'
import { normalizedCode, normalizedText } from './participants.dto'

type Tx = Prisma.TransactionClient
const attendanceValues = ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'] as const
const progressValues = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'] as const

export interface ParticipationFormContract {
  id: string
  version: number
  activityId: string | null
  journeyStageId: string | null
}

export interface ParticipationPromotionInput {
  projectId: string
  form: ParticipationFormContract
  submissionId: string
  values: Record<string, unknown>
  validatedById: string
}

const stageSelection = {
  id: true,
  projectId: true,
  code: true,
  name: true,
  stageOrder: true,
  stageType: true,
  parentStageId: true,
  isTerminal: true,
  description: true,
  archivedAt: true,
  updatedAt: true,
  activityJourneyStageMapping_stage: {
    select: { activityId: true },
    orderBy: { sequenceOrder: 'asc' as const },
    take: 100,
  },
} satisfies Prisma.JourneyStageSelect

function mapStage(stage: Prisma.JourneyStageGetPayload<{ select: typeof stageSelection }>) {
  return {
    id: stage.id,
    projectId: stage.projectId,
    code: stage.code,
    name: stage.name,
    order: stage.stageOrder,
    type: { ENTRY: 'Entry', CORE: 'Core', BRANCH: 'Branch', FOLLOW_UP: 'Follow-Up' }[
      stage.stageType
    ],
    parentStageId: stage.parentStageId ?? undefined,
    terminal: stage.isTerminal,
    mappedActivityIds: stage.activityJourneyStageMapping_stage.map((mapping) => mapping.activityId),
    description: stage.description ?? '',
    archived: Boolean(stage.archivedAt),
    updatedAt: stage.updatedAt.toISOString(),
  }
}

@Injectable()
export class ParticipantsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  listStages(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'journeys.read', async (tx, actor) => {
      const id = await this.requireProject(tx, actor, projectId)
      const stages = await tx.journeyStage.findMany({
        where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
        select: stageSelection,
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      return stages.map(mapStage)
    })
  }

  saveStages(
    identity: ApplicationIdentity,
    projectId: string,
    input: {
      stages: Array<{
        id?: string
        code: string
        name: string
        order: number
        type: 'ENTRY' | 'CORE' | 'BRANCH' | 'FOLLOW_UP'
        parentStageId?: string
        terminal?: boolean
        description?: string
        mappedActivityIds: string[]
        expectedUpdatedAt?: string
      }>
    },
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'journeys.manage', async (tx, actor) => {
      const id = await this.requireProject(tx, actor, projectId)
      await tx.$queryRaw`SELECT id FROM pathways.projects WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`
      const current = await tx.journeyStage.findMany({
        where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
        select: stageSelection,
        orderBy: { id: 'asc' },
        take: 100,
      })
      const inUse = hasAtomicPermission(
        actor.roles[0],
        actor.permissions,
        'beneficiaries.records.read',
      )
        ? await tx.beneficiaryJourneyEvent.count({
            where: { organizationId: actor.organizationId, projectId: id },
          })
        : (
            await tx.$queryRaw<Array<{ inUse: boolean }>>`
            SELECT pathways.p10_journey_has_events(${id}::uuid) AS "inUse"
          `
          )[0].inUse
      const ids = input.stages.map((stage) => stage.id ?? randomUUID())
      if (
        new Set(ids).size !== ids.length ||
        new Set(input.stages.map((stage) => stage.code)).size !== input.stages.length ||
        new Set(input.stages.map((stage) => stage.order)).size !== input.stages.length
      ) {
        throw new ConflictException('Stage identifiers, codes, and order values must be unique.')
      }
      const knownIds = new Set(ids)
      for (const [index, stage] of input.stages.entries()) {
        if (
          stage.parentStageId &&
          (!knownIds.has(stage.parentStageId) || stage.parentStageId === ids[index])
        ) {
          throw new ConflictException(
            'Every parent stage must be another stage in this project configuration.',
          )
        }
        const parent = stage.parentStageId ? input.stages[ids.indexOf(stage.parentStageId)] : null
        if (parent && (parent.order >= stage.order || parent.terminal)) {
          throw new ConflictException(
            'A parent stage must precede its child and cannot be terminal.',
          )
        }
      }
      const activityIds = [
        ...new Set(
          input.stages
            .flatMap((stage) => stage.mappedActivityIds)
            .map((value) => value.toLowerCase()),
        ),
      ]
      if (activityIds.some((value) => !UUID_PATTERN.test(value)))
        throw new NotFoundException('Mapped activity unavailable.')
      const activities = await tx.projectActivity.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: id,
          id: { in: activityIds },
          archivedAt: null,
        },
        select: { id: true },
        take: 100,
      })
      if (activities.length !== activityIds.length)
        throw new NotFoundException('Mapped activity unavailable.')

      if (inUse) {
        const desired = input.stages
          .map((stage, index) => ({
            id: ids[index],
            code: stage.code,
            name: stage.name,
            order: stage.order,
            type: stage.type,
            parentStageId: stage.parentStageId ?? null,
            terminal: Boolean(stage.terminal),
            description: stage.description?.trim() || '',
            mappedActivityIds: [...stage.mappedActivityIds].sort(),
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
        const stored = current
          .map((stage) => ({
            id: stage.id,
            code: stage.code,
            name: stage.name,
            order: stage.stageOrder,
            type: stage.stageType,
            parentStageId: stage.parentStageId,
            terminal: stage.isTerminal,
            description: stage.description ?? '',
            mappedActivityIds: stage.activityJourneyStageMapping_stage
              .map((mapping) => mapping.activityId)
              .sort(),
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
        if (JSON.stringify(desired) !== JSON.stringify(stored))
          throw new ConflictException(
            'Journey configuration is frozen after its first recorded event.',
          )
        return current.map(mapStage)
      }

      for (const stage of current)
        await tx.journeyStage.update({ where: { id: stage.id }, data: { parentStageId: null } })
      for (const [index, stage] of current.entries())
        await tx.journeyStage.update({
          where: { id: stage.id },
          data: { stageOrder: 10000 + index },
        })
      const existingIds = new Set(current.map((stage) => stage.id))
      for (const [index, stage] of input.stages.entries()) {
        const stageId = ids[index]
        if (existingIds.has(stageId)) {
          const stored = current.find((item) => item.id === stageId)
          if (!stored) throw new ConflictException('Stage changed; reload before saving.')
          const expected = stage.expectedUpdatedAt ? new Date(stage.expectedUpdatedAt) : null
          if (!expected || expected.valueOf() !== stored.updatedAt.valueOf())
            throw new ConflictException('Stage changed; reload before saving.')
          await tx.journeyStage.update({
            where: { id: stageId },
            data: {
              code: stage.code,
              name: stage.name.trim(),
              stageOrder: stage.order,
              stageType: stage.type,
              isTerminal: Boolean(stage.terminal),
              description: stage.description?.trim() || null,
            },
          })
        } else {
          await tx.journeyStage.create({
            data: {
              id: stageId,
              organizationId: actor.organizationId,
              projectId: id,
              code: stage.code,
              name: stage.name.trim(),
              stageOrder: stage.order,
              stageType: stage.type,
              isTerminal: Boolean(stage.terminal),
              description: stage.description?.trim() || null,
              createdById: actor.userId,
            },
          })
        }
      }
      for (const [index, stage] of input.stages.entries())
        if (stage.parentStageId)
          await tx.journeyStage.update({
            where: { id: ids[index] },
            data: { parentStageId: stage.parentStageId },
          })
      const removed = current.filter((stage) => !knownIds.has(stage.id))
      for (const stage of removed)
        await tx.journeyStage.update({ where: { id: stage.id }, data: { archivedAt: new Date() } })
      await tx.activityJourneyStageMapping.deleteMany({
        where: { organizationId: actor.organizationId, projectId: id },
      })
      const mappings = input.stages.flatMap((stage, stageIndex) =>
        stage.mappedActivityIds.map((activityId, sequenceOrder) => ({
          organizationId: actor.organizationId,
          projectId: id,
          activityId: activityId.toLowerCase(),
          stageId: ids[stageIndex],
          sequenceOrder: sequenceOrder + 1,
          createdById: actor.userId,
        })),
      )
      if (mappings.length) await tx.activityJourneyStageMapping.createMany({ data: mappings })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: id,
          action: 'JOURNEY_CONFIGURATION_SAVED',
          entityType: 'Project',
          entityId: id,
          changes: { stageCount: input.stages.length, mappingCount: mappings.length },
        },
      })
      const result = await tx.journeyStage.findMany({
        where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
        select: stageSelection,
        orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      return result.map(mapStage)
    })
  }

  async promoteParticipation(
    tx: Tx,
    actor: ApplicationIdentity,
    input: ParticipationPromotionInput,
  ) {
    if (!actor.permissions.includes('participation.record')) {
      throw new ForbiddenException('Participation recording permission is required.')
    }
    const existing = await tx.beneficiaryActivityParticipation.findUnique({
      where: { sourceSubmissionId: input.submissionId },
      select: { id: true, enrollmentId: true },
    })
    if (existing) return { participationId: existing.id, enrollmentId: existing.enrollmentId }
    if (!input.form.activityId)
      throw new ConflictException('Activity-monitoring forms must be bound to one activity.')
    if (!input.form.journeyStageId)
      throw new ConflictException('Activity-monitoring forms must be bound to one journey stage.')
    const beneficiaryCode = normalizedCode(input.values.beneficiary_code)
    const participationDate =
      typeof input.values.participation_date === 'string' ? input.values.participation_date : null
    const attendanceStatus =
      typeof input.values.attendance_status === 'string' ? input.values.attendance_status : null
    const progressStatus =
      typeof input.values.progress_status === 'string' ? input.values.progress_status : null
    if (
      !beneficiaryCode ||
      !participationDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(participationDate) ||
      !attendanceValues.includes(attendanceStatus as never) ||
      !progressValues.includes(progressStatus as never)
    )
      throw new ConflictException(
        'Participation form requires valid beneficiary_code, participation_date, attendance_status, and progress_status fields.',
      )
    const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        status: 'ACTIVE',
        beneficiary: { code: beneficiaryCode, archivedAt: null },
      },
      select: { id: true },
    })
    if (!enrollment)
      throw new ConflictException(
        'An active enrollment with the exact Beneficiary code is required.',
      )
    const activity = await tx.projectActivity.findFirst({
      where: {
        id: input.form.activityId,
        organizationId: actor.organizationId,
        projectId: input.projectId,
        archivedAt: null,
        status: { notIn: ['CANCELLED'] },
      },
      select: { id: true },
    })
    if (!activity) throw new ConflictException('The form activity is unavailable in this project.')
    const mapping = await tx.activityJourneyStageMapping.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        activityId: activity.id,
        stageId: input.form.journeyStageId,
      },
      select: { id: true },
    })
    if (!mapping) throw new ConflictException('The form stage is not mapped to its activity.')
    const date = new Date(`${participationDate}T00:00:00.000Z`)
    const last = await tx.beneficiaryJourneyEvent.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        enrollmentId: enrollment.id,
      },
      select: { eventDate: true },
      orderBy: [{ eventDate: 'desc' }, { recordedAt: 'desc' }],
    })
    if (last && last.eventDate > date)
      throw new ConflictException('Participation cannot precede the latest journey event.')
    const participation = await tx.beneficiaryActivityParticipation.create({
      data: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        enrollmentId: enrollment.id,
        activityId: activity.id,
        attendanceStatus: attendanceStatus as (typeof attendanceValues)[number],
        participationDate: date,
        progressStatus: progressStatus as (typeof progressValues)[number],
        progressNotes: normalizedText(input.values.progress_notes),
        sourceSubmissionId: input.submissionId,
        recordedById: actor.userId,
      },
      select: { id: true },
    })
    await tx.beneficiaryJourneyEvent.create({
      data: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        enrollmentId: enrollment.id,
        activityId: activity.id,
        stageId: input.form.journeyStageId,
        participationId: participation.id,
        eventType:
          progressStatus === 'COMPLETED'
            ? 'COMPLETION'
            : progressStatus === 'NEEDS_FOLLOW_UP'
              ? 'FOLLOW_UP'
              : 'PARTICIPATION',
        eventDate: date,
        description: normalizedText(input.values.progress_notes),
        recordedById: actor.userId,
      },
    })
    const now = new Date()
    await tx.formSubmission.update({
      where: { id: input.submissionId },
      data: {
        enrollmentId: enrollment.id,
        status: 'VALIDATED',
        submittedAt: now,
        validatedById: input.validatedById,
        validatedAt: now,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId: input.projectId,
        action: 'PARTICIPATION_RECORDED',
        entityType: 'BeneficiaryActivityParticipation',
        entityId: participation.id,
        changes: { submissionId: input.submissionId, activityId: activity.id },
      },
    })
    return { participationId: participation.id, enrollmentId: enrollment.id }
  }

  history(identity: ApplicationIdentity, projectId: string, beneficiaryId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'journeys.read', async (tx, actor) => {
      if (aggregateOnlyRoles.includes(actor.roles[0]))
        throw new ForbiddenException('Aggregate access only.')
      const id = await this.requireProject(tx, actor, projectId)
      if (!UUID_PATTERN.test(beneficiaryId))
        throw new NotFoundException('Beneficiary history unavailable.')
      const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId: id,
          beneficiaryId: beneficiaryId.toLowerCase(),
        },
        select: { id: true, status: true },
      })
      if (!enrollment) throw new NotFoundException('Beneficiary history unavailable.')
      const events = await tx.beneficiaryJourneyEvent.findMany({
        where: { organizationId: actor.organizationId, projectId: id, enrollmentId: enrollment.id },
        select: {
          id: true,
          eventType: true,
          eventDate: true,
          description: true,
          stageId: true,
          stageCodeSnapshot: true,
          stageNameSnapshot: true,
          activityId: true,
          activityCodeSnapshot: true,
          activityTitleSnapshot: true,
          participationId: true,
          participation: { select: { attendanceStatus: true, progressStatus: true } },
          correctsEventId: true,
          correctionReason: true,
          recordedAt: true,
          recordedBy: { select: { fullName: true } },
        },
        orderBy: [{ eventDate: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }],
        take: 500,
      })
      return {
        projectId: id,
        beneficiaryId: beneficiaryId.toLowerCase(),
        enrollmentId: enrollment.id,
        enrollmentStatus: enrollment.status,
        events: events.map((event) => ({
          ...event,
          eventDate: event.eventDate.toISOString().slice(0, 10),
          recordedAt: event.recordedAt.toISOString(),
          recordedBy: event.recordedBy.fullName,
        })),
      }
    })
  }

  transitionEnrollment(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: EnrollmentJourneyEventDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        if (aggregateOnlyRoles.includes(actor.roles[0]))
          throw new ForbiddenException('Aggregate access only.')
        const id = await this.requireProject(tx, actor, projectId)
        if (!UUID_PATTERN.test(beneficiaryId))
          throw new NotFoundException('Enrollment unavailable.')
        const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            beneficiaryId: beneficiaryId.toLowerCase(),
            status: 'ACTIVE',
          },
          select: { id: true, beneficiaryId: true },
        })
        if (!enrollment) throw new ConflictException('An active enrollment is required.')
        const date = new Date(`${input.eventDate}T00:00:00.000Z`)
        const last = await tx.beneficiaryJourneyEvent.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            enrollmentId: enrollment.id,
          },
          select: { eventDate: true },
          orderBy: [{ eventDate: 'desc' }, { recordedAt: 'desc' }],
        })
        if (last && last.eventDate > date)
          throw new ConflictException('Journey events must be chronological.')
        if (input.stageId) {
          const stage = await tx.journeyStage.findFirst({
            where: {
              id: input.stageId.toLowerCase(),
              organizationId: actor.organizationId,
              projectId: id,
              archivedAt: null,
            },
            select: { id: true },
          })
          if (!stage) throw new NotFoundException('Journey stage unavailable.')
        }
        if (input.eventType === 'TRANSFER') {
          if (!input.destinationProjectId || input.destinationProjectId.toLowerCase() === id)
            throw new ConflictException('A different destination project is required.')
          const destinationId = await this.requireProject(tx, actor, input.destinationProjectId)
          const destination = await tx.beneficiaryProjectEnrollment.findFirst({
            where: {
              organizationId: actor.organizationId,
              projectId: destinationId,
              beneficiaryId: enrollment.beneficiaryId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
          if (!destination)
            throw new ConflictException(
              'An independently authorized active destination enrollment is required before transfer.',
            )
        }
        await tx.beneficiaryJourneyEvent.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            enrollmentId: enrollment.id,
            stageId: input.stageId?.toLowerCase(),
            eventType: input.eventType,
            eventDate: date,
            description: input.description.trim(),
            recordedById: actor.userId,
          },
        })
        if (input.eventType !== 'FOLLOW_UP')
          await tx.beneficiaryProjectEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status:
                input.eventType === 'COMPLETION'
                  ? 'COMPLETED'
                  : input.eventType === 'DROPOUT'
                    ? 'DROPPED'
                    : 'TRANSFERRED',
              endedDate: date,
              endReason: input.description.trim(),
            },
          })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: id,
            action: `ENROLLMENT_${input.eventType}`,
            entityType: 'BeneficiaryProjectEnrollment',
            entityId: enrollment.id,
            changes:
              input.eventType === 'TRANSFER'
                ? { destinationProjectId: input.destinationProjectId }
                : undefined,
          },
        })
        return {
          enrollmentId: enrollment.id,
          eventType: input.eventType,
          eventDate: input.eventDate,
        }
      },
    )
  }

  correctEvent(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    eventId: string,
    input: CorrectJourneyEventDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'participation.record',
      async (tx, actor) => {
        if (aggregateOnlyRoles.includes(actor.roles[0]))
          throw new ForbiddenException('Aggregate access only.')
        const id = await this.requireProject(tx, actor, projectId)
        if (!UUID_PATTERN.test(beneficiaryId) || !UUID_PATTERN.test(eventId))
          throw new NotFoundException('Journey event unavailable.')
        const original = await tx.beneficiaryJourneyEvent.findFirst({
          where: {
            id: eventId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: id,
            enrollment: { beneficiaryId: beneficiaryId.toLowerCase() },
            correctsEventId: null,
          },
          select: { id: true, enrollmentId: true, eventType: true, activityId: true },
        })
        if (!original) throw new NotFoundException('Journey event unavailable.')
        const correction = await tx.beneficiaryJourneyEvent.create({
          data: {
            organizationId: actor.organizationId,
            projectId: id,
            enrollmentId: original.enrollmentId,
            activityId: original.activityId,
            stageId: input.stageId?.toLowerCase(),
            eventType: original.eventType,
            eventDate: new Date(`${input.eventDate}T00:00:00.000Z`),
            description: input.description.trim(),
            correctsEventId: original.id,
            correctionReason: input.reason.trim(),
            recordedById: actor.userId,
          },
          select: { id: true },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: id,
            action: 'JOURNEY_EVENT_CORRECTED',
            entityType: 'BeneficiaryJourneyEvent',
            entityId: correction.id,
            changes: { correctsEventId: original.id, reason: input.reason.trim() },
          },
        })
        return { id: correction.id }
      },
    )
  }
}
