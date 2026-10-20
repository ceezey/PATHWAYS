/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActionKpiRow } from './action-kpi-row'

const read = vi.hoisted(() => ({
  calls: [] as unknown[][],
  value: {} as Record<string, unknown>,
  counts: vi.fn(),
}))

vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (...args: unknown[]) => {
    read.calls.push(args)
    return read.value
  },
}))
vi.mock('@/lib/api/dashboards', () => ({
  dashboardsClient: { getDashboardActionCounts: read.counts },
}))

const counts = {
  contractVersion: 'dashboard.action-counts.v1' as const,
  businessDate: '2026-10-03',
  pendingApprovals: 3,
  activeAlerts: { count: 100, capped: true },
  overdueActivities: { count: 2, mostOverdue: { code: 'ACT-9', daysLate: 1 } },
  forReview: 0,
}
const ready = (data: unknown, extra: Record<string, unknown> = {}) => {
  read.value = { eligible: true, isError: false, data, refetch: vi.fn(), ...extra }
}

describe('ActionKpiRow', () => {
  afterEach(() => {
    cleanup()
    read.calls.length = 0
    read.counts.mockReset()
  })

  it('reads the shared action counts key for the projects grant and no project', () => {
    ready(undefined)
    render(<ActionKpiRow />)

    expect(read.calls).toHaveLength(1)
    expect(read.calls[0].slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])
    // An omitted flag reads as enabled.
    expect(read.calls[0][4] ?? true).toBe(true)
  })

  it('reads through the dashboards client without arguments', async () => {
    ready(undefined)
    read.counts.mockResolvedValue(counts)
    render(<ActionKpiRow />)

    await expect((read.calls[0][3] as () => Promise<unknown>)()).resolves.toBe(counts)
    expect(read.counts).toHaveBeenCalledWith()
  })

  it('renders nothing when the viewer is not eligible', () => {
    ready(counts, { eligible: false })
    const view = render(<ActionKpiRow />)

    expect(view.container.innerHTML).toBe('')
  })

  it('shows the loading page until the counts arrive', () => {
    ready(undefined)
    render(<ActionKpiRow />)

    expect(screen.getByText('Loading task counts')).toBeTruthy()
    expect(screen.getByText('Loading your task counts.')).toBeTruthy()
  })

  it('shows the error page before any data and reads again on Retry', () => {
    const refetch = vi.fn()
    ready(counts, { isError: true, refetch })
    render(<ActionKpiRow />)

    expect(screen.getByText('Task counts unavailable')).toBeTruthy()
    expect(screen.getByText('Your task counts could not be loaded.')).toBeTruthy()
    expect(screen.queryByText('Pending approvals')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows one link per present count with its value and target', () => {
    ready(counts)
    render(<ActionKpiRow />)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/projects',
      '/alerts',
      '/projects',
      '/projects',
    ])
    expect(links.map((link) => link.textContent)).toEqual([
      'Pending approvals3Expenses awaiting review',
      'Active budget alerts100+Require your decision',
      'Overdue activities2ACT-9 is 1 day late',
      'For review0Evidence submitted',
    ])
    expect(screen.getByLabelText('Tasks needing action')).toBeTruthy()
  })

  it('renders nothing when every count is hidden', () => {
    ready({
      ...counts,
      pendingApprovals: null,
      activeAlerts: null,
      overdueActivities: null,
      forReview: null,
    })
    const view = render(<ActionKpiRow />)

    expect(view.container.innerHTML).toBe('')
  })

  it('colors each card value and icon tile by its tone and draws its own icon', () => {
    ready(counts)
    render(<ActionKpiRow />)

    const parts = screen.getAllByRole('link').map((link) => ({
      value: link.querySelector('p.text-3xl')?.className,
      tile: link.querySelector('div.h-10')?.className,
      icon: link.querySelector('svg')?.getAttribute('class'),
    }))
    const tones = ['danger', 'warning', 'info', 'success']
    const icons = ['clipboard-list', 'triangle-alert', 'clock', 'file-check']
    parts.forEach((part, n) => {
      expect(part.value).toContain(`text-${tones[n]}`)
      expect(part.tile).toContain(`bg-${tones[n]}-subtle text-${tones[n]}`)
      expect(part.icon).toContain(`lucide-${icons[n]}`)
    })
  })

  it('shows an alert count of 0 and the plural days late', () => {
    ready({
      ...counts,
      activeAlerts: { count: 0, capped: false },
      overdueActivities: { count: 4, mostOverdue: { code: 'ACT-9', daysLate: 5 } },
    })
    render(<ActionKpiRow />)

    const text = screen.getAllByRole('link').map((link) => link.textContent)
    expect(text[1]).toBe('Active budget alerts0Require your decision')
    expect(text[2]).toBe('Overdue activities4ACT-9 is 5 days late')
  })

  it('says nothing is past due on the overdue card', () => {
    ready({ ...counts, overdueActivities: { count: 0, mostOverdue: null } })
    render(<ActionKpiRow />)

    expect(screen.getByText('Nothing is past due')).toBeTruthy()
  })
})
