import { describe, expect, it } from 'vitest'

import {
  createEvaluationRequest,
  enrollmentAssessmentsQuery,
  returnEvaluationRequest,
  saveEvaluationScoresRequest,
  signOffEvaluationRequest,
  submitEvaluationRequest,
} from './evaluation-requests'

const revision = '2026-09-27T00:00:00.000Z'
const start = {
  clientRequestId: '10000000-0000-4000-8000-000000000001',
  title: ' Mid-term ',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}

describe('evaluation request contracts', () => {
  it('trims the title and keeps the period', () => {
    expect(createEvaluationRequest.parse(start)).toEqual({ ...start, title: 'Mid-term' })
  })

  it('names the period end when it falls before the start', () => {
    const result = createEvaluationRequest.safeParse({ ...start, periodEnd: '2025-12-31' })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path)).toEqual([
      ['periodEnd'],
    ])
  })

  it.each(['2026-13-01', '2026-1-01', '01/01/2026'])('rejects the period start %j', (value) => {
    expect(createEvaluationRequest.safeParse({ ...start, periodStart: value }).success).toBe(false)
  })

  it('accepts only the loaded revision and optional commentary when saving scores', () => {
    expect(
      saveEvaluationScoresRequest.parse({ expectedUpdatedAt: revision, commentary: ' x ' }),
    ).toEqual({ expectedUpdatedAt: revision, commentary: 'x' })
    expect(
      submitEvaluationRequest.safeParse({ expectedUpdatedAt: revision, commentary: 'x' }).success,
    ).toBe(false)
  })

  it('requires a reason to return and feedback to sign off', () => {
    expect(
      returnEvaluationRequest.safeParse({ expectedUpdatedAt: revision, reason: ' ' }).success,
    ).toBe(false)
    expect(signOffEvaluationRequest.safeParse({ expectedUpdatedAt: revision }).success).toBe(false)
  })

  it('ignores other assessment query keys', () => {
    const enrollmentId = '20000000-0000-4000-8000-000000000002'
    expect(enrollmentAssessmentsQuery.parse({ enrollmentId, page: '2' })).toEqual({ enrollmentId })
  })
})
