import { z } from 'zod'
import { metricCellSchema } from './metric-contract'
import { projectOverviewMetricsSchema } from './overview-metrics'

export const PROJECT_MAP_CONTRACT_VERSION = 'analytics.project-map.v1' as const

/** One named place a project's implementation area resolves to, at a bundled centroid. */
export const projectMapPlaceSchema = z
  .object({
    name: z.string().max(120),
    province: z.string().max(120),
    longitude: z.number().min(114).max(128),
    latitude: z.number().min(4).max(22),
  })
  .strict()

const sexBucketSchema = z
  .object({ key: z.string().max(80), label: z.string().max(160), metric: metricCellSchema })
  .strict()

/** Project-level map point: centroids only, never Beneficiary coordinates. */
export const projectMapProjectSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().max(80),
    title: z.string().max(300),
    status: z.string().max(40),
    implementationArea: z.string().max(500),
    places: z.array(projectMapPlaceSchema).min(1).max(20),
    overview: projectOverviewMetricsSchema.nullable(),
    // Suppressed SADDD sex buckets, present only once the closed-project release exists.
    sadddSex: z.array(sexBucketSchema).max(5).nullable(),
  })
  .strict()

export const projectMapSchema = z
  .object({
    contractVersion: z.literal(PROJECT_MAP_CONTRACT_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    projects: z.array(projectMapProjectSchema).max(100),
    unmappedCount: z.number().int().min(0).max(100),
  })
  .strict()

export type ProjectMapPlace = z.infer<typeof projectMapPlaceSchema>
export type ProjectMapProject = z.infer<typeof projectMapProjectSchema>
export type ProjectMap = z.infer<typeof projectMapSchema>
