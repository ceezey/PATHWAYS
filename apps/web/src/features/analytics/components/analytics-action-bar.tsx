'use client'

import { ChevronDown, Download, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED,
  DASHBOARD_PINS_UI_ENABLED,
} from '@/constants/feature-flags'
import type { useCurrentRole } from '@/hooks/use-current-role'
import { addPin } from '@/lib/dashboard-pins'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { toast } from 'sonner'

import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'
import { type AnalysisView, type VisualizationType, exportFormats } from '../analytics.copy'
import type { useAnalyticsExport } from '../hooks/use-analytics-export'
import type { useAnalyticsScope } from '../hooks/use-analytics-scope'

export const AnalyticsActionBar = ({
  analysisView,
  canExportAnalytics,
  canReadIndicators,
  canReadParticipation,
  canReadSurveyTimeline,
  exportPreview,
  exporting,
  pickerPeriod,
  previewExport,
  profile,
  selectedPeriod,
  selectedProject,
  surveyUnavailable,
  visualizationType,
}: {
  analysisView: AnalysisView
  canExportAnalytics: boolean
  canReadIndicators: boolean
  canReadParticipation: boolean
  canReadSurveyTimeline: boolean
  exportPreview: ReturnType<typeof useAnalyticsExport>['exportPreview']
  exporting: boolean
  pickerPeriod: AnalyticsReportingPeriod | undefined
  previewExport: ReturnType<typeof useAnalyticsExport>['previewExport']
  profile: ReturnType<typeof useCurrentRole>['profile']
  selectedPeriod: AnalyticsReportingPeriod | undefined
  selectedProject: ReturnType<typeof useAnalyticsScope>['selectedProject']
  surveyUnavailable: boolean
  visualizationType: VisualizationType
}) => {
  // The map covers every scoped project, so it pins on its own whatever view is chosen.
  const mapSelected = visualizationType === 'map'
  const pinPermitted = mapSelected
    ? principalHasAtomicPermission(profile, 'projects.read')
    : {
        kpi: canReadIndicators,
        participation: canReadParticipation,
        survey: true,
        timeline: canReadSurveyTimeline,
      }[analysisView]
  // The pinned card re-reads the same source, so pinning needs the same permission and period.
  const pinBlockedReason = mapSelected
    ? ''
    : {
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
    if (!selectedProject || !profile?.userId || pinBlockedReason) return
    const view = mapSelected ? 'map' : analysisView
    if (view === 'survey') return
    const result = addPin(profile.userId, {
      view,
      projectId: view === 'map' ? '' : selectedProject.id,
      ...(view !== 'map' && view !== 'timeline' && selectedPeriod
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

  return (
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
  )
}
