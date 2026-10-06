/* @vitest-environment jsdom */
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleDrawer } from './rule-drawer'

const state = vi.hoisted(() => ({
  createRule: vi.fn(),
  draftRule: vi.fn(),
  archiveRule: vi.fn(),
  activateRule: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: '10000000-0000-4000-8000-000000000001',
      userId: '10000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      roles: ['SYSTEM_ADMINISTRATOR'],
      assignedProjectIds: [],
      permissions: ['rules.read', 'rules.create', 'rules.update', 'rules.activate'],
    },
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {},
  PathwaysClientError: class extends Error {
    status?: number
  },
}))
vi.mock('@/lib/services/rules-human-client', () => ({ rulesHumanClient: state }))

const activeRule = {
  id: '50000000-0000-4000-8000-000000000001',
  projectId: null,
  name: 'Late project',
  code: 'LATE_PROJECT',
  version: 2,
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
    { id: '60000000-0000-4000-8000-000000000001', title: 'Review', text: 'Check.' },
  ],
} as unknown as HumanRule
const renderDrawer = (props: Partial<React.ComponentProps<typeof RuleDrawer>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <RuleDrawer
          mode="alert"
          onClose={vi.fn()}
          onSaved={vi.fn()}
          projectId={null}
          projects={[]}
          {...props}
        />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
const option = (name: string) => screen.queryByRole('option', { name })
const fillBasics = () => {
  fireEvent.change(screen.getByLabelText('Rule Name'), { target: { value: 'Late project' } })
  fireEvent.change(screen.getByLabelText('Metric'), {
    target: { value: 'PROJECT_REMAINING_DAYS' },
  })
  fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '30' } })
}
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.createRule.mockResolvedValue(activeRule)
  state.archiveRule.mockResolvedValue(activeRule)
})

describe('RuleDrawer', () => {
  it('filters the metric list by the Applies To checkboxes and derives the unit', () => {
    renderDrawer()
    expect(option('Project timeline elapsed')).toBeTruthy()
    expect(option('Activity completion')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activity' }))
    expect(option('Activity completion')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'ACTIVITY_OVERDUE_COUNT' },
    })
    expect((screen.getByLabelText('Unit') as HTMLInputElement).value).toBe('count')
    expect(screen.getByTestId('rule-category').textContent).toBe('Delivery')
    expect(screen.queryByLabelText('Rule Category')).toBeNull()
  })
  it('keeps scopes with an available metric enabled', () => {
    renderDrawer()
    expect((screen.getByRole('checkbox', { name: 'Project' }) as HTMLInputElement).disabled).toBe(
      false,
    )
  })
  it('shows the preview sentence and the human-review line', () => {
    renderDrawer()
    fillBasics()
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      "IF Project remaining days is below 30 days THEN raise a medium alert 'Late project' for assigned project users. Human review required.",
    )
    expect(screen.getAllByText(/nothing is executed automatically/).length).toBeGreaterThan(0)
  })
  it('saves a new rule through createRule with a valid tree', async () => {
    const onSaved = vi.fn()
    renderDrawer({ onSaved })
    fillBasics()
    expect((screen.getByLabelText('Rule Code') as HTMLInputElement).value).toBe('LATE_PROJECT')
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalledTimes(1))
    const body = state.createRule.mock.calls[0]?.[0]
    expect(body).toMatchObject({
      name: 'Late project',
      code: 'LATE_PROJECT',
      conditions: {
        kind: 'GROUP',
        mode: 'AND',
        children: [
          { kind: 'CONDITION', metric: 'PROJECT_REMAINING_DAYS', operator: 'LT', threshold: '30' },
        ],
      },
    })
    expect(body.recommendations).toHaveLength(1)
    expect(body.recommendations[0]).toMatchObject({
      title: 'Review flagged condition',
      text: 'Review the recorded evidence and decide on a response.',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null))
  })
  it('blocks saving without a complete recommendation', async () => {
    renderDrawer()
    fillBasics()
    fireEvent.change(screen.getByLabelText('Suggested response'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least one recommendation/)
    expect(state.createRule).not.toHaveBeenCalled()
  })
  it('blocks saving an invalid threshold', async () => {
    renderDrawer()
    fireEvent.change(screen.getByLabelText('Rule Name'), { target: { value: 'Bad' } })
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await screen.findByRole('alert')
    expect(state.createRule).not.toHaveBeenCalled()
  })
  it('collapses a saved rule recommendation to its title until edited', async () => {
    renderDrawer({ rule: activeRule })
    await screen.findByLabelText('Rule Name')
    expect(screen.getByText('Review')).toBeTruthy()
    expect(screen.queryByLabelText('Recommendation title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit recommendation 1' }))
    expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe('Review')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByLabelText('Recommendation title')).toBeNull()
  })
  it('copies a reused recommendation under a new identity', async () => {
    const saved = { id: '60000000-0000-4000-8000-000000000009', title: 'Reassign', text: 'Move.' }
    renderDrawer({ library: [saved] })
    await screen.findByLabelText('Rule Name')
    fireEvent.click(screen.getByRole('button', { name: 'Reuse' }))
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    const sent = state.createRule.mock.calls[0]?.[0].recommendations
    expect(sent.some((item: { title: string }) => item.title === 'Reassign')).toBe(true)
    expect(sent.every((item: { id: string }) => item.id !== saved.id)).toBe(true)
  })
  it('keeps advanced editor labels bound to its own fields over the drawer', async () => {
    const nested = {
      ...activeRule,
      conditions: {
        kind: 'GROUP',
        mode: 'OR',
        children: [
          {
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
              {
                kind: 'CONDITION',
                id: 'c2',
                metric: 'PROJECT_OVERDUE_DAYS',
                operator: 'GT',
                threshold: '0',
              },
            ],
          },
          {
            kind: 'CONDITION',
            id: 'c3',
            metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT',
            operator: 'GTE',
            threshold: '90',
          },
        ],
      },
    } as unknown as HumanRule
    renderDrawer({ rule: nested })
    fireEvent.click(screen.getByRole('button', { name: /advanced editor/i }))
    const dialog = await screen.findByRole('dialog', { name: /advanced/i })
    for (const label of [/^Rule name/i, /^Rule code/i, /^Severity/i])
      expect(dialog.contains(within(dialog).getByLabelText(label))).toBe(true)
  })
  it('requires a note before deactivating an active rule', async () => {
    renderDrawer({ rule: activeRule })
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    const confirm = await screen.findByRole('button', { name: 'Deactivate rule' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Enter a note to deactivate this rule.')).toBeTruthy()
    fireEvent.click(confirm)
    expect(state.archiveRule).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Deactivation note (required)'), {
      target: { value: 'Superseded by a new rule.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate rule' }))
    await waitFor(() => expect(state.archiveRule).toHaveBeenCalledTimes(1))
    expect(state.archiveRule.mock.calls[0]?.[1]).toMatchObject({
      expectedVersion: 2,
      note: 'Superseded by a new rule.',
    })
  })
})
