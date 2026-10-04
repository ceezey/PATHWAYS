'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UNFINISHED_CONTROLS_UI_ENABLED } from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useId, useRef, useState } from 'react'
import {
  RuleConditionEditor,
  clearRecordBindings,
  leafCount,
  newCondition,
} from './rule-condition-editor'
import { type HumanRule, createRuleSchema, draftRuleSchema } from './rules-human-contract'
import { parseRuleTree, ruleMetrics } from './rules-validation'
import type { RuleCondition, RuleNode } from './rules-validation'

type Props = {
  projectId: string | null
  original?: HumanRule
  template?: HumanRule
  onSaved: (scopeProjectId: string | null) => void
}
const requires = (node: RuleNode, prefix: string): boolean =>
  node.kind === 'GROUP'
    ? node.children.some((child) => requires(child, prefix))
    : node.metric.startsWith(prefix)
const recordBoundMetrics = ruleMetrics.filter(
  (metric) => metric.startsWith('INDICATOR_') || metric === 'ACTIVITY_OVERDUE_DAYS',
)
const projectFreeMetrics = ruleMetrics.filter((metric) => !recordBoundMetrics.includes(metric))
const metricLabel = (metric: string) => metric.replaceAll('_', ' ').toLowerCase()
/** First record-bound condition metric found in the tree, for a condition-specific error. */
const findRecordBoundLeaf = (node: RuleNode): RuleCondition | null =>
  node.kind === 'GROUP'
    ? (node.children.map(findRecordBoundLeaf).find(Boolean) ?? null)
    : recordBoundMetrics.includes(node.metric)
      ? node
      : null

