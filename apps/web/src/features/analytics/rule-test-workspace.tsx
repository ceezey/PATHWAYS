'use client'
import { StatusBadge } from '@/components/pathways'
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
import { cn } from '@/lib/utils'
import {
  type MetricDirection,
  type NumericKind,
  businessCalendarDate,
  decimalString,
  numericKinds,
  numericMetric,
  scaledDecimal,
} from '@pathways/shared'
import { useEffect, useRef, useState } from 'react'
import { conditionSentence, titleCase, unitOf } from '../rules-board/rule-board-model'
import { selectClass } from '../rules-board/rule-drawer-shared'
import {
  activityObservation,
  beneficiaryFollowUpObservation,
  budgetObservation,
  indicatorObservation,
  surveyImprovementObservation,
  timelineObservation,
} from './rule-test-metrics'
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
const aggregateFields = [
  ['budgetPlanned', 'Test planned budget total', 'BUDGET_UTILIZATION_PERCENT'],
  ['budgetApproved', 'Test approved expense total', 'BUDGET_UTILIZATION_PERCENT'],
  [
    'followUpPopulation',
    'Test active enrollments with participation',
    'BENEFICIARY_FOLLOW_UP_PERCENT',
  ],
  ['followUpCount', 'Test enrollments needing follow-up', 'BENEFICIARY_FOLLOW_UP_PERCENT'],
  ['surveyPairs', 'Test complete pre and post pairs', 'SURVEY_MEAN_IMPROVEMENT_POINTS'],
  ['surveyMean', 'Test mean improvement in points', 'SURVEY_MEAN_IMPROVEMENT_POINTS'],
] as const
type AggregateKey = (typeof aggregateFields)[number][0]
const collect = (node: RuleNode): RuleCondition[] =>
  node.kind === 'CONDITION' ? [node] : node.children.flatMap(collect)
