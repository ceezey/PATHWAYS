import { describe, expect, it } from 'vitest'
import { activityObservation, indicatorObservation, timelineObservation } from '../rule-metrics'
import { severityFactsFromObservation } from './severity-facts'

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const record = '30000000-0000-4000-8000-000000000003'
const scope = { organizationId: org, projectId: project }
const context = { scope, conditionId: 'A', asOf: '2026-10-18T16:30:00.000Z' }
const activity = (index: number, plannedEndDate: string | null, plannedStartDate?: string) => ({
  ...scope,
  id: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  revision: '1',
  status: 'IN_PROGRESS',
  archived: false,
  plannedEndDate,
  ...(plannedStartDate ? { plannedStartDate } : {}),
})
const indicator = {
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
  targetDate: '2026-10-19',
  periodEnd: '2026-12-31',
  current: { state: 'AVAILABLE', value: '15', reason: null },
}

describe('severityFactsFromObservation', () => {
  it('counts included, due and undated members of an activity population', () => {
    const activities = Array.from({ length: 10 }, (_, index) =>
      activity(index + 1, index < 8 ? '2026-10-19' : '2026-10-20'),
    )
    const observation = activityObservation({
      ...context,
      reportingDate: '2026-10-19',
      populationRevision: '1',
      metric: 'ACTIVITY_COMPLETION_PERCENT',
      activities,
    })
    expect(severityFactsFromObservation(observation)).toEqual({
      metric: 'ACTIVITY_COMPLETION_PERCENT',
      value: '0',
      reportingDate: '2026-10-19',
      included: 10,
      dueByDate: 8,
      missingEnd: 0,
    })
  })

  it('keeps the bound activity planned dates', () => {
    const observation = activityObservation({
      ...context,
      reportingDate: '2026-10-19',
      populationRevision: '1',
      metric: 'ACTIVITY_OVERDUE_DAYS',
      activityId: record,
      activities: [{ ...activity(1, '2026-10-09', '2026-09-20'), id: record }],
    })
    expect(severityFactsFromObservation(observation)).toMatchObject({
      value: '10',
      activityStart: '2026-09-20',
      activityEnd: '2026-10-09',
    })
  })

  it('converts current value to progress and dates the indicator in Manila', () => {
    const observation = indicatorObservation({
      ...context,
      metric: 'INDICATOR_CURRENT_VALUE',
      indicator,
    })
    expect(observation.calculation).toMatchObject({
      targetDate: '2026-10-19',
      periodEnd: '2026-12-31',
    })
    expect(severityFactsFromObservation(observation)).toEqual({
      metric: 'INDICATOR_CURRENT_VALUE',
      value: '15',
      reportingDate: '2026-10-19',
      progress: '50',
      targetDate: '2026-10-19',
      periodEnd: '2026-12-31',
    })
  })

  it('leaves indicator dates null when the source has none', () => {
    const { targetDate, periodEnd, ...undated } = indicator
    const observation = indicatorObservation({
      ...context,
      metric: 'INDICATOR_PROGRESS_PERCENT',
      indicator: undated,
    })
    expect(severityFactsFromObservation(observation)).toMatchObject({
      progress: '50',
      targetDate: null,
      periodEnd: null,
    })
  })

  it('keeps project dates for timeline metrics', () => {
    const observation = timelineObservation({
      ...context,
      reportingDate: '2026-10-19',
      projectStatus: 'ONGOING',
      projectArchived: false,
      revision: '1',
      metric: 'PROJECT_OVERDUE_DAYS',
      startDate: '2026-01-01',
      endDate: '2026-10-09',
    })
    expect(severityFactsFromObservation(observation)).toEqual({
      metric: 'PROJECT_OVERDUE_DAYS',
      value: '10',
      reportingDate: '2026-10-19',
      startDate: '2026-01-01',
      endDate: '2026-10-09',
    })
  })

  it('refuses an observation without a visible value', () => {
    const observation = activityObservation({
      ...context,
      reportingDate: '2026-10-19',
      populationRevision: '1',
      metric: 'ACTIVITY_COMPLETION_PERCENT',
      activities: [],
    })
    expect(() => severityFactsFromObservation(observation)).toThrow()
  })
})
