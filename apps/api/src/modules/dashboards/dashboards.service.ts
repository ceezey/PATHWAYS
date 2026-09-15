import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { IndicatorsService, monitoringSqlError } from '@app/modules/indicators/indicators.service'
import { PrismaService } from '@app/prisma/prisma.service'
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type DashboardQuery,
  P06_CONTRACT_VERSION,
  businessCalendarDate,
  monitoringDashboardSchema,
  sadddDashboardSchema,
  validateMetricPeriod,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { parseDashboardQuery } from './dashboards.dto'

@Injectable()
export class DashboardsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,
  ) {}
  private period(query: DashboardQuery) {
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    let today: string
    try {
      today = businessCalendarDate(new Date(), zone)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
    const periodEnd = query.periodEnd ?? today
    const periodStart = query.periodStart ?? `${periodEnd.slice(0, 7)}-01`
    try {
      validateMetricPeriod(periodStart, periodEnd)
    } catch {
      throw new BadRequestException('Invalid monitoring period.')
    }
    return { periodStart, periodEnd, businessTimeZone: zone }
  }
  private async scope(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    query: DashboardQuery,
  ) {
    const projects = await tx.project.findMany({
      where: {
        AND: [
          projectScope(actor),
          ...(query.projectId ? [{ id: query.projectId }] : []),
          ...(query.programId ? [{ programId: query.programId }] : []),
        ],
      },
      select: { id: true, code: true, title: true },
      orderBy: { id: 'asc' },
      take: 101,
    })
    if (projects.length > 100)
      throw new BadRequestException(
        'More than 100 projects match; select a program or one project.',
      )
    if ((query.projectId || query.programId) && projects.length === 0)
      throw new NotFoundException('Monitoring scope unavailable.')
    return projects
  }
  async monitoring(identity: ApplicationIdentity, input: unknown) {
    const query = parseDashboardQuery(input)
    const period = this.period(query)
    return withAuthorizedOperation(this.prisma, identity, 'analytics.read', async (tx, actor) => {
      const projects = await this.scope(tx, actor, query)
      await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
      let result: Array<{ data: unknown }>
      try {
        result = await tx.$queryRaw<Array<{ data: unknown }>>(
          Prisma.sql`SELECT pathways.p06_monitoring(${actor.organizationId}::uuid,ARRAY[${Prisma.join(projects.length ? projects.map((project) => Prisma.sql`${project.id}::uuid`) : [Prisma.empty])}]::uuid[],${period.periodStart}::date,${period.periodEnd}::date,${period.businessTimeZone}) AS data`,
        )
      } catch (error) {
        monitoringSqlError(error)
      }
      const allowed = hasAtomicPermission(actor.roles[0], actor.permissions, 'monitoring.read')
      const indicators = allowed
        ? await this.indicators.readInTransaction(
            tx,
            actor,
            projects.map((project) => project.id),
            period,
          )
        : []
      const raw = result[0]?.data
      const parsed = monitoringDashboardSchema.safeParse({
        ...(raw && typeof raw === 'object' ? raw : {}),
        ...period,
        projects,
        scopeProjectCount: projects.length,
        indicators,
        indicatorNote: allowed
          ? 'Indicator comparisons use definitions whose reporting period exactly matches this filter. Different units are not averaged into a KPI score.'
          : 'Indicator definitions require monitoring.read; this role receives aggregate monitoring only.',
        generatedAt: new Date().toISOString(),
        contractVersion: P06_CONTRACT_VERSION,
        refresh: 'READ_TIME_NO_CACHE',
      })
      if (!parsed.success)
        throw new ServiceUnavailableException('Monitoring response contract is unavailable.')
      return parsed.data
    })
  }
  async saddd(identity: ApplicationIdentity, input: unknown) {
    const query = parseDashboardQuery(input)
    const period = this.period(query)
    return withAuthorizedOperation(this.prisma, identity, 'analytics.read', async (tx, actor) => {
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.aggregates.read'))
        throw new ForbiddenException('SADDD aggregate permission is required.')
      const projects = await this.scope(tx, actor, query)
      await tx.$queryRaw`SELECT set_config('statement_timeout','3000',true)`
      let result: Array<{ data: unknown }>
      try {
        result = await tx.$queryRaw<Array<{ data: unknown }>>(
          Prisma.sql`SELECT pathways.p06_saddd(${actor.organizationId}::uuid,ARRAY[${Prisma.join(projects.length ? projects.map((project) => Prisma.sql`${project.id}::uuid`) : [Prisma.empty])}]::uuid[],${period.periodStart}::date,${period.periodEnd}::date,${period.businessTimeZone}) AS data`,
        )
      } catch (error) {
        monitoringSqlError(error)
      }
      const raw = result[0]?.data
      const parsed = sadddDashboardSchema.safeParse({
        ...(raw && typeof raw === 'object' ? raw : {}),
        ...period,
        generatedAt: new Date().toISOString(),
        contractVersion: P06_CONTRACT_VERSION,
        refresh: 'READ_TIME_NO_CACHE',
        population: 'DISTINCT_INDIVIDUALS_WITH_OVERLAPPING_ENROLLMENT',
        demographicBasis: 'CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT',
        privacy: {
          threshold: 5,
          complementarySuppression: true,
          policy: 'G4_CALCULATION_RELEASE_PENDING',
          crossFilters: 'UNAVAILABLE_PENDING_POLICY',
        },
      })
      if (!parsed.success)
        throw new ServiceUnavailableException('SADDD response contract is unavailable.')
      return parsed.data
    })
  }
}
