import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(path.resolve(__dirname, '..', file), 'utf8')

const removedDescriptions = [
  [
    'features/analytics/analytics-dashboard.tsx',
    'Project performance, SADDD Analysis, budget utilization, aggregate location coverage, Beneficiary reach, and Rule-Based Alerts for human review.',
  ],
  [
    'features/reports/reporting-workspace.tsx',
    'Build, preview, retain, and export project, indicator, beneficiary, and aggregate survey reports.',
  ],
  [
    'features/collection/collection-workspace.tsx',
    'Build and publish project forms, encode data, and import validated CSV, XLS, or XLSX datasets.',
  ],
  ['features/projects/project-detail-view.tsx', 'Assigned project team members.'],
  ['features/projects/project-detail-view.tsx', 'Project implementation window.'],
  [
    'features/projects/project-activities-workspace.tsx',
    'Scan all filtered activities in one view.',
  ],
  ['features/settings/user-management-workspace.tsx', 'Related configuration.'],
  [
    'features/projects/project-review-workspace.tsx',
    'Generated report references for the project.',
  ],
  ['features/projects/project-review-workspace.tsx', 'Human review notes.'],
  ['features/projects/project-review-workspace.tsx', 'Formal review entries.'],
] as const

describe('"None yet" empty states versus error and permission wording', () => {
  it('replaces the hardcoded project metric fallback with endpoint-driven tiles', () => {
    for (const file of [
      'features/projects/project-detail-view.tsx',
      'features/projects/project-directory.tsx',
      'features/projects/project-preview-dialog.tsx',
      'lib/services/pathways-client.ts',
    ]) {
      expect(source(file)).not.toContain('metricsAvailable')
      expect(source(file)).not.toContain(': `Unavailable / ')
    }
    expect(source('features/projects/project-utils.ts')).toContain("return 'None yet'")
    expect(source('features/projects/project-overview-metrics.tsx')).toContain(
      'Project metrics could not be loaded.',
    )
  })

  it.each([
    ['features/projects/connected-delivery-workspace.tsx', "indicator.target ?? 'None yet'"],
    ['features/projects/connected-delivery-workspace.tsx', "indicator.unit || 'None yet'"],
    ['features/projects/connected-delivery-workspace.tsx', "indicator.dataSource || 'None yet'"],
    ['features/reports/reporting-workspace.tsx', "indicator.target ?? 'None yet'"],
    [
      'features/analytics/analytics-dashboard.tsx',
      'const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError',
    ],
    ['features/analytics/analytics-dashboard.tsx', ': monitoringReadable'],
    ['features/analytics/analytics-dashboard.tsx', "row.mean ?? 'None yet'"],
    ['features/projects/activity-detail-panel.tsx', "canReadBudgets ? 'None yet' : 'Unavailable'"],
  ])('uses "None yet" for a genuinely empty value in %s', (file, copy) => {
    expect(source(file)).toContain(copy)
  })

  it.each([
    ['features/projects/project-detail-view.tsx', 'title="Project data unavailable"'],
    ['features/projects/project-directory.tsx', 'title="Project data unavailable"'],
    ['features/projects/project-activities-workspace.tsx', 'title="Activities unavailable"'],
    ['features/projects/project-review-workspace.tsx', 'title="Some information is unavailable"'],
    ['features/analytics/rule-configuration-workspace.tsx', 'title="Rule access unavailable"'],
    ['features/analytics/rule-configuration-workspace.tsx', 'title="Rules unavailable"'],
    [
      'features/projects/project-rules-panel.tsx',
      'Project alerts are unavailable for your current access.',
    ],
    [
      'features/projects/connected-delivery-workspace.tsx',
      "budget ? peso(budget.plannedAmount) : 'Unavailable'",
    ],
    [
      'features/projects/connected-delivery-workspace.tsx',
      "{indicator.disaggregation || 'Unavailable'}",
    ],
    ['features/projects/project-utils.ts', '// Unknown reasons are not assumed to be empty.'],
  ])('keeps load-failure, permission and capability wording in %s', (file, copy) => {
    expect(source(file)).toContain(copy)
  })

  it('never shows "None yet" for indicator data the role cannot read or for unmapped fields', () => {
    expect(source('features/analytics/analytics-dashboard.tsx')).not.toContain(
      "averageKpi === null ? 'None yet'",
    )
    expect(source('features/projects/connected-delivery-workspace.tsx')).not.toContain(
      "indicator.disaggregation || 'None yet'",
    )
  })

  it('derives the participation empty-chart title from the shared metric-unavailable helper, not an unconditional "None yet"', () => {
    const analytics = source('features/analytics/analytics-dashboard.tsx')
    expect(analytics).toContain(
      "import { metricUnavailableLabel, overviewMetricLabel } from '@/features/projects/project-utils'",
    )
    expect(analytics).toContain('participationEmptyTitle')
    // Whitespace-insensitive: only the ternary's structure matters, not its exact
    // indentation, which is free to reflow with surrounding JSX.
    const normalizedWhitespace = analytics.replace(/\s+/g, ' ')
    expect(normalizedWhitespace).toContain(
      "analysisView === 'participation' ? participationEmptyTitle : 'None yet'",
    )
    const projectUtils = source('features/projects/project-utils.ts')
    expect(projectUtils).toContain('export const metricUnavailableLabel')
    expect(projectUtils).toContain('return metricUnavailableLabel(cell)')
  })
})

describe('Phase 4 UI copy cleanup contract', () => {
  it.each(removedDescriptions)('removes the approved description from %s', (file, copy) => {
    expect(source(file)).not.toContain(copy)
  })

  it('keeps route verification active and removes only its explanatory status copy', () => {
    const guard = source('components/layout/route-access-guard.tsx')
    expect(guard).toContain('requestRouteCheck(')
    expect(guard).toContain('accessRefreshing')
    expect(guard).toContain('verificationRevision')
    expect(guard).toContain('<LoadingSkeleton')
    expect(guard).not.toContain('Verifying current route access')
    expect(guard).not.toContain('Rechecking current access')
  })

  it('retains operational access, security, privacy, and human-review copy', () => {
    expect(source('components/layout/route-access-guard.tsx')).toContain(
      'No protected content is shown. Your session has not been reset.',
    )
    expect(source('components/layout/protected-route.tsx')).toContain(
      'Verifying MFA and database-backed access...',
    )
    expect(source('components/layout/beneficiary-access-gate.tsx')).toContain(
      'Verify beneficiary module access',
    )
    expect(source('features/analytics/analytics-dashboard.tsx')).toContain(
      '{humanReviewDisclaimer}',
    )
    expect(source('features/analytics/analytics-coverage-map.tsx')).toContain(
      'No mapped locations available',
    )
  })
})
