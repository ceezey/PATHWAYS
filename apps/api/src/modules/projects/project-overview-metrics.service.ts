import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type MetricCell,
  PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION,
  businessCalendarDate,
  efficiencyRatio,
  kpiAchievement,
  missingMetric,
  projectOverviewMetricsSchema,
  timelineProgress,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import { DashboardsService } from '../dashboards/dashboards.service'
import { suppressSmallCount } from '../dashboards/descriptive-analytics'
import { IndicatorsService } from '../indicators/indicators.service'
import { readProjectBudget } from './project-budget'

type Tx = Prisma.TransactionClient
/** The p06_saddd V1 release accepts only this business calendar. */
const sadddReleaseTimeZone = 'Asia/Manila'

/**
 * Overview tiles for one scoped project. Each section is computed only when the viewer
 * holds the permission of its source; otherwise it is `null`, never a zero.
 */
@Injectable()
export class ProjectOverviewMetricsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
  ) {}

  private async kpi(tx: Tx, actor: ApplicationIdentity, projectId: string, definitions: boolean) {
    const rows = definitions
      ? await this.indicators.readInTransaction(tx, actor, [projectId])
      : await this.indicators.readReleasedInTransaction(tx, actor, [projectId])
    return kpiAchievement(rows.map((row) => row.progress))
  }

  /**
   * Distinct individuals from the SADDD release (live to date once the project has started),
   * with the RFC small-cell rule applied: counts 1-4 are suppressed, 0 and 5+ stay visible.
   * Preconditions mirror p06_saddd so a not-started project reports "not started" instead of
   * aborting the transaction; the database release function remains the authority.
   */
  private async reached(
    tx: Tx,
    actor: ApplicationIdentity,
    project: { id: string; startDate: string | null; endDate: string | null },
    businessDate: string,
    zone: string,
  ): Promise<MetricCell> {
    if (!project.startDate || !project.endDate || project.endDate < project.startDate)
      return missingMetric('PROJECT_DATES_REQUIRED')
    if (project.startDate > businessDate) return missingMetric('NOT_STARTED')
    if (zone !== sadddReleaseTimeZone) return missingMetric('RELEASE_UNAVAILABLE')
    const saddd = await this.dashboards.sadddInTransaction(tx, actor, project.id)
    return suppressSmallCount(saddd.total)
  }

  read(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.read', (tx, actor) =>
      this.readInTransaction(tx, actor, projectId),
    )
  }

  /** Reads the overview inside an already-authorized transaction; each field keeps its own gate. */
  async readInTransaction(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const row = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true, startDate: true, endDate: true, targetBeneficiaries: true },
    })
    if (!row) throw new NotFoundException('Project unavailable.')
    const can = (permission: AtomicPermission) =>
      hasAtomicPermission(actor.roles[0], actor.permissions, permission)
    const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
    let businessDate: string
    try {
      businessDate = businessCalendarDate(new Date(), zone)
    } catch {
      throw new ServiceUnavailableException('The configured business time zone is invalid.')
    }
    const project = {
      id: row.id,
      startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    }
    // The database also requires monitoring.read, plus reports.indicator.read for released values.
    const kpi =
      can('monitoring.read') && (can('indicators.read') || can('reports.indicator.read'))
        ? await this.kpi(tx, actor, row.id, can('indicators.read'))
        : null
    // Spending totals are expense data, so both finance reads are required.
    const budget =
      can('budgets.read') && can('expenses.read')
        ? await readProjectBudget(tx, actor.organizationId, row.id)
        : null
    const reached =
      can('beneficiaries.aggregates.read') && can('analytics.saddd.read')
        ? {
            metric: await this.reached(tx, actor, project, businessDate, zone),
            target: row.targetBeneficiaries ?? null,
          }
        : null
    const parsed = projectOverviewMetricsSchema.safeParse({
      contractVersion: PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION,
      projectId: row.id,
      businessDate,
      generatedAt: new Date().toISOString(),
      kpiAchievement: kpi,
      budgetUtilization: budget,
      efficiencyRatio: kpi && budget ? efficiencyRatio(kpi.metric, budget.metric) : null,
      beneficiariesReached: reached,
      timeline: {
        metric: timelineProgress(project.startDate, project.endDate, businessDate),
        startDate: project.startDate,
        endDate: project.endDate,
      },
    })
    if (!parsed.success)
      throw new ServiceUnavailableException('Project overview contract is unavailable.')
    return parsed.data
  }
}
