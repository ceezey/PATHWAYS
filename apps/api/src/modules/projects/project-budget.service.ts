import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { budgetUtilization, hasAtomicPermission, missingMetric } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'

/** Planned project budget, approved spending and the utilization metric derived from them. */
export async function readProjectBudget(tx: Tx, orgId: string, id: string) {
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

function projectBudgetValue(value: string) {
  try {
    return new Prisma.Decimal(value)
  } catch {
    throw new BadRequestException('Project budget must be a valid non-negative PHP amount.')
  }
}

export async function readProjectBudgets(tx: Tx, actor: ApplicationIdentity, projectIds: string[]) {
  const values = new Map<string, string>()
  if (
    projectIds.length === 0 ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.read')
  ) {
    return values
  }
  const rows = await tx.projectBudgetRecord.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: { in: projectIds },
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { projectId: true, plannedBudget: true },
    take: 100,
  })
  for (const row of rows) values.set(row.projectId, row.plannedBudget.toFixed(2))
  return values
}

export async function saveProjectBudget(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  value: string | undefined,
  operation: 'create' | 'update',
) {
  if (value === undefined) return
  const canCreate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.create')
  const canUpdate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.update')
  if (!canCreate || (operation === 'update' && !canUpdate)) {
    throw new ForbiddenException('Project budget authority is missing.')
  }
  const plannedBudget = projectBudgetValue(value)
  const current = await tx.projectBudgetRecord.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { id: true, plannedBudget: true },
  })
  if (current?.plannedBudget.equals(plannedBudget)) return
  if (current) {
    await tx.projectBudgetRecord.update({
      where: { id: current.id },
      data: { archivedAt: new Date() },
    })
  }
  await tx.projectBudgetRecord.create({
    data: {
      organizationId: actor.organizationId,
      projectId,
      category: projectBudgetCategory,
      currency: 'PHP',
      plannedBudget,
      remarks: 'Project profile planned budget.',
      recordedById: actor.userId,
    },
  })
}
