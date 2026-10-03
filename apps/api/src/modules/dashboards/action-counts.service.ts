import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION,
  type DashboardActionCounts,
  businessCalendarDate,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { RulesHumanService } from '../rules/rules-human.service'

const alertPageLimit = 100
const alertMaxPages = 10
const dayMs = 86_400_000

type Tx = Prisma.TransactionClient

/** KPI counts for the dashboard header; each runs only when the viewer holds its permission. */
@Injectable()
export class ActionCountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RulesHumanService) private readonly rules: RulesHumanService,
  ) {}

  private businessDate() {
    try {
      return businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
  }

  private pendingApprovals(
    tx: Tx,
    actor: ApplicationIdentity,
    can: (p: AtomicPermission) => boolean,
  ) {
    const status = [
      ...(can('expenses.verify') ? (['PENDING'] as const) : []),
      ...(can('expenses.approve') ? (['VERIFIED'] as const) : []),
    ]
    if (!status.length) return Promise.resolve(null)
    return tx.budgetExpenseEntry.count({
      where: {
        organizationId: actor.organizationId,
        project: projectScope(actor),
        status: { in: status },
        // The review function refuses self-review, so own submissions and own verifications are not actionable.
        submittedById: { not: actor.userId },
        NOT: { status: 'VERIFIED', verifiedById: actor.userId },
      },
    })
  }

  private async overdueActivities(tx: Tx, actor: ApplicationIdentity, businessDate: string) {
    // Same rule as activityPresentationStatus: planned end before today and not closed.
    const today = new Date(`${businessDate}T00:00:00.000Z`)
    const where = {
      organizationId: actor.organizationId,
      archivedAt: null,
      project: projectScope(actor),
      plannedEndDate: { lt: today },
      status: { notIn: ['COMPLETED', 'CANCELLED'] as Array<'COMPLETED' | 'CANCELLED'> },
    }
    const [count, oldest] = await Promise.all([
      tx.projectActivity.count({ where }),
      tx.projectActivity.findFirst({
        where,
        select: { code: true, plannedEndDate: true },
        orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
      }),
    ])
    const mostOverdue = oldest?.plannedEndDate
      ? {
          code: oldest.code,
          daysLate: Math.round((today.valueOf() - oldest.plannedEndDate.valueOf()) / dayMs),
        }
      : null
    return { count, mostOverdue }
  }

  private forReview(tx: Tx, actor: ApplicationIdentity) {
    // Awaiting review matches the review queue: submitted updates whose proof upload is complete.
    return tx.activityUpdate.count({
      where: {
        organizationId: actor.organizationId,
        project: projectScope(actor),
        status: 'PENDING',
        evidenceMedia_update: { none: { storageReady: false } },
      },
    })
  }

  /** Alert lifecycle lives behind the rules read routines, which enforce project scope. */
  private async activeAlerts(identity: ApplicationIdentity) {
    let count = 0
    let capped = false
    for (const status of ['NEW', 'REVIEWED'] as const) {
      let cursor: string | undefined
      for (let page = 0; ; page += 1) {
        if (page === alertMaxPages) {
          capped = true
          break
        }
        const result = await this.rules.listAlerts(identity, {
          status,
          limit: String(alertPageLimit),
          ...(cursor ? { cursor } : {}),
        })
        count += result.items.length
        if (!result.nextCursor) break
        cursor = result.nextCursor
      }
    }
    return { count, capped }
  }

  async read(identity: ApplicationIdentity): Promise<DashboardActionCounts> {
    const businessDate = this.businessDate()
    const db = await withAuthorizedOperation(
      this.prisma,
      identity,
      'projects.read',
      async (tx, actor) => {
        const can = (permission: AtomicPermission) =>
          hasAtomicPermission(actor.roles[0], actor.permissions, permission)
        return {
          actor,
          pendingApprovals: await this.pendingApprovals(tx, actor, can),
          overdueActivities: can('activities.read')
            ? await this.overdueActivities(tx, actor, businessDate)
            : null,
          forReview: can('evidence.review') ? await this.forReview(tx, actor) : null,
        }
      },
    )
    const { actor, ...counts } = db
    const canAlerts = hasAtomicPermission(actor.roles[0], actor.permissions, 'alerts.read')
    return {
      contractVersion: DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION,
      businessDate,
      ...counts,
      activeAlerts: canAlerts ? await this.activeAlerts(actor) : null,
    }
  }
}
