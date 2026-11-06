import { z } from 'zod'
import { metricCellSchema } from '../../metrics/metric-cell'
import { projectOverviewMetricsSchema } from './overview-metrics'

export const PROJECT_MAP_CONTRACT_VERSION = 'analytics.project-map.v1' as const

const sexBucketSchema = z
  .object({ key: z.string().max(80), label: z.string().max(160), metric: metricCellSchema })
  .strict()

/** One named place a project's implementation area resolves to, at a bundled centroid. */
export const projectMapPlaceSchema = z
  .object({
    name: z.string().max(120),
    province: z.string().max(120),
    longitude: z.number().min(114).max(128),
    latitude: z.number().min(4).max(22),
    // SADDD individuals whose recorded city or municipality is this place; null without the SADDD grant.
    reach: z
      .object({
        total: metricCellSchema,
        sex: z.array(sexBucketSchema).max(5),
        disability: metricCellSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()

/** Project-level map point: centroids only, never Beneficiary coordinates. */
export const projectMapProjectSchema = z
  .object({
    id: z.guid(),
    code: z.string().max(80),
    title: z.string().max(300),
    status: z.string().max(40),
    implementationArea: z.string().max(500),
    places: z.array(projectMapPlaceSchema).min(1).max(20),
    overview: projectOverviewMetricsSchema.nullable(),
    // Whole-project SADDD sex buckets, present only once the closed-project release exists.
    sadddSex: z.array(sexBucketSchema).max(5).nullable(),
    // Whole-project SADDD individuals with a disability, from the same release.
    sadddDisability: metricCellSchema.nullable(),
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
