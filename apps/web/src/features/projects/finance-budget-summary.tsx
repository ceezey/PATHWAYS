'use client'

import { moneyCents } from '@pathways/shared'

import { overviewMetricLabel } from './project-utils'
import { useProjectOverviewMetricsRead } from './use-project-reads'

const php = (cents: bigint) =>
  new Intl.NumberFormat('en-US', { currency: 'PHP', style: 'currency' }).format(Number(cents) / 100)

/** Approved budget, countable spending, utilization and remaining balance from the server totals. */
export const FinanceBudgetSummary = ({ projectId }: { projectId: string }) => {
  const budget = useProjectOverviewMetricsRead(projectId).data?.budgetUtilization
  const approved = budget?.approvedBudget ? moneyCents(budget.approvedBudget) : null
  const spent = budget ? moneyCents(budget.countableSpending) : null
  const utilization = budget ? overviewMetricLabel(budget.metric, 'percent') : 'Unavailable'
  const tiles = [
    { label: 'Approved budget', value: approved === null ? 'Not recorded' : php(approved) },
    { label: 'Countable spending', value: spent === null ? 'Unavailable' : php(spent) },
    { label: 'Utilization', value: utilization },
    {
      label: 'Remaining balance',
      value: approved === null || spent === null ? 'Unavailable' : php(approved - spent),
    },
  ]
  return (
    <div className="space-y-2">
      <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div className="bg-surface-subtle p-4" key={tile.label}>
            <dt className="text-sm text-muted-foreground">{tile.label}</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Countable spending is approved expenses only; remaining balance is approved budget minus
        countable spending.
      </p>
    </div>
  )
}
