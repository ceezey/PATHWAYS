'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'

import { StatusBadge } from '@/components/pathways/status-badge'
import type { DisplayLabels } from '@/constants/display-labels'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { type WorkspaceTabAccess, filterWorkspaceTabs } from '@/lib/rbac/route-access'
import { cn } from '@/lib/utils'
import type { ProjectDetail } from '@/types/pathways'

import { projectHealthTone, projectStatusTone } from './project-utils'

const createWorkspaceTabs = (labels: DisplayLabels): WorkspaceTabAccess[] => [
  { label: 'Overview', path: '' },
  { label: labels.projectActivities, path: 'activities', permission: 'activities.view' },
  { label: labels.projectIndicators, path: 'indicators', permission: 'indicators.manage' },
  { label: labels.projectEvidence, path: 'evidence', permission: 'evidence.review' },
  {
    label: labels.projectMonitorEvaluate,
    path: 'monitor-evaluate',
    permission: 'monitor_evaluate.view',
  },
  {
    label: labels.projectBudget,
    path: 'budget',
    anyPermissions: ['budget.expense.view', 'budget.full', 'budget.portfolio_view'],
  },
  {
    label: labels.projectJourneyStages,
    path: 'journey-stages',
    anyPermissions: ['activities.create_edit', 'monitor_evaluate.full'],
  },
]

export const ProjectWorkspaceHeader = ({ project }: { project: ProjectDetail }) => {
  const pathname = usePathname()
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
  const visibleTabs = role ? filterWorkspaceTabs(createWorkspaceTabs(labels), role) : []
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([])

  return (
    <section
      aria-label={`${project.title} workspace summary`}
      className="min-w-0 max-w-full overflow-x-hidden rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
          <StatusBadge
            tone={project.metricsAvailable ? projectHealthTone(project.health) : 'neutral'}
          >
            {project.metricsAvailable ? project.health : 'Not assessed'}
          </StatusBadge>
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
      <nav
        className="mt-5 w-full max-w-full overflow-x-auto border-b border-border"
        aria-label="Project navigation"
      >
        <div className="flex min-w-max" role="tablist" aria-label="Project workspace sections">
          {visibleTabs.map((tab, index) => {
            const href = tab.path
              ? `/projects/${project.id}/${tab.path}`
              : `/projects/${project.id}`
            const active = tab.path
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === href

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                aria-selected={active}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
                href={href}
                key={tab.path}
                onKeyDown={(event) => {
                  const last = visibleTabs.length - 1
                  const nextIndex =
                    event.key === 'ArrowRight'
                      ? (index + 1) % visibleTabs.length
                      : event.key === 'ArrowLeft'
                        ? (index - 1 + visibleTabs.length) % visibleTabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? last
                            : -1
                  if (nextIndex < 0) return
                  event.preventDefault()
                  tabRefs.current[nextIndex]?.focus()
                }}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                role="tab"
                tabIndex={active ? 0 : -1}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </section>
  )
}
