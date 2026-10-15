'use client'

import { SidePanel } from '@/components/pathways'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { clearRecordBindings } from '@/features/analytics/rule-condition-editor'
import { RuleEditor } from '@/features/analytics/rule-editor'
import { RuleTestWorkspace } from '@/features/analytics/rule-test-workspace'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePermission } from '@/hooks/use-permission'
import { PathwaysClientError } from '@/lib/api/core/request'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import {
  type HumanRule,
  type RuleCondition,
  type RuleNode,
  createRuleSchema,
  draftRuleSchema,
  parseRuleTree,
} from '@pathways/shared'
import { useEffect, useRef, useState } from 'react'
import {
  type MetricScope,
  appliesTo,
  availableMetrics,
  categoryOf,
  conditionSummary,
  previewSentence,
  recommendationPrefill,
  suggestSeverity,
  suggestRuleCode,
} from './rule-board-model'
import { ApplyToFields, ConditionBuilder, useBindingChoices } from './rule-condition-rows'
import { RuleDrawerFooter } from './rule-drawer-footer'
import { type Mode, type Rec, newRec, newRow, recordBound } from './rule-drawer-shared'
import { LifecyclePrompt } from './rule-lifecycle-prompt'
import { RecommendationFields, RulePreview, SeverityField } from './rule-output-fields'
import { RuleStepCard } from './rule-step-card'

export type DrawerIntent = 'test' | 'activate' | 'deactivate'
type Props = {
  mode: 'alert' | 'recommendation'
  rule?: HumanRule
  projectId: string | null
  projects: { id: string; title: string }[]
  intent?: DrawerIntent
  /** Recommendations already saved on rules in scope, offered for reuse in the builder. */
  library?: Rec[]
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
      <OwnedDrawer key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
    ) : (
      <output>Current rule access is required.</output>
    )
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SidePanel
        className="sm:max-w-[480px] [&_h2]:font-semibold [&_h2]:uppercase"
        containedScroll
        title={title}
        description="Rule outputs are rule-based and need human review; nothing is executed automatically."
      >
        {owner ? (
          <OwnedDrawer key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
        ) : (
          <output>Current rule access is required.</output>
        )}
      </SidePanel>
    </Sheet>
  )
}

function OwnedDrawer({
  mode,
  rule,
  projectId,
  projects,
  intent,
  library,
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
  const suggestedSeverity = suggestSeverity(tree)
  const suggestedRecommendation = recommendationPrefill(tree)
  const category = rows[0] ? categoryOf(rows[0].metric) : null
  useEffect(() => {
    if (rule || recommendationEdited.current) return
    setRecs((current) =>
      current.length === 1
        ? [{ ...(current[0] as Rec), ...suggestedRecommendation }]
        : current,
    )
  }, [rule, suggestedRecommendation.text, suggestedRecommendation.title])
  const changeName = (value: string) => {
    setName(value)
    if (!rule && !codeTouched) setCode(suggestRuleCode(value))
  }
  const reconcileRows = (
    nextScopes: MetricScope[],
    nextProjectId: string | null,
    cause: 'scope changed' | 'Applies To changed',
  ) => {
    const permitted = availableMetrics(nextScopes).filter(
      (key) => nextProjectId !== null || !recordBound(key),
    )
    let clearedConditions = 0
    let clearedBindings = 0
    const nextRows = rows.flatMap((row) => {
      if (!permitted.includes(row.metric)) {
        clearedConditions += 1
        if (row.indicatorId || row.activityId) clearedBindings += 1
        return []
      }
      const projectChanged = nextProjectId !== scopeProjectId
      if ((nextProjectId === null || projectChanged) && (row.indicatorId || row.activityId)) {
        clearedBindings += 1
        return [clearRecordBindings(row) as RuleCondition]
      }
      return [row]
    })
    if (!nextRows.length) nextRows.push(newRow(permitted[0] ?? ''))
    setRows(nextRows)
    const cleared = [
      clearedConditions ? `${clearedConditions} incompatible condition${clearedConditions === 1 ? '' : 's'}` : '',
      clearedBindings ? `${clearedBindings} record binding${clearedBindings === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    if (cleared.length) setNotice(`Cleared ${cleared.join(' and ')} because ${cause}.`)
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
    reconcileRows(nextScopes, scopeProjectId, 'Applies To changed')
  }
  const changeProject = (value: string) => {
    const nextProjectId = value || null
    if (nextProjectId === scopeProjectId) return
    let nextScopes = nextProjectId ? scopes : scopes.filter((scope) => scope !== 'Indicator')
    if (!nextScopes.length) nextScopes = ['Project']
    setScopeProjectId(nextProjectId)
    setScopes(nextScopes)
    reconcileRows(nextScopes, nextProjectId, 'scope changed')
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
            hint="Name the rule and choose the projects it watches."
          >
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Rule Category</p>
              <p className="text-sm text-muted-foreground" data-testid="rule-category">
                {category ?? 'Derived from the first metric'}
              </p>
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
            hint="Pick the metric to monitor and the threshold that flags it."
          >
            <ConditionBuilder
              activities={activities}
              indicators={indicators}
              matchMode={matchMode}
              metricOptions={metricOptions}
              nestedRule={nested ? rule : undefined}
              onAdvanced={() => setAdvanced(true)}
              rows={rows}
              scopeProjectId={scopeProjectId}
              setMatchMode={setMatchMode}
              setRows={setRows}
            />
          </RuleStepCard>
          <RuleStepCard
            step={3}
            title="How should this read?"
            hint="Severity sets how the output is read, from a progress milestone to an urgent risk."
          >
            <SeverityField
              mode={mode}
              onSeverity={setSeverity}
              onUseSuggestion={() => setSeverity(suggestedSeverity.severity)}
              severity={severity}
              suggestion={suggestedSeverity}
            />
          </RuleStepCard>
          <RuleStepCard
            step={4}
            title="What should the system recommend?"
            hint="Write the response the system retrieves when this rule matches. It is stored, not generated."
          >
            <RecommendationFields
              hasRule={Boolean(rule)}
              library={library}
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
