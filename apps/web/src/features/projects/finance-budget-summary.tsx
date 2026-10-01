'use client'

import { moneyCents } from '@pathways/shared'

import { overviewMetricLabel } from './project-utils'
import { useProjectOverviewMetricsRead } from './use-project-reads'

type BudgetRow = { activityId: string | null; category: string; plannedBudget: string }
type ExpenseRow = { amount: string; status: string }

const php = (cents: bigint) =>
  new Intl.NumberFormat('en-US', { currency: 'PHP', style: 'currency' }).format(
    Number(cents) / 100,
  )

/** Approved project budget, countable (APPROVED) spending, utilization and remaining balance. */
export const FinanceBudgetSummary = ({
  projectId,
  budgets,
  expenses,
}: {
  projectId: string
  budgets: BudgetRow[]
  expenses: ExpenseRow[]
}) => {
  const metrics = useProjectOverviewMetricsRead(projectId).data
  const project = budgets.find(
    (row) => row.activityId === null && row.category === 'PROJECT_PROFILE_TOTAL',
  )
  const approved = project ? moneyCents(project.plannedBudget) : null
  const spent = expenses
    .filter((row) => row.status === 'APPROVED')
    .reduce((total, row) => total + moneyCents(row.amount), 0n)
  const utilization = metrics?.budgetUtilization
    ? overviewMetricLabel(metrics.budgetUtilization.metric, 'percent')
    : 'Unavailable'
  const tiles = [
    { label: 'Approved budget', value: approved === null ? 'Not recorded' : php(approved) },
    { label: 'Countable spending', value: php(spent) },
    { label: 'Utilization', value: utilization },
    {
      label: 'Remaining balance',
      value: approved === null ? 'Unavailable' : php(approved - spent),
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
