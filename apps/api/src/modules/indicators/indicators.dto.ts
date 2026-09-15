import { BadRequestException } from '@nestjs/common'
import {
  archiveIndicatorSchema,
  createIndicatorSchema,
  manualMeasurementSchema,
  updateIndicatorSchema,
} from '@pathways/shared'
import type { z } from 'zod'

/** Explicit parsing is intentional: type-only DTO imports do not provide runtime validation. */
export function parseIndicatorInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid indicator request.',
      issues: result.error.issues
        .slice(0, 5)
        .map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    })
  }
  return result.data
}
export {
  archiveIndicatorSchema,
  createIndicatorSchema,
  manualMeasurementSchema,
  updateIndicatorSchema,
}
