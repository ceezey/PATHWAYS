'use client'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ReviewCardList, basisLabel, statusLabel } from '@/features/rules-board/review-card-list'
import { formatMetricValue } from '@/features/rules-board/rule-board-model'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { HumanReviewAction } from './human-review-action'
import { LinkedAlertSummary } from './linked-alert-summary'
import { RuleTreeView, comparisonCopy } from './rule-condition-editor'
import type { HumanAlert, HumanNotification } from './rules-human-contract'

const copy = (value: string) =>
  value === 'AUTO_RESOLVED' ? 'Auto-resolved' : value.replaceAll('_', ' ').toLowerCase()
const instant = (value: string) =>
  new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Manila' })
const permissionFor = (kind: 'alert' | 'recommendation', action: 'read' | 'review' | 'outcome') =>
  kind === 'alert'
    ? action === 'read'
      ? 'alerts.read'
      : action === 'review'
        ? 'alerts.review'
        : 'alerts.outcome.record'
    : action === 'read'
      ? 'recommendations.read'
      : action === 'review'
        ? 'recommendations.review'
        : 'recommendations.outcome.record'

// Radix Select rejects an empty value, so the unfiltered queue uses a sentinel.
const ALL_PROJECTS = 'all'

export function HumanReviewWorkspace({
  kind,
  initialId,
}: { kind: 'alert' | 'recommendation'; initialId?: string }) {
  const { profile } = useCurrentRole()
  const { labels } = useDisplayLabels()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [selection, setSelection] = useState(initialId ?? null)
  const [mode, setMode] = useState<'review' | 'outcome' | 'resolve' | 'dismiss' | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificationCursor, setNotificationCursor] = useState<string | null>(null)
  const projects = useAuthorizedRead('review-projects', null, 'projects.read', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const alerts = useAuthorizedRead(
    `alert-queue:${cursor ?? 'first'}`,
    projectId,
    'alerts.read',
    (signal) =>
      rulesHumanClient.listAlerts(
        { ...(projectId ? { projectId } : {}), ...(cursor ? { cursor } : {}) },
        signal,
      ),
    kind === 'alert',
  )
  const recommendations = useAuthorizedRead(
    `recommendation-queue:${cursor ?? 'first'}`,
    projectId,
    'recommendations.read',
    (signal) =>
      rulesHumanClient.listRecommendations(
        { ...(projectId ? { projectId } : {}), ...(cursor ? { cursor } : {}) },
        signal,
      ),
    kind === 'recommendation',
  )
  const queue = kind === 'alert' ? alerts : recommendations
  const selectedId = selection ?? queue.data?.items[0]?.id ?? null
  const selectedProject =
    queue.data?.items.find((item) => item.id === selectedId)?.projectId ?? projectId
  const alert = useAuthorizedRead(
    `alert-detail:${selectedId ?? 'none'}`,
    selectedProject,
    'alerts.read',
    (signal) => rulesHumanClient.getAlert(selectedId ?? '', signal),
    kind === 'alert' && Boolean(selectedId),
  )
  const recommendation = useAuthorizedRead(
    `recommendation-detail:${selectedId ?? 'none'}`,
    selectedProject,
    'recommendations.read',
    (signal) => rulesHumanClient.getRecommendation(selectedId ?? '', signal),
    kind === 'recommendation' && Boolean(selectedId),
  )
  const detail = kind === 'alert' ? alert : recommendation
  const item = detail.data
  const linkedId = recommendation.data?.alertId
  const linked = useAuthorizedRead(
    `outcome-linked-alert:${linkedId ?? 'none'}`,
    recommendation.data?.projectId ?? null,
    'alerts.read',
    (signal) => rulesHumanClient.getAlert(linkedId ?? '', signal),
    kind === 'recommendation' &&
      mode === 'outcome' &&
      Boolean(linkedId) &&
      principalHasAtomicPermission(profile, 'alerts.outcome.record'),
  )
  const history = useAuthorizedRead(
    `alert-history:${selectedId ?? 'none'}:${historyCursor ?? 'first'}`,
    item?.projectId ?? null,
    'alerts.read',
    (signal) =>
      rulesHumanClient.alertHistory(
        selectedId ?? '',
        { ...(historyCursor ? { cursor: historyCursor } : {}) },
        signal,
      ),
    kind === 'alert' && showHistory && Boolean(item),
  )
  const notifications = useAuthorizedRead(
    `review-notifications:${notificationCursor ?? 'first'}`,
    projectId,
    'alerts.read',
    (signal) =>
      rulesHumanClient.listNotifications(
        {
          ...(projectId ? { projectId } : {}),
          ...(notificationCursor ? { cursor: notificationCursor } : {}),
        },
        signal,
      ),
    kind === 'alert' && showNotifications,
  )
  const refresh = () => {
    setMode(null)
    void queue.refetch()
    void detail.refetch()
    if (showHistory) void history.refetch()
    if (showNotifications) void notifications.refetch()
  }
  const choose = (id: string | null) => {
    setSelection(id)
    setMode(null)
    setShowHistory(false)
    setHistoryCursor(null)
  }
  if (!principalHasAtomicPermission(profile, permissionFor(kind, 'read')))
    return (
      <AsyncState
        status="error"
        title="Access unavailable"
        description="Current workspace permission is required to view this queue."
      />
    )
  return (
    <div className="space-y-6">
      <PageHeader title={kind === 'alert' ? labels.moduleAlerts : labels.moduleRecommendations} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-2">
          <Label htmlFor={`${kind}-project`}>Project</Label>
          <Select
            value={projectId ?? ALL_PROJECTS}
            onValueChange={(value) => {
              setProjectId(value === ALL_PROJECTS ? null : value)
              setCursor(null)
              setNotificationCursor(null)
              choose(null)
            }}
          >
            <SelectTrigger id={`${kind}-project`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {projects.data?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={refresh}>
          Refresh queue
        </Button>
        {projects.isError ? (
          <Button type="button" variant="outline" onClick={() => void projects.refetch()}>
            Retry project choices
          </Button>
        ) : null}
        {kind === 'alert' ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowNotifications((value) => !value)}
          >
            {showNotifications ? 'Hide notifications' : 'Notifications'}
          </Button>
        ) : null}
        {principalHasAtomicPermission(profile, 'rules.read') ? (
          <Button asChild className="ml-auto" variant="outline">
            <Link href="/alerts/repository">Manage rules</Link>
          </Button>
        ) : null}
      </div>
      {queue.isPending ? (
        <AsyncState
          status="loading"
          title="Loading queue"
          description="Loading records available in the current workspace."
        />
      ) : queue.isError ? (
        <AsyncState
          status="error"
          title="Queue unavailable"
          description="The queue could not be loaded. Try again."
          onRetry={() => void queue.refetch()}
        />
      ) : !queue.data?.items.length && !selectedId ? (
        <EmptyState
          title="No records"
          description="No records are available for this project selection."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(260px,.7fr)_minmax(0,1.3fr)]">
          <SectionCard title={kind === 'alert' ? 'Alert queue' : 'Recommendation queue'}>
            <ReviewCardList
              items={queue.data?.items ?? []}
              selectedId={selectedId}
              onSelect={choose}
              projectLabel={(id) => projects.data?.find((project) => project.id === id)?.title}
            />
            {!queue.data?.items.length ? (
              <p className="text-sm text-muted-foreground">No records in this queue.</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              {cursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCursor(null)
                    setNotificationCursor(null)
                    choose(null)
                  }}
                >
                  First page
                </Button>
              ) : null}
              {queue.data?.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCursor(queue.data?.nextCursor ?? null)
                    choose(null)
                  }}
                >
                  Next page
                </Button>
              ) : null}
            </div>
          </SectionCard>
          <SectionCard title="Record details">
            {detail.isError ? (
              <AsyncState
                status="error"
                title="Record unavailable"
                description="This record could not be loaded. Try again."
                onRetry={() => void detail.refetch()}
              />
            ) : !item ? (
              <AsyncState
                status="loading"
                title="Loading record"
                description="Verifying the selected record."
              />
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">{item.title}</h2>
                <StatusBadge tone="neutral">
                  {statusLabel('lifecycle' in item ? item.lifecycle : item.status)}
                </StatusBadge>
                {'evidence' in item ? (
                  <AlertEvidence item={item} />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <h3 className="font-semibold">Recommendation basis</h3>
                    <p className="whitespace-pre-wrap">{basisLabel(item.basis)}</p>
                    {principalHasAtomicPermission(profile, 'alerts.read') ? (
                      <LinkedAlertSummary alertId={item.alertId} projectId={item.projectId} />
                    ) : null}
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {principalHasAtomicPermission(profile, permissionFor(kind, 'review')) &&
                  ('lifecycle' in item
                    ? item.lifecycle === 'NEW' && item.freshness === 'CURRENT'
                    : item.status === 'NEW') ? (
                    <Button onClick={() => setMode('review')} type="button">
                      Mark reviewed
                    </Button>
                  ) : null}
                  {principalHasAtomicPermission(profile, permissionFor(kind, 'outcome')) &&
                  (!('freshness' in item) || item.freshness === 'CURRENT') &&
                  !('status' in item && item.status === 'AUTO_RESOLVED') &&
                  !(
                    'lifecycle' in item &&
                    ['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'].includes(item.lifecycle)
                  ) ? (
                    <Button type="button" variant="outline" onClick={() => setMode('outcome')}>
                      Record outcome
                    </Button>
                  ) : null}
                  {kind === 'alert' &&
                  'lifecycle' in item &&
                  item.freshness === 'CURRENT' &&
                  !['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'].includes(item.lifecycle) &&
                  principalHasAtomicPermission(profile, 'alerts.outcome.record') ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => setMode('resolve')}>
                        Resolve alert
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setMode('dismiss')}>
                        Dismiss alert
                      </Button>
                    </>
                  ) : null}
                  {kind === 'alert' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowHistory((value) => !value)}
                    >
                      {showHistory ? 'Hide history' : 'Show history'}
                    </Button>
                  ) : null}
                </div>
                {mode ? (
                  <HumanReviewAction
                    key={`${kind}:${item.id}:${item.revision}:${mode}`}
                    kind={kind}
                    item={item}
                    mode={mode}
                    linkedAlert={linked.data}
                    onCommitted={() => {
                      setMode(null)
                      refresh()
                    }}
                    onCancel={() => setMode(null)}
                  />
                ) : null}
                {kind === 'recommendation' && mode === 'outcome' && linked.isError ? (
                  <p className="text-sm">
                    Linked alert access could not be verified. Refresh the queue before accepting
                    the recommendation.
                  </p>
                ) : null}
                {showHistory ? (
                  <SectionCard title="Alert history">
                    {history.isError ? (
                      <AsyncState
                        status="error"
                        title="History unavailable"
                        description="History could not be loaded."
                        onRetry={() => void history.refetch()}
                      />
                    ) : !history.data ? (
                      <output>Loading history...</output>
                    ) : (
                      <>
                        <ol className="space-y-4">
                          {history.data.items.map((event) => (
                            <li className="border-b border-border pb-3" key={event.id}>
                              <p className="font-semibold">
                                {copy(event.kind)} ({copy(event.actorKind)})
                              </p>
                              <p>{event.explanation}</p>
                              <p className="text-sm text-muted-foreground">
                                {instant(event.occurredAt)} Asia/Manila
                              </p>
                              {event.outcome ? <p>{copy(event.outcome)}</p> : null}
                              <p className="text-sm">
                                Rule version {event.ruleVersion}
                                {event.result ? `; result ${copy(event.result)}` : ''}
                              </p>
                              {event.evidence.length ? (
                                <EvidenceTable evidence={event.evidence} />
                              ) : null}
                            </li>
                          ))}
                        </ol>
                        {history.data.nextCursor ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setHistoryCursor(history.data?.nextCursor ?? null)}
                          >
                            Next history page
                          </Button>
                        ) : null}
                      </>
                    )}
                  </SectionCard>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      )}
      {showNotifications ? (
        <SectionCard title="In-app notifications">
          {notifications.isError ? (
            <AsyncState
              status="error"
              title="Notifications unavailable"
              description="Notifications could not be loaded."
              onRetry={() => void notifications.refetch()}
            />
          ) : !notifications.data ? (
            <output>Loading notifications...</output>
          ) : notifications.data.items.length ? (
            <>
              <ul className="space-y-3">
                {notifications.data.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onRead={() => void notifications.refetch()}
                  />
                ))}
              </ul>
              {notificationCursor ? (
                <Button type="button" variant="outline" onClick={() => setNotificationCursor(null)}>
                  First notification page
                </Button>
              ) : null}
              {notifications.data.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNotificationCursor(notifications.data?.nextCursor ?? null)}
                >
                  Next notification page
                </Button>
              ) : null}
            </>
          ) : (
            <p>No notifications.</p>
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}
function AlertEvidence({ item }: { item: HumanAlert }) {
  const { profile } = useCurrentRole()
  const canReadLinked =
    principalHasAtomicPermission(profile, 'recommendations.read') &&
    item.linkedRecommendationIds.length > 0
  // One read labels each linked recommendation by its title instead of a number.
  const linked = useAuthorizedRead(
    `alert-linked-recommendations:${item.id}`,
    item.projectId,
    'recommendations.read',
    (signal) => rulesHumanClient.listRecommendations({ alertId: item.id, limit: '10' }, signal),
    canReadLinked,
    { freshness: 'summary' },
  )
  const titleOf = (id: string) => linked.data?.items.find((row) => row.id === id)?.title
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap">{item.explanation}</p>
      <p className="text-sm text-muted-foreground">
        Rule version {item.ruleVersion}; {copy(item.freshness)}. Evaluated{' '}
        {instant(item.evaluatedAt)} Asia/Manila. Reporting date {item.reportingDate}; calendar
        version {item.calendar.version}.
      </p>
      <RuleTreeView node={item.conditions} />
      <EvidenceTable evidence={item.evidence} />
      {canReadLinked ? (
        <ul className="space-y-2">
          {item.linkedRecommendationIds.map((id, index) => (
            <li key={id}>
              <Link className="text-primary underline" href={`/recommendations/${id}`}>
                {titleOf(id)
                  ? `Linked recommendation: ${titleOf(id)}`
                  : `View linked recommendation ${index + 1}`}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="font-semibold">Predefined recommendations</h3>
      <ul className="space-y-2">
        {item.predefinedRecommendations.map((recommendation) => (
          <li key={recommendation.id}>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
function EvidenceTable({ evidence }: { evidence: HumanAlert['evidence'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-semibold">Recorded evaluation evidence</caption>
        <thead>
          <tr>
            <th className="p-2" scope="col">
              Metric
            </th>
            <th className="p-2" scope="col">
              Observed value
            </th>
            <th className="p-2" scope="col">
              Condition
            </th>
            <th className="p-2" scope="col">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((evidence) => (
            <tr className="border-t border-border" key={evidence.conditionId}>
              <th className="p-2 font-normal" scope="row">
                {copy(evidence.metric)}
              </th>
              <td className="p-2">
                {evidence.cell.value !== null
                  ? formatMetricValue(evidence.cell.value, evidence.unit)
                  : `${copy(evidence.cell.state)}${evidence.cell.reason ? ` (${copy(evidence.cell.reason)})` : ''}`}
              </td>
              <td className="p-2">
                {comparisonCopy[evidence.operator]}{' '}
                {formatMetricValue(evidence.threshold, evidence.unit)}
                {evidence.thresholdMaximum !== null
                  ? ` to ${formatMetricValue(evidence.thresholdMaximum, evidence.unit)}`
                  : ''}
              </td>
              <td className="p-2">{copy(evidence.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function NotificationRow({ item, onRead }: { item: HumanNotification; onRead: () => void }) {
  const { profile, access } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'notification-read',
    'alerts.read',
    item.projectId,
    item.id,
    access === 'ready',
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const markRead = async () => {
    if (!owner?.isCurrent() || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    try {
      await rulesHumanClient.markNotificationRead(item.id)
      if (owner.isCurrent()) onRead()
    } catch {
      if (owner.isCurrent()) setNotice('Could not mark this notification read. Try again.')
    } finally {
      inFlight.current = false
      if (owner.isCurrent()) setBusy(false)
    }
  }
  return (
    <li className="space-y-2 rounded-sm border border-border p-3">
      <p>{item.message}</p>
      <p className="text-sm text-muted-foreground">
        {instant(item.createdAt)} Asia/Manila; {copy(item.deliveryState)}
      </p>
      <Link className="text-primary underline" href={`/alerts?alert=${item.alertId}`}>
        View alert
      </Link>
      {item.readAt ? (
        <p className="text-sm">Read</p>
      ) : (
        <Button
          disabled={busy || !owner}
          type="button"
          variant="outline"
          onClick={() => void markRead()}
        >
          Mark read
        </Button>
      )}
      {notice ? <output className="block text-sm">{notice}</output> : null}
    </li>
  )
}
