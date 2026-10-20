'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAPS_UI_ENABLED } from '@/constants/feature-flags'

import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'
import {
  type AnalysisView,
  type VisualizationType,
  analysisViews,
  visualizationTypes,
} from '../analytics.copy'
import type { useAnalyticsScope } from '../hooks/use-analytics-scope'
import type { activeIndicators } from '../kpi-rows.utils'

export const AnalyticsFilterBar = ({
  analysisView,
  canReadParticipation,
  canReadSurvey,
  canReadSurveyTimeline,
  children,
  handleProjectChange,
  indicatorId,
  indicators,
  pickerPeriod,
  pickerPeriods,
  projectId,
  projects,
  setAnalysisView,
  setIndicatorId,
  setPeriod,
  setVisualizationType,
  visualizationType,
}: {
  analysisView: AnalysisView
  canReadParticipation: boolean
  canReadSurvey: boolean
  canReadSurveyTimeline: boolean
  children: React.ReactNode
  handleProjectChange: (nextProjectId: string) => void
  indicatorId: string
  indicators: ReturnType<typeof activeIndicators>
  pickerPeriod: AnalyticsReportingPeriod | undefined
  pickerPeriods: readonly AnalyticsReportingPeriod[]
  projectId: string
  projects: ReturnType<typeof useAnalyticsScope>['projects']
  setAnalysisView: (view: AnalysisView) => void
  setIndicatorId: (indicatorId: string) => void
  setPeriod: (period: string) => void
  setVisualizationType: (type: VisualizationType) => void
  visualizationType: VisualizationType
}) => {
  // Views and pins the role cannot read are hidden rather than shown as unavailable.
  const viewPermitted: Record<AnalysisView, boolean> = {
    kpi: true,
    participation: canReadParticipation,
    survey: canReadSurvey,
    timeline: canReadSurveyTimeline,
  }

  return (
    <section
      aria-labelledby="analytics-view-title"
      className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12"
    >
      {/* Actions sit in the heading so the fields keep one even grid for every role. */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-12">
        <h2 className="text-lg font-semibold" id="analytics-view-title">
          Analysis and visualization
        </h2>
        {children}
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
  )
}
