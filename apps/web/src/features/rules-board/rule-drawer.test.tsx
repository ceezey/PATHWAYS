import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
/* @vitest-environment jsdom */
import type { HumanRule } from '@pathways/shared'
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
}))
vi.mock('@/lib/api/core/request', () => ({
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
    expect(option('Activities completed')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activity' }))
    expect(option('Activities completed')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'ACTIVITY_OVERDUE_COUNT' },
    })
    expect((screen.getByLabelText('Unit') as HTMLInputElement).value).toBe('Count')
    expect(screen.getByTestId('rule-category').textContent).toBe('Delivery')
    expect(screen.queryByLabelText('Rule Category')).toBeNull()
  })
  it('keeps scopes with an available metric enabled', () => {
    renderDrawer()
    expect((screen.getByRole('checkbox', { name: 'Project' }) as HTMLInputElement).disabled).toBe(
      false,
    )
  })
  it('explains scopes through accessible information tooltips without setting a threshold', () => {
    renderDrawer()
    const projectScopeInfo = screen.getByRole('button', {
      name: 'More information about Project scope',
    })
    fireEvent.mouseEnter(projectScopeInfo)
    expect(screen.getByRole('tooltip').textContent).toBe('Project schedule')
    fireEvent.mouseLeave(projectScopeInfo)

    const indicatorScopeInfo = screen.getByRole('button', {
      name: 'More information about Indicator scope',
    })
    fireEvent.focus(indicatorScopeInfo)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Indicator results. Indicator metrics require a project record.',
    )
    fireEvent.keyDown(indicatorScopeInfo, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assessment' }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'SURVEY_MEAN_IMPROVEMENT_POINTS' },
    })
    const guidance = screen.getByRole('button', { name: 'About Average assessment score change' })
    expect(guidance.getAttribute('aria-expanded')).toBe('false')
    expect(
      screen.queryByText(
        'Average post-test minus pre-test score after converting scores to a 0–100 scale. Negative values indicate a decline.',
      ),
    ).toBeNull()
    fireEvent.click(guidance)
    expect(guidance.getAttribute('aria-expanded')).toBe('true')
    expect(
      screen.getByText(
        'Average post-test minus pre-test score after converting scores to a 0–100 scale. Negative values indicate a decline.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Monitors: Project aggregate. Unit: Percentage points.')).toBeTruthy()
    expect(
      screen.getByText('A score increasing from 60% to 75% changes by 15 percentage points.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Enter the threshold yourself. This example does not fill or save a threshold.',
      ),
    ).toBeTruthy()
    fireEvent.click(guidance)
    expect(guidance.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Monitors: Project aggregate. Unit: Percentage points.')).toBeNull()
    expect((screen.getByLabelText('Threshold') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      'Raise a Medium alert when Average assessment score change is below ... percentage points. Human review required.',
    )
  })
  it('shows the preview sentence and the human-review line', () => {
    renderDrawer()
    fillBasics()
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      'Raise a Medium alert when Days until project end is below 30 days. Human review required.',
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
      title: 'Review project timeline',
      text: 'Check the current schedule and recorded evidence with the project team, then agree on a follow-up.',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null, 'created'))
  })
  it('blocks saving without a complete recommendation', async () => {
    renderDrawer()
    fillBasics()
    fireEvent.change(screen.getByLabelText('Suggested response'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least one recommendation/)
    expect(state.createRule).not.toHaveBeenCalled()
  })
  it('shows the unavailable Indicator explanation on hover and focus while Activity stays available', () => {
    renderDrawer()
    const indicator = screen.getByRole('checkbox', { name: /Indicator/ }) as HTMLInputElement
    expect(indicator.disabled).toBe(true)
    const hintTrigger = screen.getByRole('button', {
      name: 'More information about Indicator scope',
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(hintTrigger)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Indicator results. Indicator metrics require a project record.',
    )
    fireEvent.mouseLeave(hintTrigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(hintTrigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(hintTrigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    const activity = screen.getByRole('checkbox', { name: /Activity/ }) as HTMLInputElement
    expect(activity.disabled).toBe(false)
    fireEvent.click(activity)
    expect(option('Activities completed')).toBeTruthy()
    expect(option('Days activity is overdue')).toBeNull()
  })
  it('clears incompatible conditions and bindings when a project rule becomes an organization template', () => {
    const project = { id: '30000000-0000-4000-8000-000000000001', title: 'North' }
    renderDrawer({ projectId: project.id, projects: [project] })
    fireEvent.click(screen.getByRole('checkbox', { name: /Indicator/ }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'INDICATOR_PROGRESS_PERCENT' },
    })
    fireEvent.change(screen.getByLabelText('Rule scope'), { target: { value: '' } })
    expect(screen.getByRole('alert').textContent).toMatch(/Cleared 1 incompatible condition/)
    expect(option('Progress toward indicator target')).toBeNull()
    expect((screen.getByLabelText('Metric') as HTMLSelectElement).value).toBe(
      'PROJECT_TIMELINE_ELAPSED_PERCENT',
    )
  })
  it('preserves compatible conditions when a rule moves between project scopes', () => {
    const first = { id: '30000000-0000-4000-8000-000000000001', title: 'North' }
    const second = { id: '30000000-0000-4000-8000-000000000002', title: 'South' }
    renderDrawer({ projectId: first.id, projects: [first, second] })
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'PROJECT_REMAINING_DAYS' },
    })
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Rule scope'), { target: { value: second.id } })
    expect((screen.getByLabelText('Metric') as HTMLSelectElement).value).toBe(
      'PROJECT_REMAINING_DAYS',
    )
    expect((screen.getByLabelText('Threshold') as HTMLInputElement).value).toBe('20')
  })
  it('requires one Applies To family and clears a family that is removed', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('checkbox', { name: /Project/ }))
    expect(screen.getByRole('alert').textContent).toBe('Select at least one Applies To family.')
    fireEvent.click(screen.getByRole('checkbox', { name: /Activity/ }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'ACTIVITY_COMPLETION_PERCENT' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Activity/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/Cleared 1 incompatible condition/)
    expect(option('Activities completed')).toBeNull()
  })
  it('suggests severity without overwriting a manual choice and saves the chosen severity', async () => {
    renderDrawer()
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'PROJECT_OVERDUE_DAYS' },
    })
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'GTE' } })
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '1' } })
    expect(screen.getByTestId('severity-suggestion').textContent).toBe('Suggested severity: High')
    fireEvent.click(screen.getByRole('radio', { name: /Critical/ }))
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '2' } })
    expect((screen.getByRole('radio', { name: /Critical/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Use suggestion' }))
    expect((screen.getByRole('radio', { name: /High/ }) as HTMLInputElement).checked).toBe(true)
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    expect(state.createRule.mock.calls[0]?.[0].severity).toBe('HIGH')
  })
  it('refreshes a new recommendation prefill by family but preserves user edits and reused text', async () => {
    renderDrawer()
    expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
      'Review project timeline',
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget/ }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'BUDGET_UTILIZATION_PERCENT' },
    })
    await waitFor(() =>
      expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
        'Review budget utilization',
      ),
    )
    fireEvent.change(screen.getByLabelText('Recommendation title'), {
      target: { value: 'Keep my tailored title' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Assessment/ }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'SURVEY_MEAN_IMPROVEMENT_POINTS' },
    })
    expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
      'Keep my tailored title',
    )
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget/ }))
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'BUDGET_UTILIZATION_PERCENT' },
    })
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
  it('uses the retained nested tree for its suggestion instead of the flat-row fallback', async () => {
    const nested = {
      ...activeRule,
      conditions: {
        kind: 'GROUP',
        mode: 'AND',
        children: [
          {
            kind: 'GROUP',
            mode: 'OR',
            children: [
              {
                kind: 'CONDITION',
                id: 'c-overdue',
                metric: 'PROJECT_OVERDUE_DAYS',
                operator: 'GT',
                threshold: '0',
              },
            ],
          },
        ],
      },
    } as unknown as HumanRule
    renderDrawer({ rule: nested })
    await screen.findByLabelText('Rule Name')
    expect(screen.getByTestId('severity-suggestion').textContent).toBe('Suggested severity: High')
  })
  it('keeps an existing rule severity and saved recommendation unchanged on open', async () => {
    renderDrawer({ rule: activeRule })
    await screen.findByLabelText('Rule Name')
    expect((screen.getByRole('radio', { name: /High/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('severity-suggestion').textContent).toBe('Needs your judgment')
    expect(
      (screen.getByRole('button', { name: 'Use suggestion' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText('Review')).toBeTruthy()
    expect(screen.queryByLabelText('Recommendation title')).toBeNull()
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
