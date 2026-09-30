/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rulesHumanClient } from '@/lib/services/rules-human-client'

import { AnalyticsDashboard, countOpenAlerts } from './analytics-dashboard'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getProjectIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
  getSadddDashboard: vi.fn(),
  getDescriptiveAnalytics: vi.fn(),
  getSurveyAnalytics: vi.fn(),
  getTimelineAnalytics: vi.fn(),
}))
const alertHook = vi.hoisted(() => ({ result: { data: undefined } as Record<string, unknown> }))
const download = vi.hoisted(() => vi.fn())
const finance = vi.hoisted(() => ({
  budgets: vi.fn(),
  expenses: vi.fn(),
}))
const coverageMap = vi.hoisted(() => ({
  instanceCount: 0,
  featureCollections: [] as unknown[],
}))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'activities.read', 'monitoring.read', 'analytics.read'],
    assignedProjectIds: ['project-a', 'project-b'],
  },
}))

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: api,
  descriptiveAnalyticsSearch: (query: Record<string, string>) =>
    `?${new URLSearchParams(query).toString()}`,
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  downloadCoreArtifact: download,
  coreDataClient: {
    budgets: (...args: unknown[]) => finance.budgets(...args),
    expenses: (...args: unknown[]) => finance.expenses(...args),
  },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => currentAccess,
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleAnalytics: 'Analytics' } }),
}))
vi.mock('@/lib/rbac/can', () => ({ can: () => false }))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => alertHook.result,
}))
vi.mock('@/lib/services/rules-human-client', () => ({ rulesHumanClient: { listAlerts: vi.fn() } }))
vi.mock('./analytics-charts', () => ({
  ActivityCompletionChart: () => <div>Activity chart</div>,
  DescriptiveAnalysisChart: () => <div>Analysis chart</div>,
  SadddChart: () => <div>SADDD chart</div>,
  SurveyImprovementChart: () => <div>Survey chart</div>,
  IndicatorProgressChart: () => <div>Indicator progress chart</div>,
}))
vi.mock('./analytics-coverage-map', async () => {
  const React = await import('react')
  return {
    AnalyticsCoverageMap: ({ featureCollection }: { featureCollection: unknown }) => {
      const [instance] = React.useState(() => {
        coverageMap.instanceCount += 1
        return coverageMap.instanceCount
      })
      coverageMap.featureCollections.push(featureCollection)
      return (
        <div data-instance={instance} data-testid="coverage-map">
          Coverage map
        </div>
      )
    },
  }
})
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = {
    children?: React.ReactNode
    'aria-label'?: string
    disabled?: boolean
    placeholder?: string
    title?: string
    value?: string
  }
  type SelectProps = {
    children?: React.ReactNode
    disabled?: boolean
    value?: string
    onValueChange?: (value: string) => void
  }
  const SelectTrigger = (_props: PartProps) => null
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, disabled, title, value }: PartProps) => (
    <option disabled={disabled} title={title} value={value}>
      {children}
    </option>
  )
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, disabled, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        aria-label={trigger?.props['aria-label']}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">No reporting periods</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

const project = (id: string, title: string, startDate: string | null, endDate: string | null) => ({
  id,
  title,
  startDate,
  endDate,

  area: 'Area',
  sector: 'Sector',
  status: 'Active',
  health: 'On Track',
  period: 'Persisted dates',
  projectManager: 'Manager',
})

const indicator = (projectId: string, id: string, periodStart: string, periodEnd: string) => ({
  id,
  projectId,
  code: id,
  name: `Indicator ${id}`,
  description: null,
  unitLabel: '%',
  dataSource: 'Persisted evidence',
  mode: 'MANUAL',
  numericKind: 'PERCENTAGE',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart,
  periodEnd,
  baseline: '0',
  target: '100',
  current: { value: null, reason: 'MISSING' },
  progress: { value: null, reason: 'MISSING' },
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
  revision: 1,
  status: 'ACTIVE',
  contractVersion: 'p06.v1',
})

const kpiCard = () =>
  screen
    .getAllByText('KPI achievement')
    .map((node) => node.parentElement?.parentElement?.textContent ?? '')
    .join(' | ')

// The MetricCard description only renders inside its info tooltip on hover/focus, so
// permission-gating assertions read the always-visible label + value text instead.
// "Budget utilization" also labels the ChartPanel further down; only the MetricCard
// label sits two ancestors above its value, matching kpiCard's structure.
const budgetUtilizationCard = () =>
  screen
    .getAllByText('Budget utilization')
    .map((node) => node.parentElement?.parentElement?.textContent ?? '')
    .filter((text) => text.includes('PHP') || text.includes('%') || text.includes('Unavailable'))
    .join(' | ')

const monitoring = {
  indicators: [],
  participationRecords: { value: null, state: 'MISSING', reason: 'MISSING' },
}

