import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleEditor } from './rule-editor'
import type { HumanRule } from './rules-human-contract'

const state = vi.hoisted(() => ({
  permissions: [
    'rules.create',
    'rules.update',
    'projects.read',
    'activities.read',
    'indicators.read',
  ],
  roles: ['SYSTEM_ADMINISTRATOR'],
  assignedProjectIds: [] as string[],
  forceScopeOwnerNull: false,
  projects: vi.fn(),
  activities: vi.fn(),
  activityContext: vi.fn(),
  indicators: vi.fn(),
  createRule: vi.fn(),
  draftRule: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: '10000000-0000-4000-8000-000000000001',
      userId: '10000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      roles: state.roles,
      assignedProjectIds: state.assignedProjectIds,
      permissions: state.permissions,
    },
    role: 'System Administrator',
    assignedProjectIds: state.assignedProjectIds,
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    getProjects: state.projects,
    getActivities: state.activities,
    getActivityContext: state.activityContext,
    getProjectIndicators: state.indicators,
  },
  PathwaysClientError: class PathwaysClientError extends Error {
    status?: number
    constructor(message: string, status?: number) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: { createRule: state.createRule, draftRule: state.draftRule },
}))
vi.mock('@/lib/auth/sensitive-drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/sensitive-drafts')>()
  return {
    ...actual,
    useSensitiveDraftOwner: (...args: Parameters<typeof actual.useSensitiveDraftOwner>) => {
      const owner = actual.useSensitiveDraftOwner(...args)
      // Lets a test simulate the scope becoming ineligible between mount and submit,
      // independent of the real RBAC matrix used for the mount-time owner.
      if (state.forceScopeOwnerNull && args[1] === 'rule-editor-scope') return null
      return owner
    },
  }
})

const projectId = '40000000-0000-4000-8000-000000000001'
const otherProjectId = '40000000-0000-4000-8000-000000000002'

const renderEditor = (props: Partial<React.ComponentProps<typeof RuleEditor>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <RuleEditor projectId={null} onSaved={vi.fn()} {...props} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

const existingRule: HumanRule = {
  id: '30000000-0000-4000-8000-000000000001',
  projectId,
  templateOriginId: null,
  logicalRuleId: '30000000-0000-4000-8000-000000000001',
  code: 'EXISTING_RULE',
  name: 'Existing rule',
  version: 3,
  status: 'DRAFT',
  severity: 'MEDIUM',
  conditions: {
    kind: 'CONDITION',
    id: 'c_existing',
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '5',
  },
  recommendations: [
    { id: '50000000-0000-4000-8000-000000000001', title: 'Existing title', text: 'Existing text' },
  ],
  activatedAt: null,
  archivedAt: null,
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  state.permissions = [
    'rules.create',
    'rules.update',
    'projects.read',
    'activities.read',
    'indicators.read',
  ]
  state.roles = ['SYSTEM_ADMINISTRATOR']
  state.assignedProjectIds = []
  state.forceScopeOwnerNull = false
  state.projects.mockResolvedValue([
    { id: projectId, title: 'Project A' },
    { id: otherProjectId, title: 'Project B' },
  ])
  state.activities.mockResolvedValue([{ id: 'act-1', title: 'Field activity' }])
  state.activityContext.mockResolvedValue([{ id: 'act-1', title: 'Field activity' }])
  state.indicators.mockResolvedValue([{ id: 'ind-1', name: 'Indicator one' }])
  state.createRule.mockResolvedValue(undefined)
  state.draftRule.mockResolvedValue(undefined)
})

const fillStepOne = () => {
  fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'My new rule' } })
  fireEvent.change(screen.getByLabelText('Rule code'), { target: { value: 'MY_NEW_RULE' } })
}

