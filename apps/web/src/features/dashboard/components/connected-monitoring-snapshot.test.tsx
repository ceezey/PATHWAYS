/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectedMonitoringSnapshot } from './connected-monitoring-snapshot'

const api = vi.hoisted(() => ({ getProjectsForRole: vi.fn(), getMonitoringDashboard: vi.fn() }))
const flags = vi.hoisted(() => ({ pins: false }))
const rbac = vi.hoisted(() => ({ allowed: ['monitor_evaluate.view'] as string[] }))
const seen = vi.hoisted(() => ({ pinned: null as unknown }))

vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/rbac/can', () => ({
  can: (_role: string, permission: string) => rbac.allowed.includes(permission),
}))
vi.mock('@/constants/feature-flags', () => ({
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
}))
vi.mock('../monitoring-reach-metrics.utils', () => ({
  monitoringReachMetrics: (result: { metrics: unknown[] }) => result.metrics,
}))
vi.mock('./pinned-charts', () => ({
  PinnedCharts: ({ projects }: { projects: Array<{ id: string }> }) => {
    seen.pinned = projects
    return <div data-testid="pinned-charts">{projects.map((row) => row.id).join(',')}</div>
  },
}))
// Stubs expose the card props and the position of the icon in the rotation.
vi.mock('@/components/pathways', async () => {
  const lucide = await import('lucide-react')
  const rotation = [
    lucide.FolderKanban,
    lucide.AlertTriangle,
    lucide.Clock,
    lucide.BarChart3,
    lucide.Loader2,
  ]
  return {
    SectionCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <section aria-label={title}>{children}</section>
    ),
    EmptyState: ({
      title,
      description,
      icon,
      className,
    }: { title: string; description: string; icon: unknown; className?: string }) => (
      <div
        data-class={className ?? ''}
        data-icon={rotation.indexOf(icon as never)}
        data-testid="empty"
      >
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    ),
    MetricCard: (card: {
      description: string
      href?: string
      icon: unknown
      label: string
      tone: string
      value: string
    }) => (
      <div
        data-href={card.href ?? ''}
        data-icon={rotation.indexOf(card.icon as never)}
        data-testid="metric"
        data-tone={card.tone}
        data-value={card.value}
      >
        {card.label}|{card.description}
      </div>
    ),
  }
})
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

type Props = ComponentProps<typeof ConnectedMonitoringSnapshot>
const projects = [
  { id: 'project-a', title: 'Project A' },
  { id: 'project-b', title: 'Project B' },
]
const lastYear = { periodStart: '2025-09-27', periodEnd: '2026-09-27' }
const show = (overrides: Record<string, unknown> = {}) =>
  render(
    <ConnectedMonitoringSnapshot
      {...({ role: 'System Administrator', ...overrides } as unknown as Props)}
    />,
  )
