'use client'

import { Button } from '@/components/ui/button'

import type { ActivitySummary } from '@/types/pathways'
import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'
import {
  type AnalysisView,
  SURVEY_CLOSED_PERIOD_MESSAGE,
  SURVEY_RESTRICTED_MESSAGE,
  type VisualizationType,
  visualizationTypes,
} from '../analytics.copy'
import type { useParticipationBreakdown } from '../hooks/use-analytics-insights'
import type { useSurveyAnalytics } from '../hooks/use-survey-analytics'
import type { useTimelineAnalytics } from '../hooks/use-timeline-analytics'
import type { progressRows } from '../kpi-rows.utils'
import { DescriptiveAnalysisChart } from './analytics-charts'
import { ChartPanel, UnavailableChart } from './chart-panel'
import { InsightStatus } from './insight-status'
import { ParticipationBreakdownPanel } from './participation-breakdown-panel'
import { ProjectCoverageMapPanel } from './project-coverage-map-panel'
import { SurveyAnalyticsPanel } from './survey-analytics-panel'
import { TimelineAnalyticsPanel } from './timeline-analytics-panel'

export const AnalyticsAnalysisPanel = ({
  activities,
  analysisRows,
  analysisView,
  canReadParticipation,
  canReadSurvey,
  canReadSurveyTimeline,
  mapDataError,
  mapDataLoading,
  monitoringReadable,
  participationRead,
  periodsReadable,
  reportingPeriods,
  retryMapData,
  retrySurvey,
  retryTimeline,
  selectedPeriod,
  survey,
  surveyClosedPeriodRequired,
  surveyError,
  surveyErrorKind,
  surveyFrozenOnly,
  surveyLoading,
  surveyPeriods,
  timeline,
  timelineError,
  timelineLoading,
  visualizationType,
}: {
  activities: readonly ActivitySummary[]
  analysisRows: ReturnType<typeof progressRows>
  analysisView: AnalysisView
  canReadParticipation: boolean
  canReadSurvey: boolean
  canReadSurveyTimeline: boolean
  mapDataError: string
  mapDataLoading: boolean
  monitoringReadable: boolean
  participationRead: ReturnType<typeof useParticipationBreakdown>
  periodsReadable: boolean
  reportingPeriods: readonly AnalyticsReportingPeriod[]
  retryMapData: () => void
  retrySurvey: ReturnType<typeof useSurveyAnalytics>['retrySurvey']
  retryTimeline: ReturnType<typeof useTimelineAnalytics>['retryTimeline']
  selectedPeriod: AnalyticsReportingPeriod | undefined
  survey: ReturnType<typeof useSurveyAnalytics>['survey']
  surveyClosedPeriodRequired: boolean
  surveyError: ReturnType<typeof useSurveyAnalytics>['surveyError']
  surveyErrorKind: ReturnType<typeof useSurveyAnalytics>['surveyErrorKind']
  surveyFrozenOnly: boolean
  surveyLoading: ReturnType<typeof useSurveyAnalytics>['surveyLoading']
  surveyPeriods: readonly AnalyticsReportingPeriod[]
  timeline: ReturnType<typeof useTimelineAnalytics>['timeline']
  timelineError: ReturnType<typeof useTimelineAnalytics>['timelineError']
  timelineLoading: ReturnType<typeof useTimelineAnalytics>['timelineLoading']
  visualizationType: VisualizationType
}) => {
  const mapSelected = visualizationType === 'map'
  const analysisMeta = {
    kpi: { title: 'KPI / indicator performance', unit: '%' },
    participation: { title: 'Participation patterns', unit: 'records' },
    survey: { title: 'Survey improvement', unit: 'points' },
    timeline: { title: 'Project / activity timeline adherence', unit: '%' },
  }[analysisView]

  return (
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
              <Button onClick={retryMapData} size="sm" type="button" variant="outline">
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
  )
}
