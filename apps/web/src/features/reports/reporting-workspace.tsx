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
  Save,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import type {
  BeneficiaryRecord,
  ProjectDetail,
  ProjectIndicator,
  ReportColumnConfig,
  ReportKind,
  ReportRecord,
} from '@/types/pathways'

type ReportRow = Record<string, string | number>

type ReportingWorkspaceProps = {
  initialKind: ReportKind
  previewOnly?: boolean
  projects: ProjectDetail[]
  indicators: ProjectIndicator[]
  beneficiaries: BeneficiaryRecord[]
  reports: ReportRecord[]
}

const allValue = 'all'

const reportTabs: { kind: ReportKind; label: string; href: string }[] = [
  { kind: 'project-summary', label: 'Project Summary', href: '/reports/project-summary' },
  { kind: 'indicator-summary', label: 'Indicator Summary', href: '/reports/indicator-summary' },
  {
    kind: 'beneficiary-summary',
    label: 'Beneficiary Summary',
    href: '/reports/beneficiary-summary',
  },
]

const reportTitles: Record<ReportKind, string> = {
  'project-summary': 'Project Summary',
  'indicator-summary': 'Indicator Summary',
  'beneficiary-summary': 'Beneficiary Summary',
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
}

const defaultVisibleColumns = Object.fromEntries(
  Object.entries(reportColumns).map(([kind, columns]) => [
    kind,
    columns.filter((column) => column.enabledByDefault).map((column) => column.id),
  ]),
) as Record<ReportKind, string[]>

const formatDate = (value?: string) => {
  if (!value) {
    return 'Prototype date'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

const splitPeriod = (period: string) => {
  const [startDate, endDate] = period.split(' - ')
  return { startDate: startDate ?? 'Prototype start', endDate: endDate ?? 'Prototype end' }
}

const projectCode = (index: number) => String(index + 1).padStart(3, '0')

const progressLabel = (actual: number, target: number) => {
  const progress = target > 0 ? Math.round((actual / target) * 100) : 0
  return `${progress}% of target - sourced from mock dataset`
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
  beneficiaries,
  indicators,
  initialKind,
  previewOnly = false,
  projects,
  reports,
}: ReportingWorkspaceProps) => {
  const [kind, setKind] = useState<ReportKind>(initialKind)
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState(allValue)
  const [indicatorGenerated, setIndicatorGenerated] = useState(initialKind !== 'indicator-summary')
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(previewOnly)
  const [visibleColumns, setVisibleColumns] =
    useState<Record<ReportKind, string[]>>(defaultVisibleColumns)

  const selectedProject =
    projectId === allValue ? projects[0] : projects.find((project) => project.id === projectId)

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const projectTitle = (id: string) =>
      projects.find((project) => project.id === id)?.title ?? 'Unmapped project'

    const matchesQuery = (values: Array<string | number>) =>
      query ? values.join(' ').toLowerCase().includes(query) : true

    if (kind === 'project-summary') {
      return projects
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

      return indicators
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
        projectId === allValue ? true : beneficiary.projectIds.includes(projectId),
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
    indicatorGenerated,
    indicators,
    kind,
    projectId,
    projects,
    search,
    selectedProject,
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
    toast.success('Indicator report generated locally.', {
      description: 'This table uses mock project indicator data only.',
    })
  }

  const saveReport = () => {
    // TODO(BACKEND): Save generated-report history.
    toast.success('Saved Successfully', {
      description: 'Prototype save notification only; no backend report history was written.',
    })
  }

  const exportCsv = () => {
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
    link.download = `${kind}-prototype-report.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported from the browser.', {
      description: 'This is a client-side prototype export.',
    })
  }

  const openPrototypeExport = (format: 'PDF' | 'Excel') => {
    // TODO(REPORTING): Generate PDF and spreadsheet reports through the backend.
    setPreviewOpen(true)
    toast.info(`${format} export is a prototype action.`, {
      description: 'Preview opened; no backend file generation was requested.',
    })
  }

  const switchKind = (nextKind: ReportKind) => {
    setKind(nextKind)
    setSearch('')
    setProjectId(allValue)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-primary">Reporting</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Reporting workspace
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Build project, indicator, and beneficiary summary reports from safe mock data. PDF and
              spreadsheet generation are preview-only until backend reporting is connected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/reports/preview">
                <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                Preview route
              </Link>
            </Button>
            <Button onClick={saveReport}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save
            </Button>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap gap-2" aria-label="Report sections">
              {reportTabs.map((tab) => (
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
                  <DropdownMenuLabel>Prototype export</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openPrototypeExport('PDF')}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openPrototypeExport('Excel')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                    Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <CardTitle>{reportTitles[kind]}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {reports.length} saved prototype report records are available for reference.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  placeholder="Type here"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allValue}>All projects</SelectItem>
                  {projects.map((project) => (
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
                <Button variant="outline" onClick={() => toast.info('Filters applied locally.')}>
                  <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                  Filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
              Choose the columns shown in this saved prototype report view.
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
            <Button onClick={() => setColumnDialogOpen(false)}>Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>
              Preview uses currently selected columns and mock data. Backend report generation is
              deferred.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-border">
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
                  {rows.slice(0, 5).map((row) => (
                    <TableRow key={activeColumns.map((column) => row[column.id]).join('-')}>
                      {activeColumns.map((column) => (
                        <TableCell key={column.id}>{row[column.id]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={saveReport}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
