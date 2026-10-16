/* @vitest-environment jsdom */
import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesBoard } from './rules-board'

const state = vi.hoisted(() => ({
  permissions: ['rules.read', 'rules.create', 'rules.update', 'projects.read'],
  projects: vi.fn(),
  listRules: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: '10000000-0000-4000-8000-000000000001',
      userId: '10000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      roles: ['SYSTEM_ADMINISTRATOR'],
      assignedProjectIds: [],
      permissions: state.permissions,
    },
    access: 'ready',
  }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}))
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: state.projects } }))
vi.mock('@/lib/api/core/request', () => ({ PathwaysClientError: class extends Error {} }))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: { listRules: state.listRules },
}))

const rule = {
  id: '50000000-0000-4000-8000-000000000001',
  projectId: null,
  name: 'Low indicator progress',
  code: 'LOW_PROGRESS',
  version: 1,
  severity: 'HIGH',
  status: 'ACTIVE',
  conditions: {
    kind: 'GROUP',
    mode: 'AND',
    children: [
      {
        kind: 'CONDITION',
        id: 'c1',
        metric: 'PROJECT_REMAINING_DAYS',
        operator: 'LT',
        threshold: '30',
      },
    ],
  },
  recommendations: [
    { id: '60000000-0000-4000-8000-000000000001', title: 'Review plan', text: 'x' },
  ],
}
const renderBoard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <RulesBoard />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['rules.read', 'rules.create', 'rules.update', 'projects.read']
  state.projects.mockResolvedValue([])
  state.listRules.mockResolvedValue({ items: [rule], nextCursor: null })
})

describe('RulesBoard', () => {
  it('renders both configuration cards from the rule list', async () => {
    renderBoard()
    await screen.findByText('Rule-based Alert Configuration')
    expect(screen.getByText('Rule-based Recommendation Configuration')).toBeTruthy()
    expect(await screen.findAllByText('Low indicator progress')).toBeTruthy()
    expect(screen.getByText('Review plan')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage Rules' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create Rule' })).toBeNull()
  })
  it('keeps severity out of the recommendation table', async () => {
    renderBoard()
    await screen.findByText('Review plan')
    const tables = screen.getAllByRole('table')
    const headers = (table: HTMLElement) =>
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    expect(headers(tables[0] as HTMLElement)).toContain('Severity')
    expect(headers(tables[1] as HTMLElement)).toEqual([
      'Recommendation',
      'Applies To',
      'Condition',
      'Linked Rule',
      'Status',
    ])
  })
  it('points the empty state at the Create rule tab instead of repeating a button', async () => {
    state.listRules.mockResolvedValue({ items: [], nextCursor: null })
    renderBoard()
    expect((await screen.findAllByText('None yet')).length).toBe(2)
    expect(screen.queryByRole('button', { name: 'Create Rule' })).toBeNull()
    expect(screen.getAllByText(/Use the Create rule tab to add one\./).length).toBe(2)
  })
  it('omits the create guidance without rules.create', async () => {
    state.permissions = ['rules.read', 'projects.read']
    state.listRules.mockResolvedValue({ items: [], nextCursor: null })
    renderBoard()
    expect((await screen.findAllByText('None yet')).length).toBe(2)
    expect(screen.queryByText(/Use the Create rule tab/)).toBeNull()
  })
  it('opens the builder in the Create rule tab rather than a side panel', async () => {
    renderBoard()
    await screen.findAllByText('Low indicator progress')
    expect(screen.getByRole('tab', { name: 'Rule repository' })).toBeTruthy()
    // Radix activates a tab on mouse down, not on a synthetic click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Create rule' }))
    const tab = await screen.findByRole('tab', { name: 'Create rule' })
    await waitFor(() => expect(tab.getAttribute('data-state')).toBe('active'))
    expect(await screen.findByLabelText('Rule Name')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('shows Manage Rules only with the Rule repository controls', async () => {
    renderBoard()
    await screen.findAllByText('Low indicator progress')
    expect(screen.getByRole('button', { name: 'Manage Rules' })).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Create rule' }))
    await screen.findByLabelText('Rule Name')
    expect(screen.queryByRole('button', { name: 'Manage Rules' })).toBeNull()
  })
  it('uses a truncating scope trigger while preserving its full accessible name', async () => {
    renderBoard()
    const scope = await screen.findByRole('combobox', { name: 'Scope: Organization templates' })
    expect(scope.className).toContain('min-w-0')
    expect(scope.getAttribute('title')).toBe('Organization templates')
    expect(scope.querySelector('.truncate')?.textContent).toBe('Organization templates')
  })
  it('loads the recommendation library without inheriting the repository scope', async () => {
    renderBoard()
    await screen.findAllByText('Low indicator progress')
    await waitFor(() =>
      expect(state.listRules).toHaveBeenCalledWith({ limit: '100' }, expect.anything()),
    )
  })
  it('uses the alert library in the recommendation-rule creation flow', async () => {
    renderBoard()
    await screen.findAllByText('Low indicator progress')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Create rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recommendation rule' }))
    expect(await screen.findByText('Choose an existing alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose from alert library' }))
    expect(screen.getByRole('button', { name: 'Choose alert' })).toBeTruthy()
  })
  it('hides the Create rule tab without rules.create', async () => {
    state.permissions = ['rules.read', 'projects.read']
    renderBoard()
    await screen.findAllByText('Low indicator progress')
    expect(screen.queryByRole('tab', { name: 'Create rule' })).toBeNull()
  })
  it('shows an error state with retry', async () => {
    state.listRules.mockRejectedValue(new Error('down'))
    renderBoard()
    expect((await screen.findAllByText('Rules unavailable')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0] as HTMLElement)
    expect(state.listRules.mock.calls.length).toBeGreaterThan(1)
  })
})
