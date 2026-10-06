'use client'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { HumanRule } from '@/features/analytics/rules-human-contract'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useState } from 'react'
import {
  appliesTo,
  conditionSummary,
  filterRules,
  flattenRecommendations,
  severityTone,
  statusTone,
  titleCase,
} from './rule-board-model'
import { type DrawerIntent, RuleDrawer } from './rule-drawer'

// Radix Select rejects an empty value, so the organization scope uses a sentinel.
const ORGANIZATION_SCOPE = 'organization'

type Status = 'ALL' | HumanRule['status']
type Tab = 'repository' | 'create'
type Drawer = { mode: 'alert' | 'recommendation'; rule?: HumanRule; intent?: DrawerIntent }
type View = 'alerts' | 'recommendations' | 'manage'
const PREVIEW_ROWS = 5
const head = 'sticky top-0 z-10 bg-surface-subtle'
const row = 'h-14 cursor-pointer'

function RuleTables({
  kind,
  rules,
  limit,
  onOpen,
}: {
  kind: 'alerts' | 'recommendations'
  rules: HumanRule[]
  limit?: number
  onOpen: (rule: HumanRule, mode: Drawer['mode']) => void
}) {
  if (kind === 'recommendations') {
    const rows = flattenRecommendations(rules).slice(0, limit)
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {['Recommendation', 'Applies To', 'Condition', 'Linked Rule', 'Status'].map((title) => (
              <TableHead className={head} key={title}>
                {title}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const rule = rules.find((candidate) => candidate.id === item.ruleId)
            return (
              <TableRow
                className={row}
                key={`${item.ruleId}:${item.id}`}
                onClick={() => rule && onOpen(rule, 'recommendation')}
              >
                <TableCell className="font-medium">
                  <button
                    className="text-left hover:underline"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (rule) onOpen(rule, 'recommendation')
                    }}
                    type="button"
                  >
                    {item.recommendationTitle}
                  </button>
                </TableCell>
                <TableCell>{item.appliesTo}</TableCell>
                <TableCell className="max-w-xs truncate" title={item.condition}>
                  {item.condition}
                </TableCell>
                <TableCell>{item.ruleName}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(item.status)}>{titleCase(item.status)}</StatusBadge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {['Rule Name', 'Applies To', 'Condition', 'Severity', 'Status'].map((title) => (
            <TableHead className={head} key={title}>
              {title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.slice(0, limit).map((rule) => (
          <TableRow className={row} key={rule.id} onClick={() => onOpen(rule, 'alert')}>
            <TableCell className="font-medium">
              <button
                className="text-left hover:underline"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpen(rule, 'alert')
                }}
                type="button"
              >
                {rule.name}
              </button>
            </TableCell>
            <TableCell>{appliesTo(rule).join(', ')}</TableCell>
            <TableCell className="max-w-xs truncate" title={conditionSummary(rule.conditions)}>
              {conditionSummary(rule.conditions)}
            </TableCell>
            <TableCell>
              <StatusBadge tone={severityTone(rule.severity)}>
                {titleCase(rule.severity)}
              </StatusBadge>
            </TableCell>
            <TableCell>
              <StatusBadge tone={statusTone(rule.status)}>{titleCase(rule.status)}</StatusBadge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function RulesBoard() {
  const { profile } = useCurrentRole()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('ALL')
  const [more, setMore] = useState<{ items: HumanRule[]; nextCursor: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [tab, setTab] = useState<Tab>('repository')
  const [createMode, setCreateMode] = useState<Drawer['mode']>('alert')
  const [view, setView] = useState<View | null>(null)
  const [notice, setNotice] = useState('')
  const canCreate = principalHasAtomicPermission(profile, 'rules.create')
  const projects = useAuthorizedRead('rules-project-choices', null, 'projects.read', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const list = useAuthorizedRead('rules-board-list', projectId, 'rules.read', (signal) =>
    rulesHumanClient.listRules(
      projectId ? { projectId, kind: 'PROJECT' } : { kind: 'TEMPLATE' },
      signal,
    ),
  )
  const all = [...(list.data?.items ?? []), ...(more?.items ?? [])]
  // Recommendations already written in this scope, offered for reuse on a new rule.
  const savedRecommendations = all.flatMap((rule) => rule.recommendations)
  const nextCursor = more ? more.nextCursor : (list.data?.nextCursor ?? null)
  const rules = filterRules(all, { search, status })
  // Creating runs in the Create rule tab; an existing rule opens the side panel.
  const open = (rule: HumanRule, mode: Drawer['mode'], intent?: DrawerIntent) => {
    setView(null)
    setDrawer({ mode, rule, intent })
  }
  const changeScope = (value: string | null) => {
    setProjectId(value)
    setMore(null)
  }
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(false)
    try {
      const page = await rulesHumanClient.listRules({
        ...(projectId ? { projectId, kind: 'PROJECT' as const } : { kind: 'TEMPLATE' as const }),
        cursor: nextCursor,
      })
      setMore((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        nextCursor: page.nextCursor,
      }))
    } catch {
      setMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }
  const saved = (scope: string | null) => {
    setDrawer(null)
    setTab('repository')
    setNotice('Rule changes saved.')
    setMore(null)
    if (scope !== projectId) changeScope(scope)
    else void list.refetch()
  }
  const body = (kind: 'alerts' | 'recommendations', limit?: number) =>
    list.isError ? (
      <AsyncState
        status="error"
        title="Rules unavailable"
        description="The scoped repository could not be loaded."
        onRetry={() => void list.refetch()}
      />
    ) : !list.data ? (
      <AsyncState
        status="loading"
        title="Loading rules"
        description="Loading the current rule scope."
      />
    ) : !all.length ? (
      <EmptyState
        title="None yet"
        description={`${
          kind === 'alerts'
            ? 'No alert rules exist in this scope.'
            : 'No recommendations are defined in this scope.'
        }${canCreate ? ' Use the Create rule tab to add one.' : ''}`}
      />
    ) : !rules.length ? (
      <EmptyState title="No rules match" description="Change the search or status filter." />
    ) : (
      <RuleTables
        kind={kind}
        limit={limit}
        onOpen={(rule, mode) => open(rule, mode)}
        rules={rules}
      />
    )
  const card = (kind: 'alerts' | 'recommendations') => (
    <SectionCard
      title={
        kind === 'alerts'
          ? 'Rule-based Alert Configuration'
          : 'Rule-based Recommendation Configuration'
      }
      actions={
        <Button type="button" variant="outline" onClick={() => setView(kind)}>
          View All
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-surface-subtle p-2">
        {body(kind, PREVIEW_ROWS)}
      </div>
    </SectionCard>
  )
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert & Recommendation Rules"
        actions={
          <Button type="button" variant="outline" onClick={() => setView('manage')}>
            Manage Rules
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="repository">Rule repository</TabsTrigger>
          {canCreate ? <TabsTrigger value="create">Create rule</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="space-y-6" value="repository">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Input
                aria-label="Search rules"
                placeholder="Search rules by name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                value={projectId ?? ORGANIZATION_SCOPE}
                onValueChange={(value) => changeScope(value === ORGANIZATION_SCOPE ? null : value)}
              >
                <SelectTrigger aria-label="Scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ORGANIZATION_SCOPE}>Organization templates</SelectItem>
                  {projects.data?.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => setStatus(value as Status)}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          {notice ? (
            <output className="block text-sm" aria-live="polite">
              {notice}
            </output>
          ) : null}
          {card('alerts')}
          {card('recommendations')}
        </TabsContent>
        {canCreate ? (
          <TabsContent className="space-y-4" value="create">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Rule output</span>
              {(['alert', 'recommendation'] as const).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  type="button"
                  variant={createMode === item ? 'default' : 'outline'}
                  onClick={() => setCreateMode(item)}
                >
                  {item === 'alert' ? 'Alert rule' : 'Recommendation rule'}
                </Button>
              ))}
            </div>
            <RuleDrawer
              inline
              key={`new:${createMode}`}
              library={savedRecommendations}
              mode={createMode}
              onClose={() => setTab('repository')}
              onSaved={saved}
              projectId={projectId}
              projects={projects.data ?? []}
            />
          </TabsContent>
        ) : null}
      </Tabs>
      <Dialog open={view !== null} onOpenChange={(next) => !next && setView(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {view === 'manage'
                ? 'Manage Rules'
                : view === 'recommendations'
                  ? 'All recommendation rules'
                  : 'All alert rules'}
            </DialogTitle>
          </DialogHeader>
          {view === 'manage' ? (
            <ManageTable rules={rules} onAction={open} canCreate={canCreate} />
          ) : view ? (
            body(view)
          ) : null}
          {moreError ? (
            <p className="text-sm text-danger">More rules could not be loaded.</p>
          ) : null}
          {nextCursor ? (
            <Button
              disabled={loadingMore}
              type="button"
              variant="outline"
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
      {drawer ? (
        <RuleDrawer
          key={drawer.rule ? `${drawer.rule.id}:${drawer.rule.version}` : 'new'}
          intent={drawer.intent}
          mode={drawer.mode}
          onClose={() => setDrawer(null)}
          library={savedRecommendations}
          onSaved={saved}
          projectId={projectId}
          projects={projects.data ?? []}
          rule={drawer.rule}
        />
      ) : null}
    </div>
  )
}

function ManageTable({
  rules,
  onAction,
  canCreate,
}: {
  rules: HumanRule[]
  onAction: (rule: HumanRule, mode: Drawer['mode'], intent?: DrawerIntent) => void
  canCreate: boolean
}) {
  const { profile } = useCurrentRole()
  const can = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
  if (!rules.length)
    return (
      <EmptyState
        title="None yet"
        description={
          canCreate ? 'Create a rule from the cards on this page.' : 'No rules in scope.'
        }
      />
    )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {['Rule Name', 'Status', 'Actions'].map((title) => (
            <TableHead className={head} key={title}>
              {title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow className="h-14" key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell>
              <StatusBadge tone={statusTone(rule.status)}>{titleCase(rule.status)}</StatusBadge>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onAction(rule, 'alert')}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onAction(rule, 'alert', 'test')}
                >
                  Test
                </Button>
                {rule.status === 'DRAFT' && rule.projectId !== null && can('rules.activate') ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onAction(rule, 'alert', 'activate')}
                  >
                    Activate
                  </Button>
                ) : null}
                {rule.status === 'ACTIVE' && can('rules.update') ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onAction(rule, 'alert', 'deactivate')}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
