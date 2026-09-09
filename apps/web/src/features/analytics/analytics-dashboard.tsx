'use client'

import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  Plus,
  Target,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, StatusMessage } from '@/components/pathways'
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
import { addDashboardChart } from '@/lib/demo-state/dashboard-charts'
import { hasAction } from '@/lib/demo-state/permissions'
import { demoPolicy, recordDemoAccess } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
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
  DescriptiveAnalysisChart,
  ProjectPerformanceTrendChart,
  SadddChart,
} from './analytics-charts'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { buildLocationInsights } from './analytics-location-utils'
import { formatNumber, formatPercent, humanReviewDisclaimer } from './analytics-utils'

const allValue = 'all'
const loadingKeys = ['kpi', 'budget', 'reach']
const analysisViews = [
  { value: 'kpi', label: 'KPI / indicator performance' },
  { value: 'participation', label: 'Participation patterns' },
  { value: 'survey', label: 'Survey improvement' },
  { value: 'timeline', label: 'Project / activity timeline adherence' },
] as const
const visualizationTypes = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
  { value: 'table', label: 'Table' },
  { value: 'map', label: 'Map' },
] as const
type AnalysisView = (typeof analysisViews)[number]['value']
type VisualizationType = (typeof visualizationTypes)[number]['value']

type AnalyticsDashboardProps = {
  projects: ProjectDetail[]
  activities: Activity[]
  budgets: BudgetRecord[]
  alerts: AlertRecord[]
  locations: AnalyticsLocationRecord[]
}

