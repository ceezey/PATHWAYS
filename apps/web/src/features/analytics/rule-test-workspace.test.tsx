import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleTestWorkspace } from './rule-test-workspace'
const state = vi.hoisted(() => ({ permissions: ['rules.read'], call: vi.fn() }))
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
vi.mock('@/lib/services/rules-human-client', () => ({ rulesHumanClient: { dryRun: state.call } }))
const rule: HumanRule = {
  id: '30000000-0000-4000-8000-000000000001',
  projectId: '40000000-0000-4000-8000-000000000001',
  templateOriginId: null,
  logicalRuleId: '30000000-0000-4000-8000-000000000001',
  code: 'TEST_DATES',
  name: 'Timeline condition',
  version: 1,
  status: 'DRAFT',
  severity: 'LOW',
  conditions: {
    kind: 'CONDITION',
    id: 'remaining',
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '0',
  },
  recommendations: [
    {
      id: '50000000-0000-4000-8000-000000000001',
      title: 'Review schedule',
      text: 'Review schedule.',
    },
  ],
  activatedAt: null,
  archivedAt: null,
}
const enter = () => {
  fireEvent.change(screen.getByLabelText('Test reporting date (Asia/Manila)'), {
    target: { value: '2026-09-27' },
  })
  fireEvent.change(screen.getByLabelText('Test project start date'), {
    target: { value: '2026-09-01' },
  })
  fireEvent.change(screen.getByLabelText('Test project end date'), {
    target: { value: '2026-09-25' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Run condition test' }))
}
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['rules.read']
  state.call.mockImplementation(async (body) => ({
    rule: body.rule,
    asOf: body.asOf,
    result: 'TRUE',
    evidence: {
      condition: body.rule.conditions,
      observation: body.observations[0],
      result: 'TRUE',
      reason: null,
    },
  }))
})
describe('synthetic rule condition testing', () => {
  it('derives an exact timeline observation from entered test dates without reading live project data', async () => {
    render(<RuleTestWorkspace rule={rule} />)
    enter()
    await screen.findByText('Test result: true')
    expect(state.call.mock.calls[0][0].observations[0]).toMatchObject({
      metric: 'PROJECT_REMAINING_DAYS',
      cell: { state: 'AVAILABLE', value: '-2', reason: null },
      calculation: {
        kind: 'PROJECT_TIMELINE',
        reportingDate: '2026-09-27',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
      },
    })
  })
  it('keeps missing dates unavailable rather than inventing numeric zero', async () => {
    render(<RuleTestWorkspace rule={rule} />)
    fireEvent.change(screen.getByLabelText('Test reporting date (Asia/Manila)'), {
      target: { value: '2026-09-27' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run condition test' }))
    await waitFor(() => expect(state.call).toHaveBeenCalledOnce())
    expect(state.call.mock.calls[0][0].observations[0].cell).toEqual({
      state: 'MISSING',
      value: null,
      reason: 'MISSING_DATES',
    })
  })
  it('ignores an old test result after logout and return to the same principal', async () => {
    let finish: (value: unknown) => void = () => {}
    state.call.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<RuleTestWorkspace rule={rule} />)
    enter()
    await waitFor(() => expect(state.call).toHaveBeenCalledOnce())
    const body = state.call.mock.calls[0][0]
    await act(async () => clearSensitiveDraftStorage())
    await act(async () =>
      finish({
        rule: body.rule,
        asOf: body.asOf,
        result: 'TRUE',
        evidence: {
          condition: body.rule.conditions,
          observation: body.observations[0],
          result: 'TRUE',
          reason: null,
        },
      }),
    )
    expect(screen.queryByText('Test result: true')).toBeNull()
    expect(
      (screen.getByLabelText('Test reporting date (Asia/Manila)') as HTMLInputElement).value,
    ).toBe('')
  })
})