describe('Analytics dashboard request dependencies', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
    currentAccess.role = 'Monitoring and Evaluation Officer'
    currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'analytics.read',
    ]
    alertHook.result = { data: undefined }
    coverageMap.instanceCount = 0
    coverageMap.featureCollections.length = 0
    const projects = [
      project('project-a', 'Project A', null, null),
      project('project-b', 'Project B', '2026-09-15', '2026-12-31'),
    ]
    const indicators = {
      'project-a': [
        indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
        indicator('project-a', 'A-AUG', '2026-08-01', '2026-08-31'),
      ],
      'project-b': [
        indicator('project-b', 'B-NOV', '2026-11-01', '2026-11-30'),
        indicator('project-b', 'B-OCT', '2026-10-01', '2026-10-31'),
      ],
    }
    api.getProjectsForRole.mockResolvedValue(projects)
    api.getActivities.mockResolvedValue([])
    api.getProjectIndicators.mockImplementation((projectId: keyof typeof indicators) =>
      Promise.resolve(indicators[projectId]),
    )
    api.getMonitoringDashboard.mockResolvedValue(monitoring)
    api.getSadddDashboard.mockResolvedValue({
      releaseState: 'RELEASED',
      sex: [],
      age: [],
      disability: [],
    })
    finance.budgets.mockReset().mockResolvedValue([])
    finance.expenses.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('derives exact periods and keeps period changes monitoring-only', async () => {
    render(<AnalyticsDashboard />)

    await waitFor(() =>
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      }),
    )
    expect(screen.queryByText('Q1 2026')).toBeNull()
    expect(screen.queryByText('Q2 2026')).toBeNull()
    expect(screen.queryByText('July 2026')).toBeNull()
    expect(api.getActivities).toHaveBeenCalledTimes(1)
    expect(api.getSadddDashboard).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Visualization type'), {
      target: { value: 'map' },
    })
    const map = await screen.findByTestId('coverage-map')
    const mapInstance = map.getAttribute('data-instance')
    const firstFeatureCollection = coverageMap.featureCollections.at(-1)

    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2026-08-01::2026-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
      projectId: 'project-a',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })
    expect(api.getActivities).toHaveBeenCalledTimes(1)
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(screen.getByTestId('coverage-map').getAttribute('data-instance')).toBe(mapInstance)
    expect(coverageMap.featureCollections.at(-1)).toBe(firstFeatureCollection)

    fireEvent.change(screen.getByLabelText('Project filter'), {
      target: { value: 'project-b' },
    })
    await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(
      screen.getByText("SADDD analysis is available only after the project's recorded end date."),
    ).toBeTruthy()
    await waitFor(() =>
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-b',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    )
    expect(screen.getByLabelText('Reporting period')).toHaveProperty(
      'value',
      '2026-11-01::2026-11-30',
    )
    expect(
      api.getMonitoringDashboard.mock.calls.some(
        ([query]) => query.projectId === 'project-b' && query.periodStart === '2026-08-01',
      ),
    ).toBe(false)
    expect(screen.getByTestId('coverage-map').getAttribute('data-instance')).toBe(mapInstance)
    expect(coverageMap.featureCollections.at(-1)).not.toBe(firstFeatureCollection)
  })

  it('computes budget utilization from planned budgets and approved expenses', async () => {
    // Monitoring and Evaluation Officer never holds budgets.read in the authorization policy;
    // Program Manager holds both budgets.read and expenses.read.
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'budgets.read',
      'expenses.read',
    ]
    finance.budgets.mockResolvedValue([
      { id: 'budget-1', plannedBudget: '1000.00' },
      { id: 'budget-2', plannedBudget: '500.00' },
    ])
    finance.expenses.mockResolvedValue([
      { id: 'expense-1', budgetRecordId: 'budget-1', amount: '450.00', status: 'APPROVED' },
      { id: 'expense-2', budgetRecordId: 'budget-1', amount: '900.00', status: 'PENDING' },
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(finance.budgets).toHaveBeenCalledWith('project-a'))
    expect(finance.expenses).toHaveBeenCalledWith('project-a')
    await waitFor(() => expect(screen.getAllByText('30%').length).toBeGreaterThan(0))
    expect(screen.getByText('PHP 1,500')).toBeTruthy()
    expect(screen.getByText('PHP 450')).toBeTruthy()
  })

  it('hides budget utilization when the budgets or expenses read permission is absent', async () => {
    render(<AnalyticsDashboard />)

    await screen.findAllByText('KPI achievement')
    await waitFor(() => expect(budgetUtilizationCard()).toContain('Unavailable'))
    expect(finance.budgets).not.toHaveBeenCalled()
    expect(finance.expenses).not.toHaveBeenCalled()
  })

  it('surfaces a budget utilization server error instead of a false result', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'budgets.read',
      'expenses.read',
    ]
    finance.budgets.mockRejectedValue(new Error('Budget utilization is unavailable.'))

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(screen.getByText('Budget utilization unavailable')).toBeTruthy())
    expect(screen.getAllByText('Budget utilization is unavailable.').length).toBeGreaterThan(0)
  })

  it('renders the Project-scoped empty map without requiring a reporting period', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-empty', 'No Coordinates Project', null, null),
    ])
    api.getProjectIndicators.mockResolvedValue([])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
    fireEvent.change(screen.getByLabelText('Visualization type'), {
      target: { value: 'map' },
    })

    expect(await screen.findByRole('heading', { name: 'Project Coverage Map' })).toBeTruthy()
    expect(
      screen.getByText(
        'Interactive coverage for No Coordinates Project. Only authoritative persisted project coordinates are plotted.',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('coverage-map')).toBeTruthy()
    expect(coverageMap.featureCollections.at(-1)).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })

  it.each([
    ['missing startDate', null, '2026-09-30'],
    ['missing endDate', '2026-09-01', null],
  ])('does not request SADDD with %s', async (_label, startDate, endDate) => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-missing-date', 'Missing date project', startDate, endDate),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-missing-date', 'M-SEP', '2026-09-01', '2026-09-30'),
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(screen.getAllByText('Project reporting dates are not recorded.').length).toBeGreaterThan(
      0,
    )
  })

  it('withholds monitoring when no valid active Indicator period exists', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-empty', 'No period project', null, null),
    ])
    api.getProjectIndicators.mockResolvedValue([
      { ...indicator('project-empty', 'ARCHIVED', '2026-09-01', '2026-09-30'), status: 'ARCHIVED' },
      { ...indicator('project-empty', 'INVALID', 'invalid', '2026-09-30') },
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
    await waitFor(() =>
      expect((screen.getByLabelText('Reporting period') as HTMLSelectElement).disabled).toBe(true),
    )
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    expect(
      screen.getByText('No active Indicator reporting period is available for this project.'),
    ).toBeTruthy()
  })

  it('settles a dated-Project SADDD 503 without retrying on period changes', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-dated', 'Dated project', '2025-08-01', '2025-09-30'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-dated', 'D-SEP', '2025-09-01', '2025-09-30'),
      indicator('project-dated', 'D-AUG', '2025-08-01', '2025-08-31'),
    ])
    api.getSadddDashboard.mockRejectedValue(new Error('Monitoring verification is unavailable.'))

    render(<AnalyticsDashboard />)

    await waitFor(() =>
      expect(screen.getAllByText('Monitoring verification is unavailable.')).toHaveLength(1),
    )
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2025-08-01::2025-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)
    expect(api.getActivities).toHaveBeenCalledTimes(1)
  })

  it('shows "Unavailable", never "None yet", for indicator data a Project Officer cannot read', async () => {
    currentAccess.role = 'Project Officer'
    currentAccess.profile.roles = ['PROJECT_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'analytics.read',
      'analytics.saddd.read',
      'beneficiaries.aggregates.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getActivities).toHaveBeenCalled())
    await screen.findAllByText('KPI achievement')
    await waitFor(() => expect(kpiCard()).toContain('Unavailable'))
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    expect(screen.queryByText('None yet')).toBeNull()
    expect(
      screen.getAllByText('Indicator reporting periods are not available for this role.').length,
    ).toBeGreaterThan(0)
  })

  it('shows "None yet" for an empty KPI set only after a successful monitoring read', async () => {
    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    await screen.findAllByText('KPI achievement')
    await waitFor(() => expect(kpiCard()).toContain('None yet'))
  })

  it('shows the suppression wording, never "None yet", for a SUPPRESSED (SMALL_COHORT) participation cell', async () => {
    api.getMonitoringDashboard.mockResolvedValue({
      indicators: [],
      participationRecords: { value: null, state: 'SUPPRESSED', reason: 'SMALL_COHORT' },
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Analysis view'), {
      target: { value: 'participation' },
    })

    const heading = await screen.findByRole('heading', {
      name: 'Participation patterns · Bar chart',
    })
    const panel = within(heading.closest('section') as HTMLElement)
    expect(panel.getByText('Suppressed (fewer than 5)')).toBeTruthy()
    expect(panel.queryByText('None yet')).toBeNull()
  })

  it('shows "Data unavailable", never "None yet", for a withheld-release MISSING participation cell', async () => {
    api.getMonitoringDashboard.mockResolvedValue({
      indicators: [],
      participationRecords: {
        value: null,
        state: 'MISSING',
        reason: 'SENSITIVE_RELEASE_NOT_ENABLED_V1',
      },
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Analysis view'), {
      target: { value: 'participation' },
    })

    const heading = await screen.findByRole('heading', {
      name: 'Participation patterns · Bar chart',
    })
    const panel = within(heading.closest('section') as HTMLElement)
    expect(panel.getByText('Data unavailable')).toBeTruthy()
    expect(panel.queryByText('None yet')).toBeNull()
  })

  it('does not issue permission-incompatible Activity or Indicator reads for Grant Manager', async () => {
    currentAccess.role = 'Grant Manager'
    currentAccess.profile.roles = ['GRANT_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'budgets.read',
      'beneficiaries.aggregates.read',
      'analytics.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Grant Manager'))
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })
  // The export button is hidden behind ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED (see
  // apps/web/src/constants/feature-flags.ts and docs/deferred-features.md). This test
  // forces the flag on so the underlying export behaviour the API still serves stays
  // covered while the flag is off in the running app.
  it('loads descriptive statistics and exports suppressed aggregates with the analytics permissions (flag on)', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
      UNFINISHED_CONTROLS_UI_ENABLED: true,
    }))
    const { AnalyticsDashboard: ExportEnabledDashboard } = await import('./analytics-dashboard')
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'analytics.export',
    ]
    const suppressed = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    api.getDescriptiveAnalytics.mockResolvedValue({
      contractVersion: 'analytics.descriptive.v1',
      projectId: 'project-a',
      generatedAt: '2026-09-27T04:00:00.000Z',
      monitoringPeriod: {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        businessTimeZone: 'Asia/Manila',
      },
      sadddPeriod: { periodStart: null, periodEnd: null },
      sadddReleaseState: 'RELEASED',
      privacy: {
        threshold: 5,
        complementarySuppression: true,
        source: 'P06_SADDD_RELEASE',
        beneficiaryRows: false,
      },
      counts: [{ key: 'sadddTotal', label: 'SADDD individuals', metric: suppressed }],
      distributions: [
        { section: 'SADDD_SEX', key: 'FEMALE', label: 'Female', metric: suppressed, share: null },
      ],
      indicatorSummaries: [],
    })
    download.mockResolvedValue(undefined)
    render(<ExportEnabledDashboard />)

    await waitFor(() =>
      expect(api.getDescriptiveAnalytics).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      }),
    )
    const table = await screen.findByTestId('descriptive-statistics')
    expect(table.textContent).toContain('Withheld')
    expect(table.textContent).toContain('Suppressed')

    fireEvent.click(screen.getByRole('button', { name: 'Export aggregates (CSV)' }))
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        '/analytics/descriptive/export?projectId=project-a&periodStart=2026-09-01&periodEnd=2026-09-30',
        'descriptive-analytics-project-a.csv',
      ),
    )

    vi.doUnmock('@/constants/feature-flags')
  })

  it('hides the export button even with the analytics.export permission while the flag is off', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'analytics.export',
    ]
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Export aggregates (CSV)' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exporting aggregates' })).toBeNull()
  })

  it('hides descriptive statistics and export for roles without the analytics permissions', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(api.getDescriptiveAnalytics).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Export aggregates (CSV)' })).toBeNull()
    expect(screen.queryByTestId('descriptive-statistics')).toBeNull()
  })

  it('does not offer export when only the descriptive read permission is held', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
    ]
    api.getDescriptiveAnalytics.mockRejectedValue(new Error('Descriptive statistics unavailable.'))
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Export aggregates (CSV)' })).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps Add to Dashboard aria-disabled with a Not available yet hint', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    const addToDashboard = screen.getByRole('button', { name: 'Add to Dashboard' })
    // aria-disabled (not native disabled) so the control stays keyboard/AT reachable.
    expect(addToDashboard.hasAttribute('disabled')).toBe(false)
    expect(addToDashboard.getAttribute('aria-disabled')).toBe('true')
    addToDashboard.focus()
    expect(document.activeElement).toBe(addToDashboard)
    const describedBy = addToDashboard.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Not available yet')
  })

  it('hides Add to Dashboard and Participation patterns while unfinished controls are hidden', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: false,
      UNFINISHED_CONTROLS_UI_ENABLED: false,
    }))
    const { AnalyticsDashboard: HiddenDashboard } = await import('./analytics-dashboard')
    vi.doUnmock('@/constants/feature-flags')
    render(<HiddenDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: 'Add to Dashboard' })).toBeNull()
    expect(screen.queryByText('Not available yet')).toBeNull()
    expect(screen.queryByText('Participation patterns', { selector: 'option' })).toBeNull()
  })

  it('restricts the survey/timeline views without the descriptive read permission', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    const surveyOption = screen.getByText('Survey improvement', {
      selector: 'option',
    }) as HTMLOptionElement
    const timelineOption = screen.getByText('Project / activity timeline adherence', {
      selector: 'option',
    }) as HTMLOptionElement
    // Default profile holds monitoring.read but not analytics.descriptive.read: restricted.
    expect(surveyOption.disabled).toBe(true)
    expect(timelineOption.disabled).toBe(true)
  })

  describe('overview metric cards', () => {
    const cardText = (label: string) =>
      screen
        .getAllByText(label)
        .map((node) => node.parentElement?.parentElement?.textContent ?? '')
        .join(' | ')

    it('shows the role-restricted state for alerts without alerts.read', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(cardText('Rule-Based Alerts')).toContain('Unavailable')
      expect(screen.getByText('Rule-Based Alerts are unavailable for this role.')).toBeTruthy()
      expect(screen.queryByText('Rule-Based Alerts unavailable')).toBeNull()
    })

    it('shows a loading state, not the role message, while alerts load', async () => {
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data: undefined, isError: false }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(cardText('Rule-Based Alerts')).toContain('Loading...')
      expect(screen.getByText('Loading Rule-Based Alerts')).toBeTruthy()
      expect(screen.queryByText('Rule-Based Alerts are unavailable for this role.')).toBeNull()
    })

    it('shows an error state with Retry when the alert read fails', async () => {
      const refetch = vi.fn()
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data: undefined, isError: true, refetch }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(screen.getByText('Rule-Based Alerts unavailable')).toBeTruthy()
      expect(screen.queryByText('Rule-Based Alerts are unavailable for this role.')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it.each([
      [{ count: 7, capped: false }, '7', '7 open alerts'],
      [{ count: 1, capped: false }, '1', '1 open alert in'],
      [{ count: 1000, capped: true }, '1000+', '1000+ open alerts'],
    ])('renders the open alert count %j', async (data, cardValue, panelText) => {
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data, isError: false }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(cardText('Rule-Based Alerts')).toContain(cardValue)
      expect(document.body.textContent).toContain(panelText)
    })

    it('shows Beneficiary reach from the released aggregate cell', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        enrolledIndividuals: { state: 'AVAILABLE', value: '128', reason: null },
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(cardText('Beneficiary reach')).toContain('128'))
    })

    it('shows suppression wording, never a number, for a suppressed Beneficiary reach', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        enrolledIndividuals: { state: 'SUPPRESSED', value: null, reason: 'SMALL_COHORT' },
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(cardText('Beneficiary reach')).toContain('Suppressed'))
    })

    it('renders the Indicator progress chart only when a released progress value exists', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [
          {
            ...indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
            progress: { state: 'AVAILABLE', value: '42', reason: null },
          },
        ],
      })
      render(<AnalyticsDashboard />)
      expect(await screen.findByText('Indicator progress chart')).toBeTruthy()
    })

    it('shows None yet, not the chart, when no indicator progress is released', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30')],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() =>
        expect(
          screen.getByText('No released indicator progress for this project and period.'),
        ).toBeTruthy(),
      )
      expect(screen.queryByText('Indicator progress chart')).toBeNull()
    })
  })

  describe('countOpenAlerts', () => {
    const page = (n: number, nextCursor: string | null) => ({
      items: Array.from({ length: n }, (_, i) => ({ id: `alert-${i}` })),
      nextCursor,
    })

    it('counts each open status with the server filter and follows cursors', async () => {
      const list = vi.mocked(rulesHumanClient.listAlerts)
      list.mockImplementation((async (input: { status?: string; cursor?: string }) => {
        if (input.status === 'NEW') return input.cursor ? page(5, null) : page(100, 'c1')
        if (input.status === 'REVIEWED') return page(3, null)
        return page(0, null)
      }) as never)
      await expect(countOpenAlerts('project-a')).resolves.toEqual({ count: 108, capped: false })
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'NEW', cursor: 'c1', projectId: 'project-a' }),
        undefined,
      )
    })

    it('stops at the page bound and reports the count as capped', async () => {
      const list = vi.mocked(rulesHumanClient.listAlerts)
      list.mockImplementation((async () => page(100, 'more')) as never)
      const result = await countOpenAlerts('project-a')
      expect(result.capped).toBe(true)
      expect(result.count).toBe(3 * 10 * 100)
      expect(list).toHaveBeenCalledTimes(30)
    })
  })

  describe('F9 survey and timeline analytics views', () => {
    beforeEach(() => {
      currentAccess.profile.permissions = [
        ...currentAccess.profile.permissions,
        'analytics.descriptive.read',
        'assessments.detail.read',
      ]
      // Keeps the unrelated "Descriptive statistics" panel from also erroring (and adding a
      // second "Retry" button) while these tests exercise the survey/timeline views only.
      api.getDescriptiveAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        monitoringPeriod: {
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          businessTimeZone: 'Asia/Manila',
        },
        sadddPeriod: { periodStart: null, periodEnd: null },
        sadddReleaseState: 'UNAVAILABLE',
        privacy: {
          threshold: 5,
          complementarySuppression: true,
          source: 'P06_SADDD_RELEASE',
          beneficiaryRows: false,
        },
        counts: [],
        distributions: [],
        indicatorSummaries: [],
      })
    })

    const suppressed = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' } as const
    const missing = (reason: string) => ({ state: 'MISSING', value: null, reason }) as const
    const available = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
    const zero = { state: 'ZERO', value: '0', reason: null } as const

    const surveyGroup = (overrides: Record<string, unknown> = {}) => ({
      key: 'OVERALL',
      label: 'All activities (cohort change)',
      pairs: available('7'),
      meanPre: available('40'),
      meanPost: available('62'),
      meanChange: available('22'),
      improved: available('6'),
      same: available('0'),
      declined: available('1'),
      ...overrides,
    })

    it('renders survey metric cards, chart and per-activity table, with activity titles instead of raw IDs', async () => {
      const activityId = '40000000-0000-4000-8000-000000000099'
      const unknownActivityId = '40000000-0000-4000-8000-0000000000aa'
      api.getActivities.mockResolvedValue([
        { id: activityId, projectId: 'project-a', code: 'A-1', title: 'Community Training' },
      ])
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [
          { ...surveyGroup(), key: activityId, label: activityId, pairs: available('5') },
          {
            ...surveyGroup(),
            key: unknownActivityId,
            label: unknownActivityId,
            pairs: available('2'),
          },
        ],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      await waitFor(() =>
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        }),
      )
      const panel = await screen.findByTestId('survey-analytics')
      expect(within(panel).getByText('Paired assessments')).toBeTruthy()
      expect(within(panel).getByText('Survey chart')).toBeTruthy()
      expect(within(panel).getByText('Community Training')).toBeTruthy()
      expect(within(panel).getByText('Activity (name unavailable)')).toBeTruthy()
      expect(panel.textContent).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )
    })

    it('labels survey mean pre/post in % and mean change in pp, never %', async () => {
      const activityId = '40000000-0000-4000-8000-000000000099'
      api.getActivities.mockResolvedValue([
        { id: activityId, projectId: 'project-a', code: 'A-1', title: 'Community Training' },
      ])
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({ pairs: available('12') }),
        byActivity: [
          {
            ...surveyGroup({ pairs: available('12') }),
            key: activityId,
            label: activityId,
            meanPre: available('41.5'),
            meanPost: available('63.5'),
            meanChange: available('22.5'),
          },
        ],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      const panel = await screen.findByTestId('survey-analytics')

      // Cards (overall) and the per-activity table.
      expect(within(panel).getAllByText('40%').length).toBeGreaterThan(0)
      expect(within(panel).getAllByText('62%').length).toBeGreaterThan(0)
      expect(within(panel).getAllByText('22pp').length).toBeGreaterThan(0)
      expect(within(panel).getByText('41.5%')).toBeTruthy()
      expect(within(panel).getByText('63.5%')).toBeTruthy()
      expect(within(panel).getByText('22.5pp')).toBeTruthy()
      expect(within(panel).queryByText('22%')).toBeNull()
      expect(within(panel).queryByText('22.5%')).toBeNull()
    })

    it('labels timeline percentages with % and leaves day and count cells unitless', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('51'),
        remainingDays: available('33'),
        overdueDays: available('4'),
        activityCompletionPercent: available('76'),
        activityOverdueCount: available('3'),
        milestoneOnTimePercent: available('88'),
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      const panel = await screen.findByTestId('timeline-analytics')

      expect(within(panel).getByText('51%')).toBeTruthy()
      expect(within(panel).getByText('76%')).toBeTruthy()
      expect(within(panel).getByText('88%')).toBeTruthy()
      expect(within(panel).getByText('33')).toBeTruthy()
      expect(within(panel).getByText('4')).toBeTruthy()
      expect(within(panel).getByText('3')).toBeTruthy()
      expect(within(panel).queryByText('33%')).toBeNull()
      expect(within(panel).queryByText('4%')).toBeNull()
      expect(within(panel).queryByText('3%')).toBeNull()
    })

    it('shows the suppression label, never a raw count, when survey pairs are suppressed', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({
          pairs: suppressed,
          meanPre: suppressed,
          meanPost: suppressed,
          meanChange: suppressed,
          improved: suppressed,
          same: suppressed,
          declined: suppressed,
        }),
        byActivity: [],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      const panel = await screen.findByTestId('survey-analytics')
      expect(within(panel).getAllByText('Suppressed (fewer than 5)').length).toBeGreaterThan(0)
      expect(within(panel).queryByText('Survey chart')).toBeNull()
    })

    it('shows reason-coded guidance, never a fabricated zero, when survey has no paired assessments', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({
          pairs: zero,
          meanPre: missing('NO_PAIRED_ASSESSMENTS'),
          meanPost: missing('NO_PAIRED_ASSESSMENTS'),
          meanChange: missing('NO_PAIRED_ASSESSMENTS'),
          improved: missing('NO_PAIRED_ASSESSMENTS'),
          same: missing('NO_PAIRED_ASSESSMENTS'),
          declined: missing('NO_PAIRED_ASSESSMENTS'),
        }),
        byActivity: [],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      const panel = await screen.findByTestId('survey-analytics')
      expect(
        within(panel).getAllByText('No paired pre/post assessments yet').length,
      ).toBeGreaterThan(0)
      expect(within(panel).queryByText('0%')).toBeNull()
    })

    it('shows an error state with Retry when survey analytics fails to load', async () => {
      api.getSurveyAnalytics.mockRejectedValue(new Error('Survey analytics could not be loaded.'))

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      await waitFor(() =>
        expect(screen.getByText('Survey analytics could not be loaded.')).toBeTruthy(),
      )
      const retry = screen.getByRole('button', { name: /retry/i })
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      fireEvent.click(retry)
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(2))
      expect(await screen.findByTestId('survey-analytics')).toBeTruthy()
    })

    const restrictedProfiles = {
      'a Project Officer without analytics.descriptive.read': [
        'projects.read',
        'activities.read',
        'monitoring.read',
        'analytics.read',
      ],
      'a role with analytics.descriptive.read but without monitoring.read': [
        'projects.read',
        'activities.read',
        'analytics.read',
        'analytics.descriptive.read',
      ],
    } as const

    describe.each(Object.entries(restrictedProfiles))('for %s', (_label, permissions) => {
      beforeEach(() => {
        currentAccess.profile.permissions = [...permissions]
      })

      it('disables the survey and timeline options and never fetches them', async () => {
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
        for (const name of ['Survey improvement', 'Project / activity timeline adherence']) {
          const option = (await screen.findByText(name, {
            selector: 'option',
          })) as HTMLOptionElement
          expect(option.disabled).toBe(true)
        }
        expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
        expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
      })

      it.each([
        ['survey', 'Survey improvement is restricted for your role.'],
        ['timeline', 'Timeline adherence is not available for this role.'],
      ])(
        'shows restricted wording, never empty-data wording, for the %s view',
        async (view, wording) => {
          render(<AnalyticsDashboard />)
          await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
          // A profile can lose a permission while a view is selected; the panel must stay restricted.
          fireEvent.change(await screen.findByLabelText('Analysis view'), {
            target: { value: view },
          })
          const restricted = await screen.findByText(wording)
          // Other panels on the page may legitimately say "None yet"; this panel must not.
          expect(within(restricted.parentElement as HTMLElement).queryByText('None yet')).toBeNull()
          expect(screen.queryByText('No paired pre/post assessments yet')).toBeNull()
          expect(screen.queryByText('No activities recorded yet')).toBeNull()
          expect(screen.queryByText(/No active reporting period/)).toBeNull()
          expect(screen.queryByText(/No project is available for this filter/)).toBeNull()
          expect(screen.queryByTestId('survey-analytics')).toBeNull()
          expect(screen.queryByTestId('timeline-analytics')).toBeNull()
          expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
          expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
        },
      )
    })

    describe('aggregate-only roles (Program/Grant Manager) without assessments.detail.read', () => {
      beforeEach(() => {
        currentAccess.profile.permissions = [
          'projects.read',
          'monitoring.read',
          'analytics.read',
          'analytics.descriptive.read',
          'analytics.export',
        ]
      })

      it('disables the survey option, keeps timeline enabled and real, and never fetches survey', async () => {
        api.getTimelineAnalytics.mockResolvedValue({
          contractVersion: 'analytics.descriptive.timeline.v1',
          projectId: 'project-a',
          generatedAt: '2026-09-27T04:00:00.000Z',
          reportingDate: '2026-09-27',
          elapsedPercent: available('50'),
          remainingDays: available('30'),
          overdueDays: zero,
          activityCompletionPercent: available('75'),
          activityOverdueCount: zero,
          milestoneOnTimePercent: available('100'),
        })
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        const survey = screen.getByText('Survey improvement', {
          selector: 'option',
        }) as HTMLOptionElement
        const timeline = screen.getByText('Project / activity timeline adherence', {
          selector: 'option',
        }) as HTMLOptionElement
        expect(survey.disabled).toBe(true)
        expect(timeline.disabled).toBe(false)

        // A survey view left selected still shows restricted wording, never "None yet" or Retry.
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
        const restricted = await screen.findByText(
          'Survey improvement is restricted for your role.',
        )
        expect(within(restricted.parentElement as HTMLElement).queryByText('None yet')).toBeNull()
        expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
        expect(screen.queryByTestId('survey-analytics')).toBeNull()
        expect(api.getSurveyAnalytics).not.toHaveBeenCalled()

        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
        expect(await screen.findByTestId('timeline-analytics')).toBeTruthy()
        expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
      })
    })

    it('shows period wording with no Retry when the survey fetch is refused with a 400', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('Survey analytics requires exactly one defined period.'), {
          status: 400,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('This reporting period cannot be used for survey results.'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
      expect(screen.queryByText('Survey analytics could not be loaded')).toBeNull()
      expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(1)
    })

    it('maps a 403 from the survey fetch to the restricted wording with no Retry', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('Survey improvement is restricted for your role.'), {
          status: 403,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('Survey improvement is restricted for your role.'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    })

    it('keeps Retry for a network or 5xx survey failure', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('The requested operation could not be completed.'), {
          status: 503,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await screen.findByText('The requested operation could not be completed.')
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    })

    it('enables survey and timeline for a role holding both analytics.descriptive.read and monitoring.read', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      const survey = screen.getByText('Survey improvement', {
        selector: 'option',
      }) as HTMLOptionElement
      const timeline = screen.getByText('Project / activity timeline adherence', {
        selector: 'option',
      }) as HTMLOptionElement
      expect(survey.disabled).toBe(false)
      expect(timeline.disabled).toBe(false)
    })

    it('offers only the project defined reporting periods to the survey view', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      const period = screen.getByLabelText('Reporting period') as HTMLSelectElement
      const values = [...period.options].map((option) => option.value).filter(Boolean)
      expect(values).toEqual(['2026-09-01::2026-09-30', '2026-08-01::2026-08-31'])
      for (const call of api.getSurveyAnalytics.mock.calls) {
        expect(['2026-09-01', '2026-08-01']).toContain(call[0].periodStart)
      }
    })

    it('hides overlapping periods from the survey period picker only', async () => {
      api.getProjectIndicators.mockImplementation((projectId: string) =>
        Promise.resolve(
          projectId === 'project-a'
            ? [
                indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
                indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
                indicator('project-a', 'A-JUL', '2026-07-01', '2026-07-31'),
              ]
            : [],
        ),
      )
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-07-01', periodEnd: '2026-07-31' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      const values = () =>
        [...(screen.getByLabelText('Reporting period') as HTMLSelectElement).options]
          .map((option) => option.value)
          .filter(Boolean)
      expect(values()).toHaveLength(3)
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(values()).toEqual(['2026-07-01::2026-07-31']))
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      for (const call of api.getSurveyAnalytics.mock.calls) {
        expect(call[0].periodStart).toBe('2026-07-01')
      }
    })

    it('keeps the other panels on their period when every period overlaps, and restores it after the survey view', async () => {
      api.getProjectIndicators.mockImplementation((projectId: string) =>
        Promise.resolve(
          projectId === 'project-a'
            ? [
                indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
                indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
              ]
            : [],
        ),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalled())
      const selected = () => (screen.getByLabelText('Reporting period') as HTMLSelectElement).value
      const before = selected()
      expect(before).not.toBe('')
      const periodCalls = () =>
        api.getDescriptiveAnalytics.mock.calls.map((call) => {
          const query = call[0] as { periodStart: string; periodEnd: string }
          return `${query.periodStart}::${query.periodEnd}`
        })
      expect(new Set(periodCalls())).toEqual(new Set([before]))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('This reporting period cannot be used for survey results.'),
      ).toBeTruthy()
      expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
      // The descriptive panel keeps its loaded period and never falls back to "None yet".
      expect(new Set(periodCalls())).toEqual(new Set([before]))
      expect(
        screen.queryByText('No active Indicator reporting period is available for this project.'),
      ).toBeNull()

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'kpi' } })
      await waitFor(() => expect(selected()).toBe(before))
      expect(new Set(periodCalls())).toEqual(new Set([before]))
    })

    it('does not add a chart-type suffix to the timeline panel title', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: available('100'),
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await screen.findByTestId('timeline-analytics')
      expect(screen.queryByText(/timeline adherence · /i)).toBeNull()
    })

    it('renders timeline metric cards without requiring a reporting period', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: missing('NO_COMPLETED_MILESTONES'),
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'timeline' },
      })

      await waitFor(() =>
        expect(api.getTimelineAnalytics).toHaveBeenCalledWith({ projectId: 'project-a' }),
      )
      const panel = await screen.findByTestId('timeline-analytics')
      expect(within(panel).getByText('Elapsed')).toBeTruthy()
      expect(within(panel).getByText('No completed milestones yet')).toBeTruthy()
    })

    it('shows an error state with Retry when timeline analytics fails to load', async () => {
      api.getTimelineAnalytics.mockRejectedValue(
        new Error('Timeline analytics could not be loaded.'),
      )

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'timeline' },
      })

      await waitFor(() =>
        expect(screen.getByText('Timeline analytics could not be loaded.')).toBeTruthy(),
      )
      const retry = screen.getByRole('button', { name: /retry/i })
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: available('100'),
      })
      fireEvent.click(retry)
      await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(2))
      expect(await screen.findByTestId('timeline-analytics')).toBeTruthy()
    })
  })
})
