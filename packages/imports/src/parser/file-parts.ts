import type { FilePart } from '@pathways/shared'

import type { ImportSourceColumn, ParsedImportRow } from './matrix'

interface ParsedShape {
  sourceColumns: ImportSourceColumn[]
  rows: ParsedImportRow[]
}

const blank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

// Excel dates reach the parser as ISO text; a CSV may hold day-first or month-first text.
const dateText = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}(?:[T ]\d{1,2}:\d{2}.*)?$/
const isDate = (value: unknown) => typeof value === 'string' && dateText.test(value.trim())

const hasValueIn = (row: ParsedImportRow, columns: ImportSourceColumn[]) =>
  columns.some((column) => !blank(row.values[column.key]))

/** The parts of a multi-stage client file: the survey stages that follow the registration columns. Empty means an ordinary file. */
export function detectFileParts(parsed: ParsedShape): FilePart[] {
  const { sourceColumns, rows } = parsed
  const candidate = sourceColumns.map(
    (column) =>
      column.sourceCode !== undefined &&
      !/\?|\b(?:date|petsa)\b/i.test(column.header) &&
      column.header !== column.sourceCode &&
      rows.every((row) => blank(row.values[column.key]) || isDate(row.values[column.key])),
  )
  const codeAfter = (index: number) => sourceColumns[index + 1]?.sourceCode
  // A stage start's next code also follows another candidate; a lone date column's does not.
  const followers = sourceColumns.flatMap((_, index) =>
    candidate[index] ? [codeAfter(index)] : [],
  )
  const starts = sourceColumns
    .map((_, index) => index)
    .filter((index) => {
      const code = codeAfter(index)
      return (
        candidate[index] && code !== undefined && followers.filter((c) => c === code).length > 1
      )
    })
  if (starts.length < 2) return []

  const parts = starts.map((first, n) => {
    const lastColumn = (starts[n + 1] ?? sourceColumns.length) - 1
    const span = sourceColumns.slice(first, lastColumn + 1)
    const taken = new Set(rows.filter((row) => hasValueIn(row, span)).map((r) => r.sourceRowNumber))
    return { column: sourceColumns[first], firstColumn: first, lastColumn, taken }
  })
  // Neighbouring stages with respondents and none in common are tracks that follow the stage before them.
  const branch = parts.map((part, n) => {
    const disjoint = (other?: (typeof parts)[number]) =>
      other !== undefined &&
      other.taken.size > 0 &&
      part.taken.size > 0 &&
      [...part.taken].every((row) => !other.taken.has(row))
    return disjoint(parts[n - 1]) || disjoint(parts[n + 1])
  })
  return parts.map((part, n) => {
    const anchor = branch[n]
      ? parts
          .slice(0, n)
          .filter((_, m) => !branch[m])
          .pop()
      : undefined
    return {
      code: part.column.sourceCode as string,
      name: part.column.header,
      firstColumn: part.firstColumn,
      lastColumn: part.lastColumn,
      rows: part.taken.size,
      branchOf: anchor?.column.sourceCode ?? null,
    }
  })
}

/** Keeps the columns in the range and the rows with a value in it; rows keep their file row numbers. */
export function selectPartColumns<T extends ParsedShape>(
  parsed: T,
  range: { firstColumn: number; lastColumn: number },
): T {
  const sourceColumns = parsed.sourceColumns.slice(range.firstColumn, range.lastColumn + 1)
  const rows = parsed.rows
    .filter((row) => hasValueIn(row, sourceColumns))
    .map((row) => ({
      sourceRowNumber: row.sourceRowNumber,
      values: Object.fromEntries(sourceColumns.map(({ key }) => [key, row.values[key]])),
    }))
  return { ...parsed, sourceColumns, rows }
}

export const registrationRange = (parts: FilePart[]) => ({
  firstColumn: 0,
  lastColumn: parts[0].firstColumn - 1,
})
