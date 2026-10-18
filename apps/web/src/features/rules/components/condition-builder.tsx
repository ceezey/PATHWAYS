'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { type HumanRule, type RuleCondition, operators } from '@pathways/shared'
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import {
  type Choice,
  type Mode,
  clearRecordBindings,
  metricGuidance,
  metricLabel,
  newRow,
  operatorWords,
  recordBound,
  selectClass,
  unitLabel,
} from '../rules.utils'
import { RuleTreeView } from './rule-tree-view'

function MetricGuidance({ metric }: { metric: string }) {
  const guidance = metricGuidance(metric)
  const contentId = useId()
  const [expanded, setExpanded] = useState(false)

  if (!guidance) return null

  const label = metricLabel(metric)
  return (
    <div className="col-span-2 overflow-hidden rounded-md border border-info/30 bg-info-subtle text-sm">
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>About {label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-info/30 px-3 py-3" id={contentId}>
          <p>{guidance.definition}</p>
          <p className="text-muted-foreground">
            Monitors: {guidance.monitors}. Unit: {unitLabel(metric)}.
          </p>
          <p>
            <span className="font-medium">{guidance.example.label}:</span> {guidance.example.value}
          </p>
          <p className="text-muted-foreground">
            Enter the threshold yourself. This example does not fill or save a threshold.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function ConditionBuilder({
  nestedRule,
  rows,
  setRows,
  matchMode,
  setMatchMode,
  metricOptions,
  scopeProjectId,
  indicators,
  activities,
  onAdvanced,
  hideAddButton = false,
}: {
  nestedRule?: HumanRule
  rows: RuleCondition[]
  setRows: React.Dispatch<React.SetStateAction<RuleCondition[]>>
  matchMode: Mode
  setMatchMode: (mode: Mode) => void
  metricOptions: string[]
  scopeProjectId: string | null
  indicators: Choice[]
  activities: Choice[]
  onAdvanced: () => void
  hideAddButton?: boolean
}) {
  const setRow = (index: number, patch: (row: RuleCondition) => RuleCondition) =>
    setRows((current) => current.map((row, i) => (i === index ? patch(row) : row)))
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
            <div className="space-y-2">
              <Label htmlFor="rule-match">Match</Label>
              <select
                className={selectClass}
                id="rule-match"
                value={matchMode}
                onChange={(event) => setMatchMode(event.target.value as Mode)}
              >
                <option value="AND">All conditions</option>
                <option value="OR">Any condition</option>
              </select>
            </div>
          ) : null}
          {rows.map((row, index) => (
            <div
              className="grid grid-cols-2 gap-3 rounded-md border border-border bg-background p-3"
              key={row.id}
            >
              <div className="space-y-2">
                <Label htmlFor={`${row.id}-metric`}>Metric</Label>
                <select
                  className={selectClass}
                  id={`${row.id}-metric`}
                  value={row.metric}
                  onChange={(event) =>
                    setRow(index, (current) => ({
                      ...(clearRecordBindings(current) as RuleCondition),
                      metric: event.target.value as RuleCondition['metric'],
                    }))
                  }
                >
                  {metricOptions.map((key) => (
                    <option key={key} value={key}>
                      {metricLabel(key)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${row.id}-threshold`}>Threshold</Label>
                <Input
                  id={`${row.id}-threshold`}
                  inputMode="decimal"
                  maxLength={20}
                  value={row.threshold}
                  onChange={(event) =>
                    setRow(index, (current) => ({
                      ...current,
                      threshold: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${row.id}-operator`}>Condition</Label>
                <select
                  className={selectClass}
                  id={`${row.id}-operator`}
                  value={row.operator}
                  onChange={(event) =>
                    setRow(index, (current) => {
                      const { thresholdMaximum: _upper, ...rest } = current
                      const operator = event.target.value as RuleCondition['operator']
                      return {
                        ...rest,
                        operator,
                        ...(operator === 'BETWEEN' ? { thresholdMaximum: '' } : {}),
                      }
                    })
                  }
                >
                  {operators.map((operator) => (
                    <option key={operator} value={operator}>
                      {operatorWords[operator].replace(/^\w/, (char) => char.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${row.id}-unit`}>Unit</Label>
                <Input id={`${row.id}-unit`} readOnly value={unitLabel(row.metric)} />
              </div>
              <MetricGuidance metric={row.metric} />
              {row.operator === 'BETWEEN' ? (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor={`${row.id}-upper`}>Upper threshold</Label>
                  <Input
                    id={`${row.id}-upper`}
                    inputMode="decimal"
                    maxLength={20}
                    value={row.thresholdMaximum ?? ''}
                    onChange={(event) =>
                      setRow(index, (current) => ({
                        ...current,
                        thresholdMaximum: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}
              {recordBound(row.metric) ? (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor={`${row.id}-record`}>
                    {row.metric.startsWith('INDICATOR_') ? 'Indicator' : 'Activity'}
                  </Label>
                  <select
                    className={selectClass}
                    disabled={scopeProjectId === null}
                    id={`${row.id}-record`}
                    value={row.indicatorId ?? row.activityId ?? ''}
                    onChange={(event) =>
                      setRow(index, (current) => ({
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
                    {(row.metric.startsWith('INDICATOR_') ? indicators : activities).map(
                      (record) => (
                        <option key={record.id} value={record.id}>
                          {record.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              ) : null}
              {rows.length > 1 ? (
                <Button
                  className="col-span-2"
                  type="button"
                  variant="outline"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  Remove condition
                </Button>
              ) : null}
            </div>
          ))}
          {!hideAddButton ? (
            <Button
              disabled={rows.length >= 32}
              type="button"
              variant="outline"
              onClick={() => setRows((current) => [...current, newRow(metricOptions[0] ?? '')])}
            >
              Add condition
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
