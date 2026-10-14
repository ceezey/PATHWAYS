'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type HumanRule, type RuleCondition, operators } from '@pathways/shared'
import {
  type Choice,
  type Mode,
  clearRecordBindings,
  metricLabel,
  newRow,
  operatorWords,
  recordBound,
  selectClass,
  unitLabel,
} from '../rules.utils'
import { RuleTreeView } from './rule-tree-view'

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
              className="grid grid-cols-2 gap-3 rounded-md border border-border p-3"
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
                  {metricOptions.includes(row.metric) ? null : (
                    <option value={row.metric}>{metricLabel(row.metric)}</option>
                  )}
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
          <Button
            disabled={rows.length >= 32}
            type="button"
            variant="outline"
            onClick={() => setRows((current) => [...current, newRow(metricOptions[0] ?? '')])}
          >
            Add condition
          </Button>
        </>
      )}
    </div>
  )
}
