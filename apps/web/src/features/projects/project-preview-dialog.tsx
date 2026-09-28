'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose } from '@/components/ui/dialog'
import type { ProjectDetail } from '@/types/pathways'

import { ProjectOverviewMetrics } from './project-overview-metrics'
import { projectStatusTone } from './project-utils'

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
            <StatusBadge tone="neutral">Not assessed</StatusBadge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Region</dt>
              <dd className="mt-1 font-medium text-foreground">{project.area}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Project period</dt>
              <dd className="mt-1 font-medium text-foreground">{project.period}</dd>
            </div>
          </dl>
          <ProjectOverviewMetrics
            compact
            projectId={project.id}
            targetBeneficiaries={project.targetBeneficiaries}
          />
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Health Signal Basis</p>
            <p className="mt-1">Project health cannot be assessed from the current API response.</p>
          </div>
          <dl className="text-sm">
            <dt className="text-muted-foreground">Project Manager</dt>
            <dd className="mt-1 font-medium text-foreground">{project.projectManager}</dd>
          </dl>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
            <Button asChild className="gap-2">
              <Link href={`/projects/${project.id}`}>
                Open Project
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </DialogShell>
    ) : null}
  </Dialog>
)
