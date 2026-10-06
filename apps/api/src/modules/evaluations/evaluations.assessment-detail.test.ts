import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
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
    if (
      !scope.bypass &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, permission as never)
    )
      throw new ForbiddenException()
    return work(scope.tx, actor)
  },
}))

const organizationId = '30000000-0000-4000-8000-000000000003'
const otherOrganizationId = '30000000-0000-4000-8000-000000000009'
const projectId = '10000000-0000-4000-8000-000000000001'
const unassignedProjectId = '10000000-0000-4000-8000-000000000002'
const assessmentId = '40000000-0000-4000-8000-000000000004'
const userId = '20000000-0000-4000-8000-000000000002'
const officer = {
  id: userId,
  organizationId,
  userId,
  aal: 'aal2',
  fullName: 'Fictional officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['assessments.detail.read', 'beneficiaries.records.read'],
  assignedProjectIds: [projectId],
} as ApplicationIdentity
const row = {
  id: assessmentId,
  projectId,
  activityId: null,
  enrollmentId: '50000000-0000-4000-8000-000000000005',
  type: 'POST_TEST',
  score: new Prisma.Decimal('42.5'),
  maximumScore: new Prisma.Decimal('50'),
  assessmentDate: new Date('2026-09-01T00:00:00.000Z'),
  recordedAt: new Date('2026-09-02T03:04:05.000Z'),
  enrollment: {
    id: '50000000-0000-4000-8000-000000000005',
    beneficiary: {
      id: '60000000-0000-4000-8000-000000000006',
      code: 'BEN-0001',
      archivedAt: null,
    },
  },
}
const tx = {
  project: { findFirst: vi.fn() },
  assessmentResult: { findFirst: vi.fn() },
}
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)
const read = (projectKey = projectId, id = assessmentId) =>
  Promise.resolve().then(() => service.getAssessmentDetail(officer, projectKey, id))

describe('assessment detail read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = officer
    scope.bypass = false
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.assessmentResult.findFirst.mockResolvedValue(row)
  })

  it('requires Beneficiary step-up on the detail handler', () => {
    const handler = EvaluationsController.prototype.assessment
    expect(Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, handler)).toBe(true)
  })

  it('returns scoped detail with the Beneficiary link for an assigned project role', async () => {
    expect(await read()).toEqual({
      id: assessmentId,
      projectId,
      activityId: null,
      enrollmentId: row.enrollmentId,
      type: 'POST_TEST',
      score: '42.5',
      maximumScore: '50',
      assessmentDate: '2026-09-01',
      recordedAt: '2026-09-02T03:04:05.000Z',
      beneficiary: { id: row.enrollment.beneficiary.id, code: 'BEN-0001' },
    })
    const projectWhere = tx.project.findFirst.mock.calls[0][0].where
    expect(projectWhere.AND[0]).toMatchObject({
      organizationId,
      id: { in: [projectId] },
    })
    const query = tx.assessmentResult.findFirst.mock.calls[0][0]
    expect(query.where).toMatchObject({
      organizationId,
      projectId,
      id: assessmentId,
    })
    expect(query.where.project).toMatchObject({
      organizationId,
      id: { in: [projectId] },
    })
    expect(query.select.enrollment.select.beneficiary.select).not.toHaveProperty('firstName')
  })

  it('omits Beneficiary linkage when the role lacks record read', async () => {
    scope.actor = { ...officer, permissions: ['assessments.detail.read'] }
    tx.assessmentResult.findFirst.mockResolvedValue({
      ...row,
      enrollment: undefined,
    })
    const result = await read()
    expect(result.beneficiary).toBeNull()
    expect(result.enrollmentId).toBeNull()
    expect(tx.assessmentResult.findFirst.mock.calls[0][0].select).not.toHaveProperty('enrollment')
  })

  it('returns not found for an invalid or missing assessment', async () => {
    await expect(read(projectId, 'not-a-uuid')).rejects.toThrow(NotFoundException)
    tx.assessmentResult.findFirst.mockResolvedValue(null)
    await expect(read()).rejects.toThrow(NotFoundException)
  })

  it.each(['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'denies %s before any query, even with a forged grant',
    async (role) => {
      scope.actor = {
        ...officer,
        roles: [role],
        permissions: ['assessments.detail.read'],
      }
      scope.bypass = true
      await expect(read()).rejects.toThrow('Assessment detail is not available to this role.')
      expect(tx.project.findFirst).not.toHaveBeenCalled()
      expect(tx.assessmentResult.findFirst).not.toHaveBeenCalled()
    },
  )

  it('denies a cross-organization assessment through server-derived scope', async () => {
    scope.actor = { ...officer, organizationId: otherOrganizationId }
    tx.project.findFirst.mockResolvedValue(null)
    await expect(read()).rejects.toThrow(NotFoundException)
    expect(tx.project.findFirst.mock.calls[0][0].where.AND[0].organizationId).toBe(
      otherOrganizationId,
    )
    expect(tx.assessmentResult.findFirst).not.toHaveBeenCalled()
  })

  it('denies an unassigned project before retrieving the assessment', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(read(unassignedProjectId)).rejects.toThrow(NotFoundException)
    expect(tx.project.findFirst.mock.calls[0][0].where.AND[0].id).toEqual({
      in: [projectId],
    })
    expect(tx.assessmentResult.findFirst).not.toHaveBeenCalled()
  })
})
