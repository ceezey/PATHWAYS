import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsService, saveScoresSchema } from './evaluations.service'

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
const actor = {
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
  projectEvaluation: { findFirst: vi.fn(), findMany: vi.fn() },
  projectEvaluationCriterion: { findMany: vi.fn() },
  projectEvaluationScore: { findMany: vi.fn() },
}
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)

describe('evaluation reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope.actor = actor
    scope.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
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
  it('refuses a caller without the monitoring read permission', () => {
    scope.actor = { ...actor, permissions: [] }
    expect(() => service.get(actor, projectId)).toThrow(ForbiddenException)
  })
})

describe('score save request', () => {
  const expectedUpdatedAt = '2026-09-27T00:00:00.000Z'
  it('accepts a narrative and a revision and nothing else', () => {
    expect(saveScoresSchema.safeParse({ expectedUpdatedAt, commentary: 'Narrative' }).success).toBe(
      true,
    )
    expect(saveScoresSchema.safeParse({ expectedUpdatedAt }).success).toBe(true)
  })
  it('rejects manual scores and notes', () => {
    expect(
      saveScoresSchema.safeParse({
        expectedUpdatedAt,
        scores: [{ criterionId, manualScore: 90, note: 'x' }],
      }).success,
    ).toBe(false)
  })
})
