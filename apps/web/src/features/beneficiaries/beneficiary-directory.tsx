'use client'

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
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
import { getAccessProfile } from '@/lib/rbac/can'
import type {
  Activity,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import {
  deriveCurrentStage,
  enrollmentTone,
  formatDate,
  matchesBeneficiarySearch,
  progressionRate,
  projectTitle,
} from './beneficiary-utils'

const allValue = 'all'

type BeneficiaryDirectoryProps = {
  beneficiaries: BeneficiaryRecord[]
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
}

export const BeneficiaryDirectory = ({
  beneficiaries,
  projects,
  activities,
  stages,
}: BeneficiaryDirectoryProps) => {
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const projectAccess = role ? getAccessProfile(role).projectAccess : 'assigned-projects'
  const projectAccessLabel =
    projectAccess === 'assigned-projects'
      ? 'Assigned projects'
      : projectAccess === 'organization'
        ? 'All projects'
        : 'Portfolio view'
  const scopedProjects = projects
  const scopedBeneficiaries = beneficiaries
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState(allValue)
  const [location, setLocation] = useState(allValue)
  const [sex, setSex] = useState(allValue)
  const [ageGroup, setAgeGroup] = useState(allValue)
  const [disabilityStatus, setDisabilityStatus] = useState(allValue)
  const [enrollmentStatus, setEnrollmentStatus] = useState(allValue)

  const locations = useMemo(
    () =>
      Array.from(new Set(scopedBeneficiaries.map((beneficiary) => beneficiary.location))).sort(),
    [scopedBeneficiaries],
  )

  const filteredBeneficiaries = useMemo(
    () =>
      scopedBeneficiaries.filter((beneficiary) => {
        const matchesSearch = matchesBeneficiarySearch(beneficiary, search)
        const matchesProject =
          projectId === allValue ? true : beneficiary.projectIds.includes(projectId)
        const matchesLocation = location === allValue ? true : beneficiary.location === location
        const matchesSex = sex === allValue ? true : beneficiary.sex === sex
        const matchesAgeGroup = ageGroup === allValue ? true : beneficiary.ageGroup === ageGroup
        const matchesDisability =
          disabilityStatus === allValue ? true : beneficiary.disabilityStatus === disabilityStatus
        const matchesEnrollment =
          enrollmentStatus === allValue ? true : beneficiary.enrollmentStatus === enrollmentStatus

        return (
          matchesSearch &&
          matchesProject &&
          matchesLocation &&
          matchesSex &&
          matchesAgeGroup &&
          matchesDisability &&
          matchesEnrollment
        )
      }),
    [
      ageGroup,
      disabilityStatus,
      enrollmentStatus,
      location,
      projectId,
      scopedBeneficiaries,
      search,
      sex,
    ],
  )

  const columns = useMemo<ColumnDef<BeneficiaryRecord>[]>(
    () => [
      {
        header: 'Beneficiary',
        accessorKey: 'displayName',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={`/beneficiaries/${row.original.id}`}
            >
              {row.original.displayName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {row.original.code} · {row.original.location}
            </p>
          </div>
        ),
      },
      {
        header: 'Enrolled project',
        cell: ({ row }) => (
          <div className="max-w-[240px] text-sm">
            {row.original.projectIds.map((id) => projectTitle(id, scopedProjects)).join(', ')}
          </div>
        ),
      },
      {
        header: 'Current stage',
        cell: ({ row }) => {
          const projectStages = stages.filter((stage) =>
            row.original.projectIds.includes(stage.projectId),
          )
          const projectActivities = activities.filter((activity) =>
            row.original.projectIds.includes(activity.projectId),
          )
          const currentStage = deriveCurrentStage(
            row.original.participation,
            projectStages,
            projectActivities,
          )
          const progress = progressionRate(
            row.original.participation,
            projectStages,
            projectActivities,
          )

          return (
            <div className="min-w-[180px] space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{currentStage?.code ?? 'No stage'}</span>
                <span className="text-muted-foreground">{currentStage?.name ?? 'Unmapped'}</span>
              </div>
              <ProgressBar value={progress} tone={progress >= 60 ? 'success' : 'info'} />
            </div>
          )
        },
      },
      {
        header: 'Last activity',
        cell: ({ row }) => {
          const latest = [...row.original.participation].sort((first, second) =>
            second.participatedAt.localeCompare(first.participatedAt),
          )[0]
          const activity = activities.find((item) => item.id === latest?.activityId)

          return latest ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{activity?.title ?? latest.activityId}</p>
              <p className="text-xs text-muted-foreground">{formatDate(latest.participatedAt)}</p>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No participation yet</span>
          )
        },
      },
      {
        header: 'Status',
        accessorKey: 'enrollmentStatus',
        cell: ({ row }) => (
          <StatusBadge tone={enrollmentTone(row.original.enrollmentStatus)}>
            {row.original.enrollmentStatus}
          </StatusBadge>
        ),
      },
    ],
    [activities, scopedProjects, stages],
  )

  const table = useReactTable({
    data: filteredBeneficiaries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
  })

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <StatusBadge tone={projectAccess === 'assigned-projects' ? 'warning' : 'info'}>
            {projectAccessLabel}
          </StatusBadge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleBeneficiaries}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Find Beneficiary records by name or code, review journey progress, and open a record
              for journey and assessment details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/beneficiaries/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add beneficiary
            </Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="beneficiary-search">Search by name or code</Label>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="beneficiary-search"
                className="pl-9"
                aria-describedby="beneficiary-search-help"
                placeholder="Enter Beneficiary name or code"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
            <p className="text-xs leading-5 text-muted-foreground" id="beneficiary-search-help">
              Searches Beneficiary names and codes.
            </p>
          </div>
          <FilterSelect label="Project" value={projectId} onValueChange={setProjectId}>
            <SelectItem value={allValue}>All projects</SelectItem>
            {scopedProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Location" value={location} onValueChange={setLocation}>
            <SelectItem value={allValue}>All locations</SelectItem>
            {locations.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Sex" value={sex} onValueChange={setSex}>
            <SelectItem value={allValue}>All sex values</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
          </FilterSelect>
          <FilterSelect label="Age group" value={ageGroup} onValueChange={setAgeGroup}>
            <SelectItem value={allValue}>All age groups</SelectItem>
            <SelectItem value="10-14">10-14</SelectItem>
            <SelectItem value="15-17">15-17</SelectItem>
            <SelectItem value="18-24">18-24</SelectItem>
            <SelectItem value="25+">25+</SelectItem>
          </FilterSelect>
          <FilterSelect
            label="Disability status"
            value={disabilityStatus}
            onValueChange={setDisabilityStatus}
          >
            <SelectItem value={allValue}>All statuses</SelectItem>
            <SelectItem value="With disability">With disability</SelectItem>
            <SelectItem value="Without disability">Without disability</SelectItem>
            <SelectItem value="Not disclosed">Not disclosed</SelectItem>
          </FilterSelect>
          <FilterSelect
            label="Enrollment status"
            value={enrollmentStatus}
            onValueChange={setEnrollmentStatus}
          >
            <SelectItem value={allValue}>All enrollment statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Pending Review">Pending Review</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Exited">Exited</SelectItem>
          </FilterSelect>
        </div>

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
                  colSpan={columns.length}
                  className="h-28 text-center text-muted-foreground"
                >
                  {beneficiaries.length === 0
                    ? 'No beneficiary records were returned. The backend integration may not be configured, or no records are available to your role.'
                    : 'No beneficiary records match the current search and filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Showing {table.getRowModel().rows.length} of {filteredBeneficiaries.length} filtered
            beneficiary records.
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
      </section>
    </div>
  )
}

const FilterSelect = ({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  </div>
)
