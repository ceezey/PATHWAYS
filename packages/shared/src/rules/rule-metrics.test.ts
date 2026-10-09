import { describe, expect, it } from 'vitest'
import {
  activityObservation,
  beneficiaryFollowUpObservation,
  budgetObservation,
  indicatorObservation,
  timelineObservation as observeTimeline,
  surveyImprovementObservation,
} from './rule-metrics'
const timelineObservation = (input: Record<string, unknown>) =>
  observeTimeline({ projectStatus: 'PLANNED', projectArchived: false, ...input })

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const record = '30000000-0000-4000-8000-000000000003'
const scope = { organizationId: org, projectId: project }
const context = { scope, conditionId: 'A', asOf: '2026-09-26T00:00:00.000Z' }
const indicator = () => ({
  ...scope,
  id: record,
  revision: '1',
  status: 'ACTIVE',
  mode: 'MANUAL',
  recipe: null,
  numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER',
  baseline: '10',
  target: '20',
  current: { state: 'AVAILABLE', value: '15', reason: null },
})
const activity = (
  id = record,
  status = 'IN_PROGRESS',
  plannedEndDate: string | null = '2026-09-25',
) => ({
  ...scope,
  id,
  revision: '1',
  status,
  archived: false,
  plannedEndDate,
})

describe('trusted indicator observations', () => {
  it('uses persisted current and baseline-to-target progress', () => {
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_CURRENT_VALUE',
        indicator: indicator(),
      }).cell.value,
    ).toBe('15')
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_PROGRESS_PERCENT',
        indicator: indicator(),
      }).cell.value,
    ).toBe('50')
  })
  it.each([
    ['5', '-50'],
    ['25', '150'],
  ] as const)('preserves signed uncapped progress %s -> %s', (actual, expected) => {
    const source = indicator()
    source.current.value = actual
    expect(
      indicatorObservation({ ...context, metric: 'INDICATOR_PROGRESS_PERCENT', indicator: source })
        .cell.value,
    ).toBe(expected)
  })
  it('handles lower-is-better, equal targets and absent direction', () => {
    const source = { ...indicator(), baseline: '20', target: '10', direction: 'LOWER_IS_BETTER' }
    expect(
      indicatorObservation({ ...context, metric: 'INDICATOR_PROGRESS_PERCENT', indicator: source })
        .cell.value,
    ).toBe('50')
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_PROGRESS_PERCENT',
        indicator: { ...source, target: '20' },
      }).cell.reason,
    ).toBe('ZERO_DENOMINATOR')
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_PROGRESS_PERCENT',
        indicator: { ...source, direction: null },
      }).cell.value,
    ).toBeNull()
  })
  it.each([
    'FORM_NUMERIC_SUM',
    'FORM_NUMERIC_AVERAGE',
    'DISTINCT_ATTENDING_INDIVIDUALS',
    'EFFECTIVE_JOURNEY_EVENT_COUNT',
  ])('withholds %s without calculating private progress', (recipe) => {
    const result = indicatorObservation({
      ...context,
      metric: 'INDICATOR_PROGRESS_PERCENT',
      indicator: { ...indicator(), mode: 'DERIVED', recipe },
    })
    expect(result.cell).toMatchObject({ value: null, reason: 'UNSUPPORTED_SOURCE' })
  })
  it('supports the approved activity-derived indicator', () => {
    const result = indicatorObservation({
      ...context,
      metric: 'INDICATOR_CURRENT_VALUE',
      indicator: {
        ...indicator(),
        mode: 'DERIVED',
        recipe: 'ACTIVITY_COMPLETION_PERCENTAGE',
        numericKind: 'PERCENTAGE',
      },
    })
    expect(result.source?.kind).toBe('ACTIVITY_COMPLETION_INDICATOR')
    expect(result.cell.value).toBe('15')
  })
  it('withholds mismatched activity recipe numeric kind and values outside its range', () => {
    const source = { ...indicator(), mode: 'DERIVED', recipe: 'ACTIVITY_COMPLETION_PERCENTAGE' }
    expect(
      indicatorObservation({ ...context, metric: 'INDICATOR_CURRENT_VALUE', indicator: source })
        .cell.reason,
    ).toBe('UNSUPPORTED_SOURCE')
    for (const value of ['-1', '101'])
      expect(
        indicatorObservation({
          ...context,
          metric: 'INDICATOR_CURRENT_VALUE',
          indicator: {
            ...source,
            numericKind: 'PERCENTAGE',
            current: { state: 'AVAILABLE', value, reason: null },
          },
        }).cell.reason,
      ).toBe('INVALID_METRIC')
  })
  it('retains safe indicator calculation inputs without copying freeform source data', () => {
    const result = indicatorObservation({
      ...context,
      metric: 'INDICATOR_PROGRESS_PERCENT',
      indicator: indicator(),
    })
    expect(result.calculation).toMatchObject({
      kind: 'INDICATOR',
      baseline: '10',
      target: '20',
      current: '15',
      numericKind: 'SIGNED_CHANGE',
      direction: 'HIGHER_IS_BETTER',
    })
  })
  it('strips suppressed source evidence and withholds malformed measurements', () => {
    const source = {
      ...indicator(),
      current: { state: 'SUPPRESSED', value: null, reason: 'WITHHELD' },
    }
    const result = indicatorObservation({
      ...context,
      metric: 'INDICATOR_CURRENT_VALUE',
      indicator: source,
    })
    expect(result.cell).toEqual({ state: 'SUPPRESSED', value: null, reason: 'SUPPRESSED' })
    expect(result.source).toBeNull()
    expect(result.calculation).toBeNull()
    const progress = indicatorObservation({
      ...context,
      metric: 'INDICATOR_PROGRESS_PERCENT',
      indicator: { ...source, direction: null },
    })
    expect(progress.cell.state).toBe('SUPPRESSED')
    expect(progress.calculation).toBeNull()
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_CURRENT_VALUE',
        indicator: { ...indicator(), current: { state: 'AVAILABLE', value: 'NaN', reason: null } },
      }).cell.value,
    ).toBeNull()
  })
  it('rejects cross-project/organization inputs and legacy indicators are unavailable', () => {
    expect(() =>
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_CURRENT_VALUE',
        indicator: { ...indicator(), projectId: org },
      }),
    ).toThrow()
    expect(() =>
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_CURRENT_VALUE',
        indicator: { ...indicator(), organizationId: project },
      }),
    ).toThrow()
    expect(
      indicatorObservation({
        ...context,
        metric: 'INDICATOR_CURRENT_VALUE',
        indicator: { ...indicator(), status: 'LEGACY_REVIEW_REQUIRED' },
      }).cell.reason,
    ).toBe('LEGACY_REVIEW_REQUIRED')
  })
})

