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
  type AnalyticsTable,
  analyticsTableCsv,
  buildDescriptiveAnalytics,
  buildTimelineAnalytics,
  descriptiveAnalyticsTable,
  surveyAnalyticsTable,
  timelineAggregateSchema,
  timelineAnalyticsTable,
} from './descriptive-analytics'

import {
  ReportArtifactInputError,
  createReportArtifact,
  reportMime,
} from '../reports/report-artifact'

const logger = new Logger('AnalyticsService')

export function parseDescriptiveQuery(value: unknown): DescriptiveAnalyticsQuery {
  const parsed = descriptiveAnalyticsQuerySchema.safeParse(value)
  if (!parsed.success)
    throw new BadRequestException(
      'Descriptive analytics requires exactly one authorized project and an optional complete period.',
    )
  return parsed.data
}

const exportFormats = ['CSV', 'XLSX', 'XLS', 'PDF'] as const
type ExportFormat = (typeof exportFormats)[number]

/** Splits the optional file format off before the strict analytics query parse. */
export function parseExportFormat(input: unknown): { format: ExportFormat; query: unknown } {
  if (!input || typeof input !== 'object') return { format: 'CSV', query: input }
  const { format = 'CSV', ...query } = input as Record<string, unknown>
  if (!exportFormats.includes(format as ExportFormat))
    throw new BadRequestException('Export format must be CSV, XLSX, XLS or PDF.')
  return { format: format as ExportFormat, query }
}

