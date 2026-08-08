'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
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
const lifecycleStatuses: AlertLifecycleStatus[] = [
  'New',
  'Reviewed',
  'Actioned',
  'Resolved',
  'Dismissed',
  'Auto-resolved',
]

type AlertsWorkspaceProps = {
  initialAlerts: AlertRecord[]
  projects: ProjectSummary[]
  recommendations: RecommendationRecord[]
  rules: RuleDefinition[]
}

export const AlertsWorkspace = ({
  initialAlerts,
  projects,
  recommendations,
  rules,
}: AlertsWorkspaceProps) => {
  const { labels } = usePrototypeLabels()
  const [alerts, setAlerts] = useState(initialAlerts)
  const [projectId, setProjectId] = useState(allValue)
  const [status, setStatus] = useState(allValue)
  const [selectedAlertId, setSelectedAlertId] = useState(initialAlerts[0]?.id ?? '')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<AlertLifecycleStatus>('Reviewed')
  const [actionNote, setActionNote] = useState('')

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const matchesProject = projectId === allValue ? true : alert.projectId === projectId
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

  const updateAlert = () => {
    // TODO(BACKEND): Persist rule definitions and lifecycle transitions.
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === selectedAlert?.id
          ? { ...alert, lifecycleStatus: reviewStatus, actionNote }
          : alert,
      ),
    )
    setReviewOpen(false)
    toast.success('Alert review updated locally.', {
      description: 'This demonstration keeps the change in your current browser session only.',
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <StatusBadge tone="warning">Human review required</StatusBadge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleAlerts}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review rule-triggered alerts by severity, project, category, lifecycle status, and
              related project record. No autonomous action is taken.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/recommendations">{labels.moduleRecommendations}</Link>
        </Button>
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-3">
        <div className="space-y-2">
          <span className="text-sm font-medium">Project</span>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Filter alerts by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>All projects</SelectItem>
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
              <SelectItem value={allValue}>All statuses</SelectItem>
              {lifecycleStatuses.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-6 text-info">
          {humanReviewDisclaimer}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Alert queue</h2>
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <button
                key={alert.id}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  alert.id === selectedAlert?.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background hover:bg-muted/60'
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
            <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              No alerts match the current filters.
            </p>
          )}
        </section>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
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
              <div className="rounded-lg border border-border bg-background p-4 text-sm">
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
              <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
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
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6">
                  {selectedAlert.actionNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setReviewStatus('Reviewed')
                    setActionNote(selectedAlert.actionNote ?? '')
                    setReviewOpen(true)
                  }}
                >
                  Review action
                </Button>
                {selectedRecommendation ? (
                  <Button asChild>
                    <Link href={`/recommendations?recommendation=${selectedRecommendation.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                      View recommended action
                    </Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select an alert to review.</p>
          )}
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review alert lifecycle</DialogTitle>
            <DialogDescription>
              This records a local prototype status and action note only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alert-review-status">Review status</Label>
              <Select
                value={reviewStatus}
                onValueChange={(value) => setReviewStatus(value as AlertLifecycleStatus)}
              >
                <SelectTrigger id="alert-review-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lifecycleStatuses.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-action-note">Action note</Label>
              <Input
                id="alert-action-note"
                placeholder="Add an action note"
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateAlert} type="button">
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
    <dd className="mt-1 font-medium text-foreground">{value}</dd>
  </div>
)
