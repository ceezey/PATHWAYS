'use client'

import { ArrowLeft, CalendarDays, FolderKanban, Pencil } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, SectionCard, StatusBadge, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { PathwaysClientError } from '@/lib/services/pathways-client'

import { ProjectArchiveDialog } from './project-archive-dialog'
import { ProjectOverviewMetrics } from './project-overview-metrics'
import { ProjectTeamEditorDialog } from './project-team-editor-dialog'
import { formatNumber, projectHealthTone, projectStatusTone } from './project-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'
import { useProjectRead } from './use-project-reads'

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const { role, profile, access } = useCurrentRole()
  const canManageProjectProfile = isUiActionAvailable(role, 'projects.profile.manage', profile)
  // Team changes are saved through PATCH /projects/:id, which also requires projects.update.
  const canManageProjectTeam =
    isUiActionAvailable(role, 'projects.team.manage', profile) && canManageProjectProfile
  const canArchiveProject = isUiActionAvailable(role, 'projects.archive', profile)
  // Shared with the Activities tab through the same stable query key.
  const read = useProjectRead(projectId)
  const project = read.data ?? null
  const status = read.isError
    ? read.error instanceof PathwaysClientError && read.error.code === 'not_found'
      ? 'not-found'
      : 'error'
    : project
      ? 'success'
      : !read.eligible && access === 'ready'
        ? 'not-found'
        : 'loading'

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
          onRetry={() => void read.refetch()}
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
            {/* Hidden, not disabled, when PATCH /projects/:id would be rejected. */}
            {role && canManageProjectProfile ? (
              <Button asChild size="icon" variant="outline">
                <Link aria-label="Edit project profile" href={`/projects/${project.id}/edit`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            {role && canArchiveProject ? (
              <ProjectArchiveDialog projectId={project.id} title={project.title} />
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
            <ProjectOverviewMetrics
              projectId={project.id}
              targetBeneficiaries={project.targetBeneficiaries}
            />
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Implementing partners</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {project.implementingPartnerRecords?.length
                    ? project.implementingPartnerRecords.map((partner) => partner.name).join(', ')
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target beneficiaries</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {project.targetBeneficiaries === undefined
                    ? 'Not recorded'
                    : formatNumber(project.targetBeneficiaries)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Planned project budget</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {project.projectBudget === null || project.projectBudget === undefined
                    ? 'Not recorded'
                    : new Intl.NumberFormat('en-US', {
                        currency: 'PHP',
                        maximumFractionDigits: 2,
                        style: 'currency',
                      }).format(Number(project.projectBudget))}
                </dd>
              </div>
            </dl>
          </div>
        </SectionCard>
        <SectionCard
          title="Project team"
          actions={
            canManageProjectTeam ? (
              <ProjectTeamEditorDialog
                onUpdated={(updated) => read.replaceData(() => updated)}
                project={project}
              />
            ) : null
          }
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
        <SectionCard title="Schedule">
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
