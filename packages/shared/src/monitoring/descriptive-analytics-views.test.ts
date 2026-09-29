import { describe, expect, it } from 'vitest'
import {
  SURVEY_SMALL_CELL_THRESHOLD,
  type SurveyAssessmentRow,
  type TimelineMilestoneRow,
  computeSurveyAnalytics,
  computeSurveyAnalyticsFromAggregates,
  milestoneCountsFromRows,
  milestoneOnTimeCell,
  milestoneOnTimeFromCounts,
  surveyAggregateFromRows,
} from './descriptive-analytics'

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
      // 4 more pairs to clear the small-cell threshold so the mean is visible.
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
      // 4 more pairs to clear the small-cell threshold so the mean is visible.
      ...['e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 50, 50)),
    ]
    const result = compute(rows)
    expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    // (90 + 50*4)/5 = 58
    expect(result.overall.meanPre).toEqual({ state: 'AVAILABLE', value: '58', reason: null })
    expect(result.overall.meanPost).toEqual({ state: 'AVAILABLE', value: '59', reason: null })
  })

  it.each([0, 1, 4])(
    'suppresses the whole group as SMALL_CELL for %i pairs (fewer than 5, more than 0)',
    (count) => {
      const rows =
        count === 0
          ? []
          : Array.from({ length: count }, (_, index) => pair(`e${index}`, 40, 60)).flat()
      const result = compute(rows)
      if (count === 0) {
        expect(result.overall.pairs).toEqual({ state: 'ZERO', value: '0', reason: null })
      } else {
        expect(result.overall.pairs).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
        expect(result.overall.meanChange).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
      }
    },
  )

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

  it('applies complementary suppression across improved/same/declined when any sub-count is small', () => {
    // 5 pairs total (visible), but only 1 improved: the 1/4 split must not leak via subtraction.
    const rows = [
      ...pair('e1', 40, 60),
      ...pair('e2', 40, 40),
      ...pair('e3', 40, 40),
      ...pair('e4', 40, 40),
      ...pair('e5', 40, 40),
    ]
    const result = compute(rows)
    expect(result.overall.pairs.state).toBe('AVAILABLE')
    expect(result.overall.improved).toEqual({
      state: 'SUPPRESSED',
      value: null,
      reason: 'SMALL_CELL',
    })
    expect(result.overall.same).toEqual({ state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' })
    expect(result.overall.declined).toEqual({
      state: 'SUPPRESSED',
      value: null,
      reason: 'SMALL_CELL',
    })
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

  describe('cross-group reconstruction resistance', () => {
    it('withholds the whole breakdown when one activity group is suppressed', () => {
      // 5 residual (no-activity) pairs plus a 3-pair activity group: the activity
      // group alone is suppressed, but the residual is visible from overall minus a
      // suppressed placeholder -- so the whole breakdown must be withheld.
      const rows = [
        ...['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 40, 60)),
        ...['e6', 'e7', 'e8'].flatMap((id) => pair(id, 40, 60, { activityId: 'act-1' })),
      ]
      const result = compute(rows)
      expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '8', reason: null })
      expect(result.byActivity).toHaveLength(1)
      expect(result.byActivity[0]?.key).toBe('act-1')
      for (const key of ['pairs', 'meanPre', 'improved'] as const) {
        expect(result.byActivity[0]?.[key]).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
      }
    })

    it('withholds the whole breakdown when the no-activity residual is 1-4, even if every group is visible', () => {
      // 5 visible pairs in one activity group, plus 2 residual pairs with no
      // activity: overall (7) minus the visible group (5) would leak the residual
      // (2), so the breakdown is withheld even though the activity group is fine.
      const rows = [
        ...['e1', 'e2'].flatMap((id) => pair(id, 40, 60)),
        ...['e3', 'e4', 'e5', 'e6', 'e7'].flatMap((id) =>
          pair(id, 40, 60, { activityId: 'act-1' }),
        ),
      ]
      const result = compute(rows)
      expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '7', reason: null })
      expect(result.byActivity).toHaveLength(1)
      for (const key of ['pairs', 'meanPre', 'improved'] as const) {
        expect(result.byActivity[0]?.[key]).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
      }
    })

    it('reveals the breakdown when every group and the residual both clear the threshold', () => {
      const rows = [
        ...['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pair(id, 40, 60)),
        ...['e6', 'e7', 'e8', 'e9', 'e10'].flatMap((id) =>
          pair(id, 40, 60, { activityId: 'act-1' }),
        ),
      ]
      const result = compute(rows)
      expect(result.byActivity).toHaveLength(1)
      expect(result.byActivity[0]?.pairs).toEqual({ state: 'AVAILABLE', value: '5', reason: null })
    })

    // Builds a set of pairs for one enrollment prefix with an exact improved/same/declined
    // split, so tests can construct sub-cells that recover by subtraction across groups.
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

    it('withholds the whole breakdown when a visible group has a sub-count recoverable by subtraction (act-A/act-B)', () => {
      // act-A: 10 pairs, 5 improved / 0 same / 5 declined -- clean on its own.
      // act-B: 5 pairs, 2 improved / 0 same / 3 declined -- act-B's own group is
      // suppressed as a unit by buildSurveyGroup, but without the cross-group fix
      // its improved=2/declined=3 could be recovered as overall (7/0/8) minus act-A
      // (5/0/5) = (2/0/3).
      const rows = [
        ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
        ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
      ]
      const result = compute(rows)
      expect(result.overall.pairs).toEqual({ state: 'AVAILABLE', value: '15', reason: null })
      expect(result.overall.improved).toEqual({ state: 'AVAILABLE', value: '7', reason: null })
      expect(result.overall.declined).toEqual({ state: 'AVAILABLE', value: '8', reason: null })
      expect(result.byActivity).toHaveLength(2)
      for (const group of result.byActivity) {
        for (const key of ['pairs', 'improved', 'same', 'declined'] as const) {
          expect(group[key]).toEqual({ state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' })
        }
      }
    })

    it('withholds the whole breakdown when the no-activity residual has >=5 pairs but a 1-4 sub-count', () => {
      // Residual (no activity): 5 pairs, 2 improved / 0 same / 3 declined -- pairs
      // clear the threshold, but the improved/declined split does not.
      // act-1: 5 pairs, all improved -- clean on its own.
      const rows = [
        ...splitPairs('r', { improved: 2, same: 0, declined: 3 }),
        ...splitPairs('g', { improved: 5, same: 0, declined: 0 }, { activityId: 'act-1' }),
      ]
      const result = compute(rows)
      expect(result.byActivity).toHaveLength(1)
      for (const key of ['pairs', 'improved', 'same', 'declined'] as const) {
        expect(result.byActivity[0]?.[key]).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
      }
    })

    it('withholds the whole breakdown when the overall improved/same/declined split is itself suppressed', () => {
      // A single small activity group (3 pairs) is enough to suppress the overall
      // group's own sub-cells too (only 3 pairs total); the byActivity group must
      // also be withheld rather than left as a bare suppressed placeholder that
      // diverges from an already-suppressed overall.
      const rows = splitPairs('s', { improved: 1, same: 0, declined: 2 }, { activityId: 'act-1' })
      const result = compute(rows)
      expect(result.overall.pairs).toEqual({
        state: 'SUPPRESSED',
        value: null,
        reason: 'SMALL_CELL',
      })
      expect(result.overall.improved).toEqual({
        state: 'SUPPRESSED',
        value: null,
        reason: 'SMALL_CELL',
      })
      expect(result.byActivity).toHaveLength(1)
      for (const key of ['pairs', 'improved', 'same', 'declined'] as const) {
        expect(result.byActivity[0]?.[key]).toEqual({
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
        })
      }
    })

    it('is independent of input order for the act-A/act-B reconstruction case', () => {
      const rows = [
        ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
        ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
      ]
      const forward = compute(rows)
      const reversed = compute([...rows].reverse())
      expect(forward).toEqual(reversed)
    })

    it('property: byActivity is never a mix of suppressed and visible groups, so no suppressed value can be recovered from a visible sibling plus the overall total', () => {
      const scenarios: SurveyAssessmentRow[][] = [
        [
          ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
          ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
        ],
        [
          ...splitPairs('r', { improved: 2, same: 0, declined: 3 }),
          ...splitPairs('g', { improved: 5, same: 0, declined: 0 }, { activityId: 'act-1' }),
        ],
        [
          ...splitPairs('c', { improved: 5, same: 0, declined: 0 }, { activityId: 'act-1' }),
          ...splitPairs('d', { improved: 0, same: 5, declined: 0 }, { activityId: 'act-2' }),
        ],
      ]
      const fields = ['pairs', 'improved', 'same', 'declined'] as const
      for (const rows of scenarios) {
        const result = compute(rows)
        const states = new Set(
          result.byActivity.flatMap((group) => fields.map((field) => group[field].state)),
        )
        // Every group's every field is suppressed together, or none are: there is no
        // partial reveal from which a withheld value could be reconstructed by
        // subtracting visible siblings from the overall total.
        const allSuppressed = [...states].every((state) => state === 'SUPPRESSED')
        const noneSuppressed = ![...states].includes('SUPPRESSED')
        expect(allSuppressed || noneSuppressed).toBe(true)
        if (noneSuppressed) {
          // When visible, each group's own sub-count is itself 0 or >= threshold
          // (buildSurveyGroup's own rule), so subtraction cannot expose a 1-4 value.
          for (const group of result.byActivity) {
            for (const field of fields) {
              const cell = group[field]
              if (cell.value === null) continue
              const value = Number(cell.value)
              expect(value === 0 || value >= SURVEY_SMALL_CELL_THRESHOLD).toBe(true)
            }
          }
        }
      }
    })

    it('suppressed groups carry a null value on every field, so the CSV exporter (which reads these same cells) cannot leak a sub-count', () => {
      const rows = [
        ...splitPairs('a', { improved: 5, same: 0, declined: 5 }, { activityId: 'act-A' }),
        ...splitPairs('b', { improved: 2, same: 0, declined: 3 }, { activityId: 'act-B' }),
      ]
      const result = compute(rows)
      for (const group of result.byActivity) {
        expect(group.improved.value).toBeNull()
        expect(group.same.value).toBeNull()
        expect(group.declined.value).toBeNull()
        expect(group.pairs.value).toBeNull()
      }
    })
  })
})

describe('milestoneOnTimeCell', () => {
  const milestone = (overrides: Partial<TimelineMilestoneRow>): TimelineMilestoneRow => ({
    status: 'COMPLETED',
    targetDate: '2026-06-01',
    completionDate: '2026-06-01',
    ...overrides,
  })

  it('is MISSING NO_COMPLETED_MILESTONES when there are no completed milestones', () => {
    expect(milestoneOnTimeCell([])).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'NO_COMPLETED_MILESTONES',
    })
    expect(
      milestoneOnTimeCell([milestone({ status: 'PENDING' }), milestone({ status: 'CANCELLED' })]),
    ).toEqual({ state: 'MISSING', value: null, reason: 'NO_COMPLETED_MILESTONES' })
  })

  it('counts a same-day completion as on time', () => {
    expect(
      milestoneOnTimeCell([milestone({ targetDate: '2026-06-01', completionDate: '2026-06-01' })]),
    ).toEqual({ state: 'AVAILABLE', value: '100', reason: null })
  })

  it('counts a late completion as not on time', () => {
    expect(
      milestoneOnTimeCell([milestone({ targetDate: '2026-06-01', completionDate: '2026-06-02' })]),
    ).toEqual({ state: 'ZERO', value: '0', reason: null })
  })

  it('excludes cancelled milestones from the population', () => {
    expect(
      milestoneOnTimeCell([
        milestone({ targetDate: '2026-06-01', completionDate: '2026-06-01' }),
        milestone({ status: 'CANCELLED', targetDate: '2020-01-01', completionDate: '2025-01-01' }),
      ]),
    ).toEqual({ state: 'AVAILABLE', value: '100', reason: null })
  })
})

