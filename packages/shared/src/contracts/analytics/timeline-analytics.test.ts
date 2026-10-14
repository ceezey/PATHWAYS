import { describe, expect, it } from 'vitest'
import {
  TIMELINE_ANALYTICS_CONTRACT_VERSION,
  type TimelineMilestoneRow,
  milestoneCountsFromRows,
  milestoneCountsSchema,
  milestoneOnTimeCell,
  milestoneOnTimeFromCounts,
  timelineAnalyticsSchema,
} from './timeline-analytics'

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

describe('timelineAnalyticsSchema', () => {
  const cell = { state: 'ZERO', value: '0', reason: null }
  const valid = {
    contractVersion: TIMELINE_ANALYTICS_CONTRACT_VERSION,
    projectId: '77000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-01T00:00:00Z',
    reportingDate: '2026-06-01',
    elapsedPercent: cell,
    remainingDays: cell,
    overdueDays: cell,
    activityCompletionPercent: cell,
    activityOverdueCount: cell,
    milestoneOnTimePercent: cell,
  }

  it('accepts a full payload', () => {
    expect(timelineAnalyticsSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an unknown key', () => {
    expect(timelineAnalyticsSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})

describe('milestoneCountsSchema', () => {
  it('accepts ordered counts', () => {
    expect(milestoneCountsSchema.safeParse({ completed: 3, rated: 2, onTime: 1 }).success).toBe(
      true,
    )
  })

  it('rejects an unknown key', () => {
    expect(
      milestoneCountsSchema.safeParse({ completed: 1, rated: 1, onTime: 1, extra: 1 }).success,
    ).toBe(false)
  })

  it('rejects counts that break onTime <= rated <= completed with the contract message', () => {
    const result = milestoneCountsSchema.safeParse({ completed: 1, rated: 2, onTime: 1 })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      'Milestone counts must satisfy onTime <= rated <= completed.',
    ])
  })
})
