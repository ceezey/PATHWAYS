import { vi } from 'vitest'

const api = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getProjectsForRole: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getActivity: vi.fn(),
  getIndicators: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'System Administrator' as string | null,
  profile: {
    fullName: 'Synthetic Admin',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['monitoring.read', 'analytics.read'],
    assignedProjectIds: [] as string[],
  } as {
    fullName: string
    roles: string[]
    permissions: string[]
    assignedProjectIds: string[]
  } | null,
}))
const router = vi.hoisted(() => ({ push: vi.fn() }))
const flags = vi.hoisted(() => ({ monitoring: false, pins: false }))
const rbac = vi.hoisted(() => ({ allowed: [] as string[] }))
const panels = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  proof: null as Record<string, unknown> | null,
  pinned: null as unknown,
}))
export { access, api, flags, panels, rbac, router }

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/rbac/can', () => ({
  can: (_role: string, permission: string) => rbac.allowed.includes(permission),
}))
vi.mock('@/constants/feature-flags', () => ({
  get ADMIN_DASHBOARD_MONITORING_UI_ENABLED() {
    return flags.monitoring
  },
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
}))
vi.mock('@/features/dashboard/monitoring-reach-metrics.utils', () => ({
  monitoringReachMetrics: (result: { metrics: unknown[] }) => result.metrics,
}))
vi.mock('@/features/dashboard/components/action-kpi-row', () => ({
  ActionKpiRow: () => <div data-testid="action-kpi-row" />,
}))
vi.mock('@/features/dashboard/components/executive-dashboard', () => ({
  ExecutiveDashboard: ({
    model,
    summaryAction,
  }: { model: { title: string }; summaryAction?: { label: string } }) => (
    <div data-testid="executive">
      {model.title}|{summaryAction?.label ?? 'no action'}
    </div>
  ),
}))
vi.mock('@/features/dashboard/components/pinned-charts', () => ({
  PinnedCharts: ({ projects }: { projects: Array<{ id: string }> }) => {
    panels.pinned = projects
    return <div data-testid="pinned-charts">{projects.map((row) => row.id).join(',')}</div>
  },
}))
vi.mock('@/features/dashboard/role-overview/role-overview', () => ({
  RoleOverviewDashboard: ({ fullName, role }: { fullName?: string | null; role: string }) => (
    <div data-testid="role-overview">
      {role}|{fullName ?? 'no name'}
    </div>
  ),
}))
vi.mock('@/features/projects', () => ({
  ActivityDetailPanel: (props: {
    activity: { title: string }
    onActivityChanged: (activity: { title: string }) => void
    onOpenChange: (open: boolean) => void
    onSubmitProof: (activity: { title: string }) => void
    open: boolean
  }) => {
    panels.detail = props
    return props.open ? (
      <div data-testid="activity-detail">
        {props.activity.title}
        <button onClick={() => props.onOpenChange(false)} type="button">
          close detail
        </button>
        <button
          onClick={() => props.onActivityChanged({ title: 'Changed activity' })}
          type="button"
        >
          change activity
        </button>
        <button onClick={() => props.onSubmitProof(props.activity)} type="button">
          submit proof
        </button>
      </div>
    ) : null
  },
  ActivityProofDialog: (props: {
    activity: { title: string } | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmitted: (activity: { title: string }) => void
  }) => {
    panels.proof = props
    return props.open ? (
      <div data-testid="proof-dialog">
        {props.activity?.title}
        <button onClick={() => props.onOpenChange(false)} type="button">
          close proof
        </button>
        <button onClick={() => props.onSubmitted({ title: 'Proof activity' })} type="button">
          proof submitted
        </button>
      </div>
    ) : null
  },
}))
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = { children?: React.ReactNode; id?: string }
  type SelectProps = {
    children?: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }
  const SelectTrigger = (_props: PartProps) => null
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, value }: PartProps & { value?: string }) => (
    <option value={value}>{children}</option>
  )
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        id={trigger?.props.id}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        <option value="">No selection</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

export const dashboard = (overrides: Record<string, unknown> = {}) => ({
  metrics: [],
  sections: [],
  ...overrides,
})

export const action = (overrides: Record<string, unknown> = {}) => ({
  id: 'open',
  label: 'Open',
  kind: 'navigate',
  href: '/somewhere',
  ...overrides,
})

export const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  title: 'Synthetic item',
  description: 'Synthetic description',
  ...overrides,
})

export const section = (overrides: Record<string, unknown> = {}) => ({
  id: 'section-1',
  title: 'Synthetic section',
  items: [item()],
  ...overrides,
})

export const metric = (overrides: Record<string, unknown> = {}) => ({
  id: 'metric-1',
  label: 'Synthetic metric',
  value: 7,
  helperText: 'Synthetic helper',
  ...overrides,
})

export const resetRoleDashboardMocks = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
  access.role = 'System Administrator'
  access.profile = {
    fullName: 'Synthetic Admin',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['monitoring.read', 'analytics.read'],
    assignedProjectIds: [],
  }
  flags.monitoring = false
  flags.pins = false
  rbac.allowed = []
  panels.detail = null
  panels.proof = null
  panels.pinned = null
  api.getDashboard.mockResolvedValue(dashboard())
  api.getProjectsForRole.mockResolvedValue([])
  api.getMonitoringDashboard.mockResolvedValue({ metrics: [] })
  api.getActivity.mockResolvedValue({ title: 'Synthetic activity' })
  api.getIndicators.mockResolvedValue([])
  window.history.replaceState(null, '', '/dashboard')
}
