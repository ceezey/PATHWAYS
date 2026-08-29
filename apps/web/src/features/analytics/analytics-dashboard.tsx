'use client'

import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  Target,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { MetricCard } from '@/components/pathways/metric-card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  AlertRecord,
  AnalyticsLocationRecord,
  BeneficiarySadddAggregate,
  BudgetRecord,
  ProjectDetail,
} from '@/types/pathways'

import {
  ActivityCompletionChart,
  AlertCountsChart,
  BudgetUtilizationChart,
  ProjectPerformanceChart,
  SadddChart,
} from './analytics-charts'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { buildLocationInsights } from './analytics-location-utils'
import { formatNumber, formatPercent, humanReviewDisclaimer } from './analytics-utils'

const allValue = 'all'
type AnalyticsDashboardProps = {
  projects: ProjectDetail[]
  activities: Activity[]
  budgets: BudgetRecord[]
  alerts: AlertRecord[]
  locations: AnalyticsLocationRecord[]
}

export const AnalyticsDashboard = ({
  projects,
  activities,
  budgets,
  alerts,
  locations,
}: AnalyticsDashboardProps) => {
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const [projectId, setProjectId] = useState(allValue)
  const period = 'All available periods'
  const [sadddAggregates, setSadddAggregates] = useState<BeneficiarySadddAggregate[]>([])
  const [sadddStatus, setSadddStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const roleScopedProjects = useMemo(
    () => (role ? projects.filter((project) => canAccessProjectForRole(role, project.id)) : []),
    [projects, role],
  )

  useEffect(() => {
    let active = true
    setSadddStatus('loading')
    setSadddAggregates([])

    if (!role) {
      setSadddStatus('error')
      return () => {
        active = false
      }
    }

    void pathwaysClient
      .getBeneficiarySadddAggregatesForRole(role)
      .then((aggregates) => {
        if (active) {
          setSadddAggregates(aggregates)
          setSadddStatus('ready')
        }
      })
      .catch(() => {
        if (active) {
          setSadddAggregates([])
          setSadddStatus('error')
        }
      })

    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    if (projectId !== allValue && !roleScopedProjects.some((project) => project.id === projectId)) {
      setProjectId(allValue)
    }
  }, [projectId, roleScopedProjects])

  const visibleProjects = useMemo(
    () =>
      projectId === allValue
        ? roleScopedProjects
        : roleScopedProjects.filter((project) => project.id === projectId),
    [projectId, roleScopedProjects],
  )
  const visibleProjectIds = useMemo(
    () => visibleProjects.map((project) => project.id),
    [visibleProjects],
  )
  // TODO(DATABASE): Query analytics from project, indicator, budget, assessment, and participation records.
  const visibleActivities = activities.filter((activity) =>
    visibleProjectIds.includes(activity.projectId),
  )
  const visibleBudgets = budgets.filter((budget) => visibleProjectIds.includes(budget.projectId))
  const visibleSadddAggregates = sadddAggregates.filter((aggregate) =>
    visibleProjectIds.includes(aggregate.projectId),
  )
  const visibleAlerts = alerts.filter((alert) => visibleProjectIds.includes(alert.projectId))
  const visibleLocations = useMemo(
    () => buildLocationInsights(locations, visibleProjectIds),
    [locations, visibleProjectIds],
  )

  const averageKpi =
    visibleProjects.length > 0
      ? Math.round(
          visibleProjects.reduce((total, project) => total + project.kpiAchievement, 0) /
            visibleProjects.length,
        )
      : 0
  const plannedBudget = visibleBudgets.reduce((total, budget) => total + budget.plannedAmount, 0)
  const actualBudget = visibleBudgets.reduce((total, budget) => total + budget.actualSpending, 0)
  const budgetUtilization = plannedBudget > 0 ? Math.round((actualBudget / plannedBudget) * 100) : 0
  const targetBeneficiaries = visibleProjects.reduce(
    (total, project) => total + project.targetBeneficiaries,
    0,
  )
  const reachedBeneficiaries = visibleProjects.reduce(
    (total, project) => total + project.beneficiariesReached,
    0,
  )
  const completedActivities = visibleActivities.filter(
    (activity) => activity.status === 'Completed',
  ).length
  const canReviewAlerts = role ? can(role, 'alerts.outcome.log') : false
  const canViewRules = role ? can(role, 'rules.view') : false
  const canConfigureRules = role ? can(role, 'rules.configure') : false

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleAnalytics}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Project performance, SADDD Analysis, budget utilization, aggregate location coverage,
              Beneficiary reach, and Rule-Based Alerts for human review.
            </p>
          </div>
        </div>
        {canReviewAlerts || canViewRules ? (
          <div className="flex flex-wrap gap-2">
            {canReviewAlerts ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/alerts">{labels.moduleAlerts}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/recommendations">{labels.moduleRecommendations}</Link>
                </Button>
              </>
            ) : null}
            {canViewRules ? (
              <Button asChild>
                <Link href="/alerts/repository">
                  {canConfigureRules ? 'Manage alert rules' : 'View alert rules'}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2 xl:grid-cols-[1fr_240px_240px]">
        <div className="space-y-2">
          <span className="text-sm font-medium">Project filter</span>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Project filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>All projects</SelectItem>
              {roleScopedProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Reporting period</span>
          <Select disabled value={period}>
            <SelectTrigger aria-label="Reporting period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={period}>{period}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-6 text-info">
          {humanReviewDisclaimer}
        </div>
      </section>

      {visibleProjects.length === 0 ? (
        <EmptyState
          description={
            role
              ? 'Analytics will appear when project data are available for this scope.'
              : 'A verified staff identity and role are required to load scoped analytics.'
          }
          icon={BarChart3}
          title={role ? 'No analytics data for this filter' : 'Analytics access unavailable'}
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              description={`${visibleProjects.length} project${visibleProjects.length === 1 ? '' : 's'} in ${period}.`}
              icon={Target}
              label="KPI achievement"
              tone={averageKpi >= 70 ? 'success' : 'warning'}
              value={formatPercent(averageKpi)}
            />
            <MetricCard
              description="Actual spending against planned allocation."
              icon={CircleDollarSign}
              label="Budget utilization"
              tone={budgetUtilization > 80 ? 'warning' : 'success'}
              value={formatPercent(budgetUtilization)}
            />
            <MetricCard
              description={`${formatNumber(reachedBeneficiaries)} of ${formatNumber(targetBeneficiaries)} target beneficiaries.`}
              icon={UsersRound}
              label="Beneficiary reach"
              tone="info"
              value={formatNumber(reachedBeneficiaries)}
            />
            <MetricCard
              description="Completed activities in the selected project set."
              icon={ClipboardCheck}
              label="Activity completion"
              tone="success"
              value={`${completedActivities}/${visibleActivities.length}`}
            />
            <MetricCard
              description="Rule-Based Alerts requiring review, action, or acknowledgement."
              icon={AlertTriangle}
              label="Rule-Based Alerts"
              tone={
                visibleAlerts.some((alert) => alert.severity === 'Critical') ? 'danger' : 'warning'
              }
              value={visibleAlerts.length.toString()}
            />
          </section>

          <AnalyticsCoverageMap
            locations={visibleLocations}
            period={period}
            projects={visibleProjects}
          />

          <section className="grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Current project performance">
              <ProjectPerformanceChart projects={visibleProjects} />
            </ChartPanel>
            <ChartPanel title="Budget utilization">
              {visibleBudgets.length > 0 ? (
                <BudgetUtilizationChart budgets={visibleBudgets} projects={visibleProjects} />
              ) : (
                <ChartEmpty message="No budget data are available for this scope." />
              )}
            </ChartPanel>
            <ChartPanel title="SADDD Analysis">
              {sadddStatus === 'loading' ? (
                <ChartEmpty message="Loading aggregate SADDD data..." />
              ) : sadddStatus === 'error' ? (
                <ChartEmpty message="Aggregate SADDD data could not be loaded." />
              ) : visibleSadddAggregates.length > 0 ? (
                <SadddChart aggregates={visibleSadddAggregates} />
              ) : (
                <ChartEmpty message="No aggregate SADDD data are available for this scope." />
              )}
            </ChartPanel>
            <ChartPanel title="Activity completion">
              {visibleActivities.length > 0 ? (
                <ActivityCompletionChart activities={visibleActivities} />
              ) : (
                <ChartEmpty message="No activity data are available for this scope." />
              )}
            </ChartPanel>
            <ChartPanel title="Rule-Based Alerts">
              {visibleAlerts.length > 0 ? (
                <AlertCountsChart alerts={visibleAlerts} />
              ) : (
                <ChartEmpty message="No Rule-Based Alerts are available for this scope." />
              )}
            </ChartPanel>
          </section>
        </>
      )}
    </div>
  )
}

const ChartPanel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
)

const ChartEmpty = ({ message }: { message: string }) => (
  <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
    {message}
  </div>
)
