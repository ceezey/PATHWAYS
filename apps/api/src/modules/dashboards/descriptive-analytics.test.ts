import { describe, expect, it } from 'vitest'
import { buildTimelineAnalytics } from './descriptive-analytics'

const aggregate = (lastCompletedOn: string | null) => ({
  activities: {
    eligible: 2,
    completed: 1,
    overdue: 0,
    missingDates: 0,
    maxOverdueDays: null,
    lastCompletedOn,
  },
  milestones: { completed: 0, rated: 0, onTime: 0 },
})

const build = (
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED',
  lastCompletedOn: string | null,
  overrides: { archived?: boolean; endDate?: string | null } = {},
) =>
  buildTimelineAnalytics({
    projectId: '30000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    generatedAt: '2026-10-06T00:00:00.000Z',
    reportingDate: '2026-10-06',
    project: {
      status,
      archived: overrides.archived ?? false,
      startDate: '2026-01-01',
      endDate: overrides.endDate === undefined ? '2026-08-22' : overrides.endDate,
    },
    aggregate: aggregate(lastCompletedOn),
  })

describe('buildTimelineAnalytics final position', () => {
  it('completed on time reports 100% elapsed, 0 remaining and 0 overdue', () => {
    const view = build('COMPLETED', '2026-08-22')
    expect(view.elapsedPercent).toMatchObject({ state: 'AVAILABLE', value: '100' })
    expect(view.remainingDays).toMatchObject({ state: 'ZERO', value: '0' })
    expect(view.overdueDays).toMatchObject({ state: 'ZERO', value: '0' })
    expect(build('COMPLETED', '2026-08-01').overdueDays).toMatchObject({ value: '0' })
  })

  it('completed late reports days between planned end and last completion', () => {
    expect(build('COMPLETED', '2026-09-01').overdueDays).toMatchObject({
      state: 'AVAILABLE',
      value: '10',
    })
  })

  it('completed without a completion date is MISSING, never a fabricated zero', () => {
    expect(build('COMPLETED', null).overdueDays).toMatchObject({
      state: 'MISSING',
      value: null,
      reason: 'NO_COMPLETION_DATE',
    })
  })

  it('completed without a project end date is MISSING NO_PROJECT_DATES', () => {
    expect(build('COMPLETED', '2026-09-01', { endDate: null }).overdueDays).toMatchObject({
      state: 'MISSING',
      reason: 'NO_PROJECT_DATES',
    })
  })

  it('on hold computes dates like ongoing', () => {
    const hold = build('ON_HOLD', null)
    const ongoing = build('ONGOING', null)
    expect(hold.elapsedPercent).toEqual(ongoing.elapsedPercent)
    expect(hold.remainingDays).toEqual(ongoing.remainingDays)
    expect(hold.overdueDays).toMatchObject({ state: 'AVAILABLE', value: '45' })
  })

  it.each([
    ['CANCELLED', false],
    ['COMPLETED', true],
  ] as const)('%s (archived %s) stays not applicable', (status, archived) => {
    const view = build(status, '2026-09-01', { archived })
    for (const cell of [view.elapsedPercent, view.remainingDays, view.overdueDays])
      expect(cell).toMatchObject({ state: 'NOT_APPLICABLE', value: null })
  })
})
