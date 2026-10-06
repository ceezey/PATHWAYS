import { type BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
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
  permissions: ['monitoring.read', 'evaluations.submit'],
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
  projectEvaluationScore: { findMany: vi.fn(), upsert: vi.fn() },
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

describe('saving scores', () => {
  const body = (scores: unknown[], extra: Record<string, unknown> = {}) => ({
    expectedUpdatedAt: updatedAt.toISOString(),
    scores,
    ...extra,
  })
  const manual = (id: string, manualScore = 70) => ({
    criterionId: id,
    manualScore,
    note: 'Judged against the plan.',
  })
  const rejection = (call: Promise<unknown>) =>
    call.then(
      () => {
        throw new Error('Expected a rejection.')
      },
      (error: BadRequestException) => error.getResponse() as { errors: unknown[] },
    )
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = evaluator
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({
      id: projectId,
      startDate: null,
      endDate: null,
      targetBeneficiaries: null,
    })
    tx.projectEvaluation.findFirst.mockResolvedValue(detailRow())
    tx.projectEvaluation.updateMany.mockResolvedValue({ count: 1 })
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([
      { id: criterionId, type: 'OTHER', maximumScore: dec(100) },
      { id: secondCriterionId, type: 'OTHER', maximumScore: dec(100) },
    ])
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
    tx.projectEvaluationScore.upsert.mockResolvedValue({})
    tx.auditLog.create.mockResolvedValue({})
    computeMany.mockResolvedValue(new Map())
  })

  it('claims the draft with a guarded update before writing any score', async () => {
    await service.saveScores(
      evaluator,
      projectId,
      evaluationId,
      body([manual(criterionId), manual(secondCriterionId)], { commentary: 'Narrative' }),
    )
    const claim = tx.projectEvaluation.updateMany.mock.calls[0][0]
    expect(claim.where).toMatchObject({ id: evaluationId, status: 'DRAFT', updatedAt })
    expect(claim.data).toMatchObject({ commentary: 'Narrative' })
    expect(tx.projectEvaluationScore.upsert).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale save with 409 and writes nothing', async () => {
    tx.projectEvaluation.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.saveScores(evaluator, projectId, evaluationId, body([manual(criterionId)])),
    ).rejects.toThrow('changed')
    expect(tx.projectEvaluationScore.upsert).not.toHaveBeenCalled()
  })

  it('keeps saved scores for rows the request does not resupply', async () => {
    tx.projectEvaluationScore.findMany.mockResolvedValue([
      scoreRow(criterionId),
      scoreRow(secondCriterionId),
    ])
    await service.saveScores(evaluator, projectId, evaluationId, body([manual(criterionId, 90)]))
    expect(tx.projectEvaluationScore.upsert).toHaveBeenCalledOnce()
    expect(tx.projectEvaluationScore.upsert.mock.calls[0][0].update).toMatchObject({
      score: '90.0000',
    })
  })

  it('lists every criterion that still needs a manual score and why', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([
      { id: criterionId, type: 'OTHER', maximumScore: dec(100) },
      { id: secondCriterionId, type: 'BENEFICIARY_REACH', maximumScore: dec(100) },
    ])
    computeMany.mockResolvedValue(
      new Map([[secondCriterionId, { score: null, commentary: 'Not computable: small cell.' }]]),
    )
    const response = await rejection(
      service.saveScores(evaluator, projectId, evaluationId, body([{ criterionId }])),
    )
    expect(response.errors).toEqual([
      { fieldCode: criterionId, code: 'MANUAL_REQUIRED', message: expect.any(String) },
      {
        fieldCode: secondCriterionId,
        code: 'NOT_COMPUTABLE',
        message: 'Not computable: small cell.',
      },
    ])
    expect(tx.projectEvaluationScore.upsert).not.toHaveBeenCalled()
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
