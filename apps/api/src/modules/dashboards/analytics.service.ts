import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import {
  type DescriptiveAnalyticsQuery,
  businessCalendarDate,
  descriptiveAnalyticsQuerySchema,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { DashboardsService } from './dashboards.service'
import { buildDescriptiveAnalytics, descriptiveAnalyticsCsv } from './descriptive-analytics'

export function parseDescriptiveQuery(value: unknown): DescriptiveAnalyticsQuery {
  const parsed = descriptiveAnalyticsQuerySchema.safeParse(value)
  if (!parsed.success)
    throw new BadRequestException(
      'Descriptive analytics requires exactly one authorized project and an optional complete period.',
    )
  return parsed.data
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
  ) {}

  /**
   * Mirrors the p06_saddd V1 preconditions (fixed, valid, closed project period)
   * so an open project omits SADDD instead of aborting the whole transaction.
   * The database release function remains the enforcing authority.
   */
  private async sadddReleasable(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    period: { businessTimeZone: string },
  ) {
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId }] },
      select: { startDate: true, endDate: true },
    })
    if (!project?.startDate || !project.endDate || project.endDate < project.startDate) return false
    const end = project.endDate.toISOString().slice(0, 10)
    return end < businessCalendarDate(new Date(), period.businessTimeZone)
  }

  /**
   * Reuses the dashboard aggregate contracts inside the caller's authorized
   * transaction. Project scope is resolved by the dashboard scope query before
   * any aggregate is read; SADDD comes only from the suppressed p06_saddd release.
   */
  private async compute(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ) {
    const role = actor.roles[0]
    if (!hasAtomicPermission(role, actor.permissions, 'monitoring.read'))
      throw new ForbiddenException('Monitoring aggregate permission is required.')
    const monitoringQuery = {
      projectId: query.projectId,
      ...(query.periodStart && query.periodEnd
        ? { periodStart: query.periodStart, periodEnd: query.periodEnd }
        : {}),
    }
    const period = this.dashboards.monitoringPeriod(monitoringQuery)
    const monitoring = await this.dashboards.monitoringInTransaction(
      tx,
      actor,
      monitoringQuery,
      period,
    )
    const sadddAllowed =
      hasAtomicPermission(role, actor.permissions, 'analytics.saddd.read') &&
      hasAtomicPermission(role, actor.permissions, 'beneficiaries.aggregates.read')
    const saddd =
      sadddAllowed && (await this.sadddReleasable(tx, actor, query.projectId, period))
        ? await this.dashboards.sadddInTransaction(tx, actor, query.projectId)
        : null
    return buildDescriptiveAnalytics({
      projectId: query.projectId,
      monitoring,
      saddd,
      generatedAt: new Date().toISOString(),
    })
  }

  async descriptive(identity: ApplicationIdentity, input: unknown) {
    const query = parseDescriptiveQuery(input)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'analytics.descriptive.read',
      (tx, actor) => this.compute(tx, actor, query),
    )
  }

  async export(identity: ApplicationIdentity, input: unknown) {
    const query = parseDescriptiveQuery(input)
    return withAuthorizedOperation(this.prisma, identity, 'analytics.export', async (tx, actor) => {
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.descriptive.read'))
        throw new ForbiddenException('Descriptive analytics permission is required.')
      const data = await this.compute(tx, actor, query)
      const csv = descriptiveAnalyticsCsv(data)
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          projectId: data.projectId,
          actorUserId: actor.userId,
          action: 'ANALYTICS_DESCRIPTIVE_EXPORTED',
          entityType: 'Project',
          entityId: data.projectId,
          changes: {
            contractVersion: data.contractVersion,
            format: 'CSV',
            monitoringPeriod: data.monitoringPeriod,
            sadddReleaseState: data.sadddReleaseState,
            rowCount: data.counts.length + data.distributions.length,
          },
        },
      })
      return {
        bytes: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName: `descriptive-analytics-${data.projectId}-${data.monitoringPeriod.periodEnd}.csv`,
      }
    })
  }
}
