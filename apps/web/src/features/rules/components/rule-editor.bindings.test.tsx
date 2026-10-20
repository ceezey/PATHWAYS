import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleEditor } from './rule-editor'

const state = vi.hoisted(() => ({ indicators: vi.fn(), projects: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: '10000000-0000-4000-8000-000000000001',
      userId: '10000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      roles: ['SYSTEM_ADMINISTRATOR'],
      assignedProjectIds: [],
      permissions: ['rules.create', 'projects.read', 'indicators.read'],
    },
    role: 'System Administrator',
    assignedProjectIds: [],
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: state.projects } }))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: { getProjectIndicators: state.indicators },
}))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: {} }))
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: {} }))

const projectA = '40000000-0000-4000-8000-000000000001'
const projectB = '40000000-0000-4000-8000-000000000002'

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.projects.mockResolvedValue([
    { id: projectA, title: 'Project A' },
    { id: projectB, title: 'Project B' },
  ])
  state.indicators.mockResolvedValue([{ id: 'ind-1', name: 'Indicator one' }])
})

describe('rule editor project change', () => {
  it('clears a chosen indicator and keeps it cleared after the new project records load', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizedQueryProvider>
          <RuleEditor projectId={projectA} onSaved={vi.fn()} />
        </AuthorizedQueryProvider>
      </QueryClientProvider>,
    )
    await screen.findByRole('option', { name: 'Project B' })
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'INDICATOR_PROGRESS_PERCENT' },
    })
    const record = (await screen.findByLabelText('Indicator')) as HTMLSelectElement
    await screen.findByRole('option', { name: 'Indicator one' })
    fireEvent.change(record, { target: { value: 'ind-1' } })
    expect(record.value).toBe('ind-1')
    fireEvent.change(screen.getByLabelText('Applies to'), { target: { value: projectB } })
    await waitFor(() => expect(state.indicators).toHaveBeenCalledTimes(2))
    await screen.findByRole('option', { name: 'Indicator one' })
    expect((screen.getByLabelText('Indicator') as HTMLSelectElement).value).toBe('')
  })
})
