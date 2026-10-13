import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { canonicalCode } from '../beneficiaries/beneficiary-registration.helpers'
import { normalizedText } from './participants.helpers'

const attendanceValues = ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'] as const
const progressValues = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'] as const

interface ParticipationFormContract {
  id: string
  version: number
  activityId: string | null
  journeyStageId: string | null
}

interface ParticipationPromotionInput {
  projectId: string
  form: ParticipationFormContract
  submissionId: string
  values: Record<string, unknown>
  validatedById: string
}

@Injectable()
export class ParticipantsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    const beneficiaryCode = canonicalCode(input.values.beneficiary_code)
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
    await writeAuditLog(tx, actor, {
      projectId: input.projectId,
      action: 'PARTICIPATION_RECORDED',
      entityType: 'BeneficiaryActivityParticipation',
      entityId: participation.id,
      changes: { submissionId: input.submissionId, activityId: activity.id },
    })
    return { participationId: participation.id, enrollmentId: enrollment.id }
  }
}
