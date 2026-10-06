import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsController } from './evaluations.controller'
import { EvaluationsService } from './evaluations.service'

const scope = vi.hoisted(() => ({
  actor: undefined as unknown,
  tx: undefined as unknown,
  bypass: false,
}))
vi.mock('../auth/authorized-operation', () => ({
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

const organizationId = '30000000-0000-4000-8000-000000000003'
const projectId = '10000000-0000-4000-8000-000000000001'
const enrollmentId = '50000000-0000-4000-8000-000000000005'
const stageId = '70000000-0000-4000-8000-000000000007'
const officer = {
  id: '20000000-0000-4000-8000-000000000002',
  organizationId,
  userId: '20000000-0000-4000-8000-000000000002',
  aal: 'aal2',
  fullName: 'Fictional officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['assessments.detail.read', 'beneficiaries.records.read'],
  assignedProjectIds: [projectId],
} as ApplicationIdentity
const row = (n: number, type = 'PRE_TEST') => ({
  id: `40000000-0000-4000-8000-00000000000${n}`,
  type,
  activityId: '80000000-0000-4000-8000-000000000008',
  score: new Prisma.Decimal('42.5'),
  maximumScore: new Prisma.Decimal('50'),
  assessmentDate: new Date('2026-09-01T00:00:00.000Z'),
  recordedAt: new Date('2026-09-02T03:04:05.000Z'),
  activity: { activityJourneyStageMapping_activity: [{ stageId }] },
})
const tx = {
  project: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
  assessmentResult: { findMany: vi.fn() },
}
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)
const list = (id: unknown = enrollmentId, projectKey = projectId) =>
  Promise.resolve().then(() =>
    service.listBeneficiaryAssessments(officer, projectKey, { enrollmentId: id }),
  )

describe('beneficiary assessment list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = officer
    scope.bypass = false
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({ id: enrollmentId })
    tx.assessmentResult.findMany.mockResolvedValue([row(1), row(2, 'POST_TEST')])
  })

  it('requires the detail permission and Beneficiary step-up', () => {
    const handler = EvaluationsController.prototype.beneficiaryAssessments
    expect(Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, handler)).toBe(true)
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('assessments.detail.read')
  })

  it('returns scoped rows with the mapped stage and no personal fields', async () => {
    const result = await list()
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({
      id: row(2).id,
      type: 'POST_TEST',
      activityId: row(2).activityId,
      stageId,
      score: '42.5',
      maximumScore: '50',
      assessmentDate: '2026-09-01',
      recordedAt: '2026-09-02T03:04:05.000Z',
    })
    expect(tx.beneficiaryProjectEnrollment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: enrollmentId,
      organizationId,
      projectId,
    })
    const query = tx.assessmentResult.findMany.mock.calls[0][0]
    expect(query.where).toMatchObject({ organizationId, projectId, enrollmentId })
    expect(query.where.project).toMatchObject({ organizationId, id: { in: [projectId] } })
    expect(query.take).toBe(100)
    expect(query.orderBy).toEqual([{ assessmentDate: 'asc' }, { id: 'asc' }])
    expect(query.select).not.toHaveProperty('enrollment')
    expect(query.select).not.toHaveProperty('sourceSubmission')
  })

  it('returns a null stage for an unmapped or missing activity', async () => {
    tx.assessmentResult.findMany.mockResolvedValue([{ ...row(1), activity: null }])
    expect((await list())[0].stageId).toBeNull()
  })

  it('returns not found for a bad or foreign enrollment', async () => {
    await expect(list('not-a-uuid')).rejects.toThrow(NotFoundException)
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    await expect(list()).rejects.toThrow(NotFoundException)
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
  })

  it('returns not found for an unassigned or cross-organization project', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(list()).rejects.toThrow(NotFoundException)
    expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
  })

  it.each(['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'denies %s before any query, even with a forged grant',
    async (role) => {
      scope.actor = { ...officer, roles: [role] }
      scope.bypass = true
      await expect(list()).rejects.toThrow('Assessment detail is not available to this role.')
      expect(tx.project.findFirst).not.toHaveBeenCalled()
      expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    },
  )

  it('refuses a holder of only the detail grant before any query', async () => {
    scope.actor = { ...officer, permissions: ['assessments.detail.read'] }
    await expect(list()).rejects.toThrow(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
  })

  it('looks up only live Beneficiaries of the organization', async () => {
    await list()
    expect(tx.beneficiaryProjectEnrollment.findFirst.mock.calls[0][0].where.beneficiary).toEqual({
      organizationId,
      archivedAt: null,
    })
  })

  it('denies a role without the permission', async () => {
    scope.actor = { ...officer, permissions: [] }
    await expect(list()).rejects.toThrow(ForbiddenException)
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
  })
})
