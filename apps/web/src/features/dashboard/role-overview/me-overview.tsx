import type { RoleOverview } from '@pathways/shared'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AccentKpi,
  DashboardHeading,
  InitialsBadge,
  KpiStrip,
  ListCard,
  ListRow,
} from './primitives'

const dot = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-danger',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground',
} as const
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

type QueueRow = NonNullable<RoleOverview['proofQueue']>['rows'][number]
const reviewHref = (row: QueueRow) =>
  `/projects/${row.projectId}/activities/${row.activityId}?review=${row.updateId}`

/** M&E Officer home: alerts, proof waiting for review, evaluation scores and imports. */
export const MeOverview = ({
  data,
  fullName,
  evaluations,
  onOpenActivity,
}: {
  data: RoleOverview
  fullName?: string | null
  evaluations: Array<{ projectId: string; title: string; score: string | null }>
  onOpenActivity: (href: string) => void
}) => {
  const alerts = data.alerts
  const queue = data.proofQueue
  const firstReview = queue?.rows[0]
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        subtitle={[longDate(data.businessDate), data.projects.map((p) => p.title).join(' · ')]
          .filter(Boolean)
          .join(' · ')}
        title="Monitoring overview"
      />
      <KpiStrip label="Monitoring counts">
        {alerts ? (
          <AccentKpi
            action={{ label: 'Review', href: '/alerts' }}
            label="Active alerts"
            sub={`${alerts.bySeverity.CRITICAL} critical · ${alerts.bySeverity.HIGH} high`}
            tone="danger"
            value={`${alerts.open}${alerts.capped ? '+' : ''}`}
          />
        ) : null}
        {queue ? (
          <AccentKpi
            action={
              firstReview
                ? { label: 'Review', onClick: () => onOpenActivity(reviewHref(firstReview)) }
                : undefined
            }
            label="Proof pending review"
            sub="Submitted by officers"
            tone="warning"
            value={String(queue.count)}
          />
        ) : null}
        <AccentKpi
          label="Evaluation snapshots"
          sub="Latest stored evaluation"
          tone="info"
          value={String(evaluations.filter((e) => e.score !== null).length)}
        />
        {data.datasetsImportedThisMonth !== null ? (
          <AccentKpi
            label="Datasets imported"
            sub="This month"
            tone="success"
            value={String(data.datasetsImportedThisMonth)}
          />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        {alerts ? (
          <ListCard
            empty="No open alerts."
            title="Active alerts requiring review"
            viewAll={{ label: 'View all', href: '/alerts' }}
          >
            {alerts.recent.map((row) => (
              <div className="space-y-2 py-3" key={row.id}>
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot[row.severity])}
                  />
                  <div className="min-w-0">
                    <Link
                      className="text-sm font-medium text-primary hover:underline"
                      href="/alerts"
                    >
                      {row.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {data.projects.find((p) => p.id === row.projectId)?.title ?? 'Project'} ·{' '}
                      {row.explanation}
                    </p>
                  </div>
                </div>
                {row.recommendation ? (
                  <p className="rounded-md bg-surface-subtle px-3 py-1.5 text-xs text-foreground">
                    {row.recommendation}
                  </p>
                ) : null}
              </div>
            ))}
          </ListCard>
        ) : null}
        {queue ? (
          <ListCard
            empty="No proof is waiting for review."
            title="Proof submissions awaiting review"
            viewAll={{ label: 'Review all', href: '/projects' }}
          >
            {queue.rows.map((row) => (
              <ListRow
                key={row.updateId}
                lead={<InitialsBadge text={initials(row.submitterName)} />}
                meta={`${row.submitterName} · Submitted ${shortDate(row.submittedAt)} · ${row.projectTitle}`}
                title={`${row.activityCode} — ${row.activityTitle}`}
                trailing={
                  <Button
                    aria-label={`Review ${row.activityCode}`}
                    onClick={() => onOpenActivity(reviewHref(row))}
                    size="sm"
                    type="button"
                  >
                    Review
                  </Button>
                }
              />
            ))}
          </ListCard>
        ) : null}
      </div>
      <section className="rounded-xl border border-border bg-card">
        <div className="flex min-h-12 items-center border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">
            Evaluation snapshot — current state
          </h3>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {evaluations.map((row) => (
            <Link
              className="rounded-lg border border-border bg-surface-subtle p-3 hover:border-primary"
              href={`/projects/${row.projectId}/monitor-evaluate`}
              key={row.projectId}
            >
              <p className="truncate text-xs text-muted-foreground">{row.title}</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {row.score ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.score ? 'Stored evaluation score' : 'No evaluation yet'}
              </p>
              <p className="mt-1 text-xs font-medium text-primary">Open Monitor & Evaluate</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
