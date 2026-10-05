import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { EvaluationMetricsService } from './evaluation-metrics'
import {
  EvaluationsService,
  evaluationWeightsSchema,
  initialCriteriaSchema,
} from './evaluations.service'

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
const updatedAt = new Date('2026-09-27T00:00:00.000Z')
const actor = {
  id: criterionId,
  organizationId,
  userId: criterionId,
  aal: 'aal2',
  fullName: 'Fictional evaluator',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['monitoring.read', 'evaluations.weights.configure'],
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
  projectEvaluationCriterion: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  projectEvaluationScore: { findMany: vi.fn(), upsert: vi.fn() },
  $queryRaw: vi.fn(),
  auditLog: { create: vi.fn(), findFirst: vi.fn() },
}
const computeMany = vi.fn()
const service = new EvaluationsService(
  {} as PrismaService,
  {
    computeMany,
  } as unknown as EvaluationMetricsService,
)
const input = {
  criteria: [
    { id: criterionId, weightPercentage: 100, expectedUpdatedAt: updatedAt.toISOString() },
  ],
}

describe('evaluation reads and draft-only configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = actor
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([{ id: criterionId, updatedAt }])
    tx.projectEvaluationCriterion.updateMany.mockResolvedValue({ count: 1 })
    tx.projectEvaluation.findFirst.mockResolvedValue(null)
    tx.projectEvaluation.findMany.mockResolvedValue([])
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([])
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
  })
  it('returns no fabricated evaluation or score when no persisted evaluation exists', async () => {
    expect(await service.get(actor, projectId)).toEqual({
      projectId,
      criteria: [],
      evaluations: [],
      hasMore: false,
    })
    expect(tx.projectEvaluation.findFirst).not.toHaveBeenCalled()
  })
  it('ignores caller weight permission when the current role ceiling denies it', () => {
    scope.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['evaluations.weights.configure'],
    }
    expect(() => service.configureWeights(actor, projectId, input)).toThrow(ForbiddenException)
    expect(tx.projectEvaluationCriterion.updateMany).not.toHaveBeenCalled()
  })
  it('rejects incomplete or stale draft sets before any writes or audit', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: criterionId, updatedAt: new Date('2026-09-27T00:00:01.000Z') },
    ])
    await expect(service.configureWeights(actor, projectId, input)).rejects.toThrow(
      'Draft criteria changed',
    )
    expect(tx.projectEvaluationCriterion.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('writes only weight with a pinned same-org/project DRAFT version and audits the atomic change', async () => {
    await expect(service.configureWeights(actor, projectId, input)).resolves.toEqual({
      projectId,
      configured: 1,
    })
    const mutation = tx.projectEvaluationCriterion.updateMany.mock.calls[0][0]
    expect(mutation.where).toMatchObject({
      organizationId,
      projectId,
      id: criterionId,
      status: 'DRAFT',
      updatedAt,
    })
    expect(Object.keys(mutation.data)).toEqual(['weightPercentage'])
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
  })
  it.each([
    { criteria: [{ ...input.criteria[0], weightPercentage: 99 }] },
    { criteria: [input.criteria[0], input.criteria[0]] },
    { criteria: [{ ...input.criteria[0], status: 'PUBLISHED' }] },
    { ...input, actorUserId: criterionId },
  ])('rejects malformed totals, duplicates and caller authority/lifecycle fields', (value) => {
    expect(evaluationWeightsSchema.safeParse(value).success).toBe(false)
  })
})

