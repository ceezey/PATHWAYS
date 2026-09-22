'use client'

import { ArrowRight, Eye, FolderKanban, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
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
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import type { ProjectDetail, ProjectStatus, ProjectSummary } from '@/types/pathways'

import { ProjectPreviewDialog } from './project-preview-dialog'
import {
  type ProjectStatusFilter,
  formatNumber,
  projectHealthTone,
  projectStatusFilters,
  projectStatusTone,
} from './project-utils'

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
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('All')
  const [previewProject, setPreviewProject] = useState<ProjectDetail | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let mounted = true
    setStatus('loading')

    pathwaysClient
      .getProjects()
      .then((records) => {
        if (!mounted) {
          return
        }

        setProjects(records)
        setStatus('success')
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [loadAttempt])

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

  const openPreview = async (projectId: string) => {
    const project = await pathwaysClient.getProject(projectId)
    setPreviewProject(project)
  }

  return (
    <>
      <PageHeader
        editableLabelKey="moduleProjects"
        title={labels.moduleProjects}
        description={role ? directoryDescription[role] : 'Loading your authorized projects.'}
        actions={
          profile?.permissions.includes('projects.create') ? (
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
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
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
              className={cn(
                'flex min-w-0 flex-col overflow-hidden border-t-4 shadow-sm',
                project.health === 'On Track' && 'border-t-success',
                project.health === 'At Risk' && 'border-t-warning',
                project.health === 'Critical' && 'border-t-danger',
              )}
              data-testid={`project-card-${project.id}`}
              key={project.id}
            >
              <CardHeader className="space-y-4 p-6 pb-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {project.sector}
                  </p>
                  <h2 className="font-heading text-2xl font-normal leading-8 text-navy">
                    {project.title}
                  </h2>
                  <p className="text-base text-muted-foreground">{project.area}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={projectStatusTone(project.status)}>
                      {project.status}
                    </StatusBadge>
                    {project.metricsAvailable ? (
                      <StatusBadge tone={projectHealthTone(project.health)}>
                        {project.health}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Not assessed</StatusBadge>
                    )}
                  </div>
                  <p className="text-sm tabular-nums text-muted-foreground">{project.period}</p>
                </div>
              </CardHeader>
              <CardContent className="flex-1 px-6 pb-6 pt-0">
                <div className="space-y-3 border-t border-border pt-5">
                  <ProjectMeasure
                    label="KPI achievement"
                    tone={projectHealthTone(project.health)}
                    value={project.metricsAvailable ? `${project.kpiAchievement}%` : 'Unavailable'}
                  />
                  <ProjectMeasure
                    label="Beneficiaries"
                    value={
                      project.metricsAvailable && project.targetBeneficiaries !== undefined
                        ? `${formatNumber(project.beneficiariesReached)} / ${formatNumber(project.targetBeneficiaries)}`
                        : 'Unavailable'
                    }
                  />
                  <ProjectMeasure
                    label="Budget utilization"
                    tone={project.budgetUtilization >= 80 ? 'danger' : 'warning'}
                    value={
                      project.metricsAvailable ? `${project.budgetUtilization}%` : 'Unavailable'
                    }
                  />
                  <div className="grid grid-cols-[auto_minmax(5rem,1fr)_auto] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Timeline</span>
                    {project.metricsAvailable ? (
                      <ProgressBar
                        tone={projectHealthTone(project.health)}
                        value={project.timelineProgress}
                      />
                    ) : (
                      <span className="text-muted-foreground">Unavailable</span>
                    )}
                    <span className="font-semibold tabular-nums text-foreground">
                      {project.metricsAvailable ? `${project.timelineProgress}%` : '—'}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="mt-auto flex flex-col items-stretch gap-4 border-t border-border bg-primary-subtle/40 p-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">
                    {managerInitials(project.projectManager)}
                  </span>
                  <span className="truncate text-sm font-medium text-muted-foreground">
                    {project.projectManager}
                  </span>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 2xl:flex 2xl:w-auto 2xl:justify-end">
                  <Button
                    className="gap-2 px-3"
                    onClick={() => void openPreview(project.id)}
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
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
      <ProjectPreviewDialog
        onOpenChange={(open) => {
          if (!open) {
            setPreviewProject(null)
          }
        }}
        open={Boolean(previewProject)}
        project={previewProject}
      />
    </>
  )
}

const managerInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const ProjectMeasure = ({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning' | 'danger'
}) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span
      className={cn(
        'text-base font-semibold tabular-nums text-foreground',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'danger' && 'text-danger',
      )}
    >
      {value}
    </span>
  </div>
)
