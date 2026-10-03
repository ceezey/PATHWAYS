'use client'

import { ArrowRight, Eye, FolderKanban, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  AvatarStack,
  EmptyState,
  FilterBar,
  FilterChoiceGroup,
  ProgressBar,
  ResultsAnnouncement,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { ProjectStatus, ProjectSummary } from '@/types/pathways'
import { type MetricCell, businessCalendarDate, timelineProgress } from '@pathways/shared'

import { ProjectPreviewDialog } from './project-preview-dialog'
import {
  type ProjectStatusFilter,
  overviewMetricLabel,
  projectHealthTone,
  projectStatusFilters,
  projectStatusTone,
} from './project-utils'
import { useProjectRead } from './use-project-reads'

const directoryDescription = {
  'Program Manager': 'Projects across the assigned portfolio.',
  'Grant Manager': 'High-level grant and project portfolio summaries.',
  'Project Manager': 'Assigned projects and project setup entry point.',
  'Monitoring and Evaluation Officer': 'Projects assigned for monitoring and evaluation review.',
  'Project Officer': 'Projects with assigned field activities and implementation tasks.',
  'System Administrator': 'All projects available for administration.',
} as const

export const ProjectDirectory = () => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadDetail = principalHasAtomicPermission(profile, 'projects.detail.read')
  const directory = useAuthorizedRead(
    'projects',
    null,
    'projects.read',
    (signal) => pathwaysClient.getProjects(signal),
    true,
    { freshness: 'summary' },
  )
  const projects: ProjectSummary[] = directory.data ?? []
  const status =
    !directory.eligible || directory.isPending ? 'loading' : directory.isError ? 'error' : 'success'
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('All')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = useProjectRead(previewId ?? '', Boolean(previewId && canReadDetail))
  const previewProject = previewId && preview.data?.id === previewId ? preview.data : null
  const businessDate = businessCalendarDate(new Date(), 'Asia/Manila')
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return projects.filter((project) => {
      const matchesQuery = normalizedQuery
        ? [project.title, project.area, project.sector, project.projectManager]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true
      const matchesStatus =
        statusFilter === 'All' ? true : project.status === (statusFilter as ProjectStatus)

      return matchesQuery && matchesStatus
    })
  }, [projects, query, statusFilter])

  return (
    <>
      <PageHeader
        editableLabelKey="moduleProjects"
        title={labels.moduleProjects}
        description={role ? directoryDescription[role] : 'Loading your authorized projects.'}
        actions={
          principalHasAtomicPermission(profile, 'projects.create') ? (
            <Button asChild className="gap-2">
              <Link href="/projects/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New Project
              </Link>
            </Button>
          ) : null
        }
      />
      <FilterBar>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search projects"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project, area, sector, or manager"
            value={query}
          />
        </div>
        <FilterChoiceGroup
          className="grid w-full grid-cols-2 md:flex md:w-auto"
          label="Project status filter"
          onValueChange={(value) => setStatusFilter(value as ProjectStatusFilter)}
          options={projectStatusFilters}
          value={statusFilter}
        />
      </FilterBar>
      {status === 'success' ? (
        <ResultsAnnouncement
          message={
            filteredProjects.length === 0
              ? 'No projects match the current search and status filter.'
              : `${filteredProjects.length} ${filteredProjects.length === 1 ? 'project matches' : 'projects match'} the current search and status filter.`
          }
          settleKey={`${query}|${statusFilter}`}
        />
      ) : null}
      {status === 'loading' ? (
        <AsyncState
          description="Loading available project records."
          icon={FolderKanban}
          status="loading"
          title="Loading projects"
        />
      ) : null}
      {status === 'error' ? (
        <AsyncState
          description="The project directory could not be loaded. Check your connection and try again."
          icon={FolderKanban}
          onRetry={() => void directory.refetch()}
          status="error"
          title="Project data unavailable"
        />
      ) : null}
      {status === 'success' && filteredProjects.length === 0 ? (
        <EmptyState
          description="Try another search term or status filter."
          icon={FolderKanban}
          title="No projects match the current filters"
        />
      ) : null}
      {status === 'success' && filteredProjects.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <Card
              className={cn('flex min-w-0 flex-col overflow-hidden')}
              data-testid={`project-card-${project.id}`}
              key={project.id}
            >
              <CardHeader className="space-y-4 p-6 pb-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {project.sector}
                  </p>
                  <h2 className="font-heading text-xl font-normal leading-7 text-navy">
                    {project.title}
                  </h2>
                  <p className="text-base text-muted-foreground">{project.area}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={projectStatusTone(project.status)}>
                      {project.status}
                    </StatusBadge>
                    <StatusBadge tone={projectHealthTone(project.health)}>
                      {project.health}
                    </StatusBadge>
                  </div>
                  <p className="text-sm tabular-nums text-muted-foreground">{project.period}</p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col px-6 pb-6 pt-0">
                <div className="flex flex-1 flex-col gap-3 border-t border-border pt-5">
                  <p className="line-clamp-4 flex-1 text-base leading-6 text-foreground">
                    {project.description || 'No project description recorded.'}
                  </p>
                  <ProjectTimeline
                    timeline={timelineProgress(
                      project.startDate ?? null,
                      project.endDate ?? null,
                      businessDate,
                    )}
                  />
                </div>
              </CardContent>
              <CardFooter className="mt-auto flex flex-col items-stretch gap-4 border-t border-border bg-card p-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <AvatarStack
                  members={
                    project.team?.length
                      ? project.team
                      : [{ userId: project.id, fullName: project.projectManager }]
                  }
                />
                {canReadDetail ? (
                  <div className="grid w-full grid-cols-2 gap-2 2xl:flex 2xl:w-auto 2xl:justify-end">
                    <Button
                      className="gap-2 px-3"
                      onClick={() => setPreviewId(project.id)}
                      type="button"
                      variant="outline"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      Quick Preview
                    </Button>
                    <Button asChild className="gap-2 px-3">
                      <Link href={`/projects/${project.id}`}>
                        Open Project
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
      <ProjectPreviewDialog
        failed={preview.isError}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null)
        }}
        onRetry={() => void preview.refetch()}
        open={Boolean(previewId)}
        project={previewProject}
      />
    </>
  )
}

/** Same deterministic date-derived timeline as the Overview endpoint. */
const ProjectTimeline = ({ timeline }: { timeline: MetricCell }) => (
  <div className="grid grid-cols-[auto_minmax(5rem,1fr)_auto] items-center gap-3 text-sm">
    <span className="text-muted-foreground">Timeline</span>
    {timeline.value !== null ? (
      <ProgressBar tone="info" value={Number(timeline.value)} />
    ) : (
      <span className="text-muted-foreground">{overviewMetricLabel(timeline, 'percent')}</span>
    )}
    <span className="font-semibold tabular-nums text-foreground">
      {timeline.value !== null ? `${timeline.value}%` : '—'}
    </span>
  </div>
)