describe('two-step rule editor navigation', () => {
  it('blocks advancing to step 2 when step 1 is invalid and shows an error', async () => {
    renderEditor()
    await screen.findByLabelText('Applies to')
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    expect(await screen.findByText('Enter a rule name.')).toBeTruthy()
    expect(screen.queryAllByText('Step 2 of 2: Recommendations')).toHaveLength(0)
  })

  it('advances to step 2 once step 1 validation passes, and the final buttons only appear there', async () => {
    renderEditor()
    await screen.findByLabelText('Applies to')
    expect(screen.queryByRole('button', { name: 'Create draft' })).toBeNull()
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeTruthy()
  })

  it('preserves entered data when going back from step 2 to step 1', async () => {
    renderEditor()
    await screen.findByLabelText('Applies to')
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const name = (await screen.findByLabelText('Rule name')) as HTMLInputElement
    const code = screen.getByLabelText('Rule code') as HTMLInputElement
    expect(name.value).toBe('My new rule')
    expect(code.value).toBe('MY_NEW_RULE')
  })

  it('submits a payload matching createRuleSchema shape after going through both steps', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    fireEvent.change(screen.getByLabelText('Recommendation 1 title'), {
      target: { value: 'Title one' },
    })
    fireEvent.change(screen.getByLabelText('Recommendation text'), {
      target: { value: 'Text one' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalledTimes(1))
    const payload = state.createRule.mock.calls[0][0]
    expect(payload.name).toBe('My new rule')
    expect(payload.code).toBe('MY_NEW_RULE')
    expect(payload.projectId).toBe(projectId)
    expect(payload.recommendations).toHaveLength(1)
    expect(payload.recommendations[0]).toMatchObject({ title: 'Title one', text: 'Text one' })
    expect(typeof payload.clientOperationId).toBe('string')
  })

  it('opens an existing draft with step 1 and step 2 both prefilled', async () => {
    renderEditor({ projectId, original: existingRule })
    const name = (await screen.findByLabelText('Rule name')) as HTMLInputElement
    const code = screen.getByLabelText('Rule code') as HTMLInputElement
    expect(name.value).toBe('Existing rule')
    expect(code.value).toBe('EXISTING_RULE')
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    const recTitle = (await screen.findByLabelText('Recommendation 1 title')) as HTMLInputElement
    const recText = screen.getByLabelText('Recommendation text') as HTMLTextAreaElement
    expect(recTitle.value).toBe('Existing title')
    expect(recText.value).toBe('Existing text')
  })

  it('does not show a template picker while editing an existing draft', async () => {
    renderEditor({ projectId, original: existingRule })
    await screen.findByLabelText('Rule name')
    expect(screen.queryByText('Start from template')).toBeNull()
  })

  it('disables the Applies to select while editing an existing draft', async () => {
    renderEditor({ projectId, original: existingRule })
    const scope = (await screen.findByLabelText('Applies to')) as HTMLSelectElement
    expect(scope.disabled).toBe(true)
  })

  it('saves an edited draft with expectedVersion and no code or projectId, without creating a new rule', async () => {
    renderEditor({ projectId, original: existingRule })
    await screen.findByLabelText('Rule name')
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(state.draftRule).toHaveBeenCalledTimes(1))
    const [ruleId, payload] = state.draftRule.mock.calls[0]
    expect(ruleId).toBe(existingRule.id)
    expect(payload.expectedVersion).toBe(3)
    expect(payload).not.toHaveProperty('code')
    expect(payload).not.toHaveProperty('projectId')
    expect(state.createRule).not.toHaveBeenCalled()
  })
})

describe('project-scoped record bindings', () => {
  it('scopes activity options to the selected project and clears bindings on project change', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    const metricSelect = screen.getByLabelText('Metric')
    fireEvent.change(metricSelect, { target: { value: 'ACTIVITY_OVERDUE_DAYS' } })
    await waitFor(() =>
      expect(state.activities).toHaveBeenCalledWith(projectId, expect.any(AbortSignal)),
    )
    const recordSelect = (await screen.findByLabelText('Activity')) as HTMLSelectElement
    fireEvent.change(recordSelect, { target: { value: 'act-1' } })
    expect(recordSelect.value).toBe('act-1')
    fireEvent.change(screen.getByLabelText('Applies to'), { target: { value: otherProjectId } })
    expect(
      await screen.findByText(/Indicator and activity selections in conditions were cleared/),
    ).toBeTruthy()
    expect((screen.getByLabelText('Activity') as HTMLSelectElement).value).toBe('')
  })

  it('shows a permission message and makes no activities request when the user lacks both activity permissions', async () => {
    state.permissions = ['rules.create', 'projects.read', 'indicators.read']
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'ACTIVITY_OVERDUE_DAYS' },
    })
    expect(
      await screen.findByText('Current permission for the selected record type is required.'),
    ).toBeTruthy()
    expect(state.activities).not.toHaveBeenCalled()
    expect(state.activityContext).not.toHaveBeenCalled()
  })

  it('hides project scope for org templates via an inline explanation and restricted metric list', async () => {
    renderEditor({ projectId: null })
    await screen.findByLabelText('Applies to')
    expect(
      screen.getByText(/Organization templates cannot bind to a specific indicator or activity/),
    ).toBeTruthy()
    const options = within(screen.getByLabelText('Metric')).getAllByRole('option')
    expect(options.map((option) => option.getAttribute('value'))).not.toContain(
      'ACTIVITY_OVERDUE_DAYS',
    )
  })
})