describe('computeSurveyAnalyticsFromAggregates (trusted database aggregates)', () => {
  const aggregateInput = (aggregate: unknown) => ({
    projectId,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    generatedAt,
    aggregate: aggregate as never,
  })

  it('computes means from group sums with round1 half-away-from-zero and applies suppression', () => {
    const result = computeSurveyAnalyticsFromAggregates(
      aggregateInput({
        excludedRecords: 2,
        groups: [
          // mean pre 12.25 (tie) rounds up to 12.3; mean post 40.05 rounds to 40.1
          {
            activityId: null,
            pairs: 5,
            sumPre: 61.25,
            sumPost: 200.25,
            improved: 5,
            same: 0,
            declined: 0,
          },
        ],
      }),
    )
    expect(result.excludedRecords).toBe(2)
    expect(result.overall).toMatchObject({
      pairs: { state: 'AVAILABLE', value: '5' },
      meanPre: { value: '12.3' },
      meanPost: { value: '40.1' },
      improved: { state: 'AVAILABLE', value: '5' },
      same: { state: 'ZERO', value: '0' },
    })
    expect(result.byActivity).toEqual([])
  })

  it('suppresses a group with 1-4 pairs and withholds the whole breakdown', () => {
    const result = computeSurveyAnalyticsFromAggregates(
      aggregateInput({
        excludedRecords: 0,
        groups: [
          {
            activityId: 'act-a',
            pairs: 5,
            sumPre: 200,
            sumPost: 300,
            improved: 5,
            same: 0,
            declined: 0,
          },
          {
            activityId: 'act-b',
            pairs: 3,
            sumPre: 120,
            sumPost: 150,
            improved: 3,
            same: 0,
            declined: 0,
          },
        ],
      }),
    )
    expect(result.overall.pairs).toMatchObject({ state: 'AVAILABLE', value: '8' })
    for (const group of result.byActivity) expect(group.pairs.state).toBe('SUPPRESSED')
  })

  it('withholds the breakdown when the no-activity residual is small (1-4)', () => {
    const result = computeSurveyAnalyticsFromAggregates(
      aggregateInput({
        excludedRecords: 0,
        groups: [
          {
            activityId: 'act-a',
            pairs: 5,
            sumPre: 200,
            sumPost: 300,
            improved: 5,
            same: 0,
            declined: 0,
          },
          {
            activityId: null,
            pairs: 2,
            sumPre: 80,
            sumPost: 90,
            improved: 2,
            same: 0,
            declined: 0,
          },
        ],
      }),
    )
    expect(result.byActivity.every((group) => group.pairs.state === 'SUPPRESSED')).toBe(true)
  })

  it('is MISSING (NO_PAIRED_ASSESSMENTS) for an empty aggregate, never a fabricated zero mean', () => {
    const result = computeSurveyAnalyticsFromAggregates(
      aggregateInput({ excludedRecords: 0, groups: [] }),
    )
    expect(result.overall).toMatchObject({
      pairs: { state: 'ZERO', value: '0' },
      meanPre: { state: 'MISSING', reason: 'NO_PAIRED_ASSESSMENTS' },
    })
  })

  it('rejects an aggregate whose counts do not add up or that carries unknown fields', () => {
    expect(() =>
      computeSurveyAnalyticsFromAggregates(
        aggregateInput({
          excludedRecords: 0,
          groups: [
            {
              activityId: null,
              pairs: 5,
              sumPre: 1,
              sumPost: 1,
              improved: 1,
              same: 0,
              declined: 0,
            },
          ],
        }),
      ),
    ).toThrow()
    expect(() =>
      computeSurveyAnalyticsFromAggregates(
        aggregateInput({
          excludedRecords: 0,
          groups: [
            {
              activityId: null,
              pairs: 5,
              sumPre: 1,
              sumPost: 1,
              improved: 5,
              same: 0,
              declined: 0,
              enrollmentId: 'leak',
            },
          ],
        }),
      ),
    ).toThrow()
  })

  it('parity: aggregate calculator equals an independent row-based reference on shuffled fixtures', () => {
    const rows: SurveyAssessmentRow[] = []
    let counter = 0
    const add = (
      enrollmentId: string | null,
      type: 'PRE_TEST' | 'POST_TEST',
      score: string,
      date: string,
      activityId: string | null,
      maximumScore = '100',
    ) => {
      counter += 1
      rows.push({
        id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
        type,
        score,
        maximumScore,
        assessmentDate: date,
        enrollmentId,
        activityId,
      })
    }
    for (let index = 0; index < 12; index += 1) {
      const activityId = index < 6 ? 'act-a' : index < 10 ? 'act-b' : null
      add(`e${index}`, 'PRE_TEST', String(30 + index), '2026-02-01', activityId)
      add(`e${index}`, 'POST_TEST', String(50 + (index % 3) * 10 - index), '2026-03-01', activityId)
    }
    // later re-test wins; same-date tie broken by higher id; invalid maximum excluded; no enrollment ignored
    add('e0', 'PRE_TEST', '10', '2026-02-15', 'act-a')
    add('e1', 'POST_TEST', '99', '2026-03-01', 'act-a')
    add('e2', 'POST_TEST', '5', '2026-03-01', 'act-a', '0')
    add('e3', 'POST_TEST', '5', '2026-03-05', 'act-a', '20')
    add(null, 'PRE_TEST', '40', '2026-02-01', null)

    const reference = (input: SurveyAssessmentRow[]) => {
      const valid = input.filter((row) => Number(row.maximumScore) > 0 && row.score !== null)
      const excluded = input.length - valid.length
      const latest = (enrollment: string, type: string) =>
        valid
          .filter((row) => row.enrollmentId === enrollment && row.type === type)
          .sort((l, r) =>
            l.assessmentDate === r.assessmentDate
              ? r.id.localeCompare(l.id)
              : r.assessmentDate.localeCompare(l.assessmentDate),
          )[0]
      const normalized = (row: SurveyAssessmentRow) =>
        (Number(row.score) / Number(row.maximumScore)) * 100
      const enrollments = [
        ...new Set(valid.map((row) => row.enrollmentId).filter((id): id is string => id !== null)),
      ]
      const pairs = enrollments.flatMap((enrollment) => {
        const pre = latest(enrollment, 'PRE_TEST')
        const post = latest(enrollment, 'POST_TEST')
        return pre && post ? [{ pre, post }] : []
      })
      const mean = (pick: (pair: (typeof pairs)[number]) => number) =>
        pairs.reduce((sum, pair) => sum + pick(pair), 0) / pairs.length
      return {
        excluded,
        pairs: pairs.length,
        meanPre: mean((pair) => normalized(pair.pre)),
        meanPost: mean((pair) => normalized(pair.post)),
        improved: pairs.filter((pair) => normalized(pair.post) > normalized(pair.pre)).length,
        declined: pairs.filter((pair) => normalized(pair.post) < normalized(pair.pre)).length,
      }
    }
    const expected = reference(rows)
    expect(expected.excluded).toBe(1)
    const shuffles = [rows, [...rows].reverse(), [...rows.slice(7), ...rows.slice(0, 7)]]
    const round = (value: number) => Math.round(value * 10) / 10
    for (const ordering of shuffles) {
      const result = computeSurveyAnalyticsFromAggregates({
        projectId,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        generatedAt,
        aggregate: surveyAggregateFromRows(ordering),
      })
      expect(result.excludedRecords).toBe(expected.excluded)
      expect(result.overall.pairs.value).toBe(String(expected.pairs))
      expect(Number(result.overall.meanPre.value)).toBeCloseTo(round(expected.meanPre), 5)
      expect(Number(result.overall.meanPost.value)).toBeCloseTo(round(expected.meanPost), 5)
      // Sub-counts may be suppressed in the released view, so compare them on the aggregate.
      const groups = surveyAggregateFromRows(ordering).groups
      expect(groups.reduce((sum, group) => sum + group.improved, 0)).toBe(expected.improved)
      expect(groups.reduce((sum, group) => sum + group.declined, 0)).toBe(expected.declined)
      expect(result).toEqual(compute(ordering))
    }
  })
})

