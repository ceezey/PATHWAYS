export type BudgetRow = {
  id: string
  activityId: string | null
  category: string
  plannedBudget: string
}
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
export const projectEnvelopeCategory = 'PROJECT_PROFILE_TOTAL'
// Stored envelope categories read as enum names, so the ledger shows these instead.
const categoryLabels: Record<string, string> = {
  PROJECT_PROFILE_TOTAL: 'Project budget',
  ACTIVITY_PROFILE_TOTAL: 'Activity budget',
}
// An activity envelope names its activity so the line is unambiguous outside the activity view.
export const categoryLabel = (category: string | null | undefined, activityTitle?: string) =>
  category === 'ACTIVITY_PROFILE_TOTAL' && activityTitle
    ? `Activity budget: ${activityTitle}`
    : category
      ? (categoryLabels[category] ?? category)
      : 'Unrecorded budget line'
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

/**
 * Only APPROVED expenses count as spending; PENDING and VERIFIED are shown as pending.
 * With a project envelope, the project-level row is the envelope minus activity allocations (negative if over-allocated), so row allocations sum to the envelope.
 */
export const buildActivityRows = (
  budgets: BudgetRow[],
  expenses: ExpenseRow[],
  activities: ActivityLabel[],
): ActivityBudgetRow[] => {
  const rows = new Map<string, ActivityBudgetRow>()
  const keyOf = new Map<string, string>()
  let envelope = 0
  let hasEnvelope = false
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
    if (budget.category === projectEnvelopeCategory) {
      hasEnvelope = true
      envelope += toNumber(budget.plannedBudget)
    } else row.allocated += toNumber(budget.plannedBudget)
    rows.set(key, row)
    keyOf.set(budget.id, key)
  }
  const project = rows.get(projectLevelKey)
  if (hasEnvelope && project) {
    let sub = 0
    for (const row of rows.values()) if (row.activityId) sub += row.allocated
    project.allocated = envelope - sub
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

// The project-level row has no activity code, so it is named by its title.
const rowLabel = (row: ActivityBudgetRow) => (row.activityId ? row.code : row.title)

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
        title: `Budget at ${row.utilization}% - ${rowLabel(row)}`,
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
      signal: `${rowLabel(row)} utilization is ${row.utilization}%`,
      suggestion: `Consider reviewing the plan or allocation for ${row.title}.`,
    }))

export type ActivityBudgetFigures = {
  /** Null means the viewer cannot read budgets, which is different from nothing allocated. */
  allocated: number | null
  /** Approved spending only, the same rule the ledger and the overview metric use. */
  spent: number | null
  /** Submitted and verified expenses awaiting approval. */
  pending: number | null
  remaining: number | null
  utilization: number | null
  readable: boolean
}

/**
 * One reading of an activity's money, so the activity panel, the ledger and the evidence
 * tab never disagree. Allocation counts every live budget line for the activity, and the
 * in-review total is summed from the expenses the caller already holds.
 */
export const activityBudgetFigures = (
  activity: { budgetAllocation?: number | null; budgetLogged?: number | null },
  pending: number | null = null,
): ActivityBudgetFigures => {
  const allocated = activity.budgetAllocation ?? null
  const spent = activity.budgetLogged ?? null
  return {
    allocated,
    spent,
    pending,
    remaining: allocated === null || spent === null ? null : allocated - spent,
    utilization: allocated !== null && spent !== null ? utilization(spent, allocated) : null,
    readable: allocated !== null || spent !== null,
  }
}
