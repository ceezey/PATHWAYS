'use client'

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FolderKanban,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionCard,
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
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import {
  dashboardChartMeta,
  getDashboardChartRows,
  moveDashboardChart,
  removeDashboardChart,
  resizeDashboardChart,
} from '@/lib/demo-state/dashboard-charts'
import {
  type DashboardChartConfig,
  type DemoState,
  currentAccount,
  recordDemoAccess,
} from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  DashboardAction,
  DashboardItem,
  DashboardSeverity,
  RoleDashboardViewModel,
} from '@/types/pathways'
import { getPrototypeRoleDisplayName } from '@/types/prototype-role'

import { DescriptiveAnalysisChart } from '../analytics/analytics-charts'
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
  if (actionText.includes('budget')) return '/projects/futuremakers-ncr/budget'
  if (actionText.includes('proof')) return '/projects/futuremakers-ncr/evidence'
  if (
    actionText.includes('recommendation') ||
    actionText.includes('decision') ||
    actionText.includes('outcome')
  )
    return '/recommendations'
  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'
  if (actionText.includes('orientation') || actionText.includes('activity'))
    return '/projects/futuremakers-ncr/activities'
  return '/projects'
}

const allProjects = 'all'

const SavedMonitoringCharts = ({
  demo,
  projectId,
}: {
  demo: DemoState
  projectId: string
}) => {
  const [draggedId, setDraggedId] = useState<string>()
  const [message, setMessage] = useState('')
  const charts = demo.dashboardCharts
    .filter((chart) => chart.projectId === projectId)
    .sort((left, right) => left.order - right.order)

  const applyChange = (change: () => void, success: string) => {
    try {
      change()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Dashboard layout could not be updated.')
    }
  }

  const moveBy = (chart: DashboardChartConfig, offset: number) => {
    const currentIndex = charts.findIndex((record) => record.id === chart.id)
    const target = charts[currentIndex + offset]
    if (!target) return
    applyChange(
      () => moveDashboardChart(chart.id, target.id),
      `${dashboardChartMeta[chart.analysis].title} moved ${offset < 0 ? 'earlier' : 'later'}.`,
    )
  }

  if (projectId === allProjects) {
    return (
      <div className="mt-6 border-t border-border pt-6">
        <EmptyState
          description="Select a project above to view its saved charts."
          icon={BarChart3}
          title="Choose a project"
        />
      </div>
    )
  }

  return (
    <section className="mt-6 border-t border-border pt-6" aria-labelledby="saved-charts-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold" id="saved-charts-title">
            Monitoring charts
          </h3>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/analytics">Add a chart</Link>
        </Button>
      </div>
      {message ? (
        <output className="mb-4 block rounded-sm border border-info/25 bg-info-subtle p-3 text-sm text-info">
          {message}
        </output>
      ) : null}
      {charts.length === 0 ? (
        <EmptyState
          description="No charts have been saved for this project. Use Add a chart to choose data and a chart type."
          icon={BarChart3}
          title="No saved charts"
        />
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-2">
          {charts.map((chart, index) => {
            const meta = dashboardChartMeta[chart.analysis]
            const rows = getDashboardChartRows(demo, chart)
            const indicator = chart.indicatorId
              ? demo.indicators.find((record) => record.id === chart.indicatorId)
              : undefined
            return (
              <article
                className={`overflow-hidden rounded-lg border border-border bg-background p-4 ${chart.width === 'full' ? 'lg:col-span-2' : 'lg:col-span-1'}`}
                draggable
                key={chart.id}
                onDragEnd={() => setDraggedId(undefined)}
                onDragOver={(event) => {
                  if (draggedId && draggedId !== chart.id) event.preventDefault()
                }}
                onDragStart={(event) => {
                  setDraggedId(chart.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', chart.id)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceId = draggedId ?? event.dataTransfer.getData('text/plain')
                  setDraggedId(undefined)
                  if (!sourceId || sourceId === chart.id) return
                  applyChange(
                    () => moveDashboardChart(sourceId, chart.id),
                    'Dashboard charts reordered.',
                  )
                }}
              >
                <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <GripVertical
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-grab text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold">{meta.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {chart.period}
                        {indicator ? ` · ${indicator.code} · ${indicator.label}` : ''}
                      </p>
                    </div>
                  </div>
                  <fieldset className="grid w-full shrink-0 grid-cols-2 gap-2 border-0 p-0 sm:w-[244px]">
                    <legend className="sr-only">Layout controls for {meta.title}</legend>
                    <Button
                      aria-label={`Move ${meta.title} earlier`}
                      disabled={index === 0}
                      className="w-full justify-start"
                      onClick={() => moveBy(chart, -1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ArrowUp className="mr-2 h-4 w-4" aria-hidden="true" />
                      Earlier
                    </Button>
                    <Button
                      aria-label={`Move ${meta.title} later`}
                      disabled={index === charts.length - 1}
                      className="w-full justify-start"
                      onClick={() => moveBy(chart, 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ArrowDown className="mr-2 h-4 w-4" aria-hidden="true" />
                      Later
                    </Button>
                    <Button
                      className="w-full justify-start"
                      onClick={() =>
                        applyChange(
                          () =>
                            resizeDashboardChart(
                              chart.id,
                              chart.width === 'half' ? 'full' : 'half',
                            ),
                          `${meta.title} changed to ${chart.width === 'half' ? 'full' : 'half'} width.`,
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {chart.width === 'half' ? (
                        <Maximize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Minimize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      {chart.width === 'half' ? 'Full width' : 'Half width'}
                    </Button>
                    <Button
                      aria-label={`Remove ${meta.title}`}
                      className="w-full justify-start"
                      onClick={() => {
                        if (!window.confirm(`Remove ${meta.title} from this project dashboard?`))
                          return
                        applyChange(
                          () => removeDashboardChart(chart.id),
                          `${meta.title} removed from this project dashboard.`,
                        )
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Remove
                    </Button>
                  </fieldset>
                </div>
                <div className="mt-3 h-[320px]" data-testid="saved-chart-body">
                  {rows.length ? (
                    <DescriptiveAnalysisChart
                      rows={rows}
                      title={meta.title}
                      type={chart.visualization}
                      unit={meta.unit}
                    />
                  ) : (
                    <EmptyState
                      className="h-full"
                      description="The saved chart remains configured, but its project data is currently insufficient."
                      icon={BarChart3}
                      title="No chart data"
                    />
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

const ConnectedMonitoringSnapshot = ({
  role,
}: { role: ReturnType<typeof usePrototypeRole>['role'] }) => {
  const demo = useDemoState()
  const actor = currentAccount(demo)
  const [projectId, setProjectId] = useState(allProjects)
  const loggedRoles = useRef(new Set<string>())
  const projectScopeInitialized = useRef(false)
  const scopedProjects = useMemo(
    () => demo.projects.filter((project) => actor?.projectIds.includes(project.id)),
    [actor?.projectIds, demo.projects],
  )

  useEffect(() => {
    if (projectScopeInitialized.current || scopedProjects.length === 0) return
    const requestedProjectId = new URLSearchParams(window.location.search).get('project')
    const preferredProject =
      scopedProjects.find((project) => project.id === requestedProjectId) ??
      scopedProjects.find((project) =>
        demo.dashboardCharts.some((chart) => chart.projectId === project.id),
      )
    if (preferredProject) setProjectId(preferredProject.id)
    projectScopeInitialized.current = true
  }, [demo.dashboardCharts, scopedProjects])

  useEffect(() => {
    if (!can(role, 'monitoring.view') || loggedRoles.current.has(role)) return
    loggedRoles.current.add(role)
    try {
      recordDemoAccess(
        'monitoring.view',
        demo.scenario === 'retrieval-failure'
          ? 'Project monitoring retrieval failed.'
          : 'Viewed the project monitoring summary.',
        { outcome: demo.scenario === 'retrieval-failure' ? 'Failure' : 'Success' },
      )
    } catch {
      // Route-level access feedback remains authoritative.
    }
  }, [demo.scenario, role])

  if (!can(role, 'monitoring.view')) return null
  if (demo.scenario === 'retrieval-failure')
    return (
      <EmptyState
        className="rounded-lg border border-border bg-card"
        description="The monitoring summary could not be retrieved. Try again or contact your administrator."
        icon={AlertTriangle}
        title="Monitoring data unavailable"
      />
    )

  const selectedProjects =
    projectId === allProjects
      ? scopedProjects
      : scopedProjects.filter((project) => project.id === projectId)
  const selectedIds = new Set(selectedProjects.map((project) => project.id))
  const budgets = demo.budgets.filter((budget) => selectedIds.has(budget.projectId))
  const activities = demo.activities.filter((activity) => selectedIds.has(activity.projectId))
  const alerts = demo.alerts.filter(
    (alert) =>
      selectedIds.has(alert.projectId) &&
      !['Resolved', 'Dismissed', 'Auto-resolved'].includes(alert.lifecycleStatus),
  )
  const planned = budgets.reduce((sum, budget) => sum + budget.plannedAmount, 0)
  const spent = budgets.reduce((sum, budget) => sum + budget.actualSpending, 0)
  const reached = selectedProjects.reduce((sum, project) => sum + project.beneficiariesReached, 0)
  const averageProgress = activities.length
    ? Math.round(
        activities.reduce((sum, activity) => sum + activity.progress, 0) / activities.length,
      )
    : 0

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
              <SelectItem value={allProjects}>All authorized projects</SelectItem>
              {scopedProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selectedProjects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            description={`${spent.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} verified against ${planned.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}.`}
            icon={BarChart3}
            label="Budget utilization"
            tone={planned && spent / planned > 0.8 ? 'warning' : 'success'}
            value={`${planned ? Math.round((spent / planned) * 100) : 0}%`}
          />
          <MetricCard
            description="Unique project reach reflected by linked entries and profiles."
            icon={FolderKanban}
            label="Beneficiaries reached"
            tone="info"
            value={reached.toLocaleString()}
          />
          <MetricCard
            description={`${activities.length} linked activit${activities.length === 1 ? 'y' : 'ies'} in scope.`}
            icon={Clock}
            label="Average activity progress"
            tone={averageProgress >= 75 ? 'success' : 'warning'}
            value={`${averageProgress}%`}
          />
          <MetricCard
            description="New, reviewed, or actioned items still needing human context."
            icon={AlertTriangle}
            label="Open alerts"
            tone={alerts.length ? 'warning' : 'success'}
            value={alerts.length.toString()}
          />
        </div>
      ) : (
        <EmptyState
          description="No projects are assigned to this account. Contact an administrator to review project access."
          icon={FolderKanban}
          title="No authorized projects"
        />
      )}
      <SavedMonitoringCharts key={projectId} demo={demo} projectId={projectId} />
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
}: {
  item: DashboardItem
  onAction: (action: DashboardAction) => void
}) => (
  <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
      <div className="mt-4">
        <ProgressBar label="Progress" tone={severityTone(item.severity)} value={item.progress} />
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
  const { role } = usePrototypeRole()
  const roleLabel = getPrototypeRoleDisplayName(role)
  const [dashboard, setDashboard] = useState<RoleDashboardViewModel | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    let mounted = true
    setStatus('loading')

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
  }, [role])

  const handleAction = (action: DashboardAction) => {
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
        title={roleLabel}
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
      {!can(role, 'monitoring.view') && !dashboard.executive && dashboard.metrics.length > 0 ? (
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
                  <div>
                    {section.items.map((item) => (
                      <DashboardListItem key={item.id} item={item} onAction={handleAction} />
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
    </>
  )
}
