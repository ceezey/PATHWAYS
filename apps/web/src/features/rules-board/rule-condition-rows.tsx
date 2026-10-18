'use client'

import { FilterChoiceGroup, StatusBadge } from '@/components/pathways'
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
import { CheckCircle2, Circle, Info, Trash2 } from 'lucide-react'
import {
  type MetricScope,
  availableMetrics,
  metricGuidance,
  metricLabel,
  operatorWords,
  scopeGuidance,
  scopeOf,
  suffix,
} from './rule-board-model'
import { type Mode, newRow, recordBound, selectClass } from './rule-drawer-shared'

type Choice = { id: string; name: string }

const SCOPE_GRID_ORDER: MetricScope[] = [
  'Project',
  'Activity',
  'Indicator',
  'Budget',
  'Beneficiary Group',
  'Assessment',
]
const scopeDisplayLabel: Partial<Record<MetricScope, string>> = { Indicator: 'Indicator / KPI' }

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
    <div
      className={cn(
        'flex items-center gap-1 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
        checked ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
        unavailable && 'opacity-60',
      )}
    >
      <label
        className={cn(
          'flex flex-1 cursor-pointer items-center gap-2 text-sm',
          unavailable && 'cursor-not-allowed text-muted-foreground',
        )}
      >
        <input
          checked={checked}
          className="sr-only"
          disabled={unavailable}
          onChange={onToggle}
          type="checkbox"
        />
        {checked ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Circle aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {scopeDisplayLabel[scope] ?? scope}
      </label>
      <MetricTooltip label={`${scope} scope`}>{tooltipText}</MetricTooltip>
    </div>
  )
}

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
    <div className="space-y-2">
      <div className="space-y-2">
        <Label htmlFor="rule-scope">Monitoring area(s)</Label>
        <div className="rounded-md border border-border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <select
            className={cn(
              selectClass,
              'rounded-b-none rounded-t-md border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            )}
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
          <fieldset
            aria-label="Applies To"
            className="rounded-b-md border-t border-border bg-background p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCOPE_GRID_ORDER.map((scope) => {
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
          </fieldset>
        </div>
      </div>
      <p className="px-3 text-sm leading-5 text-muted-foreground">
        Choose one or more monitoring areas.
      </p>
    </div>
  )
}

export function ConditionBuilder({
  nestedRule,
  rows,
  setRows,
  matchMode,
  setMatchMode,
  scopes,
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
  scopes: MetricScope[]
  scopeProjectId: string | null
  indicators: Choice[]
  activities: Choice[]
  onAdvanced: () => void
}) {
  const setRow = (id: string, patch: (row: RuleCondition) => RuleCondition) =>
    setRows((current) => current.map((row) => (row.id === id ? patch(row) : row)))
  const groups = SCOPE_GRID_ORDER.filter((scope) => scopes.includes(scope))
    .map((scope) => ({
      scope,
      areaMetrics: availableMetrics([scope]).filter(
        (key) => scopeProjectId !== null || !recordBound(key),
      ),
      areaRows: rows.filter((row) => scopeOf(row.metric) === scope),
    }))
    .filter((group) => group.areaRows.length > 0)
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
        groups.map((group, groupIndex) => (
          <fieldset
            aria-label={scopeDisplayLabel[group.scope] ?? group.scope}
            className="space-y-2"
            key={group.scope}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{scopeDisplayLabel[group.scope] ?? group.scope}</h4>
              <StatusBadge dot={false} tone="neutral">
                {group.areaRows.length} condition{group.areaRows.length === 1 ? '' : 's'}
              </StatusBadge>
            </div>
            {groupIndex > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-3">
                <span className="text-sm font-medium">Combine with previous condition</span>
                <FilterChoiceGroup
                  label="Combine with previous condition"
                  options={['AND', 'OR']}
                  value={matchMode}
                  onValueChange={(value) => setMatchMode(value as Mode)}
                />
              </div>
            ) : null}
            {group.areaRows.map((row, conditionIndex) => (
              <div
                className="space-y-3 rounded-md border border-border bg-background p-3"
                key={row.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Condition {conditionIndex + 1}</span>
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
                    {group.areaMetrics.map((key) => (
                      <option key={key} value={key}>
                        {metricLabel(key)}
                      </option>
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
                    <select
                      aria-describedby={`${row.id}-notify-label`}
                      className={cn(selectClass, 'max-w-40')}
                      id={`${row.id}-operator`}
                      value={row.operator}
                      onChange={(event) =>
                        setRow(row.id, (current) => {
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
              </div>
            ))}
            <Button
              disabled={rows.length >= 32 || group.areaMetrics.length === 0}
              type="button"
              variant="outline"
              onClick={() => setRows((current) => [...current, newRow(group.areaMetrics[0] ?? '')])}
            >
              Add another {scopeDisplayLabel[group.scope] ?? group.scope} condition
            </Button>
          </fieldset>
        ))
      )}
    </div>
  )
}
