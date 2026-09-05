'use client'

import { ArrowLeft, CalendarDays, FolderKanban, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  StatusMessage,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type { ProjectDetail } from '@/types/pathways'

import {
  formatNumber,
  projectHealthSignal,
  projectHealthTone,
  projectStatusTone,
} from './project-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
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
          eyebrow="Projects"
          title="Project not found"
          description="This project is not available in the current prototype session."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="Prototype projects created in another browser session may not be available here."
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
        eyebrow={labels.projectWorkspace}
        title={project.title}
        description={project.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild className="gap-2" variant="outline">
              <Link href="/projects">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Projects
              </Link>
            </Button>
            {can(role, 'activities.view') ? (
              <Button asChild>
                <Link href={`/projects/${project.id}/activities`}>Open Activities</Link>
              </Button>
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
              <StatusBadge tone={projectHealthTone(project.health)}>{project.health}</StatusBadge>
              {project.createdInPrototype ? (
                <StatusBadge tone="info">Prototype record</StatusBadge>
              ) : null}
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-sm border border-border bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">KPI achievement</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.kpiAchievement}%
                </p>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Beneficiaries reached</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {formatNumber(project.beneficiariesReached)}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Budget utilization</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {project.budgetUtilization}%
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProgressBar label="KPI achievement" tone="success" value={project.kpiAchievement} />
              <ProgressBar
                label="Budget utilization"
                tone={project.budgetUtilization > 80 ? 'warning' : 'info'}
                value={project.budgetUtilization}
              />
              <ProgressBar label="Timeline progress" value={project.timelineProgress} />
              <ProgressBar
                label="Beneficiary reach"
                tone="success"
                value={
                  project.targetBeneficiaries > 0
                    ? Math.round((project.beneficiariesReached / project.targetBeneficiaries) * 100)
                    : 0
                }
              />
            </div>
            <div className="rounded-sm border border-border bg-surface-subtle p-4 text-sm leading-6 text-muted-foreground">
              {projectHealthSignal(project)}
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Project team"
          description="Prototype role assignments for this project."
        >
          <dl className="space-y-4 text-sm">
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
      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Schedule" description="Project implementation window.">
          <div className="flex items-start gap-3 text-sm">
            <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">{project.period}</p>
              <p className="mt-1 text-muted-foreground">Budget code: {project.budgetCode}</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Beneficiary target" description="Current target and aggregate reach.">
          <div className="flex items-start gap-3 text-sm">
            <UsersRound className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                {formatNumber(project.beneficiariesReached)} reached
              </p>
              <p className="mt-1 text-muted-foreground">
                Target: {formatNumber(project.targetBeneficiaries)}
              </p>
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Workspace modules"
          description="Project workspace tabs are available now."
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Activities, evidence, target indicators, monitoring and evaluation, budget, Beneficiary
            Journey Tracking stages, and public transparency are available according to the selected
            role.
          </p>
        </SectionCard>
      </section>
    </>
  )
}
