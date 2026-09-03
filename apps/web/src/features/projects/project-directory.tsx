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
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
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
  'Program Manager': 'Portfolio projects across the prototype workspace.',
  'Grant Manager': 'High-level grant and project portfolio summaries.',
  'Project Manager': 'Assigned projects and project setup entry point.',
  'Monitoring and Evaluation Officer': 'Projects assigned for monitoring and evaluation review.',
  'Project Officer': 'Projects with assigned field activities and implementation tasks.',
  'System Administrator': 'All prototype projects for setup and configuration review.',
} as const

export const ProjectDirectory = () => {
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
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
      .getProjectsForRole(role)
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
  }, [loadAttempt, role])

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
        eyebrow={labels.projectWorkspace}
        title={labels.moduleProjects}
        description={directoryDescription[role]}
        actions={
          can(role, 'projects.create') ? (
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
          description="Loading role-specific project records from the mock service."
          icon={FolderKanban}
          status="loading"
          title="Loading projects"
        />
      ) : null}
      {status === 'error' ? (
        <AsyncState
          description="The project directory could not load prototype records. Check your connection and try again."
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
            <SectionCard
              key={project.id}
              title={project.title}
              description={`${project.area} - ${project.sector}`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={projectStatusTone(project.status)}>
                    {project.status}
                  </StatusBadge>
                  <StatusBadge tone={projectHealthTone(project.health)}>
                    {project.health}
                  </StatusBadge>
                </div>
              }
            >
              <div className="space-y-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Project Manager</dt>
                    <dd className="mt-1 font-medium text-foreground">{project.projectManager}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Beneficiaries reached</dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {formatNumber(project.beneficiariesReached)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Period</dt>
                    <dd className="mt-1 font-medium text-foreground">{project.period}</dd>
                  </div>
                </dl>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProgressBar
                    label="KPI achievement"
                    tone="success"
                    value={project.kpiAchievement}
                  />
                  <ProgressBar
                    label="Budget utilization"
                    tone={project.budgetUtilization > 80 ? 'warning' : 'info'}
                    value={project.budgetUtilization}
                  />
                  <ProgressBar label="Timeline progress" value={project.timelineProgress} />
                  <ProgressBar
                    label="Beneficiary reach"
                    tone="success"
                    value={Math.min(100, Math.round(project.beneficiariesReached / 10))}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => void openPreview(project.id)}
                    type="button"
                    variant="outline"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Quick Preview
                  </Button>
                  <Button asChild className="gap-2">
                    <Link
                      href={
                        can(role, 'activities.view')
                          ? `/projects/${project.id}/activities`
                          : `/projects/${project.id}`
                      }
                    >
                      {can(role, 'activities.view') ? 'Open Workspace' : 'View Project Summary'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </SectionCard>
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