describe('business calendar timeline metrics', () => {
  it('withdraws completed, held, cancelled and archived timelines under the approved applicability contract', () => {
    const base = {
      ...context,
      reportingDate: '2026-09-26',
      startDate: '2026-09-20',
      endDate: '2026-09-25',
      revision: '1',
    }
    for (const metric of [
      'PROJECT_TIMELINE_ELAPSED_PERCENT',
      'PROJECT_REMAINING_DAYS',
      'PROJECT_OVERDUE_DAYS',
    ]) {
      for (const projectStatus of ['COMPLETED', 'ON_HOLD', 'CANCELLED'])
        expect(timelineObservation({ ...base, metric, projectStatus }).cell).toEqual({
          state: 'NOT_APPLICABLE',
          value: null,
          reason: 'NOT_APPLICABLE',
        })
      expect(timelineObservation({ ...base, metric, projectArchived: true }).cell.state).toBe(
        'NOT_APPLICABLE',
      )
      expect(
        timelineObservation({ ...base, metric, projectStatus: 'ONGOING' }).cell.value,
      ).not.toBeNull()
    }
    expect(() => observeTimeline({ ...base, metric: 'PROJECT_OVERDUE_DAYS' })).toThrow()
  })
  it.each([
    ['2026-09-19', '0', '11', '0'],
    ['2026-09-20', '0', '10', '0'],
    ['2026-09-25', '50', '5', '0'],
    ['2026-09-30', '100', '0', '0'],
    ['2026-10-01', '110', '-1', '1'],
  ])('calculates explicit reporting date %s', (reportingDate, elapsed, remaining, overdue) => {
    const input = {
      ...context,
      reportingDate,
      startDate: '2026-09-20',
      endDate: '2026-09-30',
      revision: '1',
    }
    expect(
      timelineObservation({ ...input, metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT' }).cell.value,
    ).toBe(elapsed)
    expect(timelineObservation({ ...input, metric: 'PROJECT_REMAINING_DAYS' }).cell.value).toBe(
      remaining,
    )
    expect(timelineObservation({ ...input, metric: 'PROJECT_OVERDUE_DAYS' }).cell.value).toBe(
      overdue,
    )
  })
  it.each([
    [null, '2026-09-30', 'MISSING_DATES'],
    ['2026-02-30', '2026-09-30', 'INVALID_DATES'],
    ['2026-10-01', '2026-09-30', 'INVALID_DATES'],
    ['2026-09-30', '2026-09-30', 'ZERO_DENOMINATOR'],
  ])('withholds invalid ratio for %s / %s', (startDate, endDate, reason) => {
    expect(
      timelineObservation({
        ...context,
        reportingDate: '2026-09-26',
        startDate,
        endDate,
        revision: '1',
        metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT',
      }).cell.reason,
    ).toBe(reason)
  })
  it('rejects impossible reporting dates instead of consulting the clock', () => {
    expect(() =>
      timelineObservation({
        ...context,
        reportingDate: '2026-02-30',
        startDate: null,
        endDate: null,
        revision: '1',
        metric: 'PROJECT_REMAINING_DAYS',
      }),
    ).toThrow()
  })
  it('retains reporting business date and persisted project date inputs', () => {
    const result = timelineObservation({
      ...context,
      reportingDate: '2026-09-26',
      startDate: '2026-09-20',
      endDate: '2026-09-30',
      revision: '1',
      metric: 'PROJECT_REMAINING_DAYS',
    })
    expect(result.calculation).toEqual({
      kind: 'PROJECT_TIMELINE',
      projectStatus: 'PLANNED',
      projectArchived: false,
      reportingDate: '2026-09-26',
      startDate: '2026-09-20',
      endDate: '2026-09-30',
    })
  })
})

describe('complete scoped activity population', () => {
  const base = { ...context, reportingDate: '2026-09-26', populationRevision: '1' }
  it('excludes cancelled/archived records and computes exact completion', () => {
    const activities = [
      activity(record, 'COMPLETED'),
      activity(project),
      activity(org, 'CANCELLED'),
      { ...activity('40000000-0000-4000-8000-000000000004'), archived: true },
    ]
    expect(
      activityObservation({ ...base, metric: 'ACTIVITY_COMPLETION_PERCENT', activities }).cell
        .value,
    ).toBe('50')
    expect(
      activityObservation({ ...base, metric: 'ACTIVITY_OVERDUE_COUNT', activities }).cell.value,
    ).toBe('1')
    const calculation = activityObservation({
      ...base,
      metric: 'ACTIVITY_COMPLETION_PERCENT',
      activities,
    }).calculation
    expect(calculation).toHaveProperty('members.length', 2)
    expect(calculation).toHaveProperty('reportingDate', '2026-09-26')
  })
  it.each(['ACTIVITY_COMPLETION_PERCENT', 'ACTIVITY_OVERDUE_COUNT'])(
    'does not invent zero for empty %s',
    (metric) => {
      expect(activityObservation({ ...base, metric, activities: [] }).cell.reason).toBe(
        'EMPTY_POPULATION',
      )
    },
  )
  it('preserves zero for an actual nonempty population and counts only incomplete overdue records', () => {
    expect(
      activityObservation({
        ...base,
        metric: 'ACTIVITY_COMPLETION_PERCENT',
        activities: [activity()],
      }).cell.state,
    ).toBe('ZERO')
    expect(
      activityObservation({
        ...base,
        metric: 'ACTIVITY_OVERDUE_COUNT',
        activities: [activity(record, 'COMPLETED', null)],
      }).cell.value,
    ).toBe('0')
    expect(
      activityObservation({
        ...base,
        metric: 'ACTIVITY_OVERDUE_COUNT',
        activities: [activity(record, 'IN_PROGRESS', null)],
      }).cell.value,
    ).toBeNull()
  })
  it('binds an individual activity for overdue days and preserves due-date boundaries', () => {
    expect(
      activityObservation({
        ...base,
        metric: 'ACTIVITY_OVERDUE_DAYS',
        activityId: record,
        activities: [activity()],
      }).cell.value,
    ).toBe('1')
    expect(
      activityObservation({
        ...base,
        metric: 'ACTIVITY_OVERDUE_DAYS',
        activityId: record,
        activities: [activity(record, 'IN_PROGRESS', '2026-09-26')],
      }).cell.value,
    ).toBe('0')
    expect(() =>
      activityObservation({ ...base, metric: 'ACTIVITY_OVERDUE_DAYS', activities: [activity()] }),
    ).toThrow()
  })
  it('rejects foreign scope, duplicates, unknown state and excessive populations', () => {
    const input = { ...base, metric: 'ACTIVITY_COMPLETION_PERCENT' }
    for (const activities of [
      [{ ...activity(), organizationId: project }],
      [{ ...activity(), projectId: org }],
      [activity(), activity()],
      [activity(record, 'UNKNOWN')],
      Array.from({ length: 1001 }, () => activity()),
    ])
      expect(() => activityObservation({ ...input, activities })).toThrow()
  })
})

describe('aggregate-only project observations', () => {
  const open = { projectStatus: 'ONGOING', projectArchived: false, revision: '1' }
  const budget = (patch: Record<string, unknown> = {}) =>
    budgetObservation({
      ...context,
      ...open,
      recordCount: 2,
      currencyCount: 1,
      plannedTotal: '200',
      approvedExpenseTotal: '50',
      ...patch,
    })
  const follow = (population: number, followUp: number, patch: Record<string, unknown> = {}) =>
    beneficiaryFollowUpObservation({ ...context, ...open, population, followUp, ...patch })
  const survey = (pairCount: number, differenceSum: string, patch: Record<string, unknown> = {}) =>
    surveyImprovementObservation({ ...context, ...open, pairCount, differenceSum, ...patch })

  it('computes budget utilization exactly, uncapped, with project-level evidence', () => {
    const result = budget()
    expect(result.cell).toEqual({ state: 'AVAILABLE', value: '25', reason: null })
    expect(result.source).toEqual({ kind: 'BUDGET_AGGREGATE', recordId: project, revision: '1' })
    expect(budget({ approvedExpenseTotal: '300' }).cell.value).toBe('150')
    expect(budget({ plannedTotal: '3', approvedExpenseTotal: '1' }).cell.value).toBe('33.3333')
    expect(budget({ approvedExpenseTotal: '0' }).cell.state).toBe('ZERO')
  })
  it('reports budget unavailable reasons from existing codes', () => {
    expect(budget({ recordCount: 0 }).cell.reason).toBe('EMPTY_POPULATION')
    expect(budget({ plannedTotal: '0' }).cell.reason).toBe('ZERO_DENOMINATOR')
    expect(budget({ currencyCount: 2 }).cell.reason).toBe('UNSUPPORTED_SOURCE')
    expect(
      budget({ plannedTotal: '0.0001', approvedExpenseTotal: '99999999999999' }).cell.reason,
    ).toBe('PROGRESS_OUT_OF_RANGE')
    expect(() => budget({ plannedTotal: '-1' })).toThrow()
  })
  it('suppresses beneficiary follow-up at the cohort boundaries', () => {
    expect(follow(10, 4).cell.state).toBe('SUPPRESSED')
    expect(follow(10, 5).cell).toEqual({ state: 'AVAILABLE', value: '50', reason: null })
    expect(follow(10, 0).cell.state).toBe('ZERO')
    expect(follow(10, 10).cell.value).toBe('100')
    expect(follow(5, 5).cell.value).toBe('100')
    expect(follow(5, 0).cell.state).toBe('ZERO')
    expect(follow(0, 0).cell.reason).toBe('EMPTY_POPULATION')
    for (const [population, count] of [
      [4, 0],
      [4, 4],
      [10, 1],
      [10, 4],
      [10, 6],
      [10, 9],
    ])
      expect(follow(population, count).cell).toEqual({
        state: 'SUPPRESSED',
        value: null,
        reason: 'SUPPRESSED',
      })
    expect(follow(10, 5).calculation).toEqual({
      kind: 'BENEFICIARY_AGGREGATE',
      population: 10,
      followUp: 5,
    })
    expect(() => follow(3, 4)).toThrow()
  })
  it('averages signed survey improvement and suppresses fewer than five pairs', () => {
    expect(survey(5, '10').cell.value).toBe('2')
    expect(survey(6, '-15').cell.value).toBe('-2.5')
    expect(survey(7, '1').cell.value).toBe('0.1429')
    expect(survey(5, '0').cell.state).toBe('ZERO')
    expect(survey(5, '500').cell.value).toBe('100')
    expect(survey(5, '-500').cell.value).toBe('-100')
    expect(survey(4, '10').cell).toEqual({
      state: 'SUPPRESSED',
      value: null,
      reason: 'SUPPRESSED',
    })
    expect(survey(0, '0').cell.reason).toBe('EMPTY_POPULATION')
  })
  it('is not applicable for archived or non-active projects and never leaks sources', () => {
    for (const patch of [{ projectArchived: true }, { projectStatus: 'COMPLETED' }]) {
      for (const result of [budget(patch), follow(10, 5, patch), survey(6, '12', patch)]) {
        expect(result.cell).toEqual({
          state: 'NOT_APPLICABLE',
          value: null,
          reason: 'NOT_APPLICABLE',
        })
        expect(result.source).toBeNull()
        expect(result.calculation).toBeNull()
      }
    }
    expect(follow(4, 2).source).toBeNull()
  })
})
