import { describe, expect, it } from 'vitest'

import {
  deriveAnalyticsReportingPeriods,
  formatAnalyticsReportingPeriod,
} from './analytics-reporting-periods'

const indicator = (
  periodStart: string | null,
  periodEnd: string | null,
  status: 'ACTIVE' | 'ARCHIVED' | 'LEGACY_REVIEW_REQUIRED' = 'ACTIVE',
) => ({ periodStart, periodEnd, status })

describe('Analytics reporting period derivation', () => {
  it('uses distinct valid active Indicator periods and sorts newest first', () => {
    const periods = deriveAnalyticsReportingPeriods(undefined, [
      indicator('2026-01-01', '2026-01-31'),
      indicator('2026-09-01', '2026-09-30'),
      indicator('2026-09-01', '2026-09-30'),
      indicator('2026-08-01', '2026-08-31', 'ARCHIVED'),
      indicator('not-a-date', '2026-07-31'),
      indicator('2026-06-30', '2026-06-01'),
      indicator(null, null),
    ])

    expect(periods).toEqual([
      {
        value: '2026-09-01::2026-09-30',
        label: 'Sep 1\u201330, 2026',
        start: '2026-09-01',
        end: '2026-09-30',
      },
      {
        value: '2026-01-01::2026-01-31',
        label: 'Jan 1\u201331, 2026',
        start: '2026-01-01',
        end: '2026-01-31',
      },
    ])
  })

  it('keeps exact periods that overlap inclusive Project bounds and excludes the rest', () => {
    const periods = deriveAnalyticsReportingPeriods(
      { startDate: '2026-04-01', endDate: '2026-09-30' },
      [
        indicator('2026-02-01', '2026-03-31'),
        indicator('2026-03-01', '2026-04-01'),
        indicator('2026-06-01', '2026-06-30'),
        indicator('2026-09-30', '2026-10-31'),
        indicator('2026-10-01', '2026-10-31'),
      ],
    )

    expect(periods.map(({ start, end }) => [start, end])).toEqual([
      ['2026-09-30', '2026-10-31'],
      ['2026-06-01', '2026-06-30'],
      ['2026-03-01', '2026-04-01'],
    ])
  })

  it('does not fabricate or constrain periods from partial/null Project dates', () => {
    const source = [indicator('2026-09-01', '2026-09-30')]
    expect(
      deriveAnalyticsReportingPeriods({ startDate: null, endDate: null }, source),
    ).toHaveLength(1)
    expect(
      deriveAnalyticsReportingPeriods({ startDate: '2026-09-15', endDate: null }, source),
    ).toHaveLength(1)
    expect(deriveAnalyticsReportingPeriods({ startDate: null, endDate: null }, [])).toEqual([])
  })

  it('renders concise labels without changing the persisted ISO range', () => {
    expect(formatAnalyticsReportingPeriod('2026-09-01', '2026-09-30')).toBe('Sep 1\u201330, 2026')
    expect(formatAnalyticsReportingPeriod('2026-09-30', '2026-10-01')).toBe(
      'Sep 30 \u2013 Oct 1, 2026',
    )
    expect(formatAnalyticsReportingPeriod('2026-12-31', '2027-01-01')).toBe(
      'Dec 31, 2026 \u2013 Jan 1, 2027',
    )
  })
})
