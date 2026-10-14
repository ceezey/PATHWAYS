import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(path.resolve(__dirname, '..', file), 'utf8')

const removedDescriptions = [
  [
    'features/analytics/components/analytics-dashboard.tsx',
    'Project performance, SADDD Analysis, budget utilization, aggregate location coverage, Beneficiary reach, and Rule-Based Alerts for human review.',
  ],
  [
    'features/collection/forms/components/collection-workspace.tsx',
    'Build and publish project forms, encode data, and import validated CSV, XLS, or XLSX datasets.',
  ],
  ['features/projects/components/project-detail-view.tsx', 'Assigned project team members.'],
  ['features/projects/components/project-detail-view.tsx', 'Project implementation window.'],
  [
    'features/projects/activities/components/project-activities-workspace.tsx',
    'Scan all filtered activities in one view.',
  ],
  ['features/settings/user-management-workspace.tsx', 'Related configuration.'],
  [
    'features/projects/components/project-review-workspace.tsx',
    'Generated report references for the project.',
  ],
  ['features/projects/components/project-review-workspace.tsx', 'Human review notes.'],
  ['features/projects/components/project-review-workspace.tsx', 'Formal review entries.'],
] as const

describe('"None yet" empty states versus error and permission wording', () => {
  it('replaces the hardcoded project metric fallback with endpoint-driven tiles', () => {
    for (const file of [
      'features/projects/components/project-detail-view.tsx',
      'features/projects/components/project-directory.tsx',
      'lib/services/pathways-client.ts',
    ]) {
      expect(source(file)).not.toContain('metricsAvailable')
      expect(source(file)).not.toContain(': `Unavailable / ')
    }
    expect(source('features/projects/projects.utils.ts')).toContain("return 'None yet'")
    expect(source('features/projects/components/project-overview-metrics.tsx')).toContain(
      'Project metrics could not be loaded.',
    )
  })

  it.each([
    [
      'features/analytics/components/analytics-dashboard.tsx',
      'const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError',
    ],
    ['features/analytics/components/analytics-summary-cards.tsx', ': monitoringReadable'],
    ['features/analytics/components/descriptive-statistics-table.tsx', "row.mean ?? 'None yet'"],
    [
      'features/projects/activities/components/activity-detail-sections.tsx',
      "canReadBudgets ? 'None yet' : 'Unavailable'",
    ],
  ])('uses "None yet" for a genuinely empty value in %s', (file, copy) => {
    expect(source(file)).toContain(copy)
  })

  it.each([
    ['features/projects/components/project-detail-view.tsx', 'title="Project data unavailable"'],
    ['features/projects/components/project-directory.tsx', 'title="Project data unavailable"'],
    [
      'features/projects/activities/components/project-activities-workspace.tsx',
      'title="Activities unavailable"',
    ],
    [
      'features/projects/components/project-review-workspace.tsx',
      'title="Some information is unavailable"',
    ],
    [
      'features/rules/components/project-rules-panel.tsx',
      'Project alerts are unavailable for your current access.',
    ],
    ['features/projects/projects.utils.ts', '// Unknown reasons are not assumed to be empty.'],
  ])('keeps load-failure, permission and capability wording in %s', (file, copy) => {
    expect(source(file)).toContain(copy)
  })

  it.each([
    'features/analytics/components/analytics-dashboard.tsx',
    'features/analytics/components/analytics-summary-cards.tsx',
  ])('never shows "None yet" for indicator data the role cannot read in %s', (file) => {
    expect(source(file)).toContain('averageKpi')
    expect(source(file)).not.toContain("averageKpi === null ? 'None yet'")
  })

  it('derives the participation empty-chart title from the shared metric-unavailable helper, not an unconditional "None yet"', () => {
    const analytics = source('features/analytics/components/analytics-analysis-panel.tsx')
    expect(source('features/analytics/components/survey-analytics-panel.tsx')).toContain(
      "import { metricUnavailableLabel } from '@/features/projects'",
    )
    expect(source('features/analytics/analytics.utils.ts')).toContain(
      "import { overviewMetricLabel } from '@/features/projects'",
    )
    // Participation now renders its own breakdown panel, so no unconditional "None yet" title remains.
    expect(analytics).toContain('ParticipationBreakdownPanel')
    expect(analytics.replace(/\s+/g, ' ')).not.toContain(
      "analysisView === 'participation' ? 'None yet'",
    )
    const projectUtils = source('features/projects/projects.utils.ts')
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
    expect(source('features/analytics/components/analytics-coverage-map.tsx')).toContain(
      'No mapped locations available',
    )
  })
})
