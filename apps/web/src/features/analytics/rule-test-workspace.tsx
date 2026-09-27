'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type DryEvidence,
  type HumanRule,
  dryRunInputSchema,
} from '@/features/analytics/rules-human-contract'
import type { RuleCondition, RuleNode } from '@/features/analytics/rules-validation'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import {
  type MetricDirection,
  type NumericKind,
  businessCalendarDate,
  numericKinds,
  numericMetric,
} from '@pathways/shared'
import { useEffect, useRef, useState } from 'react'
import { activityObservation, indicatorObservation, timelineObservation } from './rule-test-metrics'
type IndicatorInput = {
  current: string
  baseline: string
  target: string
  numericKind: NumericKind
  direction: MetricDirection
}
type ActivityInput = {
  id: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FOR_REVIEW' | 'COMPLETED'
  plannedEndDate: string
}
const collect = (node: RuleNode): RuleCondition[] =>
  node.kind === 'CONDITION' ? [node] : node.children.flatMap(collect)
export function RuleTestWorkspace({ rule }: { rule: HumanRule }) {
  const { profile, access } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'rule-test',
    'rules.read',
    rule.projectId,
    `${rule.id}:${rule.version}`,
    access === 'ready',
  )
  if (!owner || !profile) return <output>Current rule access is required.</output>
  return (
    <OwnedRuleTest
      key={`${owner.generation}:${owner.key}`}
      rule={rule}
      owner={owner}
      organizationId={profile.organizationId}
    />
  )
}
function OwnedRuleTest({
  rule,
  owner,
  organizationId,
}: { rule: HumanRule; owner: SensitiveDraftOwner; organizationId: string }) {
  const conditions = collect(rule.conditions)
  const indicatorIds = [
    ...new Set(conditions.flatMap((item) => (item.indicatorId ? [item.indicatorId] : []))),
  ]
  const boundActivityIds = [
    ...new Set(conditions.flatMap((item) => (item.activityId ? [item.activityId] : []))),
  ]
  const [testProjectId] = useState(() => rule.projectId ?? crypto.randomUUID())
  const [reportingDate, setReportingDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [indicators, setIndicators] = useState<Record<string, IndicatorInput>>(() =>
    Object.fromEntries(
      indicatorIds.map((id) => [
        id,
        {
          current: '',
          baseline: '',
          target: '',
          numericKind: 'NON_NEGATIVE',
          direction: 'DESCRIPTIVE',
        },
      ]),
    ),
  )
  const [activities, setActivities] = useState<ActivityInput[]>(() =>
    boundActivityIds.map((id) => ({ id, status: 'NOT_STARTED', plannedEndDate: '' })),
  )
  const [result, setResult] = useState<Awaited<ReturnType<typeof rulesHumanClient.dryRun>> | null>(
    null,
  )
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = () => mounted.current && owner.isCurrent()
  const change = () => {
    setResult(null)
    setNotice('')
  }
  const test = async () => {
    if (!current() || inFlight.current) return
    let body: Parameters<typeof rulesHumanClient.dryRun>[0]
    try {
      const asOf = `${reportingDate}T04:00:00.000Z`
      if (businessCalendarDate(new Date(asOf), 'Asia/Manila') !== reportingDate)
        throw new Error('Reporting date')
      const scope = { organizationId, projectId: testProjectId }
      const revision = 'entered-test-values'
      const population = activities.map((item) => ({
        ...item,
        ...scope,
        revision,
        archived: false,
        plannedEndDate: item.plannedEndDate || null,
      }))
      const observations = conditions.map((condition) => {
        const base = { scope, conditionId: condition.id, asOf, metric: condition.metric }
        if (condition.metric.startsWith('INDICATOR_')) {
          const id = condition.indicatorId ?? ''
          const input = indicators[id]
          if (!input) throw new Error('Indicator inputs')
          return indicatorObservation({
            ...base,
            indicator: {
              ...scope,
              id,
              revision,
              status: 'ACTIVE',
              mode: 'MANUAL',
              recipe: null,
              numericKind: input.numericKind,
              unitLabel: null,
              direction: input.direction,
              baseline: input.baseline || null,
              target: input.target || null,
              current: input.current
                ? numericMetric(input.current)
                : { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
            },
          })
        }
        if (condition.metric.startsWith('PROJECT_'))
          return timelineObservation({
            ...base,
            reportingDate,
            // Entered test dates model an unarchived planned project.
            projectStatus: 'PLANNED',
            projectArchived: false,
            revision,
            startDate: startDate || null,
            endDate: endDate || null,
          })
        return activityObservation({
          ...base,
          reportingDate,
          populationRevision: revision,
          activities: population,
          ...(condition.activityId ? { activityId: condition.activityId } : {}),
        })
      })
      body = dryRunInputSchema.parse({
        rule: {
          organizationId,
          projectId: testProjectId,
          ruleId: rule.id,
          version: rule.version,
          name: rule.name,
          severity: rule.severity,
          conditions: rule.conditions,
          recommendations: rule.recommendations,
        },
        asOf,
        observations,
      })
    } catch {
      setNotice('Review the entered date and exact numeric test values.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice('')
    setResult(null)
    try {
      const value = await rulesHumanClient.dryRun(body)
      if (!current()) return
      if (
        value.rule.ruleId !== rule.id ||
        value.rule.version !== rule.version ||
        value.asOf !== body.asOf ||
        JSON.stringify(value.rule) !== JSON.stringify(body.rule)
      )
        throw new Error('Mismatched test response')
      setResult(value)
    } catch {
      if (current())
        setNotice('The condition test could not be confirmed. Verify current access and try again.')
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }
  return (
    <section
      className="space-y-4 rounded-sm border border-border p-4"
      aria-label="Rule condition test"
    >
      <h3 className="font-semibold">Test conditions</h3>
      <p>
        Enter test values below. This test does not fetch project measurements or create alerts,
        notifications, or decisions.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void test()
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          <legend className="sr-only">Test inputs</legend>
          <Label htmlFor="rule-test-date">Test reporting date (Asia/Manila)</Label>
          <Input
            id="rule-test-date"
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            value={reportingDate}
            required
            onChange={(event) => {
              change()
              setReportingDate(event.target.value)
            }}
          />
          {conditions.some((item) => item.metric.startsWith('PROJECT_')) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="test-start-date">Test project start date</Label>
                <Input
                  id="test-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    change()
                    setStartDate(event.target.value)
                  }}
                />
              </div>
              <div>
                <Label htmlFor="test-end-date">Test project end date</Label>
                <Input
                  id="test-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    change()
                    setEndDate(event.target.value)
                  }}
                />
              </div>
              <p className="text-sm">
                Timeline test dates model a planned, unarchived project. Blank dates are evaluated
                as unavailable.
              </p>
            </div>
          ) : null}
          {indicatorIds.map((id, index) => {
            const input = indicators[id]
            const update = (patch: Partial<IndicatorInput>) => {
              change()
              setIndicators((values) => ({ ...values, [id]: { ...values[id], ...patch } }))
            }
            return (
              <fieldset key={id} className="space-y-2 rounded-sm border border-border p-3">
                <legend>Indicator test inputs {index + 1}</legend>
                <p className="text-sm">
                  Used by conditions{' '}
                  {conditions
                    .filter((item) => item.indicatorId === id)
                    .map((item) => item.id)
                    .join(', ')}
                  .
                </p>
                <Label htmlFor={`test-current-${id}`}>Test current value</Label>
                <Input
                  id={`test-current-${id}`}
                  maxLength={20}
                  value={input.current}
                  onChange={(event) => update({ current: event.target.value })}
                />
                <Label htmlFor={`test-kind-${id}`}>Numeric domain</Label>
                <select
                  id={`test-kind-${id}`}
                  value={input.numericKind}
                  onChange={(event) => update({ numericKind: event.target.value as NumericKind })}
                >
                  {numericKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll('_', ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
                <Label htmlFor={`test-direction-${id}`}>Direction</Label>
                <select
                  id={`test-direction-${id}`}
                  value={input.direction}
                  onChange={(event) => update({ direction: event.target.value as MetricDirection })}
                >
                  {['DESCRIPTIVE', 'HIGHER_IS_BETTER', 'LOWER_IS_BETTER'].map((value) => (
                    <option value={value} key={value}>
                      {value.replaceAll('_', ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
                <Label htmlFor={`test-baseline-${id}`}>Test baseline</Label>
                <Input
                  id={`test-baseline-${id}`}
                  maxLength={20}
                  value={input.baseline}
                  onChange={(event) => update({ baseline: event.target.value })}
                />
                <Label htmlFor={`test-target-${id}`}>Test target</Label>
                <Input
                  id={`test-target-${id}`}
                  maxLength={20}
                  value={input.target}
                  onChange={(event) => update({ target: event.target.value })}
                />
                <p className="text-sm">
                  Blank current values remain unavailable. Progress requires baseline, target, and
                  direction.
                </p>
              </fieldset>
            )
          })}
          {conditions.some((item) => item.metric.startsWith('ACTIVITY_')) ? (
            <fieldset className="space-y-3">
              <legend>Test activity population</legend>
              <p className="text-sm">
                The rows below form the complete test population. An empty population is
                unavailable. Record-bound conditions use their corresponding row.
              </p>
              {activities.map((activity, index) => (
                <div key={activity.id} className="space-y-2 rounded-sm border border-border p-3">
                  <p>
                    Test activity {index + 1}
                    {boundActivityIds.includes(activity.id)
                      ? `; bound to ${conditions
                          .filter((item) => item.activityId === activity.id)
                          .map((item) => item.id)
                          .join(', ')}`
                      : ''}
                  </p>
                  <Label htmlFor={`test-status-${activity.id}`}>Test activity status</Label>
                  <select
                    id={`test-status-${activity.id}`}
                    value={activity.status}
                    onChange={(event) => {
                      change()
                      setActivities((values) =>
                        values.map((item) =>
                          item.id === activity.id
                            ? { ...item, status: event.target.value as ActivityInput['status'] }
                            : item,
                        ),
                      )
                    }}
                  >
                    {['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED'].map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll('_', ' ').toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <Label htmlFor={`test-due-${activity.id}`}>Test planned end date</Label>
                  <Input
                    id={`test-due-${activity.id}`}
                    type="date"
                    value={activity.plannedEndDate}
                    onChange={(event) => {
                      change()
                      setActivities((values) =>
                        values.map((item) =>
                          item.id === activity.id
                            ? { ...item, plannedEndDate: event.target.value }
                            : item,
                        ),
                      )
                    }}
                  />
                  {!boundActivityIds.includes(activity.id) ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        change()
                        setActivities((values) => values.filter((item) => item.id !== activity.id))
                      }}
                    >
                      Remove test activity {index + 1}
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={activities.length >= 1000}
                onClick={() => {
                  change()
                  setActivities((values) => [
                    ...values,
                    { id: crypto.randomUUID(), status: 'NOT_STARTED', plannedEndDate: '' },
                  ])
                }}
              >
                Add test activity
              </Button>
            </fieldset>
          ) : null}
        </fieldset>
        <Button type="submit" disabled={busy}>
          {busy ? 'Testing...' : 'Run condition test'}
        </Button>
      </form>
      {notice ? <output>{notice}</output> : null}
      {result ? (
        <div className="space-y-2">
          <h4 className="font-semibold">Test result: {result.result.toLowerCase()}</h4>
          <TestEvidence evidence={result.evidence} />
        </div>
      ) : null}
    </section>
  )
}
function TestEvidence({ evidence }: { evidence: DryEvidence }) {
  return 'kind' in evidence ? (
    <div className="space-y-2 border-l border-border pl-3">
      <p>
        {evidence.mode}: {evidence.result.toLowerCase()}
      </p>
      {evidence.children.map((child) => (
        <TestEvidence
          key={'kind' in child ? JSON.stringify(child) : child.condition.id}
          evidence={child}
        />
      ))}
    </div>
  ) : (
    <p>
      Condition {evidence.condition.id}: {evidence.result.toLowerCase()};{' '}
      {evidence.observation?.cell.value ?? evidence.observation?.cell.reason ?? 'no observation'}.
    </p>
  )
}
