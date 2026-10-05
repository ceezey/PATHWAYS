import { Inject, Injectable, Logger } from '@nestjs/common'
import { PROJECT_MAP_CONTRACT_VERSION, type ProjectMap, projectMapSchema } from '@pathways/shared'

import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { DashboardsService } from '../dashboards/dashboards.service'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { resolvePlaces } from './ph-places'

const projectLimit = 100

/**
 * Coverage map of the caller's scoped projects. Each point is a bundled place centroid and
 * each overview reuses the Project Overview and SADDD services, so scope and suppression match.
 */
@Injectable()
export class ProjectMapService {
  private readonly logger = new Logger(ProjectMapService.name)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectOverviewMetricsService) private readonly overview: ProjectOverviewMetricsService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
  ) {}

  private async sadddSex(identity: ApplicationIdentity, projectId: string) {
    try {
      return (await this.dashboards.saddd(identity, { projectId })).sex
    } catch (error) {
      this.logger.warn(`SADDD breakdown unavailable for map point: ${(error as Error).name}`)
      return null
    }
  }

  async read(identity: ApplicationIdentity): Promise<ProjectMap> {
    const rows = await withAuthorizedOperation(
      this.prisma,
      identity,
      'projects.read',
      (tx, actor) =>
        tx.project.findMany({
          where: projectScope(actor),
          select: { id: true, code: true, title: true, status: true, implementationArea: true },
          orderBy: { title: 'asc' },
          take: projectLimit,
        }),
    )
    const located = rows
      .map((row) => ({ ...row, places: resolvePlaces(row.implementationArea) }))
      .filter((row) => row.places.length > 0)
    const projects = []
    // Sequential reads keep one pooled connection per request.
    for (const row of located) {
      const overview = await this.overview.read(identity, row.id).catch(() => null)
      const released = overview?.beneficiariesReached?.metric.state
      const sadddSex =
        released === 'AVAILABLE' || released === 'ZERO'
          ? await this.sadddSex(identity, row.id)
          : null
      projects.push({
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status,
        implementationArea: row.implementationArea ?? '',
        places: row.places,
        overview,
        sadddSex,
      })
    }
    return projectMapSchema.parse({
      contractVersion: PROJECT_MAP_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      projects,
      unmappedCount: rows.length - located.length,
    })
  }
}
