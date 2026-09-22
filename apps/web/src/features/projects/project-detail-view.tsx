'use client'

import { Archive, ArrowLeft, CalendarDays, FolderKanban, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, SectionCard, StatusBadge, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type { ProjectDetail } from '@/types/pathways'

import { ProjectTeamEditorDialog } from './project-team-editor-dialog'
import {
  formatNumber,
  projectHealthSignal,
  projectHealthTone,
  projectStatusTone,
} from './project-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const { role } = useCurrentRole()
  const canManageProjectTeam = isUiActionAvailable(role, 'projects.team.manage')
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'not-found' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let mounted = true
    setStatus('loading')

    pathwaysClient
      .getProject(projectId)
      .then((record) => {
        if (!mounted) {
          return
        }

        setProject(record)
        setStatus('success')
      })
      .catch((error) => {
        if (!mounted) {
          return
        }

        setStatus(
          error instanceof PathwaysClientError && error.code === 'not_found'
            ? 'not-found'
            : 'error',
        )
      })

    return () => {
      mounted = false
    }
  }, [loadAttempt, projectId])

  if (status === 'loading') {
    return (
      <AsyncState
        description="Loading the project preview workspace."
        icon={FolderKanban}
        status="loading"
        title="Loading project"
      />
    )
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader
          eyebrow="Projects"
          title="Project unavailable"
          description="The project could not be loaded from the current service."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="Check your connection and try loading this project again."
          icon={FolderKanban}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          status="error"
          title="Project data unavailable"
        />
      </>
    )
  }

  if (status === 'not-found' || !project) {
    return (
      <>
        <PageHeader
          title="Project not found"
          description="This project is not available to the current account."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="Return to the project directory and choose an available project."
          icon={FolderKanban}
          status="empty"
          title="No project record"
        />
      </>
    )
  }

  return (
    <>
      <StatusMessage>Project loaded.</StatusMessage>
      <PageHeader
        title="Project overview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="gap-2" variant="outline">
              <Link href="/projects">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Projects
              </Link>
            </Button>
            {role ? (
              <>
                {
                  <Button
                    disabled
                    size="icon"
                    variant="outline"
                    aria-label="Edit project profile"
                    title="Project editing unavailable"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                }
                <Button
                  disabled
                  aria-label="Archive project"
                  size="icon"
                  title="Archive project unavailable"
                  type="button"
                  variant="outline"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <ProjectWorkspaceHeader project={project} />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Project preview"
          description={`${project.area} - ${project.sector} - ${project.period}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
              <StatusBadge
                tone={project.metricsAvailable ? projectHealthTone(project.health) : 'neutral'}
              >
                {project.metricsAvailable ? project.health : 'Not assessed'}
              </StatusBadge>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
              <div className="bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">KPI achievement</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.metricsAvailable ? `${project.kpiAchievement}%` : 'Unavailable'}
                </p>
              </div>
              <div className="bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Budget utilization</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.metricsAvailable ? `${project.budgetUtilization}%` : 'Unavailable'}
                </p>
              </div>
              <div className="bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Beneficiaries reached / target</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.metricsAvailable
                    ? `${formatNumber(project.beneficiariesReached)} / ${formatNumber(project.targetBeneficiaries)}`
                    : 'Unavailable'}
                </p>
              </div>
              <div className="bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Timeline</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.metricsAvailable ? `${project.timelineProgress}%` : 'Unavailable'}
                </p>
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface-subtle p-4 text-sm leading-6 text-muted-foreground">
              {project.metricsAvailable
                ? projectHealthSignal(project)
                : 'Project health cannot be assessed from the current API response.'}
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Project team"
          description="Assigned project team members."
          actions={canManageProjectTeam ? <ProjectTeamEditorDialog project={project} /> : null}
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Program Manager</dt>
              <dd className="mt-1 font-medium text-foreground">{project.programManager}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Project Manager</dt>
              <dd className="mt-1 font-medium text-foreground">{project.projectManager}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Monitoring and Evaluation Officer</dt>
              <dd className="mt-1 font-medium text-foreground">{project.monitoringOfficer}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Project Officers</dt>
              <dd className="mt-1 font-medium text-foreground">
                {project.projectOfficers.join(', ')}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </section>
      <section>
        <SectionCard title="Schedule" description="Project implementation window.">
          <div className="flex items-start gap-3 text-sm">
            <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">{project.period}</p>
              <p className="mt-1 text-muted-foreground">Budget code: {project.budgetCode}</p>
            </div>
          </div>
        </SectionCard>
      </section>
    </>
  )
}
