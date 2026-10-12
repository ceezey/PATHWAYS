import { budgetUtilization, missingMetric } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'

/** Planned project budget, approved spending and the utilization metric derived from them. */
export async function readProjectBudget(tx: Prisma.TransactionClient, orgId: string, id: string) {
  const planned = await tx.projectBudgetRecord.findFirst({
    where: {
      organizationId: orgId,
      projectId: id,
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { plannedBudget: true },
  })
  const spent = await tx.budgetExpenseEntry.aggregate({
    where: { organizationId: orgId, projectId: id, status: 'APPROVED' },
    _sum: { amount: true },
  })
  const approvedBudget = planned ? planned.plannedBudget.toFixed(2) : null
  const countableSpending = (spent._sum.amount ?? 0).toFixed(2)
  try {
    return {
      metric: budgetUtilization(approvedBudget, countableSpending),
      approvedBudget,
      countableSpending,
    }
  } catch {
    return { metric: missingMetric('OUT_OF_RANGE'), approvedBudget, countableSpending }
  }
}
