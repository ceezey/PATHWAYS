import { describe, expect, it } from 'vitest'
import { activityObservation, indicatorObservation, timelineObservation } from './rule-metrics'

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
