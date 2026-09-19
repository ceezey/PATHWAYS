'use client'

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, StatusMessage } from '@/components/pathways'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'
import { reviewAlert } from '@/lib/demo-state/monitoring'
import { getDemoState } from '@/lib/demo-state/store'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  AlertLifecycleStatus,
  AlertRecord,
  ProjectSummary,
  RecommendationRecord,
  RuleDefinition,
} from '@/types/pathways'

import {
  alertSeverityTone,
  formatDate,
  humanReviewDisclaimer,
  lifecycleTone,
} from './analytics-utils'

const allValue = 'all'
const lifecycleStatuses: AlertLifecycleStatus[] = ['New', 'Reviewed']
const isActiveAlert = (alert: AlertRecord) => lifecycleStatuses.includes(alert.lifecycleStatus)

type AlertsWorkspaceProps = {
  initialAlerts: AlertRecord[]
  projects: ProjectSummary[]
  recommendations: RecommendationRecord[]
  rules: RuleDefinition[]
}

type AlertsWorkspaceData = AlertsWorkspaceProps & { role: string }

export const AlertsWorkspace = ({ initialAlertId }: { initialAlertId?: string }) => {
  const { role } = usePrototypeRole()
  const [data, setData] = useState<AlertsWorkspaceData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let active = true
    setStatus('loading')
    setData(null)

    Promise.all([
      pathwaysClient.getAlertsForRole(role),
      pathwaysClient.getProjectsForRole(role),
      pathwaysClient.getRecommendationsForRole(role),
      pathwaysClient.getRules(),
    ])
      .then(([initialAlerts, projects, recommendations, rules]) => {
        if (!active) return
        setData({ initialAlerts, projects, recommendations, role, rules })
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [loadAttempt, role])

  if (status === 'loading') {
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="Loading the alert queue available to the current role."
        icon={Loader2}
        status="loading"
        title="Loading scoped alerts"
      />
    )
  }

  if (status === 'error' || !data) {
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="The role-scoped alert queue could not be loaded. Check your connection and try again."
        icon={AlertTriangle}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Alerts unavailable"
      />
    )
  }

  return (
    <>
      <StatusMessage>Alert queue loaded.</StatusMessage>
      <AlertsWorkspaceContent initialAlertId={initialAlertId} key={data.role} {...data} />
    </>
  )
}

