import { isCalculatedRule } from '@pathways/shared'
import * as XLSX from 'xlsx'

import type { IntakeField } from '../intake-rules'
import type { CoverageField } from '../mappers/coverage'
import { matchColumns } from '../validation/match-columns'
import {
  type ColumnMapping,
  columnRules,
  isSupplied,
  unsuppliedRequired,
  validateRows,
} from '../validation/validate-rows'
import type { ReadImportFile } from './read-import-file'

/** A published form field as the check needs it. */
export type CheckField = IntakeField & { id: string; metadataKey: boolean; required: boolean }

export interface FileCheckProblem {
  kind: 'NO_COLUMN' | 'FORMULA_NO_VALUE' | 'ROW'
  fieldCode: string
  fieldLabel: string
  columnHeader: string | null
  columnLetter: string | null
  code: string
  message: string
  rowCount: number
  exampleRows: number[]
}

export interface FileCheckReport {
  totalRows: number
  problemRows: number
  problems: FileCheckProblem[]
}

const NO_COLUMN_MESSAGE =
  'No column matches. Rename the column, or add its header as a source name under Advanced Configuration.'

// Choice answers are mapped once per column after upload, and so is the order of a text date column with no single fitting order.
const fixedOnce = (code: string, dataType: string | undefined, hasDateOrder: boolean) =>
  (code === 'AMBIGUOUS_DATE' && !hasDateOrder) ||
  (code === 'invalid_value' && (dataType === 'SELECT' || dataType === 'MULTIPLE_SELECT'))

/** Finds what would make the server hold rows for one-by-one review, using the server's own matching and validation. */
export function checkImportFile(input: {
  file: ReadImportFile
  formType: string
  fields: CheckField[]
  uploadDate: string
}): FileCheckReport {
  const { file, formType, fields, uploadDate } = input
  const fieldById = new Map(fields.map((field) => [field.id, field]))
  const fieldByCode = new Map(fields.map((field) => [field.code, field]))
  const decisions = matchColumns(
    file.sourceColumns,
    file.rows,
    fields.map((field): CoverageField => ({ ...field, calculated: isCalculatedRule(field.rule) })),
  )

  // A column the server leaves pending with a suggestion counts as mapped to it; other pending columns are left out.
  const mappings: ColumnMapping[] = []
  const columnOf = new Map<string, (typeof file.sourceColumns)[number]>()
  const mappedFields: CheckField[] = []
  for (const decision of decisions) {
    const target = fieldById.get(decision.targetFieldId ?? decision.suggestedFieldId ?? '')
    const column = file.sourceColumns.find((candidate) => candidate.key === decision.sourceKey)
    if (!target || !column || columnOf.has(target.code)) continue
    columnOf.set(target.code, column)
    mappedFields.push(target)
    mappings.push({
      sourceFieldName: column.key,
      status: 'MAPPED',
      dataType: null,
      valueMap: null,
      dateOrder: null,
      targetField: { code: target.code, dataType: target.dataType },
    })
  }

  const mappedCodes = new Set(mappedFields.map((field) => field.code))
  const problems: FileCheckProblem[] = unsuppliedRequired(fields, mappedCodes).map((field) => ({
    kind: 'NO_COLUMN',
    fieldCode: field.code,
    fieldLabel: field.label,
    columnHeader: null,
    columnLetter: null,
    code: 'NO_COLUMN',
    message: NO_COLUMN_MESSAGE,
    rowCount: 0,
    exampleRows: [],
  }))

  if (file.formulaGap) {
    const cell = XLSX.utils.decode_cell(file.formulaGap)
    problems.push({
      kind: 'FORMULA_NO_VALUE',
      fieldCode: '',
      fieldLabel: '',
      columnHeader: null,
      columnLetter: XLSX.utils.encode_col(cell.c),
      code: 'FORMULA_NO_VALUE',
      message: `Cell ${file.formulaGap} has a formula with no saved value. Open and save the file in Excel or Google Sheets.`,
      rowCount: 1,
      exampleRows: [cell.r + 1],
    })
  }

  // Mapped fields plus unmapped ones a default or calculation still supplies, as the server validates them.
  const results = validateRows({
    formType,
    fields: [
      ...mappedFields,
      ...fields.filter((field) => !mappedCodes.has(field.code) && isSupplied(field, mappedCodes)),
    ],
    mappedFields,
    mappings,
    raws: file.rows,
    uploadDate,
  })

  // A column whose rule has a date order has one fitting order; the server reads its text dates without a reviewer.
  const rules = columnRules(mappings, file.rows, Number(uploadDate.slice(0, 4)))
  const groups = new Map<string, FileCheckProblem>()
  const rowsOf = new Map<string, number[]>()
  const problemRows = new Set<number>()
  const add = (index: number, fieldCode: string, code: string, message: string) => {
    const key = `${fieldCode}\u0000${code}`
    const rows = rowsOf.get(key) ?? []
    // One row counts once per problem even when the server reports it twice.
    if (rows[rows.length - 1] === index) return
    rows.push(index)
    rowsOf.set(key, rows)
    problemRows.add(index)
    if (groups.has(key)) return
    const codes = fieldCode.split(',')
    const column = columnOf.get(codes[0])
    groups.set(key, {
      kind: 'ROW',
      fieldCode,
      fieldLabel: codes.map((item) => fieldByCode.get(item)?.label ?? item).join(', '),
      columnHeader: column?.header ?? null,
      columnLetter: column ? XLSX.utils.encode_col(column.columnIndex - 1) : null,
      code,
      message,
      rowCount: 0,
      exampleRows: [],
    })
  }

  const registration = formType === 'BENEFICIARY_REGISTRATION'
  results.forEach((result, index) => {
    for (const error of result.errors) {
      const dataType = fieldByCode.get(error.fieldCode)?.dataType
      if (!fixedOnce(error.code, dataType, !!rules[error.fieldCode]?.date))
        add(index, error.fieldCode, error.code, error.message)
    }
    // The registration service holds an imported row without both consents.
    if (
      registration &&
      result.valid &&
      (result.values.consent_recorded !== true ||
        result.values.data_processing_consent_recorded !== true)
    ) {
      add(index, 'consent_recorded', 'CONSENT_REQUIRED', 'Consent is not recorded')
    }
  })

  const rowProblems = [...groups].map(([key, problem]) => {
    const rows = rowsOf.get(key) ?? []
    return {
      ...problem,
      rowCount: rows.length,
      exampleRows: rows.slice(0, 3).map((i) => file.rowNumbers[i]),
    }
  })
  rowProblems.sort((left, right) => right.rowCount - left.rowCount)
  return {
    totalRows: file.rows.length,
    problemRows: problemRows.size,
    problems: [...problems, ...rowProblems],
  }
}
