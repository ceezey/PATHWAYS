import { z } from 'zod'
import { P06_CONTRACT_VERSION, metricCellSchema, metricRecipes } from '../../monitoring/metric-cell'
import { date, decimal, uuid } from '../../monitoring/metric-fields'
import { numericKinds } from '../../monitoring/metric-math'
import { indicatorBindingSchema, indicatorTypes } from './indicator-requests'

export const indicatorLibraryEntryResponse = z
  .object({
    id: uuid,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    unitLabel: z.string(),
    dataSource: z.string(),
    mode: z.enum(['MANUAL', 'DERIVED']),
    numericKind: z.enum(numericKinds),
    direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']),
    displayPrecision: z.number().int().min(0).max(4),
    recipe: z.enum(metricRecipes).nullable(),
    createdAt: z.string(),
  })
  .strict()
export type IndicatorLibraryEntryResponse = z.infer<typeof indicatorLibraryEntryResponse>

export const indicatorResponse = z
  .object({
    id: uuid,
    projectId: uuid,
    code: z.string().max(100),
    name: z.string().max(250),
    description: z.string().nullable(),
    indicatorType: z.enum(indicatorTypes).optional(),
    unitLabel: z.string().nullable(),
    dataSource: z.string().nullable(),
    mode: z.enum(['MANUAL', 'DERIVED']).nullable(),
    numericKind: z.enum(numericKinds).nullable(),
    direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']).nullable(),
    displayPrecision: z.number().int().min(0).max(4).nullable(),
    periodStart: date.nullable(),
    periodEnd: date.nullable(),
    baseline: decimal.nullable(),
    target: decimal.nullable(),
    current: metricCellSchema,
    progress: metricCellSchema,
    binding: indicatorBindingSchema.nullable(),
    measurementId: uuid.nullable(),
    measuredAt: z.string().datetime({ offset: true }).nullable(),
    measurementSource: z.string().max(300).nullable(),
    revision: z.number().int().min(1),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'LEGACY_REVIEW_REQUIRED']),
    contractVersion: z.literal(P06_CONTRACT_VERSION),
  })
  .strict()
export type IndicatorResponse = z.infer<typeof indicatorResponse>
export const indicatorListResponse = z.array(indicatorResponse).max(100)
