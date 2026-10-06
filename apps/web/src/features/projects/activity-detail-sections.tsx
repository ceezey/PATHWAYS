'use client'

import { ProgressBar, StatusBadge } from '@/components/pathways'
import type { Activity, ProjectIndicator, ProjectTeamMember } from '@/types/pathways'

import { formatCurrency } from './activity-utils'

const sectionHeading = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export const PanelSection = ({
  children,
  id,
  title,
}: { children: React.ReactNode; id: string; title: string }) => (
  <section aria-labelledby={id}>
    <h3 className={sectionHeading} id={id}>
      {title}
    </h3>
    <div className="mt-2">{children}</div>
  </section>
)

/** Named project team members behind an activity, each with the role they hold on it. */
export const ActivityTeam = ({
  assignedTo,
  assignedUserIds,
  team,
}: { assignedTo: string[]; assignedUserIds: string[]; team: ProjectTeamMember[] }) => {
  const roleOf = (name: string, index: number) =>
    team.find((member) => member.userId === assignedUserIds[index])?.role ??
    team.find((member) => member.fullName === name)?.role ??
    null
  if (assignedTo.length === 0)
    return <p className="text-sm text-muted-foreground">No project team member is assigned yet.</p>
  return (
    <ul className="space-y-1 text-sm">
      {assignedTo.map((name, index) => {
        const role = roleOf(name, index)
        return (
          <li
            className="font-medium text-foreground"
            key={`${name}-${assignedUserIds[index] ?? index}`}
          >
            {name}
            {role ? <span className="font-normal text-muted-foreground"> ({role})</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

const cellValue = (cell: ProjectIndicator['current']) =>
  cell.state === 'AVAILABLE' || cell.state === 'ZERO' ? Number(cell.value) : null

/** Connected indicators as actual against target, the way the monitoring tab reads them. */
export const ActivityIndicators = ({
  rows,
}: { rows: Array<{ id: string; code: string; label: string; row?: ProjectIndicator }> }) => {
  if (rows.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        No indicators are connected to this activity.
      </p>
    )
  return (
    <div className="space-y-2">
      {rows.map(({ id, code, label, row }) => {
        const actual = row ? cellValue(row.current) : null
        const target = row?.target === null || row?.target === undefined ? null : Number(row.target)
        const percent =
          actual !== null && target !== null && target > 0
            ? Math.min(100, Math.round((actual / target) * 100))
            : null
        return (
          <article className="rounded-lg border border-border bg-primary-subtle p-3" key={id}>
            <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
            <p className="text-xs text-primary">{code}</p>
            {percent === null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {actual === null ? 'Current value not available' : `Actual: ${actual}`}
              </p>
            ) : (
              <>
                <div className="mt-2 flex items-baseline justify-between text-xs tabular-nums">
                  <span className="text-foreground">Actual: {actual}</span>
                  <span className="text-muted-foreground">Target: {target}</span>
                </div>
                <ProgressBar label={`${code} progress`} hideText tone="info" value={percent} />
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** Allocation against logged spending for this activity alone. */
export const ActivityBudget = ({
  activity,
  canReadBudgets,
}: { activity: Activity; canReadBudgets: boolean }) => {
  const allocated = activity.budgetAllocation
  const logged = activity.budgetLogged
  const percent =
    allocated !== null && allocated > 0 && logged !== null
      ? Math.min(100, Math.round((logged / allocated) * 100))
      : null
  return (
    <dl className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground">Allocated</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {formatCurrency(allocated, canReadBudgets ? 'None yet' : 'Unavailable')}
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground">Logged expenses</dt>
        <dd className="font-medium tabular-nums text-success">
          {activity.budgetLoggedEntries === 0 ? 'None yet' : formatCurrency(logged, 'Unavailable')}
        </dd>
      </div>
      {percent === null ? null : (
        <div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Utilization</dt>
            <dd className="font-medium tabular-nums text-foreground">{percent}%</dd>
          </div>
          <ProgressBar
            label="Activity budget utilization"
            hideText
            tone={percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'success'}
            value={percent}
          />
        </div>
      )}
    </dl>
  )
}

/** Progress with the reason it cannot be typed in by hand. */
export const ActivityProgress = ({ activity }: { activity: Activity }) => (
  <div>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm font-medium text-foreground">{activity.progress}% complete</p>
      <p className="text-sm tabular-nums text-muted-foreground">
        {Number.isFinite(activity.beneficiariesReached)
          ? `${activity.beneficiariesReached}/${activity.targetBeneficiaries}`
          : 'Reach unavailable'}
      </p>
    </div>
    <ProgressBar
      label="Activity progress"
      hideText
      tone={activity.status === 'Overdue' ? 'danger' : activity.progress >= 80 ? 'success' : 'info'}
      value={activity.progress}
    />
    <p className="mt-1 text-xs text-muted-foreground">
      System-calculated from participation records.
    </p>
  </div>
)

export const ProofStatusBadge = ({ status }: { status: string }) => {
  // The ledger words these for the reader: an accepted file is verified, a flagged one is not enough.
  const label = status === 'Accepted' ? 'Verified' : status === 'Flagged' ? 'Insufficient' : status
  const tone = status === 'Accepted' ? 'success' : status === 'Flagged' ? 'warning' : 'info'
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}