type DryResult = DryEvidence['result']
// Plain-language outcome and badge tone for each dry-run result.
const outcome: Record<DryResult, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  TRUE: { label: 'Triggered', tone: 'warning' },
  FALSE: { label: 'Not triggered', tone: 'success' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'neutral' },
}
// Conditions are named by their position in the rule instead of their internal ID.
const conditionNames = (conditions: RuleCondition[], ids: string[]) =>
  ids.map((id) => `Condition ${conditions.findIndex((item) => item.id === id) + 1}`).join(', ')
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
  const [aggregates, setAggregates] = useState<Record<AggregateKey, string>>({
    budgetPlanned: '',
    budgetApproved: '',
    followUpPopulation: '',
    followUpCount: '',
    surveyPairs: '',
    surveyMean: '',
  })
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
        const open = {
          scope,
          conditionId: condition.id,
          asOf,
          projectStatus: 'PLANNED',
          projectArchived: false,
          revision,
        }
        const whole = (value: string) => Number(value || '0')
        if (condition.metric === 'BUDGET_UTILIZATION_PERCENT')
          return budgetObservation({
            ...open,
            recordCount: aggregates.budgetPlanned ? 1 : 0,
            currencyCount: 1,
            plannedTotal: aggregates.budgetPlanned || '0',
            approvedExpenseTotal: aggregates.budgetApproved || '0',
          })
        if (condition.metric === 'BENEFICIARY_FOLLOW_UP_PERCENT')
          return beneficiaryFollowUpObservation({
            ...open,
            population: whole(aggregates.followUpPopulation),
            followUp: whole(aggregates.followUpCount),
          })
        if (condition.metric === 'SURVEY_MEAN_IMPROVEMENT_POINTS') {
          const pairCount = whole(aggregates.surveyPairs)
          return surveyImprovementObservation({
            ...open,
            pairCount,
            differenceSum: decimalString(
              scaledDecimal(aggregates.surveyMean || '0') * BigInt(pairCount),
            ),
          })
        }
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
      className="space-y-4 rounded-xl border border-border bg-surface-subtle p-4"
      aria-label="Rule condition test"
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">Test conditions</h3>
        <p className="text-sm text-muted-foreground">
          Enter test values below. This test does not fetch project measurements or create alerts,
          notifications, or decisions.
        </p>
      </div>
      <ol className="space-y-1 text-sm">
        {conditions.map((condition, index) => (
          <li key={condition.id}>
            <span className="font-semibold text-foreground">Condition {index + 1}</span>
            <span className="text-muted-foreground"> · {conditionSentence(condition)}</span>
          </li>
        ))}
      </ol>
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
          {aggregateFields
            .filter(([, , metric]) => conditions.some((item) => item.metric === metric))
            .map(([key, text]) => (
              <div key={key}>
                <Label htmlFor={`test-${key}`}>{text}</Label>
                <Input
                  id={`test-${key}`}
                  maxLength={20}
                  value={aggregates[key]}
                  onChange={(event) => {
                    change()
                    setAggregates((values) => ({ ...values, [key]: event.target.value }))
                  }}
                />
              </div>
            ))}
          {indicatorIds.map((id, index) => {
            const input = indicators[id]
            const update = (patch: Partial<IndicatorInput>) => {
              change()
              setIndicators((values) => ({ ...values, [id]: { ...values[id], ...patch } }))
            }
            return (
              <fieldset key={id} className="space-y-2 rounded-sm border border-border p-3">
                <legend>Indicator test inputs {index + 1}</legend>
                <p className="text-sm text-muted-foreground">
                  Used by{' '}
                  {conditionNames(
                    conditions,
                    conditions.filter((item) => item.indicatorId === id).map((item) => item.id),
                  )}
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
                  className={selectClass}
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
                  className={selectClass}
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
                      ? ` · bound to ${conditionNames(
                          conditions,
                          conditions
                            .filter((item) => item.activityId === activity.id)
                            .map((item) => item.id),
                        )}`
                      : ''}
                  </p>
                  <Label htmlFor={`test-status-${activity.id}`}>Test activity status</Label>
                  <select
                    className={selectClass}
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
      {notice ? <output className="block text-sm text-danger">{notice}</output> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-foreground">Test result</h4>
            <StatusBadge tone={outcome[result.result].tone}>
              {outcome[result.result].label}
            </StatusBadge>
          </div>
          <TestEvidence conditions={conditions} evidence={result.evidence} />
        </div>
      ) : null}
    </section>
  )
}
function TestEvidence({
  conditions,
  evidence,
}: { conditions: RuleCondition[]; evidence: DryEvidence }) {
  if ('kind' in evidence)
    return (
      <div className="space-y-2">
        {evidence.children.length > 1 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {evidence.mode === 'AND' ? 'All conditions must match' : 'Any condition can match'}
            <StatusBadge tone={outcome[evidence.result].tone}>
              {outcome[evidence.result].label}
            </StatusBadge>
          </p>
        ) : null}
        <div className={cn('space-y-2', evidence.children.length > 1 && 'border-l-2 pl-3')}>
          {evidence.children.map((child) => (
            <TestEvidence
              conditions={conditions}
              evidence={child}
              key={'kind' in child ? JSON.stringify(child) : child.condition.id}
            />
          ))}
        </div>
      </div>
    )
  const index = conditions.findIndex((item) => item.id === evidence.condition.id)
  const unit = unitOf(evidence.condition.metric)
  const cell = evidence.observation?.cell
  const observed = cell?.value
    ? `${cell.value}${unit === '%' ? '%' : unit === 'value' ? '' : ` ${unit}`}`
    : cell?.reason
      ? titleCase(cell.reason)
      : 'No observation'
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface-subtle p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {index >= 0 ? `Condition ${index + 1}` : 'Condition'}
        </p>
        <p className="text-sm text-muted-foreground">{conditionSentence(evidence.condition)}</p>
        <p className="text-sm text-foreground">
          Observed: <span className="font-semibold tabular-nums">{observed}</span>
        </p>
      </div>
      <StatusBadge tone={outcome[evidence.result].tone}>
        {outcome[evidence.result].label}
      </StatusBadge>
    </div>
  )
}
