'use client'

import { SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePermission } from '@/hooks/use-permission'
import { PathwaysClientError } from '@/lib/api/core/request'
import { rulesHumanClient } from '@/lib/api/rules'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { cn } from '@/lib/utils'
import {
  type HumanRule,
  type RuleCondition,
  type RuleNode,
  createRuleSchema,
  draftRuleSchema,
  parseRuleTree,
} from '@pathways/shared'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBindingChoices } from '../hooks/use-binding-choices'
import {
  type MetricScope,
  type Mode,
  type Rec,
  appendRec,
  appliesTo,
  availableMetrics,
  categoriesForScopes,
  clearRecordBindings,
  conditionSummary,
  newRec,
  newRow,
  previewSentence,
  recommendationPrefill,
  recordBound,
  suggestRuleCode,
  suggestSeverity,
  titleCase,
} from '../rules.utils'
import { ApplyToFields } from './apply-to-fields'
import { ConditionBuilder } from './condition-builder'
import { RecommendationFields } from './recommendation-fields'
import { RuleDrawerFooter } from './rule-drawer-footer'
import { RuleEditor } from './rule-editor'
import { LifecyclePrompt } from './rule-lifecycle-prompt'
import { RulePreview } from './rule-preview'
import { RuleStepCard } from './rule-step-card'
import { RuleTestWorkspace } from './rule-test-workspace'
import { SeverityField } from './severity-field'

export type DrawerIntent = 'test' | 'activate' | 'deactivate'
type Props = {
  mode: 'alert' | 'recommendation'
  rule?: HumanRule
  projectId: string | null
  projects: { id: string; title: string }[]
  intent?: DrawerIntent
  /** Recommendations already saved on rules in scope, offered for reuse in the builder. */
  library?: Rec[]
  /** The authorized organization-wide recommendation library is still loading. */
  libraryPending?: boolean
  /** Alert rules the current user may update, offered when adding recommendations. */
  alertLibrary?: HumanRule[]
  /** The authorized organization-wide alert library is still loading. */
  alertLibraryPending?: boolean
  /** Inline renders the builder in the page beside a sticky preview instead of a side panel. */
  inline?: boolean
  onClose: () => void
  onSaved: (scopeProjectId: string | null, outcome?: RuleOutcome) => void
}
export type RuleOutcome = 'created' | 'drafted' | 'activated' | 'deactivated'
/** Splits a stored tree into the flat rows the drawer edits, or null when it nests deeper. */
const flatten = (node: RuleNode): { mode: Mode; rows: RuleCondition[] } | null =>
  node.kind === 'CONDITION'
    ? { mode: 'AND', rows: [node] }
    : node.children.every((child) => child.kind === 'CONDITION')
      ? { mode: node.mode, rows: node.children as RuleCondition[] }
      : null

export function RuleDrawer(props: Props) {
  const { profile, access } = useCurrentRole()
  const { rule } = props
  const write = principalHasAtomicPermission(profile, rule ? 'rules.update' : 'rules.create')
  const owner = useSensitiveDraftOwner(
    profile,
    'rule-drawer',
    write ? (rule ? 'rules.update' : 'rules.create') : 'rules.read',
    rule ? rule.projectId : props.projectId,
    rule ? `${rule.id}:${rule.version}` : 'new',
    access === 'ready',
  )
  const title = rule
    ? 'Edit rule'
    : props.mode === 'alert'
      ? 'Create Alert Rule'
      : 'Create Recommendation Rule'
  if (props.inline)
    return owner ? (
      <RuleDrawerForm key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
    ) : (
      <output>Current rule access is required.</output>
    )
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SidePanel
        className={cn(
          '[&_h2]:font-semibold [&_h2]:uppercase',
          rule ? 'sm:w-[480px] sm:max-w-none' : 'sm:max-w-[480px]',
        )}
        containedScroll
        resizable={Boolean(rule)}
        resizeLabel="Resize edit rule panel"
        title={title}
        description="Rule outputs are rule-based and need human review; nothing is executed automatically."
      >
        {owner ? (
          <RuleDrawerForm key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
        ) : (
          <output>Current rule access is required.</output>
        )}
      </SidePanel>
    </Sheet>
  )
}

