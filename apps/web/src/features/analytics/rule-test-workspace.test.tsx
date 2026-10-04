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
  it.each([
    [
      'BUDGET_UTILIZATION_PERCENT',
      { 'Test planned budget total': '200', 'Test approved expense total': '50' },
      'AVAILABLE',
      '25',
      'BUDGET_AGGREGATE',
    ],
    [
      'BENEFICIARY_FOLLOW_UP_PERCENT',
      {
        'Test active enrollments with participation': '10',
        'Test enrollments needing follow-up': '5',
      },
      'AVAILABLE',
      '50',
      'BENEFICIARY_AGGREGATE',
    ],
    [
      'BENEFICIARY_FOLLOW_UP_PERCENT',
      {
        'Test active enrollments with participation': '4',
        'Test enrollments needing follow-up': '2',
      },
      'SUPPRESSED',
      null,
      null,
    ],
    [
      'SURVEY_MEAN_IMPROVEMENT_POINTS',
      { 'Test complete pre and post pairs': '6', 'Test mean improvement in points': '-2.5' },
      'AVAILABLE',
      '-2.5',
      'SURVEY_AGGREGATE',
    ],
  ])(
    'builds aggregate inputs for %s without activity fallthrough',
    async (metric, fields, state_, value, kind) => {
      render(
        <RuleTestWorkspace
          rule={{
            ...rule,
            conditions: {
              ...rule.conditions,
              metric,
              operator: 'GT',
              threshold: '1',
            } as HumanRule['conditions'],
          }}
        />,
      )
      fireEvent.change(screen.getByLabelText('Test reporting date (Asia/Manila)'), {
        target: { value: '2026-09-27' },
      })
      for (const [label, entered] of Object.entries(fields))
        fireEvent.change(screen.getByLabelText(label), { target: { value: entered } })
      fireEvent.click(screen.getByRole('button', { name: 'Run condition test' }))
      await waitFor(() => expect(state.call).toHaveBeenCalledOnce())
      const observation = state.call.mock.calls[0][0].observations[0]
      expect(observation).toMatchObject({ metric, cell: { state: state_, value } })
      expect(observation.calculation?.kind ?? null).toBe(kind)
      expect(screen.queryByText('Test activity population')).toBeNull()
    },
  )
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
