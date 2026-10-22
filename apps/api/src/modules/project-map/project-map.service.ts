import { Inject, Injectable, Logger } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  PROJECT_MAP_CONTRACT_VERSION,
  type ProjectMap,
  type ProjectMapPlace,
  missingMetric,
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

// One row per recorded town; a project never spans more than the country's cities and municipalities.
const townReachSchema = z
  .array(
    z.object({
      town: z.string().nullable(),
      province: z.string().nullable(),
      total: z.number().int().min(0),
      disability: z.number().int().min(0),
      sex: z.array(z.object({ key: z.string(), label: z.string(), n: z.number().int().min(0) })),
    }),
  )
  .max(2000)
type TownReach = z.infer<typeof townReachSchema>
type ResolvedTown = { row: TownReach[number]; places: ResolvedPlace[] }

/** Resolves each recorded town once per project; a town naming no known place resolves to none. */
export const resolveTowns = (towns: TownReach): ResolvedTown[] =>
  towns.map((row) => ({
    row,
    places: resolvePlaces([row.town, row.province].filter(Boolean).join(', ')),
  }))

// Province centroids carry the province as their name; no bundled city shares its province's name.
const isProvince = (place: ResolvedPlace) => place.name === place.province

/**
 * Sums the towns at this pin: a city pin by name and province, a province pin by every town in that province. With no
 * match the pin is a measured zero only when no recorded town could belong to it; otherwise the count is missing.
 */
export function placeReach(place: ResolvedPlace, towns: ResolvedTown[]): ProjectMapPlace['reach'] {
  const here = towns
    .filter(({ places }) =>
      places.some((resolved) =>
        isProvince(place)
          ? resolved.province === place.province
          : resolved.name === place.name && resolved.province === place.province,
      ),
    )
    .map(({ row }) => row)
  const unknown = towns.some(
    ({ places }) =>
      places.length === 0 ||
      (!isProvince(place) &&
        places.every(isProvince) &&
        places.some((resolved) => resolved.province === place.province)),
  )
  if (here.length === 0 && unknown) {
    const missing = missingMetric('NO_RESIDENCE_MATCH')
    return { total: missing, sex: [], disability: missing }
  }
  const sex = new Map<string, { label: string; n: number }>()
  for (const row of here)
    for (const bucket of row.sex)
      sex.set(bucket.key, { label: bucket.label, n: (sex.get(bucket.key)?.n ?? 0) + bucket.n })
  const sum = (pick: (row: TownReach[number]) => number) =>
    numericMetric(String(here.reduce((total, row) => total + pick(row), 0)))
  return {
    total: sum((row) => row.total),
    sex: [...sex].map(([key, { label, n }]) => ({ key, label, metric: numericMetric(String(n)) })),
    disability: sum((row) => row.disability),
  }
}

/**
 * Coverage map of the caller's scoped projects. Each point is a bundled place centroid and
 * each overview reuses the Project Overview and SADDD services, so scope and release rules match.
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
      return resolveTowns(townReachSchema.parse(rows[0]?.data ?? []))
    } catch (error) {
      this.logger.warn(`Place reach unavailable for map point: ${(error as Error).name}`)
      return null
    }
  }

  private async saddd(identity: ApplicationIdentity, projectId: string) {
    try {
      return await this.dashboards.saddd(identity, { projectId })
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
      const saddd = releasedReach ? await this.saddd(identity, row.id) : null
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
        sadddSex: saddd?.sex ?? null,
        sadddDisability:
          saddd?.disability.find((row) => row.key === 'WITH_DISABILITY')?.metric ?? null,
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
