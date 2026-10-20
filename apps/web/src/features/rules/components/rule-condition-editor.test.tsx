/* @vitest-environment jsdom */
import type { RuleNode } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuleConditionEditor } from './rule-condition-editor'

// Rendering 32 conditions is slow under a loaded full run.
vi.setConfig({ testTimeout: 15000 })
afterEach(cleanup)

const leaf = (id: string, patch: Record<string, unknown> = {}) =>
  ({
    kind: 'CONDITION',
    id,
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '5',
    ...patch,
  }) as RuleNode
const group = (children: RuleNode[], mode: 'AND' | 'OR' = 'AND') =>
  ({ kind: 'GROUP', mode, children }) as RuleNode
const indicators = [{ id: 'ind-1', name: 'Indicator one' }]
const activities = [{ id: 'act-1', name: 'Activity one' }]

let nodeNow: RuleNode = leaf('x')
function Harness({
  initial,
  remainingLeaves = 10,
  disabled = false,
  metrics,
}: {
  initial: RuleNode
  remainingLeaves?: number
  disabled?: boolean
  metrics?: React.ComponentProps<typeof RuleConditionEditor>['metrics']
}) {
  const [node, setNode] = useState(initial)
  nodeNow = node
  return (
    <RuleConditionEditor
      activities={activities}
      disabled={disabled}
      indicators={indicators}
      metrics={metrics}
      node={node}
      onChange={setNode}
      remainingLeaves={remainingLeaves}
    />
  )
}
const children = () => (nodeNow.kind === 'GROUP' ? nodeNow.children : [])
const addCondition = () =>
  screen.getByRole('button', { name: 'Add condition' }) as HTMLButtonElement
const addGroup = () => screen.getByRole('button', { name: 'Add group' }) as HTMLButtonElement

describe('RuleConditionEditor group guards', () => {
  it('offers Remove only when the group has several children and removes the chosen one', () => {
    render(<Harness initial={group([leaf('a')])} />)
    expect(screen.queryByRole('button', { name: /^Remove condition or group/ })).toBeNull()
    cleanup()
    render(<Harness initial={group([leaf('a'), leaf('b'), leaf('c')])} />)
    expect(screen.getAllByRole('button', { name: /^Remove condition or group/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition or group 2' }))
    expect(children().map((child) => (child as { id: string }).id)).toEqual(['a', 'c'])
  })
  it('changes the combine mode', () => {
    render(<Harness initial={group([leaf('a')])} />)
    fireEvent.change(screen.getByLabelText('Combine conditions'), { target: { value: 'OR' } })
    expect(nodeNow).toMatchObject({ kind: 'GROUP', mode: 'OR' })
  })
  it('appends a default condition or a one-condition group while leaves remain', () => {
    render(<Harness initial={group([leaf('a')])} remainingLeaves={2} />)
    expect(addCondition().disabled).toBe(false)
    fireEvent.click(addCondition())
    expect(children()).toHaveLength(2)
    expect(children()[1]).toMatchObject({
      kind: 'CONDITION',
      metric: 'PROJECT_REMAINING_DAYS',
      operator: 'LT',
      threshold: '0',
    })
    fireEvent.click(addGroup())
    expect(children()).toHaveLength(3)
    expect(children()[2]).toMatchObject({
      kind: 'GROUP',
      mode: 'AND',
      children: [{ kind: 'CONDITION' }],
    })
  })
  it('disables adding when no leaves remain', () => {
    render(<Harness initial={group([leaf('a')])} remainingLeaves={0} />)
    expect(addCondition().disabled).toBe(true)
    expect(addGroup().disabled).toBe(true)
  })
  it('disables adding to a group that already holds 32 children', () => {
    const full = group(Array.from({ length: 32 }, (_, i) => leaf(`r${i}`)))
    render(<Harness initial={full} remainingLeaves={5} />)
    expect(addCondition().disabled).toBe(true)
    expect(addGroup().disabled).toBe(true)
  })
  it('stops nesting groups at the fourth level but still allows conditions', () => {
    const deep = group([group([group([group([leaf('a')])])])])
    render(<Harness initial={deep} />)
    // Buttons render deepest group first.
    const groups = screen.getAllByRole('button', { name: 'Add group' }) as HTMLButtonElement[]
    expect(groups.map((button) => button.disabled)).toEqual([true, false, false, false])
    const conditions = screen.getAllByRole('button', {
      name: 'Add condition',
    }) as HTMLButtonElement[]
    expect(conditions.every((button) => !button.disabled)).toBe(true)
  })
  it('disables every control when the editor is disabled', () => {
    render(<Harness initial={group([leaf('a')])} disabled />)
    expect(addCondition().disabled).toBe(true)
    expect(addGroup().disabled).toBe(true)
  })
})

describe('RuleConditionEditor condition edits', () => {
  it('clears both record bindings when the metric changes', () => {
    render(
      <Harness
        initial={leaf('a', {
          metric: 'INDICATOR_PROGRESS_PERCENT',
          indicatorId: 'ind-1',
          activityId: 'act-1',
        })}
      />,
    )
    fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'PROJECT_OVERDUE_DAYS' } })
    expect(nodeNow).toEqual(leaf('a', { metric: 'PROJECT_OVERDUE_DAYS' }))
  })
  it('adds an empty upper threshold for BETWEEN and drops it for any other comparison', () => {
    render(<Harness initial={leaf('a')} />)
    expect(screen.queryByLabelText('Upper threshold')).toBeNull()
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'BETWEEN' } })
    expect(nodeNow).toEqual(leaf('a', { operator: 'BETWEEN', thresholdMaximum: '' }))
    fireEvent.change(screen.getByLabelText('Upper threshold'), { target: { value: '9' } })
    expect(nodeNow).toMatchObject({ thresholdMaximum: '9' })
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'GT' } })
    expect(nodeNow).toEqual(leaf('a', { operator: 'GT' }))
    expect(screen.queryByLabelText('Upper threshold')).toBeNull()
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'BETWEEN' } })
    expect(nodeNow).toMatchObject({ thresholdMaximum: '' })
  })
  it('binds an indicator or an activity choice under its own key', () => {
    render(<Harness initial={leaf('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })} />)
    const select = screen.getByLabelText('Indicator') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Choose a current project record',
      'Indicator one',
    ])
    fireEvent.change(select, { target: { value: 'ind-1' } })
    expect(nodeNow).toMatchObject({ indicatorId: 'ind-1' })
    expect(nodeNow).not.toHaveProperty('activityId')
    cleanup()
    render(<Harness initial={leaf('a', { metric: 'ACTIVITY_OVERDUE_DAYS' })} />)
    const activity = screen.getByLabelText('Activity') as HTMLSelectElement
    expect(Array.from(activity.options).map((option) => option.text)).toEqual([
      'Choose a current project record',
      'Activity one',
    ])
    fireEvent.change(activity, { target: { value: 'act-1' } })
    expect(nodeNow).toMatchObject({ activityId: 'act-1' })
    expect(nodeNow).not.toHaveProperty('indicatorId')
  })
  it('shows no record select for an unrelated metric or one outside the available metrics', () => {
    render(<Harness initial={leaf('a')} />)
    expect(screen.queryByLabelText('Indicator')).toBeNull()
    expect(screen.queryByLabelText('Activity')).toBeNull()
    cleanup()
    render(
      <Harness
        initial={leaf('a', { metric: 'INDICATOR_PROGRESS_PERCENT' })}
        metrics={['PROJECT_REMAINING_DAYS']}
      />,
    )
    expect(screen.queryByLabelText('Indicator')).toBeNull()
  })
})
