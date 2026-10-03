export type BudgetRow = { id: string; activityId: string | null; plannedBudget: string }
export type ExpenseRow = {
  id: string
  budgetRecordId: string
  amount: string
  status: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED'
  receiptEvidenceId: string | null
}
export type ActivityLabel = { id: string; code?: string | null; title: string }
export type Tone = 'info' | 'success' | 'warning' | 'danger'

export type ActivityBudgetRow = {
  key: string
  activityId: string | null
  code: string
  title: string
  allocated: number
  used: number
  pending: number
  utilization: number | null
}
export type BudgetAlert = {
  id: string
  tone: 'warning' | 'danger'
  title: string
  consequence: string
  activityKey: string | null
}

export const projectLevelKey = 'project-level'
// Visual thresholds only; they never block or change any record.
export const DANGER_PCT = 90
export const WARN_PCT = 70
export const LOW_REMAINING_PCT = 15

export const toNumber = (value: string | null | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const utilization = (used: number, allocated: number) =>
  allocated > 0 ? Math.round((used / allocated) * 100) : null

export const remaining = (allocated: number, used: number) => allocated - used

export const toneFor = (pct: number | null): Tone =>
  pct === null ? 'info' : pct >= DANGER_PCT ? 'danger' : pct >= WARN_PCT ? 'warning' : 'success'

/** Only APPROVED expenses count as spending; PENDING and VERIFIED are shown as pending. */
export const buildActivityRows = (
  budgets: BudgetRow[],
  expenses: ExpenseRow[],
  activities: ActivityLabel[],
): ActivityBudgetRow[] => {
  const rows = new Map<string, ActivityBudgetRow>()
  const keyOf = new Map<string, string>()
  for (const budget of budgets) {
    const key = budget.activityId ?? projectLevelKey
    const activity = activities.find((item) => item.id === budget.activityId)
    const row = rows.get(key) ?? {
      key,
      activityId: budget.activityId,
      code: activity?.code ?? '-',
      title: budget.activityId ? (activity?.title ?? 'Activity') : 'Project-level budget',
      allocated: 0,
      used: 0,
      pending: 0,
      utilization: null,
    }
    row.allocated += toNumber(budget.plannedBudget)
    rows.set(key, row)
    keyOf.set(budget.id, key)
  }
  for (const expense of expenses) {
    const row = rows.get(keyOf.get(expense.budgetRecordId) ?? '')
    if (!row) continue
    if (expense.status === 'APPROVED') row.used += toNumber(expense.amount)
    else if (expense.status !== 'REJECTED') row.pending += toNumber(expense.amount)
  }
  for (const row of rows.values()) row.utilization = utilization(row.used, row.allocated)
  return [...rows.values()]
}

export const deriveAlerts = (
  rows: ActivityBudgetRow[],
  expenses: ExpenseRow[],
  totalAllocated: number,
  totalUsed: number,
): BudgetAlert[] => {
  const alerts: BudgetAlert[] = []
  for (const row of rows) {
    if (row.utilization !== null && row.utilization >= DANGER_PCT)
      alerts.push({
        id: `high-${row.key}`,
        tone: 'danger',
        title: `Budget at ${row.utilization}% - ${row.code}`,
        consequence: `${row.title} is close to its allocation; further approved expenses may exceed it.`,
        activityKey: row.key,
      })
  }
  const left = remaining(totalAllocated, totalUsed)
  if (totalAllocated > 0 && (left / totalAllocated) * 100 < LOW_REMAINING_PCT)
    alerts.push({
      id: 'low-remaining',
      tone: 'warning',
      title: `Remaining budget below ${LOW_REMAINING_PCT}%`,
      consequence: 'Little of the project budget is left for upcoming activities.',
      activityKey: null,
    })
  const unreceipted = expenses.filter((e) => e.status === 'PENDING' && !e.receiptEvidenceId)
  if (unreceipted.length)
    alerts.push({
      id: 'missing-receipt',
      tone: 'warning',
      title: `${unreceipted.length} pending expense${unreceipted.length === 1 ? '' : 's'} without a receipt`,
      consequence: 'These expenses cannot be validated until a private receipt is attached.',
      activityKey: null,
    })
  return alerts
}

/** Advisory suggestions only; nothing here is ever applied automatically. */
export const deriveRecommendations = (rows: ActivityBudgetRow[]) =>
  rows
    .filter((row) => row.utilization !== null && row.utilization >= DANGER_PCT)
    .map((row) => ({
      id: `plan-${row.key}`,
      activityKey: row.key,
      signal: `${row.code} utilization is ${row.utilization}%`,
      suggestion: `Consider reviewing the plan or allocation for ${row.title}.`,
    }))
