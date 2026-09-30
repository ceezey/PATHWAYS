'use client'

import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  Download,
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
import { UnavailableHint, unavailableControlProps } from '@/components/pathways/unavailable-hint'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED,
  UNFINISHED_CONTROLS_UI_ENABLED,
} from '@/constants/feature-flags'
import { metricUnavailableLabel, overviewMetricLabel } from '@/features/projects/project-utils'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient, downloadCoreArtifact } from '@/lib/services/core-feature-client'
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
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { toProjectCoverageFeatureCollection } from './analytics-location-utils'
import {
  deriveAnalyticsReportingPeriods,
  nonOverlappingAnalyticsPeriods,
} from './analytics-reporting-periods'

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
const openProjectSaddd = "SADDD analysis is available only after the project's recorded end date."

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

const metricNumber = (cell: { value: string | null }) => {
  if (cell.value === null) return null
  const value = Number(cell.value)
  return Number.isFinite(value) ? value : null
}

type SurveyErrorKind = 'restricted' | 'period' | 'retry'
const SURVEY_RESTRICTED_MESSAGE = 'Survey improvement is restricted for your role.'
const SURVEY_PERIOD_MESSAGE = 'This reporting period cannot be used for survey results.'

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

export const AnalyticsDashboard = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  const canReadDescriptive = principalHasAtomicPermission(profile, 'analytics.descriptive.read')
  // Survey and timeline read person-derived aggregates, so the API requires both permissions
  // (analytics.descriptive.read and monitoring.read). Anything less is restricted, never "None yet".
  const canReadSurveyTimeline = canReadDescriptive && canReadIndicators
  // Survey improvement additionally requires assessments.detail.read (CR amendment 2026-09-30):
  // aggregate-only roles (Program Manager, Grant Manager) see an explicit restricted state.
  const canReadSurvey =
    canReadSurveyTimeline && principalHasAtomicPermission(profile, 'assessments.detail.read')
  const canExportAnalytics =
    canReadDescriptive && principalHasAtomicPermission(profile, 'analytics.export')
  const canReadBudgetUtilization =
    principalHasAtomicPermission(profile, 'budgets.read') &&
    principalHasAtomicPermission(profile, 'expenses.read')
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
  const [budgetTotals, setBudgetTotals] = useState<{
    planned: number
    approved: number
    categories: number
  } | null>(null)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [budgetLoadAttempt, setBudgetLoadAttempt] = useState(0)
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
  const pickerPeriods = analysisView === 'survey' ? surveyPeriods : reportingPeriods
  const pickerPeriod = analysisView === 'survey' ? surveyPeriod : selectedPeriod
  const sadddUnavailableReason =
    !selectedProject?.startDate || !selectedProject.endDate
      ? missingSadddDates
      : selectedProject.endDate >= businessDateInManila()
        ? openProjectSaddd
        : ''
  const sadddEligible = sadddUnavailableReason === ''

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
    if (!projectId || !selectedProject || !canReadBudgetUtilization) {
      setBudgetLoading(false)
      setBudgetTotals(null)
      setBudgetError('')
      return
    }
    void budgetLoadAttempt
    let active = true
    setBudgetLoading(true)
    setBudgetError('')
    Promise.all([coreDataClient.budgets(projectId), coreDataClient.expenses(projectId)])
      .then(([budgets, expenses]) => {
        if (!active) return
        const planned = budgets.reduce((sum, row) => sum + Number(row.plannedBudget), 0)
        const approved = expenses
          .filter((row) => row.status === 'APPROVED')
          .reduce((sum, row) => sum + Number(row.amount), 0)
        setBudgetTotals({ planned, approved, categories: budgets.length })
      })
      .catch((caught: unknown) => {
        if (active)
          setBudgetError(
            caught instanceof Error ? caught.message : 'Budget utilization is unavailable.',
          )
      })
      .finally(() => {
        if (active) setBudgetLoading(false)
      })
    return () => {
      active = false
    }
  }, [budgetLoadAttempt, canReadBudgetUtilization, projectId, selectedProject])

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
      setSadddError(sadddUnavailableReason)
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
  }, [projectId, sadddEligible, sadddLoadAttempt, sadddUnavailableReason, selectedProject])

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
    if (!projectId || !surveyPeriod || !canReadSurvey || analysisView !== 'survey') {
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
              ? SURVEY_PERIOD_MESSAGE
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
  }, [analysisView, canReadSurvey, projectId, surveyPeriod, surveyLoadAttempt])

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

  const exportDescriptive = async () => {
    const view = analysisView === 'survey' || analysisView === 'timeline' ? analysisView : undefined
    if (!ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED || !canExportAnalytics || !projectId || exporting)
      return
    const exportPeriod = view === 'survey' ? surveyPeriod : selectedPeriod
    if (view !== 'timeline' && !exportPeriod) return
    const capturedProject = projectId
    setExporting(true)
    try {
      await downloadCoreArtifact(
        `/analytics/descriptive/export${descriptiveAnalyticsSearch({
          projectId: capturedProject,
          ...(exportPeriod ? { periodStart: exportPeriod.start, periodEnd: exportPeriod.end } : {}),
          ...(view ? { view } : {}),
        })}`,
        `${view ?? 'descriptive'}-analytics-${capturedProject.toLowerCase()}.csv`,
      )
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Aggregate export unavailable.')
    } finally {
      setExporting(false)
    }
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
    setBudgetTotals(null)
    setBudgetError('')
    setProjectDataLoading(true)
    setMonitoringLoading(false)
    setSadddLoading(false)
    setProjectDataError('')
    setMonitoringError('')
    setSadddError('')
  }

  const budgetUtilizationPercent =
    budgetTotals && budgetTotals.planned > 0
      ? Math.round((budgetTotals.approved / budgetTotals.planned) * 1000) / 10
      : null
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
  // "None yet" only when the role can read the source and the read succeeded empty.
  const periodsReadable = canReadIndicators && !projectDataLoading && !projectDataError
  const monitoringReadable = canReadIndicators && monitoring !== null && !monitoringError
  // The participation chart title reflects the source cell instead of assuming "None
  // yet": SUPPRESSED gets the suppression wording and other withheld reasons fall
  // through to the panel's "Data unavailable" default, matching overviewMetricLabel.
  const participationEmptyTitle = (() => {
    if (!monitoring) return undefined
    const label = metricUnavailableLabel(monitoring.participationRecords)
    return label === 'None yet' || monitoring.participationRecords.state === 'SUPPRESSED'
      ? label
      : undefined
  })()
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
                .filter((view) => UNFINISHED_CONTROLS_UI_ENABLED || view.value !== 'participation')
                .map((view) => (
                  <SelectItem
                    disabled={
                      (view.value === 'survey' && !canReadSurvey) ||
                      (view.value === 'timeline' && !canReadSurveyTimeline)
                    }
                    key={view.value}
                    title={
                      (view.value === 'survey' && !canReadSurvey) ||
                      (view.value === 'timeline' && !canReadSurveyTimeline)
                        ? 'Not available for this role'
                        : undefined
                    }
                    value={view.value}
                  >
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
        {UNFINISHED_CONTROLS_UI_ENABLED ? (
          <div className="flex items-end sm:col-span-2 xl:col-span-3 xl:col-start-10 xl:row-start-3">
            <Button
              className="shrink-0"
              type="button"
              {...unavailableControlProps('analytics-add-to-dashboard-hint')}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add to Dashboard
            </Button>
            <UnavailableHint id="analytics-add-to-dashboard-hint" />
          </div>
        ) : null}
        {ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED && canExportAnalytics ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 sm:col-span-2 xl:col-span-12 xl:row-start-4">
            <Button
              className="shrink-0"
              disabled={
                !selectedProject ||
                exporting ||
                (analysisView !== 'timeline' && !pickerPeriod) ||
                (analysisView === 'survey' && !canReadSurvey)
              }
              onClick={() => void exportDescriptive()}
              type="button"
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {exporting ? 'Exporting aggregates' : 'Export aggregates (CSV)'}
            </Button>
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
                ? `Interactive coverage for ${selectedProject.title}. Only authoritative persisted project coordinates are plotted.`
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
            ) : analysisView === 'survey' && !canReadSurvey ? (
              <UnavailableChart description={SURVEY_RESTRICTED_MESSAGE} />
            ) : analysisView === 'timeline' && !canReadSurveyTimeline ? (
              <UnavailableChart description="Timeline adherence is not available for this role." />
            ) : analysisView === 'survey' ? (
              <SurveyAnalyticsPanel
                activities={activities}
                data={survey}
                error={surveyError}
                errorKind={surveyErrorKind}
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
                title={
                  !monitoringReadable
                    ? undefined
                    : analysisView === 'participation'
                      ? participationEmptyTitle
                      : 'None yet'
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
              value={
                averageKpi !== null
                  ? `${averageKpi}%`
                  : monitoringReadable
                    ? 'None yet'
                    : 'Unavailable'
              }
            />
            <MetricCard
              description={
                !canReadBudgetUtilization
                  ? 'Budget and expense permissions are required for this metric.'
                  : budgetError
                    ? budgetError
                    : budgetTotals && budgetTotals.categories === 0
                      ? 'No budget allocations are recorded for this project.'
                      : 'Approved expenses against planned budget allocations for this project.'
              }
              icon={CircleDollarSign}
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
                  : budgetLoading
                    ? 'Loading...'
                    : budgetError
                      ? 'Unavailable'
                      : budgetUtilizationPercent !== null
                        ? `${budgetUtilizationPercent}%`
                        : 'None yet'
              }
            />
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
          </section>
          <section className="space-y-6" aria-labelledby="fixed-monitoring-charts-title">
            <h2 className="text-lg font-semibold" id="fixed-monitoring-charts-title">
              Monitoring charts
            </h2>
            <ChartPanel title="Indicator progress">
              {indicators.some((row) => metricNumber(row.progress) !== null) ? (
                <IndicatorProgressChart
                  rows={indicators.flatMap((row) => {
                    const value = metricNumber(row.progress)
                    return value === null ? [] : [{ id: row.id, label: row.name, value }]
                  })}
                />
              ) : (
                <UnavailableChart
                  description="No released indicator progress for this project and period."
                  {...(monitoringReadable ? { title: 'None yet' } : {})}
                />
              )}
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
            <ChartPanel title="Activity completion">
              {canReadActivities ? (
                <ActivityCompletionChart activities={activities} />
              ) : (
                <UnavailableChart description="Activity details are not available for this role." />
              )}
            </ChartPanel>
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Budget utilization">
                {!canReadBudgetUtilization ? (
                  <UnavailableChart description="Budget and expense read permissions are required for this chart." />
                ) : budgetLoading ? (
                  <AsyncState
                    status="loading"
                    title="Loading budget utilization"
                    description="Verifying current budget and expense access."
                    icon={CircleDollarSign}
                  />
                ) : budgetError ? (
                  <AsyncState
                    status="error"
                    title="Budget utilization unavailable"
                    description={budgetError}
                    icon={AlertTriangle}
                    onRetry={() => setBudgetLoadAttempt((value) => value + 1)}
                  />
                ) : budgetTotals && budgetTotals.categories > 0 ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Planned budget</dt>
                      <dd className="mt-1 font-medium text-foreground tabular-nums">
                        PHP {budgetTotals.planned.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Approved expenses</dt>
                      <dd className="mt-1 font-medium text-foreground tabular-nums">
                        PHP {budgetTotals.approved.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Utilization</dt>
                      <dd className="mt-1 font-medium text-foreground tabular-nums">
                        {budgetUtilizationPercent !== null
                          ? `${budgetUtilizationPercent}%`
                          : 'None yet'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <UnavailableChart
                    description="Record a budget allocation before utilization can be shown."
                    title="None yet"
                  />
                )}
              </ChartPanel>
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
