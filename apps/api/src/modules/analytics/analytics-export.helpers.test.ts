import type { DescriptiveAnalytics, SurveyAnalytics, TimelineAnalytics } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  descriptiveAnalyticsTable,
  surveyAnalyticsTable,
  timelineAnalyticsTable,
} from './analytics-export.helpers'

const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
const cell = { state: 'MISSING', value: null, reason: 'NO_DATA' }
const group = {
  key: 'OVERALL',
  label: 'All',
  pairs: cell,
  meanPre: cell,
  meanPost: cell,
  meanChange: cell,
  improved: cell,
  same: cell,
  declined: cell,
}

describe('analytics export tables', () => {
  it('starts the descriptive, survey and timeline tables with the same seven-column header', () => {
    const descriptive = { counts: [], distributions: [], indicatorSummaries: [] }
    const survey = { overall: group, byActivity: [] }
    const timeline = Object.fromEntries(
      [
        'elapsedPercent',
        'remainingDays',
        'overdueDays',
        'activityCompletionPercent',
        'activityOverdueCount',
        'milestoneOnTimePercent',
      ].map((field) => [field, cell]),
    )
    expect(descriptiveAnalyticsTable(descriptive as unknown as DescriptiveAnalytics)).toEqual([
      header,
    ])
    expect(surveyAnalyticsTable(survey as unknown as SurveyAnalytics)[0]).toEqual(header)
    expect(timelineAnalyticsTable(timeline as unknown as TimelineAnalytics)[0]).toEqual(header)
  })

  it('writes one survey row per metric under the header', () => {
    const survey = surveyAnalyticsTable({
      overall: group,
      byActivity: [],
    } as unknown as SurveyAnalytics)
    expect(survey).toHaveLength(8)
    expect(survey[1]).toEqual([
      'SURVEY',
      'OVERALL',
      'All - Paired assessments',
      'MISSING',
      null,
      null,
      'NO_DATA',
    ])
  })
})
