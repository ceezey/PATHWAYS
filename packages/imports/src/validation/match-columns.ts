import { fedCodes } from '../check/saddd-columns'
import type { CoverageField } from '../mappers/coverage'
import {
  AUTO_SMART_V2_LIMITS,
  type SmartMatchColumn,
  type SmartMatchDecision,
  smartMatchColumnsV4,
} from '../mappers/smart-match'
import { matchBySourceCode } from '../mappers/source-code-match'
import type { ImportSourceColumn } from '../parser/matrix'
import { DEFERRED_REGISTRATION_FIELDS } from './validate-rows'

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
  const rest = smartMatchColumnsV4(
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

/** V5, after the source-code merge: keeps a calculated-field ignore only when the mapped columns feed its field, else gives the column back pending as V4 left it, and clears the suggestion of every ignore as p78 stores it. */
export function keepFedCalculatedIgnores(
  decisions: SmartMatchDecision[],
  fields: CoverageField[],
): SmartMatchDecision[] {
  const codeById = new Map(fields.map((field) => [field.id, field.code]))
  const byCode = new Map(fields.map((field) => [field.code, field]))
  // The enrollment date is confirmed after upload, and an age rule's at-date with a default is on every row.
  const supplied = new Set<string>(DEFERRED_REGISTRATION_FIELDS)
  for (const decision of decisions) {
    const code =
      decision.status === 'MAPPED' ? codeById.get(decision.targetFieldId ?? '') : undefined
    if (code) supplied.add(code)
  }
  for (const { rule } of fields) {
    if (
      (rule?.kind === 'AGE_AT_DATE' || rule?.kind === 'MINOR_AT_DATE') &&
      byCode.get(rule.atField)?.importDefault
    )
      supplied.add(rule.atField)
  }
  const fed = fedCodes(fields, supplied)
  return decisions.map((decision) => {
    if (decision.status !== 'IGNORED') return decision
    const code = codeById.get(decision.suggestedFieldId ?? '')
    if (decision.reason === 'CALCULATED_FIELD' && !(code && fed.has(code)))
      return { ...decision, status: 'PENDING', reason: 'NO_MATCH', suggestedFieldId: null }
    return { ...decision, suggestedFieldId: null }
  })
}
