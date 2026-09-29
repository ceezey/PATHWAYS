'use client'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RuleTreeView } from '@/features/analytics/rule-condition-editor'
import { RuleEditor } from '@/features/analytics/rule-editor'
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import { RuleTestWorkspace } from './rule-test-workspace'

type DialogAction =
  | { kind: 'create' }
  | { kind: 'draft' | 'copy' | 'activate' | 'archive'; rule: HumanRule }
export function RuleConfigurationWorkspace() {
  const { profile } = useCurrentRole()
  const { labels } = useDisplayLabels()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [action, setAction] = useState<DialogAction | null>(null)
  const [showTest, setShowTest] = useState(false)
  const [copyProject, setCopyProject] = useState<string | null>(null)
  const [savedScopeNotice, setSavedScopeNotice] = useState('')
  const projects = useAuthorizedRead('rules-project-choices', null, 'projects.read', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const queue = useAuthorizedRead(
    `rules-list:${cursor ?? 'first'}`,
    projectId,
    'rules.read',
    (signal) =>
      rulesHumanClient.listRules(
        {
          ...(projectId ? { projectId, kind: 'PROJECT' as const } : { kind: 'TEMPLATE' as const }),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      ),
  )
  const selectedId = selection ?? queue.data?.items[0]?.id ?? null
  const detail = useAuthorizedRead(
    `rule-detail:${selectedId ?? 'none'}`,
    projectId,
    'rules.read',
    (signal) => rulesHumanClient.getRule(selectedId ?? '', signal),
    Boolean(selectedId),
  )
  const rule = detail.data
  const has = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
  const refresh = (savedScope?: string | null) => {
    setAction(null)
    if (savedScope !== undefined) {
      const scopeName = savedScope
        ? (projects.data?.find((project) => project.id === savedScope)?.title ??
          'the selected project')
        : 'Organization templates'
      if (savedScope !== projectId) {
        setProjectId(savedScope)
        setCursor(null)
        setSelection(null)
      }
      setSavedScopeNotice(`Rule saved to ${scopeName}.`)
    }
    void queue.refetch()
    void detail.refetch()
  }
  const open = (next: DialogAction) => {
    setCopyProject(null)
    setAction(next)
  }
  if (!has('rules.read'))
    return (
      <AsyncState
        status="error"
        title="Rule access unavailable"
        description="Current rule repository permission is required."
      />
    )
  return (
    <div className="space-y-6">
      <PageHeader
        title={labels.moduleAlertsRepository}
        description="Manage versioned project rules and organization templates with typed conditions and predefined recommendations."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-2">
          <Label htmlFor="rules-project">Rule scope</Label>
          <select
            id="rules-project"
            className="h-11 w-full rounded-sm border border-input bg-background px-3"
            value={projectId ?? ''}
            onChange={(event) => {
              setProjectId(event.target.value || null)
              setCursor(null)
              setSelection(null)
              setAction(null)
              setShowTest(false)
              setSavedScopeNotice('')
            }}
          >
            <option value="">Organization templates</option>
            {projects.data?.map((project) => (
              <option value={project.id} key={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" onClick={() => refresh()}>
          Refresh rules
        </Button>
        {has('rules.create') ? (
          <Button type="button" onClick={() => open({ kind: 'create' })}>
            New rule draft
          </Button>
        ) : null}
        {projects.isError ? (
          <Button type="button" variant="outline" onClick={() => void projects.refetch()}>
            Retry project choices
          </Button>
        ) : null}
      </div>
      {savedScopeNotice ? (
        <output className="block text-sm" aria-live="polite">
          {savedScopeNotice}
        </output>
      ) : null}
      {queue.isError ? (
        <AsyncState
          status="error"
          title="Rules unavailable"
          description="The scoped repository could not be loaded."
          onRetry={() => void queue.refetch()}
        />
      ) : !queue.data ? (
        <AsyncState
          status="loading"
          title="Loading rules"
          description="Loading the current rule scope."
        />
      ) : !queue.data.items.length ? (
        <EmptyState
          title="No rules in this scope"
          description="Create a draft or choose another project scope."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(260px,.7fr)_minmax(0,1.3fr)]">
          <SectionCard title="Rule repository">
            <ul className="space-y-2">
              {queue.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    className="w-full rounded-sm border border-border p-3 text-left hover:bg-primary-subtle"
                    aria-pressed={item.id === selectedId}
                    onClick={() => {
                      setSelection(item.id)
                      setAction(null)
                      setShowTest(false)
                    }}
                    type="button"
                  >
                    <span className="block font-semibold">{item.name}</span>
                    <span className="text-sm text-muted-foreground">
                      Version {item.version}; {item.status.toLowerCase()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              {cursor ? (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setCursor(null)
                    setSelection(null)
                  }}
                >
                  First page
                </Button>
              ) : null}
              {queue.data.nextCursor ? (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setCursor(queue.data?.nextCursor ?? null)
                    setSelection(null)
                  }}
                >
                  Next page
                </Button>
              ) : null}
            </div>
          </SectionCard>
          <SectionCard title="Rule details">
            {detail.isError ? (
              <AsyncState
                status="error"
                title="Rule unavailable"
                description="This rule could not be verified."
                onRetry={() => void detail.refetch()}
              />
            ) : !rule ? (
              <output>Loading rule...</output>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">{rule.name}</h2>
                <p className="text-sm">
                  {rule.code}; version {rule.version}
                </p>
                <StatusBadge tone="neutral">{rule.status.toLowerCase()}</StatusBadge>
                <p>Severity: {rule.severity.toLowerCase()}</p>
                <RuleTreeView node={rule.conditions} />
                <h3 className="font-semibold">Predefined recommendations</h3>
                <ul className="space-y-2">
                  {rule.recommendations.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {has('rules.update') && rule.status !== 'ARCHIVED' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => open({ kind: 'draft', rule })}
                    >
                      {rule.status === 'DRAFT' ? 'Edit draft' : 'Create next draft'}
                    </Button>
                  ) : null}
                  {has('rules.activate') && rule.projectId !== null && rule.status === 'DRAFT' ? (
                    <Button type="button" onClick={() => open({ kind: 'activate', rule })}>
                      Activate rule
                    </Button>
                  ) : null}
                  {has('rules.update') && rule.status === 'ACTIVE' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => open({ kind: 'archive', rule })}
                    >
                      Archive rule
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowTest((value) => !value)}
                  >
                    {showTest ? 'Hide condition test' : 'Test conditions'}
                  </Button>
                  {has('rules.create') && rule.projectId === null ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => open({ kind: 'copy', rule })}
                    >
                      Copy to project
                    </Button>
                  ) : null}
                </div>
                {showTest ? (
                  <RuleTestWorkspace key={`${rule.id}:${rule.version}`} rule={rule} />
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      )}
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open) setAction(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'activate'
                ? 'Activate rule'
                : action?.kind === 'archive'
                  ? 'Archive rule'
                  : action?.kind === 'copy'
                    ? 'Copy template to project'
                    : 'Rule draft'}
            </DialogTitle>
            <DialogDescription>
              Changes are checked against your current workspace authority and the recorded rule
              version.
            </DialogDescription>
          </DialogHeader>
          {action?.kind === 'copy' ? (
            <div className="space-y-2">
              <Label htmlFor="rule-copy-project">Project</Label>
              <select
                id="rule-copy-project"
                className="h-11 w-full rounded-sm border border-input bg-background px-3"
                value={copyProject ?? ''}
                onChange={(event) => setCopyProject(event.target.value || null)}
              >
                <option value="">Choose a project</option>
                {projects.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {action?.kind === 'create' ? (
            <RuleEditor projectId={projectId} onSaved={refresh} />
          ) : action?.kind === 'draft' ? (
            <RuleEditor
              projectId={action.rule.projectId}
              original={action.rule}
              onSaved={refresh}
            />
          ) : action?.kind === 'copy' && copyProject ? (
            <RuleEditor projectId={copyProject} template={action.rule} onSaved={refresh} />
          ) : action?.kind === 'activate' || action?.kind === 'archive' ? (
            <RuleLifecycle rule={action.rule} action={action.kind} onSaved={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
function RuleLifecycle({
  rule,
  action,
  onSaved,
}: { rule: HumanRule; action: 'activate' | 'archive'; onSaved: () => void }) {
  const { profile, access } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'rule-lifecycle',
    action === 'activate' ? 'rules.activate' : 'rules.update',
    rule.projectId,
    `${rule.id}:${rule.version}:${action}`,
    access === 'ready',
  )
  if (!owner) return <output>Current rule permission is required.</output>
  return (
    <OwnedRuleLifecycle
      key={`${owner.generation}:${owner.key}`}
      rule={rule}
      action={action}
      onSaved={onSaved}
      owner={owner}
    />
  )
}
function OwnedRuleLifecycle({
  rule,
  action,
  onSaved,
  owner,
}: {
  rule: HumanRule
  action: 'activate' | 'archive'
  onSaved: () => void
  owner: SensitiveDraftOwner
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const captured = useRef<{
    expectedVersion: number
    clientOperationId: string
    note?: string
  } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = () => mounted.current && owner.isCurrent()
  const submit = async () => {
    if (!current() || inFlight.current || (action === 'archive' && !note.trim())) return
    captured.current ??= {
      expectedVersion: rule.version,
      clientOperationId: crypto.randomUUID(),
      ...(action === 'archive' ? { note: note.trim() } : {}),
    }
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      if (action === 'activate') await rulesHumanClient.activateRule(rule.id, captured.current)
      else
        await rulesHumanClient.archiveRule(rule.id, {
          ...captured.current,
          note: captured.current.note ?? '',
        })
      if (current()) {
        captured.current = null
        setNote('')
        onSaved()
      }
    } catch (error) {
      if (current()) {
        if (
          error instanceof PathwaysClientError &&
          [400, 403, 404, 409].includes(error.status ?? 0)
        ) {
          captured.current = null
          setLocked(false)
          setNotice(
            'This operation could not be completed. Refresh the rule and verify current access.',
          )
        } else setNotice('A response was not confirmed. Retry the same operation.')
      }
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p>
        {action === 'activate'
          ? 'Activate this version for deterministic evaluation and predefined recommendations?'
          : 'Archive this version? Recorded history remains available.'}
      </p>
      {action === 'archive' ? (
        <div className="space-y-2">
          <Label htmlFor="rule-archive-note">Archive note</Label>
          <Textarea
            id="rule-archive-note"
            maxLength={2000}
            required
            value={note}
            disabled={busy || locked}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      ) : null}
      {notice ? <output className="block text-sm">{notice}</output> : null}
      <Button disabled={busy} type="submit">
        {busy
          ? 'Submitting...'
          : action === 'activate'
            ? 'Activate this version'
            : 'Archive this version'}
      </Button>
    </form>
  )
}
