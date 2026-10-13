import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { CreateIndicatorLibraryEntryRequest } from '@pathways/shared'
import type { IndicatorLibraryEntry } from '@prisma/client'
import type { z } from 'zod'

/** Service-side parse, so seeds and the library copy path are validated like the routes. */
export function parseIndicatorRequest<T>(schema: z.ZodType<T>, input: unknown): T {
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

export function monitoringSqlError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
  const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
  if (
    code === 'P2002' ||
    code === 'P2034' ||
    ['23505', '23514', '40001', '40P01'].includes(String(sqlCode))
  ) {
    throw new ConflictException(
      'The indicator or measurement changed, conflicts, or violates its contract. Reload before retrying.',
    )
  }
  if (sqlCode === '42501') throw new ForbiddenException('Monitoring scope is unavailable.')
  if (code === 'P2028' || ['57014', '42P01', '42703', '42883', '22023'].includes(String(sqlCode))) {
    throw new ServiceUnavailableException(
      'Monitoring verification is unavailable or exceeded its query limit.',
    )
  }
  throw error
}

/** Same key with the same definition replays; the same key with another definition conflicts. */
export function sameLibraryDefinition(
  row: IndicatorLibraryEntry,
  input: CreateIndicatorLibraryEntryRequest,
) {
  return (
    row.code === input.code &&
    row.name === input.name &&
    row.description === (input.description ?? null) &&
    row.unitLabel === input.unitLabel &&
    row.dataSource === input.dataSource &&
    row.measurementMode === input.mode &&
    row.numericKind === input.numericKind &&
    row.direction === input.direction &&
    row.displayPrecision === input.displayPrecision &&
    row.recipe === (input.recipe ?? null)
  )
}
