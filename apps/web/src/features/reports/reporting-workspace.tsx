'use client'

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  ShieldAlert,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/pathways/empty-state'
import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { reportKindPermissions } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectDetail,
  ProjectIndicator,
  ReportColumnConfig,
  ReportKind,
  ReportRecord,
  SurveyAggregateResultSet,
  SurveyFormDefinition,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

import { SurveyReportOverview } from './survey-report-overview'
import {
  type SurveyReportSelection,
  buildSurveyReportRows,
  findSurveyResult,
  getFirstSurveySelection,
  getSurveyFormsForProject,
  getSurveyLocations,
  getSurveyPrograms,
  getSurveyProjectIds,
  getSurveyResponseDates,
} from './survey-report-utils'

type ReportRow = Record<string, string | number>

type ReportingWorkspaceProps = {
  activities: Activity[]
  initialKind: ReportKind
  journeyStages: JourneyStageConfig[]
  previewOnly?: boolean
  projects: ProjectDetail[]
  indicators: ProjectIndicator[]
  reports: ReportRecord[]
  surveyForms: SurveyFormDefinition[]
  surveyResults: SurveyAggregateResultSet[]
}

const allValue = 'all'
const emptyBeneficiaryRecords: BeneficiaryRecord[] = []

const reportTabs: { kind: ReportKind; label: string; href: string }[] = [
  { kind: 'project-summary', label: 'Project Summary', href: '/reports/project-summary' },
  { kind: 'indicator-summary', label: 'Indicator Summary', href: '/reports/indicator-summary' },
  {
    kind: 'beneficiary-summary',
    label: 'Beneficiary Summary',
    href: '/reports/beneficiary-summary',
  },
  {
    kind: 'survey-results',
    label: 'Survey/Form Results',
    href: '/reports/survey-results',
  },
]

const reportTitles: Record<ReportKind, string> = {
  'project-summary': 'Project Summary',
  'indicator-summary': 'Indicator Summary',
  'beneficiary-summary': 'Beneficiary Summary',
  'survey-results': 'Survey/Form Results',
}

const reportColumns: Record<ReportKind, ReportColumnConfig[]> = {
  'project-summary': [
    { id: 'id', label: 'ID', enabledByDefault: true },
    { id: 'project', label: 'Project', enabledByDefault: true },
    { id: 'location', label: 'Location', enabledByDefault: true },
    { id: 'startDate', label: 'Start Date', enabledByDefault: true },
    { id: 'endDate', label: 'End Date', enabledByDefault: true },
    { id: 'createdBy', label: 'Created By', enabledByDefault: true },
    { id: 'status', label: 'Status', enabledByDefault: false },
  ],
  'indicator-summary': [
    { id: 'id', label: 'ID', enabledByDefault: true },
    { id: 'indicator', label: 'Indicator', enabledByDefault: true },
    { id: 'target', label: 'Target', enabledByDefault: true },
    { id: 'actualProgress', label: 'Actual Progress', enabledByDefault: true },
    { id: 'status', label: 'Status', enabledByDefault: true },
    { id: 'project', label: 'Project', enabledByDefault: false },
  ],
  'beneficiary-summary': [
    { id: 'code', label: 'Beneficiary Code', enabledByDefault: true },
    { id: 'project', label: 'Project', enabledByDefault: true },
    { id: 'sex', label: 'Sex', enabledByDefault: true },
    { id: 'ageGroup', label: 'Age Group', enabledByDefault: true },
    { id: 'disability', label: 'Disability', enabledByDefault: true },
    { id: 'location', label: 'Location', enabledByDefault: true },
    { id: 'enrollmentStatus', label: 'Enrollment Status', enabledByDefault: true },
  ],
  'survey-results': [
    { id: 'question', label: 'Survey Question', enabledByDefault: true },
    { id: 'resultType', label: 'Result Type', enabledByDefault: true },
    { id: 'summary', label: 'Aggregate Result', enabledByDefault: true },
    { id: 'responses', label: 'Responses', enabledByDefault: true },
  ],
}

const defaultVisibleColumns = Object.fromEntries(
  Object.entries(reportColumns).map(([kind, columns]) => [
    kind,
    columns.filter((column) => column.enabledByDefault).map((column) => column.id),
  ]),
) as Record<ReportKind, string[]>

