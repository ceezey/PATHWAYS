'use client'

import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { AsyncState, StatusMessage } from '@/components/pathways'
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
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  AlertRecord,
  ProjectSummary,
  RecommendationOutcome,
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
const outcomes: RecommendationOutcome[] = ['Accept', 'Partially Accept', 'Decline', 'Escalate']

type RecommendationsWorkspaceProps = {
  initialRecommendationId?: string
  initialRecommendations: RecommendationRecord[]
  alerts: AlertRecord[]
  projects: ProjectSummary[]
  rules: RuleDefinition[]
}

type RecommendationsWorkspaceData = RecommendationsWorkspaceProps & { role: string }

export const RecommendationsWorkspace = ({
  initialRecommendationId,
}: {
  initialRecommendationId?: string
}) => {
  const { role } = usePrototypeRole()
  const [data, setData] = useState<RecommendationsWorkspaceData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let active = true
    setStatus('loading')
    setData(null)

    Promise.all([
      pathwaysClient.getRecommendationsForRole(role),
      pathwaysClient.getAlertsForRole(role),
      pathwaysClient.getProjectsForRole(role),
      pathwaysClient.getRules(),
    ])
      .then(([initialRecommendations, alerts, projects, rules]) => {
        if (!active) return
        setData({
          alerts,
          initialRecommendationId,
          initialRecommendations,
          projects,
          role,
          rules,
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [initialRecommendationId, loadAttempt, role])

  if (status === 'loading') {
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="Loading the recommendation queue available to the current role."
        icon={Loader2}
        status="loading"
        title="Loading scoped recommendations"
      />
    )
  }

  if (status === 'error' || !data) {
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="The role-scoped recommendation queue could not be loaded. Check your connection and try again."
        icon={AlertTriangle}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Recommendations unavailable"
      />
    )
  }

  return (
    <>
      <StatusMessage>Recommendation queue loaded.</StatusMessage>
      <RecommendationsWorkspaceContent key={data.role} {...data} />
    </>
  )
}

const RecommendationsWorkspaceContent = ({
  initialRecommendationId,
  initialRecommendations,
  alerts,
  projects,
  rules,
}: RecommendationsWorkspaceProps) => {
  const { labels } = usePrototypeLabels()
  const [recommendations, setRecommendations] = useState(initialRecommendations)
  const [projectId, setProjectId] = useState(allValue)
  const [reviewStatus, setReviewStatus] = useState(allValue)
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(
    initialRecommendations.some((item) => item.id === initialRecommendationId)
      ? (initialRecommendationId ?? '')
      : (initialRecommendations[0]?.id ?? ''),
  )
  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [outcome, setOutcome] = useState<RecommendationOutcome>('Accept')
  const [outcomeNote, setOutcomeNote] = useState('')
  const [outcomeError, setOutcomeError] = useState('')

  const filteredRecommendations = useMemo(
    () =>
      recommendations.filter((recommendation) => {
        const alert = alerts.find((item) => item.id === recommendation.alertId)
        const matchesProject = projectId === allValue ? true : alert?.projectId === projectId
        const matchesStatus =
          reviewStatus === allValue ? true : recommendation.reviewStatus === reviewStatus

        return matchesProject && matchesStatus
      }),
    [alerts, projectId, recommendations, reviewStatus],
  )
  const selectedRecommendation =
    filteredRecommendations.find((item) => item.id === selectedRecommendationId) ??
    filteredRecommendations[0]
  const selectedAlert = alerts.find((alert) => alert.id === selectedRecommendation?.alertId)
  const selectedProject = projects.find((project) => project.id === selectedAlert?.projectId)
  const selectedRule = rules.find((rule) => rule.id === selectedRecommendation?.ruleId)

  const logOutcome = () => {
    if (!outcomeNote.trim()) {
      setOutcomeError('Add an outcome note before saving.')
      toast.error('Check the outcome form.', {
        description: 'The outcome note has an inline error.',
      })
      return
    }

    setOutcomeError('')

    // TODO(BACKEND): Persist recommendation review and outcomes.
    setRecommendations((current) =>
      current.map((recommendation) =>
        recommendation.id === selectedRecommendation?.id
          ? { ...recommendation, outcome, outcomeNote, reviewStatus: 'Actioned' }
          : recommendation,
      ),
    )
    setOutcomeOpen(false)
    toast.success('Recommendation outcome logged locally.', {
      description: 'Human decision recorded for this prototype view.',
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <StatusBadge tone="info">Human review required</StatusBadge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleRecommendations}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review the alert basis, rule explanation, recommendation text, and human-recorded
              outcome for each rule-triggered recommendation.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/alerts">Back to {labels.moduleAlerts}</Link>
        </Button>
      </section>

      <section className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
        {humanReviewDisclaimer} No autonomous action is taken.
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm font-medium">Project</span>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Filter recommendations by project">
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
          <span className="text-sm font-medium">Review status</span>
          <Select value={reviewStatus} onValueChange={setReviewStatus}>
            <SelectTrigger aria-label="Filter recommendations by review status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>All review statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Reviewed">Reviewed</SelectItem>
              <SelectItem value="Actioned">Actioned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Recommendation queue</h2>
          {filteredRecommendations.length > 0 ? (
            filteredRecommendations.map((recommendation) => {
              const alert = alerts.find((item) => item.id === recommendation.alertId)
              const project = projects.find((item) => item.id === alert?.projectId)

              return (
                <button
                  aria-pressed={recommendation.id === selectedRecommendation?.id}
                  key={recommendation.id}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    recommendation.id === selectedRecommendation?.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/60'
                  }`}
                  type="button"
                  onClick={() => setSelectedRecommendationId(recommendation.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{recommendation.text}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {project?.title ?? 'Unknown project'} · {alert?.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recommendation.id === selectedRecommendation?.id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Selected
                        </span>
                      ) : null}
                      <StatusBadge tone="info">{recommendation.reviewStatus}</StatusBadge>
                      {recommendation.outcome ? (
                        <StatusBadge tone="success">{recommendation.outcome}</StatusBadge>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              No recommendations match the current filters.
            </p>
          )}
        </section>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          {selectedRecommendation && selectedAlert ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Recommendation detail</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedProject?.title ?? 'Unknown project'}
                  </p>
                </div>
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={alertSeverityTone(selectedAlert.severity)}>
                  {selectedAlert.severity}
                </StatusBadge>
                <StatusBadge tone={lifecycleTone(selectedAlert.lifecycleStatus)}>
                  {selectedAlert.lifecycleStatus}
                </StatusBadge>
                <StatusBadge tone="info">{selectedRecommendation.reviewStatus}</StatusBadge>
              </div>
              <DetailBlock title="Alert basis">{selectedRecommendation.alertBasis}</DetailBlock>
              <DetailBlock title="Rule explanation">
                {selectedRecommendation.ruleExplanation}
              </DetailBlock>
              <DetailBlock title="Recommendation text">{selectedRecommendation.text}</DetailBlock>
              <DetailBlock title="Rule">
                {selectedRule?.name ?? selectedRecommendation.ruleId}
              </DetailBlock>
              {selectedRecommendation.outcome ? (
                <div className="rounded-lg border border-success/20 bg-success/10 p-4 text-sm leading-6 text-success">
                  <p className="font-medium">{selectedRecommendation.outcome}</p>
                  <p className="mt-2">{selectedRecommendation.outcomeNote}</p>
                </div>
              ) : null}
              <Button
                onClick={() => {
                  setOutcome(selectedRecommendation.outcome ?? 'Accept')
                  setOutcomeNote(selectedRecommendation.outcomeNote ?? '')
                  setOutcomeError('')
                  setOutcomeOpen(true)
                }}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Log outcome
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a recommendation to review.</p>
          )}
        </aside>
      </div>

      <Dialog
        open={outcomeOpen}
        onOpenChange={(open) => {
          setOutcomeOpen(open)
          if (!open) setOutcomeError('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log recommendation outcome</DialogTitle>
            <DialogDescription>
              Record a human decision for this predefined-rule recommendation.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              logOutcome()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="recommendation-outcome">
                Human-reviewed outcome
                <span aria-hidden="true" className="ml-1 text-danger">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </Label>
              <Select
                value={outcome}
                onValueChange={(value) => setOutcome(value as RecommendationOutcome)}
              >
                <SelectTrigger aria-required="true" id="recommendation-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outcomes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommendation-outcome-note">
                Outcome note
                <span aria-hidden="true" className="ml-1 text-danger">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </Label>
              <Input
                aria-describedby={outcomeError ? 'recommendation-outcome-note-error' : undefined}
                aria-invalid={Boolean(outcomeError)}
                aria-required="true"
                id="recommendation-outcome-note"
                placeholder="Add an outcome note"
                value={outcomeNote}
                onChange={(event) => {
                  setOutcomeNote(event.target.value)
                  if (outcomeError) setOutcomeError('')
                }}
              />
              {outcomeError ? (
                <p
                  className="text-sm font-medium text-danger"
                  id="recommendation-outcome-note-error"
                >
                  {outcomeError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOutcomeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save outcome</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const DetailBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-background p-4 text-sm leading-6">
    <p className="font-medium text-foreground">{title}</p>
    <p className="mt-2 text-muted-foreground">{children}</p>
  </div>
)
