import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import type { HumanRule, RuleNode } from '@pathways/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuleEditor } from './rule-editor'

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: '10000000-0000-4000-8000-000000000001',
      userId: '10000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      roles: ['SYSTEM_ADMINISTRATOR'],
      assignedProjectIds: [],
      permissions: ['rules.create', 'rules.update', 'projects.read'],
    },
    role: 'System Administrator',
    assignedProjectIds: [],
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: async () => [] } }))
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: {} }))

const projectId = '40000000-0000-4000-8000-000000000001'
const leaf = (id: string) =>
  ({
    kind: 'CONDITION',
    id,
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '5',
  }) as RuleNode
const leaves = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => leaf(`${prefix}${i}`))
const ruleWith = (conditions: RuleNode): HumanRule =>
  ({
    id: '30000000-0000-4000-8000-000000000001',
    projectId,
    templateOriginId: null,
    logicalRuleId: '30000000-0000-4000-8000-000000000001',
    code: 'CAPPED_RULE',
    name: 'Capped rule',
    version: 1,
    status: 'DRAFT',
    severity: 'LOW',
    conditions,
    recommendations: [{ id: '50000000-0000-4000-8000-000000000001', title: 'T', text: 'X' }],
    activatedAt: null,
    archivedAt: null,
  }) as HumanRule
const renderEditor = (conditions: RuleNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <RuleEditor original={ruleWith(conditions)} projectId={projectId} onSaved={vi.fn()} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
const addButtons = (name: string) => screen.getAllByRole('button', { name }) as HTMLButtonElement[]

// Rendering 32 conditions is slow under a loaded full run.
vi.setConfig({ testTimeout: 15000 })
afterEach(cleanup)

describe('rule editor leaf allowance', () => {
  it('still adds a condition at 31 leaves', async () => {
    renderEditor({ kind: 'GROUP', mode: 'AND', children: leaves('c', 31) })
    await screen.findByLabelText('Rule name')
    expect(addButtons('Add condition').map((button) => button.disabled)).toEqual([false])
  })
  it('stops adding at 32 leaves', async () => {
    renderEditor({ kind: 'GROUP', mode: 'AND', children: leaves('c', 32) })
    await screen.findByLabelText('Rule name')
    expect(addButtons('Add condition').map((button) => button.disabled)).toEqual([true])
    expect(addButtons('Add group').map((button) => button.disabled)).toEqual([true])
  })
  it('counts leaves across nested groups when computing what remains', async () => {
    renderEditor({
      kind: 'GROUP',
      mode: 'OR',
      children: [
        { kind: 'GROUP', mode: 'AND', children: leaves('a', 16) },
        { kind: 'GROUP', mode: 'AND', children: leaves('b', 16) },
      ],
    })
    await screen.findByLabelText('Rule name')
    const buttons = [...addButtons('Add condition'), ...addButtons('Add group')]
    expect(buttons).toHaveLength(6)
    expect(buttons.every((button) => button.disabled)).toBe(true)
  })
  it('leaves room across nested groups while under the cap', async () => {
    renderEditor({
      kind: 'GROUP',
      mode: 'OR',
      children: [
        { kind: 'GROUP', mode: 'AND', children: leaves('a', 16) },
        { kind: 'GROUP', mode: 'AND', children: leaves('b', 15) },
      ],
    })
    await screen.findByLabelText('Rule name')
    expect(addButtons('Add condition').every((button) => !button.disabled)).toBe(true)
  })
})