const formatDate = (value?: string) => {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

const splitPeriod = (period: string) => {
  const [startDate, endDate] = period.split(' - ')
  return { startDate: startDate ?? 'Not available', endDate: endDate ?? 'Not available' }
}

const projectCode = (index: number) => String(index + 1).padStart(3, '0')

const progressLabel = (actual: number, target: number) => {
  const progress = target > 0 ? Math.round((actual / target) * 100) : 0
  return `${progress}% of target`
}

const statusTone = (status: string) => {
  if (['On Track', 'Met', 'Completed', 'Active'].includes(status)) {
    return 'success'
  }

  if (['Needs Review', 'Monitoring', 'Pending Review'].includes(status)) {
    return 'warning'
  }

  return 'neutral'
}

export const ReportingWorkspace = ({
  activities,
  indicators,
  initialKind,
  journeyStages,
  previewOnly = false,
  projects,
  reports,
  surveyForms,
  surveyResults,
}: ReportingWorkspaceProps) => {
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const canViewBeneficiarySummary = role
    ? can(role, reportKindPermissions['beneficiary-summary'])
    : false
  const visibleReportTabs = useMemo(
    () => (role ? reportTabs.filter((tab) => can(role, reportKindPermissions[tab.kind])) : []),
    [role],
  )
  const initialVisibleKind = visibleReportTabs.some((tab) => tab.kind === initialKind)
    ? initialKind
    : (visibleReportTabs[0]?.kind ?? initialKind)

  const [kind, setKind] = useState<ReportKind>(initialVisibleKind)
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState(allValue)
  const [beneficiaryData, setBeneficiaryData] = useState<{
    role: PathwaysRole
    records: BeneficiaryRecord[]
  } | null>(null)
  const [beneficiaryLoadState, setBeneficiaryLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [surveySelection, setSurveySelection] = useState(() => {
    const initialProjectIds = new Set(
      role
        ? projects
            .filter((project) => canAccessProjectForRole(role, project.id))
            .map((project) => project.id)
        : [],
    )
    const initialForms = surveyForms.filter((form) => initialProjectIds.has(form.projectId))
    const initialResults = surveyResults.filter((result) => initialProjectIds.has(result.projectId))

    return getFirstSurveySelection(initialForms[0]?.id ?? '', initialResults)
  })
  const [indicatorGenerated, setIndicatorGenerated] = useState(initialKind !== 'indicator-summary')
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(previewOnly)
  const [visibleColumns, setVisibleColumns] =
    useState<Record<ReportKind, string[]>>(defaultVisibleColumns)

  useEffect(() => {
    if (visibleReportTabs.length === 0 || visibleReportTabs.some((tab) => tab.kind === kind)) {
      return
    }

    setKind(visibleReportTabs[0].kind)
    setSearch('')
    setProjectId(allValue)
  }, [kind, visibleReportTabs])

  useEffect(() => {
    if (kind !== 'beneficiary-summary' || !canViewBeneficiarySummary || !role) {
      setBeneficiaryData(null)
      setBeneficiaryLoadState('idle')
      return
    }

    let active = true
    setBeneficiaryData(null)
    setBeneficiaryLoadState('loading')

    pathwaysClient
      .getBeneficiaryRecordsForRole(role)
      .then((records) => {
        if (!active) return
        setBeneficiaryData({ role, records })
        setBeneficiaryLoadState('ready')
      })
      .catch(() => {
        if (!active) return
        setBeneficiaryData(null)
        setBeneficiaryLoadState('error')
      })

    return () => {
      active = false
    }
  }, [canViewBeneficiarySummary, kind, role])

  const scopedProjects = useMemo(
    () => (role ? projects.filter((project) => canAccessProjectForRole(role, project.id)) : []),
    [projects, role],
  )
  const scopedProjectIds = useMemo(
    () => new Set(scopedProjects.map((project) => project.id)),
    [scopedProjects],
  )
  const scopedActivities = useMemo(
    () => activities.filter((activity) => scopedProjectIds.has(activity.projectId)),
    [activities, scopedProjectIds],
  )
  const scopedIndicators = useMemo(
    () => indicators.filter((indicator) => scopedProjectIds.has(indicator.projectId)),
    [indicators, scopedProjectIds],
  )
  const scopedJourneyStages = useMemo(
    () => journeyStages.filter((stage) => scopedProjectIds.has(stage.projectId)),
    [journeyStages, scopedProjectIds],
  )
  const scopedReports = useMemo(
    () => reports.filter((report) => scopedProjectIds.has(report.projectId)),
    [reports, scopedProjectIds],
  )
  const scopedSurveyForms = useMemo(
    () => surveyForms.filter((form) => scopedProjectIds.has(form.projectId)),
    [scopedProjectIds, surveyForms],
  )
  const scopedSurveyResults = useMemo(
    () => surveyResults.filter((result) => scopedProjectIds.has(result.projectId)),
    [scopedProjectIds, surveyResults],
  )

  useEffect(() => {
    const selectedFormIsAccessible = scopedSurveyForms.some(
      (form) => form.id === surveySelection.formId,
    )
    const selectedResultIsAccessible = findSurveyResult(scopedSurveyResults, surveySelection)

    if (selectedFormIsAccessible && selectedResultIsAccessible) {
      return
    }

    const nextSelection = getFirstSurveySelection(
      scopedSurveyForms[0]?.id ?? '',
      scopedSurveyResults,
    )

    if (
      nextSelection.formId !== surveySelection.formId ||
      nextSelection.location !== surveySelection.location ||
      nextSelection.responseDate !== surveySelection.responseDate
    ) {
      setSurveySelection(nextSelection)
    }
  }, [scopedSurveyForms, scopedSurveyResults, surveySelection])

  const effectiveProjectId =
    projectId === allValue || scopedProjectIds.has(projectId) ? projectId : allValue
  const beneficiaries =
    canViewBeneficiarySummary && beneficiaryData?.role === role
      ? beneficiaryData.records
      : emptyBeneficiaryRecords

  const selectedProject =
    effectiveProjectId === allValue
      ? undefined
      : scopedProjects.find((project) => project.id === effectiveProjectId)
  const selectedSurveyForm = scopedSurveyForms.find((form) => form.id === surveySelection.formId)
  const selectedSurveyResult = findSurveyResult(scopedSurveyResults, surveySelection)
  const selectedSurveyProject = scopedProjects.find(
    (project) => project.id === selectedSurveyForm?.projectId,
  )
  const selectedSurveyStage = scopedJourneyStages.find(
    (stage) => stage.id === selectedSurveyForm?.journeyStageId,
  )
  const selectedSurveyActivity = scopedActivities.find(
    (activity) => activity.id === selectedSurveyForm?.activityId,
  )
  const surveyPrograms = getSurveyPrograms(scopedSurveyForms)
  const surveyProjectIds = getSurveyProjectIds(
    scopedSurveyForms,
    selectedSurveyForm?.programName ?? surveyPrograms[0] ?? '',
  )
  const visibleSurveyForms = getSurveyFormsForProject(
    scopedSurveyForms,
    selectedSurveyForm?.programName ?? surveyPrograms[0] ?? '',
    selectedSurveyForm?.projectId ?? surveyProjectIds[0] ?? '',
  )
  const surveyLocations = getSurveyLocations(scopedSurveyResults, surveySelection.formId)
  const surveyResponseDates = getSurveyResponseDates(
    scopedSurveyResults,
    surveySelection.formId,
    surveySelection.location,
  )

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const projectTitle = (id: string) =>
      scopedProjects.find((project) => project.id === id)?.title ?? 'Unmapped project'

    const matchesQuery = (values: Array<string | number>) =>
      query ? values.join(' ').toLowerCase().includes(query) : true

    if (kind === 'survey-results') {
      return buildSurveyReportRows(selectedSurveyForm, selectedSurveyResult)
        .map((row): ReportRow => row)
        .filter((row) => matchesQuery(Object.values(row)))
    }

    if (kind === 'project-summary') {
      return scopedProjects
        .filter((project) => effectiveProjectId === allValue || project.id === effectiveProjectId)
        .map((project, index): ReportRow => {
          const period = splitPeriod(project.period)

          return {
            id: projectCode(index),
            project: project.title,
            location: project.area,
            startDate: project.startDate ? formatDate(project.startDate) : period.startDate,
            endDate: project.endDate ? formatDate(project.endDate) : period.endDate,
            createdBy: project.projectManager,
            status: project.status,
          }
        })
        .filter((row) => matchesQuery(Object.values(row)))
    }

    if (kind === 'indicator-summary') {
      if (!indicatorGenerated) {
        return []
      }

      return scopedIndicators
        .filter((indicator) =>
          selectedProject ? indicator.projectId === selectedProject.id : true,
        )
        .map(
          (indicator, index): ReportRow => ({
            id: projectCode(index),
            indicator: indicator.label,
            target: indicator.target,
            actualProgress: progressLabel(indicator.actual, indicator.target),
            status: indicator.status === 'Needs Review' ? 'Monitoring' : indicator.status,
            project: projectTitle(indicator.projectId),
          }),
        )
        .filter((row) => matchesQuery(Object.values(row)))
    }

    return beneficiaries
      .filter((beneficiary) =>
        effectiveProjectId === allValue
          ? true
          : beneficiary.projectIds.includes(effectiveProjectId),
      )
      .map(
        (beneficiary): ReportRow => ({
          code: beneficiary.code,
          project: beneficiary.projectIds.map(projectTitle).join(', '),
          sex: beneficiary.sex,
          ageGroup: beneficiary.ageGroup,
          disability: beneficiary.disabilityStatus,
          location: beneficiary.location,
          enrollmentStatus: beneficiary.enrollmentStatus,
        }),
      )
      .filter((row) => matchesQuery(Object.values(row)))
  }, [
    beneficiaries,
    effectiveProjectId,
    indicatorGenerated,
    kind,
    scopedIndicators,
    scopedProjects,
    search,
    selectedProject,
    selectedSurveyForm,
    selectedSurveyResult,
  ])

  const activeColumns = useMemo(
    () => reportColumns[kind].filter((column) => visibleColumns[kind].includes(column.id)),
    [kind, visibleColumns],
  )

  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () =>
      activeColumns.map((column) => ({
        accessorKey: column.id,
        header: column.label,
        cell: ({ row }) => {
          const value = row.original[column.id]

          if (column.id === 'status' || column.id === 'enrollmentStatus') {
            return <StatusBadge tone={statusTone(String(value))}>{value}</StatusBadge>
          }

          if (column.id === 'actualProgress') {
            const percent = Number(String(value).match(/^\d+/)?.[0] ?? 0)
            return (
              <div className="min-w-[220px] space-y-2">
                <ProgressBar value={percent} tone={percent >= 75 ? 'success' : 'warning'} />
                <p className="text-xs text-muted-foreground">{value}</p>
              </div>
            )
          }

          return <span>{value}</span>
        },
      })),
    [activeColumns],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
  })

  const toggleColumn = (columnId: string) => {
    setVisibleColumns((current) => {
      const active = current[kind]
      const nextActive = active.includes(columnId)
        ? active.filter((id) => id !== columnId)
        : [...active, columnId]

      return {
        ...current,
        [kind]: nextActive.length > 0 ? nextActive : active,
      }
    })
  }

  const generateIndicatorReport = () => {
    const availableIndicators = scopedIndicators.filter((indicator) =>
      selectedProject ? indicator.projectId === selectedProject.id : true,
    )

    if (availableIndicators.length === 0) {
      toast.error('No indicator data are available for this report.', {
        description: 'Choose a project with indicator data or try again after data are loaded.',
      })
      return
    }

    setIndicatorGenerated(true)
    toast.success('Indicator report generated.', {
      description: 'This table uses the currently loaded project data.',
    })
  }

  const selectSurveyForm = (formId: string) => {
    setSurveySelection(getFirstSurveySelection(formId, scopedSurveyResults))
  }

  const selectSurveyProgram = (programName: string) => {
    const nextProjectId = getSurveyProjectIds(scopedSurveyForms, programName)[0]
    const nextForm = nextProjectId
      ? getSurveyFormsForProject(scopedSurveyForms, programName, nextProjectId)[0]
      : undefined

    if (nextForm) selectSurveyForm(nextForm.id)
  }

  const selectSurveyProject = (nextProjectId: string) => {
    const nextForm = getSurveyFormsForProject(
      scopedSurveyForms,
      selectedSurveyForm?.programName ?? '',
      nextProjectId,
    )[0]

    if (nextForm) selectSurveyForm(nextForm.id)
  }

  const selectSurveyLocation = (location: string) => {
    setSurveySelection((current) => ({
      ...current,
      location,
      responseDate: getSurveyResponseDates(scopedSurveyResults, current.formId, location)[0] ?? '',
    }))
  }

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error('No report rows are available to export.', {
        description: 'Adjust the report filters or load report data before exporting a CSV.',
      })
      return
    }

    const headers = activeColumns.map((column) => column.label)
    const csvRows = rows.map((row) =>
      activeColumns
        .map((column) => `"${String(row[column.id] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    )
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${kind}-report.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported from the browser.', {
      description: 'The current report was downloaded to this device.',
    })
  }

  const openExportPreview = (format: 'PDF' | 'Excel') => {
    // TODO(REPORTING): Generate PDF and spreadsheet reports through the backend.
    setPreviewOpen(true)
    toast.info(`${format} preview opened.`, {
      description: 'A preview opened; no downloadable file was created.',
    })
  }

  const switchKind = (nextKind: ReportKind) => {
    setKind(nextKind)
    setSearch('')
    setProjectId(allValue)
  }

  if (!role) {
    return (
      <EmptyState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="A verified staff identity and role are required to load scoped reports."
        icon={ShieldAlert}
        title="Reports access unavailable"
      />
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-primary">{labels.moduleReports}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleReports}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Build project, indicator, Beneficiary, and aggregate survey reports from currently
              available data. PDF and spreadsheet actions remain previews until export services are
              configured.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/reports/preview?kind=${kind}`}>
                <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                Open report preview
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap gap-2" aria-label="Report sections">
              {visibleReportTabs.map((tab) => (
                <Button
                  asChild
                  key={tab.kind}
                  variant={kind === tab.kind ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => switchKind(tab.kind)}
                >
                  <Link href={tab.href}>{tab.label}</Link>
                </Button>
              ))}
            </nav>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setColumnDialogOpen(true)}>
                <Columns3 className="mr-2 h-4 w-4" aria-hidden="true" />
                Columns
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                Preview
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openExportPreview('PDF')}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    Preview PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openExportPreview('Excel')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                    Preview Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <CardTitle>{reportTitles[kind]}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {kind === 'survey-results'
                  ? `${scopedSurveyResults.length} aggregate survey result sets are available for review.`
                  : `${scopedReports.length} saved report records are available for reference.`}
              </p>
            </div>
            {kind === 'survey-results' ? (
              <SurveyFilters
                dates={surveyResponseDates}
                forms={visibleSurveyForms}
                locations={surveyLocations}
                onDateChange={(responseDate) =>
                  setSurveySelection((current) => ({ ...current, responseDate }))
                }
                onFormChange={selectSurveyForm}
                onGenerate={() => {
                  if (!selectedSurveyForm || !selectedSurveyResult) {
                    toast.error('No aggregate survey data are available for this report.', {
                      description: 'Choose a Survey/Form, location, and response date with data.',
                    })
                    return
                  }

                  toast.success('Aggregate survey report generated.', {
                    description: 'The report uses currently loaded aggregate data only.',
                  })
                }}
                onLocationChange={selectSurveyLocation}
                onProgramChange={selectSurveyProgram}
                onProjectChange={selectSurveyProject}
                onSearchChange={setSearch}
                programs={surveyPrograms}
                projectIds={surveyProjectIds}
                projects={scopedProjects}
                search={search}
                selection={surveySelection}
                selectedForm={selectedSurveyForm}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
                <span className="relative block">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label={`${reportTitles[kind]} search`}
                    className="pl-9"
                    placeholder="Type here"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </span>
                <Select value={effectiveProjectId} onValueChange={setProjectId}>
                  <SelectTrigger aria-label={`${reportTitles[kind]} project filter`}>
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allValue}>All projects</SelectItem>
                    {scopedProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {kind === 'indicator-summary' ? (
                  <Button onClick={generateIndicatorReport}>
                    <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                    Generate
                  </Button>
                ) : (
                  <Button disabled variant="outline">
                    <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                    Filters update automatically
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {kind === 'survey-results' ? (
            selectedSurveyForm && selectedSurveyResult ? (
              <SurveyReportOverview
                activity={selectedSurveyActivity}
                form={selectedSurveyForm}
                journeyStage={selectedSurveyStage}
                project={selectedSurveyProject}
                result={selectedSurveyResult}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="font-medium text-foreground">No aggregate survey results found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose another Survey/Form, location, or response date. No individual response
                  records are loaded for this report.
                </p>
              </div>
            )
          ) : null}
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(activeColumns.length, 1)}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {kind === 'beneficiary-summary' && beneficiaryLoadState === 'loading'
                      ? 'Loading scoped Beneficiary records...'
                      : kind === 'beneficiary-summary' && beneficiaryLoadState === 'error'
                        ? 'Scoped Beneficiary records could not be loaded. Try opening this report again.'
                        : kind === 'indicator-summary'
                          ? 'Generate a report.'
                          : kind === 'survey-results'
                            ? 'No aggregate question summaries match the current filters.'
                            : 'No report rows match the current filters.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              Showing {table.getRowModel().rows.length} of {rows.length} report rows.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select columns</DialogTitle>
            <DialogDescription>
              Choose the columns shown in the current report view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {reportColumns[kind].map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[kind].includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setColumnDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>
              The preview uses the selected columns and currently loaded data. Downloadable PDF or
              spreadsheet files are not created here.
            </DialogDescription>
          </DialogHeader>
          {kind === 'survey-results' && selectedSurveyForm && selectedSurveyResult ? (
            <SurveyReportOverview
              activity={selectedSurveyActivity}
              compact
              form={selectedSurveyForm}
              journeyStage={selectedSurveyStage}
              project={selectedSurveyProject}
              result={selectedSurveyResult}
            />
          ) : null}
          <div className="overflow-x-auto border border-border">
            <div className="h-3 bg-success" />
            <div className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    {activeColumns.map((column) => (
                      <TableHead key={column.id}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.slice(0, 5).map((row) => (
                      <TableRow key={activeColumns.map((column) => row[column.id]).join('-')}>
                        {activeColumns.map((column) => (
                          <TableCell key={column.id}>{row[column.id]}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={Math.max(activeColumns.length, 1)}
                      >
                        No report rows are available for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type SurveyFiltersProps = {
  dates: string[]
  forms: SurveyFormDefinition[]
  locations: string[]
  onDateChange: (value: string) => void
  onFormChange: (value: string) => void
  onGenerate: () => void
  onLocationChange: (value: string) => void
  onProgramChange: (value: string) => void
  onProjectChange: (value: string) => void
  onSearchChange: (value: string) => void
  programs: string[]
  projectIds: string[]
  projects: ProjectDetail[]
  search: string
  selection: SurveyReportSelection
  selectedForm?: SurveyFormDefinition
}

const SurveyFilters = ({
  dates,
  forms,
  locations,
  onDateChange,
  onFormChange,
  onGenerate,
  onLocationChange,
  onProgramChange,
  onProjectChange,
  onSearchChange,
  programs,
  projectIds,
  projects,
  search,
  selection,
  selectedForm,
}: SurveyFiltersProps) => (
  <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-5xl xl:grid-cols-3">
    <FilterField label="Program">
      <Select value={selectedForm?.programName ?? ''} onValueChange={onProgramChange}>
        <SelectTrigger aria-label="Survey results program filter">
          <SelectValue placeholder="Choose program" />
        </SelectTrigger>
        <SelectContent>
          {programs.map((program) => (
            <SelectItem key={program} value={program}>
              {program}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>

    <FilterField label="Project">
      <Select value={selectedForm?.projectId ?? ''} onValueChange={onProjectChange}>
        <SelectTrigger aria-label="Survey results project filter">
          <SelectValue placeholder="Choose project" />
        </SelectTrigger>
        <SelectContent>
          {projectIds.map((id) => (
            <SelectItem key={id} value={id}>
              {projects.find((project) => project.id === id)?.title ?? id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>

    <FilterField label="Survey/Form">
      <Select value={selection.formId} onValueChange={onFormChange}>
        <SelectTrigger aria-label="Survey results form filter">
          <SelectValue placeholder="Choose Survey/Form" />
        </SelectTrigger>
        <SelectContent>
          {forms.map((form) => (
            <SelectItem key={form.id} value={form.id}>
              {form.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>

    <FilterField label="Location">
      <Select
        disabled={locations.length === 0}
        value={selection.location}
        onValueChange={onLocationChange}
      >
        <SelectTrigger aria-label="Survey results location filter">
          <SelectValue placeholder="No locations" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((location) => (
            <SelectItem key={location} value={location}>
              {location}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>

    <FilterField label="Exact response date">
      <Select
        disabled={dates.length === 0}
        value={selection.responseDate}
        onValueChange={onDateChange}
      >
        <SelectTrigger aria-label="Survey results response date filter">
          <SelectValue placeholder="No response dates" />
        </SelectTrigger>
        <SelectContent>
          {dates.map((date) => (
            <SelectItem key={date} value={date}>
              {formatDate(date)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>

    <FilterField label="Search question summaries">
      <span className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Survey/Form Results search"
          className="pl-9"
          placeholder="Search aggregate results"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </span>
    </FilterField>

    <Button className="sm:col-span-2 xl:col-span-3" onClick={onGenerate}>
      <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
      Generate aggregate report
    </Button>
  </div>
)

const FilterField = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    {children}
  </div>
)
