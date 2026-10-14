'use client'

import { AlertTriangle, BarChart3, ChevronDown, Download, Plus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED,
  DASHBOARD_PINS_UI_ENABLED,
  MAPS_UI_ENABLED,
} from '@/constants/feature-flags'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { activitiesClient } from '@/lib/api/activities'
import { dashboardsClient } from '@/lib/api/dashboards'
import { indicatorsClient } from '@/lib/api/indicators'
import { projectsClient } from '@/lib/api/projects'
import { addPin } from '@/lib/dashboard-pins'
import { formatCalendarDay } from '@/lib/format/date'
import { can } from '@/lib/rbac/can'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { ActivitySummary, ProjectSummary } from '@/types/pathways'
import type { IndicatorResponse, MonitoringDashboard } from '@pathways/shared'
import { toast } from 'sonner'

import {
  deriveAnalyticsReportingPeriods,
  nonOverlappingAnalyticsPeriods,
} from '../analytics-reporting-periods.utils'
import {
  type AnalysisView,
  SURVEY_CLOSED_PERIOD_MESSAGE,
  SURVEY_RESTRICTED_MESSAGE,
  type VisualizationType,
  analysisViews,
  exportFormats,
  visualizationTypes,
} from '../analytics.copy'
import { countOpenAlerts } from '../analytics.reads'
import { businessDateInManila } from '../analytics.utils'
import { useAnalyticsExport } from '../hooks/use-analytics-export'
import {
  canReadInsight,
  useBudgetSummary,
  useIndicatorTrends,
  useParticipationBreakdown,
} from '../hooks/use-analytics-insights'
import { useDescriptiveAnalytics } from '../hooks/use-descriptive-analytics'
import { useSadddDashboard } from '../hooks/use-saddd-dashboard'
import { useSurveyAnalytics } from '../hooks/use-survey-analytics'
import { useTimelineAnalytics } from '../hooks/use-timeline-analytics'
import { activeIndicators, metricNumber, progressRows } from '../kpi-rows.utils'
import {
  ActivityCompletionChart,
  DescriptiveAnalysisChart,
  IndicatorProgressChart,
} from './analytics-charts'
import { AnalyticsExportPreviewDialog } from './analytics-export-preview'
import { AnalyticsSummaryCards } from './analytics-summary-cards'
import { BudgetSummaryCard } from './budget-summary-card'
import { ChartPanel, UnavailableChart } from './chart-panel'
import { DescriptiveStatisticsPanel } from './descriptive-statistics-panel'
import { IndicatorTrendChart } from './indicator-trend-chart'
import { InsightStatus } from './insight-status'
import { OpenAlertsPanel } from './open-alerts-panel'
import { ParticipationBreakdownPanel } from './participation-breakdown-panel'
import { ProjectCoverageMapPanel } from './project-coverage-map-panel'
import { SadddAnalysisPanel } from './saddd-analysis-panel'
import { SurveyAnalyticsPanel } from './survey-analytics-panel'
import { TimelineAnalyticsPanel } from './timeline-analytics-panel'

