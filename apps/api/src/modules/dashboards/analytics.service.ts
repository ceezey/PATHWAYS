import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type DescriptiveAnalytics,
  type DescriptiveAnalyticsQuery,
  type SurveyAnalytics,
  type TimelineAnalytics,
  businessCalendarDate,
  computeSurveyAnalyticsFromAggregates,
  descriptiveAnalyticsQuerySchema,
  surveyAggregateSchema,
  timelineAnalyticsSchema,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { monitoringSqlError } from '../indicators/indicators.service'
import { DashboardsService } from './dashboards.service'
import {
  buildDescriptiveAnalytics,
  buildTimelineAnalytics,
  descriptiveAnalyticsCsv,
  surveyAnalyticsCsv,
  timelineAggregateSchema,
  timelineAnalyticsCsv,
} from './descriptive-analytics'

const logger = new Logger('AnalyticsService')

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
  /**
   * Every view (combined/kpi/participation/survey/timeline; read and export) reads
   * person-derived aggregates, so every one of them requires monitoring.read on top
   * of the route-level analytics permission. Centralized so a new view cannot ship
   * without this check.
   */
  private requireMonitoringRead(actor: ApplicationIdentity) {
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'monitoring.read'))
      throw new ForbiddenException('Monitoring aggregate permission is required.')
  }

  private async compute(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ) {
    const role = actor.roles[0]
    this.requireMonitoringRead(actor)
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

  /** Confirms the requested project is in the actor's scope before any query runs. */
  private async requireProject(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
  ) {
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId }] },
      select: { id: true, status: true, archivedAt: true, startDate: true, endDate: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project
  }

  /**
   * Calls one trusted F9 aggregate function inside the caller's authorized transaction.
   * The function enforces org, permission and project scope itself (42501 -> 403) and
   * returns group aggregates only. A bounded statement timeout guards the aggregation;
   * a timeout or other database fault maps to the existing 503 path.
   */
  private async callAggregate(tx: Prisma.TransactionClient, query: Prisma.Sql): Promise<unknown> {
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    try {
      const result = await tx.$queryRaw<Array<{ data: unknown }>>(query)
      return result[0]?.data
    } catch (error) {
      monitoringSqlError(error)
    }
  }

  /**
   * Paired pre/post survey improvement (analytics.descriptive.survey.v1). The
   * unsuppressed group aggregate comes from pathways.p10_f9_survey_aggregate, which
   * every role with analytics.descriptive.read and monitoring.read may call without
   * holding assessment detail access. Assessment rows are never read here; threshold,
   * complementary suppression and cross-group withholding run in the shared calculator
   * before anything leaves this process.
   */
  private async computeSurvey(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ): Promise<SurveyAnalytics> {
    this.requireMonitoringRead(actor)
    if (!query.periodStart || !query.periodEnd)
      throw new BadRequestException('Survey analytics requires a complete period.')
    const project = await this.requireProject(tx, actor, query.projectId)
    const raw = await this.callAggregate(
      tx,
      Prisma.sql`SELECT pathways.p10_f9_survey_aggregate(${actor.organizationId}::uuid,${project.id}::uuid,${query.periodStart}::date,${query.periodEnd}::date) AS data`,
    )
    const aggregate = surveyAggregateSchema.safeParse(raw)
    if (!aggregate.success)
      throw new ServiceUnavailableException('Survey aggregate response contract is unavailable.')
    return computeSurveyAnalyticsFromAggregates({
      projectId: project.id,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
      generatedAt: new Date().toISOString(),
      aggregate: aggregate.data,
    })
  }

  /**
   * Timeline adherence (analytics.descriptive.timeline.v1). Project-level elapsed and
   * remaining days come from the project row every permitted role can read; activity
   * and milestone counts come from pathways.p10_f9_timeline_aggregate so roles without
   * activities.read still receive real counts. Rows are never read here.
   */
  private async computeTimeline(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ): Promise<TimelineAnalytics> {
    this.requireMonitoringRead(actor)
    const project = await this.requireProject(tx, actor, query.projectId)
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    const generatedAt = new Date().toISOString()
    const reportingDate = businessCalendarDate(new Date(), zone)
    const raw = await this.callAggregate(
      tx,
      Prisma.sql`SELECT pathways.p10_f9_timeline_aggregate(${actor.organizationId}::uuid,${project.id}::uuid,${reportingDate}::date) AS data`,
    )
    const aggregate = timelineAggregateSchema.safeParse(raw)
    if (!aggregate.success)
      throw new ServiceUnavailableException('Timeline aggregate response contract is unavailable.')
    // Parsed against the contract, same as every other view, instead of trusting the builder's shape.
    return timelineAnalyticsSchema.parse(
      buildTimelineAnalytics({
        projectId: project.id,
        organizationId: actor.organizationId,
        generatedAt,
        reportingDate,
        project: {
          status: project.status,
          archived: project.archivedAt !== null,
          startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
          endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : null,
        },
        aggregate: aggregate.data,
      }),
    )
  }

  private async recordViewedAudit(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
    query: DescriptiveAnalyticsQuery,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        actorUserId: actor.userId,
        action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
        entityType: 'Project',
        entityId: projectId,
        changes: {
          view: query.view ?? 'combined',
          periodStart: query.periodStart ?? null,
          periodEnd: query.periodEnd ?? null,
        },
      },
    })
  }

  async descriptive(identity: ApplicationIdentity, input: unknown) {
    const query = parseDescriptiveQuery(input)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'analytics.descriptive.read',
      (tx, actor) => this.dispatch(tx, actor, query),
    )
  }

  /**
   * Shared fault mapping for every read/export path: client errors are rethrown
   * as is, and any other (provider/database) fault is logged and reported as a
   * 503, never a 500 or a misleading 400. Used by both `dispatch` and `export` so
   * they cannot drift.
   */
  private async withRetrievalFaultMapping<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error
      if (error instanceof BadRequestException) throw error
      logger.error({ event: 'PATHWAYS_ANALYTICS_DESCRIPTIVE_RETRIEVAL_FAILED' })
      throw new ServiceUnavailableException('Descriptive analytics could not be retrieved.')
    }
  }

  /**
   * Routes to the requested view. `survey` and `timeline` compute their own
   * dedicated, suppressed contracts; every other value (including the absent
   * default) keeps the existing combined payload for backwards compatibility.
   * Every fetch is audited in the same transaction, including kpi/participation.
   */
  private async dispatch(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ) {
    return this.withRetrievalFaultMapping(async () => {
      const data: DescriptiveAnalytics | SurveyAnalytics | TimelineAnalytics =
        query.view === 'survey'
          ? await this.computeSurvey(tx, actor, query)
          : query.view === 'timeline'
            ? await this.computeTimeline(tx, actor, query)
            : await this.compute(tx, actor, query)
      await this.recordViewedAudit(tx, actor, query.projectId, query)
      return data
    })
  }

  async export(identity: ApplicationIdentity, input: unknown) {
    const query = parseDescriptiveQuery(input)
    return withAuthorizedOperation(this.prisma, identity, 'analytics.export', async (tx, actor) =>
      this.withRetrievalFaultMapping(() => this.runExport(tx, actor, query)),
    )
  }

  private async runExport(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ) {
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.descriptive.read'))
      throw new ForbiddenException('Descriptive analytics permission is required.')
    if (query.view === 'survey') {
      const data = await this.computeSurvey(tx, actor, query)
      const csv = surveyAnalyticsCsv(data)
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
            view: 'survey',
            period: data.period,
            rowCount: data.byActivity.length + 1,
          },
        },
      })
      return {
        bytes: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName: `survey-analytics-${data.projectId}-${data.period.periodEnd}.csv`,
      }
    }
    if (query.view === 'timeline') {
      const data = await this.computeTimeline(tx, actor, query)
      const csv = timelineAnalyticsCsv(data)
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
            view: 'timeline',
            reportingDate: data.reportingDate,
            rowCount: 6,
          },
        },
      })
      return {
        bytes: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName: `timeline-analytics-${data.projectId}-${data.reportingDate}.csv`,
      }
    }
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
  }
}
