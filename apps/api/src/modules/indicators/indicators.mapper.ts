import { ServiceUnavailableException } from '@nestjs/common'
import {
  type IndicatorLibraryEntryResponse,
  type IndicatorResponse,
  type MetricRecipe,
  P06_CONTRACT_VERSION,
  indicatorProgress,
  indicatorResponse,
  missingMetric,
} from '@pathways/shared'
import type { IndicatorLibraryEntry } from '@prisma/client'

// Released rows carry no definition text, binding or measurement provenance.
export const releasedNulls = {
  description: null,
  dataSource: null,
  mode: null,
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
}

/** Parses one indicator row and adds its baseline-to-target progress. */
export function toIndicatorResponse(
  row: Record<string, unknown>,
  failure: string,
): IndicatorResponse {
  const parsed = indicatorResponse.safeParse({
    ...row,
    progress: missingMetric('NOT_YET_CALCULATED'),
    contractVersion: P06_CONTRACT_VERSION,
  })
  if (!parsed.success) throw new ServiceUnavailableException(failure)
  const indicator = parsed.data
  const progress = indicator.direction
    ? indicatorProgress(
        indicator.current,
        indicator.baseline,
        indicator.target,
        indicator.direction,
      )
    : missingMetric('LEGACY_REVIEW_REQUIRED')
  return { ...indicator, progress }
}

export function toLibraryEntryResponse(row: IndicatorLibraryEntry): IndicatorLibraryEntryResponse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unitLabel: row.unitLabel,
    dataSource: row.dataSource,
    mode: row.measurementMode as IndicatorLibraryEntryResponse['mode'],
    numericKind: row.numericKind as IndicatorLibraryEntryResponse['numericKind'],
    direction: row.direction as IndicatorLibraryEntryResponse['direction'],
    displayPrecision: row.displayPrecision,
    recipe: row.recipe as MetricRecipe | null,
    createdAt: row.createdAt.toISOString(),
  }
}
