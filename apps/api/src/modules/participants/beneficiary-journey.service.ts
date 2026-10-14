import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import {
  type CorrectJourneyEventRequest,
  type RecordJourneyEventRequest,
  aggregateOnlyRoles,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'

// Reads a beneficiary's journey and records enrollment events and corrections.
@Injectable()
export class BeneficiaryJourneyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  history(identity: ApplicationIdentity, projectId: string, beneficiaryId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'journeys.read', async (tx, actor) => {
      if (aggregateOnlyRoles.includes(actor.roles[0]))
        throw new ForbiddenException('Aggregate access only.')
      const id = await requireScopedProject(tx, actor, projectId)
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
          note: true,
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
    input: RecordJourneyEventRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        if (aggregateOnlyRoles.includes(actor.roles[0]))
          throw new ForbiddenException('Aggregate access only.')
        const id = await requireScopedProject(tx, actor, projectId)
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
          const destinationId = await requireScopedProject(tx, actor, input.destinationProjectId)
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
            note: input.note ?? null,
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
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: `ENROLLMENT_${input.eventType}`,
          entityType: 'BeneficiaryProjectEnrollment',
          entityId: enrollment.id,
          changes: {
            ...(input.eventType === 'TRANSFER'
              ? { destinationProjectId: input.destinationProjectId }
              : {}),
            noteAttached: Boolean(input.note),
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
    input: CorrectJourneyEventRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'participation.record',
      async (tx, actor) => {
        if (aggregateOnlyRoles.includes(actor.roles[0]))
          throw new ForbiddenException('Aggregate access only.')
        const id = await requireScopedProject(tx, actor, projectId)
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
            note: input.note ?? null,
            correctsEventId: original.id,
            correctionReason: input.reason.trim(),
            recordedById: actor.userId,
          },
          select: { id: true },
        })
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: 'JOURNEY_EVENT_CORRECTED',
          entityType: 'BeneficiaryJourneyEvent',
          entityId: correction.id,
          changes: {
            correctsEventId: original.id,
            reason: input.reason.trim(),
            noteAttached: Boolean(input.note),
          },
        })
        return { id: correction.id }
      },
    )
  }
}
