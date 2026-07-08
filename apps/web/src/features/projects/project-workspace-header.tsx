'use client'

import { CalendarDays, Target, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { type WorkspaceTabAccess, filterWorkspaceTabs } from '@/lib/rbac/route-access'
import type { ProjectDetail } from '@/types/pathways'

import { formatNumber, projectHealthTone, projectStatusTone } from './project-utils'

const workspaceTabs: WorkspaceTabAccess[] = [
  { label: 'Activities', path: 'activities', permission: 'activities.view' },
  { label: 'Evidence & Reports', path: 'evidence', permission: 'evidence.review' },
  { label: 'Target Indicators', path: 'indicators', permission: 'indicators.manage' },
  { label: 'Monitor & Evaluate', path: 'monitor-evaluate', permission: 'monitor_evaluate.view' },
  {
    label: 'Budget',
    path: 'budget',
    anyPermissions: [
      'budget.expense.log',
      'budget.expense.view',
      'budget.full',
      'budget.portfolio_view',
    ],
  },
  {
    label: 'Journey Stages',
    path: 'journey-stages',
    anyPermissions: ['activities.create_edit', 'monitor_evaluate.full'],
  },
  { label: 'Transparency', path: 'transparency', permission: 'transparency.publish' },
]

export const ProjectWorkspaceHeader = ({ project }: { project: ProjectDetail }) => {
  const pathname = usePathname()
  const { role } = usePrototypeRole()
  const visibleTabs = filterWorkspaceTabs(workspaceTabs, role)
  const activitiesHref = `/projects/${project.id}/activities`
  const beneficiaryProgress =
    project.targetBeneficiaries > 0
      ? Math.round((project.beneficiariesReached / project.targetBeneficiaries) * 100)
      : 0

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
            <StatusBadge tone={projectHealthTone(project.health)}>{project.health}</StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {project.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {project.description}
            </p>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3 lg:min-w-[520px]">
          <div className="rounded-lg border border-border bg-background p-3">
            <CalendarDays className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Project period</p>
            <p className="mt-1 font-medium text-foreground">{project.period}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <UsersRound className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Target beneficiaries</p>
            <p className="mt-1 font-medium text-foreground">
              {formatNumber(project.targetBeneficiaries)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <Target className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Overall progress</p>
            <p className="mt-1 font-medium text-foreground">{project.timelineProgress}%</p>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar label="Beneficiary reach" tone="success" value={beneficiaryProgress} />
      </div>
      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Project workspace">
        {visibleTabs.map((tab) => {
          const href = `/projects/${project.id}/${tab.path}`
          const active =
            pathname === href || (pathname === `/projects/${project.id}` && href === activitiesHref)

          return (
            <Button
              key={tab.path}
              asChild
              className="shrink-0"
              size="sm"
              variant={active ? 'default' : 'outline'}
            >
              <Link href={href}>{tab.label}</Link>
            </Button>
          )
        })}
      </nav>
    </section>
  )
}
