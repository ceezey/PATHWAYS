'use client'

import { ArrowLeft, CalendarDays, FolderKanban, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, ProgressBar, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectDetail } from '@/types/pathways'

import {
  formatNumber,
  projectHealthSignal,
  projectHealthTone,
  projectStatusTone,
} from './project-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
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
      .catch(() => {
        if (!mounted) {
          return
        }

        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [projectId])

  if (status === 'loading') {
    return (
      <EmptyState
        description="Loading the project preview workspace."
        icon={FolderKanban}
        title="Loading project"
      />
    )
  }

  if (status === 'error' || !project) {
    return (
      <>
        <PageHeader
          eyebrow="Projects"
          title="Project not found"
          description="This project could not be loaded from the Projects backend."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
        <EmptyState
          description="Return to the project directory or try again after the backend is connected."
          icon={FolderKanban}
          title="No project record"
        />
      </>
    )
  }

  return (
    <>
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
            {role && can(role, 'activities.view') ? (
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
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">KPI achievement</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {project.kpiAchievement}%
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Beneficiaries reached</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(project.beneficiariesReached)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Budget utilization</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
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
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
              {projectHealthSignal(project)}
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Project team"
          description="Staff assignments associated with this project."
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
            Journey Tracking stages, and public transparency are available according to the
            authenticated role.
          </p>
        </SectionCard>
      </section>
    </>
  )
}
