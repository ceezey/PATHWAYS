import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsService } from './evaluations.service'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (_db: unknown, _identity: unknown, permission: string) => {
    state.permissions.push(permission)
    return 'accepted'
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const evaluationId = '20000000-0000-4000-8000-000000000002'
const revision = '2026-09-27T00:00:00.000Z'
const actor = { roles: ['PROJECT_MANAGER'], permissions: [] } as unknown as ApplicationIdentity
const service = new EvaluationsService({} as PrismaService, {} as EvaluationMetricsService)
const start = {
  clientRequestId: '30000000-0000-4000-8000-000000000003',
  title: 'Mid-term',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}

// Returns the 400 message of a service call, or 'accepted' when it reached the authorized operation.
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    return String(await call())
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    throw error
  }
}

describe('evaluation request validation', () => {
  beforeEach(() => {
    state.permissions = []
  })

  it.each([
    [start, 'accepted'],
    [{ ...start, periodLabel: ' Final ' }, 'accepted'],
    [{ ...start, periodEnd: '2026-01-01', periodStart: '2026-01-01' }, 'accepted'],
    [
      { ...start, periodEnd: '2025-12-31' },
      'Supply a title and a valid period for the evaluation.',
    ],
    [
      { ...start, periodStart: '2026-13-01' },
      'Supply a title and a valid period for the evaluation.',
    ],
    [{ ...start, title: '  ' }, 'Supply a title and a valid period for the evaluation.'],
    [{ ...start, periodLabel: '' }, 'Supply a title and a valid period for the evaluation.'],
    [{ ...start, extra: 1 }, 'Supply a title and a valid period for the evaluation.'],
  ])('starts %j as %s', async (body, expected) => {
    expect(await outcome(() => service.createEvaluation(actor, projectId, body))).toBe(expected)
  })

  it.each([
    [{ expectedUpdatedAt: revision }, 'accepted'],
    [{ expectedUpdatedAt: revision, commentary: '' }, 'accepted'],
    [{ expectedUpdatedAt: '2026-09-27' }, 'Supply the evaluation you last loaded.'],
    [{ expectedUpdatedAt: revision, scores: [] }, 'Supply the evaluation you last loaded.'],
  ])('saves scores for %j as %s', async (body, expected) => {
    expect(await outcome(() => service.saveScores(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it.each([
    [{ expectedUpdatedAt: revision }, 'accepted'],
    [{}, 'Supply the evaluation you last loaded.'],
    [{ expectedUpdatedAt: revision, commentary: 'x' }, 'Supply the evaluation you last loaded.'],
  ])('submits %j as %s', async (body, expected) => {
    expect(await outcome(() => service.submit(actor, projectId, evaluationId, body))).toBe(expected)
  })

  it.each([
    [{ expectedUpdatedAt: revision, reason: ' Recheck reach ' }, 'accepted'],
    [
      { expectedUpdatedAt: revision, reason: ' ' },
      'Supply a reason for returning this evaluation.',
    ],
    [{ expectedUpdatedAt: revision }, 'Supply a reason for returning this evaluation.'],
  ])('returns %j as %s', async (body, expected) => {
    expect(await outcome(() => service.returnToDraft(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it.each([
    [{ expectedUpdatedAt: revision, feedback: 'Approved' }, 'accepted'],
    [
      { expectedUpdatedAt: revision, feedback: '' },
      'Supply sign-off feedback for this evaluation.',
    ],
    [{ feedback: 'Approved' }, 'Supply sign-off feedback for this evaluation.'],
  ])('signs off %j as %s', async (body, expected) => {
    expect(await outcome(() => service.signoff(actor, projectId, evaluationId, body))).toBe(
      expected,
    )
  })

  it('refuses before any authorized operation starts', async () => {
    await outcome(() => service.createEvaluation(actor, projectId, {}))
    await outcome(() => service.saveScores(actor, projectId, evaluationId, {}))
    expect(state.permissions).toEqual([])
  })
})
