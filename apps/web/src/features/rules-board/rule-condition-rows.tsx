'use client'

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
import { useId, useState } from 'react'
import {
  type MetricScope,
  SCOPES,
  availableMetrics,
  metricLabel,
  metricGuidance,
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
  const descriptionId = useId()
  const [hintOpen, setHintOpen] = useState(false)
  const canExplain = unavailable
  return (
    <span
      className="relative block"
      onMouseEnter={() => canExplain && setHintOpen(true)}
      onMouseLeave={() => setHintOpen(false)}
    >
      <span
        aria-describedby={canExplain ? descriptionId : undefined}
        aria-label={canExplain ? `${scope} unavailable` : undefined}
        className="inline-flex"
        onBlur={() => setHintOpen(false)}
        onFocus={() => canExplain && setHintOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setHintOpen(false)
            event.currentTarget.blur()
          }
        }}
        role={canExplain ? 'group' : undefined}
        tabIndex={canExplain ? 0 : undefined}
      >
        <label
          className={cn('flex items-center gap-2 text-sm', unavailable && 'text-muted-foreground')}
          title={unavailable ? message : undefined}
        >
          <input checked={checked} disabled={unavailable} onChange={onToggle} type="checkbox" />
          {scope}
        </label>
      </span>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {canExplain ? (
        <span className="sr-only" id={descriptionId}>
          {message}
        </span>
      ) : null}
      {hintOpen ? (
        <span
          className="absolute left-0 top-full z-40 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground shadow-dialog"
          role="tooltip"
        >
          {message}
        </span>
      ) : null}
    </span>
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
              {metricGuidance(row.metric) ? (
                <aside
                  aria-label={`About ${metricLabel(row.metric)}`}
                  className="col-span-2 space-y-2 rounded-md border border-info/30 bg-info-subtle p-3 text-sm"
                >
                  <p className="font-medium">About {metricLabel(row.metric)}</p>
                  <p>{metricGuidance(row.metric)?.definition}</p>
                  <p className="text-muted-foreground">
                    Monitors: {metricGuidance(row.metric)?.monitors}. Unit: {unitLabel(row.metric)}.
                  </p>
                  <p>
                    <span className="font-medium">
                      {metricGuidance(row.metric)?.example.label}:
                    </span>{' '}
                    {metricGuidance(row.metric)?.example.value}
                  </p>
                  <p className="text-muted-foreground">
                    Enter the threshold yourself. This example does not fill or save a threshold.
                  </p>
                </aside>
              ) : null}
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