function RuleDrawerForm(props: Props & { owner: SensitiveDraftOwner }) {
  // A recommendation is a configured response on an alert rule, rather than a
  // standalone rule. New recommendation work therefore starts from an existing
  // alert and drafts that alert's next version without exposing its conditions
  // or severity in this focused flow.
  if (props.mode === 'recommendation' && !props.rule) return <RecommendationRuleDrawer {...props} />
  return <AlertRuleDrawer {...props} />
}

function RecommendationRuleDrawer({
  library,
  libraryPending,
  alertLibrary = [],
  alertLibraryPending = false,
  projects,
  inline,
  onClose,
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const { profile, access } = useCurrentRole()
  const has = usePermission()
  const [selectedAlert, setSelectedAlert] = useState<HumanRule | null>(null)
  // Recommendation text can be composed before an alert is selected. Choosing an
  // alert retains those local drafts and adds them to that alert's saved responses.
  const [recs, setRecs] = useState<Rec[]>([newRec()])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const sourceOwner = useSensitiveDraftOwner(
    profile,
    'rule-drawer-recommendation-source',
    'rules.update',
    selectedAlert?.projectId ?? null,
    selectedAlert ? `${selectedAlert.id}:${selectedAlert.version}` : 'unselected',
    access === 'ready',
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = () => mounted.current && owner.isCurrent() && sourceOwner?.isCurrent()
  const canWrite = has('rules.update')
  const availableAlerts = alertLibrary.filter((item) => item.status !== 'ARCHIVED')
  const projectNames = new Map(projects.map((project) => [project.id, project.title]))
  const projectLabel = (item: HumanRule) =>
    item.projectId
      ? (projectNames.get(item.projectId) ?? 'Project unavailable in your workspace')
      : 'Organization template'
  const choose = (item: HumanRule) => {
    const selectedSourceIds = new Set(selectedAlert?.recommendations.map((item) => item.id))
    const pending = recs.filter(
      (recommendation) =>
        !selectedSourceIds.has(recommendation.id) &&
        Boolean(recommendation.title.trim() || recommendation.text.trim()),
    )
    if (item.recommendations.length + pending.length > 10) {
      setNotice(
        'The selected alert already has too many recommendations to add these drafts. Choose another alert or remove a recommendation from it first.',
      )
      return
    }
    setSelectedAlert(item)
    setRecs([...item.recommendations.map((recommendation) => ({ ...recommendation })), ...pending])
    setLibraryOpen(false)
    setNotice('')
  }
  const addRecommendation = () => setRecs((current) => appendRec(current, newRec()))
  const save = async () => {
    if (!selectedAlert) return setNotice('Choose an existing alert first.')
    if (!sourceOwner || !isCurrent() || inFlight.current) return
    if (!recs.length || recs.some((item) => !item.title.trim() || !item.text.trim()))
      return setNotice('Add at least one recommendation, each with a title and suggested response.')
    const parsed = draftRuleSchema.safeParse({
      name: selectedAlert.name,
      severity: selectedAlert.severity,
      conditions: selectedAlert.conditions,
      recommendations: recs,
      expectedVersion: selectedAlert.version,
      clientOperationId: crypto.randomUUID(),
    })
    if (!parsed.success)
      return setNotice(parsed.error.issues[0]?.message ?? 'Review the recommendation fields.')
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      await rulesHumanClient.draftRule(selectedAlert.id, parsed.data)
      if (isCurrent()) onSaved(selectedAlert.projectId, 'drafted')
    } catch (error) {
      if (!isCurrent()) return
      setLocked(false)
      if (error instanceof PathwaysClientError && [400, 403, 404, 409].includes(error.status ?? 0))
        setNotice(
          error.message ||
            'The recommendation could not be saved. Refresh the selected alert and verify current access.',
        )
      else setNotice('A response was not confirmed. Retry the same operation.')
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  const builder = (
    <div className="space-y-6">
      <form
        className="space-y-6"
        id="rule-drawer-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset className="space-y-6" disabled={busy || locked || !canWrite}>
          <RuleStepCard
            step={1}
            title="Choose an existing alert"
            hint="Choose the alert whose recommendations you want to update. Its conditions and severity stay unchanged."
          >
            <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
              <p className="text-sm font-medium">Alert library</p>
              <p className="text-sm text-muted-foreground" id="alert-library-description">
                Choose an alert configuration to receive recommendations. Saving creates a new draft
                of that alert.
              </p>
              {selectedAlert ? (
                <output className="block rounded-md border border-border bg-card p-3">
                  <span className="block font-medium">{selectedAlert.name}</span>
                  <span className="mt-1 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>Project: {projectLabel(selectedAlert)}</span>
                    <span>Condition: {conditionSummary(selectedAlert.conditions)}</span>
                    <span>Severity: {titleCase(selectedAlert.severity)}</span>
                    <span>Status: {titleCase(selectedAlert.status)}</span>
                  </span>
                </output>
              ) : null}
              <Button
                aria-controls="alert-library-options"
                aria-describedby="alert-library-description"
                aria-expanded={libraryOpen}
                type="button"
                variant="outline"
                onClick={() => setLibraryOpen((open) => !open)}
              >
                {libraryOpen
                  ? 'Hide alert library'
                  : selectedAlert
                    ? 'Choose a different alert'
                    : 'Choose from alert library'}
              </Button>
              {libraryOpen ? (
                <div className="space-y-2" id="alert-library-options">
                  {alertLibraryPending ? (
                    <output className="block text-sm text-muted-foreground">
                      Loading alerts you can update in this organization.
                    </output>
                  ) : availableAlerts.length ? (
                    <ul className="space-y-2">
                      {availableAlerts.map((item) => (
                        <li
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
                          key={item.id}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{item.name}</span>
                            <span className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                              <span>Project: {projectLabel(item)}</span>
                              <span>Condition: {conditionSummary(item.conditions)}</span>
                              <span>Severity: {titleCase(item.severity)}</span>
                              <span>Status: {titleCase(item.status)}</span>
                            </span>
                          </span>
                          <Button type="button" variant="outline" onClick={() => choose(item)}>
                            Choose alert
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <output className="block text-sm text-muted-foreground">
                      No editable alerts are available in this organization yet. Create an alert
                      rule first.
                    </output>
                  )}
                </div>
              ) : null}
            </div>
          </RuleStepCard>
          <RuleStepCard
            step={2}
            title="What should the system recommend?"
            hint="Write the response the system retrieves when the selected alert matches. It is stored, not generated."
            action={
              <Button
                aria-label="Add recommendation"
                disabled={recs.length >= 10}
                size="icon"
                title="Add recommendation"
                type="button"
                variant="outline"
                onClick={addRecommendation}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          >
            <RecommendationFields
              hasRule={Boolean(selectedAlert)}
              hideAddButton
              library={library}
              libraryPending={libraryPending}
              onRecs={setRecs}
              recs={recs}
            />
            {!selectedAlert ? (
              <output className="block text-sm text-muted-foreground">
                Choose an alert before saving this recommendation.
              </output>
            ) : null}
          </RuleStepCard>
        </fieldset>
      </form>
      {notice ? (
        <p className="text-sm text-danger" role="alert">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-row-reverse flex-wrap justify-start gap-2 rounded-md border border-border bg-card p-3">
        {canWrite ? (
          <Button
            className="w-40"
            disabled={busy || locked || !selectedAlert}
            form="rule-drawer-form"
            type="submit"
          >
            {busy ? 'Saving...' : 'Save recommendation'}
          </Button>
        ) : null}
        {inline ? (
          <Button className="w-40" type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
  return builder
}

function AlertRuleDrawer({
  mode,
  rule,
  projectId,
  projects,
  intent,
  library,
  libraryPending,
  inline,
  onClose,
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const { profile, access } = useCurrentRole()
  const has = usePermission()
  const initial = rule ? flatten(rule.conditions) : { mode: 'AND' as Mode, rows: [] }
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(
    rule ? rule.projectId : projectId,
  )
  const [name, setName] = useState(rule?.name ?? '')
  const [code, setCode] = useState(rule?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(false)
  const [scopes, setScopes] = useState<MetricScope[]>(
    rule ? (appliesTo(rule) as MetricScope[]) : ['Project'],
  )
  const [matchMode, setMatchMode] = useState<Mode>(initial?.mode ?? 'AND')
  const [rows, setRows] = useState<RuleCondition[]>(
    initial?.rows.length ? initial.rows : [newRow(availableMetrics(['Project'])[0] ?? '')],
  )
  const [severity, setSeverity] = useState<HumanRule['severity']>(rule?.severity ?? 'MEDIUM')
  const [recs, setRecs] = useState<Rec[]>(
    rule?.recommendations.map((item) => ({ ...item })) ?? [
      {
        ...newRec(),
        ...recommendationPrefill({
          kind: 'GROUP',
          mode: initial?.mode ?? 'AND',
          children: initial?.rows.length
            ? initial.rows
            : [newRow(availableMetrics(['Project'])[0] ?? '')],
        }),
      },
    ],
  )
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [showTest, setShowTest] = useState(intent === 'test')
  const [confirm, setConfirm] = useState<'activate' | 'deactivate' | null>(
    intent === 'activate' || intent === 'deactivate' ? intent : null,
  )
  const [note, setNote] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const recommendationEdited = useRef(Boolean(rule))
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
  const scopeOwner = useSensitiveDraftOwner(
    profile,
    'rule-drawer-scope',
    rule ? 'rules.update' : 'rules.create',
    scopeProjectId,
    rule ? `${rule.id}:${rule.version}` : 'new',
    access === 'ready',
  )
  const nested = Boolean(rule && !initial)
  const canWrite = has(rule ? 'rules.update' : 'rules.create') && rule?.status !== 'ARCHIVED'
  const canActivate = Boolean(
    rule && rule.status === 'DRAFT' && rule.projectId !== null && has('rules.activate'),
  )
  const canDeactivate = Boolean(rule && rule.status === 'ACTIVE' && has('rules.update'))
  const metricOptions = availableMetrics(scopes).filter(
    (key) => scopeProjectId !== null || !recordBound(key),
  )
  const { indicators, activities } = useBindingChoices(scopeProjectId, rows)
  const tree: RuleNode = { kind: 'GROUP', mode: matchMode, children: rows }
  // A nested stored rule is read-only in this builder; its suggestion must inspect
  // the retained tree rather than the blank flat-row fallback shown for the advanced editor.
  const suggestedSeverity = suggestSeverity(nested && rule ? rule.conditions : tree)
  const suggestedRecommendation = recommendationPrefill(tree)
  const suggestedRecommendationTitle = suggestedRecommendation.title
  const suggestedRecommendationText = suggestedRecommendation.text
  const categories = categoriesForScopes(scopes)
  useEffect(() => {
    if (rule || recommendationEdited.current) return
    setRecs((current) =>
      current.length === 1
        ? [
            {
              ...(current[0] as Rec),
              title: suggestedRecommendationTitle,
              text: suggestedRecommendationText,
            },
          ]
        : current,
    )
  }, [rule, suggestedRecommendationText, suggestedRecommendationTitle])
  const changeName = (value: string) => {
    setName(value)
    if (!rule && !codeTouched) setCode(suggestRuleCode(value))
  }
  const addRecommendation = () => {
    recommendationEdited.current = true
    setRecs((current) => appendRec(current, newRec()))
  }
  const reconcileRows = (nextScopes: MetricScope[], nextProjectId: string | null) => {
    const permitted = availableMetrics(nextScopes).filter(
      (key) => nextProjectId !== null || !recordBound(key),
    )
    const nextRows = rows.flatMap((row) => {
      if (!permitted.includes(row.metric)) {
        return []
      }
      const projectChanged = nextProjectId !== scopeProjectId
      if ((nextProjectId === null || projectChanged) && (row.indicatorId || row.activityId)) {
        return [clearRecordBindings(row) as RuleCondition]
      }
      return [row]
    })
    if (!nextRows.length) nextRows.push(newRow(permitted[0] ?? ''))
    setRows(nextRows)
    setNotice('')
  }
  const toggleScope = (scope: MetricScope) => {
    if (scope === 'Indicator' && scopeProjectId === null) return
    const selected = scopes.includes(scope)
    if (selected && scopes.length === 1) {
      setNotice('Select at least one Applies To family.')
      return
    }
    const nextScopes = selected ? scopes.filter((item) => item !== scope) : [...scopes, scope]
    setScopes(nextScopes)
    reconcileRows(nextScopes, scopeProjectId)
  }
  const changeProject = (value: string) => {
    const nextProjectId = value || null
    if (nextProjectId === scopeProjectId) return
    let nextScopes = nextProjectId ? scopes : scopes.filter((scope) => scope !== 'Indicator')
    if (!nextScopes.length) nextScopes = ['Project']
    setScopeProjectId(nextProjectId)
    setScopes(nextScopes)
    reconcileRows(nextScopes, nextProjectId)
  }
  const fail = (error: unknown, fallback: string) => {
    if (!isCurrent()) return
    if (error instanceof PathwaysClientError && [400, 403, 404, 409].includes(error.status ?? 0)) {
      captured.current = null
      setLocked(false)
      // The server states which check refused the write; the fallback alone hides it.
      setNotice(error.message ? `${error.message} ${fallback}` : fallback)
    } else setNotice('A response was not confirmed. Retry the same operation.')
  }
  const run = async (task: () => Promise<unknown>, failure: string, outcome: RuleOutcome) => {
    if (!isCurrent() || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      await task()
      if (isCurrent()) {
        captured.current = null
        onSaved(scopeProjectId, outcome)
      }
    } catch (error) {
      fail(error, failure)
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  const save = async () => {
    if (!isCurrent() || inFlight.current) return
    if (!name.trim()) return setNotice('Enter a rule name.')
    if (!rule && !/^[A-Z][A-Z0-9_-]{1,79}$/.test(code))
      return setNotice('Enter a rule code using capital letters, numbers, underscores, or hyphens.')
    if (!scopes.length) return setNotice('Select at least one Applies To family.')
    if (!rows.length || rows.some((row) => !metricOptions.includes(row.metric)))
      return setNotice('Choose a metric available for the selected scope.')
    if (!scopeOwner) return setNotice('Current permission for the selected scope is required.')
    if (!captured.current) {
      if (!recs.length || recs.some((item) => !item.title.trim() || !item.text.trim()))
        return setNotice(
          'Add at least one recommendation, each with a title and suggested response.',
        )
      const content = {
        name,
        severity,
        recommendations: recs,
        clientOperationId: crypto.randomUUID(),
      }
      let conditions: RuleNode
      try {
        conditions = parseRuleTree(tree)
      } catch (error) {
        return setNotice(error instanceof Error ? error.message : 'Review the rule conditions.')
      }
      const parsed = rule
        ? draftRuleSchema.safeParse({ ...content, conditions, expectedVersion: rule.version })
        : createRuleSchema.safeParse({
            ...content,
            conditions,
            code,
            ...(scopeProjectId ? { projectId: scopeProjectId } : {}),
          })
      if (!parsed.success)
        return setNotice(parsed.error.issues[0]?.message ?? 'Review the rule fields.')
      captured.current = parsed.data
    }
    const body = captured.current
    await run(
      () =>
        rule && 'expectedVersion' in body
          ? rulesHumanClient.draftRule(rule.id, body)
          : rulesHumanClient.createRule(body as Parameters<typeof rulesHumanClient.createRule>[0]),
      'The rule could not be saved. Verify your access, project records, and current version before retrying.',
      rule ? 'drafted' : 'created',
    )
  }
  const lifecycle = async (action: 'activate' | 'deactivate') => {
    if (!rule) return
    if (action === 'deactivate' && !note.trim())
      return setNotice('A deactivation note is required.')
    setConfirm(null)
    const body = { expectedVersion: rule.version, clientOperationId: crypto.randomUUID() }
    await run(
      () =>
        action === 'activate'
          ? rulesHumanClient.activateRule(rule.id, body)
          : rulesHumanClient.archiveRule(rule.id, { ...body, note: note.trim() }),
      'This operation could not be completed. Refresh the rule and verify current access.',
      action === 'activate' ? 'activated' : 'deactivated',
    )
  }
  const preview = (
    <RulePreview
      condition={conditionSummary(tree)}
      mode={mode}
      name={name}
      recommendation={recs[0]}
      sentence={previewSentence({ name, severity, conditions: tree })}
      severity={severity}
    />
  )
  const builder = (
    <div className="space-y-6">
      <form
        className="space-y-6"
        id="rule-drawer-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset className="space-y-6" disabled={busy || locked || !canWrite}>
          <RuleStepCard
            step={1}
            title="Name and scope"
            hint="Name the rule, choose its project scope, then choose what it watches."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="drawer-rule-name">Rule Name</Label>
                <Input
                  id="drawer-rule-name"
                  maxLength={160}
                  value={name}
                  onChange={(event) => changeName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drawer-rule-code">Rule Code</Label>
                <Input
                  id="drawer-rule-code"
                  maxLength={80}
                  disabled={Boolean(rule)}
                  value={code}
                  onChange={(event) => {
                    setCodeTouched(true)
                    setCode(event.target.value.toUpperCase())
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium" data-testid="rule-category-label">
                Rule Categor{categories.length === 1 ? 'y' : 'ies'}:
              </span>
              <div className="flex flex-wrap gap-1.5" data-testid="rule-category">
                {categories.map((category) => (
                  <StatusBadge dot={false} key={category} tone="neutral">
                    {category}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <ApplyToFields
              locked={Boolean(rule)}
              onProject={changeProject}
              onToggle={toggleScope}
              projects={projects}
              scopeProjectId={scopeProjectId}
              scopes={scopes}
            />
          </RuleStepCard>
          <RuleStepCard
            step={2}
            title="What are you watching?"
            hint="Pick the metric to monitor, read its definition and example, then enter the threshold that flags it."
            action={
              !nested ? (
                <Button
                  aria-label="Add condition"
                  disabled={rows.length >= 32}
                  size="icon"
                  title="Add condition"
                  type="button"
                  variant="outline"
                  onClick={() => setRows((current) => [...current, newRow(metricOptions[0] ?? '')])}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : undefined
            }
          >
            <ConditionBuilder
              activities={activities}
              indicators={indicators}
              matchMode={matchMode}
              metricOptions={metricOptions}
              nestedRule={nested ? rule : undefined}
              onAdvanced={() => setAdvanced(true)}
              hideAddButton
              rows={rows}
              scopeProjectId={scopeProjectId}
              setMatchMode={setMatchMode}
              setRows={setRows}
            />
          </RuleStepCard>
          <RuleStepCard
            step={3}
            title="How should this read?"
            hint="Severity is the alert’s urgency. Choose it deliberately, or use the suggestion."
          >
            <SeverityField
              mode={mode}
              onSeverity={setSeverity}
              onUseSuggestion={() => {
                if (suggestedSeverity.status === 'SUGGESTED')
                  setSeverity(suggestedSeverity.severity)
              }}
              severity={severity}
              suggestion={suggestedSeverity}
            />
          </RuleStepCard>
          <RuleStepCard
            step={4}
            title="What should the system recommend?"
            hint="Write the response the system retrieves when this rule matches. It is stored, not generated."
            action={
              <Button
                aria-label="Add recommendation"
                disabled={recs.length >= 10}
                size="icon"
                title="Add recommendation"
                type="button"
                variant="outline"
                onClick={addRecommendation}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          >
            <RecommendationFields
              hasRule={Boolean(rule)}
              hideAddButton
              library={library}
              libraryPending={libraryPending}
              onRecs={setRecs}
              onUserEdit={() => {
                recommendationEdited.current = true
              }}
              recs={recs}
            />
          </RuleStepCard>
        </fieldset>
        {inline ? null : preview}
      </form>
      {showTest && rule ? (
        <RuleTestWorkspace key={`${rule.id}:${rule.version}`} rule={rule} />
      ) : null}
      {notice ? (
        <p className="text-sm text-danger" role="alert">
          {notice}
        </p>
      ) : null}
      <RuleDrawerFooter
        busy={busy}
        canActivate={canActivate}
        canDeactivate={canDeactivate}
        canWrite={canWrite}
        hasRule={Boolean(rule)}
        inline={inline}
        nested={nested}
        resizable={Boolean(rule) && !inline}
        onCancel={inline ? onClose : undefined}
        onConfirm={setConfirm}
        onTest={() => setShowTest((value) => !value)}
        showTest={showTest}
      />
      <LifecyclePrompt
        action={confirm}
        note={note}
        onConfirm={(action) => void lifecycle(action)}
        onNote={setNote}
        onCancel={() => setConfirm(null)}
      />
      {rule ? (
        <Dialog open={advanced} onOpenChange={setAdvanced}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Advanced rule editor</DialogTitle>
            </DialogHeader>
            <RuleEditor projectId={rule.projectId} original={rule} onSaved={onSaved} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
  if (!inline) return builder
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      {builder}
      <div className="lg:sticky lg:top-4">{preview}</div>
    </div>
  )
}
