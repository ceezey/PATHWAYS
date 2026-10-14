'use client'

import { AlertTriangle, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { formatCalendarDay } from '@/lib/format/date'
import { can } from '@/lib/rbac/can'

import { nonOverlappingAnalyticsPeriods } from '../analytics-reporting-periods.utils'
import type { AnalysisView, VisualizationType } from '../analytics.copy'
import { analyticsAccess, countOpenAlerts } from '../analytics.reads'
import { businessDateInManila } from '../analytics.utils'
import { useAnalyticsExport } from '../hooks/use-analytics-export'
import {
  useBudgetSummary,
  useIndicatorTrends,
  useParticipationBreakdown,
} from '../hooks/use-analytics-insights'
import { useAnalyticsScope } from '../hooks/use-analytics-scope'
import { useDescriptiveAnalytics } from '../hooks/use-descriptive-analytics'
import { useSadddDashboard } from '../hooks/use-saddd-dashboard'
import { useSurveyAnalytics } from '../hooks/use-survey-analytics'
import { useTimelineAnalytics } from '../hooks/use-timeline-analytics'
import { activeIndicators, metricNumber, progressRows } from '../kpi-rows.utils'
import { AnalyticsActionBar } from './analytics-action-bar'
import { AnalyticsAnalysisPanel } from './analytics-analysis-panel'
import { ActivityCompletionChart, IndicatorProgressChart } from './analytics-charts'
import { AnalyticsExportPreviewDialog } from './analytics-export-preview'
import { AnalyticsFilterBar } from './analytics-filter-bar'
import { AnalyticsSummaryCards } from './analytics-summary-cards'
import { BudgetSummaryCard } from './budget-summary-card'
import { ChartPanel, UnavailableChart } from './chart-panel'
import { DescriptiveStatisticsPanel } from './descriptive-statistics-panel'
import { IndicatorTrendChart } from './indicator-trend-chart'
import { InsightStatus } from './insight-status'
import { OpenAlertsPanel } from './open-alerts-panel'
import { SadddAnalysisPanel } from './saddd-analysis-panel'

export const AnalyticsDashboard = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const {
    canExportAnalytics,
    canReadActivities,
    canReadAlerts,
    canReadBudgetUtilization,
    canReadDescriptive,
    canReadIndicatorDefinitions,
    canReadIndicatorValues,
    canReadIndicators,
    canReadParticipation,
    canReadSaddd,
    canReadSurvey,
    canReadSurveyTimeline,
    canReadTrends,
    surveyFrozenOnly,
  } = analyticsAccess(profile)
  const {
    activities,
    monitoring,
    monitoringError,
    monitoringLoading,
    period,
    projectDataError,
    projectDataLoading,
    projectId,
    projects,
    projectsError,
    projectsLoading,
    reportingPeriods,
    retryLoad,
    retryMapData,
    selectProject,
    selectedPeriod,
    selectedProject,
    setPeriod,
  } = useAnalyticsScope({
    canReadActivities,
    canReadIndicatorDefinitions,
    canReadIndicatorValues,
    canReadIndicators,
    role,
  })
  const [analysisView, setAnalysisView] = useState<AnalysisView>('kpi')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar')
  const [indicatorId, setIndicatorId] = useState('all')

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

  const { resetSaddd, retrySaddd, saddd, sadddError, sadddLoading } = useSadddDashboard({
    projectId,
    sadddEligible,
    selectedProject,
  })

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

  const handleProjectChange = (nextProjectId: string) => {
    if (nextProjectId === projectId) return
    selectProject(nextProjectId)
    resetSaddd()
    resetDescriptive()
    resetSurvey()
    resetTimeline()
  }

  const mapSelected = visualizationType === 'map'
  const mapDataLoading = projectDataLoading || monitoringLoading
  const mapDataError = projectDataError || monitoringError
  const loading = projectsLoading || (!mapSelected && (projectDataLoading || monitoringLoading))
  const error = projectsError || (!mapSelected ? projectDataError || monitoringError : '')
  const indicators = monitoring ? activeIndicators(monitoring, projectId) : []
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
      <AnalyticsFilterBar
        analysisView={analysisView}
        canReadParticipation={canReadParticipation}
        canReadSurvey={canReadSurvey}
        canReadSurveyTimeline={canReadSurveyTimeline}
        handleProjectChange={handleProjectChange}
        indicatorId={indicatorId}
        indicators={indicators}
        pickerPeriod={pickerPeriod}
        pickerPeriods={pickerPeriods}
        projectId={projectId}
        projects={projects}
        setAnalysisView={setAnalysisView}
        setIndicatorId={setIndicatorId}
        setPeriod={setPeriod}
        setVisualizationType={setVisualizationType}
        visualizationType={visualizationType}
      >
        <AnalyticsActionBar
          analysisView={analysisView}
          canExportAnalytics={canExportAnalytics}
          canReadIndicators={canReadIndicators}
          canReadParticipation={canReadParticipation}
          canReadSurveyTimeline={canReadSurveyTimeline}
          exportPreview={exportPreview}
          exporting={exporting}
          pickerPeriod={pickerPeriod}
          previewExport={previewExport}
          profile={profile}
          selectedPeriod={selectedPeriod}
          selectedProject={selectedProject}
          surveyUnavailable={surveyUnavailable}
        />
      </AnalyticsFilterBar>

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
          <AnalyticsAnalysisPanel
            activities={activities}
            analysisRows={analysisRows}
            analysisView={analysisView}
            canReadParticipation={canReadParticipation}
            canReadSurvey={canReadSurvey}
            canReadSurveyTimeline={canReadSurveyTimeline}
            mapDataError={mapDataError}
            mapDataLoading={mapDataLoading}
            monitoringReadable={monitoringReadable}
            participationRead={participationRead}
            periodsReadable={periodsReadable}
            reportingPeriods={reportingPeriods}
            retryMapData={retryMapData}
            retrySurvey={retrySurvey}
            retryTimeline={retryTimeline}
            selectedPeriod={selectedPeriod}
            survey={survey}
            surveyClosedPeriodRequired={surveyClosedPeriodRequired}
            surveyError={surveyError}
            surveyErrorKind={surveyErrorKind}
            surveyFrozenOnly={surveyFrozenOnly}
            surveyLoading={surveyLoading}
            surveyPeriods={surveyPeriods}
            timeline={timeline}
            timelineError={timelineError}
            timelineLoading={timelineLoading}
            visualizationType={visualizationType}
          />
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