const scope = () => screen.getByLabelText('Project scope') as HTMLSelectElement
const metric = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `m${n}`,
  label: `Metric ${n}`,
  value: n,
  helperText: `Helper ${n}`,
  ...overrides,
})
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('ConnectedMonitoringSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T04:00:00.000Z'))
    flags.pins = false
    rbac.allowed = ['monitor_evaluate.view']
    api.getProjectsForRole.mockResolvedValue(projects)
    api.getMonitoringDashboard.mockResolvedValue({ metrics: [] })
    window.history.replaceState(null, '', '/dashboard')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('renders nothing and reads no monitoring without a role', async () => {
    const { container } = show({ role: null })
    await act(async () => {})

    expect(container.innerHTML).toBe('')
    expect(api.getProjectsForRole).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('renders nothing for a role that cannot view monitoring', async () => {
    rbac.allowed = []
    const { container } = show()
    await act(async () => {})

    expect(container.innerHTML).toBe('')
  })

  it('reads the projects of the role', async () => {
    show({ role: 'Project Manager' })

    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Project Manager'))
    expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
  })

  it('titles the section Project monitoring', async () => {
    show()
    await screen.findByLabelText('Project scope')

    expect(screen.getByRole('region', { name: 'Project monitoring' })).toBeTruthy()
  })

  describe('scope', () => {
    it('lists all projects first, then each project, and starts on all', async () => {
      show()

      await waitFor(() => expect(scope().value).toBe('all'))
      expect([...scope().options].map((option) => [option.value, option.textContent])).toEqual([
        ['', 'No selection'],
        ['all', 'All projects'],
        ['project-a', 'Project A'],
        ['project-b', 'Project B'],
      ])
      expect(scope().id).toBe('dashboard-project-scope')
      expect(screen.getByText('Project scope').getAttribute('for')).toBe('dashboard-project-scope')
    })

    it('starts on the project of the address when the role has it', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-b')
      show()

      await waitFor(() => expect(scope().value).toBe('project-b'))
    })

    it('starts on all when the address names an unknown project', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-z')
      show()

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('keeps the chosen project when the projects load again', async () => {
      const view = show({ role: 'Project Manager' })
      await waitFor(() => expect(scope().value).toBe('all'))
      fireEvent.change(scope(), { target: { value: 'project-a' } })

      view.rerender(
        <ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />,
      )

      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      await act(async () => {})
      expect(scope().value).toBe('project-a')
    })

    it('falls back to all when the chosen project is gone after a reload', async () => {
      const view = show({ role: 'Project Manager' })
      await waitFor(() => expect(scope().value).toBe('all'))
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      api.getProjectsForRole.mockResolvedValue([projects[1]])

      view.rerender(
        <ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />,
      )

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('has no scope and reads no monitoring when no project is authorized', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      show()

      expect(await screen.findByText('No authorized projects')).toBeTruthy()
      expect(scope().value).toBe('')
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
      expect(
        screen.getByText(
          'No projects are assigned to this account. Contact an administrator to review project access.',
        ),
      ).toBeTruthy()
      expect(screen.getByTestId('empty').getAttribute('data-icon')).toBe('0')
    })

    it('shows the reason when the projects cannot be read, and a fixed text for a non-error', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Directory is down.'))
      const view = show()
      expect(await screen.findByText('Directory is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()
      expect(screen.getByTestId('empty').getAttribute('data-icon')).toBe('1')
      expect(screen.getByTestId('empty').getAttribute('data-class')).toBe(
        'rounded-xl border border-border bg-card',
      )
      view.unmount()

      api.getProjectsForRole.mockRejectedValueOnce('down')
      show()
      expect(await screen.findByText('Project scope could not be loaded.')).toBeTruthy()
    })

    it('ignores the projects of a role that was replaced before they arrived', async () => {
      const first = deferred<typeof projects>()
      api.getProjectsForRole.mockReturnValueOnce(first.promise)
      const view = show({ role: 'Project Manager' })

      view.rerender(
        <ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />,
      )
      await waitFor(() => expect(scope().value).toBe('all'))
      await act(async () => {
        first.resolve([{ id: 'stale', title: 'Stale project' }])
      })

      expect(screen.queryByText('Stale project')).toBeNull()
    })

    it('ignores a project failure of a role that was replaced before it arrived', async () => {
      const first = deferred<typeof projects>()
      api.getProjectsForRole.mockReturnValueOnce(first.promise)
      const view = show({ role: 'Project Manager' })

      view.rerender(
        <ConnectedMonitoringSnapshot {...({ role: 'System Administrator' } as unknown as Props)} />,
      )
      await waitFor(() => expect(scope().value).toBe('all'))
      await act(async () => {
        first.reject(new Error('late failure'))
      })

      expect(screen.queryByText('late failure')).toBeNull()
    })
  })

  describe('monitoring read', () => {
    it('reads the totals of every project for the trailing year', async () => {
      show()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastYear)
    })

    it('reads the chosen project and shows the loading line until its cards arrive', async () => {
      api.getMonitoringDashboard.mockResolvedValueOnce({ metrics: [metric(1)] })
      show()
      await screen.findByText('Metric 1|Helper 1')
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))

      fireEvent.change(scope(), { target: { value: 'project-a' } })

      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
          projectId: 'project-a',
          ...lastYear,
        }),
      )
      expect(screen.queryByText('Metric 1|Helper 1')).toBeNull()
      expect(screen.getByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('does not read monitoring for a cleared scope', async () => {
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))

      fireEvent.change(scope(), { target: { value: '' } })
      await act(async () => {})

      expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1)
    })

    it('shows the reason of a failure, a fixed text for a non-error, and clears it for the next scope', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      show()
      expect(await screen.findByText('Monitoring is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      expect(await screen.findByText('Monitoring data could not be loaded.')).toBeTruthy()

      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(1)] })
      fireEvent.change(scope(), { target: { value: 'project-b' } })
      expect(await screen.findByText('Metric 1|Helper 1')).toBeTruthy()
      expect(screen.queryByText('Monitoring data could not be loaded.')).toBeNull()
    })

    it('ignores the answer of a scope that was replaced before it arrived', async () => {
      const first = deferred<{ metrics: unknown[] }>()
      api.getMonitoringDashboard.mockReturnValueOnce(first.promise)
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(2)] })

      fireEvent.change(scope(), { target: { value: 'project-a' } })
      await screen.findByText('Metric 2|Helper 2')
      await act(async () => {
        first.resolve({ metrics: [metric(9)] })
      })

      expect(screen.queryByText('Metric 9|Helper 9')).toBeNull()
    })

    it('ignores the failure of a scope that was replaced before it arrived', async () => {
      const first = deferred<{ metrics: unknown[] }>()
      api.getMonitoringDashboard.mockReturnValueOnce(first.promise)
      show()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric(2)] })

      fireEvent.change(scope(), { target: { value: 'project-a' } })
      await screen.findByText('Metric 2|Helper 2')
      await act(async () => {
        first.reject(new Error('late failure'))
      })

      expect(screen.queryByText('late failure')).toBeNull()
    })
  })

  describe('cards', () => {
    it('shows each metric with its value, link and tone, rotating the four icons', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        metrics: [
          metric(1, { severity: 'success', href: '/one' }),
          metric(2, { severity: 'warning', value: 'Withheld' }),
          metric(3, { severity: 'danger' }),
          metric(4, { severity: 'neutral' }),
          metric(5),
        ],
      })
      show()

      await screen.findByText('Metric 5|Helper 5')
      const cards = screen.getAllByTestId('metric')
      expect(cards.map((card) => card.textContent)).toEqual([
        'Metric 1|Helper 1',
        'Metric 2|Helper 2',
        'Metric 3|Helper 3',
        'Metric 4|Helper 4',
        'Metric 5|Helper 5',
      ])
      expect(cards.map((card) => card.getAttribute('data-icon'))).toEqual(['0', '1', '2', '3', '0'])
      expect(cards.map((card) => card.getAttribute('data-tone'))).toEqual([
        'success',
        'warning',
        'danger',
        'info',
        'info',
      ])
      expect(cards.map((card) => card.getAttribute('data-value'))).toEqual([
        '1',
        'Withheld',
        '3',
        '4',
        '5',
      ])
      expect(cards.map((card) => card.getAttribute('data-href'))).toEqual(['/one', '', '', '', ''])
      expect(screen.queryByText('Loading project monitoring data...')).toBeNull()
    })
  })

  describe('action and pinned charts', () => {
    it('puts the action at the right of the scope row only when there is one', async () => {
      show({ action: <button type="button">Open monitoring</button> })

      const action = await screen.findByRole('button', { name: 'Open monitoring' })
      expect(action.parentElement?.className).toBe('ml-auto')
      cleanup()

      show()
      await screen.findByText('Project scope')
      expect(document.querySelector('.ml-auto')).toBeNull()
    })

    it('shows the pinned charts of the projects only while the pins flag is on', async () => {
      show()
      await waitFor(() => expect(scope().value).toBe('all'))
      expect(screen.queryByTestId('pinned-charts')).toBeNull()
      cleanup()

      flags.pins = true
      show()
      await waitFor(() =>
        expect(screen.getByTestId('pinned-charts').textContent).toBe('project-a,project-b'),
      )
      expect(seen.pinned).toEqual(projects)
    })
  })
})
