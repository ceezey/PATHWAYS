import { BadRequestException } from '@nestjs/common'
import {
  archiveIndicatorRequest,
  createIndicatorFromLibraryRequest,
  createIndicatorLibraryEntryRequest,
  createIndicatorRequest,
  recordIndicatorMeasurementRequest,
  updateIndicatorRequest,
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
  archiveIndicatorRequest,
  createIndicatorRequest,
  createIndicatorLibraryEntryRequest,
  recordIndicatorMeasurementRequest,
  updateIndicatorRequest,
  createIndicatorFromLibraryRequest,
}
