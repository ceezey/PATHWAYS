import type { DashboardActionCounts, RoleOverview } from '@pathways/shared'

import Link from 'next/link'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { healthOf } from './health'
import {
  AccentKpi,
  DashboardHeading,
  InitialsBadge,
  KpiStrip,
  ListCard,
  ListRow,
  projectTitles,
} from './primitives'

export type ProjectMetrics = Record<
  string,
  { kpi: string | null; budget: { percent: number; allocated: string; used: string } | null }
>
const bar = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  neutral: 'bg-muted-foreground',
} as const
const peso = (amount: string) =>
  `PHP ${Number(amount).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
const budgetHref = (projectId: string) => `/projects/${projectId}/budget`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Project Manager home: project health from alerts, expense approvals and budget alerts. */
export const ManagerOverview = ({
  data,
  counts,
  fullName,
  metrics,
  onOpenActivity,
}: {
  data: RoleOverview
  counts: DashboardActionCounts | null
  fullName?: string | null
  metrics: ProjectMetrics
  onOpenActivity: (href: string) => void
}) => {
  const byProject = new Map(data.alerts?.byProject.map((row) => [row.projectId, row]))
  const budgetAlerts = data.alerts?.budgetRecent ?? []
  const approvals = data.approvalQueue
  const extensions = data.extensionQueue
  const overdue = counts?.overdueActivities
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        subtitle={[
          `Managing ${plural(data.projects.length, 'project')}`,
          projectTitles(data.projects),
        ]
          .filter(Boolean)
          .join(' · ')}
        title="Project management overview"
      />
      <KpiStrip label="Management counts">
        {approvals || extensions ? (
          <AccentKpi
            label="Pending approvals"
            sub={extensions?.count ? 'Expenses and extensions' : 'Expenses verified by M&E'}
            tone="danger"
            value={String((approvals?.count ?? 0) + (extensions?.count ?? 0))}
          />
        ) : null}
        {data.alerts ? (
          <AccentKpi
            action={{
              label: 'View',
              href: budgetAlerts[0] ? budgetHref(budgetAlerts[0].projectId) : '/alerts',
            }}
            label="Active budget alerts"
            sub="Require your decision"
            tone="warning"
            value={`${data.alerts.budgetOpen}${data.alerts.capped ? '+' : ''}`}
          />
        ) : null}
        {overdue ? (
          <AccentKpi
            label="Overdue activities"
            sub={
              overdue.mostOverdue
                ? `${overdue.mostOverdue.code} · ${plural(overdue.mostOverdue.daysLate, 'day')}`
                : 'Nothing is past due'
            }
            tone="info"
            value={String(overdue.count)}
          />
        ) : null}
        {counts && counts.forReview !== null ? (
          <AccentKpi
            label="For review"
            sub="Activity submitted"
            tone="success"
            value={String(counts.forReview)}
          />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <ListCard
            empty="No projects are in your scope."
            title="Project health"
            viewAll={{ label: 'Project directory', href: '/projects' }}
          >
            {data.projects.map((project) => {
              const health = healthOf(project.status, byProject.get(project.id))
              const tone = data.alerts ? health.tone : 'neutral'
              const m = metrics[project.id]
              return (
                <div className="space-y-2 py-3" key={project.id}>
                  <div className="flex items-center justify-between gap-2">
                    <a
                      className="truncate text-sm font-medium text-primary hover:underline"
                      href={`/projects/${project.id}`}
                    >
                      {project.title}
                    </a>
                    {data.alerts ? (
                      <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    KPI {m?.kpi ?? '—'} · Budget {m?.budget ? `${m.budget.percent}%` : '—'}
                  </p>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', bar[tone])}
                      style={{ width: `${Math.min(100, m?.budget?.percent ?? 0)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </ListCard>
          {data.alerts ? (
            <p className="px-1 text-xs text-muted-foreground">
              Health reflects open rule-based alerts, not a success score. Bar colors are a visual
              guide only.
            </p>
          ) : null}
          {data.projects.length === 20 ? (
            <p className="px-1 text-xs text-muted-foreground">Showing the first 20 projects.</p>
          ) : null}
        </div>
        {approvals || extensions ? (
          <ListCard empty="Nothing is waiting for your approval." title="Pending your approval">
            {extensions?.rows.map((row) => (
              <ListRow
                key={row.id}
                lead={<InitialsBadge text="EXT" />}
                meta={`Extension to ${longDate(row.requestedEndDate)} · ${row.requesterName} · ${row.projectTitle}`}
                title={`${row.activityCode} — ${row.activityTitle}`}
                trailing={
                  <Button
                    aria-label={`Approve extension for ${row.activityCode}`}
                    onClick={() =>
                      onOpenActivity(
                        `/projects/${row.projectId}/activities/${row.activityId}?action=extension`,
                      )
                    }
                    size="sm"
                    type="button"
                  >
                    Approve
                  </Button>
                }
              />
            ))}
            {approvals?.rows.map((row) => {
              // Expense approval opens the budget ledger with that expense's review drawer.
              const href = `${budgetHref(row.projectId)}?expense=${row.expenseId}`
              return (
                <ListRow
                  href={href}
                  key={row.expenseId}
                  lead={<InitialsBadge text="EX" />}
                  meta={`Verified by ${row.verifiedByName ?? 'M&E'} · ${row.projectTitle}`}
                  title={`${row.description} · ${peso(row.amount)}`}
                  trailing={
                    <Button
                      aria-label={`Approve ${row.description}`}
                      onClick={() => onOpenActivity(href)}
                      size="sm"
                      type="button"
                    >
                      Approve
                    </Button>
                  }
                />
              )
            })}
          </ListCard>
        ) : null}
      </div>
      {data.alerts ? (
        <ListCard
          empty="No budget alerts are open."
          title="Budget alerts requiring your decision"
          viewAll={{ label: 'Go to alerts', href: '/alerts' }}
        >
          {budgetAlerts.map((row) => (
            <ListRow
              href={budgetHref(row.projectId)}
              key={row.id}
              meta={row.explanation}
              title={`${row.title} · ${row.severity.charAt(0)}${row.severity.slice(1).toLowerCase()}`}
              trailing={
                <Button asChild size="sm">
                  <Link href={budgetHref(row.projectId)}>Log outcome</Link>
                </Button>
              }
            />
          ))}
        </ListCard>
      ) : null}
    </div>
  )
}