export const AnalyticsDashboard = ({
  projects: initialProjects,
  activities: initialActivities,
  budgets: initialBudgets,
  alerts: initialAlerts,
  locations,
}: AnalyticsDashboardProps) => {
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const [projectId, setProjectId] = useState(allValue)
  const [period, setPeriod] = useState('Q2 2026')
  const [analysisView, setAnalysisView] = useState<AnalysisView>('kpi')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar')
  const [indicatorId, setIndicatorId] = useState(allValue)
  const [loading, setLoading] = useState(false)
  const [sadddAggregates, setSadddAggregates] = useState<BeneficiarySadddAggregate[]>([])
  const [sadddLoadState, setSadddLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [sadddLoadAttempt, setSadddLoadAttempt] = useState(0)
  const accessLogged = useRef(false)
  const demo = useDemoState()
  const projects =
    demo.scenario === 'empty-data' ? [] : demo.projects.length ? demo.projects : initialProjects
  const activities =
    demo.scenario === 'empty-data'
      ? []
      : demo.activities.length
        ? demo.activities
        : initialActivities
  const budgets =
    demo.scenario === 'empty-data' ? [] : demo.budgets.length ? demo.budgets : initialBudgets
  const alerts =
    demo.scenario === 'empty-data' ? [] : demo.alerts.length ? demo.alerts : initialAlerts

  const roleScopedProjects = useMemo(
    () => projects.filter((project) => canAccessProjectForRole(role, project.id)),
    [projects, role],
  )

  useEffect(() => {
    if (accessLogged.current) return
    accessLogged.current = true
    const retrievalFailed = demo.scenario === 'retrieval-failure'
    const renderingFailed = demo.scenario === 'render-failure'
    for (const [action, failed, details] of [
      ['monitoring.view', retrievalFailed, 'Opened the authorized project-monitoring summary.'],
      ['analytics.view', retrievalFailed, 'Opened descriptive analytics and scope controls.'],
      ['saddd.view', retrievalFailed, 'Opened the scoped SADDD analysis.'],
      [
        'visualizations.view',
        retrievalFailed || renderingFailed,
        'Opened the interactive visualization workspace.',
      ],
    ] as const) {
      try {
        recordDemoAccess(
          action,
          failed ? `${details} Local scenario reported a failure.` : details,
          {
            outcome: failed ? 'Failure' : 'Success',
          },
        )
      } catch {
        // The route guard owns denied-route feedback; the ledger records the attempt.
      }
    }
  }, [demo.scenario])

  useEffect(() => {
    void sadddLoadAttempt
    void demo.revision
    let active = true
    setSadddLoadState('loading')

    if (demo.scenario === 'retrieval-failure') {
      setSadddLoadState('error')
      return () => {
        active = false
      }
    }

    void pathwaysClient
      .getBeneficiarySadddAggregatesForRole(role)
      .then((aggregates) => {
        if (active) {
          setSadddAggregates(aggregates)
          setSadddLoadState('ready')
        }
      })
      .catch(() => {
        if (active) {
          setSadddLoadState('error')
        }
      })

    return () => {
      active = false
    }
  }, [role, sadddLoadAttempt, demo.scenario, demo.revision])

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
  const visibleIndicators = demo.indicators.filter((indicator) =>
    visibleProjectIds.includes(indicator.projectId),
  )

  useEffect(() => {
    if (
      indicatorId !== allValue &&
      !visibleIndicators.some((indicator) => indicator.id === indicatorId)
    ) {
      setIndicatorId(allValue)
    }
  }, [indicatorId, visibleIndicators])

  const analysisRows = useMemo(
    () =>
      visibleProjects.flatMap((project) => {
        const projectActivities = visibleActivities.filter(
          (activity) => activity.projectId === project.id,
        )
        const selectedIndicator = visibleIndicators.find(
          (indicator) => indicator.id === indicatorId && indicator.projectId === project.id,
        )
        if (indicatorId !== allValue && !selectedIndicator) return []

        if (analysisView === 'participation')
          return [{ id: project.id, label: project.title, value: project.beneficiariesReached }]

        if (analysisView === 'timeline') {
          if (!projectActivities.length) return []
          return [
            {
              id: project.id,
              label: project.title,
              value: Math.round(
                projectActivities.reduce((sum, activity) => sum + activity.progress, 0) /
                  projectActivities.length,
              ),
            },
          ]
        }

        if (analysisView === 'survey') {
          const beneficiaryDeltas = demo.beneficiaries.flatMap((beneficiary) => {
            if (!beneficiary.projectIds.includes(project.id)) return []
            const assessments = beneficiary.assessments
              .filter((assessment) => assessment.projectId === project.id)
              .sort((left, right) => left.assessedAt.localeCompare(right.assessedAt))
            return assessments.length > 1
              ? [(assessments.at(-1)?.score ?? 0) - assessments[0].score]
              : []
          })
          if (!beneficiaryDeltas.length) return []
          return [
            {
              id: project.id,
              label: project.title,
              value: Math.round(
                beneficiaryDeltas.reduce((sum, value) => sum + value, 0) / beneficiaryDeltas.length,
              ),
            },
          ]
        }

        const value = selectedIndicator
          ? selectedIndicator.target > 0
            ? Math.round((selectedIndicator.actual / selectedIndicator.target) * 100)
            : 0
          : project.kpiAchievement
        return [{ id: project.id, label: project.title, value }]
      }),
    [
      analysisView,
      demo.beneficiaries,
      indicatorId,
      visibleActivities,
      visibleIndicators,
      visibleProjects,
    ],
  )
  const analysisMeta = {
    kpi: { title: 'KPI / indicator performance', unit: '%' },
    participation: { title: 'Participation patterns', unit: 'people' },
    survey: { title: 'Survey improvement', unit: 'points' },
    timeline: { title: 'Project / activity timeline adherence', unit: '%' },
  }[analysisView]

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
  const visibleBeneficiaries = demo.beneficiaries.filter((beneficiary) =>
    beneficiary.projectIds.some((id) => visibleProjectIds.includes(id)),
  )
  const incompleteSaddd = visibleBeneficiaries.filter(
    (beneficiary) =>
      beneficiary.sex === 'Prefer not to say' || beneficiary.disabilityStatus === 'Not disclosed',
  ).length
  const incompletePercent = visibleBeneficiaries.length
    ? Math.round((incompleteSaddd / visibleBeneficiaries.length) * 100)
    : 0
  const canAddDashboardChart =
    hasAction(role, 'dashboard.configure') &&
    projectId !== allValue &&
    (visualizationType === 'bar' || visualizationType === 'line') &&
    analysisRows.length > 0
  const savedChartCount =
    projectId === allValue
      ? 0
      : demo.dashboardCharts.filter((chart) => chart.projectId === projectId).length

  const saveCurrentChart = () => {
    if (!canAddDashboardChart || projectId === allValue) return
    try {
      addDashboardChart({
        projectId,
        analysis: analysisView,
        visualization: visualizationType as 'bar' | 'line',
        indicatorId: analysisView === 'kpi' && indicatorId !== allValue ? indicatorId : undefined,
        period,
      })
      toast.success('Chart added to this project dashboard.', {
        description: 'Use View project dashboard to arrange or resize it.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chart could not be added.')
    }
  }

  if (demo.scenario === 'render-failure')
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="The local visualization renderer was intentionally interrupted. Clear the scenario and retry."
        icon={AlertTriangle}
        status="error"
        title="Analytics rendering failed"
      />
    )

  if (demo.scenario === 'retrieval-failure')
    return (
      <AsyncState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="The authorized monitoring dataset could not be retrieved in this deterministic local scenario. Clear the scenario and retry. The failed access is recorded in the audit trail."
        icon={AlertTriangle}
        status="error"
        title="Analytics data unavailable"
      />
    )

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canReviewAlerts || canViewRules ? (
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
          ) : undefined
        }
        description="Project performance, SADDD Analysis, budget utilization, aggregate location coverage, Beneficiary reach, and Rule-Based Alerts for human review."
        title={labels.moduleAnalytics}
      />

      <section className="grid gap-3 rounded-lg border border-border bg-card p-5 md:grid-cols-2 xl:grid-cols-[1fr_240px_240px]">
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
        <div className="rounded-sm border border-info/25 bg-info-subtle p-3 text-sm leading-6 text-info">
          {humanReviewDisclaimer}
        </div>
      </section>

      <section
        aria-labelledby="analytics-view-title"
        className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="space-y-1 md:col-span-2 xl:col-span-4">
          <h2 className="text-lg font-semibold" id="analytics-view-title">
            Analysis and visualization
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose the required descriptive analysis, then switch the same scoped result among a bar
            chart, line chart, accessible table, or aggregate map.
          </p>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Analysis view</span>
          <Select
            value={analysisView}
            onValueChange={(value) => refreshFilter(() => setAnalysisView(value as AnalysisView))}
          >
            <SelectTrigger aria-label="Analysis view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {analysisViews.map((view) => (
                <SelectItem key={view.value} value={view.value}>
                  {view.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Visualization type</span>
          <Select
            value={visualizationType}
            onValueChange={(value) =>
              refreshFilter(() => setVisualizationType(value as VisualizationType))
            }
          >
            <SelectTrigger aria-label="Visualization type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visualizationTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">Indicator</span>
          <Select
            disabled={analysisView !== 'kpi'}
            value={indicatorId}
            onValueChange={(value) => refreshFilter(() => setIndicatorId(value))}
          >
            <SelectTrigger aria-label="Indicator filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>All indicators / project KPI</SelectItem>
              {visibleIndicators.map((indicator) => (
                <SelectItem key={indicator.id} value={indicator.id}>
                  {indicator.code} · {indicator.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-sm border border-info/25 bg-info-subtle p-3 text-sm leading-6 text-info">
          Active scope:{' '}
          {projectId === allValue ? 'all authorized projects' : visibleProjects[0]?.title}
          {' · '}
          {period}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 md:col-span-2 md:flex-row md:items-center md:justify-between xl:col-span-4">
          <p className="text-sm text-muted-foreground">
            {projectId === allValue
              ? 'Choose one project to save this chart to its Monitoring Dashboard.'
              : visualizationType === 'table' || visualizationType === 'map'
                ? 'Choose Bar chart or Line chart before adding it to the Monitoring Dashboard.'
                : analysisRows.length === 0
                  ? 'This selection needs data before it can be added to the Monitoring Dashboard.'
                  : `Save this chart only to ${visibleProjects[0]?.title}'s Monitoring Dashboard.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {projectId !== allValue && savedChartCount > 0 ? (
              <Button asChild className="shrink-0" variant="outline">
                <Link href={`/dashboard?project=${projectId}`}>View project dashboard</Link>
              </Button>
            ) : null}
            <Button
              className="shrink-0"
              disabled={!canAddDashboardChart}
              onClick={saveCurrentChart}
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add to Dashboard
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="rounded-lg border border-border bg-card p-8">
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

          {visualizationType === 'map' ? (
            <AnalyticsCoverageMap
              locations={visibleLocations}
              period={period}
              projects={visibleProjects}
            />
          ) : (
            <ChartPanel
              title={`${analysisMeta.title} · ${visualizationTypes.find((type) => type.value === visualizationType)?.label}`}
            >
              {analysisRows.length === 0 ? (
                <EmptyState
                  description="This selection does not have enough linked data. Choose another analysis view, indicator, project, or reporting period."
                  icon={BarChart3}
                  title="Insufficient data for this view"
                />
              ) : visualizationType === 'table' ? (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{analysisMeta.title}</caption>
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Project</th>
                      <th className="p-3">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisRows.map((row) => (
                      <tr className="border-b" key={row.id}>
                        <td className="p-3">{row.label}</td>
                        <td className="p-3 tabular-nums">
                          {row.value.toLocaleString()} {analysisMeta.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <DescriptiveAnalysisChart
                  rows={analysisRows}
                  title={analysisMeta.title}
                  type={visualizationType}
                  unit={analysisMeta.unit}
                />
              )}
            </ChartPanel>
          )}

          <section className="space-y-6" aria-labelledby="fixed-monitoring-charts-title">
            <div>
              <h2 className="text-lg font-semibold" id="fixed-monitoring-charts-title">
                Fixed monitoring charts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These required views stay full width, keep a fixed height, and cannot be edited or
                rearranged.
              </p>
            </div>
            <ChartPanel title="Project performance trend">
              <ProjectPerformanceTrendChart projects={visibleProjects} />
            </ChartPanel>
            <ChartPanel title="SADDD Analysis">
              {incompletePercent >= demoPolicy.sadddMissingPercent ? (
                <output
                  className="mb-6 block rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm leading-6 text-warning"
                  data-testid="saddd-data-quality-warning"
                >
                  Data quality warning: {incompletePercent}% of scoped beneficiary records contain
                  an undisclosed SADDD dimension. Interpret disaggregation carefully.
                </output>
              ) : null}
              {sadddLoadState === 'loading' ? (
                <AsyncState
                  description="Loading the scoped Beneficiary aggregate data."
                  icon={UsersRound}
                  status="loading"
                  title="Loading SADDD analysis"
                />
              ) : null}
              {sadddLoadState === 'error' ? (
                <AsyncState
                  description="The scoped Beneficiary aggregate data could not be loaded. Check your connection and try again."
                  icon={AlertTriangle}
                  onRetry={() => setSadddLoadAttempt((attempt) => attempt + 1)}
                  status="error"
                  title="SADDD analysis unavailable"
                />
              ) : null}
              {sadddLoadState === 'ready' ? (
                <>
                  <StatusMessage>SADDD analysis loaded.</StatusMessage>
                  <div data-testid="saddd-chart">
                    <SadddChart aggregates={visibleSadddAggregates} />
                  </div>
                  <details className="mt-3 rounded-sm border border-border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Accessible SADDD data table
                    </summary>
                    <table className="mt-3 w-full text-left">
                      <thead>
                        <tr>
                          <th>Sex</th>
                          <th>Age</th>
                          <th>Disability</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSadddAggregates.map((row, index) => (
                          <tr
                            key={`${row.projectId}-${row.sex}-${row.ageGroup}-${row.disabilityStatus}-${index}`}
                          >
                            <td>{row.sex}</td>
                            <td>{row.ageGroup}</td>
                            <td>{row.disabilityStatus}</td>
                            <td>{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              ) : null}
            </ChartPanel>
            <ChartPanel title="Activity completion">
              <ActivityCompletionChart activities={visibleActivities} />
            </ChartPanel>
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Budget utilization">
                <BudgetUtilizationChart budgets={visibleBudgets} projects={visibleProjects} />
              </ChartPanel>
              <ChartPanel title="Rule-Based Alerts">
                <AlertCountsChart alerts={visibleAlerts} />
              </ChartPanel>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const ChartPanel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="overflow-hidden rounded-lg border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
)
