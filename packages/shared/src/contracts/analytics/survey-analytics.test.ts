import { describe, expect, it } from 'vitest'
import { type SurveyAssessmentRow, computeSurveyAnalytics } from './survey-analytics'

const projectId = '20000000-0000-4000-8000-00000000000a'
const generatedAt = '2026-09-29T00:00:00.000Z'

let rowIdCounter = 0
function row(overrides: Partial<SurveyAssessmentRow> = {}): SurveyAssessmentRow {
  rowIdCounter += 1
  return {
    id: `row-${rowIdCounter}`,
    type: 'PRE_TEST',
    score: '50',
    maximumScore: '100',
    assessmentDate: '2026-09-01',
    enrollmentId: 'enrollment-1',
    activityId: null,
    ...overrides,
  }
}

function compute(rows: SurveyAssessmentRow[]) {
  return computeSurveyAnalytics({
    projectId,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    generatedAt,
    rows,
  })
}

function pair(
  enrollmentId: string,
  pre: number,
  post: number,
  options: { activityId?: string | null; preDate?: string; postDate?: string } = {},
): SurveyAssessmentRow[] {
  return [
    row({
      type: 'PRE_TEST',
      score: String(pre),
      maximumScore: '100',
      enrollmentId,
      activityId: options.activityId ?? null,
      assessmentDate: options.preDate ?? '2026-01-01',
    }),
    row({
      type: 'POST_TEST',
      score: String(post),
      maximumScore: '100',
      enrollmentId,
      activityId: options.activityId ?? null,
      assessmentDate: options.postDate ?? '2026-02-01',
    }),
  ]
}

