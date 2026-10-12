import { businessCalendarDate, hasAtomicPermission } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { activityCapabilities } from './activities.helpers'
import { type ActivityReadMetrics, type ActivityRow, mapActivity } from './activities.mapper'

export async function readMetrics(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityIds: string[],
): Promise<ActivityReadMetrics> {
  const budgets = new Map<string, string>()
  const reached = new Map<string, number>()
  const logged = new Map<string, { total: string; entries: number }>()
  if (activityIds.length === 0) return { budgets, reached, logged }
  if (hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.read')) {
    // Every live budget line for the activity, not just its envelope row, so the detail
    // allocation matches the list utilization and the finance ledger. A replaced
    // (archived) line keeps its spend but no longer contributes a plan.
    const rows = await tx.projectBudgetRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        activityId: { in: activityIds },
        archivedAt: null,
      },
      select: { activityId: true, plannedBudget: true },
      take: 1000,
    })
    const planned = new Map<string, Prisma.Decimal>()
    for (const row of rows) {
      if (!row.activityId) continue
      planned.set(
        row.activityId,
        (planned.get(row.activityId) ?? new Prisma.Decimal(0)).add(row.plannedBudget),
      )
    }
    for (const [activityId, total] of planned) budgets.set(activityId, total.toFixed(2))
  }
  for (const [id, count] of await readReached(tx, actor, projectId, activityIds)) {
    reached.set(id, count)
  }
  // Same grant as GET /expenses; the expense SELECT policy also requires it per project.
  // Logged means APPROVED, as in the finance ledger and the overview budget metric.
  // Expenses on an archived (replaced) activity budget record still count. Only the
  // single-activity read calls this, so the loop is one aggregate query.
  if (hasAtomicPermission(actor.roles[0], actor.permissions, 'expenses.read')) {
    for (const activityId of activityIds) {
      const row = await tx.budgetExpenseEntry.aggregate({
        where: {
          organizationId: actor.organizationId,
          projectId,
          status: 'APPROVED',
          budgetRecord: { organizationId: actor.organizationId, projectId, activityId },
        },
        _sum: { amount: true },
        _count: { _all: true },
      })
      logged.set(activityId, {
        total: (row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        entries: row._count._all,
      })
    }
  }
  return { budgets, reached, logged }
}

/** APPROVED beneficiaries reached per activity; empty without beneficiaries.aggregates.read. */
export async function readReached(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityIds: string[],
) {
  const reached = new Map<string, number>()
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.aggregates.read')) {
    return reached
  }
  // Authorized callers see 0, not null, for activities with no approved sessions yet.
  for (const id of activityIds) reached.set(id, 0)
  // Sums APPROVED session counts; p08_activity_beneficiaries_reached runs as the owner, which
  // forced RLS on activity_updates hides, so it always returned 0.
  const rows = await tx.activityUpdate.groupBy({
    by: ['activityId'],
    where: {
      organizationId: actor.organizationId,
      projectId,
      activityId: { in: activityIds },
      status: 'APPROVED',
      activity: { status: { not: 'CANCELLED' }, archivedAt: null },
    },
    _sum: { beneficiariesReachedThisSession: true },
  })
  for (const row of rows) reached.set(row.activityId, row._sum.beneficiariesReachedThisSession ?? 0)
  return reached
}

/**
 * Batched list metrics: reached needs beneficiaries.aggregates.read; budget utilization
 * needs budgets.read AND expenses.read (approved spend over planned), else null.
 */
export async function readListMetrics(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityIds: string[],
) {
  const budgetUtilization = new Map<string, number | null>()
  if (activityIds.length === 0) return { reached: new Map<string, number>(), budgetUtilization }
  const reached = await readReached(tx, actor, projectId, activityIds)
  const can = (permission: 'budgets.read' | 'expenses.read') =>
    hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  if (can('budgets.read') && can('expenses.read')) {
    const records = await tx.projectBudgetRecord.findMany({
      where: { organizationId: actor.organizationId, projectId, activityId: { in: activityIds } },
      select: { id: true, activityId: true, plannedBudget: true, archivedAt: true },
      take: 1000,
    })
    const spend = await tx.budgetExpenseEntry.groupBy({
      by: ['budgetRecordId'],
      where: {
        organizationId: actor.organizationId,
        projectId,
        status: 'APPROVED',
        budgetRecordId: { in: records.map((record) => record.id) },
      },
      _sum: { amount: true },
    })
    const spendByRecord = new Map(
      spend.map((row) => [row.budgetRecordId, Number(row._sum.amount ?? 0)]),
    )
    const totals = new Map<string, { planned: number; used: number }>()
    for (const record of records) {
      if (!record.activityId) continue
      const total = totals.get(record.activityId) ?? { planned: 0, used: 0 }
      // Spend on an archived (replaced) record still counts, its plan does not.
      if (!record.archivedAt) total.planned += Number(record.plannedBudget)
      total.used += spendByRecord.get(record.id) ?? 0
      totals.set(record.activityId, total)
    }
    for (const [id, { planned, used }] of totals) {
      budgetUtilization.set(id, planned > 0 ? Math.round((used / planned) * 100) : null)
    }
  }
  return { reached, budgetUtilization }
}

export async function mapWithMetrics(
  tx: Tx,
  actor: ApplicationIdentity,
  row: ActivityRow & { _count?: { projectActivityAssignment_activity: number } },
  businessTimeZone: string,
) {
  const metrics = await readMetrics(tx, actor, row.projectId, [row.id])
  return {
    ...mapActivity(row, businessCalendarDate(new Date(), businessTimeZone), metrics, actor.userId),
    capabilities: activityCapabilities(
      actor,
      row.status,
      row._count?.projectActivityAssignment_activity,
    ),
  }
}