type RuleTemplateSpec = {
  key: string
  name: string
  available: boolean
  unavailableReason?: string
  build?: () => {
    name: string
    code: string
    severity: HumanRule['severity']
    conditions: RuleNode
    recommendations: { id: string; title: string; text: string }[]
  }
}
export const ruleTemplates: RuleTemplateSpec[] = [
  {
    key: 'OPERATIONS_BOTTLENECK',
    name: 'Operations Bottleneck',
    available: true,
    build: () => ({
      name: 'Operations Bottleneck',
      code: 'OPERATIONS_BOTTLENECK',
      severity: 'HIGH',
      conditions: {
        kind: 'GROUP',
        mode: 'AND',
        children: [
          {
            kind: 'CONDITION',
            id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
            metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT',
            operator: 'GT',
            threshold: '50',
          },
          {
            kind: 'CONDITION',
            id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
            metric: 'ACTIVITY_COMPLETION_PERCENT',
            operator: 'LT',
            threshold: '40',
          },
        ],
      },
      recommendations: [
        {
          id: crypto.randomUUID(),
          title: 'Review activity schedule',
          text: 'Review dependencies in the activity schedule. Consider allocating additional field staff or adjusting milestone dates.',
        },
      ],
    }),
  },
  {
    key: 'FINANCIAL_EFFICIENCY_RISK',
    name: 'Financial Efficiency Risk',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
  {
    key: 'BUDGET_UNDER_UTILIZATION',
    name: 'Budget Under-utilization',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
  {
    key: 'IDEAL_VECTOR',
    name: 'Ideal Vector',
    available: false,
    unavailableReason: 'Requires a rule template that is not yet available',
  },
]

export function RuleEditor(props: Props) {
  const { profile, access } = useCurrentRole()
  const initialScopeProjectId = props.original ? props.original.projectId : props.projectId
  const owner = useSensitiveDraftOwner(
    profile,
    'rule-editor',
    props.original ? 'rules.update' : 'rules.create',
    initialScopeProjectId,
    props.original
      ? `${props.original.id}:${props.original.version}`
      : `new:${props.template?.id ?? ''}:${props.template?.version ?? ''}`,
    access === 'ready',
  )
  if (!owner) return <output>Current rule authoring access is required.</output>
  return <OwnedRuleEditor key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
}

function OwnedRuleEditor({
  projectId,
  original,
  template,
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const initial = original ?? template
  const { profile, access } = useCurrentRole()
  const [step, setStep] = useState<1 | 2>(1)
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(
    original ? original.projectId : projectId,
  )
  // Re-checked whenever the selected scope changes, independent of the mount-time owner,
  // so eligibility always reflects the scope that will actually be submitted.
  const scopeOwner = useSensitiveDraftOwner(
    profile,
    'rule-editor-scope',
    original ? 'rules.update' : 'rules.create',
    scopeProjectId,
    original
      ? `${original.id}:${original.version}`
      : `new:${template?.id ?? ''}:${template?.version ?? ''}`,
    access === 'ready',
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(original?.code ?? '')
  const [severity, setSeverity] = useState<HumanRule['severity']>(initial?.severity ?? 'LOW')
  const [conditions, setConditions] = useState<RuleNode>(
    initial?.conditions ?? { kind: 'GROUP', mode: 'AND', children: [newCondition()] },
  )
  const [recommendations, setRecommendations] = useState(
    initial?.recommendations.map((item) => ({
      ...item,
      id: original ? item.id : crypto.randomUUID(),
    })) ?? [{ id: crypto.randomUUID(), title: '', text: '' }],
  )
  const [stepError, setStepError] = useState('')
  const [stepErrorField, setStepErrorField] = useState<string | null>(null)
  const [scopeNotice, setScopeNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const stepErrorId = useId()
  const appliesToHelpId = useId()
  const step1HeadingRef = useRef<HTMLHeadingElement>(null)
  const step2HeadingRef = useRef<HTMLHeadingElement>(null)
  const stepFocusPending = useRef(false)
  useEffect(() => {
    if (!stepFocusPending.current) return
    stepFocusPending.current = false
    const heading = step === 1 ? step1HeadingRef.current : step2HeadingRef.current
    heading?.focus()
  }, [step])
  const captured = useRef<
    | Parameters<typeof rulesHumanClient.createRule>[0]
    | Parameters<typeof rulesHumanClient.draftRule>[1]
    | null
  >(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = () => mounted.current && owner.isCurrent()
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadActivityContext = principalHasAtomicPermission(profile, 'activities.context.read')
  const projects = useAuthorizedRead('rules-editor-projects', null, 'projects.read', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const indicators = useAuthorizedRead(
    'rule-binding-indicators',
    scopeProjectId,
    'indicators.read',
    (signal) => pathwaysClient.getProjectIndicators(scopeProjectId ?? '', signal),
    Boolean(scopeProjectId && requires(conditions, 'INDICATOR_')),
  )
  const activitiesFull = useAuthorizedRead(
    'rule-binding-activities',
    scopeProjectId,
    'activities.read',
    (signal) => pathwaysClient.getActivities(scopeProjectId ?? '', signal),
    Boolean(scopeProjectId && requires(conditions, 'ACTIVITY_OVERDUE_DAYS') && canReadActivities),
  )
  const activitiesContext = useAuthorizedRead(
    'rule-binding-activities-context',
    scopeProjectId,
    'activities.context.read',
    (signal) => pathwaysClient.getActivityContext(scopeProjectId ?? '', signal),
    Boolean(
      scopeProjectId &&
        requires(conditions, 'ACTIVITY_OVERDUE_DAYS') &&
        !canReadActivities &&
        canReadActivityContext,
    ),
  )
  const activityChoices = canReadActivities
    ? (activitiesFull.data ?? [])
    : canReadActivityContext
      ? (activitiesContext.data ?? [])
      : []
  const availableMetrics = scopeProjectId ? ruleMetrics : projectFreeMetrics
  const scopeProjectMissing = Boolean(
    scopeProjectId && !projects.data?.some((project) => project.id === scopeProjectId),
  )
  const scopeProjectMissingLabel = !scopeProjectMissing
    ? null
    : projects.isLoading
      ? 'Current project (loading project choices...)'
      : projects.isError
        ? 'Current project (project choices unavailable)'
        : 'Current project (not in your project list)'
  const applyTemplate = (spec: RuleTemplateSpec) => {
    if (!spec.available || !spec.build) return
    const built = spec.build()
    setName(built.name)
    setCode((current) => (original ? current : built.code))
    setSeverity(built.severity)
    setConditions(built.conditions)
    setRecommendations(built.recommendations)
    setStepError('')
  }
  const onScopeProjectChange = (value: string) => {
    const next = value || null
    setScopeProjectId(next)
    setConditions((node) => clearRecordBindings(node))
    setScopeNotice(
      'Project changed. Indicator and activity selections in conditions were cleared because those records belong to a specific project.',
    )
  }
  const validateStepOne = (): boolean => {
    if (!name.trim()) {
      setStepError('Enter a rule name.')
      setStepErrorField('rule-name')
      return false
    }
    if (!original && !/^[A-Z][A-Z0-9_-]{1,79}$/.test(code)) {
      setStepError('Enter a rule code using capital letters, numbers, underscores, or hyphens.')
      setStepErrorField('rule-code')
      return false
    }
    if (template && !scopeProjectId) {
      setStepError(
        'Copied rules must apply to a project. Choose a project for Applies to before continuing.',
      )
      setStepErrorField('rule-applies-to')
      return false
    }
    if (!scopeProjectId) {
      const offending = findRecordBoundLeaf(conditions)
      if (offending) {
        setStepError(
          `The condition using "${metricLabel(offending.metric)}" requires a project scope; organization templates cannot bind indicator or activity records.`,
        )
        setStepErrorField('rule-applies-to')
        return false
      }
    }
    try {
      parseRuleTree(conditions)
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Review the rule conditions.')
      setStepErrorField(null)
      return false
    }
    setStepError('')
    setStepErrorField(null)
    return true
  }
  const goNext = () => {
    if (validateStepOne()) {
      stepFocusPending.current = true
      setStep(2)
    }
  }
  const goBack = () => {
    stepFocusPending.current = true
    setStep(1)
  }
  const submit = async () => {
    if (!isCurrent() || inFlight.current) return
    if (!validateStepOne()) {
      stepFocusPending.current = true
      setStep(1)
      return
    }
    if (!scopeOwner) {
      setStepError('Current permission for the selected Applies to scope is required.')
      setStepErrorField('rule-applies-to')
      stepFocusPending.current = true
      setStep(1)
      return
    }
    if (!captured.current) {
      const content = {
        name,
        severity,
        conditions,
        recommendations,
        clientOperationId: crypto.randomUUID(),
      }
      const parsed = original
        ? draftRuleSchema.safeParse({ ...content, expectedVersion: original.version })
        : createRuleSchema.safeParse({
            ...content,
            code,
            ...(scopeProjectId ? { projectId: scopeProjectId } : {}),
            ...(template ? { templateId: template.id } : {}),
          })
      if (!parsed.success) {
        setNotice(parsed.error.issues[0]?.message ?? 'Review the rule fields.')
        return
      }
      captured.current = parsed.data
    }
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      if (original && 'expectedVersion' in captured.current)
        await rulesHumanClient.draftRule(original.id, captured.current)
      else if ('code' in captured.current) await rulesHumanClient.createRule(captured.current)
      if (isCurrent()) {
        captured.current = null
        onSaved(scopeProjectId)
      }
    } catch (error) {
      if (!isCurrent()) return
      if (
        error instanceof PathwaysClientError &&
        [400, 403, 404, 409].includes(error.status ?? 0)
      ) {
        captured.current = null
        setLocked(false)
        setNotice(
          'The rule could not be saved. Verify your access, project records, and current version before retrying.',
        )
      } else
        setNotice(
          'A save response was not confirmed. Retry the same saved request before changing its content.',
        )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (step === 1) goNext()
        else void submit()
      }}
    >
      <output id={stepErrorId} className="block text-sm" aria-live="polite">
        {stepError}
      </output>
      {step === 1 ? (
        <div className="space-y-4">
          <h2
            ref={step1HeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Step 1 of 2: Rule
          </h2>
          <div className="space-y-2">
            <Label htmlFor="rule-applies-to">Applies to</Label>
            <select
              id="rule-applies-to"
              className="h-11 w-full rounded-sm border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={scopeProjectId ?? ''}
              disabled={
                busy ||
                locked ||
                Boolean(original) ||
                (Boolean(scopeProjectId) && (projects.isLoading || projects.isError))
              }
              aria-invalid={stepErrorField === 'rule-applies-to' || undefined}
              aria-describedby={
                [
                  stepErrorField === 'rule-applies-to' ? stepErrorId : null,
                  original ? appliesToHelpId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={(event) => onScopeProjectChange(event.target.value)}
            >
              {scopeProjectMissingLabel ? (
                <option value={scopeProjectId ?? ''} disabled>
                  {scopeProjectMissingLabel}
                </option>
              ) : null}
              {template ? (
                <option value="">Choose a project</option>
              ) : (
                <option value="">Organization template (no project)</option>
              )}
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            {original ? (
              <p id={appliesToHelpId} className="text-sm text-muted-foreground">
                Scope is fixed for existing rules.
              </p>
            ) : null}
            {projects.isError ? (
              <Button type="button" variant="outline" onClick={() => void projects.refetch()}>
                Retry project choices
              </Button>
            ) : null}
            {!scopeProjectId && template ? (
              <p className="text-sm text-muted-foreground">
                Choose the project this copy will apply to.
              </p>
            ) : !scopeProjectId ? (
              <p className="text-sm text-muted-foreground">
                Organization templates cannot bind to a specific indicator or activity record. Copy
                this template into a project to use record-bound metrics.
              </p>
            ) : null}
            {scopeNotice ? (
              <output className="block text-sm" aria-live="polite">
                {scopeNotice}
              </output>
            ) : null}
          </div>
          {!original && !template ? (
            <div className="space-y-2 rounded-sm border border-border p-3">
              <p className="font-semibold">Start from template</p>
              <ul className="space-y-2">
                {ruleTemplates
                  .filter((spec) => spec.available || UNFINISHED_CONTROLS_UI_ENABLED)
                  .map((spec) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2"
                      key={spec.key}
                    >
                      <span>{spec.name}</span>
                      {spec.available ? (
                        <Button type="button" variant="outline" onClick={() => applyTemplate(spec)}>
                          Apply {spec.name}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {spec.unavailableReason}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy || locked}>
            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input
                id="rule-name"
                value={name}
                required
                maxLength={160}
                aria-invalid={stepErrorField === 'rule-name' || undefined}
                aria-describedby={stepErrorField === 'rule-name' ? stepErrorId : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-code">Rule code</Label>
              <Input
                id="rule-code"
                value={code}
                disabled={Boolean(original)}
                required={!original}
                maxLength={80}
                aria-invalid={stepErrorField === 'rule-code' || undefined}
                aria-describedby={stepErrorField === 'rule-code' ? stepErrorId : undefined}
                onChange={(event) => setCode(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Use capital letters, numbers, underscores, or hyphens.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-severity">Severity</Label>
              <select
                className="h-11 w-full rounded-sm border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                id="rule-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as HumanRule['severity'])}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Use up to 32 conditions in four levels of groups. Thresholds retain their entered
            decimal precision.
          </p>
          <RuleConditionEditor
            node={conditions}
            onChange={setConditions}
            disabled={busy || locked}
            remainingLeaves={32 - leafCount(conditions)}
            indicators={indicators.data?.map((item) => ({ id: item.id, name: item.name })) ?? []}
            activities={activityChoices.map((item) => ({ id: item.id, name: item.title }))}
            metrics={availableMetrics}
          />
          {requires(conditions, 'INDICATOR_') || requires(conditions, 'ACTIVITY_OVERDUE_DAYS') ? (
            <div className="space-y-2 text-sm">
              <p>
                Record-bound metrics require a project scope and current permission to read its
                records.
              </p>
              {indicators.isError ? (
                <Button onClick={() => void indicators.refetch()} type="button" variant="outline">
                  Retry indicator choices
                </Button>
              ) : null}
              {activitiesFull.isError ? (
                <Button
                  onClick={() => void activitiesFull.refetch()}
                  type="button"
                  variant="outline"
                >
                  Retry activity choices
                </Button>
              ) : null}
              {activitiesContext.isError ? (
                <Button
                  onClick={() => void activitiesContext.refetch()}
                  type="button"
                  variant="outline"
                >
                  Retry activity choices
                </Button>
              ) : null}
              {scopeProjectId &&
              ((!principalHasAtomicPermission(profile, 'indicators.read') &&
                requires(conditions, 'INDICATOR_')) ||
                (!canReadActivities &&
                  !canReadActivityContext &&
                  requires(conditions, 'ACTIVITY_OVERDUE_DAYS'))) ? (
                <p>Current permission for the selected record type is required.</p>
              ) : null}
            </div>
          ) : null}
          <Button type="button" onClick={goNext} disabled={busy || locked}>
            Next: Recommendations
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2
            ref={step2HeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Step 2 of 2: Recommendations
          </h2>
          <fieldset className="space-y-4" disabled={busy || locked}>
            <legend className="font-semibold">Predefined recommendations</legend>
            {recommendations.map((recommendation, index) => (
              <div
                className="space-y-2 rounded-sm border border-border p-3"
                key={recommendation.id}
              >
                <Label htmlFor={`recommendation-title-${recommendation.id}`}>
                  Recommendation {index + 1} title
                </Label>
                <Input
                  id={`recommendation-title-${recommendation.id}`}
                  maxLength={160}
                  required
                  value={recommendation.title}
                  onChange={(event) =>
                    setRecommendations((values) =>
                      values.map((value) =>
                        value.id === recommendation.id
                          ? { ...value, title: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
                <Label htmlFor={`recommendation-text-${recommendation.id}`}>
                  Recommendation text
                </Label>
                <Textarea
                  id={`recommendation-text-${recommendation.id}`}
                  maxLength={2000}
                  required
                  value={recommendation.text}
                  onChange={(event) =>
                    setRecommendations((values) =>
                      values.map((value) =>
                        value.id === recommendation.id
                          ? { ...value, text: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
                {recommendations.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setRecommendations((values) =>
                        values.filter((value) => value.id !== recommendation.id),
                      )
                    }
                  >
                    Remove recommendation {index + 1}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={recommendations.length >= 10 || busy || locked}
              onClick={() =>
                setRecommendations((values) => [
                  ...values,
                  { id: crypto.randomUUID(), title: '', text: '' },
                ])
              }
            >
              Add recommendation
            </Button>
          </fieldset>
          {notice ? (
            <output className="block text-sm" aria-live="polite">
              {notice}
            </output>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={goBack} disabled={busy}>
              Back
            </Button>
            <Button disabled={busy} type="submit">
              {busy
                ? 'Saving...'
                : locked
                  ? 'Retry same save'
                  : original
                    ? 'Save draft'
                    : 'Create draft'}
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}
