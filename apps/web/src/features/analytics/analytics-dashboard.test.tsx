/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsDashboard } from './analytics-dashboard'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getProjectIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
  getSadddDashboard: vi.fn(),
}))
const coverageMap = vi.hoisted(() => ({
  instanceCount: 0,
  featureCollections: [] as unknown[],
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Monitoring and Evaluation Officer' }),
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleAnalytics: 'Analytics' } }),
}))
vi.mock('@/lib/rbac/can', () => ({ can: () => false }))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./analytics-charts', () => ({
  ActivityCompletionChart: () => <div>Activity chart</div>,
  DescriptiveAnalysisChart: () => <div>Analysis chart</div>,
  SadddChart: () => <div>SADDD chart</div>,
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
    placeholder?: string
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
  const SelectItem = ({ children, value }: PartProps) => <option value={value}>{children}</option>
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
  targetGoal: null,
  area: 'Area',
  sector: 'Sector',
  status: 'Active',
  health: 'On Track',
  period: 'Persisted dates',
  projectManager: 'Manager',
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
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
  projectGoalComparison: { state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' },
})

const monitoring = {
  indicators: [],
  participationRecords: { value: null, state: 'MISSING', reason: 'MISSING' },
}

describe('Analytics dashboard request dependencies', () => {
  beforeEach(() => {
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
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
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
    await waitFor(() =>
      expect(api.getSadddDashboard).toHaveBeenCalledWith({ projectId: 'project-b' }),
    )
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
      project('project-dated', 'Dated project', '2026-08-01', '2026-09-30'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-dated', 'D-SEP', '2026-09-01', '2026-09-30'),
      indicator('project-dated', 'D-AUG', '2026-08-01', '2026-08-31'),
    ])
    api.getSadddDashboard.mockRejectedValue(new Error('Monitoring verification is unavailable.'))

    render(<AnalyticsDashboard />)

    await waitFor(() =>
      expect(screen.getAllByText('Monitoring verification is unavailable.')).toHaveLength(1),
    )
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2026-08-01::2026-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)
    expect(api.getActivities).toHaveBeenCalledTimes(1)
  })
})
