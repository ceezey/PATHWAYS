import { describe, expect, it } from 'vitest'

import { evaluationDetailResponse, evaluationsResponse } from './evaluation-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const score = {
  criterionId: uuid,
  score: '80',
  maximumScore: '100',
  weightedScore: '20',
  source: 'computed',
  evidence: 'From the indicators',
  reason: null,
  note: null,
  criterion: {
    id: uuid,
    code: 'RELEVANCE',
    version: 1,
    type: 'KPI',
    name: 'Relevance',
    description: null,
    weight_percentage: '25',
    maximum_score: '100',
  },
}
const detail = {
  id: uuid,
  title: 'Mid-term',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt: stamp,
  evaluatedBy: { id: uuid, name: 'Fictional Officer' },
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [score],
}

describe('evaluation response contracts', () => {
  it('accepts a round with a computed score and rejects an unknown status, source or key', () => {
    expect(evaluationDetailResponse.safeParse(detail).success).toBe(true)
    expect(evaluationDetailResponse.safeParse({ ...detail, status: 'OPEN' }).success).toBe(false)
    const guessed = { ...detail, scores: [{ ...score, source: 'guessed' }] }
    expect(evaluationDetailResponse.safeParse(guessed).success).toBe(false)
    expect(evaluationDetailResponse.safeParse({ ...detail, extra: 1 }).success).toBe(false)
  })

  it('accepts the criteria and rounds of a project and limits the rounds to 20', () => {
    const criterion = {
      id: uuid,
      code: 'RELEVANCE',
      name: 'Relevance',
      description: null,
      type: 'KPI',
      version: 1,
      weightPercentage: '25',
      maximumScore: '100',
      status: 'PUBLISHED',
      updatedAt: stamp,
    }
    const list = { projectId: uuid, criteria: [criterion], evaluations: [detail], hasMore: false }
    expect(evaluationsResponse.safeParse(list).success).toBe(true)
    const many = { ...list, evaluations: Array.from({ length: 21 }, () => detail) }
    expect(evaluationsResponse.safeParse(many).success).toBe(false)
  })
})
