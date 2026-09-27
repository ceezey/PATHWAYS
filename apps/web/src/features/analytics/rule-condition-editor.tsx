'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type RuleNode, operators, ruleMetrics } from './rules-validation'
export const comparisonCopy = {
  LT: 'Below (<)',
  LTE: 'At most (<=)',
  EQ: 'Equal to (=)',
  GTE: 'At least (>=)',
  GT: 'Above (>)',
  BETWEEN: 'Between',
} as const
const nodeKey = (node: RuleNode): string =>
  node.kind === 'CONDITION'
    ? node.id
    : `group_${node.children[0] ? nodeKey(node.children[0]) : 'empty'}`
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase()
export const newCondition = (): RuleNode => ({
  kind: 'CONDITION',
  id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '',
})
export const leafCount = (node: RuleNode): number =>
  node.kind === 'CONDITION' ? 1 : node.children.reduce((sum, child) => sum + leafCount(child), 0)
type Choice = { id: string; name: string }
type Props = {
  node: RuleNode
  onChange: (node: RuleNode) => void
  disabled: boolean
  remainingLeaves: number
  indicators: Choice[]
  activities: Choice[]
  path?: string
  depth?: number
}
export function RuleConditionEditor({
  node,
  onChange,
  disabled,
  remainingLeaves,
  indicators,
  activities,
  path = 'root',
  depth = 0,
}: Props) {
  const id = (field: string) => `rule-${path}-${field}`
  if (node.kind === 'GROUP')
    return (
      <fieldset className="space-y-3 rounded-sm border border-border p-4" disabled={disabled}>
        <legend className="px-2 font-semibold">Condition group</legend>
        <Label htmlFor={id('mode')}>Combine conditions</Label>
        <select
          className="h-10 rounded-sm border border-input bg-background px-3"
          id={id('mode')}
          value={node.mode}
          onChange={(event) => onChange({ ...node, mode: event.target.value as 'AND' | 'OR' })}
        >
          <option value="AND">All conditions (AND)</option>
          <option value="OR">Any condition (OR)</option>
        </select>
        {node.children.map((child, index) => (
          <div className="space-y-2" key={nodeKey(child)}>
            <RuleConditionEditor
              node={child}
              onChange={(value) =>
                onChange({
                  ...node,
                  children: node.children.map((existing, i) => (i === index ? value : existing)),
                })
              }
              disabled={disabled}
              remainingLeaves={remainingLeaves}
              indicators={indicators}
              activities={activities}
              path={`${path}-${index}`}
              depth={depth + 1}
            />
            {node.children.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({ ...node, children: node.children.filter((_, i) => i !== index) })
                }
              >
                Remove condition or group {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || remainingLeaves <= 0 || node.children.length >= 32}
            type="button"
            variant="outline"
            onClick={() => onChange({ ...node, children: [...node.children, newCondition()] })}
          >
            Add condition
          </Button>
          <Button
            disabled={disabled || depth >= 3 || remainingLeaves <= 0 || node.children.length >= 32}
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...node,
                children: [
                  ...node.children,
                  { kind: 'GROUP', mode: 'AND', children: [newCondition()] },
                ],
              })
            }
          >
            Add group
          </Button>
        </div>
      </fieldset>
    )
  const indicator = node.metric.startsWith('INDICATOR_')
  const activity = node.metric === 'ACTIVITY_OVERDUE_DAYS'
  return (
    <fieldset
      className="grid gap-3 rounded-sm border border-border p-4 md:grid-cols-2"
      disabled={disabled}
    >
      <legend className="px-2 font-semibold">Condition</legend>
      <div className="space-y-2">
        <Label htmlFor={id('metric')}>Metric</Label>
        <select
          className="h-10 w-full rounded-sm border border-input bg-background px-3"
          id={id('metric')}
          value={node.metric}
          onChange={(event) => {
            const { indicatorId: _indicator, activityId: _activity, ...rest } = node
            onChange({ ...rest, metric: event.target.value as typeof node.metric })
          }}
        >
          {ruleMetrics.map((metric) => (
            <option value={metric} key={metric}>
              {label(metric)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id('operator')}>Comparison</Label>
        <select
          className="h-10 w-full rounded-sm border border-input bg-background px-3"
          id={id('operator')}
          value={node.operator}
          onChange={(event) => {
            const { thresholdMaximum: _upper, ...rest } = node
            const operator = event.target.value as typeof node.operator
            onChange({
              ...rest,
              operator,
              ...(operator === 'BETWEEN' ? { thresholdMaximum: '' } : {}),
            })
          }}
        >
          {operators.map((operator) => (
            <option value={operator} key={operator}>
              {comparisonCopy[operator]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id('threshold')}>Threshold</Label>
        <Input
          id={id('threshold')}
          value={node.threshold}
          maxLength={20}
          required
          inputMode="decimal"
          onChange={(event) => onChange({ ...node, threshold: event.target.value })}
        />
      </div>
      {node.operator === 'BETWEEN' ? (
        <div className="space-y-2">
          <Label htmlFor={id('upper')}>Upper threshold</Label>
          <Input
            id={id('upper')}
            value={node.thresholdMaximum ?? ''}
            maxLength={20}
            required
            inputMode="decimal"
            onChange={(event) => onChange({ ...node, thresholdMaximum: event.target.value })}
          />
        </div>
      ) : null}
      {indicator || activity ? (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={id('record')}>{indicator ? 'Indicator' : 'Activity'}</Label>
          <select
            className="h-10 w-full rounded-sm border border-input bg-background px-3"
            id={id('record')}
            required
            value={indicator ? (node.indicatorId ?? '') : (node.activityId ?? '')}
            onChange={(event) =>
              onChange({
                ...node,
                ...(indicator
                  ? { indicatorId: event.target.value }
                  : { activityId: event.target.value }),
              })
            }
          >
            <option value="">Choose a current project record</option>
            {(indicator ? indicators : activities).map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </fieldset>
  )
}
export function RuleTreeView({ node }: { node: RuleNode }) {
  return node.kind === 'GROUP' ? (
    <div className="space-y-2 border-l-2 border-border pl-3">
      <p className="font-medium">{node.mode === 'AND' ? 'All conditions' : 'Any condition'}</p>
      {node.children.map((child) => (
        <RuleTreeView key={nodeKey(child)} node={child} />
      ))}
    </div>
  ) : (
    <p className="text-sm">
      {label(node.metric)} {comparisonCopy[node.operator]} {node.threshold}
      {node.thresholdMaximum !== undefined ? ` to ${node.thresholdMaximum}` : ''}
    </p>
  )
}