const templateRule: HumanRule = {
  id: '30000000-0000-4000-8000-000000000002',
  projectId: null,
  templateOriginId: null,
  logicalRuleId: '30000000-0000-4000-8000-000000000002',
  code: 'ORG_TEMPLATE',
  name: 'Org template',
  version: 1,
  status: 'ACTIVE',
  severity: 'HIGH',
  conditions: {
    kind: 'CONDITION',
    id: 'c_template',
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '5',
  },
  recommendations: [
    { id: '50000000-0000-4000-8000-000000000002', title: 'Template title', text: 'Template text' },
  ],
  activatedAt: null,
  archivedAt: null,
}

describe('organization scope with a record-bound condition', () => {
  it('keeps the displayed and stored metric in sync and reports a specific error on switch to organization scope', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'ACTIVITY_OVERDUE_DAYS' },
    })
    const recordSelect = (await screen.findByLabelText('Activity')) as HTMLSelectElement
    fireEvent.change(recordSelect, { target: { value: 'act-1' } })
    fireEvent.change(screen.getByLabelText('Applies to'), { target: { value: '' } })
    const metricSelect = screen.getByLabelText('Metric') as HTMLSelectElement
    expect(metricSelect.value).toBe('ACTIVITY_OVERDUE_DAYS')
    expect(screen.queryByLabelText('Activity')).toBeNull()
    expect(screen.getAllByText(/unavailable for organization templates/).length).toBeGreaterThan(0)
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    expect(
      await screen.findByText(
        /The condition using "activity overdue days" requires a project scope/,
      ),
    ).toBeTruthy()
    expect(screen.queryAllByText('Step 2 of 2: Recommendations')).toHaveLength(0)
  })
})

describe('copying a template into a project', () => {
  it('hides the template picker and offers a single, enabled scope control with no organization option', async () => {
    renderEditor({ projectId: null, template: templateRule })
    await screen.findByLabelText('Applies to')
    expect(screen.queryByText('Start from template')).toBeNull()
    const scope = screen.getByLabelText('Applies to') as HTMLSelectElement
    expect(scope.disabled).toBe(false)
    expect(scope.value).toBe('')
    expect(screen.queryAllByLabelText('Applies to')).toHaveLength(1)
    // The only value-less option is the "Choose a project" placeholder, not an org option.
    expect(screen.getByText('Choose a project')).toBeTruthy()
    expect(screen.queryByText('Organization template (no project)')).toBeNull()
  })

  it('keeps entered edits when changing the copy target project', async () => {
    renderEditor({ projectId: null, template: templateRule })
    const scope = (await screen.findByLabelText('Applies to')) as HTMLSelectElement
    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Copied rule name' } })
    fireEvent.change(scope, { target: { value: projectId } })
    expect(scope.value).toBe(projectId)
    expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe('Copied rule name')
    fireEvent.change(scope, { target: { value: otherProjectId } })
    expect(scope.value).toBe(otherProjectId)
    expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe('Copied rule name')
  })

  it('rejects submitting a copy with no project chosen', async () => {
    renderEditor({ projectId: null, template: templateRule })
    await screen.findByLabelText('Applies to')
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    expect(
      await screen.findByText(
        'Copied rules must apply to a project. Choose a project for Applies to before continuing.',
      ),
    ).toBeTruthy()
    expect(screen.queryAllByText('Step 2 of 2: Recommendations')).toHaveLength(0)
  })
})

