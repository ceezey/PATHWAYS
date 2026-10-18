/* @vitest-environment jsdom */
import type { HumanRule, RuleCondition } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mode } from '../rules.utils'
import { ConditionBuilder } from './condition-builder'

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
const metricOptions = [
  'PROJECT_REMAINING_DAYS',
  'INDICATOR_PROGRESS_PERCENT',
  'ACTIVITY_OVERDUE_DAYS',
]
const indicators = [{ id: 'ind-1', name: 'Indicator one' }]
const activities = [{ id: 'act-1', name: 'Activity one' }]

let rowsNow: RuleCondition[] = []
let modeNow: Mode = 'AND'
function Harness({
  initial,
  scopeProjectId = 'proj-a',
  nestedRule,
  onAdvanced = vi.fn(),
  hideAddButton,
}: {
  initial: RuleCondition[]
  scopeProjectId?: string | null
  nestedRule?: HumanRule
  onAdvanced?: () => void
  hideAddButton?: boolean
}) {
  const [rows, setRows] = useState(initial)
  const [matchMode, setMatchMode] = useState<Mode>('AND')
  rowsNow = rows
  modeNow = matchMode
  return (
    <ConditionBuilder
      activities={activities}
      hideAddButton={hideAddButton}
      indicators={indicators}
      matchMode={matchMode}
      metricOptions={metricOptions}
      nestedRule={nestedRule}
      onAdvanced={onAdvanced}
      rows={rows}
      scopeProjectId={scopeProjectId}
      setMatchMode={setMatchMode}
      setRows={setRows}
    />
  )
}
const field = (label: string, id: string) =>
  screen.getByLabelText(label, { selector: `[id="${id}"]` })
const add = () => screen.getByRole('button', { name: 'Add condition' }) as HTMLButtonElement

describe('ConditionBuilder match and remove guards', () => {
  it('offers the match mode only with several conditions and reports a change', () => {
    render(<Harness initial={[row('a')]} />)
    expect(screen.queryByLabelText('Match')).toBeNull()
    cleanup()
    render(<Harness initial={[row('a'), row('b')]} />)
    expect((screen.getByLabelText('Match') as HTMLSelectElement).value).toBe('AND')
    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'OR' } })
    expect(modeNow).toBe('OR')
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
      metric: 'PROJECT_REMAINING_DAYS',
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
    render(
      <Harness
        initial={[
          row('a', {
            metric: 'INDICATOR_PROGRESS_PERCENT',
            indicatorId: 'ind-1',
            activityId: 'act-1',
          }),
        ]}
      />,
    )
    fireEvent.change(field('Metric', 'a-metric'), { target: { value: 'PROJECT_REMAINING_DAYS' } })
    expect(rowsNow[0]).toEqual(row('a', { metric: 'PROJECT_REMAINING_DAYS' }))
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
      />,
    )
    const select = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.options[0]?.text).toBe('Choose a project scope first')
    cleanup()
    render(<Harness initial={[row('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })]} />)
    const enabled = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(enabled.disabled).toBe(false)
    expect(enabled.options[0]?.text).toBe('Choose a current project record')
  })
  it('lists indicators for an indicator metric and stores the choice as indicatorId', () => {
    render(<Harness initial={[row('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })]} />)
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
    render(<Harness initial={[row('a', { metric: 'ACTIVITY_OVERDUE_DAYS' })]} />)
    const select = screen.getByLabelText('Activity') as HTMLSelectElement
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
    expect(screen.queryByRole('button', { name: 'Add condition' })).toBeNull()
    expect(screen.queryByLabelText('Metric')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open advanced editor' }))
    expect(onAdvanced).toHaveBeenCalledOnce()
  })
})

describe('ConditionBuilder guidance and layout options', () => {
  it('hides the Add condition button on request', () => {
    render(<Harness hideAddButton initial={[row('a')]} />)
    expect(screen.queryByRole('button', { name: 'Add condition' })).toBeNull()
  })
  it('toggles the About panel for the chosen metric without changing the threshold', () => {
    render(<Harness initial={[row('a')]} />)
    const about = screen.getByRole('button', { name: 'About Days until project end' })
    expect(about.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(about)
    expect(about.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/does not fill or save a threshold/)).toBeTruthy()
    expect(rowsNow[0]?.threshold).toBe('5')
    fireEvent.click(about)
    expect(about.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/does not fill or save a threshold/)).toBeNull()
  })
  it('lists only the offered metrics and no extra option for a metric outside them', () => {
    render(<Harness initial={[row('a', { metric: 'PROJECT_OVERDUE_DAYS' })]} />)
    const options = Array.from((field('Metric', 'a-metric') as HTMLSelectElement).options)
    expect(options.map((option) => option.value)).toEqual(metricOptions)
  })
})
