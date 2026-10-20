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
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: state }))

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
  const projectGroup = screen.getByRole('group', { name: 'Project' })
  fireEvent.change(within(projectGroup).getByLabelText('What should we check?'), {
    target: { value: 'PROJECT_REMAINING_DAYS' },
  })
  fireEvent.change(within(projectGroup).getByLabelText('Threshold'), { target: { value: '30' } })
}
const initialViewportWidth = window.innerWidth
afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialViewportWidth })
})
beforeEach(() => {
  vi.clearAllMocks()
  state.createRule.mockResolvedValue(activeRule)
  state.draftRule.mockResolvedValue(activeRule)
  state.archiveRule.mockResolvedValue(activeRule)
})

describe('RuleDrawer', () => {
  it('uses a padded rounded action bar in the inline rule builder', () => {
    renderDrawer({ inline: true })
    const footer = screen.getByRole('button', { name: 'Save Rule' }).parentElement
    expect(footer?.className).toContain('rounded-md')
    expect(footer?.className).toContain('p-3')
  })
  it('lets an edit-rule panel expand from an accessible drag handle', () => {
    renderDrawer({ rule: activeRule })
    const handle = screen.getByRole('separator', { name: 'Resize edit rule panel' })
    expect(handle.getAttribute('aria-valuenow')).toBe('480')
    expect(handle.getAttribute('aria-valuemax')).toBe('960')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle.getAttribute('aria-valuenow')).toBe('520')
    expect(handle.parentElement?.getAttribute('style')).toContain('width: 520px')
    const pointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 1 },
      })
      fireEvent(handle, event)
    }
    pointer('pointerdown', 1000)
    pointer('pointermove', 900)
    pointer('pointerup', 900)
    expect(handle.getAttribute('aria-valuenow')).toBe('620')
    fireEvent.keyDown(handle, { key: 'End' })
    expect(handle.getAttribute('aria-valuenow')).toBe('960')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    fireEvent(window, new Event('resize'))
    expect(handle.getAttribute('aria-valuemax')).toBe('752')
    expect(handle.getAttribute('aria-valuenow')).toBe('752')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    fireEvent(window, new Event('resize'))
    expect(handle.parentElement?.getAttribute('style')).not.toContain('width')
    expect(handle.getAttribute('aria-valuemax')).toBe('552')
  })
  it('lets edit-rule actions fill the expanded panel while create actions stay compact', () => {
    renderDrawer({ rule: activeRule })
    const editFooter = screen.getByRole('button', { name: 'Save Rule' }).parentElement
    expect(editFooter?.className).toContain('grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]')
    expect(screen.getByRole('button', { name: 'Save Rule' }).className).toContain('w-full')
    expect(screen.getByRole('button', { name: 'Test Rule' }).className).toContain('w-full')
    expect(screen.getByRole('button', { name: 'Deactivate' }).className).toContain('w-full')
  })
  it('uses the same padded rounded action bar for recommendation creation', () => {
    renderDrawer({ inline: true, mode: 'recommendation' })
    const footer = screen.getByRole('button', { name: 'Save recommendation' }).parentElement
    expect(footer?.className).toContain('rounded-md')
    expect(footer?.className).toContain('p-3')
  })
  it('keeps step 3 focused on severity and separates the editable field panels', () => {
    renderDrawer()
    expect(screen.queryByText('Time Basis')).toBeNull()
    expect(screen.queryByText('Notification Recipients')).toBeNull()
    expect(
      screen.getByLabelText('What should we check?').closest('[class~="bg-background"]'),
    ).toBeTruthy()
    expect(
      screen.getByLabelText('Recommendation title').closest('[class~="bg-background"]'),
    ).toBeTruthy()
  })
  it('uses a compact icon-only add control for recommendations and a labeled add button per area', () => {
    renderDrawer()
    expect(
      screen.getByRole('button', { name: 'Add recommendation' }).querySelector('svg'),
    ).toBeTruthy()
    expect(screen.queryByText('Add recommendation')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add another Project condition' })).toBeTruthy()
  })
  it('filters metrics by Applies To and shows a category tag for each selected scope family', () => {
    renderDrawer()
    expect(option('Project timeline elapsed')).toBeTruthy()
    expect(option('Activities completed')).toBeNull()
    expect(screen.getByTestId('rule-category-label').textContent).toBe('Rule Category:')
    expect(within(screen.getByTestId('rule-category')).getByText('Schedule')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activity' }))
    expect(option('Activities completed')).toBeTruthy()
    expect(screen.getByTestId('rule-category-label').textContent).toBe('Rule Categories:')
    expect(within(screen.getByTestId('rule-category')).getByText('Schedule')).toBeTruthy()
    expect(within(screen.getByTestId('rule-category')).getByText('Delivery')).toBeTruthy()
    const activityGroup = screen.getByRole('group', { name: 'Activity' })
    fireEvent.change(within(activityGroup).getByLabelText('What should we check?'), {
      target: { value: 'ACTIVITY_OVERDUE_COUNT' },
    })
    expect(within(activityGroup).queryByText('%')).toBeNull()
    expect(screen.queryByLabelText('Rule Category')).toBeNull()
  })
  it('keeps scopes with an available metric enabled', () => {
    renderDrawer()
    const scope = screen.getByLabelText('Monitoring area(s)') as HTMLSelectElement
    const appliesTo = screen.getByRole('group', { name: 'Applies To' })
    expect(scope.parentElement?.className).not.toContain('overflow-hidden')
    expect(scope.parentElement?.className).toContain('rounded-md')
    expect(scope.parentElement?.className).toContain('focus-within:ring-2')
    expect(scope.className).toContain('rounded-t-md')
    expect(appliesTo.parentElement).toBe(scope.parentElement)
    expect((screen.getByRole('checkbox', { name: 'Project' }) as HTMLInputElement).disabled).toBe(
      false,
    )
  })
  it('explains scopes through accessible information tooltips and shows metric guidance without setting a threshold', () => {
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
    const assessmentGroup = screen.getByRole('group', { name: 'Assessment' })
    fireEvent.change(within(assessmentGroup).getByLabelText('What should we check?'), {
      target: { value: 'SURVEY_MEAN_IMPROVEMENT_POINTS' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Project' }))
    expect(
      within(assessmentGroup).getByText(
        'Average post-test minus pre-test score after converting scores to a 0–100 scale. Negative values indicate a decline.',
      ),
    ).toBeTruthy()
    expect((within(assessmentGroup).getByLabelText('Threshold') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      'Raise an alert when Average assessment score change is below ... percentage points. Human review required.',
    )
  })
  it('shows the preview sentence and the human-review line', () => {
    renderDrawer()
    fillBasics()
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      'Raise an alert when Days until project end is below 30 days. Human review required.',
    )
    expect(screen.getAllByText(/nothing is executed automatically/).length).toBeGreaterThan(0)
  })
  it('adds recommendations through the selected alert without exposing alert setup steps', async () => {
    renderDrawer({ mode: 'recommendation', alertLibrary: [activeRule] })
    expect(screen.getByText('Choose an existing alert')).toBeTruthy()
    expect(screen.getByText('What should the system recommend?')).toBeTruthy()
    expect(screen.queryByLabelText('Rule Name')).toBeNull()
    expect(screen.queryByLabelText('What should we check?')).toBeNull()
    expect(screen.queryByRole('radio', { name: /High/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Choose from alert library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose alert' }))
    expect(screen.getByRole('status').textContent).toContain('Late project')

    fireEvent.click(screen.getByRole('button', { name: 'Add recommendation' }))
    fireEvent.change(screen.getByLabelText('Recommendation title'), {
      target: { value: 'Check resourcing' },
    })
    fireEvent.change(screen.getByLabelText('Suggested response'), {
      target: { value: 'Review the project team capacity and agree the next action.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save recommendation' }))

    await waitFor(() => expect(state.draftRule).toHaveBeenCalledTimes(1))
    expect(state.draftRule).toHaveBeenCalledWith(
      activeRule.id,
      expect.objectContaining({
        name: activeRule.name,
        severity: null,
        conditions: activeRule.conditions,
        expectedVersion: activeRule.version,
        recommendations: expect.arrayContaining([
          expect.objectContaining({ title: 'Review', text: 'Check.' }),
          expect.objectContaining({
            title: 'Check resourcing',
            text: 'Review the project team capacity and agree the next action.',
          }),
        ]),
      }),
    )
  })
  it.each([
    ['CRITICAL', 'CRITICAL'],
    ['LOW', null],
    ['MEDIUM', null],
    ['HIGH', null],
  ] as const)(
    'keeps a stored %s alert as %s and its expectations when adding a recommendation',
    async (stored, saved) => {
      const expectations = { expectedScoreImprovement: '10', manageableFollowUpPercent: null }
      renderDrawer({
        mode: 'recommendation',
        alertLibrary: [{ ...activeRule, severity: stored, expectations } as HumanRule],
      })
      fireEvent.click(screen.getByRole('button', { name: 'Choose from alert library' }))
      fireEvent.click(screen.getByRole('button', { name: 'Choose alert' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save recommendation' }))
      await waitFor(() => expect(state.draftRule).toHaveBeenCalledTimes(1))
      expect(state.draftRule.mock.calls[0]?.[1]).toMatchObject({ severity: saved, expectations })
    },
  )
  it('allows a recommendation to be written before its alert is chosen', async () => {
    renderDrawer({ mode: 'recommendation', alertLibrary: [activeRule] })
    fireEvent.change(screen.getByLabelText('Recommendation title'), {
      target: { value: 'Check resourcing' },
    })
    fireEvent.change(screen.getByLabelText('Suggested response'), {
      target: { value: 'Review the project team capacity and agree the next action.' },
    })
    expect(screen.getByText('Choose an alert before saving this recommendation.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Choose from alert library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose alert' }))
    expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
      'Check resourcing',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save recommendation' }))

    await waitFor(() => expect(state.draftRule).toHaveBeenCalledTimes(1))
    expect(state.draftRule.mock.calls[0]?.[1].recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Review', text: 'Check.' }),
        expect.objectContaining({ title: 'Check resourcing' }),
      ]),
    )
  })
  it('shows the linked project and alert details in the recommendation alert library', () => {
    const projectAlert = {
      ...activeRule,
      projectId: '30000000-0000-4000-8000-000000000001',
    } as HumanRule
    renderDrawer({
      mode: 'recommendation',
      alertLibrary: [projectAlert],
      projects: [{ id: projectAlert.projectId as string, title: 'North Star Project' }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Choose from alert library' }))
    expect(screen.getByText('Project: North Star Project')).toBeTruthy()
    expect(screen.getByText(/Condition: Days until project end/)).toBeTruthy()
    expect(screen.getByText('Severity: Suggested when it fires')).toBeTruthy()
    expect(screen.getByText('Status: Active')).toBeTruthy()
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
    const indicatorGroup = screen.getByRole('group', { name: 'Indicator / KPI' })
    fireEvent.change(within(indicatorGroup).getByLabelText('What should we check?'), {
      target: { value: 'INDICATOR_PROGRESS_PERCENT' },
    })
    fireEvent.change(screen.getByLabelText('Monitoring area(s)'), { target: { value: '' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(option('Progress toward indicator target')).toBeNull()
    expect((screen.getByLabelText('What should we check?') as HTMLSelectElement).value).toBe(
      'PROJECT_TIMELINE_ELAPSED_PERCENT',
    )
  })
  it('preserves compatible conditions when a rule moves between project scopes', () => {
    const first = { id: '30000000-0000-4000-8000-000000000001', title: 'North' }
    const second = { id: '30000000-0000-4000-8000-000000000002', title: 'South' }
    renderDrawer({ projectId: first.id, projects: [first, second] })
    fireEvent.change(screen.getByLabelText('What should we check?'), {
      target: { value: 'PROJECT_REMAINING_DAYS' },
    })
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Monitoring area(s)'), { target: { value: second.id } })
    expect((screen.getByLabelText('What should we check?') as HTMLSelectElement).value).toBe(
      'PROJECT_REMAINING_DAYS',
    )
    expect((screen.getByLabelText('Threshold') as HTMLInputElement).value).toBe('20')
  })
  it('requires one Applies To family and clears a family that is removed', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('checkbox', { name: /Project/ }))
    expect(screen.getByRole('alert').textContent).toBe('Select at least one Applies To family.')
    fireEvent.click(screen.getByRole('checkbox', { name: /Activity/ }))
    const activityGroup = screen.getByRole('group', { name: 'Activity' })
    fireEvent.change(within(activityGroup).getByLabelText('What should we check?'), {
      target: { value: 'ACTIVITY_COMPLETION_PERCENT' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Activity/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(option('Activities completed')).toBeNull()
  })
  it('previews possible levels in step 3 and saves only the manual Critical mark', async () => {
    renderDrawer()
    fillBasics()
    expect(screen.getByText('How should this read?')).toBeTruthy()
    expect(
      screen.getByText('The system suggests severity from actual figures when the alert fires.'),
    ).toBeTruthy()
    expect(screen.getByTestId('severity-preview-levels').textContent).toBe(
      'Possible levels: Low, Medium, or High. Critical is set manually.',
    )
    expect(screen.queryByRole('radio', { name: /^(Low|Medium|High)/ })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as Critical (manual judgment)' }))
    expect(screen.getByTestId('rule-preview').textContent).toBe(
      'Raise a Critical alert when Days until project end is below 30 days. Human review required.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    expect(state.createRule.mock.calls[0]?.[0].severity).toBe('CRITICAL')
  })
  it('saves an unticked new rule with no severity so the system decides', async () => {
    renderDrawer()
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    expect(state.createRule.mock.calls[0]?.[0].severity).toBeNull()
  })
  it('saves a rule stored as High with no severity unless Critical is ticked', async () => {
    renderDrawer({ rule: activeRule })
    const box = (await screen.findByRole('checkbox', {
      name: 'Mark as Critical (manual judgment)',
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.draftRule).toHaveBeenCalledTimes(1))
    expect(state.draftRule.mock.calls[0]?.[1].severity).toBeNull()
    cleanup()
    vi.clearAllMocks()
    renderDrawer({ rule: { ...activeRule, severity: 'CRITICAL' } as HumanRule })
    expect(
      (
        (await screen.findByRole('checkbox', {
          name: 'Mark as Critical (manual judgment)',
        })) as HTMLInputElement
      ).checked,
    ).toBe(true)
  })
  it('shows expectation fields only for matching metrics and saves them under expectations', async () => {
    renderDrawer()
    fillBasics()
    expect(screen.queryByLabelText('Expected score improvement')).toBeNull()
    expect(screen.queryByLabelText('Manageable follow-up level')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assessment' }))
    const assessmentGroup = screen.getByRole('group', { name: 'Assessment' })
    fireEvent.change(within(assessmentGroup).getByLabelText('What should we check?'), {
      target: { value: 'SURVEY_MEAN_IMPROVEMENT_POINTS' },
    })
    fireEvent.change(within(assessmentGroup).getByLabelText('Threshold'), {
      target: { value: '-1' },
    })
    expect(screen.queryByLabelText('Manageable follow-up level')).toBeNull()
    fireEvent.change(screen.getByLabelText('Expected score improvement'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    expect(state.createRule.mock.calls[0]?.[0].expectations).toEqual({
      expectedScoreImprovement: '10',
      manageableFollowUpPercent: null,
    })
  })
  it('refreshes a new recommendation prefill by family but preserves user edits and reused text', async () => {
    renderDrawer()
    expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
      'Review project timeline',
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget/ }))
    const budgetGroup = screen.getByRole('group', { name: 'Budget' })
    fireEvent.change(within(budgetGroup).getByLabelText('What should we check?'), {
      target: { value: 'BUDGET_UTILIZATION_PERCENT' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Project/ }))
    await waitFor(() =>
      expect((screen.getByLabelText('Recommendation title') as HTMLInputElement).value).toBe(
        'Review budget utilization',
      ),
    )
    fireEvent.change(screen.getByLabelText('Recommendation title'), {
      target: { value: 'Keep my tailored title' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Assessment/ }))
    const assessmentGroup = screen.getByRole('group', { name: 'Assessment' })
    fireEvent.change(within(assessmentGroup).getByLabelText('What should we check?'), {
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
  it('shows the recommendation library and copies a saved recommendation under a new identity', async () => {
    const saved = { id: '60000000-0000-4000-8000-000000000009', title: 'Reassign', text: 'Move.' }
    renderDrawer({ library: [saved] })
    await screen.findByLabelText('Rule Name')
    fireEvent.click(screen.getByRole('button', { name: 'Choose from recommendation library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy recommendation to this rule' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget/ }))
    const budgetGroup = screen.getByRole('group', { name: 'Budget' })
    fireEvent.change(within(budgetGroup).getByLabelText('What should we check?'), {
      target: { value: 'BUDGET_UTILIZATION_PERCENT' },
    })
    fireEvent.change(within(budgetGroup).getByLabelText('Threshold'), { target: { value: '10' } })
    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: 'Save Rule' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalled())
    const sent = state.createRule.mock.calls[0]?.[0].recommendations
    expect(sent.some((item: { title: string }) => item.title === 'Reassign')).toBe(true)
    expect(sent.every((item: { id: string }) => item.id !== saved.id)).toBe(true)
  })
  it('explains when the current scope has no reusable recommendation', async () => {
    renderDrawer()
    await screen.findByLabelText('Rule Name')
    fireEvent.click(screen.getByRole('button', { name: 'Choose from recommendation library' }))
    expect(screen.getByRole('status').textContent).toMatch(/No other saved recommendations/)
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
    for (const label of [/^Rule name/i, /^Rule code/i, /^Mark as Critical/i])
      expect(dialog.contains(within(dialog).getByLabelText(label))).toBe(true)
  })
  it('uses the retained nested tree for its preview instead of the flat-row fallback', async () => {
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
                id: 'c-budget',
                metric: 'BUDGET_UTILIZATION_PERCENT',
                operator: 'GT',
                threshold: '110',
              },
            ],
          },
        ],
      },
    } as unknown as HumanRule
    renderDrawer({ rule: nested })
    await screen.findByLabelText('Rule Name')
    expect(screen.getByTestId('severity-preview-levels').textContent).toBe(
      'Possible levels: High. Critical is set manually.',
    )
  })
  it('keeps an existing saved recommendation unchanged on open', async () => {
    renderDrawer({ rule: activeRule })
    await screen.findByLabelText('Rule Name')
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
