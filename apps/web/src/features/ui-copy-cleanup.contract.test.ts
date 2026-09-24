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

describe('Phase 4 UI copy cleanup contract', () => {
  it.each(removedDescriptions)('removes the approved description from %s', (file, copy) => {
    expect(source(file)).not.toContain(copy)
  })

  it('keeps route verification active and removes only its explanatory status copy', () => {
    const guard = source('components/layout/route-access-guard.tsx')
    expect(guard).toContain('requestRouteCheck(')
    expect(guard).toContain('accessRefreshing')
    expect(guard).toContain('current.revision !== verificationRevision')
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
