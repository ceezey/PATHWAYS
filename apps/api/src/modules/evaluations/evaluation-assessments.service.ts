import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  aggregateOnlyRoles,
  enrollmentAssessmentsQuery,
  hasAtomicPermission,
  recordAssessmentRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { projectIdSchema } from './evaluations.helpers'

// Locked auth RFC: System Administrator is denied assessment/survey detail and
// Program/Grant Managers are aggregate-only, independent of any stored grant.
const assessmentDetailDeniedRoles = new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])

// Reads one assessment result, with its beneficiary only for a reader of beneficiary records.
export async function readAssessmentDetail(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  assessmentId: string,
) {
  if (assessmentDetailDeniedRoles.has(actor.roles[0]))
    throw new ForbiddenException('Assessment detail is not available to this role.')
  const id = await requireScopedProject(tx, actor, projectId)
  const parsed = projectIdSchema.safeParse(assessmentId)
  if (!parsed.success) throw new NotFoundException('Assessment unavailable.')
  const includeBeneficiary = hasAtomicPermission(
    actor.roles[0],
    actor.permissions,
    'beneficiaries.records.read',
  )
  const row = await tx.assessmentResult.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      id: parsed.data,
      project: projectScope(actor),
    },
    select: {
      id: true,
      projectId: true,
      activityId: true,
      enrollmentId: true,
      type: true,
      score: true,
      maximumScore: true,
      assessmentDate: true,
      recordedAt: true,
      ...(includeBeneficiary
        ? {
            enrollment: {
              select: {
                id: true,
                beneficiary: {
                  select: { id: true, code: true, archivedAt: true },
                },
              },
            },
          }
        : {}),
    },
  })
  if (!row) throw new NotFoundException('Assessment unavailable.')
  const linked = (
    row as {
      enrollment?: {
        beneficiary: { id: string; code: string; archivedAt: Date | null }
      } | null
    }
  ).enrollment?.beneficiary
  const beneficiary =
    includeBeneficiary && linked && !linked.archivedAt
      ? {
          id: linked.id,
          code: linked.code,
        }
      : null
  return {
    id: row.id,
    projectId: row.projectId,
    activityId: row.activityId,
    enrollmentId: includeBeneficiary ? row.enrollmentId : null,
    type: row.type,
    score: row.score.toString(),
    maximumScore: row.maximumScore.toString(),
    assessmentDate: row.assessmentDate.toISOString().slice(0, 10),
    recordedAt: row.recordedAt.toISOString(),
    beneficiary,
  }
}

// Lists the assessment results of one enrollment in date order, at most 100.
export async function listEnrollmentAssessments(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  query: unknown,
) {
  if (assessmentDetailDeniedRoles.has(actor.roles[0]))
    throw new ForbiddenException('Assessment detail is not available to this role.')
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read'))
    throw new ForbiddenException('Assessment detail is not available to this role.')
  const id = await requireScopedProject(tx, actor, projectId)
  const parsed = enrollmentAssessmentsQuery.safeParse(query)
  if (!parsed.success) throw new NotFoundException('Enrollment unavailable.')
  const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
    where: {
      id: parsed.data.enrollmentId,
      organizationId: actor.organizationId,
      projectId: id,
      beneficiary: { organizationId: actor.organizationId, archivedAt: null },
    },
    select: { id: true },
  })
  if (!enrollment) throw new NotFoundException('Enrollment unavailable.')
  const rows = await tx.assessmentResult.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      enrollmentId: enrollment.id,
      project: projectScope(actor),
    },
    orderBy: [{ assessmentDate: 'asc' }, { id: 'asc' }],
    take: 100,
    select: {
      id: true,
      type: true,
      activityId: true,
      score: true,
      maximumScore: true,
      assessmentDate: true,
      recordedAt: true,
      activity: {
        select: {
          activityJourneyStageMapping_activity: {
            select: { stageId: true },
            orderBy: [{ sequenceOrder: 'asc' }, { stageId: 'asc' }],
            take: 1,
          },
        },
      },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    activityId: row.activityId,
    stageId: row.activity?.activityJourneyStageMapping_activity[0]?.stageId ?? null,
    score: row.score.toString(),
    maximumScore: row.maximumScore.toString(),
    assessmentDate: row.assessmentDate.toISOString().slice(0, 10),
    recordedAt: row.recordedAt.toISOString(),
  }))
}

// Records one pre or post test score, sourced from the enrollment's validated attendance for the stage.
export async function recordEnrollmentAssessment(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: unknown,
): Promise<{ id: string }> {
  if (assessmentDetailDeniedRoles.has(actor.roles[0]))
    throw new ForbiddenException('Assessment recording is not available to this role.')
  const parsed = recordAssessmentRequest.safeParse(input)
  if (!parsed.success) throw new BadRequestException('Supply a valid assessment score and date.')
  const body = parsed.data
  if (body.assessmentDate > currentBusinessDate())
    throw new BadRequestException('The assessment date cannot be in the future.')
  const id = await requireScopedProject(tx, actor, projectId)
  const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
    where: {
      id: body.enrollmentId,
      organizationId: actor.organizationId,
      projectId: id,
      beneficiary: { organizationId: actor.organizationId, archivedAt: null },
    },
    select: { id: true },
  })
  if (!enrollment) throw new NotFoundException('Enrollment unavailable.')
  const direction = body.type === 'PRE_TEST' ? 'asc' : 'desc'
  const attendance = await tx.beneficiaryActivityParticipation.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: id,
      enrollmentId: enrollment.id,
      activityId: body.activityId,
      sourceSubmission: {
        status: { in: ['VALIDATED', 'PROCESSED'] },
        isDummyRecord: false,
      },
    },
    orderBy: [{ participationDate: direction }, { id: direction }],
    select: { sourceSubmissionId: true },
  })
  if (!attendance)
    throw new BadRequestException('Record participation for this stage before recording a score.')
  const created = await tx.assessmentResult.create({
    data: {
      organizationId: actor.organizationId,
      projectId: id,
      activityId: body.activityId,
      enrollmentId: enrollment.id,
      sourceSubmissionId: attendance.sourceSubmissionId,
      type: body.type,
      score: body.score,
      maximumScore: body.maximumScore,
      assessmentDate: new Date(`${body.assessmentDate}T00:00:00.000Z`),
      recordedById: actor.userId,
    },
    select: { id: true },
  })
  await writeAuditLog(tx, actor, {
    projectId: id,
    action: 'ASSESSMENT_RECORD',
    entityType: 'AssessmentResult',
    entityId: created.id,
    changes: {
      type: body.type,
      enrollmentId: enrollment.id,
      activityId: body.activityId,
    },
  })
  return { id: created.id }
}
