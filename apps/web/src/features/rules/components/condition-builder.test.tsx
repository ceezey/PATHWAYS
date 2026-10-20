/* @vitest-environment jsdom */
import type { HumanRule, RuleCondition } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Joins, type MetricScope, availableMetrics, metricGuidance } from '../rules.utils'
import { ConditionBuilder } from './condition-builder'

vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),
)

// Rendering 32 conditions is slow under a loaded full run.
vi.setConfig({ testTimeout: 15000 })
afterEach(cleanup)

const row = (id: string, patch: Partial<RuleCondition> = {}): RuleCondition => ({
  kind: 'CONDITION',
  id,
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '5',
  ...patch,
})
const indicators = [{ id: 'ind-1', name: 'Indicator one' }]
const activities = [{ id: 'act-1', name: 'Activity one' }]

let rowsNow: RuleCondition[] = []
let joinsNow: Joins = {}
function Harness({
  initial,
  scopeProjectId = 'proj-a',
  nestedRule,
  onAdvanced = vi.fn(),
  scopes = ['Project'],
  initialJoins = {},
}: {
  initial: RuleCondition[]
  initialJoins?: Joins
  scopeProjectId?: string | null
  nestedRule?: HumanRule
  onAdvanced?: () => void
  scopes?: MetricScope[]
}) {
  const [rows, setRows] = useState(initial)
  const [joins, setJoins] = useState<Joins>(initialJoins)
  rowsNow = rows
  joinsNow = joins
  return (
    <ConditionBuilder
      activities={activities}
      expectations={{}}
      indicators={indicators}
      joins={joins}
      nestedRule={nestedRule}
      onAdvanced={onAdvanced}
      rows={rows}
      scopeProjectId={scopeProjectId}
      scopes={scopes}
      setJoins={setJoins}
      setRows={setRows}
    />
  )
}
const field = (label: string, id: string) =>
  screen.getByLabelText(label, { selector: `[id="${id}"]` })
const add = () =>
  screen.getByRole('button', { name: 'Add another Project condition' }) as HTMLButtonElement

