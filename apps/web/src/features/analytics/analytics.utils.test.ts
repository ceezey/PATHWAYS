import {
  type SurveyAnalytics,
  type SurveyGroup,
  missingMetric,
  numericMetric,
} from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import type { ActivitySummary } from '@/types/pathways'

import { activityFallbackLabel } from './analytics.copy'
import {
  analyticsCellValue,
  businessDateInManila,
  formatShare,
  surveyErrorKindFor,
  surveyGroupRows,
} from './analytics.utils'

const group = (key: string) => ({ key }) as SurveyGroup
const activity = (id: string, title: string) => ({ id, title }) as ActivitySummary

describe('analytics dashboard helpers', () => {
  it('reads the business date in Manila, not in UTC', () => {
    expect(businessDateInManila(new Date('2026-03-31T15:59:00Z'))).toBe('2026-03-31')
    expect(businessDateInManila(new Date('2026-03-31T16:00:00Z'))).toBe('2026-04-01')
  })

  it.each([
    [{ status: 403 }, 'restricted'],
    [{ status: 400 }, 'period'],
    [{ status: 500 }, 'retry'],
    [{ status: '403' }, 'retry'],
    [new Error('offline'), 'retry'],
    [null, 'retry'],
    ['403', 'retry'],
  ])('classifies the survey error %j as %s', (caught, kind) => {
    expect(surveyErrorKindFor(caught)).toBe(kind)
  })

  it('shows a real zero with its unit and unavailable cells as readable copy', () => {
    expect(analyticsCellValue(numericMetric('0'))).toBe('0')
    expect(analyticsCellValue(numericMetric('62'), 'percent')).toBe('62%')
    expect(analyticsCellValue(numericMetric('22'), 'pp')).toBe('22pp')
    expect(analyticsCellValue(numericMetric('1200'))).toBe('1,200')
    expect(analyticsCellValue(missingMetric('NO_PAIRED_ASSESSMENTS'), 'percent')).not.toMatch(/%$/)
    expect(analyticsCellValue({ state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' })).toBe(
      'Suppressed (fewer than 5)',
    )
  })

  it('maps activity keys to titles and keeps the cohort row first', () => {
    const data = {
      overall: group('OVERALL'),
      byActivity: [group('a-1'), group('gone')],
    } as unknown as SurveyAnalytics
    const rows = surveyGroupRows(data, [activity('a-1', 'Soil workshop')])
    expect(rows.map((row) => [row.key, row.label])).toEqual([
      ['OVERALL', 'All activities (cohort change)'],
      ['a-1', 'Soil workshop'],
      ['gone', activityFallbackLabel],
    ])
    expect(activityFallbackLabel).toBe('Activity (name unavailable)')
  })

  it('formats a share as a one-decimal percent and withholds a null share', () => {
    expect(formatShare('0.256')).toBe('25.6%')
    expect(formatShare('1')).toBe('100.0%')
    expect(formatShare(null)).toBe('Withheld')
  })
})
