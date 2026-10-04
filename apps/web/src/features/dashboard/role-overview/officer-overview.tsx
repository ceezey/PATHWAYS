import type { RoleOverview } from '@pathways/shared'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  AccentKpi,
  DashboardHeading,
  InitialsBadge,
  KpiStrip,
  ListCard,
  ListRow,
  projectTitles,
} from './primitives'

type Data = RoleOverview
const activityHref = (projectId: string, activityId: string) =>
  `/projects/${projectId}/activities/${activityId}`
const peso = (amount: string) =>
  `PHP ${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
const daysLate = (today: string, due: string | null) =>
  due ? Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0
const daysText = (n: number) => `${n} day${n === 1 ? '' : 's'}`
const statusBadge = (row: NonNullable<Data['myActivities']>['rows'][number]) =>
  row.overdue
    ? { text: 'Overdue', tone: 'danger' as const }
    : row.status === 'NOT_STARTED'
      ? { text: 'Planned', tone: 'neutral' as const }
      : row.status === 'FOR_REVIEW'
        ? { text: 'For review', tone: 'warning' as const }
        : row.status === 'COMPLETED'
          ? { text: 'Completed', tone: 'success' as const }
          : { text: 'In progress', tone: 'info' as const }
const submissionBadge = {
  PENDING: ['Pending', 'neutral'],
  VERIFIED: ['Verified', 'success'],
  APPROVED: ['Approved', 'success'],
  REJECTED: ['Returned', 'danger'],
} as const

/** Project Officer home: assigned work, items needing action and own submissions. */
export const OfficerOverview = ({
  data,
  fullName,
  onOpenActivity,
}: {
  data: Data
  fullName?: string | null
  onOpenActivity: (href: string) => void
}) => {
  const activities = data.myActivities
  const overdue = activities?.rows.filter((row) => row.overdue) ?? []
  const flagged = data.flaggedProof
  const projectCount = new Set(activities?.rows.map((row) => row.projectId)).size
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        subtitle={[longDate(data.businessDate), projectTitles(data.projects)]
          .filter(Boolean)
          .join(' · ')}
        title="Your workspace"
      />
      <KpiStrip label="Your task counts">
        {activities ? (
          <AccentKpi
            label="Assigned activities"
            sub={`Across ${projectCount} project${projectCount === 1 ? '' : 's'}`}
            tone="info"
            value={String(activities.count)}
          />
        ) : null}
        {activities ? (
          <AccentKpi
            action={
              overdue[0]
                ? {
                    label: 'View',
                    onClick: () =>
                      onOpenActivity(activityHref(overdue[0].projectId, overdue[0].id)),
                  }
                : undefined
            }
            label="Overdue"
            sub={
              overdue[0]
                ? [
                    overdue[0].code,
                    overdue[0].plannedEndDate &&
                      daysText(daysLate(data.businessDate, overdue[0].plannedEndDate)),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Nothing is past due'
            }
            tone="danger"
            value={`${overdue.length}${overdue.length === (activities?.rows.length ?? 0) && (activities?.count ?? 0) > overdue.length ? '+' : ''}`}
          />
        ) : null}
        {flagged ? (
          <AccentKpi
            action={
              flagged.rows[0]
                ? {
                    label: 'Resolve',
                    onClick: () =>
                      onOpenActivity(
                        activityHref(flagged.rows[0].projectId, flagged.rows[0].activityId),
                      ),
                  }
                : undefined
            }
            label="Flagged proof"
            sub={flagged.count ? 'Action needed' : 'No returned proof'}
            tone="warning"
            value={String(flagged.count)}
          />
        ) : null}
        {data.submittedThisMonth ? (
          <AccentKpi
            label="Submitted this month"
            sub="Updates & expenses"
            tone="success"
            value={String(data.submittedThisMonth.updates + data.submittedThisMonth.expenses)}
          />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        {activities ? (
          <ListCard
            empty="No activities are assigned to you."
            title="Your activities"
            viewAll={{ label: 'View all', href: '/projects' }}
          >
            {activities.rows.map((row) => {
              const badge = statusBadge(row)
              return (
                <ListRow
                  key={row.id}
                  meta={`${row.projectTitle} · ${row.plannedEndDate ? `${row.overdue ? 'Was due' : 'Due'} ${longDate(row.plannedEndDate)}` : 'No due date'} · ${row.progress}%`}
                  onOpen={() => onOpenActivity(activityHref(row.projectId, row.id))}
                  title={row.title}
                  trailing={<StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
                />
              )
            })}
          </ListCard>
        ) : null}
        {activities || flagged ? (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Needs your attention</h3>
            {flagged?.rows.map((row) => (
              <div
                className="space-y-2 rounded-lg border border-warning/40 bg-warning-subtle p-3"
                key={row.updateId}
              >
                <p className="text-sm font-semibold text-foreground">
                  Proof returned · {row.activityCode}
                </p>
                <p className="text-sm text-foreground">
                  {row.reviewReason || 'The reviewer returned this proof.'}
                </p>
                <Button
                  onClick={() => onOpenActivity(activityHref(row.projectId, row.activityId))}
                  size="sm"
                  type="button"
                >
                  Resubmit proof
                </Button>
              </div>
            ))}
            {overdue.map((row) => (
              <div
                className="space-y-2 rounded-lg border border-danger/30 bg-danger-subtle p-3"
                key={row.id}
              >
                <p className="text-sm font-semibold text-foreground">
                  {row.plannedEndDate
                    ? `${row.code} is ${daysText(daysLate(data.businessDate, row.plannedEndDate))} overdue`
                    : `${row.code} is overdue`}
                </p>
                <p className="text-sm text-foreground">
                  {row.title} passed its planned end date. Submit a progress update.
                </p>
                <Button
                  onClick={() => onOpenActivity(activityHref(row.projectId, row.id))}
                  size="sm"
                  type="button"
                >
                  Submit update
                </Button>
              </div>
            ))}
            {!flagged?.rows.length && !overdue.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing needs your attention.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      {data.recentSubmissions ? (
        <ListCard empty="You have not submitted anything yet." title="Recent submissions">
          {data.recentSubmissions.rows.map((row) => {
            const [text, tone] = submissionBadge[row.status]
            const activityId = row.activityId
            return (
              <ListRow
                key={row.id}
                lead={<InitialsBadge text={row.kind === 'EXPENSE' ? 'EX' : 'UP'} />}
                meta={`Submitted ${new Date(row.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                onOpen={
                  activityId
                    ? () => onOpenActivity(activityHref(row.projectId, activityId))
                    : undefined
                }
                title={[
                  row.label,
                  row.amount ? peso(row.amount) : row.progress !== null ? `${row.progress}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<StatusBadge tone={tone}>{text}</StatusBadge>}
              />
            )
          })}
        </ListCard>
      ) : null}
    </div>
  )
}
