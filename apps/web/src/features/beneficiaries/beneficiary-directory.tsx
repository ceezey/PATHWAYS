'use client'

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, RotateCcw, Search } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { ProgressBar } from '@/components/pathways/progress-bar'
import { ResultsAnnouncement } from '@/components/pathways/results-announcement'
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
import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'
import { getAccessProfile } from '@/lib/rbac/can'
import { scopeBeneficiariesForRole, scopeProjectsForRole } from '@/lib/rbac/data-scope'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
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
const safeFilterValue = (value: string | null, allowed: string[]) =>
  value && allowed.includes(value) ? value : allValue

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
  const { role, profile, assignedProjectIds } = useCurrentRole()
  const searchParams = useSearchParams()
  const readParam = (name: string) => searchParams?.get(name) ?? null
  const projectAccess = role ? getAccessProfile(role).projectAccess : 'assigned-projects'
  const projectAccessLabel =
    projectAccess === 'assigned-projects'
      ? 'Assigned projects'
      : projectAccess === 'organization'
        ? 'All projects'
        : 'Portfolio view'
  const scopedProjects = useMemo(
    () => (role ? scopeProjectsForRole(projects, role, assignedProjectIds) : []),
    [projects, role, assignedProjectIds],
  )
  const scopedBeneficiaries = useMemo(
    () => (role ? scopeBeneficiariesForRole(beneficiaries, role, assignedProjectIds) : []),
    [beneficiaries, role, assignedProjectIds],
  )
  const [search, setSearch] = useState(readParam('q') ?? '')
  const [projectId, setProjectId] = useSafeProjectSelection(
    scopedProjects.map((project) => project.id),
    readParam('project') ?? undefined,
  )
  const [location, setLocation] = useState(readParam('location') ?? allValue)
  const [sex, setSex] = useState(() =>
    safeFilterValue(readParam('sex'), [
      'Female',
      'Male',
      'Other',
      'Prefer not to say',
      'Not specified',
    ]),
  )
  const [ageGroup, setAgeGroup] = useState(() =>
    safeFilterValue(readParam('age'), ['0-9', '10-14', '15-17', '18-24', '25+', 'Unknown']),
  )
  const [disabilityStatus, setDisabilityStatus] = useState(() =>
    safeFilterValue(readParam('disability'), [
      'With disability',
      'Without disability',
      'Not specified',
    ]),
  )
  const [enrollmentStatus, setEnrollmentStatus] = useState(() =>
    safeFilterValue(readParam('status'), ['Active', 'Pending Review', 'Completed', 'Exited']),
  )
  const filtersActive =
    search !== '' ||
    location !== allValue ||
    sex !== allValue ||
    ageGroup !== allValue ||
    disabilityStatus !== allValue ||
    enrollmentStatus !== allValue

  const locations = useMemo(
    () =>
      Array.from(new Set(scopedBeneficiaries.map((beneficiary) => beneficiary.location))).sort(),
    [scopedBeneficiaries],
  )

  useEffect(() => {
    if (location !== allValue && !locations.includes(location)) {
      setLocation(allValue)
    }
  }, [location, locations])

  const filteredBeneficiaries = useMemo(
    () =>
      scopedBeneficiaries.filter((beneficiary) => {
        const matchesSearch = matchesBeneficiarySearch(beneficiary, search)
        const matchesProject = beneficiary.projectIds.includes(projectId)
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
            <p className="font-semibold text-foreground">{row.original.displayName}</p>
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
  const requestedPageIndex = Math.max(0, Number(readParam('page') ?? 1) - 1)
  const safeInitialPageIndex = Math.min(
    requestedPageIndex,
    Math.max(0, Math.ceil(filteredBeneficiaries.length / 8) - 1),
  )

  const table = useReactTable({
    data: filteredBeneficiaries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: safeInitialPageIndex,
        pageSize: 8,
      },
    },
  })

  const beneficiaryHref = (beneficiaryId: string) => {
    const returning = new URLSearchParams()
    if (search) returning.set('q', search)
    if (projectId) returning.set('project', projectId)
    if (location !== allValue) returning.set('location', location)
    if (sex !== allValue) returning.set('sex', sex)
    if (ageGroup !== allValue) returning.set('age', ageGroup)
    if (disabilityStatus !== allValue) returning.set('disability', disabilityStatus)
    if (enrollmentStatus !== allValue) returning.set('status', enrollmentStatus)
    const page = table.getState().pagination.pageIndex + 1
    if (page > 1) returning.set('page', String(page))
    const directoryPath = returning.size ? `/beneficiaries?${returning}` : '/beneficiaries'

    return `/beneficiaries/${beneficiaryId}?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(directoryPath)}`
  }

  const clearAllFilters = () => {
    setSearch('')
    setLocation(allValue)
    setSex(allValue)
    setAgeGroup(allValue)
    setDisabilityStatus(allValue)
    setEnrollmentStatus(allValue)
    table.setPageIndex(0)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        editableLabelKey="moduleBeneficiaries"
        actions={
          <>
            {isUiActionAvailable(role, 'beneficiaries.merge', profile) ? (
              <Button asChild variant="outline">
                <Link href="/beneficiaries/duplicates">Review possible duplicates</Link>
              </Button>
            ) : null}
            {isUiActionAvailable(role, 'beneficiaries.create', profile) ? (
              <Button asChild size="icon" title="Add beneficiary">
                <Link aria-label="Add beneficiary" href="/beneficiaries/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </>
        }
        eyebrow={projectAccessLabel}
        title={labels.moduleBeneficiaries}
      />

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                placeholder="Enter Beneficiary name or code"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </div>
          <FilterSelect label="Project" value={projectId} onValueChange={setProjectId}>
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
            <SelectItem value="Other">Other</SelectItem>
            <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
            <SelectItem value="Not specified">Not specified</SelectItem>
          </FilterSelect>
          <FilterSelect label="Age group" value={ageGroup} onValueChange={setAgeGroup}>
            <SelectItem value={allValue}>All age groups</SelectItem>
            <SelectItem value="0-9">0-9</SelectItem>
            <SelectItem value="10-14">10-14</SelectItem>
            <SelectItem value="15-17">15-17</SelectItem>
            <SelectItem value="18-24">18-24</SelectItem>
            <SelectItem value="25+">25+</SelectItem>
            <SelectItem value="Unknown">Unknown</SelectItem>
          </FilterSelect>
          <FilterSelect
            label="Disability status"
            value={disabilityStatus}
            onValueChange={setDisabilityStatus}
          >
            <SelectItem value={allValue}>All statuses</SelectItem>
            <SelectItem value="With disability">With disability</SelectItem>
            <SelectItem value="Without disability">Without disability</SelectItem>
            <SelectItem value="Not specified">Not specified</SelectItem>
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

        <div className="flex justify-end border-t border-border pt-4">
          <Button
            disabled={!filtersActive}
            onClick={clearAllFilters}
            type="button"
            variant="outline"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Clear all filters
          </Button>
        </div>

        <ResultsAnnouncement
          message={
            filteredBeneficiaries.length === 0
              ? 'No Beneficiary records match the current search and filters.'
              : `${filteredBeneficiaries.length} Beneficiary ${filteredBeneficiaries.length === 1 ? 'record matches' : 'records match'} the current search and filters.`
          }
          settleKey={[
            search,
            projectId,
            location,
            sex,
            ageGroup,
            disabilityStatus,
            enrollmentStatus,
          ].join('|')}
        />

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
                <TableRow
                  className="relative cursor-pointer focus-within:bg-primary-subtle"
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <TableCell key={cell.id}>
                      {index === 0 ? (
                        <Link
                          aria-label={`Open ${row.original.displayName}`}
                          className="static after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          href={beneficiaryHref(row.original.id)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Link>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
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
                  No Beneficiary records match the current search and filters.
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
