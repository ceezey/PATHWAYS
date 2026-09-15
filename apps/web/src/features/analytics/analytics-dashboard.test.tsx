import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsDashboard } from './analytics-dashboard'

const data = vi.hoisted(() => ({
  monitoring: {
    periodStart: '2026-06-01', periodEnd: '2026-06-30', businessTimeZone: 'Asia/Manila', scopeProjectCount: 2,
    participationRecords: { state: 'MISSING', value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' },
    attendingIndividuals: { state: 'MISSING', value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' },
    enrolledIndividuals: { state: 'MISSING', value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' },
    enrolledBeneficiaryRecords: { state: 'MISSING', value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' },
    activities: [], milestones: [], indicators: [], indicatorNote: 'No indicator definition for the selected period.',
  },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: { permissions: ['analytics.read'] } }) }))
vi.mock('@/hooks/use-display-labels', () => ({ useDisplayLabels: () => ({ labels: { moduleAnalytics: 'Monitoring and analytics' } }) }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('./use-monitoring-read', () => ({ useMonitoringRead: (key: string) => ({
  data: key === 'monitoring-project-options' ? [] : key.startsWith('saddd:') ? null : data.monitoring,
  loading: false, error: null, reload: () => undefined,
}) }))
vi.mock('./analytics-charts', () => ({ AggregateChart: () => null, IndicatorComparisonChart: () => null, SadddChart: () => null }))

describe('P06 analytics interface uses aggregate contracts', () => {
  it('renders the API period/time zone and unavailable cells without mock KPI fallback', () => {
    const html = renderToStaticMarkup(createElement(AnalyticsDashboard))
    expect(html).toContain('2026-06-01')
    expect(html).toContain('2026-06-30')
    expect(html).toContain('Asia/Manila')
    expect(html).toContain('Not available')
    expect(html).not.toContain('>0%<')
    expect(html).not.toContain('Beneficiary name')
  })
  it('keeps demographic intersections and location drill-through unavailable', () => {
    const html = renderToStaticMarkup(createElement(AnalyticsDashboard))
    expect(html).toContain('Demographic intersections, location and activity drill-through are not enabled.')
    expect(html).not.toContain('name="sex"')
    expect(html).not.toContain('name="disability"')
  })
})
