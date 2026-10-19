import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import type { EvaluationMetricsService } from './evaluation-metrics.service'
import { EvaluationsController } from './evaluations.controller'
import { EvaluationsService } from './evaluations.service'

const scope = vi.hoisted(() => ({
  actor: undefined as unknown,
  tx: undefined as unknown,
  bypass: false,
}))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: (
    _db: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = scope.actor as ApplicationIdentity
    // The bypass lets a test prove the service refusal, not the permission mock, stops the call.
    if (
      !scope.bypass &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, permission as never)
    )
      throw new ForbiddenException()
    return work(scope.tx, actor)
  },
}))
vi.mock('../../common/audit/write-audit-log', () => ({
  writeAuditLog: vi.fn(),
}))
vi.mock('../../common/time/business-date', () => ({
  currentBusinessDate: () => '2026-09-30',
}))

const organizationId = '30000000-0000-4000-8000-000000000003'
const projectId = '10000000-0000-4000-8000-000000000001'
const enrollmentId = '50000000-0000-4000-8000-000000000005'
const activityId = '80000000-0000-4000-8000-000000000008'
const sourceSubmissionId = '90000000-0000-4000-8000-000000000009'
const resultId = '40000000-0000-4000-8000-000000000004'
const officer = {
  id: '20000000-0000-4000-8000-000000000002',
  organizationId,
  userId: '20000000-0000-4000-8000-000000000002',
  aal: 'aal2',
  fullName: 'Fictional officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['assessments.record'],
  assignedProjectIds: [projectId],
} as ApplicationIdentity
const tx = {
  project: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
  beneficiaryActivityParticipation: { findFirst: vi.fn() },
  assessmentResult: { create: vi.fn() },
}
const body = {
  enrollmentId,
  activityId,
  type: 'POST_TEST',
  score: '72',
  assessmentDate: '2026-09-01',
}
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)
const record = (input: unknown = body, key = projectId) =>
  Promise.resolve().then(() => service.recordBeneficiaryAssessment(officer, key, input))

describe('record beneficiary assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = officer
    scope.bypass = false
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({
      id: enrollmentId,
    })
    tx.beneficiaryActivityParticipation.findFirst.mockResolvedValue({
      sourceSubmissionId,
    })
    tx.assessmentResult.create.mockResolvedValue({ id: resultId })
  })

  it('requires the record permission and Beneficiary step-up', () => {
    const handler = EvaluationsController.prototype.recordAssessment
    expect(Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, handler)).toBe(true)
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('assessments.record')
  })

  it('records a post-test sourced from the latest validated attendance', async () => {
    await expect(record()).resolves.toEqual({ id: resultId })
    const query = tx.beneficiaryActivityParticipation.findFirst.mock.calls[0][0]
    expect(query.where).toMatchObject({
      organizationId,
      projectId,
      enrollmentId,
      activityId,
      sourceSubmission: {
        status: { in: ['VALIDATED', 'PROCESSED'] },
        isDummyRecord: false,
      },
    })
    expect(query.orderBy).toEqual([{ participationDate: 'desc' }, { id: 'desc' }])
    expect(tx.assessmentResult.create.mock.calls[0][0].data).toMatchObject({
      organizationId,
      projectId,
      type: 'POST_TEST',
      sourceSubmissionId,
      recordedById: officer.userId,
      activityId,
      enrollmentId,
      score: '72',
      maximumScore: '100',
    })
  })

  it('records a pre-test sourced from the earliest validated attendance', async () => {
    await record({ ...body, type: 'PRE_TEST' })
    const query = tx.beneficiaryActivityParticipation.findFirst.mock.calls[0][0]
    expect(query.orderBy).toEqual([{ participationDate: 'asc' }, { id: 'asc' }])
    expect(tx.assessmentResult.create.mock.calls[0][0].data.type).toBe('PRE_TEST')
  })

  it('refuses without validated attendance', async () => {
    tx.beneficiaryActivityParticipation.findFirst.mockResolvedValue(null)
    await expect(record()).rejects.toThrow(
      'Record participation for this stage before recording a score.',
    )
    expect(tx.assessmentResult.create).not.toHaveBeenCalled()
  })

  it.each(['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'refuses %s before any query, even with a forged grant',
    async (role) => {
      scope.actor = { ...officer, roles: [role] }
      scope.bypass = true
      await expect(record()).rejects.toThrow(ForbiddenException)
      expect(tx.project.findFirst).not.toHaveBeenCalled()
      expect(tx.assessmentResult.create).not.toHaveBeenCalled()
    },
  )

  it('refuses an enrollment outside the project', async () => {
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    await expect(record()).rejects.toThrow(new NotFoundException('Enrollment unavailable.'))
    expect(tx.beneficiaryProjectEnrollment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: enrollmentId,
      organizationId,
      projectId,
    })
    expect(tx.assessmentResult.create).not.toHaveBeenCalled()
  })

  it('refuses a future date and a score above the maximum', async () => {
    await expect(record({ ...body, assessmentDate: '2026-10-01' })).rejects.toThrow(
      BadRequestException,
    )
    await expect(record({ ...body, score: '101' })).rejects.toThrow(BadRequestException)
    expect(tx.assessmentResult.create).not.toHaveBeenCalled()
  })

  it('writes an audit entry without scores', async () => {
    await record()
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      officer,
      expect.objectContaining({
        projectId,
        action: 'ASSESSMENT_RECORD',
        entityType: 'AssessmentResult',
        entityId: resultId,
        changes: { type: 'POST_TEST', enrollmentId, activityId },
      }),
    )
  })
})
