'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { ProjectDetail } from '@/types/pathways'

import {
  formatNumber,
  projectHealthSignal,
  projectHealthTone,
  projectStatusTone,
} from './project-utils'

export const ProjectPreviewDialog = ({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {project ? (
      <DialogShell
        title={project.title}
        description={`${project.area} - ${project.period} - ${project.sector}`}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
            <StatusBadge tone={projectHealthTone(project.health)}>{project.health}</StatusBadge>
            {project.createdInPrototype ? (
              <StatusBadge tone="info">Prototype record</StatusBadge>
            ) : null}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Project Manager</dt>
              <dd className="mt-1 font-medium text-foreground">{project.projectManager}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Budget code</dt>
              <dd className="mt-1 font-medium text-foreground">{project.budgetCode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Beneficiaries reached</dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatNumber(project.beneficiariesReached)} /{' '}
                {formatNumber(project.targetBeneficiaries)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Team</dt>
              <dd className="mt-1 font-medium text-foreground">
                {project.programManager}; {project.monitoringOfficer}
              </dd>
            </div>
          </dl>
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
          <div className="flex justify-end">
            <Button asChild className="gap-2">
              <Link href={`/projects/${project.id}/activities`}>
                Open Workspace
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </DialogShell>
    ) : null}
  </Dialog>
)
