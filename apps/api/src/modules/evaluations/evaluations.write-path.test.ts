import { type BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import { provisionCriteria } from './evaluation-criteria-template'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsService } from './evaluations.service'

const scope = vi.hoisted(() => ({ actor: undefined as unknown, tx: undefined as unknown }))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: (
    _db: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = scope.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission as never))
      throw new ForbiddenException()
    return work(scope.tx, actor)
  },
}))
vi.mock('./evaluation-criteria-template', () => ({ provisionCriteria: vi.fn() }))
const projectId = '10000000-0000-4000-8000-000000000001'
const criterionId = '20000000-0000-4000-8000-000000000002'
const organizationId = '30000000-0000-4000-8000-000000000003'
const evaluationId = '50000000-0000-4000-8000-000000000005'
const secondCriterionId = '60000000-0000-4000-8000-000000000006'
const updatedAt = new Date('2026-09-27T00:00:00.000Z')
const evaluator = {
  id: criterionId,
  organizationId,
  userId: criterionId,
  aal: 'aal2',
  fullName: 'Fictional evaluator',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['monitoring.read', 'evaluations.submit', 'evaluations.weights.configure'],
  assignedProjectIds: [projectId],
} as ApplicationIdentity
const tx = {
  project: { findFirst: vi.fn() },
  projectEvaluation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  projectEvaluationCriterion: { findMany: vi.fn(), count: vi.fn() },
  projectEvaluationScore: { findMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
  auditLog: { create: vi.fn() },
}
const computeMany = vi.fn()
const service = new EvaluationsService(
  {} as PrismaService,
  {
    computeMany,
  } as unknown as EvaluationMetricsService,
)

const dec = (value: number) => new Prisma.Decimal(value)
const detailRow = (overrides: Record<string, unknown> = {}) => ({
  id: evaluationId,
  title: 'Mid-term',
  periodLabel: null,
  periodStart: new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T00:00:00.000Z'),
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt,
  evaluatedBy: null,
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  evaluatedById: criterionId,
  ...overrides,
})
const snapshot = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  code: 'REL',
  version: 1,
  type: 'OTHER',
  name: 'Relevance',
  description: null,
  weight_percentage: 60,
  maximum_score: 100,
  ...extra,
})
const scoreRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  evaluationId,
  criterionId: id,
  score: dec(80),
  maximumScore: dec(100),
  weightedScore: dec(48),
  commentary: 'Judged against the plan.',
  criterionSnapshot: snapshot(id),
  ...overrides,
})

describe('evaluation detail contract, history bounds and idempotent start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = evaluator
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([])
    tx.projectEvaluationCriterion.count.mockResolvedValue(1)
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
    tx.projectEvaluation.findMany.mockResolvedValue([])
    tx.projectEvaluation.findFirst.mockResolvedValue(null)
    tx.projectEvaluation.count.mockResolvedValue(0)
    tx.projectEvaluation.create.mockResolvedValue({ id: evaluationId })
    tx.$queryRaw.mockResolvedValue([])
    tx.auditLog.create.mockResolvedValue({})
  })

  it('returns only allowlisted snapshot keys with numbers as strings and a safe fallback', async () => {
    tx.projectEvaluation.findMany.mockResolvedValue([detailRow()])
    tx.projectEvaluationScore.findMany.mockResolvedValue([
      scoreRow(criterionId, {
        criterionSnapshot: snapshot(criterionId, { beneficiaryId: 'leak', createdBy: 'x' }),
      }),
      scoreRow(secondCriterionId, { criterionSnapshot: { code: 5 } }),
    ])
    const [row] = (await service.get(evaluator, projectId)).evaluations
    expect(row?.scores[0]?.criterion).toEqual({
      id: criterionId,
      code: 'REL',
      version: 1,
      type: 'OTHER',
      name: 'Relevance',
      description: null,
      weight_percentage: '60',
      maximum_score: '100',
    })
    expect(row?.scores[1]?.criterion).toMatchObject({
      id: secondCriterionId,
      name: 'Criterion unavailable',
      maximum_score: '100',
    })
    expect(row?.scores[0]?.source).toBe('manual')
  })

  it('reads the newest 20 evaluations and all their scores once, reporting hasMore', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      detailRow({ id: `50000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}` }),
    )
    tx.projectEvaluation.findMany.mockResolvedValue(rows)
    const result = await service.get(evaluator, projectId)
    expect(result.evaluations).toHaveLength(20)
    expect(result.hasMore).toBe(true)
    expect(tx.projectEvaluation.findMany.mock.calls[0][0].take).toBe(21)
    expect(tx.projectEvaluationScore.findMany).toHaveBeenCalledOnce()
  })

  const start = {
    clientRequestId: criterionId,
    title: 'Mid-term',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
  }
  it('refuses to start a 21st evaluation', async () => {
    tx.projectEvaluation.count.mockResolvedValue(20)
    await expect(service.createEvaluation(evaluator, projectId, start)).rejects.toThrow(
      '20 evaluations',
    )
    expect(tx.projectEvaluation.create).not.toHaveBeenCalled()
  })

  it('returns the actor open round when the same start is retried', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    const result = await service.createEvaluation(evaluator, projectId, start)
    expect(result.id).toBe(evaluationId)
    expect(tx.projectEvaluation.create).not.toHaveBeenCalled()
  })

  it('keeps the conflict for a different open round or another creator', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow({ title: 'Other round' }))
    await expect(service.createEvaluation(evaluator, projectId, start)).rejects.toThrow(
      'already open',
    )
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow({ evaluatedById: projectId }))
    await expect(service.createEvaluation(evaluator, projectId, start)).rejects.toThrow(
      'already open',
    )
  })
})

