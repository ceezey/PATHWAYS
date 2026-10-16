'use client'

import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RuleTreeView, clearRecordBindings } from '@/features/analytics/rule-condition-editor'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { usePermission } from '@/hooks/use-permission'
import { activitiesClient } from '@/lib/api/activities'
import { indicatorsClient } from '@/lib/api/indicators'
import { cn } from '@/lib/utils'
import { type HumanRule, type RuleCondition, operators } from '@pathways/shared'
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import {
  type MetricScope,
  SCOPES,
  availableMetrics,
  metricGuidance,
  metricLabel,
  operatorWords,
  scopeGuidance,
  unitLabel,
} from './rule-board-model'
import { type Mode, newRow, recordBound, selectClass } from './rule-drawer-shared'

type Choice = { id: string; name: string }

function ScopeOption({
  scope,
  unavailable,
  checked,
  message,
  description,
  onToggle,
}: {
  scope: MetricScope
  unavailable: boolean
  checked: boolean
  message: string
  description: string
  onToggle: () => void
}) {
  const tooltipText = unavailable ? `${description}. ${message}` : description
  return (
    <div className="flex items-center gap-1">
      <label
        className={cn('flex items-center gap-2 text-sm', unavailable && 'text-muted-foreground')}
      >
        <input checked={checked} disabled={unavailable} onChange={onToggle} type="checkbox" />
        {scope}
      </label>
      <MetricTooltip label={`${scope} scope`}>{tooltipText}</MetricTooltip>
    </div>
  )
}

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

/** Loads the project records that indicator and activity metrics bind to. */
export function useBindingChoices(scopeProjectId: string | null, rows: RuleCondition[]) {
  const has = usePermission()
  const needs = (test: (metric: string) => boolean) =>
    rows.some((row) => test(row.metric)) && scopeProjectId !== null
  const canReadActivities = has('activities.read')
  const indicators = useAuthorizedRead(
    'rule-binding-indicators',
    scopeProjectId,
    'indicators.read',
    (signal) => indicatorsClient.getProjectIndicators(scopeProjectId ?? '', signal),
    needs((metric) => metric.startsWith('INDICATOR_')),
  )
  const activitiesFull = useAuthorizedRead(
    'rule-binding-activities',
    scopeProjectId,
    'activities.read',
    (signal) => activitiesClient.getActivities(scopeProjectId ?? '', signal),
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') && canReadActivities,
  )
  const activitiesContext = useAuthorizedRead(
    'rule-binding-activities-context',
    scopeProjectId,
    'activities.context.read',
    (signal) => activitiesClient.getActivityContext(scopeProjectId ?? '', signal),
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') &&
      !canReadActivities &&
      has('activities.context.read'),
  )
  const activityChoices = canReadActivities
    ? (activitiesFull.data ?? [])
    : (activitiesContext.data ?? [])
  return {
    indicators: (indicators.data ?? []).map((item): Choice => ({ id: item.id, name: item.name })),
    activities: activityChoices.map((item): Choice => ({ id: item.id, name: item.title })),
  }
}

export function ApplyToFields({
  locked,
  scopeProjectId,
  projects,
  scopes,
  onToggle,
  onProject,
}: {
  locked: boolean
  scopeProjectId: string | null
  projects: { id: string; title: string }[]
  scopes: MetricScope[]
  onToggle: (scope: MetricScope) => void
  onProject: (value: string) => void
}) {
  const organizationTemplate = scopeProjectId === null
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="rule-scope">Rule scope</Label>
        <select
          className={selectClass}
          disabled={locked}
          id="rule-scope"
          value={scopeProjectId ?? ''}
          onChange={(event) => onProject(event.target.value)}
        >
          <option value="">Organization template</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SCOPES.map((scope) => {
          const missing = availableMetrics([scope]).length === 0
          const needsProject = organizationTemplate && scope === 'Indicator'
          const unavailable = missing || needsProject
          const message = needsProject
            ? 'Indicator metrics require a project record.'
            : 'Not in the rule metric catalog yet'
          return (
            <ScopeOption
              checked={scopes.includes(scope)}
              description={scopeGuidance[scope]}
              key={scope}
              message={message}
              scope={scope}
              unavailable={unavailable}
              onToggle={() => onToggle(scope)}
            />
          )
        })}
      </div>
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