describe('ConditionBuilder match and remove guards', () => {
  it('offers a join before every condition after the first, within one area too', () => {
    render(<Harness initial={[row('a')]} />)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    cleanup()
    render(<Harness initial={[row('a'), row('b'), row('c')]} />)
    expect(screen.queryByRole('radiogroup', { name: 'Join condition 1' })).toBeNull()
    const second = screen.getByRole('radiogroup', { name: 'Join condition 3' })
    fireEvent.click(within(second).getByRole('radio', { name: 'OR' }))
    expect(joinsNow).toEqual({ c: 'OR' })
    const first = screen.getByRole('radiogroup', { name: 'Join condition 2' })
    expect((within(first).getByRole('radio', { name: 'AND' }) as HTMLInputElement).checked).toBe(
      true,
    )
  })
  it('puts each join beside its remove button and divides AND runs at every OR', () => {
    render(<Harness initial={[row('a'), row('b'), row('c')]} initialJoins={{ c: 'OR' }} />)
    const card = screen.getByRole('group', { name: 'Condition 3 (Project)' })
    expect(within(card).getByRole('radiogroup', { name: 'Join condition 3' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Remove condition' })).toBeTruthy()
    expect(screen.getAllByText('OR', { selector: 'div' })).toHaveLength(1)
    expect(screen.getByText(/AND is checked before OR/)).toBeTruthy()
  })
  it('offers Remove only with several conditions and removes the chosen one', () => {
    render(<Harness initial={[row('a')]} />)
    expect(screen.queryByRole('button', { name: 'Remove condition' })).toBeNull()
    cleanup()
    render(<Harness initial={[row('a'), row('b'), row('c')]} />)
    const removers = screen.getAllByRole('button', { name: 'Remove condition' })
    expect(removers).toHaveLength(3)
    fireEvent.click(removers[1] as HTMLElement)
    expect(rowsNow.map((item) => item.id)).toEqual(['a', 'c'])
  })
})

describe('ConditionBuilder condition cap', () => {
  it('adds a default condition on the first metric option and stops at 32', () => {
    render(<Harness initial={Array.from({ length: 31 }, (_, i) => row(`r${i}`))} />)
    expect(add().disabled).toBe(false)
    fireEvent.click(add())
    expect(rowsNow).toHaveLength(32)
    expect(rowsNow[31]).toMatchObject({
      kind: 'CONDITION',
      metric: availableMetrics(['Project'])[0],
      operator: 'LT',
      threshold: '',
    })
    expect(add().disabled).toBe(true)
  })
  it('keeps Add disabled when 32 conditions already exist', () => {
    render(<Harness initial={Array.from({ length: 32 }, (_, i) => row(`r${i}`))} />)
    expect(add().disabled).toBe(true)
  })
})

describe('ConditionBuilder edits', () => {
  it('clears both record bindings when the metric changes', () => {
    const target = availableMetrics(['Indicator']).find(
      (key) => key !== 'INDICATOR_PROGRESS_PERCENT',
    ) as RuleCondition['metric']
    render(
      <Harness
        initial={[
          row('a', {
            metric: 'INDICATOR_PROGRESS_PERCENT',
            indicatorId: 'ind-1',
            activityId: 'act-1',
          }),
        ]}
        scopes={['Indicator']}
      />,
    )
    fireEvent.change(field('What should we check?', 'a-metric'), {
      target: { value: target },
    })
    expect(rowsNow[0]).toEqual(row('a', { metric: target }))
  })
  it('adds an empty upper threshold for BETWEEN and drops it for any other operator', () => {
    render(<Harness initial={[row('a')]} />)
    expect(screen.queryByLabelText('Upper threshold')).toBeNull()
    fireEvent.change(field('Condition', 'a-operator'), { target: { value: 'BETWEEN' } })
    expect(rowsNow[0]).toEqual(row('a', { operator: 'BETWEEN', thresholdMaximum: '' }))
    fireEvent.change(screen.getByLabelText('Upper threshold'), { target: { value: '9' } })
    expect(rowsNow[0]?.thresholdMaximum).toBe('9')
    fireEvent.change(field('Condition', 'a-operator'), { target: { value: 'GT' } })
    expect(rowsNow[0]).toEqual(row('a', { operator: 'GT' }))
    expect(screen.queryByLabelText('Upper threshold')).toBeNull()
    fireEvent.change(field('Condition', 'a-operator'), { target: { value: 'BETWEEN' } })
    expect(rowsNow[0]?.thresholdMaximum).toBe('')
  })
  it('changes only the edited condition threshold', () => {
    render(<Harness initial={[row('a'), row('b')]} />)
    fireEvent.change(field('Threshold', 'b-threshold'), { target: { value: '12.5' } })
    expect(rowsNow.map((item) => item.threshold)).toEqual(['5', '12.5'])
  })
})

describe('ConditionBuilder record select', () => {
  it('is absent for a metric that binds to no record', () => {
    render(<Harness initial={[row('a')]} />)
    expect(screen.queryByLabelText('Indicator')).toBeNull()
    expect(screen.queryByLabelText('Activity')).toBeNull()
  })
  it('is disabled until a project scope exists and says so', () => {
    render(
      <Harness
        initial={[row('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })]}
        scopeProjectId={null}
        scopes={['Indicator']}
      />,
    )
    const select = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.options[0]?.text).toBe('Choose a project scope first')
    cleanup()
    render(
      <Harness
        initial={[row('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })]}
        scopes={['Indicator']}
      />,
    )
    const enabled = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(enabled.disabled).toBe(false)
    expect(enabled.options[0]?.text).toBe('Choose a current project record')
  })
  it('lists indicators for an indicator metric and stores the choice as indicatorId', () => {
    render(
      <Harness
        initial={[row('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })]}
        scopes={['Indicator']}
      />,
    )
    const select = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Choose a current project record',
      'Indicator one',
    ])
    fireEvent.change(select, { target: { value: 'ind-1' } })
    expect(rowsNow[0]).toMatchObject({ indicatorId: 'ind-1' })
    expect(rowsNow[0]).not.toHaveProperty('activityId')
    expect(select.value).toBe('ind-1')
  })
  it('lists activities for the activity overdue metric and stores the choice as activityId', () => {
    render(
      <Harness initial={[row('a', { metric: 'ACTIVITY_OVERDUE_DAYS' })]} scopes={['Activity']} />,
    )
    const select = screen.getByRole('combobox', { name: 'Activity' }) as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Choose a current project record',
      'Activity one',
    ])
    fireEvent.change(select, { target: { value: 'act-1' } })
    expect(rowsNow[0]).toMatchObject({ activityId: 'act-1' })
    expect(rowsNow[0]).not.toHaveProperty('indicatorId')
  })
})

describe('ConditionBuilder nested rule', () => {
  it('shows the advanced editor entry instead of the flat builder', () => {
    const onAdvanced = vi.fn()
    const nestedRule = {
      conditions: {
        kind: 'GROUP',
        mode: 'OR',
        children: [{ kind: 'GROUP', mode: 'AND', children: [row('a')] }, row('b')],
      },
    } as unknown as HumanRule
    render(<Harness initial={[]} nestedRule={nestedRule} onAdvanced={onAdvanced} />)
    expect(screen.queryByRole('button', { name: /^Add another .* condition$/ })).toBeNull()
    expect(screen.queryByLabelText('What should we check?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open advanced editor' }))
    expect(onAdvanced).toHaveBeenCalledOnce()
  })
})

describe('ConditionBuilder area groups', () => {
  it('shows metric guidance as plain text without changing the threshold', () => {
    render(<Harness initial={[row('a')]} />)
    const definition = metricGuidance('PROJECT_REMAINING_DAYS')?.definition ?? ''
    expect(definition).not.toBe('')
    expect(screen.getByText(definition, { selector: 'p' })).toBeTruthy()
    expect(screen.queryByText(/does not fill or save a threshold/)).toBeNull()
    expect(rowsNow[0]?.threshold).toBe('5')
  })
  it('keeps rows in the order added across areas, each labelled with its area', () => {
    render(
      <Harness
        initial={[row('a'), row('c', { metric: 'INDICATOR_PROGRESS_PERCENT' }), row('b')]}
        scopes={['Indicator', 'Project']}
      />,
    )
    expect(screen.getAllByRole('heading').map((item) => item.textContent)).toEqual([
      'Project',
      'Indicator / KPI',
      'Project',
    ])
    expect(
      screen
        .getAllByRole('group', { name: /^Condition / })
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Condition 1 (Project)', 'Condition 2 (Indicator / KPI)', 'Condition 3 (Project)'])
    expect(screen.getAllByRole('button', { name: /^Add another .* condition$/ })).toHaveLength(2)
  })
  it('lists only the area metrics and hides record-bound ones without a project', () => {
    render(
      <Harness
        initial={[row('a')]}
        scopeProjectId={null}
        scopes={['Project', 'Indicator', 'Activity']}
      />,
    )
    const values = Array.from(
      (field('What should we check?', 'a-metric') as HTMLSelectElement).options,
    ).map((option) => option.value)
    expect(values).toContain('PROJECT_REMAINING_DAYS')
    expect(values).not.toContain('INDICATOR_PROGRESS_PERCENT')
    expect(values).not.toContain('ACTIVITY_COMPLETION_PERCENT')
  })
  it('shows the unit suffix after the threshold', () => {
    render(<Harness initial={[row('a', { metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT' })]} />)
    expect(screen.getByText('%')).toBeTruthy()
  })
})
