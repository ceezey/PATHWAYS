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

  it.each([
    ['title', 200],
    ['periodLabel', 80],
  ])('bounds the %s at %i characters', (field, max) => {
    const parse = (length: number) =>
      createEvaluationRequest.safeParse({ ...start, [field]: 'x'.repeat(length) }).success
    expect(parse(max)).toBe(true)
    expect(parse(max + 1)).toBe(false)
  })

  it('rejects a whitespace-only title and trims the period label', () => {
    expect(createEvaluationRequest.safeParse({ ...start, title: '  ' }).success).toBe(false)
    expect(createEvaluationRequest.parse({ ...start, periodLabel: ' Final ' }).periodLabel).toBe(
      'Final',
    )
  })

  it.each(['2026-13-01', '2026-1-01', '01/01/2026', '2026-01-32'])(
    'rejects the period end %j',
    (value) => {
      expect(createEvaluationRequest.safeParse({ ...start, periodEnd: value }).success).toBe(false)
    },
  )

  it('keeps a same-day period and a day the engine rolls over', () => {
    expect(
      createEvaluationRequest.safeParse({
        ...start,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-01',
      }).success,
    ).toBe(true)
    expect(createEvaluationRequest.safeParse({ ...start, periodEnd: '2026-02-30' }).success).toBe(
      true,
    )
  })

  it.each([undefined, 'not-a-uuid'])('rejects the client request id %j', (clientRequestId) => {
    expect(createEvaluationRequest.safeParse({ ...start, clientRequestId }).success).toBe(false)
  })

  it('rejects an unknown key on a new evaluation', () => {
    expect(createEvaluationRequest.safeParse({ ...start, extra: 1 }).success).toBe(false)
  })

  it('takes a revision with an offset but not one without', () => {
    const parse = (expectedUpdatedAt: string) =>
      submitEvaluationRequest.safeParse({ expectedUpdatedAt }).success
    expect(parse('2026-09-27T00:00:00+08:00')).toBe(true)
    expect(parse('2026-09-27T00:00:00')).toBe(false)
  })

  it('bounds the commentary at 4000 characters and trims it to empty', () => {
    const parse = (commentary: string) =>
      saveEvaluationScoresRequest.safeParse({ expectedUpdatedAt: revision, commentary })
    expect(parse('x'.repeat(4000)).success).toBe(true)
    expect(parse('x'.repeat(4001)).success).toBe(false)
    expect(parse('   ')).toMatchObject({ success: true, data: { commentary: '' } })
  })

  it.each([
    ['reason', returnEvaluationRequest],
    ['feedback', signOffEvaluationRequest],
  ])('bounds the %s at 2000 characters and refuses whitespace', (field, schema) => {
    const parse = (text: string) =>
      schema.safeParse({ expectedUpdatedAt: revision, [field]: text }).success
    expect(parse('x'.repeat(2000))).toBe(true)
    expect(parse('x'.repeat(2001))).toBe(false)
    expect(parse(' ')).toBe(false)
  })

  it.each([
    ['return', returnEvaluationRequest, { reason: 'No' }],
    ['sign off', signOffEvaluationRequest, { feedback: 'Good' }],
    ['save scores', saveEvaluationScoresRequest, {}],
  ])('rejects an unknown key to %s', (_name, schema, body) => {
    expect(schema.safeParse({ expectedUpdatedAt: revision, ...body }).success).toBe(true)
    expect(schema.safeParse({ expectedUpdatedAt: revision, ...body, extra: 1 }).success).toBe(false)
  })

  it.each([{}, { enrollmentId: 'not-a-uuid' }])('rejects the assessment query %j', (query) => {
    expect(enrollmentAssessmentsQuery.safeParse(query).success).toBe(false)
  })
})