describe('automatic scoring', () => {
  const criteria = [
    { id: criterionId, type: 'KPI', maximumScore: dec(100) },
    { id: secondCriterionId, type: 'ASSESSMENT_GAIN', maximumScore: dec(100) },
  ]
  const computed = new Map([
    [criterionId, { score: '94.0000', commentary: 'KPI achievement 94%' }],
    [secondCriterionId, { score: '0.0000', commentary: 'No data: no paired pre/post assessments' }],
  ])
  const start = {
    clientRequestId: criterionId,
    title: 'Mid-term',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
  }
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = evaluator
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId, targetBeneficiaries: 10 })
    tx.projectEvaluation.findFirst.mockResolvedValue(null)
    tx.projectEvaluation.findMany.mockResolvedValue([])
    tx.projectEvaluation.count.mockResolvedValue(0)
    tx.projectEvaluation.create.mockResolvedValue({ id: evaluationId })
    tx.projectEvaluation.updateMany.mockResolvedValue({ count: 1 })
    tx.projectEvaluationCriterion.findMany.mockResolvedValue(criteria)
    tx.projectEvaluationCriterion.count.mockResolvedValue(2)
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
    tx.projectEvaluationScore.upsert.mockResolvedValue({})
    tx.auditLog.create.mockResolvedValue({})
    computeMany.mockResolvedValue(computed)
  })

  it('provisions the criteria and scores every one when a round starts', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValueOnce(null).mockResolvedValue(detailRow())
    await service.createEvaluation(evaluator, projectId, start)
    expect(provisionCriteria).toHaveBeenCalledOnce()
    expect(computeMany.mock.calls[0][3]).toEqual({ start: '2026-01-01', end: '2026-06-30' })
    expect(tx.projectEvaluationScore.upsert).toHaveBeenCalledTimes(2)
    expect(tx.projectEvaluationScore.upsert.mock.calls[1][0].create).toMatchObject({
      score: '0.0000',
      commentary: 'No data: no paired pre/post assessments',
    })
  })

  it('does not provision for a retried start of the open round', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    await service.createEvaluation(evaluator, projectId, start)
    expect(provisionCriteria).not.toHaveBeenCalled()
    expect(tx.projectEvaluationScore.upsert).not.toHaveBeenCalled()
  })

  it('recomputes all scores and claims the draft with a guarded update', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    await service.saveScores(evaluator, projectId, evaluationId, {
      expectedUpdatedAt: updatedAt.toISOString(),
      commentary: 'Narrative',
    })
    const claim = tx.projectEvaluation.updateMany.mock.calls[0][0]
    expect(claim.where).toMatchObject({ id: evaluationId, status: 'DRAFT', updatedAt })
    expect(claim.data).toMatchObject({ commentary: 'Narrative' })
    expect(tx.projectEvaluationScore.upsert).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale recompute with 409 and writes nothing', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    tx.projectEvaluation.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.saveScores(evaluator, projectId, evaluationId, {
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toThrow('changed')
    expect(tx.projectEvaluationScore.upsert).not.toHaveBeenCalled()
  })

  it('refuses to recompute a round that is no longer a draft', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow({ status: 'SUBMITTED' }))
    await expect(
      service.saveScores(evaluator, projectId, evaluationId, {
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toThrow('draft')
  })

  it('refreshes the scores before submitting', async () => {
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    tx.projectEvaluationScore.count.mockResolvedValue(2)
    await service.submit(evaluator, projectId, evaluationId, {
      expectedUpdatedAt: updatedAt.toISOString(),
    })
    expect(computeMany).toHaveBeenCalledOnce()
    expect(tx.projectEvaluationScore.upsert).toHaveBeenCalledTimes(2)
    expect(tx.projectEvaluation.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'SUBMITTED',
    })
  })

  it('exposes the source, evidence and no-data reason of each stored score', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([])
    tx.projectEvaluation.findMany.mockResolvedValue([detailRow()])
    tx.projectEvaluationScore.findMany.mockResolvedValue([
      scoreRow(criterionId, {
        commentary: 'KPI achievement 94%',
        criterionSnapshot: snapshot(criterionId, { type: 'KPI' }),
      }),
      scoreRow(secondCriterionId, {
        score: dec(0),
        commentary: 'No data: no paired pre/post assessments',
        criterionSnapshot: snapshot(secondCriterionId, { type: 'ASSESSMENT_GAIN' }),
      }),
    ])
    const [row] = (await service.get(evaluator, projectId)).evaluations
    expect(row?.scores[0]).toMatchObject({
      source: 'computed',
      evidence: 'KPI achievement 94%',
      reason: null,
      note: null,
    })
    expect(row?.scores[1]).toMatchObject({
      source: 'no_data',
      evidence: null,
      reason: 'no paired pre/post assessments',
    })
  })
})

describe('returning an evaluation', () => {
  it('records the reason in its own field and leaves the commentary alone', async () => {
    const approver = {
      ...evaluator,
      roles: ['PROJECT_MANAGER'],
      permissions: ['monitoring.read', 'evaluations.approve'],
    } as ApplicationIdentity
    scope.actor = approver
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow({ status: 'SUBMITTED' }))
    tx.projectEvaluation.updateMany.mockResolvedValue({ count: 1 })
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
    await service.returnToDraft(approver, projectId, evaluationId, {
      expectedUpdatedAt: updatedAt.toISOString(),
      reason: 'Check the scores.',
    })
    const data = tx.projectEvaluation.updateMany.mock.calls.at(-1)?.[0].data
    expect(data).toMatchObject({ status: 'DRAFT', returnReason: 'Check the scores.' })
    expect(data).not.toHaveProperty('commentary')
  })
})
