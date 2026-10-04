import type { RoleOverview } from '@pathways/shared'
import Link from 'next/link'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { healthOf } from './health'
import type { ProjectMetrics } from './manager-overview'
import { AccentKpi, DashboardHeading, KpiStrip, ListCard } from './primitives'

const bar = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  neutral: 'bg-muted-foreground',
} as const
const dot = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-danger',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground',
} as const
const peso = (amount: string) =>
  `PHP ${Number(amount).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Program and Grant Manager portfolio; Grant Manager is read-only with no decision buttons. */
export const PortfolioOverview = ({
  data,
  fullName,
  metrics,
  readOnly,
}: {
  data: RoleOverview
  fullName?: string | null
  metrics: ProjectMetrics
  readOnly: boolean
}) => {
  const byProject = new Map(data.alerts?.byProject.map((row) => [row.projectId, row]))
  const rows = data.projects.map((project) => ({
    project,
    health: healthOf(project.status, byProject.get(project.id)),
  }))
  const named = (label: string) => rows.filter((row) => row.health.label === label)
  const programs = new Set(data.projects.map((p) => p.programName).filter(Boolean)).size
  const kpi = (
    label: 'Critical' | 'At risk' | 'On track',
    tone: 'danger' | 'warning' | 'success',
  ) => (
    <AccentKpi
      label={label}
      sub={
        named(label)
          .slice(0, 2)
          .map((row) => row.project.title)
          .join(' · ') || 'None'
      }
      tone={tone}
      value={String(named(label).length)}
    />
  )
  const budgetTiles = data.projects.flatMap((project) => {
    const budget = metrics[project.id]?.budget
    return budget
      ? [
          <div
            className="space-y-1 rounded-lg border border-border bg-surface-subtle p-3"
            key={project.id}
          >
            <div className="flex justify-between text-sm">
              <span className="font-medium">{project.title}</span>
              <span className="tabular-nums">{budget.percent}%</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{peso(budget.allocated)} allocated</span>
              <span>{peso(budget.used)} used</span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  budget.percent > 80 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${Math.min(100, budget.percent)}%` }}
              />
            </div>
          </div>,
        ]
      : []
  })
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        subtitle={`${plural(data.projects.length, 'project')} across ${plural(programs, 'program')}`}
        title="Portfolio overview"
      />
      <KpiStrip label="Portfolio counts">
        <AccentKpi
          label="Active projects"
          sub={`${named('Planned').length} planned`}
          tone="info"
          value={String(data.projects.filter((p) => p.status === 'ONGOING').length)}
        />
        {kpi('Critical', 'danger')}
        {kpi('At risk', 'warning')}
        {kpi('On track', 'success')}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <ListCard
            empty="No projects are in your portfolio."
            title="Portfolio health"
            viewAll={{ label: 'Project directory', href: '/projects' }}
          >
            {rows.map(({ project, health }) => {
              const value = metrics[project.id]?.kpi
              return (
                <div className="flex items-center gap-3 py-3" key={project.id}>
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate text-sm font-medium text-primary hover:underline"
                      href={`/projects/${project.id}`}
                    >
                      {project.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[project.programName, project.managerName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn('h-full rounded-full', bar[health.tone])}
                      style={{ width: `${Math.min(100, Number.parseFloat(value ?? '0') || 0)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums">{value ?? '—'}</span>
                  <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                </div>
              )
            })}
          </ListCard>
          <p className="px-1 text-xs text-muted-foreground">
            Health reflects open rule-based alerts, not a success score.
          </p>
        </div>
        <div className="space-y-2">
          <ListCard
            empty="No budget figures are available yet."
            title="Portfolio budget utilization"
          >
            {budgetTiles.map((tile) => (
              <div className="py-2" key={tile.key}>
                {tile}
              </div>
            ))}
          </ListCard>
          <p className="px-1 text-xs text-muted-foreground">
            Visual guide only; alert thresholds come from configured rules.
          </p>
        </div>
      </div>
      {data.alerts ? (
        <ListCard
          empty="No open alerts in your portfolio."
          title="Open alerts"
          viewAll={{ label: 'View all', href: '/alerts' }}
        >
          {data.alerts.recent.map((row) => (
            <div className="flex items-start gap-3 py-3" key={row.id}>
              <span
                aria-hidden="true"
                className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot[row.severity])}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-primary">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {data.projects.find((p) => p.id === row.projectId)?.title ?? 'Project'} ·{' '}
                  {row.explanation}
                </p>
                {row.recommendation ? (
                  <p className="rounded-md bg-surface-subtle px-3 py-1.5 text-xs">
                    {row.recommendation}
                  </p>
                ) : null}
              </div>
              {readOnly ? null : (
                <Button asChild size="sm">
                  <Link href="/alerts">Decide</Link>
                </Button>
              )}
            </div>
          ))}
        </ListCard>
      ) : null}
    </div>
  )
}