export const AnalyticsDashboard = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  // Definitions need indicators.read; other monitoring roles read released values for periods and KPIs.
  const canReadIndicatorDefinitions =
    canReadIndicators && principalHasAtomicPermission(profile, 'indicators.read')
  const canReadIndicatorValues =
    canReadIndicators && principalHasAtomicPermission(profile, 'reports.indicator.read')
  const canReadDescriptive = principalHasAtomicPermission(profile, 'analytics.descriptive.read')
  // Survey and timeline read person-derived aggregates, so the API requires both permissions
  // (analytics.descriptive.read and monitoring.read). Anything less is restricted, never "None yet".
  const canReadSurveyTimeline = canReadDescriptive && canReadIndicators
  const canReadSurvey = canReadSurveyTimeline
  // Roles without assessments.detail.read (Program/Grant Manager) get a frozen release of closed periods only.
  const surveyFrozenOnly = !principalHasAtomicPermission(profile, 'assessments.detail.read')
  const canExportAnalytics =
    canReadDescriptive && principalHasAtomicPermission(profile, 'analytics.export')
  const canReadBudgetUtilization = canReadInsight(profile, 'budget')
  const canReadTrends = canReadInsight(profile, 'trends')
  const canReadParticipation = canReadInsight(profile, 'participation')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [period, setPeriod] = useState('')
  const [analysisView, setAnalysisView] = useState<AnalysisView>('kpi')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar')
  const [indicatorId, setIndicatorId] = useState('all')
  const [indicatorDefinitions, setIndicatorDefinitions] = useState<IndicatorResponse[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringDashboard | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectDataLoading, setProjectDataLoading] = useState(false)
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [projectDataError, setProjectDataError] = useState('')
  const [monitoringError, setMonitoringError] = useState('')
  const [projectsLoadAttempt, setProjectsLoadAttempt] = useState(0)
  const [projectDataLoadAttempt, setProjectDataLoadAttempt] = useState(0)
  const [monitoringLoadAttempt, setMonitoringLoadAttempt] = useState(0)

  const selectedProject = projects.find((row) => row.id === projectId)
  const canReadAlerts = principalHasAtomicPermission(profile, 'alerts.read')
  const alertRead = useAuthorizedRead(
    'analytics-open-alerts',
    projectId || null,
    'alerts.read',
    (signal) => countOpenAlerts(projectId, signal),
    Boolean(projectId),
  )
  const openAlerts = alertRead.data ?? null
  // A capped count is shown as "N+" rather than passed off as exact.
  const openAlertText = openAlerts ? `${openAlerts.count}${openAlerts.capped ? '+' : ''}` : ''
  const alertsLoading = canReadAlerts && Boolean(projectId) && !openAlerts && !alertRead.isError
  const alertsFailed = canReadAlerts && !openAlerts && alertRead.isError
  const reportingPeriods = useMemo(
    () =>
      deriveAnalyticsReportingPeriods(
        selectedProject,
        indicatorDefinitions.filter((indicator) => indicator.projectId === projectId),
      ),
    [indicatorDefinitions, projectId, selectedProject],
  )
  // Monitoring, KPI and descriptive panels always use every readable reporting period.
  const selectedPeriod =
    reportingPeriods.find((candidate) => candidate.value === period) ?? reportingPeriods[0]
  // The survey releases only non-overlapping periods, so it keeps its own period. It never
  // rewrites the shared period, so leaving the survey view restores the other panels' period.
  const surveyPeriods = useMemo(
    () => nonOverlappingAnalyticsPeriods(reportingPeriods),
    [reportingPeriods],
  )
  const surveyPeriod =
    surveyPeriods.find((candidate) => candidate.value === period) ?? surveyPeriods[0]
  const surveyClosedPeriodRequired =
    surveyFrozenOnly && !(surveyPeriod && surveyPeriod.end < businessDateInManila())
  const surveyUnavailable = !canReadSurvey || surveyClosedPeriodRequired
  const pickerPeriods = analysisView === 'survey' ? surveyPeriods : reportingPeriods
  const pickerPeriod = analysisView === 'survey' ? surveyPeriod : selectedPeriod
  // SADDD is released live to date once the project starts; a not-started project gets a notice, not an error.
  const sadddNotice =
    !selectedProject?.startDate || !selectedProject.endDate
      ? {
          title: 'SADDD needs project dates',
          description:
            "Record this project's start and end dates to enable the sex, age and disability breakdown.",
        }
      : selectedProject.startDate > businessDateInManila()
        ? {
            title: `SADDD opens when this project starts on ${formatCalendarDay(selectedProject.startDate)}`,
            description:
              'Sex, age and disability breakdowns are shown once the project has started. Select a started project to see them now.',
          }
        : null
  // Roles without the SADDD release grant (Project Officers) get no SADDD card or request.
  const canReadSaddd = principalHasAtomicPermission(profile, 'analytics.saddd.read')
  const sadddEligible = canReadSaddd && sadddNotice === null
  const sadddOngoing = sadddEligible && (selectedProject?.endDate ?? '') >= businessDateInManila()
  const periodRange = selectedPeriod
    ? { periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end }
    : {}
  const insightProject = projectId || null
  const budgetRead = useBudgetSummary({ projectId: insightProject }, canReadBudgetUtilization)
  const trendsRead = useIndicatorTrends(
    { projectId: insightProject, ...periodRange },
    canReadTrends && analysisView === 'kpi',
  )
  const participationRead = useParticipationBreakdown(
    { projectId: insightProject, ...periodRange },
    canReadParticipation && analysisView === 'participation',
  )

  useEffect(() => {
    if (!role) {
      setProjectsLoading(false)
      return
    }
    void projectsLoadAttempt
    let active = true
    setProjectsLoading(true)
    setProjectsError('')
    projectsClient
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
      canReadActivities
        ? activitiesClient.getActivities(projectId)
        : Promise.resolve<ActivitySummary[]>([]),
      canReadIndicatorDefinitions
        ? indicatorsClient.getProjectIndicators(projectId)
        : canReadIndicatorValues
          ? indicatorsClient.getProjectIndicatorValues(projectId)
          : Promise.resolve<IndicatorResponse[]>([]),
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
  }, [
    canReadActivities,
    canReadIndicatorDefinitions,
    canReadIndicatorValues,
    projectDataLoadAttempt,
    projectId,
    selectedProject,
  ])

  useEffect(() => {
    setPeriod((current) =>
      reportingPeriods.some((candidate) => candidate.value === current)
        ? current
        : (reportingPeriods[0]?.value ?? ''),
    )
  }, [reportingPeriods])

  const { resetSaddd, retrySaddd, saddd, sadddError, sadddLoading } = useSadddDashboard({
    projectId,
    sadddEligible,
    selectedProject,
  })

  useEffect(() => {
    if (!projectId || !selectedPeriod || !canReadIndicators) {
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
    dashboardsClient
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
  }, [canReadIndicators, monitoringLoadAttempt, projectId, selectedPeriod])

  const { descriptive, descriptiveError, descriptiveLoading, resetDescriptive, retryDescriptive } =
    useDescriptiveAnalytics({ canReadDescriptive, projectId, selectedPeriod })

  const { resetSurvey, retrySurvey, survey, surveyError, surveyErrorKind, surveyLoading } =
    useSurveyAnalytics({
      analysisView,
      projectId,
      surveyFrozenOnly,
      surveyPeriod,
      surveyUnavailable,
    })

  const { resetTimeline, retryTimeline, timeline, timelineError, timelineLoading } =
    useTimelineAnalytics({ analysisView, canReadSurveyTimeline, projectId })

  const { closeExportPreview, downloadExport, exportPreview, exporting, previewExport } =
    useAnalyticsExport({
      analysisView,
      canExportAnalytics,
      projectId,
      selectedPeriod,
      surveyPeriod,
      surveyUnavailable,
    })

  // Views and pins the role cannot read are hidden rather than shown as unavailable.
  const viewPermitted: Record<AnalysisView, boolean> = {
    kpi: true,
    participation: canReadParticipation,
    survey: canReadSurvey,
    timeline: canReadSurveyTimeline,
  }
  const pinPermitted = {
    kpi: canReadIndicators,
    participation: canReadParticipation,
    survey: true,
    timeline: canReadSurveyTimeline,
  }[analysisView]
  // The pinned card re-reads the same source, so pinning needs the same permission and period.
  const pinBlockedReason = {
    kpi: !canReadIndicators
      ? 'Your role cannot read indicator progress, so this view cannot be pinned.'
      : !selectedPeriod
        ? 'Choose a reporting period to pin this view.'
        : '',
    participation: canReadParticipation
      ? ''
      : 'Your role cannot read participation detail, so this view cannot be pinned.',
    survey: 'Survey improvement cannot be pinned.',
    timeline: canReadSurveyTimeline
      ? ''
      : 'Your role cannot read timeline adherence, so this view cannot be pinned.',
  }[analysisView]
  const addToDashboard = () => {
    if (!selectedProject || !profile?.userId || analysisView === 'survey' || pinBlockedReason)
      return
    const result = addPin(profile.userId, {
      view: analysisView,
      projectId: selectedProject.id,
      ...(analysisView !== 'timeline' && selectedPeriod
        ? { periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end }
        : {}),
    })
    const message = {
      added: 'Added to your dashboard.',
      duplicate: 'Already on your dashboard.',
      full: 'Your dashboard is full. Unpin a chart first.',
      unavailable: 'Browser storage is unavailable, so the chart could not be pinned.',
    }[result]
    if (result === 'added') toast.success(message)
    else toast.error(message)
  }

  const handleProjectChange = (nextProjectId: string) => {
    if (nextProjectId === projectId) return
    setProjectId(nextProjectId)
    setPeriod('')
    setIndicatorDefinitions([])
    setMonitoring(null)
    setActivities([])
    resetSaddd()
    resetDescriptive()
    resetSurvey()
    resetTimeline()
    setProjectDataLoading(true)
    setMonitoringLoading(false)
    setProjectDataError('')
    setMonitoringError('')
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
  const indicators = monitoring ? activeIndicators(monitoring, projectId) : []
  const analysisMeta = {
    kpi: { title: 'KPI / indicator performance', unit: '%' },
    participation: { title: 'Participation patterns', unit: 'records' },
    survey: { title: 'Survey improvement', unit: 'points' },
    timeline: { title: 'Project / activity timeline adherence', unit: '%' },
  }[analysisView]
  const analysisRows = useMemo(() => {
    if (!selectedProject || !monitoring) return []
    if (analysisView === 'kpi')
      return progressRows(
        indicators.filter((row) => indicatorId === 'all' || row.id === indicatorId),
      )
    return []
  }, [analysisView, indicatorId, indicators, monitoring, selectedProject])
  const progressValues = indicators
    .map((row) => metricNumber(row.progress))
    .filter((value): value is number => value !== null)
  const averageKpi = progressValues.length
    ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
    : null
  // "None yet" only when the role can read the source and the read succeeded empty.
  const periodsReadable =
    (canReadIndicatorDefinitions || canReadIndicatorValues) &&
    !projectDataLoading &&
    !projectDataError
  const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError
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
        className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12"
      >
        {/* Actions sit in the heading so the fields keep one even grid for every role. */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-12">
          <h2 className="text-lg font-semibold" id="analytics-view-title">
            Analysis and visualization
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {DASHBOARD_PINS_UI_ENABLED && pinPermitted ? (
              <div className="flex items-center">
                <Button
                  className="shrink-0"
                  aria-describedby={pinBlockedReason ? 'pin-blocked-reason' : undefined}
                  disabled={!selectedProject || !profile?.userId || Boolean(pinBlockedReason)}
                  onClick={addToDashboard}
                  title={pinBlockedReason || undefined}
                  type="button"
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add to Dashboard
                </Button>
                {pinBlockedReason ? (
                  <p className="ml-3 text-xs text-muted-foreground" id="pin-blocked-reason">
                    {pinBlockedReason}
                  </p>
                ) : null}
              </div>
            ) : null}
            {ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED && canExportAnalytics ? (
              <div className="flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="shrink-0"
                      disabled={
                        !selectedProject ||
                        exporting ||
                        (analysisView !== 'timeline' && !pickerPeriod) ||
                        (analysisView === 'survey' && surveyUnavailable)
                      }
                      type="button"
                      variant="outline"
                    >
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      {exporting && !exportPreview ? 'Preparing preview' : 'Export aggregates'}
                      <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {exportFormats.map((format) => (
                      <DropdownMenuItem key={format} onSelect={() => void previewExport(format)}>
                        {format}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2 xl:col-span-5">
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
        <div className="space-y-2 xl:col-span-3">
          <span className="text-sm font-medium">Reporting period</span>
          <Select
            disabled={pickerPeriods.length === 0}
            value={pickerPeriod?.value ?? ''}
            onValueChange={setPeriod}
          >
            <SelectTrigger aria-label="Reporting period">
              <SelectValue placeholder="No reporting periods" />
            </SelectTrigger>
            <SelectContent>
              {pickerPeriods.map((row) => (
                <SelectItem key={row.value} value={row.value}>
                  {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 xl:col-span-4">
          <span className="text-sm font-medium">Analysis view</span>
          <Select
            value={analysisView}
            onValueChange={(value) => setAnalysisView(value as AnalysisView)}
          >
            <SelectTrigger aria-label="Analysis view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {analysisViews
                .filter((view) => viewPermitted[view.value])
                .map((view) => (
                  <SelectItem key={view.value} value={view.value}>
                    {view.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 xl:col-span-8">
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
        <div className="space-y-2 xl:col-span-4">
          <span className="text-sm font-medium">Visualization type</span>
          <Select
            value={visualizationType}
            onValueChange={(value) => setVisualizationType(value as VisualizationType)}
          >
            <SelectTrigger aria-label="Visualization type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visualizationTypes
                .filter((type) => MAPS_UI_ENABLED || type.value !== 'map')
                .map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <AnalyticsExportPreviewDialog
        context={{
          project: selectedProject?.title ?? 'the selected project',
          period:
            analysisView === 'timeline'
              ? 'current reporting date'
              : (pickerPeriod?.label ?? 'all periods'),
        }}
        downloading={exporting}
        format={exportPreview?.format ?? ''}
        onCancel={closeExportPreview}
        onDownload={() => void downloadExport()}
        preview={exportPreview?.data ?? null}
      />
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
                ? 'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.'
                : undefined
            }
            title={
              mapSelected
                ? 'Project Coverage Map'
                : analysisView === 'timeline' ||
                    (analysisView === 'survey' && !['bar', 'table'].includes(visualizationType))
                  ? analysisMeta.title
                  : `${analysisMeta.title} · ${visualizationTypes.find((type) => type.value === visualizationType)?.label}`
            }
          >
            {mapSelected ? (
              <>
                <ProjectCoverageMapPanel />
                {mapDataLoading ? (
                  <output className="mt-4 rounded-xl border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
                    Updating project analytics.
                  </output>
                ) : mapDataError ? (
                  <div
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-3 text-sm text-danger"
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
            ) : analysisView === 'survey' && !canReadSurvey ? (
              <UnavailableChart description={SURVEY_RESTRICTED_MESSAGE} />
            ) : analysisView === 'survey' && surveyClosedPeriodRequired ? (
              <UnavailableChart description={SURVEY_CLOSED_PERIOD_MESSAGE} />
            ) : analysisView === 'timeline' && !canReadSurveyTimeline ? (
              <UnavailableChart description="Timeline adherence is not available for this role." />
            ) : analysisView === 'survey' ? (
              <SurveyAnalyticsPanel
                activities={activities}
                data={survey}
                error={surveyError}
                errorKind={surveyErrorKind}
                frozen={surveyFrozenOnly}
                loading={surveyLoading}
                noUsablePeriod={reportingPeriods.length > 0 && surveyPeriods.length === 0}
                onRetry={retrySurvey}
                periodsReadable={periodsReadable}
                showChart={visualizationType !== 'table'}
              />
            ) : analysisView === 'timeline' ? (
              <TimelineAnalyticsPanel
                data={timeline}
                error={timelineError}
                loading={timelineLoading}
                onRetry={retryTimeline}
              />
            ) : analysisView === 'participation' ? (
              canReadParticipation ? (
                <InsightStatus read={participationRead} label="Participation patterns">
                  {(data) => <ParticipationBreakdownPanel data={data} />}
                </InsightStatus>
              ) : (
                <UnavailableChart
                  description="Participation patterns are restricted for your role."
                  title="Restricted"
                />
              )
            ) : !selectedPeriod ? (
              <UnavailableChart
                description={
                  periodsReadable
                    ? 'No active Indicator reporting period is available for this project.'
                    : 'Indicator reporting periods are not available for this role.'
                }
                title={periodsReadable ? 'None yet' : undefined}
              />
            ) : analysisRows.length === 0 ? (
              <UnavailableChart
                description="No released values are available for this selection."
                title={monitoringReadable ? 'None yet' : undefined}
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
          <AnalyticsSummaryCards
            activities={activities}
            alertsFailed={alertsFailed}
            alertsLoading={alertsLoading}
            averageKpi={averageKpi}
            budgetRead={budgetRead}
            canReadActivities={canReadActivities}
            canReadAlerts={canReadAlerts}
            canReadBudgetUtilization={canReadBudgetUtilization}
            canReadIndicators={canReadIndicators}
            monitoring={monitoring}
            monitoringReadable={monitoringReadable}
            openAlertText={openAlertText}
            openAlerts={openAlerts}
          />
          <section className="space-y-6" aria-labelledby="fixed-monitoring-charts-title">
            <h2 className="text-lg font-semibold" id="fixed-monitoring-charts-title">
              Monitoring charts
            </h2>
            {canReadIndicators ? (
              <ChartPanel title="Indicator progress">
                {indicators.some((row) => metricNumber(row.progress) !== null) ? (
                  <IndicatorProgressChart rows={progressRows(indicators)} />
                ) : (
                  <UnavailableChart
                    description="No released indicator progress for this project and period."
                    {...(monitoringReadable ? { title: 'None yet' } : {})}
                  />
                )}
              </ChartPanel>
            ) : null}
            {analysisView === 'kpi' && canReadTrends ? (
              <ChartPanel title="Indicator trends">
                {canReadTrends ? (
                  <InsightStatus read={trendsRead} label="Indicator trends">
                    {(data) => (
                      <IndicatorTrendChart
                        data={data}
                        indicatorId={indicatorId === 'all' ? undefined : indicatorId}
                      />
                    )}
                  </InsightStatus>
                ) : (
                  <UnavailableChart description="Indicator trends are not available for this role." />
                )}
              </ChartPanel>
            ) : null}
            {canReadSaddd ? (
              <SadddAnalysisPanel
                retrySaddd={retrySaddd}
                saddd={saddd}
                sadddEligible={sadddEligible}
                sadddError={sadddError}
                sadddLoading={sadddLoading}
                sadddNotice={sadddNotice}
                sadddOngoing={sadddOngoing}
              />
            ) : null}
            {canReadDescriptive ? (
              <DescriptiveStatisticsPanel
                descriptive={descriptive}
                descriptiveError={descriptiveError}
                descriptiveLoading={descriptiveLoading}
                periodsReadable={periodsReadable}
                retryDescriptive={retryDescriptive}
              />
            ) : null}
            {canReadActivities ? (
              <ChartPanel title="Activity completion">
                <ActivityCompletionChart activities={activities} />
              </ChartPanel>
            ) : null}
            <div className="grid gap-6 xl:auto-cols-fr xl:grid-flow-col">
              {canReadBudgetUtilization ? (
                <ChartPanel title="Budget utilization">
                  {canReadBudgetUtilization ? (
                    <InsightStatus read={budgetRead} label="Budget utilization">
                      {(data) => <BudgetSummaryCard data={data} />}
                    </InsightStatus>
                  ) : (
                    <UnavailableChart description="Budget and expense read permissions are required for this chart." />
                  )}
                </ChartPanel>
              ) : null}
              {canReadAlerts ? (
                <OpenAlertsPanel
                  alertRead={alertRead}
                  alertsFailed={alertsFailed}
                  alertsLoading={alertsLoading}
                  canReadAlerts={canReadAlerts}
                  openAlertText={openAlertText}
                  openAlerts={openAlerts}
                />
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