describe('scope permission required on submit', () => {
  it('shows a visible, step 1 error when the selected scope becomes ineligible before submit', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    state.forceScopeOwnerNull = true
    // Force a re-render so the mocked hook re-evaluates with the flag now set; setting the
    // module-level flag alone does not by itself trigger React to re-render this component.
    // Both required recommendation fields are filled so HTML5 constraint validation does not
    // itself block the submit event before the handler runs.
    fireEvent.change(screen.getByLabelText('Recommendation 1 title'), {
      target: { value: 'Title one' },
    })
    fireEvent.change(screen.getByLabelText('Recommendation text'), {
      target: { value: 'Text one' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(
      await screen.findByText('Current permission for the selected Applies to scope is required.'),
    ).toBeTruthy()
    expect(screen.queryAllByText('Step 2 of 2: Recommendations')).toHaveLength(0)
    const scope = screen.getByLabelText('Applies to') as HTMLSelectElement
    expect(scope.getAttribute('aria-invalid')).toBe('true')
    expect(state.createRule).not.toHaveBeenCalled()
  })
})

describe('project choices truthful scope labelling', () => {
  it('shows a settled-without-project label when the current project is not in the loaded list', async () => {
    state.projects.mockResolvedValue([{ id: otherProjectId, title: 'Project B' }])
    renderEditor({ projectId })
    const scope = (await screen.findByLabelText('Applies to')) as HTMLSelectElement
    await waitFor(() =>
      expect(within(scope).getByText('Current project (not in your project list)')).toBeTruthy(),
    )
    expect(scope.disabled).toBe(false)
  })

  it('shows an unavailable label when the viewer cannot read the project list at all', async () => {
    state.permissions = ['rules.create', 'rules.update']
    renderEditor({ projectId })
    const scope = (await screen.findByLabelText('Applies to')) as HTMLSelectElement
    await waitFor(() =>
      expect(within(scope).getByText('Current project (not in your project list)')).toBeTruthy(),
    )
    expect(scope.disabled).toBe(false)
  })
})

describe('project choices load failure', () => {
  it('shows a retry action for project choices', async () => {
    state.projects.mockRejectedValueOnce(new Error('network down'))
    renderEditor({ projectId })
    expect(await screen.findByRole('button', { name: 'Retry project choices' })).toBeTruthy()
  })
})

describe('step focus management', () => {
  it('moves focus to the step heading after Next and Back', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fillStepOne()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe('Step 2 of 2: Recommendations'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Step 1 of 2: Rule'))
  })
})

describe('starting a rule from a template', () => {
  it('prefills the Operations Bottleneck template fields exactly', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Operations Bottleneck' }))
    expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe(
      'Operations Bottleneck',
    )
    expect((screen.getByLabelText('Rule code') as HTMLInputElement).value).toBe(
      'OPERATIONS_BOTTLENECK',
    )
    expect((screen.getByLabelText('Severity') as HTMLSelectElement).value).toBe('HIGH')
    expect((screen.getByLabelText('Combine conditions') as HTMLSelectElement).value).toBe('AND')
    const metricSelects = screen.getAllByLabelText('Metric') as HTMLSelectElement[]
    const operatorSelects = screen.getAllByLabelText('Comparison') as HTMLSelectElement[]
    const thresholdInputs = screen.getAllByLabelText('Threshold') as HTMLInputElement[]
    expect(metricSelects.map((select) => select.value)).toEqual([
      'PROJECT_TIMELINE_ELAPSED_PERCENT',
      'ACTIVITY_COMPLETION_PERCENT',
    ])
    expect(operatorSelects.map((select) => select.value)).toEqual(['GT', 'LT'])
    expect(thresholdInputs.map((input) => input.value)).toEqual(['50', '40'])
    expect(state.createRule).not.toHaveBeenCalled()
    expect(state.draftRule).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recommendations' }))
    await waitFor(() =>
      expect(screen.getAllByText('Step 2 of 2: Recommendations').length).toBeGreaterThan(0),
    )
    expect((screen.getByLabelText('Recommendation 1 title') as HTMLInputElement).value).toBe(
      'Review activity schedule',
    )
    expect((screen.getByLabelText('Recommendation text') as HTMLTextAreaElement).value).toBe(
      'Review dependencies in the activity schedule. Consider allocating additional field staff or adjusting milestone dates.',
    )
  })

  it('shows the three templates that have no backend metric as text with their exact reason', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    expect(
      screen.getByText('Requires KPI achievement and Budget burn, not yet available'),
    ).toBeTruthy()
    expect(screen.getAllByText('Requires Budget burn, not yet available')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Apply Financial Efficiency Risk' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Budget Under-utilization' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Ideal Vector' })).toBeNull()
  })

  it('hides the three templates that have no backend metric while unfinished controls are hidden', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({ UNFINISHED_CONTROLS_UI_ENABLED: false }))
    const { RuleEditor: HiddenRuleEditor } = await import('./rule-editor')
    const { AuthorizedQueryProvider: HiddenProvider } = await import(
      '@/providers/authorized-query-provider'
    )
    vi.doUnmock('@/constants/feature-flags')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HiddenProvider>
          <HiddenRuleEditor projectId={projectId} onSaved={vi.fn()} />
        </HiddenProvider>
      </QueryClientProvider>,
    )
    await screen.findByLabelText('Applies to')
    expect(screen.queryByText(/not yet available/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Ideal Vector' })).toBeNull()
  })
})
