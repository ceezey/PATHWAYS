'use client'

import { CircleDollarSign } from 'lucide-react'

import { EmptyState } from '@/components/pathways/empty-state'
import type { BudgetSummary } from '@pathways/shared'

export const NO_BUDGET_LABEL = 'No budget'
export const UTILIZATION_CAPTION =
  'Utilization = approved expenses / planned budget; pending and verified amounts are not counted.'

const money = (amount: number, currency: string) =>
  amount.toLocaleString('en-US', { style: 'currency', currency })

/** Utilization is approved against planned; pending is shown apart and never counted. */
export const BudgetSummaryCard = ({ data }: { data: BudgetSummary }) =>
  data.currencies.length === 0 ? (
    <EmptyState
      description="No budget allocations are recorded for this project."
      icon={CircleDollarSign}
      title={NO_BUDGET_LABEL}
    />
  ) : (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm text-muted-foreground">{UTILIZATION_CAPTION}</p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Budget summary by currency</caption>
        <thead>
          <tr className="border-b">
            <th className="p-3">Currency</th>
            <th className="p-3">Planned</th>
            <th className="p-3">Approved</th>
            <th className="p-3">Pending or verified (not counted)</th>
            <th className="p-3">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {data.currencies.map((row) => (
            <tr className="border-b" key={row.currency}>
              <td className="p-3 font-medium">{row.currency}</td>
              <td className="p-3 tabular-nums">{money(row.planned, row.currency)}</td>
              <td className="p-3 tabular-nums">{money(row.approved, row.currency)}</td>
              <td className="p-3 tabular-nums">{money(row.pending, row.currency)}</td>
              <td className="p-3 tabular-nums">
                {row.utilizationPercent === null ? NO_BUDGET_LABEL : `${row.utilizationPercent}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
