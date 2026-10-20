import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
/* @vitest-environment jsdom */
import type { HumanRule } from '@pathways/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleDrawer } from './rule-drawer'

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  indicators: vi.fn(),
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
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/core/request', () => ({ PathwaysClientError: class extends Error {} }))
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: {} }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: {} }))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: { getProjectIndicators: state.indicators },
}))

const projectA = '40000000-0000-4000-8000-000000000001'
const projectB = '40000000-0000-4000-8000-000000000002'
const ruleOf = (status: string, projectId: string | null = projectA) =>
  ({
    id: '50000000-0000-4000-8000-000000000001',
    projectId,
    name: 'Late project',
    code: 'LATE_PROJECT',
    version: 2,
    severity: 'HIGH',
    status,
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
  }) as unknown as HumanRule
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
const button = (name: string) => screen.queryByRole('button', { name })

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['rules.read']
  state.indicators.mockResolvedValue([{ id: 'ind-1', name: 'Indicator one' }])
})

// Finds the single condition card for an area by its accessible name.
const area = (label: string) =>
  screen.getByRole('group', {
    name: (name) => /^Condition \d+ \(/.test(name) && name.endsWith(` (${label})`),
  })
describe('RuleDrawer save gate', () => {
  it('shows Save Rule and enables the form for a creator on a new rule', async () => {
    state.permissions = ['rules.read', 'rules.create']
    renderDrawer()
    await screen.findByLabelText('Rule Name')
    expect(button('Save Rule')).toBeTruthy()
    expect(screen.getByLabelText('Rule Name').matches(':disabled')).toBe(false)
  })
  it('hides Save Rule and locks the form on a new rule without rules.create', async () => {
    state.permissions = ['rules.read', 'rules.update']
    renderDrawer()
    await screen.findByLabelText('Rule Name')
    expect(button('Save Rule')).toBeNull()
    expect(screen.getByLabelText('Rule Name').matches(':disabled')).toBe(true)
  })
  it('requires rules.update, not rules.create, to save an existing rule', async () => {
    state.permissions = ['rules.read', 'rules.create']
    renderDrawer({ rule: ruleOf('DRAFT') })
    await screen.findByLabelText('Rule Name')
    expect(button('Save Rule')).toBeNull()
    expect(screen.getByLabelText('Rule Name').matches(':disabled')).toBe(true)
    cleanup()
    state.permissions = ['rules.read', 'rules.update']
    renderDrawer({ rule: ruleOf('DRAFT') })
    await screen.findByLabelText('Rule Name')
    expect(button('Save Rule')).toBeTruthy()
    expect(screen.getByLabelText('Rule Name').matches(':disabled')).toBe(false)
  })
  it('does not offer saving an archived rule even with rules.update', async () => {
    state.permissions = ['rules.read', 'rules.update']
    renderDrawer({ rule: ruleOf('ARCHIVED') })
    await screen.findByLabelText('Rule Name')
    expect(button('Save Rule')).toBeNull()
  })
})

describe('RuleDrawer lifecycle gates', () => {
  it('offers Activate only for a draft project rule when rules.activate is held', async () => {
    state.permissions = ['rules.read', 'rules.update', 'rules.activate']
    renderDrawer({ rule: ruleOf('DRAFT') })
    await screen.findByLabelText('Rule Name')
    expect(button('Activate')).toBeTruthy()
    expect(button('Deactivate')).toBeNull()
  })
  it.each([
    ['an active rule', 'ACTIVE', projectA, ['rules.read', 'rules.update', 'rules.activate']],
    ['an organization template', 'DRAFT', null, ['rules.read', 'rules.update', 'rules.activate']],
    ['a draft without rules.activate', 'DRAFT', projectA, ['rules.read', 'rules.update']],
  ])('does not offer Activate for %s', async (_label, status, projectId, permissions) => {
    state.permissions = permissions
    renderDrawer({ rule: ruleOf(status, projectId) })
    await screen.findByLabelText('Rule Name')
    expect(button('Activate')).toBeNull()
  })
  it('offers Deactivate only for an active rule when rules.update is held', async () => {
    state.permissions = ['rules.read', 'rules.update']
    renderDrawer({ rule: ruleOf('ACTIVE') })
    await screen.findByLabelText('Rule Name')
    expect(button('Deactivate')).toBeTruthy()
    expect(button('Activate')).toBeNull()
  })
  it.each([
    ['a draft rule', 'DRAFT', ['rules.read', 'rules.update', 'rules.activate']],
    ['an active rule without rules.update', 'ACTIVE', ['rules.read', 'rules.activate']],
  ])('does not offer Deactivate for %s', async (_label, status, permissions) => {
    state.permissions = permissions
    renderDrawer({ rule: ruleOf(status) })
    await screen.findByLabelText('Rule Name')
    expect(button('Deactivate')).toBeNull()
  })
  it('offers neither lifecycle action on a new rule', async () => {
    state.permissions = ['rules.read', 'rules.create', 'rules.update', 'rules.activate']
    renderDrawer()
    await screen.findByLabelText('Rule Name')
    expect(button('Activate')).toBeNull()
    expect(button('Deactivate')).toBeNull()
  })
})

describe('RuleDrawer project change', () => {
  it('clears a chosen indicator when the rule scope project changes', async () => {
    state.permissions = ['rules.read', 'rules.create', 'indicators.read', 'projects.read']
    renderDrawer({
      projectId: projectA,
      projects: [
        { id: projectA, title: 'Project A' },
        { id: projectB, title: 'Project B' },
      ],
    })
    await screen.findByLabelText('Rule Name')
    fireEvent.click(screen.getByRole('checkbox', { name: /Indicator/ }))
    const indicatorGroup = area('Indicator / KPI')
    fireEvent.change(within(indicatorGroup).getByLabelText('What should we check?'), {
      target: { value: 'INDICATOR_PROGRESS_PERCENT' },
    })
    await waitFor(() => expect(state.indicators).toHaveBeenCalled())
    const record = (await screen.findByRole('combobox', { name: 'Indicator' })) as HTMLSelectElement
    await screen.findByRole('option', { name: 'Indicator one' })
    fireEvent.change(record, { target: { value: 'ind-1' } })
    expect(record.value).toBe('ind-1')
    fireEvent.change(screen.getByLabelText('Monitoring area(s)'), { target: { value: projectB } })
    // The choice must stay empty once the new project's indicators have loaded, not only while they load.
    await waitFor(() => expect(state.indicators).toHaveBeenCalledTimes(2))
    await screen.findByRole('option', { name: 'Indicator one' })
    expect((screen.getByRole('combobox', { name: 'Indicator' }) as HTMLSelectElement).value).toBe(
      '',
    )
  })
})
