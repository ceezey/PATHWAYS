'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose } from '@/components/ui/dialog'
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
          <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
            <PreviewMeasure label="KPI achievement" value={`${project.kpiAchievement}%`} />
            <PreviewMeasure label="Budget utilization" value={`${project.budgetUtilization}%`} />
            <PreviewMeasure
              label="Beneficiaries"
              value={`${formatNumber(project.beneficiariesReached)} / ${formatNumber(project.targetBeneficiaries)}`}
            />
            <PreviewMeasure label="Timeline" value={`${project.timelineProgress}%`} />
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Health Signal Basis</p>
            <p className="mt-1">{projectHealthSignal(project)}</p>
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

const PreviewMeasure = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-background p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
  </div>
)
