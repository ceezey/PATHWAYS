'use client'

import Link from 'next/link'
import { useState } from 'react'

import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'

import { formatCurrency } from '../activity-utils'
import type { useBudgetModule } from './use-budget-module'

type Module = ReturnType<typeof useBudgetModule>

const fields = [
  { key: 'total', label: 'Total budget' },
  { key: 'used', label: 'Budget used (approved)' },
  { key: 'breakdown', label: 'Breakdown by activity' },
] as const

/** Local-only visibility toggles with a donor preview; publishing happens in the existing flow. */
export const BudgetTransparency = ({
  projectId,
  module,
}: { projectId: string; module: Module }) => {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    total: true,
    used: true,
    breakdown: false,
  })
  const { totals, activityRows } = module
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard
        description="Choose what a donor would see. These choices are not saved yet."
        title="Visibility"
      >
        <ul className="space-y-3">
          {fields.map((field) => (
            <li key={field.key}>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  checked={visible[field.key]}
                  onChange={(e) => setVisible({ ...visible, [field.key]: e.target.checked })}
                  type="checkbox"
                />
                {field.label}
              </label>
            </li>
          ))}
        </ul>
        <Button asChild className="mt-4">
          <Link href={`/projects/${projectId}/transparency`}>Continue to publication</Link>
        </Button>
      </SectionCard>
      <SectionCard description="Approved figures only." title="Donor preview">
        <dl className="space-y-3 text-sm">
          {visible.total ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total budget</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(totals.allocated)}</dd>
            </div>
          ) : null}
          {visible.used ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Budget used</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(totals.used)}</dd>
            </div>
          ) : null}
          {visible.breakdown
            ? activityRows.map((row) => (
                <div className="flex justify-between" key={row.key}>
                  <dt className="text-muted-foreground">{row.title}</dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(row.used)}</dd>
                </div>
              ))
            : null}
          {!visible.total && !visible.used && !visible.breakdown ? (
            <p className="text-muted-foreground">Nothing selected for display.</p>
          ) : null}
        </dl>
      </SectionCard>
    </div>
  )
}
