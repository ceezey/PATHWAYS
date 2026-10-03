'use client'

import { UnavailableHint } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RuleTreeView, clearRecordBindings } from '@/features/analytics/rule-condition-editor'
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { type RuleCondition, operators } from '@/features/analytics/rules-validation'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import {
  type MetricScope,
  SCOPES,
  availableMetrics,
  metricLabel,
  operatorWords,
  unitLabel,
} from './rule-board-model'
import { type Mode, newRow, recordBound, selectClass } from './rule-drawer-shared'

type Choice = { id: string; name: string }

/** Loads the project records that indicator and activity metrics bind to. */
export function useBindingChoices(scopeProjectId: string | null, rows: RuleCondition[]) {
  const { profile } = useCurrentRole()
  const has = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
  const needs = (test: (metric: string) => boolean) =>
    rows.some((row) => test(row.metric)) && scopeProjectId !== null
  const canReadActivities = has('activities.read')
  const indicators = useAuthorizedRead(
    'rule-binding-indicators',
    scopeProjectId,
    'indicators.read',
    (signal) => pathwaysClient.getProjectIndicators(scopeProjectId ?? '', signal),
    needs((metric) => metric.startsWith('INDICATOR_')),
  )
  const activitiesFull = useAuthorizedRead(
    'rule-binding-activities',
    scopeProjectId,
    'activities.read',
    (signal) => pathwaysClient.getActivities(scopeProjectId ?? '', signal),
    needs((metric) => metric === 'ACTIVITY_OVERDUE_DAYS') && canReadActivities,
  )
  const activitiesContext = useAuthorizedRead(
    'rule-binding-activities-context',
    scopeProjectId,
    'activities.context.read',
    (signal) => pathwaysClient.getActivityContext(scopeProjectId ?? '', signal),
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
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Applies To</h3>
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
          const hint = `scope-unavailable-${scope.replaceAll(' ', '-')}`
          return (
            <label
              className={cn('flex items-center gap-2 text-sm', missing && 'text-muted-foreground')}
              key={scope}
              title={missing ? 'Not in the rule metric catalog yet' : undefined}
            >
              <input
                aria-describedby={missing ? hint : undefined}
                checked={scopes.includes(scope)}
                disabled={missing}
                onChange={() => onToggle(scope)}
                type="checkbox"
              />
              {scope}
              {missing ? (
                <UnavailableHint id={hint} message="Not in the rule metric catalog yet" />
              ) : null}
            </label>
          )
        })}
      </div>
    </section>
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
    <section className="space-y-3">
      <h3 className="font-semibold">Condition Builder</h3>
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
    </section>
  )
}
