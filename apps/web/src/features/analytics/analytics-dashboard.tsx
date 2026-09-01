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
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
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
  ProjectPerformanceTrendChart,
  SadddChart,
} from './analytics-charts'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { buildLocationInsights } from './analytics-location-utils'
import { formatNumber, formatPercent, humanReviewDisclaimer } from './analytics-utils'

const allValue = 'all'
const loadingKeys = ['kpi', 'budget', 'reach']

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
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const [projectId, setProjectId] = useState(allValue)
  const [period, setPeriod] = useState('Q2 2026')
  const [loading, setLoading] = useState(false)
  const [sadddAggregates, setSadddAggregates] = useState<BeneficiarySadddAggregate[]>([])

  const roleScopedProjects = useMemo(
    () => projects.filter((project) => canAccessProjectForRole(role, project.id)),
    [projects, role],
  )

  useEffect(() => {
    let active = true

    void pathwaysClient
      .getBeneficiarySadddAggregatesForRole(role)
      .then((aggregates) => {
        if (active) {
          setSadddAggregates(aggregates)
        }
      })
      .catch(() => {
        if (active) {
          setSadddAggregates([])
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

  const refreshFilter = (update: () => void) => {
    update()
    setLoading(true)
    window.setTimeout(() => setLoading(false), 240)
  }

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
  const canReviewAlerts = can(role, 'alerts.outcome.log')
  const canViewRules = can(role, 'rules.view')
  const canConfigureRules = can(role, 'rules.configure')

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
          <Select
            value={projectId}
            onValueChange={(value) => refreshFilter(() => setProjectId(value))}
          >
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
          <Select value={period} onValueChange={(value) => refreshFilter(() => setPeriod(value))}>
            <SelectTrigger aria-label="Reporting period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Q1 2026">Q1 2026</SelectItem>
              <SelectItem value="Q2 2026">Q2 2026</SelectItem>
              <SelectItem value="July 2026">July 2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-6 text-info">
          {humanReviewDisclaimer}
        </div>
      </section>

      {loading ? (
        <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {loadingKeys.map((key) => (
              <div key={key} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </section>
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          description="Adjust the project or reporting-period filter to show sample analysis data."
          icon={BarChart3}
          title="No analytics data for this filter"
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
            <ChartPanel title="Project performance trend">
              <ProjectPerformanceTrendChart projects={visibleProjects} />
            </ChartPanel>
            <ChartPanel title="Budget utilization">
              <BudgetUtilizationChart budgets={visibleBudgets} projects={visibleProjects} />
            </ChartPanel>
            <ChartPanel title="SADDD Analysis">
              <SadddChart aggregates={visibleSadddAggregates} />
            </ChartPanel>
            <ChartPanel title="Activity completion">
              <ActivityCompletionChart activities={visibleActivities} />
            </ChartPanel>
            <ChartPanel title="Rule-Based Alerts">
              <AlertCountsChart alerts={visibleAlerts} />
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
