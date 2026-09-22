'use client'

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Clock,
  FolderKanban,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionCard,
  SidePanel,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { useCurrentRole } from '@/hooks/use-current-role'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  DashboardAction,
  DashboardItem,
  DashboardSeverity,
  Indicator,
  RoleDashboardViewModel,
} from '@/types/pathways'
import { getPathwaysRoleDisplayName } from '@/types/pathways-role'
import { formatMetricCell } from '@pathways/shared'

import { ActivityDetailPanel } from '../projects/activity-detail-panel'
import { ActivityProofDialog } from '../projects/activity-proof-dialog'
import { ExecutiveDashboard } from './executive-dashboard'

const severityTone = (severity?: DashboardSeverity) => {
  if (severity === 'danger') {
    return 'danger'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  if (severity === 'success') {
    return 'success'
  }

  return 'info'
}

const statusTone = (severity?: DashboardSeverity) =>
  severity === 'neutral' ? 'neutral' : severityTone(severity)

const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]

const actionWorkflowHref = (action: DashboardAction) => {
  const actionText = `${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()
  if (actionText.includes('budget')) return '/projects'
  if (actionText.includes('proof')) return '/projects'
  if (
    actionText.includes('recommendation') ||
    actionText.includes('decision') ||
    actionText.includes('outcome')
  )
    return '/alerts'
  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'
  if (actionText.includes('orientation') || actionText.includes('activity')) return '/projects'
  return '/projects'
}

const dashboardActivityTarget = (href?: string) => {
  const match = href?.match(/^\/projects\/([^/]+)\/activities\/([^/?#]+)/)
  if (!match) return null

  const query = href?.split('?')[1] ?? ''
  return {
    projectId: match[1],
    activityId: match[2],
    expenseId: new URLSearchParams(query).get('expense') ?? undefined,
    proofId:
      new URLSearchParams(query).get('review') ??
      new URLSearchParams(query).get('proof') ??
      undefined,
  }
}

type DashboardActivityTarget = NonNullable<ReturnType<typeof dashboardActivityTarget>>

const DashboardActivityReviewPanel = ({
  role,
  target,
  onActivityChanged,
  onClose,
}: {
  role: ReturnType<typeof useCurrentRole>['role']
  target: DashboardActivityTarget | null
  onActivityChanged: () => void
  onClose: () => void
}) => {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [proofActivity, setProofActivity] = useState<Activity | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    if (!target) {
      setActivity(null)
      setIndicators([])
      setProofActivity(null)
      setStatus('idle')
      return
    }

    let mounted = true
    setStatus('loading')

    Promise.all([
      pathwaysClient.getActivity(target.projectId, target.activityId),
      pathwaysClient.getIndicators(target.projectId),
    ])
      .then(([activityRecord, indicatorRecords]) => {
        if (!mounted) return
        setActivity(activityRecord)
        setIndicators(indicatorRecords)
        setStatus('success')
      })
      .catch(() => {
        if (!mounted) return
        setActivity(null)
        setIndicators([])
        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [loadAttempt, target])

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  if (status === 'success' && activity) {
    return (
      <>
        <ActivityDetailPanel
          activity={activity}
          canDecideProof={role === 'Project Manager'}
          canEdit={false}
          canLogExpense={role === 'Project Officer'}
          canRequestExtension={role === 'Project Officer'}
          canSubmitProof={role === 'Project Officer'}
          canValidateExpense={role === 'Monitoring and Evaluation Officer'}
          canValidateProof={role === 'Monitoring and Evaluation Officer'}
          indicators={indicators}
          onActivityChanged={(updatedActivity) => {
            setActivity(updatedActivity)
            onActivityChanged()
          }}
          onEdit={() => undefined}
          onOpenChange={handleOpenChange}
          onSubmitProof={setProofActivity}
          open={Boolean(target)}
          requestedExpenseId={target?.expenseId}
          requestedProofId={target?.proofId}
        />
        <ActivityProofDialog
          activity={proofActivity}
          onOpenChange={(open) => {
            if (!open) setProofActivity(null)
          }}
          onSubmitted={(updatedActivity) => {
            setActivity(updatedActivity)
            setProofActivity(null)
            onActivityChanged()
          }}
          open={Boolean(proofActivity)}
        />
      </>
    )
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={Boolean(target)}>
      <SidePanel
        description="Open the selected project activity without leaving Dashboard."
        title="Activity details"
      >
        <AsyncState
          description={
            status === 'error'
              ? 'The activity proof could not be loaded. Try again from this panel.'
              : 'Loading the selected activity and its submitted proof.'
          }
          icon={status === 'error' ? AlertTriangle : Loader2}
          onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}
          status={status === 'error' ? 'error' : 'loading'}
          title={status === 'error' ? 'Review unavailable' : 'Loading review'}
        />
      </SidePanel>
    </Sheet>
  )
}

const SavedMonitoringCharts = ({ projectId }: { projectId: string }) => (
  <section className="mt-6 border-t border-border pt-6" aria-labelledby="saved-charts-title">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <h3 className="text-lg font-semibold" id="saved-charts-title">
        Monitoring charts
      </h3>
      <Button asChild size="sm" variant="outline">
        <Link href="/analytics">Add a chart</Link>
      </Button>
    </div>
    <EmptyState
      description={
        projectId
          ? 'Saved chart configuration is unavailable until a server-backed service is available.'
          : 'Select a project above to view monitoring data.'
      }
      icon={BarChart3}
      title={projectId ? 'Charts unavailable' : 'Choose a project'}
    />
  </section>
)
const ConnectedMonitoringSnapshot = ({
  role,
}: {
  role: ReturnType<typeof useCurrentRole>['role']
}) => {
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [metrics, setMetrics] = useState<RoleDashboardViewModel['metrics']>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!role) return
    let active = true
    pathwaysClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active) return
        setProjects(records)
        const requested = new URLSearchParams(window.location.search).get('project')
        setProjectId((current) =>
          records.some((record) => record.id === current)
            ? current
            : (records.find((record) => record.id === requested)?.id ?? records[0]?.id ?? ''),
        )
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    if (!projectId) return
    let active = true
    setMetrics([])
    setError('')
    pathwaysClient
      .getMonitoringDashboard({ projectId })
      .then((result) => {
        if (!active) return
        setMetrics([
          {
            id: 'projects',
            label: 'Authorized projects',
            value: String(result.scopeProjectCount),
            helperText: 'Server-derived project scope.',
          },
          {
            id: 'participation',
            label: 'Participation records',
            value: formatMetricCell(result.participationRecords),
            helperText: 'Committed records, not a count of people.',
          },
          {
            id: 'attending',
            label: 'Distinct attending individuals',
            value: formatMetricCell(result.attendingIndividuals),
            helperText: 'Present/completed attendance; deduplicated across projects.',
          },
          {
            id: 'enrolled',
            label: 'Enrolled individuals',
            value: formatMetricCell(result.enrolledIndividuals),
            helperText: 'Enrollment overlaps this period; privacy suppression applies.',
          },
        ])
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',
          )
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (!role || !can(role, 'monitor_evaluate.view')) return null
  return (
    <SectionCard title="Project monitoring">
      <div className="mb-4 max-w-xl">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="dashboard-project-scope">
            Project scope
          </label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="dashboard-project-scope">
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
      </div>
      {error ? (
        <EmptyState
          className="rounded-lg border border-border bg-card"
          description={error}
          icon={AlertTriangle}
          title="Monitoring data unavailable"
        />
      ) : projects.length && metrics.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = metricIcons[index % metricIcons.length]
            return (
              <MetricCard
                description={metric.helperText}
                href={metric.href}
                icon={Icon}
                key={metric.id}
                label={metric.label}
                tone={severityTone(metric.severity)}
                value={String(metric.value)}
              />
            )
          })}
        </div>
      ) : projects.length ? (
        <p className="text-sm text-muted-foreground">Loading project monitoring data...</p>
      ) : (
        <EmptyState
          description="No projects are assigned to this account. Contact an administrator to review project access."
          icon={FolderKanban}
          title="No authorized projects"
        />
      )}
      <SavedMonitoringCharts projectId={projectId} />
    </SectionCard>
  )
}
const ActionButton = ({
  action,
  onAction,
  variant = 'outline',
}: {
  action: DashboardAction
  onAction: (action: DashboardAction) => void
  variant?: 'default' | 'outline' | 'secondary'
}) => (
  <Button
    className="gap-2"
    onClick={() => onAction(action)}
    size="sm"
    type="button"
    variant={variant}
  >
    {action.label}
    {action.kind === 'navigate' ? <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
  </Button>
)

const DashboardListItem = ({
  item,
  onAction,
  compact = false,
}: {
  item: DashboardItem
  onAction: (action: DashboardAction) => void
  compact?: boolean
}) => (
  <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {item.href ? (
          <Link
            className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            href={item.href}
          >
            <span className="truncate">{item.title}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        )}
        <p className="text-sm leading-5 text-muted-foreground">{item.description}</p>
        {item.meta ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{item.meta}</p>
        ) : null}
      </div>
      {item.status ? (
        <StatusBadge tone={statusTone(item.severity)}>{item.status}</StatusBadge>
      ) : null}
    </div>
    {typeof item.progress === 'number' ? (
      <div className={compact ? 'mt-3 sm:max-w-[220px]' : 'mt-4'}>
        <ProgressBar
          label={compact ? undefined : 'Progress'}
          tone={severityTone(item.severity)}
          value={item.progress}
        />
      </div>
    ) : null}
    {item.primaryAction || item.secondaryAction ? (
      <div className="mt-4 flex flex-wrap gap-2">
        {item.primaryAction ? (
          <ActionButton action={item.primaryAction} onAction={onAction} variant="default" />
        ) : null}
        {item.secondaryAction ? (
          <ActionButton action={item.secondaryAction} onAction={onAction} />
        ) : null}
      </div>
    ) : null}
  </div>
)

export const RoleDashboard = () => {
  const router = useRouter()
  const { role } = useCurrentRole()
  const roleLabel = role ? getPathwaysRoleDisplayName(role) : 'Staff'
  const [dashboard, setDashboard] = useState<RoleDashboardViewModel | null>(null)
  const [activityReviewTarget, setActivityReviewTarget] = useState<DashboardActivityTarget | null>(
    null,
  )
  const activityReviewTrigger = useRef<HTMLElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [dashboardRevision, setDashboardRevision] = useState(0)

  useEffect(() => {
    void dashboardRevision
    let mounted = true
    setStatus('loading')

    if (!role) return
    pathwaysClient
      .getDashboard(role)
      .then((viewModel) => {
        if (!mounted) {
          return
        }

        setDashboard(viewModel)
        setStatus('success')
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [dashboardRevision, role])

  const handleAction = (action: DashboardAction) => {
    if (
      action.id === 'review-proof' ||
      action.id === 'review-expense' ||
      action.id === 'open-activity-update' ||
      action.id === 'view-orientation-summary'
    ) {
      const target = dashboardActivityTarget(action.href)
      if (target) {
        activityReviewTrigger.current = document.activeElement as HTMLElement | null
        setActivityReviewTarget(target)
        return
      }
    }

    if (action.kind === 'navigate' && action.href) {
      router.push(action.href)
      return
    }
    router.push(actionWorkflowHref(action))
  }

  if (status === 'loading') {
    return (
      <>
        <h1 className="sr-only">Dashboard</h1>
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading dashboard...
          </div>
        </div>
      </>
    )
  }

  if (status === 'error' || !dashboard) {
    return (
      <>
        <h1 className="sr-only">Dashboard unavailable</h1>
        <EmptyState
          className="min-h-[360px] rounded-lg border border-border bg-card"
          description="We could not load this dashboard right now. Reload the page to try again."
          icon={AlertTriangle}
          title="Dashboard data unavailable"
        />
      </>
    )
  }

  const emptyDashboard =
    dashboard.metrics.length === 0 &&
    dashboard.sections.every((section) => section.items.length === 0)

  return (
    <>
      <PageHeader
        actions={
          !dashboard.executive && dashboard.primaryAction ? (
            <ActionButton
              action={dashboard.primaryAction}
              onAction={handleAction}
              variant="default"
            />
          ) : undefined
        }
        title={`Welcome! ${roleLabel}`}
      />
      <ConnectedMonitoringSnapshot role={role} />
      {dashboard.executive ? (
        <ExecutiveDashboard model={dashboard.executive} summaryAction={dashboard.primaryAction} />
      ) : null}
      {emptyDashboard ? (
        <EmptyState
          className="min-h-[260px] rounded-lg border border-border bg-card"
          description="No dashboard records are available for this account."
          icon={ShieldCheck}
          title="No dashboard records"
        />
      ) : null}
      {dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.metrics.map((metric, index) => {
            const Icon = metricIcons[index % metricIcons.length]

            return (
              <MetricCard
                description={metric.helperText}
                href={metric.href}
                icon={Icon}
                key={metric.id}
                label={metric.label}
                tone={severityTone(metric.severity)}
                value={String(metric.value)}
              />
            )
          })}
        </section>
      ) : null}
      {dashboard.sections.length > 0 ? (
        <section className="space-y-4" aria-labelledby="operational-detail-title">
          {dashboard.executive ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Operational detail
              </p>
              <h2
                className="font-heading text-2xl font-normal leading-8 tracking-normal text-foreground"
                id="operational-detail-title"
              >
                Projects and alerts behind the summary
              </h2>
              <p className="text-base leading-6 text-muted-foreground">
                Portfolio-wide records remain available for follow-up after the executive review.
              </p>
            </div>
          ) : (
            <h2 className="sr-only" id="operational-detail-title">
              Dashboard detail
            </h2>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {dashboard.sections.map((section) => (
              <SectionCard
                key={section.id}
                title={section.title}
                description={section.description}
                actions={
                  section.viewAllHref ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={section.viewAllHref}>{section.viewAllLabel ?? 'View All'}</Link>
                    </Button>
                  ) : null
                }
              >
                {section.items.length > 0 ? (
                  <div
                    aria-label={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? `${section.title} list`
                        : undefined
                    }
                    className={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? 'max-h-[19rem] overflow-y-auto pr-2'
                        : undefined
                    }
                    data-visible-entry-limit={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? '3'
                        : undefined
                    }
                    tabIndex={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? 0
                        : undefined
                    }
                  >
                    {section.items.map((item) => (
                      <DashboardListItem
                        compact={section.id === 'portfolio-health'}
                        key={item.id}
                        item={item}
                        onAction={handleAction}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description={section.emptyText ?? 'No records are currently available.'}
                    icon={ClipboardCheck}
                    title="Nothing to review"
                  />
                )}
              </SectionCard>
            ))}
          </div>
        </section>
      ) : null}
      <DashboardActivityReviewPanel
        onActivityChanged={() => setDashboardRevision((revision) => revision + 1)}
        onClose={() => {
          setActivityReviewTarget(null)
          window.requestAnimationFrame(() => activityReviewTrigger.current?.focus())
        }}
        role={role}
        target={activityReviewTarget}
      />
    </>
  )
}
