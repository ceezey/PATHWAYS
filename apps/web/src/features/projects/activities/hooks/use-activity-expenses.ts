import { useMemo } from 'react'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { financeClient } from '@/lib/api/finance'
import type { Activity } from '@/types/pathways'

import { useBudgetsRead } from '../../budget/budget.reads'
import type { ExpenseBudgetReference } from '../../budget/components/activity-expense-dialog'
import type { PendingExpense } from '../../budget/components/activity-expense-review-dialog'
import type { ActivityExpenseEntry } from '../components/activity-detail-sections'

export const useActivityExpenses = ({
  canReadBudgetLines,
  canReadExpenseReferences,
  canReadExpenses,
  projectId,
  refetchDetail,
  selectedActivity,
}: {
  canReadBudgetLines: boolean
  canReadExpenseReferences: boolean
  canReadExpenses: boolean
  projectId: string
  refetchDetail: () => Promise<unknown>
  selectedActivity: Activity | null
}) => {
  // Fetched once per workspace visit rather than per activity: the panel filters the
  // project-scoped rows down to the currently open activity.
  const expenseReferencesRead = useAuthorizedRead(
    'activity-expense-references',
    projectId,
    'expenses.submit',
    (signal) => financeClient.budgetReferences(projectId, signal),
    canReadExpenseReferences,
    { freshness: 'summary' },
  )
  const expensesRead = useAuthorizedRead(
    'activity-expenses',
    projectId,
    'expenses.read',
    (signal) => financeClient.expenses(projectId, signal),
    canReadExpenses,
  )
  const budgetLinesRead = useBudgetsRead(projectId, canReadBudgetLines)
  const budgetReferences: ExpenseBudgetReference[] = expenseReferencesRead.data ?? []
  /**
   * Budget record to activity, from whichever read the principal is allowed. The reference
   * read needs expenses.submit, so an approver reaches the same linkage through budgets.read.
   */
  const activityOfBudgetRecord = useMemo(() => {
    const map = new Map<string, { activityId: string | null; category: string }>()
    for (const line of budgetLinesRead.data ?? [])
      map.set(line.id, { activityId: line.activityId, category: line.category })
    for (const reference of budgetReferences)
      map.set(reference.id, { activityId: reference.activityId, category: reference.category })
    return map
  }, [budgetLinesRead.data, budgetReferences])
  const pendingExpenses: PendingExpense[] = useMemo(() => {
    if (!selectedActivity) return []
    const referenceMap = new Map(budgetReferences.map((row) => [row.id, row]))
    return (expensesRead.data ?? [])
      .filter((expense) => expense.status === 'PENDING')
      .flatMap((expense) => {
        const reference = referenceMap.get(expense.budgetRecordId)
        if (!reference || reference.activityId !== selectedActivity.id) return []
        return [
          {
            id: expense.id,
            activityId: selectedActivity.id,
            projectId,
            amount: Number(expense.amount),
            category: reference.category,
            date: expense.expenseDate,
            description: expense.description,
            status: 'For Verification' as const,
            updatedAt: expense.updatedAt,
            receiptEvidenceId: expense.receiptEvidenceId,
          },
        ]
      })
  }, [expensesRead.data, budgetReferences, projectId, selectedActivity])
  /**
   * Every expense on this activity that has not been rejected, whatever its review step.
   * The panel used to show only PENDING entries and only to validators, so a logged expense
   * was invisible to its submitter and vanished from view the moment it was verified.
   */
  const activityExpenses: ActivityExpenseEntry[] = useMemo(() => {
    if (!selectedActivity) return []
    return (expensesRead.data ?? [])
      .filter((expense) => expense.status !== 'REJECTED')
      .flatMap((expense) => {
        const reference = activityOfBudgetRecord.get(expense.budgetRecordId)
        if (!reference || reference.activityId !== selectedActivity.id) return []
        return [
          {
            id: expense.id,
            amount: Number(expense.amount),
            category: reference.category,
            date: expense.expenseDate,
            description: expense.description,
            status: expense.status,
            submittedByName: expense.submittedByName,
            verifiedByName: expense.verifiedByName,
            approvedByName: expense.approvedByName,
          },
        ]
      })
  }, [expensesRead.data, activityOfBudgetRecord, selectedActivity])
  const refreshExpenses = () => {
    void expensesRead.refetch()
    void expenseReferencesRead.refetch()
    void budgetLinesRead.refetch()
    // Approved spend and allocation come from the activity read, so it refreshes with the
    // expense list; otherwise an approved expense leaves In review before it reaches Spent.
    void refetchDetail()
  }

  return { activityExpenses, budgetReferences, pendingExpenses, refreshExpenses }
}
