'use client'

import { AlertTriangle, CheckCircle2, Lightbulb, Wallet } from 'lucide-react'
import { useState } from 'react'

import {
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatCurrency } from '../activity-utils'
import { type BudgetAlert, toneFor } from './budget-math'
import type { useBudgetModule } from './use-budget-module'

type Module = ReturnType<typeof useBudgetModule>

const alertClass = {
  danger: 'border-danger/30 bg-danger-subtle',
  warning: 'border-warning/30 bg-warning-subtle',
}

const AlertCard = ({
  alert,
  reviewed,
  onReview,
  onDismiss,
}: {
  alert: BudgetAlert
  reviewed: boolean
  onReview: () => void
  onDismiss: () => void
}) => (
  <li
    className={cn('flex flex-wrap items-start gap-3 rounded-md border p-4', alertClass[alert.tone])}
  >
    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-foreground">{alert.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{alert.consequence}</p>
    </div>
    {reviewed ? <StatusBadge tone="success">Reviewed</StatusBadge> : null}
    <div className="flex gap-2">
      {reviewed ? null : (
        <Button onClick={onReview} size="sm" type="button" variant="outline">
          Mark reviewed
        </Button>
      )}
      <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
        Dismiss
      </Button>
    </div>
  </li>
)

export const BudgetOverview = ({
  module,
  onOpenLedger,
}: {
  module: Module
  onOpenLedger: (activityKey: string | null) => void
}) => {
  const { totals, activityRows, alerts, recommendations } = module
  // Review and dismiss are local to this view and are not persisted.
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const add = (set: Set<string>, id: string) => new Set(set).add(id)
  const visibleAlerts = alerts.filter((alert) => !dismissed.has(alert.id))
  const pct = totals.utilization
  const tone = toneFor(pct)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Sum of all budget allocations recorded for this project."
          icon={Wallet}
          label="Total budget"
          value={formatCurrency(totals.allocated)}
        />
        <div className="rounded-lg border border-info/30 bg-info-subtle p-5">
          <p className="text-sm font-medium text-muted-foreground">Budget used</p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {formatCurrency(totals.used)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              of {formatCurrency(totals.allocated)}
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar label="Utilization" tone={tone} value={pct ?? 0} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone={tone}>Actual {pct === null ? 'n/a' : `${pct}%`}</StatusBadge>
            <StatusBadge tone="neutral">Alert at 90%</StatusBadge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Counts approved expenses only. Pending: {formatCurrency(totals.pending)}.
          </p>
        </div>
        <MetricCard
          description="Total budget minus approved expenses; pending expenses are not deducted."
          label="Remaining"
          tone={totals.remaining < 0 ? 'danger' : 'success'}
          value={formatCurrency(totals.remaining)}
        />
        <MetricCard
          description="KPI achievement divided by budget utilization. Above 1.00 means results are ahead of spending."
          label="Efficiency ratio"
          tone={
            totals.efficiency === null ? 'info' : totals.efficiency >= 1 ? 'success' : 'warning'
          }
          value={totals.efficiency === null ? 'Not available' : totals.efficiency.toFixed(2)}
        />
      </div>

      <SectionCard
        description="Conditions that may need attention. Review marks are local to this page."
        title="Budget alerts"
      >
        {visibleAlerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            No budget alerts right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleAlerts.map((alert) => (
              <AlertCard
                alert={alert}
                key={alert.id}
                onDismiss={() => setDismissed(add(dismissed, alert.id))}
                onReview={() => setReviewed(add(reviewed, alert.id))}
                reviewed={reviewed.has(alert.id)}
              />
            ))}
          </ul>
        )}
        {recommendations.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {recommendations.map((item) => (
              <li
                className="flex flex-wrap items-start gap-3 rounded-md border border-warning/30 bg-warning-subtle p-4"
                key={item.id}
              >
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">Recommendation (advisory)</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Signal: {item.signal}. {item.suggestion} Nothing is changed automatically.
                  </p>
                </div>
                <Button
                  onClick={() => onOpenLedger(item.activityKey)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Review plan
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <SectionCard
        description="Used counts approved expenses only; pending expenses are listed separately."
        title="Activity breakdown"
      >
        {activityRows.length === 0 ? (
          <EmptyState
            description="Record a budget allocation to see spending by activity."
            icon={Wallet}
            title="No allocations yet"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">Activity</th>
                  <th className="py-2 pr-3 text-right font-medium">Allocated</th>
                  <th className="py-2 pr-3 text-right font-medium">Used</th>
                  <th className="py-2 pr-3 text-right font-medium">Pending</th>
                  <th className="w-48 py-2 pr-3 font-medium">Utilization</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {activityRows.map((row) => (
                  <tr className="h-14 border-t border-border" key={row.key}>
                    <td className="pr-3">{row.code}</td>
                    <td className="pr-3 font-medium text-foreground">{row.title}</td>
                    <td className="pr-3 text-right">{formatCurrency(row.allocated)}</td>
                    <td className="pr-3 text-right">{formatCurrency(row.used)}</td>
                    <td className="pr-3 text-right text-muted-foreground">
                      {formatCurrency(row.pending)}
                    </td>
                    <td className="pr-3">
                      <ProgressBar
                        label={`${row.title} utilization`}
                        tone={toneFor(row.utilization)}
                        value={row.utilization ?? 0}
                      />
                    </td>
                    <td className="text-right">
                      <Button
                        onClick={() => onOpenLedger(row.key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        View expenses
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
