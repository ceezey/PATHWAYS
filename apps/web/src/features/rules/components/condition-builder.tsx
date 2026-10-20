'use client'

import { FilterChoiceGroup, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  type HumanRule,
  MAX_CONDITIONS,
  type RuleCondition,
  type RuleExpectations,
  operators,
} from '@pathways/shared'
import { Info, Trash2 } from 'lucide-react'
import { preferredOperators } from '../rule-severity.utils'
import {
  type Choice,
  type Joins,
  type MetricScope,
  type Mode,
  SCOPE_GRID_ORDER,
  availableMetrics,
  clearRecordBindings,
  metricGuidance,
  metricLabel,
  newRow,
  operatorWords,
  recordBound,
  runsOf,
  scopeDisplayLabel,
  scopeOf,
  selectClass,
  suffix,
} from '../rules.utils'
import { RuleTreeView } from './rule-tree-view'

function MetricGuidance({ metric }: { metric: string }) {
  const guidance = metricGuidance(metric)
  if (!guidance) return null
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {guidance.definition}
    </p>
  )
}

export function ConditionBuilder({
  nestedRule,
  rows,
  setRows,
  joins,
  setJoins,
  scopes,
  scopeProjectId,
  indicators,
  activities,
  onAdvanced,
  expectations,
}: {
  nestedRule?: HumanRule
  rows: RuleCondition[]
  setRows: React.Dispatch<React.SetStateAction<RuleCondition[]>>
  joins: Joins
  setJoins: React.Dispatch<React.SetStateAction<Joins>>
  scopes: MetricScope[]
  scopeProjectId: string | null
  indicators: Choice[]
  activities: Choice[]
  onAdvanced: () => void
  expectations: RuleExpectations
}) {
  const preferredFor = (row: RuleCondition) => preferredOperators(row, expectations)
  const setRow = (id: string, patch: (row: RuleCondition) => RuleCondition) =>
    setRows((current) => current.map((row) => (row.id === id ? patch(row) : row)))
  const areas = SCOPE_GRID_ORDER.filter((scope) => scopes.includes(scope))
    .map((scope) => ({
      scope,
      areaMetrics: availableMetrics([scope]).filter(
        (key) => scopeProjectId !== null || !recordBound(key),
      ),
    }))
    .filter((area) => area.areaMetrics.length > 0)
  const renderRow = (row: RuleCondition) => {
    const conditionIndex = rows.indexOf(row)
    const scope = scopeOf(row.metric)
    return (
      <fieldset
        aria-label={`Condition ${conditionIndex + 1} (${scopeDisplayLabel[scope] ?? scope})`}
        className="space-y-3 rounded-md border border-border bg-background p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Condition {conditionIndex + 1}</span>
            <StatusBadge dot={false} tone="neutral">
              {scopeDisplayLabel[scope] ?? scope}
            </StatusBadge>
          </div>
          {rows.length > 1 ? (
            <Button
              aria-label="Remove condition"
              size="icon"
              title="Remove condition"
              type="button"
              variant="outline"
              onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${row.id}-metric`}>What should we check?</Label>
          <select
            className={selectClass}
            id={`${row.id}-metric`}
            value={row.metric}
            onChange={(event) =>
              setRow(row.id, (current) => ({
                ...(clearRecordBindings(current) as RuleCondition),
                metric: event.target.value as RuleCondition['metric'],
              }))
            }
          >
            {areas.map((area) => (
              <optgroup key={area.scope} label={scopeDisplayLabel[area.scope] ?? area.scope}>
                {area.areaMetrics.map((key) => (
                  <option key={key} value={key}>
                    {metricLabel(key)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium" id={`${row.id}-notify-label`}>
            Notify me when the value is...
          </span>
          <div className="flex items-center gap-2">
            <Label className="sr-only" htmlFor={`${row.id}-operator`}>
              Condition
            </Label>
            <Select
              value={row.operator}
              onValueChange={(value) =>
                setRow(row.id, (current) => {
                  const { thresholdMaximum: _upper, ...rest } = current
                  const operator = value as RuleCondition['operator']
                  return {
                    ...rest,
                    operator,
                    ...(operator === 'BETWEEN' ? { thresholdMaximum: '' } : {}),
                  }
                })
              }
            >
              <SelectTrigger
                aria-describedby={`${row.id}-notify-label`}
                className="max-w-40"
                id={`${row.id}-operator`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((operator) => {
                  const preferred = preferredFor(row).includes(operator)
                  return (
                    <SelectItem
                      className={cn(preferred && 'bg-info-subtle text-info')}
                      hint={
                        preferred ? <span className="sr-only">Preferred condition</span> : undefined
                      }
                      title={preferred ? 'Preferred condition' : undefined}
                      key={operator}
                      value={operator}
                    >
                      {operatorWords[operator].replace(/^\w/, (char) => char.toUpperCase())}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Label className="sr-only" htmlFor={`${row.id}-threshold`}>
              Threshold
            </Label>
            <Input
              aria-describedby={`${row.id}-notify-label`}
              className="flex-1"
              id={`${row.id}-threshold`}
              inputMode="decimal"
              maxLength={20}
              value={row.threshold}
              onChange={(event) =>
                setRow(row.id, (current) => ({
                  ...current,
                  threshold: event.target.value,
                }))
              }
            />
            {suffix(row.metric) ? (
              <span className="text-sm text-muted-foreground">{suffix(row.metric)}</span>
            ) : null}
          </div>
        </div>
        <MetricGuidance metric={row.metric} />
        {row.operator === 'BETWEEN' ? (
          <div className="space-y-2">
            <Label htmlFor={`${row.id}-upper`}>Upper threshold</Label>
            <Input
              id={`${row.id}-upper`}
              inputMode="decimal"
              maxLength={20}
              value={row.thresholdMaximum ?? ''}
              onChange={(event) =>
                setRow(row.id, (current) => ({
                  ...current,
                  thresholdMaximum: event.target.value,
                }))
              }
            />
          </div>
        ) : null}
        {recordBound(row.metric) ? (
          <div className="space-y-2">
            <Label htmlFor={`${row.id}-record`}>
              {row.metric.startsWith('INDICATOR_') ? 'Indicator' : 'Activity'}
            </Label>
            <select
              className={selectClass}
              disabled={scopeProjectId === null}
              id={`${row.id}-record`}
              value={row.indicatorId ?? row.activityId ?? ''}
              onChange={(event) =>
                setRow(row.id, (current) => ({
                  ...current,
                  ...(current.metric.startsWith('INDICATOR_')
                    ? { indicatorId: event.target.value }
                    : { activityId: event.target.value }),
                }))
              }
            >
              <option value="">
                {scopeProjectId === null
                  ? 'Choose a project scope first'
                  : 'Choose a current project record'}
              </option>
              {(row.metric.startsWith('INDICATOR_') ? indicators : activities).map((record) => (
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
  const runs = runsOf(rows, joins)
  const blocked = runs.length > 1
  const joinChoice = (row: RuleCondition) => {
    const index = rows.indexOf(row)
    return index > 0 ? (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-3">
        <span className="text-sm font-medium">Join condition {index + 1}</span>
        <FilterChoiceGroup
          label={`Join condition ${index + 1}`}
          options={['AND', 'OR']}
          value={joins[row.id] ?? 'AND'}
          onValueChange={(value) =>
            setJoins((current) => ({ ...current, [row.id]: value as Mode }))
          }
        />
      </div>
    ) : null
  }
  return (
    <div className="space-y-3">
      {nestedRule ? (
        <div className="space-y-3">
          <RuleTreeView node={nestedRule.conditions} />
          <Button type="button" variant="outline" onClick={() => onAdvanced()}>
            Open advanced editor
          </Button>
        </div>
      ) : (
        <>
          {rows.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              AND is checked before OR, so A AND B OR C means (A AND B) OR C.
            </p>
          ) : null}
          {runs.map((run) => (
            <div className="space-y-2" key={run[0]?.id}>
              {joinChoice(run[0] as RuleCondition)}
              <fieldset
                aria-label={blocked ? 'All of these must match' : 'Conditions'}
                className={cn('space-y-2', blocked && 'rounded-md border border-border p-2')}
              >
                {blocked && run.length > 1 ? (
                  <p className="text-sm font-medium">All of these must match</p>
                ) : null}
                {run.map((row, position) => (
                  <div className="space-y-2" key={row.id}>
                    {position > 0 ? joinChoice(row) : null}
                    {renderRow(row)}
                  </div>
                ))}
              </fieldset>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <Button
                disabled={rows.length >= MAX_CONDITIONS}
                key={area.scope}
                type="button"
                variant="outline"
                onClick={() =>
                  setRows((current) => [...current, newRow(area.areaMetrics[0] ?? '')])
                }
              >
                Add another {scopeDisplayLabel[area.scope] ?? area.scope} condition
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