describe('initial Admin criterion metadata setup', () => {
  const admin = {
    ...actor,
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['settings.configure', 'monitoring.read', 'audit.read'],
  } as ApplicationIdentity
  const input = {
    clientRequestId: '40000000-0000-4000-8000-000000000004',
    criteria: [
      {
        code: 'LEARNING',
        name: 'Documented learning outcomes',
        type: 'KPI',
        weightPercentage: 100,
        maximumScore: 100,
      },
    ],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = admin
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([])
    tx.auditLog.findFirst.mockResolvedValue(null)
    tx.auditLog.create.mockResolvedValue({})
    tx.$queryRaw.mockResolvedValue([])
    tx.projectEvaluationCriterion.create.mockResolvedValue({
      id: criterionId,
      code: 'LEARNING',
      version: 1,
      status: 'DRAFT',
      updatedAt,
    })
  })
  it('creates only actor-owned DRAFT metadata with an atomic immutable receipt', async () => {
    const result = await service.initializeCriteria(admin, projectId, input)
    const locks = tx.$queryRaw.mock.calls.filter((call) =>
      call[0].join('').includes('pg_advisory_xact_lock'),
    )
    expect(locks).toHaveLength(2)
    expect(
      locks.every((call) =>
        call[0]
          .join('')
          .startsWith('SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock'),
      ),
    ).toBe(true)
    expect(result.criteria).toEqual([
      {
        id: criterionId,
        code: 'LEARNING',
        version: 1,
        status: 'DRAFT',
        updatedAt: updatedAt.toISOString(),
      },
    ])
    expect(tx.projectEvaluationCriterion.create.mock.calls[0][0].data).toMatchObject({
      organizationId,
      projectId,
      createdById: admin.userId,
      status: 'DRAFT',
      version: 1,
    })
    expect(tx.projectEvaluationCriterion.create.mock.calls[0][0].data).not.toHaveProperty(
      'publishedById',
    )
    expect(tx.projectEvaluation.findFirst).not.toHaveBeenCalled()
    expect(tx.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({
      criteria: result.criteria,
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
  it('returns the original immutable receipt without recreating metadata', async () => {
    const original = await service.initializeCriteria(admin, projectId, input)
    const changes = tx.auditLog.create.mock.calls[0][0].data.changes
    tx.auditLog.findFirst.mockResolvedValue({ projectId, changes })
    tx.projectEvaluationCriterion.create.mockClear()
    expect(await service.initializeCriteria(admin, projectId, input)).toEqual(original)
    expect(tx.projectEvaluationCriterion.create).not.toHaveBeenCalled()
    await expect(
      service.initializeCriteria(admin, projectId, {
        ...input,
        criteria: [{ ...input.criteria[0], name: 'Changed rubric' }],
      }),
    ).rejects.toThrow('different content')
  })
  it('refuses an existing set and a revoked audit/read capability', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([{ id: criterionId }])
    await expect(service.initializeCriteria(admin, projectId, input)).rejects.toThrow(
      'already initialized',
    )
    scope.actor = { ...admin, permissions: ['settings.configure', 'monitoring.read'] }
    await expect(service.initializeCriteria(admin, projectId, input)).rejects.toThrow(
      'audit access',
    )
    expect(tx.projectEvaluationCriterion.create).not.toHaveBeenCalled()
  })
  it('denies M&E initialization even when the caller supplies the Admin bit', () => {
    scope.actor = { ...actor, permissions: ['settings.configure', 'monitoring.read', 'audit.read'] }
    expect(() => service.initializeCriteria(actor, projectId, input)).toThrow(ForbiddenException)
  })
  it.each([
    { ...input, createdById: criterionId },
    { ...input, criteria: [{ ...input.criteria[0], weightPercentage: 0 }] },
    { ...input, criteria: [{ ...input.criteria[0], maximumScore: 0.00001 }] },
    { ...input, criteria: [{ ...input.criteria[0], status: 'PUBLISHED' }] },
  ])('rejects malformed initial metadata before mutation', (value) => {
    expect(initialCriteriaSchema.safeParse(value).success).toBe(false)
    expect(() => service.initializeCriteria(admin, projectId, value)).toThrow()
    expect(tx.projectEvaluationCriterion.create).not.toHaveBeenCalled()
  })
})
