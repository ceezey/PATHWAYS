import type { CoverageField } from '../mappers/coverage'
import {
  AUTO_SMART_V2_LIMITS,
  type SmartMatchColumn,
  type SmartMatchDecision,
  smartMatchColumnsV3,
} from '../mappers/smart-match'
import { matchBySourceCode } from '../mappers/source-code-match'
import type { ImportSourceColumn } from '../parser/matrix'

export const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

// The matcher's view of each column: a bounded sample and whether every value is blank.
function smartMatchColumns(
  sourceColumns: ImportSourceColumn[],
  raw: Array<Record<string, unknown>>,
): SmartMatchColumn[] {
  const sampleRows = raw.slice(0, AUTO_SMART_V2_LIMITS.sampleRows)
  return sourceColumns.map((column) => ({
    key: column.key,
    columnIndex: column.columnIndex,
    header: column.header,
    samples: sampleRows.map((values) => values[column.key]),
    blank: raw.every((values) => isBlank(values[column.key])),
  }))
}

/**
 * One decision per column: a unique row-1 source code maps its column first, and the smart matcher
 * sees only the other columns and fields, so it can never override a code.
 */
export function matchColumns(
  sourceColumns: ImportSourceColumn[],
  raw: Array<Record<string, unknown>>,
  fields: CoverageField[],
): SmartMatchDecision[] {
  const columns = smartMatchColumns(sourceColumns, raw)
  const blank = new Set(columns.filter((column) => column.blank).map((column) => column.key))
  const byCode = matchBySourceCode(
    sourceColumns.filter((column) => !blank.has(column.key)),
    fields,
  )
  const coded = new Set(byCode.values())
  const rest = smartMatchColumnsV3(
    columns.filter((column) => !byCode.has(column.key)),
    fields.filter((field) => !coded.has(field.code)),
  )
  const idByCode = new Map(fields.map((field) => [field.code, field.id]))
  const decisions: SmartMatchDecision[] = [...byCode].map(([key, code]) => ({
    sourceKey: key,
    columnIndex: columns.find((column) => column.key === key)?.columnIndex ?? 0,
    status: 'MAPPED',
    targetFieldId: idByCode.get(code) ?? null,
    suggestedFieldId: null,
    score: 100,
    matchReason: 'METADATA_SOURCE_NAME',
    reason: 'AUTO_MATCH',
  }))
  return [...decisions, ...rest].sort((left, right) => left.columnIndex - right.columnIndex)
}
