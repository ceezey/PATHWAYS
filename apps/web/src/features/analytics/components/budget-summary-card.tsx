'use client'

import { PhilippinePeso } from 'lucide-react'

import { CappedPercent } from '@/components/pathways'
import { EmptyState } from '@/components/pathways/empty-state'
import type { BudgetSummary } from '@pathways/shared'

const NO_TOTAL_LABEL = 'No total budget set'
const UTILIZATION_CAPTION =
  'Approved spending over the whole project against its total budget; the selected period does not apply.'

const money = (amount: number, currency: string) =>
  amount.toLocaleString('en-US', { style: 'currency', currency })

/** Utilization is approved spending against the project total budget; awaiting approval is shown apart and never counted. */
export const BudgetSummaryCard = ({ data }: { data: BudgetSummary }) =>
  data.currencies.length === 0 ? (
    <EmptyState
      description="This project has no total budget yet."
      icon={PhilippinePeso}
      title={NO_TOTAL_LABEL}
    />
  ) : (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm text-muted-foreground">{UTILIZATION_CAPTION}</p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Budget summary by currency</caption>
        <thead>
          <tr className="border-b">
            <th className="p-3">Currency</th>
            <th className="p-3">Total budget</th>
            <th className="p-3">Approved</th>
            <th className="p-3">Awaiting approval (not counted)</th>
            <th className="p-3">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {data.currencies.map((row) => (
            <tr className="border-b" key={row.currency}>
              <td className="p-3 font-medium">{row.currency}</td>
              <td className="p-3 tabular-nums">
                {row.planned === null ? NO_TOTAL_LABEL : money(row.planned, row.currency)}
              </td>
              <td className="p-3 tabular-nums">{money(row.approved, row.currency)}</td>
              <td className="p-3 tabular-nums">{money(row.pending, row.currency)}</td>
              <td className="p-3 tabular-nums">
                {row.utilizationPercent === null ? (
                  'Not available'
                ) : (
                  <CappedPercent value={row.utilizationPercent} overrun="budget" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