const AlertsWorkspaceContent = ({
  initialAlertId,
  initialAlerts,
  projects,
  recommendations,
  rules,
}: AlertsWorkspaceProps & { initialAlertId?: string }) => {
  const { labels } = usePrototypeLabels()
  const [alerts, setAlerts] = useState(initialAlerts)
  const requestedAlert = initialAlerts.find(
    (alert) => alert.id === initialAlertId && isActiveAlert(alert),
  )
  const [projectId, setProjectId] = useSafeProjectSelection(
    projects.map((project) => project.id),
    requestedAlert?.projectId,
  )
  const [status, setStatus] = useState(allValue)
  const [selectedAlertId, setSelectedAlertId] = useState(
    requestedAlert?.id ?? initialAlerts.find(isActiveAlert)?.id ?? '',
  )

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        if (!isActiveAlert(alert)) return false
        const matchesProject = alert.projectId === projectId
        const matchesStatus = status === allValue ? true : alert.lifecycleStatus === status

        return matchesProject && matchesStatus
      }),
    [alerts, projectId, status],
  )
  const selectedAlert =
    filteredAlerts.find((alert) => alert.id === selectedAlertId) ?? filteredAlerts[0]
  const selectedRecommendation = recommendations.find(
    (recommendation) => recommendation.alertId === selectedAlert?.id,
  )
  const selectedRule = rules.find((rule) => rule.id === selectedAlert?.ruleId)

  const markReviewed = () => {
    if (!selectedAlert) return
    try {
      reviewAlert(selectedAlert.id)
      setAlerts(getDemoState().alerts)
      toast.success('Alert marked as reviewed.', {
        description: 'It remains active until the configured condition clears.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Alert could not be marked as reviewed.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        editableLabelKey="moduleAlerts"
        description="Review rule-triggered alerts by severity, project, category, lifecycle status, and related project record. No autonomous action is taken."
        eyebrow="Human review required"
        title={labels.moduleAlerts}
      />

      <section className="grid gap-3 rounded-lg border border-border bg-card p-5 md:grid-cols-3">
        <div className="space-y-2">
          <span className="text-sm font-medium">Project</span>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Filter alerts by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Lifecycle status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter alerts by lifecycle status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>All active statuses</SelectItem>
              {lifecycleStatuses.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-sm border border-info/25 bg-info-subtle p-3 text-sm leading-6 text-info">
          {humanReviewDisclaimer}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Alert queue</h2>
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <button
                aria-pressed={alert.id === selectedAlert?.id}
                key={alert.id}
                className={`w-full rounded-sm border p-4 text-left transition-colors ${
                  alert.id === selectedAlert?.id
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border bg-background hover:bg-surface-subtle'
                }`}
                type="button"
                onClick={() => setSelectedAlertId(alert.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{alert.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {projects.find((project) => project.id === alert.projectId)?.title} ·{' '}
                      {alert.category} · {formatDate(alert.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {alert.id === selectedAlert?.id ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Selected
                      </span>
                    ) : null}
                    <StatusBadge tone={alertSeverityTone(alert.severity)}>
                      {alert.severity}
                    </StatusBadge>
                    <StatusBadge tone={lifecycleTone(alert.lifecycleStatus)}>
                      {alert.lifecycleStatus}
                    </StatusBadge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{alert.description}</p>
              </button>
            ))
          ) : (
            <p className="rounded-sm border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
              No alerts match the current filters.
            </p>
          )}
        </section>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5">
          {selectedAlert ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Review alert</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {projects.find((project) => project.id === selectedAlert.projectId)?.title}
                  </p>
                </div>
                <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={alertSeverityTone(selectedAlert.severity)}>
                  {selectedAlert.severity}
                </StatusBadge>
                <StatusBadge tone={lifecycleTone(selectedAlert.lifecycleStatus)}>
                  {selectedAlert.lifecycleStatus}
                </StatusBadge>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-4 text-sm">
                <p className="font-medium text-foreground">{selectedAlert.title}</p>
                <dl className="mt-4 grid gap-3">
                  <InfoRow label="Created" value={formatDate(selectedAlert.createdAt)} />
                  <InfoRow label="Category" value={selectedAlert.category} />
                  <InfoRow
                    label="Related reference"
                    value={`${selectedAlert.relatedType}: ${selectedAlert.relatedId}`}
                  />
                  <InfoRow label="Current value" value={`${selectedAlert.currentValue}`} />
                  <InfoRow label="Threshold" value={`${selectedAlert.threshold}`} />
                  <InfoRow label="Rule" value={selectedRule?.name ?? selectedAlert.ruleId} />
                </dl>
              </div>
              <div className="rounded-sm border border-info/25 bg-info-subtle p-4 text-sm leading-6 text-info">
                {selectedRecommendation ? (
                  <>
                    <p className="font-medium">Recommended action</p>
                    <p className="mt-2">{selectedRecommendation.text}</p>
                    <p className="mt-3 text-xs">{selectedRecommendation.ruleExplanation}</p>
                  </>
                ) : (
                  <p>No recommendation is attached to this alert.</p>
                )}
              </div>
              {selectedAlert.actionNote ? (
                <p className="rounded-sm border border-border bg-surface-subtle p-3 text-sm leading-6">
                  {selectedAlert.actionNote}
                </p>
              ) : null}
              {selectedAlert.lifecycleStatus === 'New' ? (
                <Button onClick={markReviewed}>Mark as reviewed</Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select an alert to review.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
    <dd className="mt-1 font-medium text-foreground">{value}</dd>
  </div>
)
