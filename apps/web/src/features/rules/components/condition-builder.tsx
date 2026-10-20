'use client'

import { FilterChoiceGroup } from '@/components/pathways'
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
import { ChevronDown, ChevronUp, GripVertical, Info, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  moveRow,
  newRow,
  operatorWords,
  recordBound,
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
  // A card drags only while its handle is held, so text in its fields stays selectable.
  const [armed, setArmed] = useState('')
  const [dragId, setDragId] = useState('')
  const move = (id: string, targetId: string) =>
    setRows((current) => moveRow(current, id, targetId))
  const handles = useRef(new Map<string, HTMLButtonElement>())
  const [focusId, setFocusId] = useState('')
  const [announcement, setAnnouncement] = useState('')
  // Reordering keyed cards can detach the focused node, so focus returns to the moved card's handle.
  useEffect(() => {
    if (!focusId) return
    handles.current.get(focusId)?.focus()
    setFocusId('')
  }, [focusId])
  const shift = (index: number, delta: number) => {
    const row = rows[index]
    const target = rows[index + delta]
    if (!row || !target) return
    move(row.id, target.id)
    setFocusId(row.id)
    setAnnouncement(`Condition moved to position ${index + delta + 1} of ${rows.length}.`)
  }
  const renderRow = (row: RuleCondition) => {
    const conditionIndex = rows.indexOf(row)
    const scope = scopeOf(row.metric)
    const preferred = preferredFor(row)
    return (
      <fieldset
        aria-label={`Condition ${conditionIndex + 1} (${scopeDisplayLabel[scope] ?? scope})`}
        className="space-y-3 rounded-md border border-border bg-background p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {rows.length > 1 ? (
              <>
                <button
                  aria-label={`Reorder condition ${conditionIndex + 1}`}
                  className="cursor-grab rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  ref={(node) => {
                    if (node) handles.current.set(row.id, node)
                    else handles.current.delete(row.id)
                  }}
                  title="Drag, or use arrow up and down, to reorder"
                  type="button"
                  onPointerDown={() => setArmed(row.id)}
                  onPointerUp={() => setArmed('')}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                    event.preventDefault()
                    shift(conditionIndex, event.key === 'ArrowUp' ? -1 : 1)
                  }}
                >
                  <GripVertical aria-hidden="true" className="h-4 w-4" />
                </button>
                <Button
                  aria-label={`Move condition ${conditionIndex + 1} up`}
                  className="h-7 w-7"
                  disabled={conditionIndex === 0}
                  size="icon"
                  title="Move up"
                  type="button"
                  variant="ghost"
                  onClick={() => shift(conditionIndex, -1)}
                >
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`Move condition ${conditionIndex + 1} down`}
                  className="h-7 w-7"
                  disabled={conditionIndex === rows.length - 1}
                  size="icon"
                  title="Move down"
                  type="button"
                  variant="ghost"
                  onClick={() => shift(conditionIndex, 1)}
                >
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            <h4 className="font-semibold">{scopeDisplayLabel[scope] ?? scope}</h4>
          </div>
          <div className="flex items-center gap-2">
            {conditionIndex > 0 ? (
              <FilterChoiceGroup
                label={`Join condition ${conditionIndex + 1}`}
                options={['AND', 'OR']}
                value={joins[row.id] ?? 'AND'}
                onValueChange={(value) =>
                  setJoins((current) => ({ ...current, [row.id]: value as Mode }))
                }
              />
            ) : null}
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
            {(areas.find((area) => area.scope === scope)?.areaMetrics ?? [row.metric]).map(
              (key) => (
                <option key={key} value={key}>
                  {metricLabel(key)}
                </option>
              ),
            )}
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
                  const isPreferred = preferred.includes(operator)
                  const hintId = `${row.id}-${operator}-preferred`
                  return (
                    <SelectItem
                      aria-describedby={isPreferred ? hintId : undefined}
                      className={cn(isPreferred && 'bg-info-subtle text-info')}
                      hint={
                        isPreferred ? (
                          <>
                            {/* The star keeps the cue visible on the highlighted option, not colour alone. */}
                            <span
                              aria-hidden="true"
                              className="ml-auto pl-2"
                              title="Preferred condition"
                            >
                              <Star className="h-3.5 w-3.5 fill-current" />
                            </span>
                            <span className="sr-only" id={hintId}>
                              Preferred condition
                            </span>
                          </>
                        ) : undefined
                      }
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
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {rows.map((row, index) => (
            <div
              className={cn('space-y-3', dragId === row.id && 'opacity-50')}
              draggable={armed === row.id}
              key={row.id}
              onDragEnd={() => {
                setArmed('')
                setDragId('')
              }}
              onDragOver={(event) => dragId && event.preventDefault()}
              onDragStart={() => setDragId(row.id)}
              onDrop={() => {
                if (dragId) move(dragId, row.id)
                setDragId('')
              }}
            >
              {index > 0 && joins[row.id] === 'OR' ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  OR
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              {renderRow(row)}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <Button
                aria-label={`Add another ${scopeDisplayLabel[area.scope] ?? area.scope} condition`}
                className="gap-2"
                disabled={rows.length >= MAX_CONDITIONS}
                key={area.scope}
                title={`Add another ${scopeDisplayLabel[area.scope] ?? area.scope} condition`}
                type="button"
                variant="outline"
                onClick={() =>
                  setRows((current) => [...current, newRow(area.areaMetrics[0] ?? '')])
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {scopeDisplayLabel[area.scope] ?? area.scope}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
