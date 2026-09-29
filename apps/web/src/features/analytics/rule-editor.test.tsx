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
      roles: ['SYSTEM_ADMINISTRATOR'],
      assignedProjectIds: [],
      permissions: state.permissions,
    },
    role: 'System Administrator',
    assignedProjectIds: [],
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

describe('starting a rule from a template', () => {
  it('prefills the Operations Bottleneck template fields exactly', async () => {
    renderEditor({ projectId })
    await screen.findByLabelText('Applies to')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Operations Bottleneck' }))
    expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe(
      'Operations Bottleneck',
    )
    expect((screen.getByLabelText('Severity') as HTMLSelectElement).value).toBe('HIGH')
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

  it('renders the other three templates as disabled with their exact reason text', async () => {
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
})
