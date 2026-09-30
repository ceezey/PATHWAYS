/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  preview: {} as Record<string, unknown>,
  refetch: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: 'Project Manager',
    profile: { roles: ['PROJECT_MANAGER'], permissions: ['projects.read', 'projects.detail.read'] },
  }),
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleProjects: 'Projects' } }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: { getProjects: vi.fn() } }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({
    data: [
      {
        id: 'project-a',
        title: 'Project A',
        area: 'Region I',
        sector: 'Health',
        status: 'Active',
        health: 'On Track',
        period: '2026',
        projectManager: 'Ana Cruz',
        description: 'A described project.',
      },
    ],
    eligible: true,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('./use-project-reads', () => ({ useProjectRead: () => state.preview }))
vi.mock('./project-overview-metrics', () => ({
  ProjectOverviewMetrics: () => <div>Overview metrics</div>,
}))

import { ProjectDirectory } from './project-directory'

const detail = {
  id: 'project-a',
  title: 'Project A',
  area: 'Region I',
  sector: 'Health',
  status: 'Active',
  health: 'On Track',
  period: '2026',
  projectManager: 'Ana Cruz',
  description: 'A described project.',
}

describe('ProjectDirectory Quick Preview', () => {
  beforeEach(() => {
    state.refetch.mockReset()
    state.preview = { data: undefined, isError: false, refetch: state.refetch }
  })
  afterEach(cleanup)

  it('renders the description on the card and no dialog until Quick Preview is used', () => {
    render(<ProjectDirectory />)
    expect(screen.getByText('A described project.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the loading state inside the dialog, not after the card grid', () => {
    render(<ProjectDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Quick Preview' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Loading preview')).toBeTruthy()
    expect(document.querySelectorAll('[data-async-state="loading"]')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cancel preview' })).toBeNull()
  })

  it('shows the error state with Retry inside the dialog', () => {
    state.preview = { data: undefined, isError: true, refetch: state.refetch }
    render(<ProjectDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Quick Preview' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Preview unavailable')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the project content in the dialog and closes it', async () => {
    state.preview = { data: detail, isError: false, refetch: state.refetch }
    render(<ProjectDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Quick Preview' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Overview metrics')).toBeTruthy()
    expect(within(dialog).getByText('Ana Cruz')).toBeTruthy()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0] as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
