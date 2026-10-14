/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  access,
  action,
  api,
  dashboard,
  flags,
  item,
  metric,
  rbac,
  resetRoleDashboardMocks,
  router,
  section,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const shown = async (data: Record<string, unknown> = dashboard()) => {
  api.getDashboard.mockResolvedValue(data)
  render(<RoleDashboard />)
  await screen.findByRole('heading', { name: 'Welcome! System Administrator' })
}

describe('Role dashboard states and records', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('who sees what', () => {
    it('hands every other role to the role overview with the profile name and loads no dashboard', () => {
      access.role = 'Project Manager'
      render(<RoleDashboard />)

      expect(screen.getByTestId('role-overview').textContent).toBe(
        'Project Manager|Synthetic Admin',
      )
      expect(api.getDashboard).not.toHaveBeenCalled()
    })

    it('passes no name to the role overview without a profile', () => {
      access.role = 'Project Officer'
      access.profile = null
      render(<RoleDashboard />)

      expect(screen.getByTestId('role-overview').textContent).toBe('Project Officer|no name')
    })

    it('keeps loading and requests nothing without a role', () => {
      access.role = null
      render(<RoleDashboard />)

      expect(screen.getByText('Loading dashboard...')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Dashboard' }).className).toBe('sr-only')
      expect(api.getDashboard).not.toHaveBeenCalled()
    })

    it('loads the home dashboard for the administrator and then greets by role', async () => {
      api.getDashboard.mockReturnValue(new Promise(() => {}))
      render(<RoleDashboard />)

      expect(screen.getByText('Loading dashboard...')).toBeTruthy()
      expect(api.getDashboard).toHaveBeenCalledWith('System Administrator')
    })

    it('shows the unavailable page when the dashboard read fails', async () => {
      api.getDashboard.mockRejectedValue(new Error('down'))
      render(<RoleDashboard />)

      expect(await screen.findByText('Dashboard data unavailable')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Dashboard unavailable' })).toBeTruthy()
      expect(
        screen.getByText(
          'We could not load this dashboard right now. Reload the page to try again.',
        ),
      ).toBeTruthy()
    })

    it('shows the empty page when there are no metrics and no section items', async () => {
      await shown(dashboard({ sections: [section({ items: [] })] }))

      expect(screen.getByText('No dashboard records')).toBeTruthy()
      expect(screen.getByText('No dashboard records are available for this account.')).toBeTruthy()
    })

    it.each([
      ['a metric', dashboard({ metrics: [metric()] })],
      ['a section item', dashboard({ sections: [section()] })],
    ])('hides the empty page when there is %s', async (_label, data) => {
      await shown(data)

      expect(screen.queryByText('No dashboard records')).toBeNull()
    })

    it('loads the dashboard when the role arrives after the first render', async () => {
      access.role = null
      const view = render(<RoleDashboard />)
      expect(api.getDashboard).not.toHaveBeenCalled()

      access.role = 'System Administrator'
      view.rerender(<RoleDashboard />)

      expect(
        await screen.findByRole('heading', { name: 'Welcome! System Administrator' }),
      ).toBeTruthy()
      expect(api.getDashboard).toHaveBeenCalledWith('System Administrator')
    })

    it('hides the empty page while any section still has an item', async () => {
      await shown(
        dashboard({
          sections: [section({ id: 'empty', items: [] }), section({ id: 'full' })],
        }),
      )

      expect(screen.queryByText('No dashboard records')).toBeNull()
    })

    it('draws no detail section without sections', async () => {
      await shown(dashboard({ metrics: [metric()] }))

      expect(screen.queryByText('Dashboard detail')).toBeNull()
    })

    it('shows the task counts row only while the administrator monitoring flag is on', async () => {
      await shown()
      expect(screen.queryByTestId('action-kpi-row')).toBeNull()
      cleanup()

      flags.monitoring = true
      await shown()
      expect(screen.getByTestId('action-kpi-row')).toBeTruthy()
    })

    it('reloads nothing when the render repeats', async () => {
      await shown()

      expect(api.getDashboard).toHaveBeenCalledTimes(1)
    })
  })

  describe('metrics and executive summary', () => {
    const metrics = [
      metric({
        id: 'm-danger',
        label: 'Danger metric',
        value: 1,
        severity: 'danger',
        href: '/danger',
      }),
      metric({ id: 'm-warning', label: 'Warning metric', value: 2, severity: 'warning' }),
      metric({ id: 'm-success', label: 'Success metric', value: 3, severity: 'success' }),
      metric({ id: 'm-neutral', label: 'Neutral metric', value: 4, severity: 'neutral' }),
      metric({ id: 'm-plain', label: 'Plain metric', value: 'N/A' }),
    ]
    const cardOf = (label: string) => screen.getByText(label).closest('.relative') as HTMLElement

    it('shows the metric cards of a role that cannot see the monitoring section', async () => {
      await shown(dashboard({ metrics }))

      expect(within(cardOf('Danger metric')).getByText('1')).toBeTruthy()
      expect(within(cardOf('Plain metric')).getByText('N/A')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'View Danger metric' }).getAttribute('href')).toBe(
        '/danger',
      )
      expect(screen.queryByRole('link', { name: 'View Warning metric' })).toBeNull()
    })

    it('colors each card by severity and falls back to info', async () => {
      await shown(dashboard({ metrics }))

      expect(cardOf('Danger metric').querySelector('.bg-danger-subtle')).toBeTruthy()
      expect(cardOf('Warning metric').querySelector('.bg-warning-subtle')).toBeTruthy()
      expect(cardOf('Success metric').querySelector('.bg-success-subtle')).toBeTruthy()
      expect(cardOf('Neutral metric').querySelector('.bg-info-subtle')).toBeTruthy()
      expect(cardOf('Plain metric').querySelector('.bg-info-subtle')).toBeTruthy()
    })

    it('gives the first five cards four icons in order and then repeats the first', async () => {
      await shown(dashboard({ metrics }))

      const icons = metrics.map(
        (row) =>
          cardOf(row.label as string)
            .querySelector('.h-10 svg')
            ?.getAttribute('class') ?? '',
      )
      expect(icons).toEqual([
        'lucide lucide-folder-kanban h-5 w-5',
        'lucide lucide-triangle-alert h-5 w-5',
        'lucide lucide-clock h-5 w-5',
        'lucide lucide-chart-column h-5 w-5',
        'lucide lucide-folder-kanban h-5 w-5',
      ])
    })

    it('hides the metric cards of a role that sees the monitoring section', async () => {
      rbac.allowed = ['monitor_evaluate.view']
      await shown(dashboard({ metrics }))

      expect(screen.queryByText('Danger metric')).toBeNull()
    })

    it('hides the metric cards while the dashboard has none', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(document.querySelector('section.grid')).toBeNull()
    })

    it('shows the executive summary with the primary action', async () => {
      await shown(
        dashboard({
          executive: { title: 'Executive model' },
          primaryAction: action({ label: 'Open portfolio' }),
          sections: [section()],
        }),
      )

      expect(screen.getByTestId('executive').textContent).toBe('Executive model|Open portfolio')
      expect(screen.getByText('Operational detail')).toBeTruthy()
      expect(
        screen.getByRole('heading', { name: 'Projects and alerts behind the summary' }),
      ).toBeTruthy()
    })

    it('hides the executive summary and names the detail section for screen readers without one', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(screen.queryByTestId('executive')).toBeNull()
      expect(screen.queryByText('Operational detail')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Dashboard detail' }).className).toBe('sr-only')
    })
  })

  describe('sections and list items', () => {
    it('shows the section title, description and a View All link', async () => {
      await shown(
        dashboard({
          sections: [
            section({
              description: 'Synthetic note',
              viewAllHref: '/all',
              viewAllLabel: 'See every row',
            }),
            section({ id: 'section-2', title: 'Second', viewAllHref: '/second' }),
            section({ id: 'section-3', title: 'Third' }),
          ],
        }),
      )

      expect(screen.getByText('Synthetic note')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'See every row' }).getAttribute('href')).toBe('/all')
      expect(screen.getByRole('link', { name: 'View All' }).getAttribute('href')).toBe('/second')
      expect(screen.getAllByRole('link', { name: /View All|See every row/ })).toHaveLength(2)
    })

    it('shows the empty text of a section without items, or the default', async () => {
      await shown(
        dashboard({
          sections: [
            section({ items: [] }),
            section({ id: 'section-2', title: 'Second', items: [], emptyText: 'Nothing here yet' }),
            section({ id: 'section-3', title: 'Third' }),
          ],
        }),
      )

      expect(screen.getAllByText('Nothing to review')).toHaveLength(2)
      expect(screen.getByText('No records are currently available.')).toBeTruthy()
      expect(screen.getByText('Nothing here yet')).toBeTruthy()
    })

    it.each(['portfolio-health', 'escalated-alerts'])(
      'makes the %s list a scrollable region limited to three visible entries',
      async (id) => {
        await shown(dashboard({ sections: [section({ id, title: `Section ${id}` })] }))

        const region = screen.getByLabelText(`Section ${id} list`)
        expect(region.getAttribute('data-visible-entry-limit')).toBe('3')
        expect(region.getAttribute('tabindex')).toBe('0')
        expect(region.className).toBe('max-h-[19rem] overflow-y-auto pr-2')
      },
    )

    it('leaves other lists unrestricted', async () => {
      await shown(dashboard({ sections: [section()] }))

      const list = screen.getByText('Synthetic item').closest('[class*="border-b"]')?.parentElement
      expect(list?.getAttribute('aria-label')).toBeNull()
      expect(list?.getAttribute('data-visible-entry-limit')).toBeNull()
      expect(list?.getAttribute('tabindex')).toBeNull()
      expect(list?.className).toBe('')
    })

    it('shows an item with a link, meta, status and progress', async () => {
      await shown(
        dashboard({
          sections: [
            section({
              items: [
                item({
                  href: '/projects/p1',
                  meta: 'Synthetic meta',
                  status: 'At risk',
                  severity: 'danger',
                  progress: 40,
                }),
              ],
            }),
          ],
        }),
      )

      expect(screen.getByRole('link', { name: 'Synthetic item' }).getAttribute('href')).toBe(
        '/projects/p1',
      )
      expect(screen.getByText('Synthetic meta')).toBeTruthy()
      expect(screen.getByText('At risk').className).toContain('text-danger')
      const bar = screen.getByRole('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe('40')
      expect(bar.getAttribute('aria-label')).toBe('Progress')
      expect(bar.firstElementChild?.className).toContain('bg-danger')
      expect(screen.getByText('Progress')).toBeTruthy()
    })

    it('shows an item without a link as a heading, with no meta, status or progress', async () => {
      await shown(dashboard({ sections: [section()] }))

      expect(screen.getByRole('heading', { name: 'Synthetic item' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Synthetic item' })).toBeNull()
      expect(screen.queryByRole('progressbar')).toBeNull()
      expect(document.querySelector('.rounded-full.border')).toBeNull()
    })

    it('shows a zero progress and keeps the compact portfolio-health bar unlabeled', async () => {
      await shown(
        dashboard({
          sections: [
            section({ id: 'portfolio-health', title: 'Health', items: [item({ progress: 0 })] }),
          ],
        }),
      )

      const bar = screen.getByRole('progressbar')
      expect(bar.getAttribute('aria-valuenow')).toBe('0')
      expect(bar.getAttribute('aria-label')).toBe('Progress')
      expect(screen.queryByText('Progress', { selector: 'span' })).toBeNull()
      expect(bar.closest('.sm\\:max-w-\\[220px\\]')).toBeTruthy()
    })

    it.each([
      ['neutral', 'bg-muted'],
      ['info', 'bg-info-subtle'],
      ['success', 'bg-success-subtle'],
      ['warning', 'bg-warning-subtle'],
      ['danger', 'bg-danger-subtle'],
      [undefined, 'bg-info-subtle'],
    ])('colors the %s status badge with %s', async (severity, expected) => {
      await shown(
        dashboard({ sections: [section({ items: [item({ status: 'Badge', severity })] })] }),
      )

      expect(screen.getByText('Badge').className).toContain(expected)
    })

    it.each([
      ['danger', 'bg-danger'],
      ['warning', 'bg-warning'],
      ['success', 'bg-success'],
      ['neutral', 'bg-info'],
      [undefined, 'bg-info'],
    ])('colors a %s progress bar with %s', async (severity, expected) => {
      await shown(dashboard({ sections: [section({ items: [item({ progress: 50, severity })] })] }))

      expect(screen.getByRole('progressbar').firstElementChild?.className).toContain(expected)
    })

    it('draws item actions as a default primary and an outline secondary button', async () => {
      await shown(
        dashboard({
          sections: [
            section({
              items: [
                item({
                  primaryAction: action({ id: 'p', label: 'Primary go' }),
                  secondaryAction: action({ id: 's', label: 'Secondary go', kind: 'dialog' }),
                }),
              ],
            }),
          ],
        }),
      )

      const primary = screen.getByRole('button', { name: 'Primary go' })
      const secondary = screen.getByRole('button', { name: 'Secondary go' })
      expect(primary.classList.contains('bg-primary')).toBe(true)
      expect(secondary.classList.contains('bg-primary')).toBe(false)
      expect(secondary.classList.contains('bg-card')).toBe(true)
      expect(primary.querySelector('svg')).toBeTruthy()
      expect(secondary.querySelector('svg')).toBeNull()
    })

    it('shows only the actions an item has', async () => {
      await shown(
        dashboard({
          sections: [
            section({ items: [item({ secondaryAction: action({ label: 'Only secondary' }) })] }),
          ],
        }),
      )

      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Only secondary' })).toBeTruthy()
    })
  })

  describe('item actions', () => {
    const clickAction = async (actionRecord: Record<string, unknown>) => {
      await shown(
        dashboard({ sections: [section({ items: [item({ primaryAction: actionRecord })] })] }),
      )
      fireEvent.click(screen.getByRole('button', { name: actionRecord.label as string }))
    }

    it('follows the href of a navigation action', async () => {
      await clickAction(action({ id: 'go', label: 'Go', href: '/alerts/repository' }))

      expect(router.push).toHaveBeenCalledWith('/alerts/repository')
    })

    it('falls back to the workflow page for a navigation action without an href', async () => {
      await clickAction(action({ id: 'go', label: 'Go', href: undefined }))

      expect(router.push).toHaveBeenCalledWith('/projects')
    })

    it.each([
      ['Review budget', undefined, '/projects'],
      ['Check proof', undefined, '/projects'],
      ['Proof alert', undefined, '/projects'],
      ['Budget alert', undefined, '/projects'],
      ['Decision needed', undefined, '/alerts'],
      ['Recommendation', undefined, '/alerts'],
      ['Outcome review', undefined, '/alerts'],
      ['Flag review', undefined, '/alerts'],
      ['Raise alert', undefined, '/alerts'],
      ['Orientation', undefined, '/projects'],
      ['Activity alert', undefined, '/alerts'],
      ['Open', 'Review the alert', '/alerts'],
      ['Open', 'Budget summary', '/projects'],
      ['Open', undefined, '/projects'],
      ['Something else', undefined, '/projects'],
    ])('sends the %s action titled %s to %s', async (label, dialogTitle, expected) => {
      await clickAction(action({ id: 'dlg', label, kind: 'dialog', href: undefined, dialogTitle }))

      expect(router.push).toHaveBeenCalledWith(expected)
    })

    it('sends a dialog action to the workflow page even when it has an href', async () => {
      await clickAction(action({ id: 'dlg', label: 'Open', kind: 'dialog', href: '/ignored' }))

      expect(router.push).toHaveBeenCalledWith('/projects')
    })

    it.each(['review-proof', 'review-expense', 'open-activity-update', 'view-orientation-summary'])(
      'opens the %s activity in the review panel and does not navigate',
      async (id) => {
        api.getActivity.mockReturnValue(new Promise(() => {}))
        await clickAction(
          action({ id, label: 'Review', href: '/projects/p1/activities/a1?review=r1' }),
        )

        expect(await screen.findByText('Loading review')).toBeTruthy()
        expect(api.getActivity).toHaveBeenCalledWith('p1', 'a1')
        expect(router.push).not.toHaveBeenCalled()
      },
    )

    it('navigates when a review action has no activity address', async () => {
      await clickAction(action({ id: 'review-proof', label: 'Review', href: '/projects/p1' }))

      expect(router.push).toHaveBeenCalledWith('/projects/p1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('navigates when another action names an activity address', async () => {
      await clickAction(
        action({ id: 'other', label: 'Review', href: '/projects/p1/activities/a1?review=r1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/projects/p1/activities/a1?review=r1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('does not treat an address with another segment before activities as an activity address', async () => {
      await clickAction(
        action({ id: 'review-proof', label: 'Review', href: '/projects/p1/x/activities/a1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/projects/p1/x/activities/a1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })

    it('does not treat a prefix of the address as an activity address', async () => {
      await clickAction(
        action({ id: 'review-proof', label: 'Review', href: '/x/projects/p1/activities/a1' }),
      )

      expect(router.push).toHaveBeenCalledWith('/x/projects/p1/activities/a1')
      expect(api.getActivity).not.toHaveBeenCalled()
    })
  })
})