describe('computeSurveyAnalytics', () => {
  it('pairs the latest PRE_TEST against the latest POST_TEST per enrollment', () => {
    const rows: SurveyAssessmentRow[] = [
      row({
        type: 'PRE_TEST',
        score: '40',
        maximumScore: '100',
        enrollmentId: 'e1',
        assessmentDate: '2026-01-01',
      }),
      // A later PRE_TEST for the same enrollment must win the pairing.
      row({
        type: 'PRE_TEST',
        score: '60',
        maximumScore: '100',
        enrollmentId: 'e1',
        assessmentDate: '2026-01-15',
      }),
      row({
        type: 'POST_TEST',
        score: '60',
        maximumScore: '100',
        enrollmentId: 'e1',
        assessmentDate: '2026-02-01',
      }),
      // 4 more pairs so the mean blends several enrollments.
      ...['e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 60, 60)),
    ]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    // e1's paired PRE is the later 60, not the earlier 40; every pair is 60 -> 60.
    expect(result.overall.meanPre).toEqual({ state: 'AVAILABLE', value: '60', reason: null })
    expect(result.overall.meanChange).toEqual({ state: 'ZERO', value: '0', reason: null })
  })

  it('excludes rows with a null score or a null/non-positive maximum score, and counts them', () => {
    const rows: SurveyAssessmentRow[] = [
      row({ type: 'PRE_TEST', score: null, enrollmentId: 'e1' }),
      row({ type: 'POST_TEST', maximumScore: null, enrollmentId: 'e1' }),
      row({ type: 'POST_TEST', maximumScore: '0', enrollmentId: 'e2' }),
      row({ type: 'POST_TEST', maximumScore: '-5', enrollmentId: 'e3' }),
    ]
    const result = compute(rows)
    expect(result.excludedRecords).toBe(4)
    expect(result.overall.pairs).toEqual({ state: 'ZERO', value: '0', reason: null })
    expect(result.overall.meanPre.reason).toBe('NO_PAIRED_ASSESSMENTS')
  })

  it('is MISSING with NO_PAIRED_ASSESSMENTS, never a fabricated zero, when a PRE_TEST is unpaired', () => {
    const rows = [row({ type: 'PRE_TEST', enrollmentId: 'e1' })]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'ZERO', value: '0', reason: null })
    expect(result.overall.meanPre).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'NO_PAIRED_ASSESSMENTS',
    })
    expect(result.overall.improved.reason).toBe('NO_PAIRED_ASSESSMENTS')
  })

  it('uses only the latest test of each type when tests repeat', () => {
    const rows: SurveyAssessmentRow[] = [
      row({ type: 'PRE_TEST', score: '10', enrollmentId: 'e1', assessmentDate: '2026-01-01' }),
      row({ type: 'PRE_TEST', score: '90', enrollmentId: 'e1', assessmentDate: '2026-01-10' }),
      row({ type: 'POST_TEST', score: '10', enrollmentId: 'e1', assessmentDate: '2026-02-01' }),
      row({ type: 'POST_TEST', score: '95', enrollmentId: 'e1', assessmentDate: '2026-02-10' }),
      // 4 more pairs so the mean blends several enrollments.
      ...['e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 50, 50)),
    ]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    // (90 + 50*4)/5 = 58
    expect(result.overall.meanPre).toEqual({ state: 'AVAILABLE', value: '58', reason: null })
    expect(result.overall.meanPost).toEqual({ state: 'AVAILABLE', value: '59', reason: null })
  })

  it.each([1, 4])('releases exact counts and means for %i pairs', (count) => {
    const rows = Array.from({ length: count }, (_, index) => pair(`e${index}`, 40, 60)).flat()
    const result = compute(rows)
    const exact = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
    expect(result.overall.pairs).toEqual(exact(String(count)))
    expect(result.overall.meanPre).toEqual(exact('40'))
    expect(result.overall.meanPost).toEqual(exact('60'))
    expect(result.overall.meanChange).toEqual(exact('20'))
    expect(result.overall.improved).toEqual(exact(String(count)))
    expect(result.overall.same).toEqual({ state: 'ZERO', value: '0', reason: null })
    expect(result.overall.declined).toEqual({ state: 'ZERO', value: '0', reason: null })
  })

  it('reveals a group of exactly 5 pairs and computes mean change to 1dp, half away from zero', () => {
    const rows = [
      ...pair('e1', 40, 60),
      ...pair('e2', 40, 60),
      ...pair('e3', 40, 60),
      ...pair('e4', 40, 60),
      ...pair('e5', 40, 61),
    ]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    expect(result.overall.meanPre).toEqual({ state: 'AVAILABLE', value: '40', reason: null })
    // mean post = (60*4 + 61)/5 = 60.2, change = 20.2
    expect(result.overall.meanChange).toEqual({ state: 'AVAILABLE', value: '20.2', reason: null })
    expect(result.overall.improved).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
  })

  it('releases an exact 1/4 improved/same split with no complementary suppression', () => {
    const rows = [
      ...pair('e1', 40, 60),
      ...pair('e2', 40, 40),
      ...pair('e3', 40, 40),
      ...pair('e4', 40, 40),
      ...pair('e5', 40, 40),
    ]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    expect(result.overall.improved).toEqual({ state: 'AVAILABLE', value: '1', reason: null })
    expect(result.overall.same).toEqual({ state: 'AVAILABLE', value: '4', reason: null })
    expect(result.overall.declined).toEqual({ state: 'ZERO', value: '0', reason: null })
  })

  it('groups pairs by activity in addition to the overall cohort', () => {
    const rows = [
      ...pair('e1', 40, 60, { activityId: 'act-1' }),
      ...pair('e2', 40, 60, { activityId: 'act-1' }),
      ...pair('e3', 40, 60, { activityId: 'act-1' }),
      ...pair('e4', 40, 60, { activityId: 'act-1' }),
      ...pair('e5', 40, 60, { activityId: 'act-1' }),
    ]
    const result = compute(rows)
    expect(result.byActivity).toHaveLength(1)
    expect(result.byActivity[0]?.key).toBe('act-1')
    expect(result.byActivity[0]?.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
  })

  it('never outputs beneficiary identity fields', () => {
    const result = compute(pair('e1', 40, 60))
    expect(JSON.stringify(result)).not.toMatch(/firstName|lastName|beneficiary/i)
  })

  it('breaks a same-date tie deterministically by id, and independently of input order', () => {
    // Two PRE_TEST rows for the same enrollment on the exact same date: the tie-break
    // key (id) must decide the winner the same way regardless of array order.
    const forward: SurveyAssessmentRow[] = [
      row({
        id: 'a',
        type: 'PRE_TEST',
        score: '10',
        enrollmentId: 'e1',
        assessmentDate: '2026-01-01',
      }),
      row({
        id: 'b',
        type: 'PRE_TEST',
        score: '90',
        enrollmentId: 'e1',
        assessmentDate: '2026-01-01',
      }),
      row({
        id: 'c',
        type: 'POST_TEST',
        score: '50',
        enrollmentId: 'e1',
        assessmentDate: '2026-02-01',
      }),
      ...['e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 50, 50)),
    ]
    const reversed = [...forward].reverse()
    const resultForward = compute(forward)
    const resultReversed = compute(reversed)
    expect(resultForward.overall.meanPre).toEqual(resultReversed.overall.meanPre)
    expect(resultForward).toEqual(resultReversed)
  })

  it('excludes a non-finite score as invalid and counts it in excludedRecords', () => {
    const rows: SurveyAssessmentRow[] = [
      row({ type: 'PRE_TEST', score: 'not-a-number', enrollmentId: 'e1' }),
      row({ type: 'POST_TEST', maximumScore: 'NaN', enrollmentId: 'e2' }),
    ]
    const result = compute(rows)
    expect(result.excludedRecords).toBe(2)
  })

  it('sorts byActivity output by activityId', () => {
    const rows = [
      ...['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 40, 60, { activityId: 'zzz' })),
      ...['e6', 'e7', 'e8', 'e9', 'e10'].flatMap((id) => pair(id, 40, 60, { activityId: 'aaa' })),
    ]
    const result = compute(rows)
    expect(result.byActivity.map((group) => group.key)).toEqual(['aaa', 'zzz'])
  })

  describe('exact per-activity breakdown', () => {
    // Builds pairs for one enrollment prefix with an exact improved/same/declined split.
    function splitPairs(
      prefix: string,
      counts: { improved: number; same: number; declined: number },
      options: { activityId?: string | null } = {},
    ): SurveyAssessmentRow[] {
      const rows: SurveyAssessmentRow[] = []
      let index = 0
      for (let i = 0; i < counts.improved; i += 1, index += 1) {
        rows.push(...pair(`${prefix}${index}`, 40, 70, options))
      }
      for (let i = 0; i < counts.same; i += 1, index += 1) {
        rows.push(...pair(`${prefix}${index}`, 40, 40, options))
      }
      for (let i = 0; i < counts.declined; i += 1, index += 1) {
        rows.push(...pair(`${prefix}${index}`, 70, 40, options))
      }
      return rows
    }

    const exact = (value: string) =>
      value === '0'
        ? { state: 'ZERO', value, reason: null }
        : { state: 'AVAILABLE', value, reason: null }

    it('releases a small activity group exactly next to a larger no-activity residual', () => {
      const rows = [
        ...['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 40, 60)),
        ...['e6', 'e7', 'e8'].flatMap((id) => pair(id, 40, 60, { activityId: 'act-1' })),
      ]
      const result = compute(rows)
      expect(result.overall.pairs).toEqual(exact('8'))
      expect(result.byActivity).toHaveLength(1)
      expect(result.byActivity[0]).toMatchObject({
        key: 'act-1',
        pairs: exact('3'),
        meanPre: exact('40'),
        improved: exact('3'),
      })
    })

    it('does not withhold byActivity when the no-activity residual is 1-4', () => {
      const rows = [
        ...['e1', 'e2'].flatMap((id) => pair(id, 40, 60)),
        ...['e3', 'e4', 'e5', 'e6', 'e7'].flatMap((id) =>
          pair(id, 40, 60, { activityId: 'act-1' }),
        ),
      ]
      const result = compute(rows)
      expect(result.overall.pairs).toEqual(exact('7'))
      expect(result.byActivity).toHaveLength(1)
      expect(result.byActivity[0]?.pairs).toEqual(exact('5'))
    })

    it('releases the exact improved/same/declined split of every activity group (act-A/act-B)', () => {
      const rows = [
        ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
        ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
      ]
      const result = compute(rows)
      const counts = (group: (typeof result.byActivity)[number] | typeof result.overall) =>
        (['pairs', 'improved', 'same', 'declined'] as const).map((key) => group[key].value)
      expect(counts(result.overall)).toEqual(['15', '7', '0', '8'])
      expect(result.byActivity.map((group) => group.key)).toEqual(['act-A', 'act-B'])
      expect(result.byActivity.map(counts)).toEqual([
        ['10', '5', '0', '5'],
        ['5', '2', '0', '3'],
      ])
      expect(result.byActivity[1]?.improved).toEqual(exact('2'))
    })

    it('reveals the breakdown when every group and the residual are large', () => {
      const rows = [
        ...['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 40, 60)),
        ...['e6', 'e7', 'e8', 'e9', 'e10'].flatMap((id) =>
          pair(id, 40, 60, { activityId: 'act-1' }),
        ),
      ]
      const result = compute(rows)
      expect(result.byActivity).toHaveLength(1)
      expect(result.byActivity[0]?.pairs).toEqual(exact('5'))
    })

    it('is independent of input order for the act-A/act-B case', () => {
      const rows = [
        ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
        ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
      ]
      const forward = compute(rows)
      const reversed = compute([...rows].reverse())
      expect(forward).toEqual(reversed)
    })
  })
})
