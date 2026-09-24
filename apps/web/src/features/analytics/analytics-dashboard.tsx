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
import { useEffect, useMemo, useState } from 'react'

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
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, ProjectIndicator, ProjectSummary } from '@/types/pathways'
import { type MonitoringDashboard, type SadddDashboard, formatMetricCell } from '@pathways/shared'

import { ActivityCompletionChart, DescriptiveAnalysisChart, SadddChart } from './analytics-charts'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { toProjectCoverageFeatureCollection } from './analytics-location-utils'
import { deriveAnalyticsReportingPeriods } from './analytics-reporting-periods'
import { humanReviewDisclaimer } from './analytics-utils'

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

const missingSadddDates = 'Project reporting dates are not recorded.'

const metricNumber = (cell: { value: string | null }) => {
  if (cell.value === null) return null
  const value = Number(cell.value)
  return Number.isFinite(value) ? value : null
}

export const AnalyticsDashboard = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [period, setPeriod] = useState('')
  const [analysisView, setAnalysisView] = useState<AnalysisView>('kpi')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar')
  const [indicatorId, setIndicatorId] = useState('all')
  const [indicatorDefinitions, setIndicatorDefinitions] = useState<ProjectIndicator[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringDashboard | null>(null)
  const [saddd, setSaddd] = useState<SadddDashboard | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectDataLoading, setProjectDataLoading] = useState(false)
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [sadddLoading, setSadddLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [projectDataError, setProjectDataError] = useState('')
  const [monitoringError, setMonitoringError] = useState('')
  const [sadddError, setSadddError] = useState('')
  const [projectsLoadAttempt, setProjectsLoadAttempt] = useState(0)
  const [projectDataLoadAttempt, setProjectDataLoadAttempt] = useState(0)
  const [monitoringLoadAttempt, setMonitoringLoadAttempt] = useState(0)
  const [sadddLoadAttempt, setSadddLoadAttempt] = useState(0)

  const selectedProject = projects.find((row) => row.id === projectId)
  const projectCoverageFeatures = useMemo(
    () =>
      toProjectCoverageFeatureCollection(
        selectedProject ? { id: selectedProject.id, title: selectedProject.title } : null,
      ),
    [selectedProject],
  )
  const reportingPeriods = useMemo(
    () =>
      deriveAnalyticsReportingPeriods(
        selectedProject,
        indicatorDefinitions.filter((indicator) => indicator.projectId === projectId),
      ),
    [indicatorDefinitions, projectId, selectedProject],
  )
  const selectedPeriod =
    reportingPeriods.find((candidate) => candidate.value === period) ?? reportingPeriods[0]
  const sadddEligible = Boolean(selectedProject?.startDate && selectedProject.endDate)

  useEffect(() => {
    if (!role) {
      setProjectsLoading(false)
      return
    }
    void projectsLoadAttempt
    let active = true
    setProjectsLoading(true)
    setProjectsError('')
    pathwaysClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active) return
        setProjects(records)
        setProjectId((current) =>
          records.some((row) => row.id === current) ? current : (records[0]?.id ?? ''),
        )
      })
      .catch((caught: unknown) => {
        if (active)
          setProjectsError(
            caught instanceof Error ? caught.message : 'Projects could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setProjectsLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectsLoadAttempt, role])

  useEffect(() => {
    if (!projectId || !selectedProject) {
      setProjectDataLoading(false)
      setActivities([])
      setIndicatorDefinitions([])
      return
    }
    void projectDataLoadAttempt
    let active = true
    setProjectDataLoading(true)
    setProjectDataError('')
    setActivities([])
    setIndicatorDefinitions([])
    setPeriod('')
    setMonitoring(null)
    setMonitoringError('')
    Promise.all([
      canReadActivities ? pathwaysClient.getActivities(projectId) : Promise.resolve<Activity[]>([]),
      canReadIndicators
        ? pathwaysClient.getProjectIndicators(projectId)
        : Promise.resolve<ProjectIndicator[]>([]),
    ])
      .then(([nextActivities, nextIndicators]) => {
        if (!active) return
        setActivities(nextActivities)
        setIndicatorDefinitions(nextIndicators)
      })
      .catch((caught: unknown) => {
        if (active)
          setProjectDataError(
            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setProjectDataLoading(false)
      })
    return () => {
      active = false
    }
  }, [canReadActivities, canReadIndicators, projectDataLoadAttempt, projectId, selectedProject])

  useEffect(() => {
    setPeriod((current) =>
      reportingPeriods.some((candidate) => candidate.value === current)
        ? current
        : (reportingPeriods[0]?.value ?? ''),
    )
  }, [reportingPeriods])

  useEffect(() => {
    if (!projectId || !selectedProject) {
      setSadddLoading(false)
      setSaddd(null)
      setSadddError('')
      return
    }
    void sadddLoadAttempt
    setSaddd(null)
    if (!sadddEligible) {
      setSadddLoading(false)
      setSadddError(missingSadddDates)
      return
    }
    let active = true
    setSadddLoading(true)
    setSadddError('')
    pathwaysClient
      .getSadddDashboard({ projectId })
      .then((result) => {
        if (active) setSaddd(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setSadddError(caught instanceof Error ? caught.message : 'SADDD analysis is unavailable.')
      })
      .finally(() => {
        if (active) setSadddLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, sadddEligible, sadddLoadAttempt, selectedProject])

  useEffect(() => {
    if (!projectId || !selectedPeriod) {
      setMonitoringLoading(false)
      setMonitoring(null)
      setMonitoringError('')
      return
    }
    void monitoringLoadAttempt
    let active = true
    setMonitoringLoading(true)
    setMonitoring(null)
    setMonitoringError('')
    pathwaysClient
      .getMonitoringDashboard({
        projectId,
        periodStart: selectedPeriod.start,
        periodEnd: selectedPeriod.end,
      })
      .then((nextMonitoring) => {
        if (active) setMonitoring(nextMonitoring)
      })
      .catch((caught: unknown) => {
        if (active)
          setMonitoringError(
            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setMonitoringLoading(false)
      })
    return () => {
      active = false
    }
  }, [monitoringLoadAttempt, projectId, selectedPeriod])

  const handleProjectChange = (nextProjectId: string) => {
    if (nextProjectId === projectId) return
    setProjectId(nextProjectId)
    setPeriod('')
    setIndicatorDefinitions([])
    setMonitoring(null)
    setActivities([])
    setSaddd(null)
    setProjectDataLoading(true)
    setMonitoringLoading(false)
    setSadddLoading(false)
    setProjectDataError('')
    setMonitoringError('')
    setSadddError('')
  }

  const mapSelected = visualizationType === 'map'
  const mapDataLoading = projectDataLoading || monitoringLoading
  const mapDataError = projectDataError || monitoringError
  const loading = projectsLoading || (!mapSelected && (projectDataLoading || monitoringLoading))
  const error = projectsError || (!mapSelected ? projectDataError || monitoringError : '')
  const retryLoad = () => {
    if (projectsError) setProjectsLoadAttempt((value) => value + 1)
    else if (projectDataError) setProjectDataLoadAttempt((value) => value + 1)
    else setMonitoringLoadAttempt((value) => value + 1)
  }
  const indicators =
    monitoring?.indicators.filter(
      (row) => row.projectId === projectId && row.status === 'ACTIVE',
    ) ?? []
  const analysisMeta = {
    kpi: { title: 'KPI / indicator performance', unit: '%' },
    participation: { title: 'Participation patterns', unit: 'records' },
    survey: { title: 'Survey improvement', unit: 'points' },
    timeline: { title: 'Project / activity timeline adherence', unit: '%' },
  }[analysisView]
  const analysisRows = useMemo(() => {
    if (!selectedProject || !monitoring) return []
    if (analysisView === 'kpi')
      return indicators
        .filter((row) => indicatorId === 'all' || row.id === indicatorId)
        .flatMap((row) => {
          const value = metricNumber(row.progress)
          return value === null ? [] : [{ id: row.id, label: row.name, value }]
        })
    if (analysisView === 'participation') {
      const value = metricNumber(monitoring.participationRecords)
      return value === null ? [] : [{ id: selectedProject.id, label: selectedProject.title, value }]
    }
    return []
  }, [analysisView, indicatorId, indicators, monitoring, selectedProject])
  const progressValues = indicators
    .map((row) => metricNumber(row.progress))
    .filter((value): value is number => value !== null)
  const averageKpi = progressValues.length
    ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
    : null
  const completedActivities = activities.filter(
    (activity) => activity.status === 'Completed',
  ).length
  const canViewRules = Boolean(role && can(role, 'rules.view'))
  const canConfigureRules = Boolean(role && can(role, 'rules.configure'))

  return (
    <div className="space-y-6">
      <PageHeader
        editableLabelKey="moduleAnalytics"
        actions={
          canViewRules ? (
            <Button asChild>
              <Link href="/alerts/repository">
                {canConfigureRules ? 'Manage alert rules' : 'View alert rules'}
              </Link>
            </Button>
          ) : undefined
        }
        title={labels.moduleAnalytics}
      />
      <section
        aria-labelledby="analytics-view-title"
        className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12"
      >
        <div className="sm:col-span-2 xl:col-span-12">
          <h2 className="text-lg font-semibold" id="analytics-view-title">
            Analysis and visualization
          </h2>
        </div>
        <div className="space-y-2 xl:col-span-4">
          <span className="text-sm font-medium">Project filter</span>
          <Select value={projectId} onValueChange={handleProjectChange}>
            <SelectTrigger aria-label="Project filter">
              <SelectValue placeholder="No authorized projects" />
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
        <div className="space-y-2 xl:col-span-2">
          <span className="text-sm font-medium">Reporting period</span>
          <Select
            disabled={reportingPeriods.length === 0}
            value={selectedPeriod?.value ?? ''}
            onValueChange={setPeriod}
          >
            <SelectTrigger aria-label="Reporting period">
              <SelectValue placeholder="No reporting periods" />
            </SelectTrigger>
            <SelectContent>
              {reportingPeriods.map((row) => (
                <SelectItem key={row.value} value={row.value}>
                  {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 xl:col-span-3">
          <span className="text-sm font-medium">Analysis view</span>
          <Select
            value={analysisView}
            onValueChange={(value) => setAnalysisView(value as AnalysisView)}
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
        <div className="space-y-2 xl:col-span-3 xl:col-start-7 xl:row-start-3">
          <span className="text-sm font-medium">Visualization type</span>
          <Select
            value={visualizationType}
            onValueChange={(value) => setVisualizationType(value as VisualizationType)}
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
        <div className="space-y-2 sm:col-span-2 xl:col-span-6 xl:row-start-3">
          <span className="text-sm font-medium">Indicator</span>
          <Select
            disabled={analysisView !== 'kpi'}
            value={indicatorId}
            onValueChange={setIndicatorId}
          >
            <SelectTrigger aria-label="Indicator filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All indicators / project KPI</SelectItem>
              {indicators.map((indicator) => (
                <SelectItem key={indicator.id} value={indicator.id}>
                  {indicator.code} · {indicator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-sm border border-info/25 bg-info-subtle p-3 text-sm leading-6 text-info sm:col-span-2 xl:col-span-3 xl:col-start-10 xl:row-start-2">
          {humanReviewDisclaimer}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 sm:col-span-2 xl:col-span-12 xl:row-start-4">
          <Button disabled className="shrink-0" type="button">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add to Dashboard
          </Button>
        </div>
      </section>

      {loading ? (
        <AsyncState
          status="loading"
          title="Loading analytics"
          description="Loading scoped server data."
          icon={BarChart3}
        />
      ) : error ? (
        <AsyncState
          status="error"
          title="Analytics data unavailable"
          description={error}
          icon={AlertTriangle}
          onRetry={retryLoad}
        />
      ) : !selectedProject ? (
        <EmptyState
          description="No authorized project is available for this account."
          icon={BarChart3}
          title="No analytics data for this filter"
        />
      ) : (
        <>
          <ChartPanel
            description={
              mapSelected
                ? `Interactive coverage for ${selectedProject.title}. Only authoritative persisted project coordinates are plotted.`
                : undefined
            }
            title={
              mapSelected
                ? 'Project Coverage Map'
                : `${analysisMeta.title} · ${visualizationTypes.find((type) => type.value === visualizationType)?.label}`
            }
          >
            {mapSelected ? (
              <>
                <AnalyticsCoverageMap featureCollection={projectCoverageFeatures} />
                {mapDataLoading ? (
                  <output className="mt-4 rounded-sm border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
                    Updating project analytics.
                  </output>
                ) : mapDataError ? (
                  <div
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger/30 bg-danger-subtle p-3 text-sm text-danger"
                    role="alert"
                  >
                    <span>{mapDataError}</span>
                    <Button
                      onClick={() =>
                        projectDataError
                          ? setProjectDataLoadAttempt((value) => value + 1)
                          : setMonitoringLoadAttempt((value) => value + 1)
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Retry analytics
                    </Button>
                  </div>
                ) : null}
              </>
            ) : !selectedPeriod ? (
              <UnavailableChart description="No active Indicator reporting period is available for this project." />
            ) : analysisRows.length === 0 ? (
              <UnavailableChart
                description={
                  analysisView === 'survey' || analysisView === 'timeline'
                    ? 'This analysis view is unavailable in the current API.'
                    : 'No released values are available for this selection.'
                }
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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              description="Average of released indicator progress values in this project and period."
              icon={Target}
              label="KPI achievement"
              tone={averageKpi === null ? 'info' : averageKpi >= 70 ? 'success' : 'warning'}
              value={averageKpi === null ? 'Unavailable' : `${averageKpi}%`}
            />
            <MetricCard
              description="Budget utilization is unavailable in the current API."
              icon={CircleDollarSign}
              label="Budget utilization"
              tone="info"
              value="Unavailable"
            />
            <MetricCard
              description="Beneficiary reach is unavailable as a distinct server metric for this view."
              icon={UsersRound}
              label="Beneficiary reach"
              tone="info"
              value="Unavailable"
            />
            <MetricCard
              description="Completed activities in the selected project."
              icon={ClipboardCheck}
              label="Activity completion"
              tone="success"
              value={
                canReadActivities ? `${completedActivities}/${activities.length}` : 'Unavailable'
              }
            />
            <MetricCard
              description="Rule-Based Alerts are unavailable in the current API."
              icon={AlertTriangle}
              label="Rule-Based Alerts"
              tone="info"
              value="Unavailable"
            />
          </section>
          <section className="space-y-6" aria-labelledby="fixed-monitoring-charts-title">
            <h2 className="text-lg font-semibold" id="fixed-monitoring-charts-title">
              Monitoring charts
            </h2>
            <ChartPanel title="Project performance trend">
              <UnavailableChart description="Project performance history is unavailable in the current API." />
            </ChartPanel>
            <ChartPanel title="SADDD Analysis">
              {sadddLoading ? (
                <AsyncState
                  status="loading"
                  title="Loading SADDD analysis"
                  description="Loading the scoped beneficiary aggregate data."
                  icon={UsersRound}
                />
              ) : sadddError ? (
                <AsyncState
                  status="error"
                  title="SADDD analysis unavailable"
                  description={sadddError}
                  icon={AlertTriangle}
                  onRetry={
                    sadddEligible ? () => setSadddLoadAttempt((value) => value + 1) : undefined
                  }
                />
              ) : saddd ? (
                <>
                  <StatusMessage>SADDD analysis loaded.</StatusMessage>
                  <div data-testid="saddd-chart">
                    <SadddChart dashboard={saddd} />
                  </div>
                  <details className="mt-3 rounded-sm border border-border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Accessible SADDD data table
                    </summary>
                    <table className="mt-3 w-full text-left">
                      <thead>
                        <tr>
                          <th>Dimension</th>
                          <th>Category</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...saddd.sex.map((row) => ({ ...row, dimension: 'Sex' })),
                          ...saddd.age.map((row) => ({ ...row, dimension: 'Age' })),
                          ...saddd.disability.map((row) => ({ ...row, dimension: 'Disability' })),
                        ].map((row) => (
                          <tr key={`${row.dimension}-${row.key}`}>
                            <td>{row.dimension}</td>
                            <td>{row.label}</td>
                            <td>{formatMetricCell(row.metric)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              ) : (
                <UnavailableChart description="SADDD analysis is unavailable for this project." />
              )}
            </ChartPanel>
            <ChartPanel title="Activity completion">
              {canReadActivities ? (
                <ActivityCompletionChart activities={activities} />
              ) : (
                <UnavailableChart description="Activity details are not available for this role." />
              )}
            </ChartPanel>
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Budget utilization">
                <UnavailableChart description="Budget utilization is unavailable in the current API." />
              </ChartPanel>
              <ChartPanel title="Rule-Based Alerts">
                <UnavailableChart description="Rule-Based Alerts are unavailable in the current API." />
              </ChartPanel>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const ChartPanel = ({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) => (
  <section className="overflow-hidden rounded-lg border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
)

const UnavailableChart = ({ description }: { description: string }) => (
  <EmptyState description={description} icon={BarChart3} title="Data unavailable" />
)
