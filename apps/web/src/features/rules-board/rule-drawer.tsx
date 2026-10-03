'use client'

import { ConfirmationDialog, SidePanel, UnavailableHint } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { RuleTreeView, clearRecordBindings } from '@/features/analytics/rule-condition-editor'
import { RuleEditor } from '@/features/analytics/rule-editor'
import { RuleTestWorkspace } from '@/features/analytics/rule-test-workspace'
import {
  type HumanRule,
  createRuleSchema,
  draftRuleSchema,
} from '@/features/analytics/rules-human-contract'
import {
  type RuleCondition,
  type RuleNode,
  operators,
  parseRuleTree,
} from '@/features/analytics/rules-validation'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { cn } from '@/lib/utils'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import {
  type MetricScope,
  SCOPES,
  appliesTo,
  availableMetrics,
  categoryOf,
  metricLabel,
  operatorWords,
  previewSentence,
  suggestRuleCode,
  unitLabel,
} from './rule-board-model'
import { ApplyToFields, ConditionBuilder, useBindingChoices } from './rule-condition-rows'
import { RuleDrawerFooter } from './rule-drawer-footer'
import { type Mode, type Rec, newRec, newRow, recordBound, selectClass } from './rule-drawer-shared'
import { LifecyclePrompt } from './rule-lifecycle-prompt'
import { RuleOutputFields, RulePreview } from './rule-output-fields'

export type DrawerIntent = 'test' | 'activate' | 'deactivate'
type Props = {
  mode: 'alert' | 'recommendation'
  rule?: HumanRule
  projectId: string | null
  projects: { id: string; title: string }[]
  intent?: DrawerIntent
  onClose: () => void
  onSaved: (scopeProjectId: string | null) => void
}
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
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const { profile, access } = useCurrentRole()
  const has = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
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
    rule?.recommendations.map((item) => ({ ...item })) ??
      (mode === 'recommendation' ? [newRec()] : []),
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
  const category = rows[0] ? categoryOf(rows[0].metric) : null
  const changeName = (value: string) => {
    setName(value)
    if (!rule && !codeTouched) setCode(suggestRuleCode(value))
  }
  const toggleScope = (scope: MetricScope) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    )
  const changeProject = (value: string) => {
    setScopeProjectId(value || null)
    setRows((current) => current.map((row) => clearRecordBindings(row) as RuleCondition))
  }
  const fail = (error: unknown, fallback: string) => {
    if (!isCurrent()) return
    if (error instanceof PathwaysClientError && [400, 403, 404, 409].includes(error.status ?? 0)) {
      captured.current = null
      setLocked(false)
      setNotice(fallback)
    } else setNotice('A response was not confirmed. Retry the same operation.')
  }
  const run = async (task: () => Promise<unknown>, failure: string) => {
    if (!isCurrent() || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      await task()
      if (isCurrent()) {
        captured.current = null
        onSaved(scopeProjectId)
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
    if (!scopeOwner) return setNotice('Current permission for the selected scope is required.')
    if (!captured.current) {
      const filled = recs.filter((item) => item.title.trim() || item.text.trim())
      const content = {
        name,
        severity,
        recommendations: filled.length
          ? filled
          : [
              {
                id: crypto.randomUUID(),
                title: 'Review flagged condition',
                text: 'Review the recorded evidence and decide on a response.',
              },
            ],
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
    )
  }
  return (
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
          <section className="space-y-3">
            <h3 className="font-semibold">Basic Rule Information</h3>
            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule Name</Label>
              <Input
                id="rule-name"
                maxLength={160}
                value={name}
                onChange={(event) => changeName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-code">Rule Code</Label>
              <Input
                id="rule-code"
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
              <Label htmlFor="rule-category">Rule Category</Label>
              <select className={selectClass} disabled id="rule-category" value={category ?? ''}>
                <option value="">{category ?? 'Derived from the first metric'}</option>
              </select>
            </div>
          </section>
          <ApplyToFields
            locked={Boolean(rule)}
            onProject={changeProject}
            onToggle={toggleScope}
            projects={projects}
            scopeProjectId={scopeProjectId}
            scopes={scopes}
          />
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
          <RuleOutputFields
            mode={mode}
            onRecs={setRecs}
            onSeverity={setSeverity}
            recs={recs}
            severity={severity}
          />
        </fieldset>
        <RulePreview sentence={previewSentence({ name, severity, conditions: tree })} />
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
        nested={nested}
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
}
