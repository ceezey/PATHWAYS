import { describe, expect, it } from 'vitest'
import {
  PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION,
  budgetUtilization,
  kpiAchievement,
  moneyCents,
  overviewPercent,
  projectOverviewMetricsSchema,
  timelineProgress,
} from './overview-metrics'

const available = (value: string) => ({ state: 'AVAILABLE' as const, value, reason: null })

describe('project overview metric math', () => {
  it('rounds percentages once to one decimal place, half away from zero', () => {
    expect(overviewPercent(1n, 3n)).toEqual(available('33.3'))
    expect(overviewPercent(2n, 3n)).toEqual(available('66.7'))
    expect(overviewPercent(1n, 8n)).toEqual(available('12.5'))
    expect(overviewPercent(1n, 16n)).toEqual(available('6.3'))
    expect(overviewPercent(0n, 5n)).toEqual({ state: 'ZERO', value: '0', reason: null })
    expect(overviewPercent(3n, 2n)).toEqual(available('150'))
    expect(overviewPercent(1n, 0n)).toEqual({
      state: 'NOT_APPLICABLE',
      value: null,
      reason: 'ZERO_DENOMINATOR',
    })
  })

  it('averages only reported indicator progress and never counts missing values as zero', () => {
    const result = kpiAchievement([
      available('50'),
      available('75.25'),
      { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
      { state: 'NOT_APPLICABLE', value: null, reason: 'BASELINE_TARGET_DIRECTION_REQUIRED' },
    ])
    expect(result).toEqual({ metric: available('62.6'), indicatorCount: 4, reportedCount: 2 })
    expect(kpiAchievement([{ state: 'ZERO', value: '0', reason: null }]).metric.state).toBe('ZERO')
    expect(kpiAchievement([])).toEqual({
      metric: { state: 'MISSING', value: null, reason: 'NO_INDICATORS' },
      indicatorCount: 0,
      reportedCount: 0,
    })
    expect(
      kpiAchievement([{ state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' }]).metric,
    ).toEqual({ state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' })
  })

  it('keeps negative indicator movement visible instead of clamping it', () => {
    expect(kpiAchievement([available('-20'), available('10')]).metric).toEqual(available('-5'))
  })

  it('derives budget utilization from exact cents without floating point', () => {
    expect(moneyCents('1234.5')).toBe(123450n)
    expect(budgetUtilization('1000.00', '333.33')).toEqual(available('33.3'))
    expect(budgetUtilization('1000.00', '0.00')).toEqual({
      state: 'ZERO',
      value: '0',
      reason: null,
    })
    expect(budgetUtilization('100.00', '120.00')).toEqual(available('120'))
    expect(budgetUtilization(null, '50.00')).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'NO_PLANNED_BUDGET',
    })
    expect(budgetUtilization('0.00', '50.00').state).toBe('NOT_APPLICABLE')
    expect(() => moneyCents('-1')).toThrow()
  })

  it('derives the timeline from inclusive project dates and clamps it to the project window', () => {
    expect(timelineProgress('2026-01-01', '2026-01-10', '2026-01-05')).toEqual(available('50'))
    expect(timelineProgress('2026-01-01', '2026-01-10', '2025-12-31').state).toBe('ZERO')
    expect(timelineProgress('2026-01-01', '2026-01-10', '2026-03-01')).toEqual(available('100'))
    expect(timelineProgress('2026-01-01', '2026-01-01', '2026-01-01')).toEqual(available('100'))
    expect(timelineProgress(null, '2026-01-10', '2026-01-05')).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'PROJECT_DATES_REQUIRED',
    })
    expect(timelineProgress('2026-02-01', '2026-01-10', '2026-01-05').reason).toBe(
      'PROJECT_DATES_INVALID',
    )
  })

  it('rejects a response that carries a value for a suppressed or missing cell', () => {
    const base = {
      contractVersion: PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION,
      projectId: '11000000-0000-4000-8000-000000000001',
      businessDate: '2026-09-28',
      generatedAt: '2026-09-28T00:00:00.000Z',
      kpiAchievement: null,
      budgetUtilization: null,
      beneficiariesReached: {
        metric: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
        target: 100,
      },
      timeline: {
        metric: available('50'),
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    }
    expect(projectOverviewMetricsSchema.safeParse(base).success).toBe(true)
    expect(
      projectOverviewMetricsSchema.safeParse({
        ...base,
        beneficiariesReached: {
          metric: { state: 'SUPPRESSED', value: '3', reason: 'SMALL_CELL' },
          target: 100,
        },
      }).success,
    ).toBe(false)
  })
})
