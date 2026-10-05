'use client'

import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Download,
  PhilippinePeso,
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
import { ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED } from '@/constants/feature-flags'
import { metricUnavailableLabel, overviewMetricLabel } from '@/features/projects/project-utils'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { addPin } from '@/lib/dashboard-pins'
import { formatCappedPercent } from '@/lib/percent'
import { can } from '@/lib/rbac/can'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { descriptiveAnalyticsSearch, pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { ActivitySummary, ProjectIndicator, ProjectSummary } from '@/types/pathways'
import {
  type DescriptiveAnalytics,
  type MetricCell,
  type MonitoringDashboard,
  type SadddDashboard,
  type SurveyAnalytics,
  type SurveyGroup,
  type TimelineAnalytics,
  formatMetricCell,
} from '@pathways/shared'
import { toast } from 'sonner'

import {
  ActivityCompletionChart,
  DescriptiveAnalysisChart,
  IndicatorProgressChart,
  SadddChart,
  SurveyImprovementChart,
} from './analytics-charts'
import {
  deriveAnalyticsReportingPeriods,
  nonOverlappingAnalyticsPeriods,
} from './analytics-reporting-periods'
import { formatDate } from './analytics-utils'
import { BudgetSummaryCard } from './budget-summary-card'
import { IndicatorTrendChart } from './indicator-trend-chart'
import { InsightStatus } from './insight-status'
import { activeIndicators, metricNumber, progressRows } from './kpi-rows'
import { ParticipationBreakdownPanel } from './participation-breakdown-panel'
import { ProjectCoverageMapPanel } from './project-coverage-map-panel'
import {
  canReadInsight,
  useBudgetSummary,
  useIndicatorTrends,
  useParticipationBreakdown,
} from './use-analytics-insights'

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

const businessDateInManila = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

type SurveyErrorKind = 'restricted' | 'period' | 'retry'
const SURVEY_RESTRICTED_MESSAGE = 'Survey improvement is restricted for your role.'
const SURVEY_PERIOD_MESSAGE = 'This reporting period cannot be used for survey results.'
const SURVEY_CLOSED_PERIOD_MESSAGE =
  'Survey results for your role are released after the reporting period closes. Choose a closed period.'
const SURVEY_FROZEN_CAPTION =
  'Released once for this closed period; figures do not change on later views.'

/** 403 = role restriction and 400 = refused period are final; only network/5xx may be retried. */
const surveyErrorKindFor = (caught: unknown): SurveyErrorKind => {
  const status =
    caught && typeof caught === 'object' && 'status' in caught
      ? (caught as { status?: unknown }).status
      : undefined
  return status === 403 ? 'restricted' : status === 400 ? 'period' : 'retry'
}

const OPEN_ALERT_STATUSES = ['NEW', 'REVIEWED', 'ACTIONED'] as const
const OPEN_ALERT_MAX_PAGES = 10

/**
 * Counts open alerts with the server status filter, following cursors per status. It stops
 * after OPEN_ALERT_MAX_PAGES pages of a status and reports `capped` so the UI shows "N+".
 */
export const countOpenAlerts = async (projectId: string, signal?: AbortSignal) => {
  let count = 0
  let capped = false
  for (const status of OPEN_ALERT_STATUSES) {
    let cursor: string | undefined
    for (let page = 0; ; page += 1) {
      const result = await rulesHumanClient.listAlerts(
        { projectId, status, limit: '100', ...(cursor ? { cursor } : {}) },
        signal,
      )
      count += result.items.length
      if (!result.nextCursor) break
      if (page + 1 >= OPEN_ALERT_MAX_PAGES) {
        capped = true
        break
      }
      cursor = result.nextCursor
    }
  }
  return { count, capped }
}

const exportFormats = ['CSV', 'XLS', 'XLSX', 'PDF'] as const
type ExportFormat = (typeof exportFormats)[number]

export const AnalyticsDashboard = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
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
  const [descriptive, setDescriptive] = useState<DescriptiveAnalytics | null>(null)
  const [descriptiveLoading, setDescriptiveLoading] = useState(false)
  const [descriptiveError, setDescriptiveError] = useState('')
  const [descriptiveLoadAttempt, setDescriptiveLoadAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [period, setPeriod] = useState('')
  const [analysisView, setAnalysisView] = useState<AnalysisView>('kpi')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar')
  const [indicatorId, setIndicatorId] = useState('all')
  const [indicatorDefinitions, setIndicatorDefinitions] = useState<ProjectIndicator[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringDashboard | null>(null)
  const [saddd, setSaddd] = useState<SadddDashboard | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
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
  // F9 survey/timeline analytics (analytics.descriptive.survey.v1 / .timeline.v1).
  const [survey, setSurvey] = useState<SurveyAnalytics | null>(null)
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [surveyError, setSurveyError] = useState('')
  // restricted (403) and period (400) are final answers, so only 'retry' offers Retry.
  const [surveyErrorKind, setSurveyErrorKind] = useState<SurveyErrorKind>('retry')
  const [surveyLoadAttempt, setSurveyLoadAttempt] = useState(0)
  const [timeline, setTimeline] = useState<TimelineAnalytics | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')
  const [timelineLoadAttempt, setTimelineLoadAttempt] = useState(0)

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
  const openAlertCount = openAlerts ? openAlerts.count : null
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
  // SADDD is withheld by policy until the project period closes; this is a notice, not an error.
  const sadddNotice =
    !selectedProject?.startDate || !selectedProject.endDate
      ? {
          title: 'SADDD needs project dates',
          description:
            "Record this project's start and end dates to enable the sex, age and disability breakdown.",
        }
      : selectedProject.endDate >= businessDateInManila()
        ? {
            title: `SADDD opens after this project ends on ${formatDate(selectedProject.endDate)}`,
            description:
              'Sex, age and disability breakdowns use the final counts of a closed project period, so they are not shown while the project is ongoing. Select a completed project to see them now.',
          }
        : null
  const sadddEligible = sadddNotice === null
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
  const budgetCurrencies = budgetRead.data?.currencies ?? []
  const budgetUtilizationPercent =
    budgetCurrencies.length === 1 ? budgetCurrencies[0].utilizationPercent : null

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
      canReadActivities
        ? pathwaysClient.getActivities(projectId)
        : Promise.resolve<ActivitySummary[]>([]),
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
      setSadddError('')
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
  }, [canReadIndicators, monitoringLoadAttempt, projectId, selectedPeriod])

  useEffect(() => {
    if (!projectId || !selectedPeriod || !canReadDescriptive) {
      setDescriptiveLoading(false)
      setDescriptive(null)
      setDescriptiveError('')
      return
    }
    void descriptiveLoadAttempt
    let active = true
    setDescriptiveLoading(true)
    setDescriptive(null)
    setDescriptiveError('')
    pathwaysClient
      .getDescriptiveAnalytics({
        projectId,
        periodStart: selectedPeriod.start,
        periodEnd: selectedPeriod.end,
      })
      .then((result) => {
        if (active) setDescriptive(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setDescriptiveError(
            caught instanceof Error ? caught.message : 'Descriptive statistics are unavailable.',
          )
      })
      .finally(() => {
        if (active) setDescriptiveLoading(false)
      })
    return () => {
      active = false
    }
  }, [canReadDescriptive, descriptiveLoadAttempt, projectId, selectedPeriod])

  // Paired pre/post survey improvement. Requires a complete period, same as the API contract.
  useEffect(() => {
    if (!projectId || !surveyPeriod || surveyUnavailable || analysisView !== 'survey') {
      setSurveyLoading(false)
      setSurvey(null)
      setSurveyError('')
      setSurveyErrorKind('retry')
      return
    }
    void surveyLoadAttempt
    let active = true
    setSurveyLoading(true)
    setSurvey(null)
    setSurveyError('')
    setSurveyErrorKind('retry')
    pathwaysClient
      .getSurveyAnalytics({
        projectId,
        periodStart: surveyPeriod.start,
        periodEnd: surveyPeriod.end,
      })
      .then((result) => {
        if (active) setSurvey(result)
      })
      .catch((caught: unknown) => {
        if (!active) return
        const kind = surveyErrorKindFor(caught)
        setSurveyErrorKind(kind)
        setSurveyError(
          kind === 'restricted'
            ? SURVEY_RESTRICTED_MESSAGE
            : kind === 'period'
              ? surveyFrozenOnly
                ? SURVEY_CLOSED_PERIOD_MESSAGE
                : SURVEY_PERIOD_MESSAGE
              : caught instanceof Error
                ? caught.message
                : 'Survey analytics could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setSurveyLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    analysisView,
    surveyUnavailable,
    surveyFrozenOnly,
    projectId,
    surveyPeriod,
    surveyLoadAttempt,
  ])

  // Timeline adherence uses the business reporting date server-side; no period selection needed.
  useEffect(() => {
    if (!projectId || !canReadSurveyTimeline || analysisView !== 'timeline') {
      setTimelineLoading(false)
      setTimeline(null)
      setTimelineError('')
      return
    }
    void timelineLoadAttempt
    let active = true
    setTimelineLoading(true)
    setTimeline(null)
    setTimelineError('')
    pathwaysClient
      .getTimelineAnalytics({ projectId })
      .then((result) => {
        if (active) setTimeline(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setTimelineError(
            caught instanceof Error ? caught.message : 'Timeline analytics could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setTimelineLoading(false)
      })
    return () => {
      active = false
    }
  }, [analysisView, canReadSurveyTimeline, projectId, timelineLoadAttempt])

  const exportDescriptive = async (format: ExportFormat) => {
    const view = analysisView === 'survey' || analysisView === 'timeline' ? analysisView : undefined
    if (!ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED || !canExportAnalytics || !projectId || exporting)
      return
    const exportPeriod = view === 'survey' ? surveyPeriod : selectedPeriod
    if (view !== 'timeline' && !exportPeriod) return
    if (view === 'survey' && surveyUnavailable) return
    const capturedProject = projectId
    setExporting(true)
    try {
      await downloadCoreArtifact(
        `/analytics/descriptive/export${descriptiveAnalyticsSearch({
          projectId: capturedProject,
          ...(exportPeriod ? { periodStart: exportPeriod.start, periodEnd: exportPeriod.end } : {}),
          ...(view ? { view } : {}),
        })}${format === 'CSV' ? '' : `&format=${format}`}`,
        `${view ?? 'descriptive'}-analytics-${capturedProject.toLowerCase()}.${format.toLowerCase()}`,
      )
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Aggregate export unavailable.')
    } finally {
      setExporting(false)
    }
  }

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
    setSaddd(null)
    setDescriptive(null)
    setDescriptiveError('')
    setSurvey(null)
    setSurveyError('')
    setSurveyErrorKind('retry')
    setTimeline(null)
    setTimelineError('')
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
  const periodsReadable = canReadIndicators && !projectDataLoading && !projectDataError
  const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError
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
        className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12"
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
        {pinPermitted ? (
          <div className="flex items-end sm:col-span-2 xl:col-span-3 xl:col-start-10 xl:row-start-3">
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
          <div className="flex items-end sm:col-span-2 xl:col-span-3 xl:col-start-10 xl:row-start-2">
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
                  {exporting ? 'Exporting aggregates' : 'Export aggregates'}
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {exportFormats.map((format) => (
                  <DropdownMenuItem key={format} onSelect={() => void exportDescriptive(format)}>
                    {format}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
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
                onRetry={() => setSurveyLoadAttempt((value) => value + 1)}
                periodsReadable={periodsReadable}
                showChart={visualizationType !== 'table'}
              />
            ) : analysisView === 'timeline' ? (
              <TimelineAnalyticsPanel
                data={timeline}
                error={timelineError}
                loading={timelineLoading}
                onRetry={() => setTimelineLoadAttempt((value) => value + 1)}
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
          <section className="grid gap-4 md:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col">
            {canReadIndicators ? (
              <MetricCard
                description="Average of released indicator progress values in this project and period."
                icon={Target}
                label="KPI achievement"
                tone={averageKpi === null ? 'info' : averageKpi >= 70 ? 'success' : 'warning'}
                value={
                  averageKpi !== null
                    ? formatCappedPercent(averageKpi)
                    : monitoringReadable
                      ? 'None yet'
                      : 'Unavailable'
                }
              />
            ) : null}
            {canReadBudgetUtilization ? (
              <MetricCard
                description={
                  !canReadBudgetUtilization
                    ? 'Budget and expense permissions are required for this metric.'
                    : budgetRead.isError
                      ? 'Budget utilization could not be loaded.'
                      : budgetCurrencies.length > 1
                        ? 'Several currencies are recorded; see the Budget utilization panel.'
                        : 'Approved expenses against planned budget allocations; pending is not counted.'
                }
                icon={PhilippinePeso}
                label="Budget utilization"
                tone={
                  budgetUtilizationPercent === null
                    ? 'info'
                    : budgetUtilizationPercent > 100
                      ? 'warning'
                      : 'success'
                }
                value={
                  !canReadBudgetUtilization
                    ? 'Unavailable'
                    : budgetRead.isError
                      ? 'Unavailable'
                      : !budgetRead.data
                        ? 'Loading...'
                        : budgetCurrencies.length > 1
                          ? 'Multiple currencies'
                          : budgetUtilizationPercent !== null
                            ? formatCappedPercent(budgetUtilizationPercent, 'over budget')
                            : 'No budget'
                }
              />
            ) : null}
            {canReadIndicators ? (
              <MetricCard
                description="Enrolled individuals overlapping the period; privacy suppression applies."
                icon={UsersRound}
                label="Beneficiary reach"
                tone="info"
                value={
                  monitoring?.enrolledIndividuals
                    ? formatMetricCell(monitoring.enrolledIndividuals)
                    : 'Unavailable'
                }
              />
            ) : null}
            {canReadActivities ? (
              <MetricCard
                description="Completed activities in the selected project."
                icon={ClipboardCheck}
                label="Activity completion"
                tone="success"
                value={
                  canReadActivities ? `${completedActivities}/${activities.length}` : 'Unavailable'
                }
              />
            ) : null}
            {canReadAlerts ? (
              <MetricCard
                description={
                  !canReadAlerts
                    ? 'Rule-Based Alerts are unavailable for this role.'
                    : alertsFailed
                      ? 'Open alerts could not be loaded. Use Retry in the Rule-Based Alerts panel.'
                      : 'Open alerts (new, reviewed or actioned) in the selected project.'
                }
                icon={AlertTriangle}
                label="Rule-Based Alerts"
                tone={openAlertCount ? 'warning' : 'info'}
                value={
                  !canReadAlerts
                    ? 'Unavailable'
                    : alertsLoading
                      ? 'Loading...'
                      : alertsFailed
                        ? 'Unavailable'
                        : openAlerts
                          ? openAlertText
                          : 'Unavailable'
                }
              />
            ) : null}
          </section>
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
            <ChartPanel title="SADDD Analysis">
              {sadddLoading ? (
                <AsyncState
                  status="loading"
                  title="Loading SADDD analysis"
                  description="Loading the scoped beneficiary aggregate data."
                  icon={UsersRound}
                />
              ) : sadddNotice ? (
                <EmptyState
                  description={sadddNotice.description}
                  icon={CalendarClock}
                  title={sadddNotice.title}
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
                  <details className="mt-3 rounded-xl border border-border p-3 text-sm">
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
            {canReadDescriptive ? (
              <ChartPanel
                description="Counts and shares come from suppressed aggregates. A suppressed cell withholds every share in its group."
                title="Descriptive statistics"
              >
                {descriptiveLoading ? (
                  <AsyncState
                    status="loading"
                    title="Loading descriptive statistics"
                    description="Loading scoped aggregate data."
                    icon={BarChart3}
                  />
                ) : descriptiveError ? (
                  <AsyncState
                    status="error"
                    title="Descriptive statistics unavailable"
                    description={descriptiveError}
                    icon={AlertTriangle}
                    onRetry={() => setDescriptiveLoadAttempt((value) => value + 1)}
                  />
                ) : descriptive ? (
                  <DescriptiveStatisticsTable data={descriptive} />
                ) : (
                  <UnavailableChart
                    description={
                      periodsReadable
                        ? 'No active Indicator reporting period is available for this project.'
                        : 'Indicator reporting periods are not available for this role.'
                    }
                    title={periodsReadable ? 'None yet' : undefined}
                  />
                )}
              </ChartPanel>
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
                <ChartPanel title="Rule-Based Alerts">
                  {!canReadAlerts ? (
                    <UnavailableChart description="Rule-Based Alerts are unavailable for this role." />
                  ) : alertsLoading ? (
                    <AsyncState
                      status="loading"
                      title="Loading Rule-Based Alerts"
                      description="Verifying current alert access."
                      icon={AlertTriangle}
                    />
                  ) : alertsFailed ? (
                    <AsyncState
                      status="error"
                      title="Rule-Based Alerts unavailable"
                      description="Open alerts could not be loaded."
                      icon={AlertTriangle}
                      onRetry={() => void alertRead.refetch()}
                    />
                  ) : openAlerts ? (
                    <p className="text-sm text-foreground">
                      <span className="text-3xl font-semibold tabular-nums">{openAlertText}</span>{' '}
                      open alert{openAlerts.count === 1 && !openAlerts.capped ? '' : 's'} in this
                      project.
                    </p>
                  ) : (
                    <UnavailableChart description="Select a project to see its Rule-Based Alerts." />
                  )}
                </ChartPanel>
              ) : null}
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
  <section className="overflow-hidden rounded-2xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
)

/**
 * A visible value (including a real zero) renders with its unit; MISSING/SUPPRESSED
 * get the shared readable copy. `kind` matches overviewMetricLabel's Overview
 * convention so a percent cell never displays as a bare, unit-less number.
 */
const analyticsCellValue = (cell: MetricCell, kind: 'percent' | 'pp' | 'count' = 'count') =>
  overviewMetricLabel(cell, kind)

const activityFallbackLabel = 'Activity (name unavailable)'

/**
 * Maps a per-activity survey group's activityId key to its human title from the
 * already-loaded project activities, instead of showing a raw UUID. Falls back to
 * a neutral label when the activity is not found (e.g. archived or deleted).
 */
const surveyGroupRows = (
  data: SurveyAnalytics,
  activities: readonly ActivitySummary[],
): Array<SurveyGroup & { label: string }> => [
  { ...data.overall, label: 'All activities (cohort change)' },
  ...data.byActivity.map((group) => ({
    ...group,
    label: activities.find((activity) => activity.id === group.key)?.title ?? activityFallbackLabel,
  })),
]

/**
 * F9 survey improvement view (analytics.descriptive.survey.v1). Cards + chart cover the
 * cohort ("all activities") group; the table lists every group, including per-activity
 * breakdowns, with the same MISSING/SUPPRESSED wording as the rest of Analytics.
 */
const SurveyAnalyticsPanel = ({
  data,
  loading,
  error,
  errorKind,
  frozen,
  noUsablePeriod,
  onRetry,
  periodsReadable,
  showChart,
  activities,
}: {
  data: SurveyAnalytics | null
  loading: boolean
  error: string
  errorKind: SurveyErrorKind
  frozen: boolean
  noUsablePeriod: boolean
  onRetry: () => void
  periodsReadable: boolean
  showChart: boolean
  activities: readonly ActivitySummary[]
}) => {
  if (loading)
    return (
      <AsyncState
        status="loading"
        title="Loading survey analytics"
        description="Loading scoped paired assessment data."
        icon={BarChart3}
      />
    )
  if (error && errorKind !== 'retry') return <UnavailableChart description={error} />
  if (error)
    return (
      <AsyncState
        status="error"
        title="Survey analytics could not be loaded"
        description={error}
        icon={AlertTriangle}
        onRetry={onRetry}
      />
    )
  if (!data && noUsablePeriod) return <UnavailableChart description={SURVEY_PERIOD_MESSAGE} />
  if (!data)
    return (
      <UnavailableChart
        description={
          periodsReadable
            ? 'No active Indicator reporting period is available for this project.'
            : 'Indicator reporting periods are not available for this role.'
        }
        title={periodsReadable ? 'None yet' : undefined}
      />
    )
  const { overall } = data
  const isSuppressed = overall.pairs.state === 'SUPPRESSED'
  const isMissing = overall.pairs.value === '0'
  return (
    <div className="space-y-4" data-testid="survey-analytics">
      {frozen ? <p className="text-sm text-muted-foreground">{SURVEY_FROZEN_CAPTION}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Enrollments with both a PRE_TEST and a POST_TEST in this period."
          icon={ClipboardCheck}
          label="Paired assessments"
          tone="info"
          value={analyticsCellValue(overall.pairs)}
        />
        <MetricCard
          description="Cohort mean normalized pre-test score (0-100)."
          icon={BarChart3}
          label="Mean pre-test"
          tone="info"
          value={analyticsCellValue(overall.meanPre, 'percent')}
        />
        <MetricCard
          description="Cohort mean normalized post-test score (0-100)."
          icon={BarChart3}
          label="Mean post-test"
          tone="info"
          value={analyticsCellValue(overall.meanPost, 'percent')}
        />
        <MetricCard
          description="Cohort-level change in mean normalized score. Never an individual verdict."
          icon={Target}
          label="Mean cohort change"
          tone={
            overall.meanChange.value === null
              ? 'info'
              : Number(overall.meanChange.value) < 0
                ? 'warning'
                : 'success'
          }
          value={analyticsCellValue(overall.meanChange, 'pp')}
        />
      </div>
      {isSuppressed ? (
        <p className="text-sm text-muted-foreground">Suppressed (fewer than 5)</p>
      ) : isMissing ? (
        <UnavailableChart description={metricUnavailableLabel(overall.meanPre)} title="None yet" />
      ) : showChart ? (
        <SurveyImprovementChart group={overall} title="Cohort change (all activities)" />
      ) : null}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Survey improvement by group</caption>
        <thead>
          <tr className="border-b">
            <th className="p-2">Group</th>
            <th className="p-2">Pairs</th>
            <th className="p-2">Mean pre</th>
            <th className="p-2">Mean post</th>
            <th className="p-2">Mean change</th>
            <th className="p-2">Improved</th>
            <th className="p-2">Same</th>
            <th className="p-2">Declined</th>
          </tr>
        </thead>
        <tbody>
          {surveyGroupRows(data, activities).map((row) => (
            <tr className="border-b" key={row.key}>
              <td className="p-2">{row.label}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.pairs)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanPre, 'percent')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanPost, 'percent')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanChange, 'pp')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.improved)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.same)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.declined)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** F9 timeline adherence view (analytics.descriptive.timeline.v1). Cards only; no chart. */
const TimelineAnalyticsPanel = ({
  data,
  loading,
  error,
  onRetry,
}: {
  data: TimelineAnalytics | null
  loading: boolean
  error: string
  onRetry: () => void
}) => {
  if (loading)
    return (
      <AsyncState
        status="loading"
        title="Loading timeline analytics"
        description="Loading scoped activity and milestone data."
        icon={BarChart3}
      />
    )
  if (error)
    return (
      <AsyncState
        status="error"
        title="Timeline analytics could not be loaded"
        description={error}
        icon={AlertTriangle}
        onRetry={onRetry}
      />
    )
  if (!data)
    return (
      <UnavailableChart description="Timeline adherence is not available for this selection." />
    )
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="timeline-analytics">
      <MetricCard
        description="Share of the project period elapsed as of the reporting date."
        icon={ClipboardCheck}
        label="Elapsed"
        tone="info"
        value={analyticsCellValue(data.elapsedPercent, 'percent')}
      />
      <MetricCard
        description="Calendar days remaining before the project's recorded end date."
        icon={ClipboardCheck}
        label="Remaining days"
        tone="info"
        value={analyticsCellValue(data.remainingDays)}
      />
      <MetricCard
        description="Calendar days past the project's recorded end date."
        icon={AlertTriangle}
        label="Overdue days"
        tone={
          data.overdueDays.value !== null && Number(data.overdueDays.value) > 0 ? 'warning' : 'info'
        }
        value={analyticsCellValue(data.overdueDays)}
      />
      <MetricCard
        description="Share of in-scope activities marked Completed."
        icon={ClipboardCheck}
        label="Activity completion"
        tone="success"
        value={analyticsCellValue(data.activityCompletionPercent, 'percent')}
      />
      <MetricCard
        description="In-scope activities past their planned end date and not yet Completed."
        icon={AlertTriangle}
        label="Overdue activities"
        tone={
          data.activityOverdueCount.value !== null && Number(data.activityOverdueCount.value) > 0
            ? 'warning'
            : 'info'
        }
        value={analyticsCellValue(data.activityOverdueCount)}
      />
      <MetricCard
        description="Completed milestones finished on or before their target date."
        icon={Target}
        label="Milestone on-time"
        tone="success"
        value={analyticsCellValue(data.milestoneOnTimePercent, 'percent')}
      />
    </div>
  )
}

const sectionLabels: Record<DescriptiveAnalytics['distributions'][number]['section'], string> = {
  ACTIVITY_STATE: 'Activity state',
  MILESTONE_STATE: 'Milestone state',
  SADDD_SEX: 'Sex',
  SADDD_AGE: 'Age band',
  SADDD_DISABILITY: 'Disability',
}

const formatShare = (share: string | null) =>
  share === null ? 'Withheld' : `${(Number(share) * 100).toFixed(1)}%`

const DescriptiveStatisticsTable = ({ data }: { data: DescriptiveAnalytics }) => (
  <div className="space-y-4 overflow-x-auto text-sm" data-testid="descriptive-statistics">
    <table className="w-full text-left">
      <caption className="sr-only">Descriptive counts</caption>
      <thead>
        <tr className="border-b">
          <th className="p-2">Measure</th>
          <th className="p-2">Count</th>
        </tr>
      </thead>
      <tbody>
        {data.counts.map((row) => (
          <tr className="border-b" key={row.key}>
            <td className="p-2">{row.label}</td>
            <td className="p-2 tabular-nums">{formatMetricCell(row.metric)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <table className="w-full text-left">
      <caption className="sr-only">Distributions</caption>
      <thead>
        <tr className="border-b">
          <th className="p-2">Dimension</th>
          <th className="p-2">Category</th>
          <th className="p-2">Count</th>
          <th className="p-2">Share</th>
        </tr>
      </thead>
      <tbody>
        {data.distributions.map((row) => (
          <tr className="border-b" key={`${row.section}-${row.key}`}>
            <td className="p-2">{sectionLabels[row.section]}</td>
            <td className="p-2">{row.label}</td>
            <td className="p-2 tabular-nums">{formatMetricCell(row.metric)}</td>
            <td className="p-2 tabular-nums">{formatShare(row.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {data.indicatorSummaries.length ? (
      <table className="w-full text-left">
        <caption className="sr-only">Indicator means by unit</caption>
        <thead>
          <tr className="border-b">
            <th className="p-2">Unit</th>
            <th className="p-2">Reported</th>
            <th className="p-2">Mean</th>
            <th className="p-2">Minimum</th>
            <th className="p-2">Maximum</th>
          </tr>
        </thead>
        <tbody>
          {data.indicatorSummaries.map((row) => (
            <tr className="border-b" key={`${row.unitLabel}-${row.numericKind}`}>
              <td className="p-2">{row.unitLabel ?? 'No unit'}</td>
              <td className="p-2 tabular-nums">
                {row.reportedCount}/{row.indicatorCount}
              </td>
              <td className="p-2 tabular-nums">{row.mean ?? 'None yet'}</td>
              <td className="p-2 tabular-nums">{row.minimum ?? 'None yet'}</td>
              <td className="p-2 tabular-nums">{row.maximum ?? 'None yet'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : null}
  </div>
)

/** Capability gaps keep "Data unavailable"; genuinely empty selections pass "None yet". */
const UnavailableChart = ({
  description,
  title = 'Data unavailable',
}: {
  description: string
  title?: string
}) => <EmptyState description={description} icon={BarChart3} title={title} />
