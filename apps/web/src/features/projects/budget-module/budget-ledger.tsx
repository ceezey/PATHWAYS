'use client'

import { ChevronDown, ChevronRight, Info, Receipt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState, ProofPreviewDialog, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { fetchCoreArtifact, saveCoreArtifact } from '@/lib/services/core-feature-client'

import { formatCurrency, formatDate } from '../activity-utils'
import { projectLevelKey } from './budget-math'
import { ExpenseReviewDrawer, type ReviewAction } from './expense-review-drawer'
import type { useBudgetModule } from './use-budget-module'

type Module = ReturnType<typeof useBudgetModule>
type Expense = Module['expenses'][number]

const statusLabel = {
  PENDING: { text: 'For review', tone: 'warning' },
  VERIFIED: { text: 'Verified', tone: 'info' },
  APPROVED: { text: 'Approved', tone: 'success' },
  REJECTED: { text: 'Rejected', tone: 'danger' },
} as const

/** Expense id from an `?expense=<id>` or `#expense-<id>` link, read on the client only. */
export const hashedExpenseId = () =>
  typeof window === 'undefined'
    ? null
    : (new URLSearchParams(window.location.search).get('expense') ??
      window.location.hash.match(/^#expense-(.+)$/)?.[1] ??
      null)

export const BudgetLedger = ({
  projectId,
  module,
  activityKey,
  onClearFilter,
}: {
  projectId: string
  module: Module
  activityKey: string | null
  onClearFilter: () => void
}) => {
  const { profile } = useCurrentRole()
  const can = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
  const me = profile?.userId ?? ''
  const [open, setOpen] = useState<string | null>(hashedExpenseId)
  const [preview, setPreview] = useState<Expense | null>(null)
  const [review, setReview] = useState<{ expense: Expense; action: ReviewAction } | null>(null)

  const budgetOf = (expense: Expense) => module.budgets.find((b) => b.id === expense.budgetRecordId)
  const rows = module.expenses.filter(
    (expense) => !activityKey || (budgetOf(expense)?.activityId ?? projectLevelKey) === activityKey,
  )
  const filterActivity = module.activities.find((a) => a.id === activityKey)
  const filterLabel =
    activityKey === projectLevelKey
      ? 'Project-level budget'
      : filterActivity
        ? `${filterActivity.code} ${filterActivity.title}`
        : 'this activity'
  const stepFor = (expense: Expense): ReviewAction | null => {
    if (expense.status === 'PENDING' && expense.receiptEvidenceId && can('expenses.verify'))
      return expense.submittedById === me ? null : 'VERIFY'
    if (expense.status === 'VERIFIED' && can('expenses.approve'))
      return [expense.submittedById, expense.verifiedById].includes(me) ? null : 'APPROVE'
    if (expense.status === 'APPROVED' && !expense.signedOffAt && can('expenses.signoff'))
      return [expense.submittedById, expense.verifiedById, expense.approvedById].includes(me)
        ? null
        : 'SIGNOFF'
    return null
  }
  // A dashboard link scrolls to its expense once and opens that expense's review step.
  const linked = useRef(hashedExpenseId())
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once when the linked expense loads.
  useEffect(() => {
    const id = linked.current
    const expense = id ? module.expenses.find((row) => row.id === id) : undefined
    if (!expense) return
    linked.current = null
    document.getElementById(`expense-${expense.id}`)?.scrollIntoView({ block: 'center' })
    const step = stepFor(expense)
    if (step) setReview({ expense, action: step })
  }, [module.expenses])
  return (
    <SectionCard
      actions={
        activityKey ? (
          <Button onClick={onClearFilter} size="sm" type="button" variant="outline">
            Show all expenses
          </Button>
        ) : undefined
      }
      description="Every submitted expense and where it stands in review."
      title="Expense ledger"
    >
      {activityKey ? (
        <output className="mb-3 block text-sm font-semibold text-foreground">
          Showing {rows.length} of {module.expenses.length} expenses for {filterLabel}
        </output>
      ) : null}
      <p className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info-subtle p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Only approved expenses count toward budget used. Pending and verified expenses are shown
        here until final approval.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          description="Expenses submitted against this project's allocations appear here."
          icon={Receipt}
          title="No expenses yet"
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((expense) => {
            const budget = budgetOf(expense)
            const activity = module.activities.find((a) => a.id === budget?.activityId)
            const status = statusLabel[expense.status]
            const step = stepFor(expense)
            const expanded = open === expense.id
            const Chevron = expanded ? ChevronDown : ChevronRight
            return (
              <li className="py-3" id={`expense-${expense.id}`} key={expense.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${expense.description}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setOpen(expanded ? null : expense.id)}
                    type="button"
                  >
                    <Chevron className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {expense.description}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {activity?.code ?? 'Project-level'} -{' '}
                        {formatCurrency(Number(expense.amount))} - {formatDate(expense.expenseDate)}
                      </span>
                    </span>
                  </button>
                  <StatusBadge tone={status.tone}>{status.text}</StatusBadge>
                  {step ? (
                    <Button
                      onClick={() => setReview({ expense, action: step })}
                      size="sm"
                      type="button"
                    >
                      Review
                    </Button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="mt-3 space-y-3 pl-7 text-sm">
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Submitted by</dt>
                        <dd className="break-all font-medium">{expense.submittedById}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Verified by</dt>
                        <dd className="break-all font-medium">
                          {expense.verifiedById ?? 'Not yet'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Approved by</dt>
                        <dd className="break-all font-medium">
                          {expense.approvedById ?? 'Not yet'}
                        </dd>
                      </div>
                    </dl>
                    <div className="rounded-md border border-border bg-surface-subtle p-3">
                      <p className="font-medium">Budget alignment</p>
                      <p className="text-muted-foreground">
                        {activity?.title ?? 'Project-level budget'} -{' '}
                        {budget?.category ?? 'Unknown'}
                        {budget
                          ? ` - allocated ${formatCurrency(Number(budget.plannedBudget))}`
                          : ''}
                      </p>
                    </div>
                    {expense.receiptEvidenceId ? (
                      can('evidence.read') ? (
                        <Button onClick={() => setPreview(expense)} size="sm" variant="outline">
                          Preview private receipt
                        </Button>
                      ) : (
                        <p className="text-muted-foreground">Receipt attached.</p>
                      )
                    ) : (
                      <p className="font-medium text-warning">
                        Receipt missing. Validation needs a private receipt.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <ProofPreviewDialog
        load={() =>
          fetchCoreArtifact(
            `/projects/${projectId}/finance/expenses/${preview?.id}/receipt`,
            `receipt-${preview?.receiptEvidenceId}.pdf`,
          )
        }
        onOpenChange={(open) => !open && setPreview(null)}
        open={preview !== null}
        save={saveCoreArtifact}
        title="Private receipt"
      />
      <ExpenseReviewDrawer
        action={review?.action ?? null}
        expense={review?.expense ?? null}
        onClose={() => setReview(null)}
        onDone={module.refresh}
        projectId={projectId}
      />
    </SectionCard>
  )
}
