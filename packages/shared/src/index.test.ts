import { describe, expect, it } from 'vitest'
import * as shared from './index'

describe('shared barrel', () => {
  it('exports a name of every metric, dashboard, analytics and project contract module', () => {
    const names = [
      'numericKinds',
      'metricCellSchema',
      'dashboardQuerySchema',
      'dashboardActionCountsSchema',
      'roleOverviewSchema',
      'DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION',
      'computeSurveyAnalytics',
      'timelineAnalyticsSchema',
      'analyticsInsightsQuerySchema',
      'projectOverviewMetricsSchema',
      'projectMapSchema',
    ]
    for (const name of names) expect(shared, name).toHaveProperty(name)
  })

  it('keeps the field schemas and the rounding helper out of the barrel', () => {
    for (const name of ['date', 'uuid', 'decimal', 'round1'])
      expect(shared).not.toHaveProperty(name)
  })
})
