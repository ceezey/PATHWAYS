import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { type HumanRule, type SeverityBasis, formatSeverityBasis } from '@pathways/shared'
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
vi.mock('@/lib/api/rules', () => ({ rulesHumanClient: { dryRun: state.call } }))
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
const basis = {
  status: 'CLASSIFIED',
  level: 'MEDIUM',
  supportedLevel: null,
  decisiveConditionId: 'remaining',
  combination: null,
  unchecked: [],
  missing: [],
  conditions: [
    {
      conditionId: 'remaining',
      metric: 'BUDGET_UTILIZATION_PERCENT',
      outcome: 'LEVEL',
      level: 'MEDIUM',
      measure: { kind: 'BUDGET_PERCENT', value: '105', actual: '105', expected: '100' },
    },
  ],
} as unknown as SeverityBasis
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
    severityBasis: basis,
  }))
})
describe('synthetic rule condition testing', () => {
  it('derives an exact timeline observation from entered test dates without reading live project data', async () => {
    render(<RuleTestWorkspace rule={rule} />)
    enter()
    await screen.findByRole('heading', { name: 'Test result' })
    expect(screen.getAllByText('Triggered')).toHaveLength(2)
    expect(screen.getByText('-2 days')).toBeTruthy()
    expect(screen.getAllByText('Condition 1').length).toBeGreaterThan(0)
    expect(screen.queryByText(/remaining:/)).toBeNull()
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
  it.each([
    ['KPI_ACHIEVEMENT_PERCENT', { 'Test indicators with a current value': '999999999' }],
    ['KPI_ACHIEVEMENT_PERCENT', { 'Test indicators with a current value': '2.5' }],
    ['KPI_ACHIEVEMENT_PERCENT', { 'Test indicators with a current value': '3' }],
    ['SURVEY_MEAN_PRE_TEST_PERCENT', { 'Test enrollments with a pre-test score': '5' }],
    ['SURVEY_MEAN_IMPROVEMENT_POINTS', { 'Test complete pre and post pairs': '5' }],
  ])('refuses %s %o before building inputs or calling the test', async (metric, fields) => {
    render(
      <RuleTestWorkspace
        rule={{
          ...rule,
          conditions: {
            ...rule.conditions,
            metric,
            operator: 'LT',
            threshold: '50',
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
    expect(
      await screen.findByText('Review the entered date and exact numeric test values.'),
    ).toBeTruthy()
    expect(state.call).not.toHaveBeenCalled()
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
    expect(screen.queryByText('Triggered')).toBeNull()
    expect(
      (screen.getByLabelText('Test reporting date (Asia/Manila)') as HTMLInputElement).value,
    ).toBe('')
  })
  it('adds target date and planned start inputs and passes them to the observations', async () => {
    const nested = {
      kind: 'GROUP',
      mode: 'AND',
      children: [
        {
          kind: 'CONDITION',
          id: 'ind',
          metric: 'INDICATOR_CURRENT_VALUE',
          operator: 'LT',
          threshold: '5',
          indicatorId: '60000000-0000-4000-8000-000000000001',
        },
        {
          kind: 'CONDITION',
          id: 'act',
          metric: 'ACTIVITY_OVERDUE_DAYS',
          operator: 'GT',
          threshold: '0',
          activityId: '70000000-0000-4000-8000-000000000001',
        },
      ],
    } as unknown as HumanRule['conditions']
    render(<RuleTestWorkspace rule={{ ...rule, conditions: nested }} />)
    fireEvent.change(screen.getByLabelText('Test reporting date (Asia/Manila)'), {
      target: { value: '2026-09-27' },
    })
    fireEvent.change(screen.getByLabelText('Test current value'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Test target date'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('Test planned start date'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run condition test' }))
    await waitFor(() => expect(state.call).toHaveBeenCalledOnce())
    const [indicator, activity] = state.call.mock.calls[0][0].observations
    expect(indicator.calculation).toMatchObject({ targetDate: '2026-12-31' })
    expect(activity.calculation.members[0]).toMatchObject({ plannedStartDate: '2026-09-01' })
  })
  it('sends the Critical mark and expectations, and shows the suggested severity', async () => {
    const expectations = { expectedScoreImprovement: '10', manageableFollowUpPercent: null }
    render(
      <RuleTestWorkspace
        rule={{ ...rule, severity: 'HIGH', expectations } as unknown as HumanRule}
      />,
    )
    enter()
    await screen.findByRole('heading', { name: 'Sample result' })
    expect(state.call.mock.calls[0][0].rule).toMatchObject({ severity: null, expectations })
    const text = formatSeverityBasis(basis)
    expect(screen.getByText(text.headline)).toBeTruthy()
    expect(screen.getByText(text.reason)).toBeTruthy()
  })
  it('shows no severity block when the rule is not triggered', async () => {
    state.call.mockImplementationOnce(async (body) => ({
      rule: body.rule,
      asOf: body.asOf,
      result: 'FALSE',
      evidence: {
        condition: body.rule.conditions,
        observation: body.observations[0],
        result: 'FALSE',
        reason: null,
      },
      severityBasis: null,
    }))
    render(<RuleTestWorkspace rule={rule} />)
    enter()
    await screen.findByRole('heading', { name: 'Test result' })
    expect(screen.queryByRole('heading', { name: 'Sample result' })).toBeNull()
  })
})
