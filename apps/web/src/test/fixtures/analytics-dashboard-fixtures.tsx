import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { rulesHumanClient as rules } from '@/lib/api/rules'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getProjectIndicators: vi.fn(),
  getProjectIndicatorValues: vi.fn(),
  getProjectsForRole: vi.fn(),
  getSadddDashboard: vi.fn(),
  getDescriptiveAnalytics: vi.fn(),
  getSurveyAnalytics: vi.fn(),
  getTimelineAnalytics: vi.fn(),
}))
const alertHook = vi.hoisted(() => ({ result: { data: undefined } as Record<string, unknown> }))
const download = vi.hoisted(() => vi.fn())
const previewExport = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const rbac = vi.hoisted(() => ({ allowed: [] as string[] }))
const insightCalls = vi.hoisted(() => ({
  budget: [] as unknown[][],
  participation: [] as unknown[][],
  trends: [] as unknown[][],
}))
export const idle = { data: undefined, isError: false, isPending: true, refetch: vi.fn() }
const insights = vi.hoisted(() => ({
  budget: {} as Record<string, unknown>,
  trends: {} as Record<string, unknown>,
  participation: {} as Record<string, unknown>,
}))
const coverageMap = vi.hoisted(() => ({
  instanceCount: 0,
  featureCollections: [] as unknown[],
}))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    userId: 'user-1',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'analytics.read',
      'indicators.read',
    ],
    assignedProjectIds: ['project-a', 'project-b'],
  },
}))
export {
  alertHook,
  api,
  coverageMap,
  currentAccess,
  download,
  insightCalls,
  insights,
  previewExport,
  rbac,
  toastError,
  toastSuccess,
}
export const rulesHumanClient = rules

// Plain buttons stand in for the Radix menu, matching the other workspace tests.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/api/analytics', () => ({
  analyticsClient: api,
  getAnalyticsExportPreview: previewExport,
  descriptiveAnalyticsSearch: (query: Record<string, string>) =>
    `?${new URLSearchParams(query).toString()}`,
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/core/artifact-download', () => ({
  downloadCoreArtifact: download,
}))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))
vi.mock('@/features/analytics/hooks/use-analytics-insights', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBudgetSummary: (...args: unknown[]) => {
    insightCalls.budget.push(args)
    return insights.budget
  },
  useIndicatorTrends: (...args: unknown[]) => {
    insightCalls.trends.push(args)
    return insights.trends
  },
  useParticipationBreakdown: (...args: unknown[]) => {
    insightCalls.participation.push(args)
    return insights.participation
  },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => currentAccess,
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleAnalytics: 'Analytics' } }),
}))
vi.mock('@/lib/rbac/can', () => ({
  can: (_role: string, permission: string) => rbac.allowed.includes(permission),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ actions, title }: { actions?: React.ReactNode; title: string }) => (
    <>
      <h1>{title}</h1>
      {actions}
    </>
  ),
}))
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: () => alertHook.result }))
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: { listAlerts: vi.fn() } }))
vi.mock('@/features/analytics/components/analytics-charts', () => ({
  ActivityCompletionChart: () => <div>Activity chart</div>,
  DescriptiveAnalysisChart: () => <div>Analysis chart</div>,
  SadddChart: () => <div>SADDD chart</div>,
  SurveyImprovementChart: () => <div>Survey chart</div>,
  IndicatorProgressChart: () => <div>Indicator progress chart</div>,
}))
vi.mock('@/features/analytics/components/analytics-coverage-map', async () => {
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

export const project = (
  id: string,
  title: string,
  startDate: string | null,
  endDate: string | null,
) => ({
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

export const indicator = (
  projectId: string,
  id: string,
  periodStart: string,
  periodEnd: string,
) => ({
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

export const kpiCard = () =>
  screen
    .getAllByText('KPI achievement')
    .map((node) => node.parentElement?.parentElement?.textContent ?? '')
    .join(' | ')

export const monitoring = {
  indicators: [],
  participationRecords: { value: null, state: 'MISSING', reason: 'MISSING' },
}

export const loadMapsDashboard = async () => {
  vi.resetModules()
  vi.doMock('@/constants/feature-flags', () => ({
    ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
    UNFINISHED_CONTROLS_UI_ENABLED: true,
    DASHBOARD_PINS_UI_ENABLED: false,
    MAPS_UI_ENABLED: true,
  }))
  const { AnalyticsDashboard: MapsDashboard } = await import('@/features/analytics')
  vi.doUnmock('@/constants/feature-flags')
  return MapsDashboard
}

// Loads the dashboard with the named UI flags set; export is on by default, unfinished controls always on, the rest off.
export const loadDashboard = async (flags: {
  export?: boolean
  maps?: boolean
  pins?: boolean
}) => {
  vi.resetModules()
  vi.doMock('@/constants/feature-flags', () => ({
    ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: flags.export ?? true,
    UNFINISHED_CONTROLS_UI_ENABLED: true,
    DASHBOARD_PINS_UI_ENABLED: flags.pins ?? false,
    MAPS_UI_ENABLED: flags.maps ?? false,
  }))
  const { AnalyticsDashboard: Dashboard } = await import('@/features/analytics')
  vi.doUnmock('@/constants/feature-flags')
  return Dashboard
}

export const resetAnalyticsMocks = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
  currentAccess.role = 'Monitoring and Evaluation Officer'
  currentAccess.profile.userId = 'user-1'
  currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  currentAccess.profile.permissions = [
    'projects.read',
    'activities.read',
    'monitoring.read',
    'analytics.read',
    'analytics.saddd.read',
    'indicators.read',
  ]
  alertHook.result = { data: undefined }
  rbac.allowed = []
  insightCalls.budget.length = 0
  insightCalls.participation.length = 0
  insightCalls.trends.length = 0
  coverageMap.instanceCount = 0
  coverageMap.featureCollections.length = 0
  const projects = [
    project('project-a', 'Project A', null, null),
    project('project-b', 'Project B', '2026-10-15', '2026-12-31'),
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
  api.getProjectIndicatorValues.mockImplementation((projectId: keyof typeof indicators) =>
    Promise.resolve(indicators[projectId]),
  )
  api.getMonitoringDashboard.mockResolvedValue(monitoring)
  api.getSadddDashboard.mockResolvedValue({
    releaseState: 'RELEASED',
    sex: [],
    age: [],
    disability: [],
  })
  api.getDescriptiveAnalytics.mockReturnValue(new Promise(() => {}))
  api.getSurveyAnalytics.mockReturnValue(new Promise(() => {}))
  api.getTimelineAnalytics.mockReturnValue(new Promise(() => {}))
  insights.budget = { ...idle }
  insights.trends = { ...idle }
  insights.participation = { ...idle }
  window.localStorage.clear()
}

export const surveyDefaults = () => {
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
}

export const suppressed = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' } as const
export const missing = (reason: string) => ({ state: 'MISSING', value: null, reason }) as const
export const available = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
export const zero = { state: 'ZERO', value: '0', reason: null } as const

export const surveyGroup = (overrides: Record<string, unknown> = {}) => ({
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