describe('milestoneOnTimeFromCounts', () => {
  it('matches the row-based calculation', () => {
    const rows = [
      { status: 'COMPLETED', targetDate: '2026-01-10', completionDate: '2026-01-09' },
      { status: 'COMPLETED', targetDate: '2026-01-10', completionDate: '2026-01-11' },
      { status: 'COMPLETED', targetDate: null, completionDate: '2026-01-11' },
      { status: 'CANCELLED', targetDate: '2026-01-10', completionDate: null },
    ] as const
    expect(milestoneCountsFromRows(rows)).toEqual({ completed: 3, rated: 2, onTime: 1 })
    expect(milestoneOnTimeFromCounts({ completed: 3, rated: 2, onTime: 1 })).toEqual(
      milestoneOnTimeCell(rows),
    )
    expect(milestoneOnTimeFromCounts({ completed: 3, rated: 2, onTime: 1 }).value).toBe('50')
  })

  it('is MISSING (NO_COMPLETED_MILESTONES) when nothing is completed or rated', () => {
    expect(milestoneOnTimeFromCounts({ completed: 0, rated: 0, onTime: 0 })).toMatchObject({
      state: 'MISSING',
      reason: 'NO_COMPLETED_MILESTONES',
    })
    expect(milestoneOnTimeFromCounts({ completed: 2, rated: 0, onTime: 0 })).toMatchObject({
      state: 'MISSING',
      reason: 'NO_COMPLETED_MILESTONES',
    })
  })
})
