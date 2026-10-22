import { Inject, Injectable, Logger } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  PROJECT_MAP_CONTRACT_VERSION,
  type ProjectMap,
  type ProjectMapPlace,
  numericMetric,
  projectMapSchema,
} from '@pathways/shared'
import { z } from 'zod'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { PrismaService } from '../../prisma/prisma.service'
import { DashboardsService } from '../dashboards/dashboards.service'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { type ResolvedPlace, resolvePlaces } from './ph-places'

const projectLimit = 100

const townReachSchema = z.array(
  z.object({
    town: z.string().nullable(),
    province: z.string().nullable(),
    total: z.number().int().min(0),
    sex: z.array(z.object({ key: z.string(), label: z.string(), n: z.number().int().min(0) })),
  }),
)
type TownReach = z.infer<typeof townReachSchema>

/** Sums the towns that resolve to this place; a town naming no known place reaches no pin. */
export function placeReach(place: ResolvedPlace, towns: TownReach): ProjectMapPlace['reach'] {
  const here = towns.filter((row) =>
    resolvePlaces([row.town, row.province].filter(Boolean).join(', ')).some(
      (resolved) => resolved.name === place.name && resolved.province === place.province,
    ),
  )
  const sex = new Map<string, { label: string; n: number }>()
  for (const row of here)
    for (const bucket of row.sex)
      sex.set(bucket.key, { label: bucket.label, n: (sex.get(bucket.key)?.n ?? 0) + bucket.n })
  return {
    total: numericMetric(String(here.reduce((sum, row) => sum + row.total, 0))),
    sex: [...sex].map(([key, { label, n }]) => ({ key, label, metric: numericMetric(String(n)) })),
  }
}

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

  private async townReach(identity: ApplicationIdentity, projectId: string) {
    try {
      const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
      const rows = await withAuthorizedOperation(
        this.prisma,
        identity,
        'analytics.saddd.read',
        (tx, actor) =>
          tx.$queryRaw<Array<{ data: unknown }>>`
            SELECT pathways.p06_saddd_by_place(${actor.organizationId}::uuid, ${projectId}::uuid, ${zone}) AS data`,
      )
      return townReachSchema.parse(rows[0]?.data ?? [])
    } catch (error) {
      this.logger.warn(`Place reach unavailable for map point: ${(error as Error).name}`)
      return null
    }
  }

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
      const releasedReach = released === 'AVAILABLE' || released === 'ZERO'
      const sadddSex = releasedReach ? await this.sadddSex(identity, row.id) : null
      const towns = releasedReach ? await this.townReach(identity, row.id) : null
      projects.push({
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status,
        implementationArea: row.implementationArea ?? '',
        places: row.places.map((place) => ({
          ...place,
          reach: towns ? placeReach(place, towns) : null,
        })),
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
