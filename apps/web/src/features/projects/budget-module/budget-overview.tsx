'use client'

import { AlertTriangle, CheckCircle2, Lightbulb, Wallet } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import {
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { formatCappedPercent } from '@/lib/percent'
import { cn } from '@/lib/utils'

import { formatCurrency } from '../activity-utils'
import { type BudgetAlert, toneFor } from './budget-math'
import type { useBudgetModule } from './use-budget-module'

type Module = ReturnType<typeof useBudgetModule>

const alertClass = {
  danger: 'border-danger/30 bg-danger-subtle',
  warning: 'border-warning/30 bg-warning-subtle',
}

const valueTone = {
  default: 'text-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

const pesoCompact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const peso = (value: number) => pesoCompact.format(value)
const percent = (value: number | null) => (value === null ? 'n/a' : `${value}%`)

const StatCard = ({
  label,
  value,
  sub,
  tone = 'default',
  children,
}: {
  label: string
  value: string
  sub: string
  tone?: keyof typeof valueTone
  children?: ReactNode
}) => (
  <div className="rounded-md border border-border bg-card p-5">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn('mt-2 text-2xl font-semibold tabular-nums', valueTone[tone])}>{value}</p>
    <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p>
    {children ? <div className="mt-3">{children}</div> : null}
  </div>
)

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
  const remainingPct =
    totals.allocated > 0 ? Math.round((totals.remaining / totals.allocated) * 100) : null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total budget" sub="Approved allocation" value={peso(totals.allocated)} />
        <StatCard
          label="Total logged"
          sub={
            pct === null
              ? 'Utilization not available'
              : `${formatCappedPercent(pct, 'over budget')} utilized`
          }
          tone={tone}
          value={peso(totals.used)}
        >
          <ProgressBar hideText label="Total logged utilization" tone={tone} value={pct ?? 0} />
        </StatCard>
        <StatCard
          label="Remaining"
          sub={remainingPct === null ? 'No budget recorded' : `${remainingPct}% of budget`}
          tone={totals.remaining < 0 ? 'danger' : 'success'}
          value={peso(totals.remaining)}
        />
        <StatCard
          label="Efficiency ratio"
          sub={`KPI ${percent(totals.kpiPct)} ÷ Budget ${percent(totals.budgetMetricPct)}`}
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
              <li key={item.id}>
                {/* The whole card opens the ledger; there is no separate review button. */}
                <button
                  aria-label={`Review plan: ${item.signal}`}
                  className="flex w-full items-start gap-3 rounded-md border border-warning/30 bg-warning-subtle p-4 text-left transition-colors hover:border-warning/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpenLedger(item.activityKey)}
                  type="button"
                >
                  <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="block min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">
                      Recommendation (advisory)
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Signal: {item.signal}. {item.suggestion} Nothing is changed automatically.
                    </span>
                  </span>
                </button>
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
                        hideText
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