async function exportArtifact(
  format: ExportFormat,
  title: string,
  table: AnalyticsTable,
  fileBase: string,
) {
  if (format === 'CSV')
    return {
      bytes: Buffer.from(analyticsTableCsv(table), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${fileBase}.csv`,
    }
  const rows = table.map((row) => row.map((cell) => (cell === null ? '' : String(cell))))
  try {
    return {
      bytes: await createReportArtifact(title, rows, format),
      contentType: reportMime[format],
      fileName: `${fileBase}.${format.toLowerCase()}`,
    }
  } catch (error) {
    if (error instanceof ReportArtifactInputError) throw new BadRequestException(error.message)
    throw error
  }
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
   * Every view (combined/kpi/participation/survey/timeline; read and export) reads
   * person-derived aggregates, so every one of them requires monitoring.read on top
   * of the route-level analytics permission. Centralized so a new view cannot ship
   * without this check.
   */
  private requireMonitoringRead(actor: ApplicationIdentity) {
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'monitoring.read'))
      throw new ForbiddenException('Monitoring aggregate permission is required.')
  }

  /**
   * Survey improvement has two paths (CR section 10, G-F9-10). Roles holding assessments.detail.read
   * read the live aggregate. Aggregate-only roles (Program Manager, Grant Manager) read only a closed
   * period from the frozen release table, so repeated reads of an open period cannot be differenced to
   * recover one person's scores. Any other role is refused with a 403 before a survey query runs. Like
   * requireMonitoringRead, a denial throws inside the authorized transaction, so it writes no audit row.
   */
  private surveyAccess(actor: ApplicationIdentity): 'live' | 'frozen' {
    const role = actor.roles[0]
    if (hasAtomicPermission(role, actor.permissions, 'assessments.detail.read')) return 'live'
    if (hasAtomicPermission(role, actor.permissions, 'analytics.descriptive.read')) return 'frozen'
    throw new ForbiddenException('Survey improvement is restricted for your role.')
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
      select: {
        id: true,
        status: true,
        archivedAt: true,
        startDate: true,
        endDate: true,
      },
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
  private async callAggregate(
    tx: Prisma.TransactionClient,
    query: Prisma.Sql,
    invalidRequestMessage?: string,
  ): Promise<unknown> {
    await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
    try {
      const result = await tx.$queryRaw<Array<{ data: unknown }>>(query)
      return result[0]?.data
    } catch (error) {
      // 22023 is the function's typed rejection of a request that breaks its input contract
      // (for survey: not exactly one non-overlapping defined reporting period). It is a
      // client error, not an availability fault.
      const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
      const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
      if (invalidRequestMessage && sqlCode === '22023')
        throw new BadRequestException(invalidRequestMessage)
      monitoringSqlError(error)
    }
  }

  /**
   * Paired pre/post survey improvement (analytics.descriptive.survey.v1). Results are released
   * only for exactly one of the project's defined, non-overlapping reporting periods (the
   * Indicator reporting periods the dashboard period picker offers), so
   * adjacent or custom ranges cannot be differenced to recover one person's scores. The
   * database function is the enforcing authority (22023 -> 400, no audit row, same as any
   * other validation failure); the API deliberately does not re-read Indicator rows because
   * roles that hold monitoring.read need not hold indicators.read. The
   * unsuppressed group aggregate comes from pathways.p10_f9_survey_aggregate, which
   * requires analytics.descriptive.read, monitoring.read and assessments.detail.read; aggregate-only
   * roles use p10_f9_survey_release (closed periods only, frozen copy), checked here and in the function. Assessment rows are never read here; threshold,
   * complementary suppression and cross-group withholding run in the shared calculator
   * before anything leaves this process.
   */
  private async computeSurvey(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
  ): Promise<SurveyAnalytics> {
    this.requireMonitoringRead(actor)
    const access = this.surveyAccess(actor)
    if (!query.periodStart || !query.periodEnd)
      throw new BadRequestException('Survey analytics requires a complete period.')
    const frozen = access === 'frozen'
    if (
      frozen &&
      query.periodEnd >=
        businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)
    )
      throw new BadRequestException(
        'Survey results for your role are released once the reporting period has closed.',
      )
    const project = await this.requireProject(tx, actor, query.projectId)
    const fn = frozen ? Prisma.raw('p10_f9_survey_release') : Prisma.raw('p10_f9_survey_aggregate')
    const raw = await this.callAggregate(
      tx,
      Prisma.sql`SELECT pathways.${fn}(${actor.organizationId}::uuid,${project.id}::uuid,${query.periodStart}::date,${query.periodEnd}::date) AS data`,
      'Survey analytics requires exactly one defined, non-overlapping, closed reporting period of this project.',
    )
    // The frozen release adds a state marker the aggregate contract does not carry.
    const {
      releaseState: _state,
      releasedAt: _at,
      ...rest
    } = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const aggregate = surveyAggregateSchema.safeParse(frozen ? rest : raw)
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
      logger.error({
        event: 'PATHWAYS_ANALYTICS_DESCRIPTIVE_RETRIEVAL_FAILED',
        reason:
          error instanceof ServiceUnavailableException
            ? 'CONTRACT_OR_DATABASE_UNAVAILABLE'
            : 'UNEXPECTED_FAULT',
      })
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
    const { format, query: rawQuery } = parseExportFormat(input)
    const query = parseDescriptiveQuery(rawQuery)
    return withAuthorizedOperation(this.prisma, identity, 'analytics.export', async (tx, actor) =>
      this.withRetrievalFaultMapping(() => this.runExport(tx, actor, query, format)),
    )
  }

  private async runExport(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DescriptiveAnalyticsQuery,
    format: ExportFormat,
  ) {
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.descriptive.read'))
      throw new ForbiddenException('Descriptive analytics permission is required.')
    if (query.view === 'survey') {
      const data = await this.computeSurvey(tx, actor, query)
      const table = surveyAnalyticsTable(data)
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
            format,
            view: 'survey',
            period: data.period,
            rowCount: data.byActivity.length + 1,
          },
        },
      })
      return exportArtifact(
        format,
        'Survey analytics',
        table,
        `survey-analytics-${data.projectId}-${data.period.periodEnd}`,
      )
    }
    if (query.view === 'timeline') {
      const data = await this.computeTimeline(tx, actor, query)
      const table = timelineAnalyticsTable(data)
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
            format,
            view: 'timeline',
            reportingDate: data.reportingDate,
            rowCount: 6,
          },
        },
      })
      return exportArtifact(
        format,
        'Timeline analytics',
        table,
        `timeline-analytics-${data.projectId}-${data.reportingDate}`,
      )
    }
    const data = await this.compute(tx, actor, query)
    const table = descriptiveAnalyticsTable(data)
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
          format,
          monitoringPeriod: data.monitoringPeriod,
          sadddReleaseState: data.sadddReleaseState,
          rowCount: data.counts.length + data.distributions.length,
        },
      },
    })
    return exportArtifact(
      format,
      'Descriptive analytics',
      table,
      `descriptive-analytics-${data.projectId}-${data.monitoringPeriod.periodEnd}`,
    )
  }
}
