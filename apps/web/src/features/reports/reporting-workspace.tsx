'use client'

type ExportFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'
import { formatMetricCell } from '@pathways/shared'
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
  Save,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, StatusMessage } from '@/components/pathways'
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
import { Label } from '@/components/ui/label'
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
import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { reportKindPermissions } from '@/lib/rbac/route-access'
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

const reportTypes: { kind: ReportKind; label: string }[] = [
  { kind: 'project-summary', label: 'Project Summary' },
  { kind: 'indicator-summary', label: 'Indicator Summary' },
  {
    kind: 'beneficiary-summary',
    label: 'Beneficiary Summary',
  },
  {
    kind: 'survey-results',
    label: 'Survey/Form Results',
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
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

const splitPeriod = (period: string) => {
  const [startDate, endDate] = period.split(' - ')
  return { startDate: startDate ?? 'Start unavailable', endDate: endDate ?? 'End unavailable' }
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
  activities: initialActivities,
  indicators: initialIndicators,
  initialKind,
  journeyStages: initialJourneyStages,
  previewOnly = false,
  projects: initialProjects,
  reports,
  surveyForms,
  surveyResults,
}: ReportingWorkspaceProps) => {
  const { labels } = useDisplayLabels()
  const { role, assignedProjectIds } = useCurrentRole()
  const projects = initialProjects
  const activities = initialActivities
  const indicators = initialIndicators
  const journeyStages = initialJourneyStages
  const visibleReportTypes = useMemo(
    () =>
      reportTypes.filter((reportType) => role && can(role, reportKindPermissions[reportType.kind])),
    [role],
  )
  const initialVisibleKind = visibleReportTypes.some(
    (reportType) => reportType.kind === initialKind,
  )
    ? initialKind
    : (visibleReportTypes[0]?.kind ?? initialKind)

  const [kind, setKind] = useState<ReportKind>(initialVisibleKind)
  const [search, setSearch] = useState('')
  const [beneficiaryLoadState, setBeneficiaryLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [surveySelection, setSurveySelection] = useState(() => {
    const initialProjectIds = new Set(
      projects
        .filter((project) => role && canAccessProjectForRole(role, project.id, assignedProjectIds))
        .map((project) => project.id),
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
    if (
      visibleReportTypes.length &&
      !visibleReportTypes.some((reportType) => reportType.kind === kind)
    ) {
      setKind(visibleReportTypes[0].kind)
      setSearch('')
    }
  }, [kind, visibleReportTypes])

  useEffect(() => {
    setBeneficiaryLoadState(kind === 'beneficiary-summary' ? 'error' : 'idle')
  }, [kind])
  const scopedProjects = useMemo(
    () =>
      projects.filter(
        (project) => role && canAccessProjectForRole(role, project.id, assignedProjectIds),
      ),
    [projects, role, assignedProjectIds],
  )
  const [projectId, setProjectId] = useSafeProjectSelection(
    scopedProjects.map((project) => project.id),
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

  const effectiveProjectId = scopedProjectIds.has(projectId)
    ? projectId
    : (scopedProjects[0]?.id ?? '')
  const beneficiaries = emptyBeneficiaryRecords

  const selectedProject = scopedProjects.find((project) => project.id === effectiveProjectId)
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
        .filter((project) => project.id === effectiveProjectId)
        .map((project): ReportRow => {
          const period = splitPeriod(project.period)

          return {
            id: project.code ?? project.id,
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
          (indicator): ReportRow => ({
            id: indicator.code,
            indicator: indicator.name,
            target: indicator.target ?? 'Unavailable',
            actualProgress: formatMetricCell(indicator.progress),
            status: indicator.status,
            project: projectTitle(indicator.projectId),
          }),
        )
        .filter((row) => matchesQuery(Object.values(row)))
    }

    return beneficiaries
      .filter((beneficiary) => beneficiary.projectIds.includes(effectiveProjectId))
      .map(
        (beneficiary): ReportRow => ({
          code: beneficiary.code,
          project: beneficiary.projectIds.map(projectTitle).join(', '),
          sex: beneficiary.sex,
          ageGroup: beneficiary.ageGroup ?? 'Unavailable',
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
    setIndicatorGenerated(true)
    toast.info('Showing the indicators returned by the current API.')
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

  const finishReportPreview = () => {
    toast.error('Saving report history is unavailable in the current API. No report was saved.')
  }

  const exportReport = (_format: ExportFormat) => {
    toast.error('Report export is unavailable in the current API. No file was generated.')
  }

  const switchKind = (nextKind: ReportKind) => {
    setKind(nextKind)
    setSearch('')
    setIndicatorGenerated(nextKind !== 'indicator-summary')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        editableLabelKey="moduleReports"
        eyebrow="Reporting workspace"
        title={labels.moduleReports}
      />

      <Card>
        <CardHeader className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full space-y-2 sm:max-w-xs">
              <Label htmlFor="report-type">Report type</Label>
              <Select value={kind} onValueChange={(value) => switchKind(value as ReportKind)}>
                <SelectTrigger id="report-type" aria-label="Report type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibleReportTypes.map((reportType) => (
                    <SelectItem key={reportType.kind} value={reportType.kind}>
                      {reportType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="flex min-w-0 flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">Report actions</legend>
              <Button
                aria-label="Choose report columns"
                title="Choose report columns"
                variant="outline"
                size="icon"
                onClick={() => setColumnDialogOpen(true)}
              >
                <Columns3 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                aria-label="Preview report"
                title="Preview report"
                variant="outline"
                size="icon"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Export report"
                    title="Export report"
                    variant="outline"
                    size="icon"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Download report</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => exportReport('csv')}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportReport('xlsx')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                    XLSX
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportReport('xls')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                    XLS
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportReport('pdf')}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </fieldset>
          </div>
          {kind === 'survey-results' ? (
            <div className="space-y-4">
              <CardTitle className="sr-only">{reportTitles[kind]}</CardTitle>
              <SurveyFilters
                dates={surveyResponseDates}
                forms={visibleSurveyForms}
                locations={surveyLocations}
                onDateChange={(responseDate) =>
                  setSurveySelection((current) => ({ ...current, responseDate }))
                }
                onFormChange={selectSurveyForm}
                onGenerate={() =>
                  toast.error(
                    'Survey report generation is unavailable until a server-backed aggregate endpoint is available.',
                  )
                }
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
            </div>
          ) : (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <CardTitle>{reportTitles[kind]}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Saved report history is unavailable in the current API.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[220px_220px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="report-search">Search reports</Label>
                  <span className="relative block">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      className="pl-9"
                      id="report-search"
                      placeholder="Type here"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-project-filter">Project</Label>
                  <Select value={effectiveProjectId} onValueChange={setProjectId}>
                    <SelectTrigger id="report-project-filter">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {scopedProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {kind === 'indicator-summary' ? (
                  <Button onClick={generateIndicatorReport}>
                    <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                    Generate
                  </Button>
                ) : null}
              </div>
            </div>
          )}
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
              <div className="rounded-sm border border-dashed border-border bg-surface-subtle p-6 text-center">
                <p className="font-medium text-foreground">No aggregate survey results found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose another Survey/Form, location, or response date. No individual response
                  records are loaded for this report.
                </p>
              </div>
            )
          ) : null}
          {kind === 'beneficiary-summary' && beneficiaryLoadState === 'loading' ? (
            <AsyncState
              description="Loading the Beneficiary records available to this report."
              icon={FileText}
              status="loading"
              title="Loading Beneficiary report records"
            />
          ) : null}
          {kind === 'beneficiary-summary' && beneficiaryLoadState === 'error' ? (
            <AsyncState
              description="Beneficiary report records require server-side PIN verification and are unavailable in this workspace."
              icon={FileText}
              status="error"
              title="Beneficiary report records unavailable"
            />
          ) : null}
          {kind === 'beneficiary-summary' && beneficiaryLoadState === 'ready' ? (
            <StatusMessage>Beneficiary report records loaded.</StatusMessage>
          ) : null}
          {kind !== 'beneficiary-summary' || beneficiaryLoadState === 'ready' ? (
            <>
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
                        {kind === 'indicator-summary'
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
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select columns</DialogTitle>
            <DialogDescription>
              Choose the columns shown in this saved report view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {reportColumns[kind].map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-3 rounded-sm border border-border bg-surface-subtle p-3 text-sm"
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
              The preview uses the selected columns and current API data. Saving report history and
              exporting files are unavailable.
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
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={finishReportPreview}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save report snapshot
            </Button>
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
  <div className="w-full space-y-4">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>

    <div className="flex justify-end">
      <Button className="w-full sm:w-auto" onClick={onGenerate} size="sm">
        <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
        Generate aggregate report
      </Button>
    </div>
  </div>
)

const FilterField = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    {children}
  </div>
)
