import { describe, expect, it } from 'vitest'
import {
  type SurveyAssessmentRow,
  computeSurveyAnalytics,
  computeSurveyAnalyticsFromAggregates,
  surveyAggregateFromRows,
} from './survey-analytics'

const projectId = '20000000-0000-4000-8000-00000000000a'
const generatedAt = '2026-09-29T00:00:00.000Z'

function compute(rows: SurveyAssessmentRow[]) {
  return computeSurveyAnalytics({
    projectId,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    generatedAt,
    rows,
  })
}

describe('computeSurveyAnalyticsFromAggregates (trusted database aggregates)', () => {
  const aggregateInput = (aggregate: unknown) => ({
    projectId,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    generatedAt,
    aggregate: aggregate as never,
  })

  it('computes means from group sums with round1 half-away-from-zero and releases exact counts', () => {
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

  it('releases a group with 1-4 pairs exactly alongside a larger group', () => {
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
            improved: 2,
            same: 1,
            declined: 0,
          },
        ],
      }),
    )
    expect(result.overall).toMatchObject({
      pairs: { state: 'AVAILABLE', value: '8' },
      improved: { state: 'AVAILABLE', value: '7' },
      same: { state: 'AVAILABLE', value: '1' },
    })
    expect(result.byActivity.map((group) => group.key)).toEqual(['act-a', 'act-b'])
    expect(result.byActivity[1]).toMatchObject({
      pairs: { state: 'AVAILABLE', value: '3' },
      meanPre: { value: '40' },
      meanPost: { value: '50' },
      meanChange: { value: '10' },
      improved: { state: 'AVAILABLE', value: '2' },
      same: { state: 'AVAILABLE', value: '1' },
      declined: { state: 'ZERO', value: '0' },
    })
  })

  it('keeps the breakdown exact when the no-activity residual is small (1-4)', () => {
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
    expect(result.overall.pairs).toMatchObject({ state: 'AVAILABLE', value: '7' })
    expect(result.byActivity).toHaveLength(1)
    expect(result.byActivity[0]).toMatchObject({
      key: 'act-a',
      pairs: { state: 'AVAILABLE', value: '5' },
      improved: { state: 'AVAILABLE', value: '5' },
    })
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
      expect(result.overall.improved.value).toBe(String(expected.improved))
      expect(result.overall.declined.value).toBe(String(expected.declined))
      const groups = surveyAggregateFromRows(ordering).groups
      expect(groups.reduce((sum, group) => sum + group.improved, 0)).toBe(expected.improved)
      expect(groups.reduce((sum, group) => sum + group.declined, 0)).toBe(expected.declined)
      expect(result).toEqual(compute(ordering))
    }
  })
})
