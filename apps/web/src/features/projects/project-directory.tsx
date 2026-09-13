'use client'

import { ArrowRight, FolderKanban, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, FilterBar, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectStatus, ProjectSummary } from '@/types/pathways'
import { type ProjectStatusFilter, projectStatusFilters, projectStatusTone } from './project-utils'

const descriptions = {
  'Program Manager': 'Program and portfolio projects available to your account.',
  'Grant Manager': 'Authorized grant and project portfolio profiles.',
  'Project Manager': 'Assigned project profiles and project setup.',
  'Monitoring and Evaluation Officer': 'Projects assigned for monitoring and evaluation.',
  'Project Officer': 'Projects assigned for field implementation.',
  'System Administrator': 'Organization project profiles and setup.',
} as const

export function ProjectDirectory() {
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('All')

  useEffect(() => {
    let active = true
    if (!role) return
    setStatus('loading')
    pathwaysClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active) return
        setProjects(records)
        setStatus('success')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [role])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return projects.filter(
      (project) =>
        (!term ||
          [project.code, project.title, project.area, project.projectManager]
            .join(' ')
            .toLowerCase()
            .includes(term)) &&
        (statusFilter === 'All' || project.status === (statusFilter as ProjectStatus)),
    )
  }, [projects, query, statusFilter])

  return (
    <>
      <PageHeader
        eyebrow={labels.projectWorkspace}
        title={labels.moduleProjects}
        description={role ? descriptions[role] : 'A recognized staff role is required.'}
        actions={
          role && can(role, 'projects.create') ? (
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
        <label className="relative min-w-0 flex-1" htmlFor="project-search">
          <Search
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="project-search"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by code, title, area, or manager"
            value={query}
          />
        </label>
        <Tabs
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ProjectStatusFilter)}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 md:flex md:w-auto">
            {projectStatusFilters.map((filter) => (
              <TabsTrigger key={filter} value={filter}>
                {filter}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </FilterBar>
      {status === 'loading' ? (
        <EmptyState
          description="Checking your project scope."
          icon={FolderKanban}
          title="Loading projects"
        />
      ) : null}
      {status === 'error' ? (
        <EmptyState
          description="Project profiles could not be loaded from the current workspace."
          icon={FolderKanban}
          title="Project data unavailable"
        />
      ) : null}
      {status === 'success' && filtered.length === 0 ? (
        <EmptyState
          description={
            projects.length
              ? 'Try another search or status filter.'
              : 'No project profiles are available to your account.'
          }
          icon={FolderKanban}
          title="No projects found"
        />
      ) : null}
      {status === 'success' && filtered.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {filtered.map((project) => (
            <SectionCard
              key={project.id}
              title={project.title}
              description={[project.code, project.area].filter(Boolean).join(' · ')}
              actions={
                <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
              }
            >
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Project Manager</dt>
                  <dd className="mt-1 font-medium">{project.projectManager}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Period</dt>
                  <dd className="mt-1 font-medium">{project.period}</dd>
                </div>
              </dl>
              <div className="mt-5 flex justify-end">
                <Button asChild className="gap-2">
                  <Link href={`/projects/${project.id}`}>
                    View project profile
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ))}
        </section>
      ) : null}
    </>
  )
}
