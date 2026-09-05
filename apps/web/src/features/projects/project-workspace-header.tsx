'use client'

import { CalendarDays, Target, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import type { PrototypeLabels } from '@/constants/prototype-labels'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { type WorkspaceTabAccess, filterWorkspaceTabs } from '@/lib/rbac/route-access'
import type { ProjectDetail } from '@/types/pathways'

import { formatNumber, projectHealthTone, projectStatusTone } from './project-utils'

const createWorkspaceTabs = (labels: PrototypeLabels): WorkspaceTabAccess[] => [
  { label: 'Overview', path: '' },
  { label: labels.projectActivities, path: 'activities', permission: 'activities.view' },
  { label: labels.projectEvidence, path: 'evidence', permission: 'evidence.review' },
  { label: labels.projectIndicators, path: 'indicators', permission: 'indicators.manage' },
  {
    label: labels.projectMonitorEvaluate,
    path: 'monitor-evaluate',
    permission: 'monitor_evaluate.view',
  },
  {
    label: labels.projectBudget,
    path: 'budget',
    anyPermissions: [
      'budget.expense.log',
      'budget.expense.view',
      'budget.full',
      'budget.portfolio_view',
    ],
  },
  {
    label: labels.projectJourneyStages,
    path: 'journey-stages',
    anyPermissions: ['activities.create_edit', 'monitor_evaluate.full'],
  },
  {
    label: labels.projectPublicDashboard,
    path: 'transparency',
    anyPermissions: ['transparency.preview', 'transparency.publish'],
  },
]

export const ProjectWorkspaceHeader = ({ project }: { project: ProjectDetail }) => {
  const pathname = usePathname()
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const visibleTabs = filterWorkspaceTabs(createWorkspaceTabs(labels), role)
  const beneficiaryProgress =
    project.targetBeneficiaries > 0
      ? Math.round((project.beneficiariesReached / project.targetBeneficiaries) * 100)
      : 0

  return (
    <section
      aria-label={`${project.title} workspace summary`}
      className="min-w-0 max-w-full overflow-x-hidden rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
            <StatusBadge tone={projectHealthTone(project.health)}>{project.health}</StatusBadge>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {project.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {project.description}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:min-w-[520px]">
          <div className="col-span-2 rounded-sm border border-border bg-surface-subtle p-3 sm:col-span-1">
            <CalendarDays className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Project period</p>
            <p className="mt-1 font-medium text-foreground">{project.period}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface-subtle p-3">
            <UsersRound className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Target beneficiaries</p>
            <p className="mt-1 font-medium text-foreground">
              {formatNumber(project.targetBeneficiaries)}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-surface-subtle p-3">
            <Target className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">Overall progress</p>
            <p className="mt-1 font-medium text-foreground">{project.timelineProgress}%</p>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar label="Beneficiary reach" tone="success" value={beneficiaryProgress} />
      </div>
      <nav
        className="mt-5 flex w-full max-w-full gap-2 overflow-x-auto pb-1"
        aria-label={labels.projectWorkspace}
      >
        {visibleTabs.map((tab) => {
          const href = tab.path ? `/projects/${project.id}/${tab.path}` : `/projects/${project.id}`
          const active = tab.path
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === href

          return (
            <Button
              key={tab.path}
              asChild
              className="shrink-0"
              size="sm"
              variant={active ? 'default' : 'outline'}
            >
              <Link aria-current={active ? 'page' : undefined} href={href}>
                {tab.label}
              </Link>
            </Button>
          )
        })}
      </nav>
    </section>
  )
}
