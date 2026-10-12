import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

const activityBudgetCategory = 'ACTIVITY_PROFILE_TOTAL'

function activityBudgetValue(value: string) {
  try {
    return new Prisma.Decimal(value)
  } catch {
    throw new BadRequestException('Activity budget must be a valid non-negative PHP amount.')
  }
}

export async function saveActivityBudget(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityId: string,
  value: string | undefined,
  operation: 'create' | 'update',
) {
  if (value === undefined) return
  const canCreate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.create')
  const canUpdate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.update')
  if (!canCreate || (operation === 'update' && !canUpdate)) {
    throw new ForbiddenException('Activity budget authority is missing.')
  }
  const plannedBudget = activityBudgetValue(value)
  const current = await tx.projectBudgetRecord.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      activityId,
      category: activityBudgetCategory,
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
      activityId,
      category: activityBudgetCategory,
      currency: 'PHP',
      plannedBudget,
      remarks: 'Activity profile planned budget.',
      recordedById: actor.userId,
    },
  })
}
