import { isCalculatedRule } from '@pathways/shared'
import * as XLSX from 'xlsx'

import type { IntakeField } from '../intake-rules'
import type { CoverageField } from '../mappers/coverage'
import { normalizeImportedRow } from '../normalization'
import { matchColumns } from '../validation/match-columns'
import {
  type ColumnMapping,
  columnRules,
  isSupplied,
  unsuppliedRequired,
  validateRows,
  valuesByFieldCode,
} from '../validation/validate-rows'
import { type DateHelp, dateHelp } from './date-help'
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
  // Set on the lines of a birth date column that the file's ages or dates contradict.
  date?: DateHelp
}

export interface FileCheckReport {
  totalRows: number
  problemRows: number
  problems: FileCheckProblem[]
}

// What the age rules report on the age field, though the birth date column is what to look at.
const AGE_CONTRADICTIONS = ['AGE_MISMATCH', 'CALCULATION_MISMATCH', 'BIRTH_AFTER_DATE']

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
  const validated = [
    ...mappedFields,
    ...fields.filter((field) => !mappedCodes.has(field.code) && isSupplied(field, mappedCodes)),
  ]
  const results = validateRows({
    formType,
    fields: validated,
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

  // A mapped date column that an age rule reads: the rule's fields report their contradictions on it.
  const birthOf = new Map<string, string>()
  for (const field of fields) {
    const rule = field.rule
    if (
      (rule?.kind === 'AGE_AT_DATE' ||
        rule?.kind === 'MINOR_AT_DATE' ||
        rule?.kind === 'AGE_CHECK') &&
      fieldByCode.get(rule.birthField)?.dataType === 'DATE' &&
      columnOf.has(rule.birthField)
    )
      birthOf.set(field.code, rule.birthField)
  }

  const registration = formType === 'BENEFICIARY_REGISTRATION'
  results.forEach((result, index) => {
    for (const error of result.errors) {
      const dataType = fieldByCode.get(error.fieldCode)?.dataType
      if (!fixedOnce(error.code, dataType, !!rules[error.fieldCode]?.date)) {
        const reported = AGE_CONTRADICTIONS.includes(error.code)
          ? (birthOf.get(error.fieldCode) ?? error.fieldCode)
          : error.fieldCode
        add(index, reported, error.code, error.message)
      }
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

  // Each birth date column with contradictions explains how it was read and what fits better.
  const helpOf = new Map<string, DateHelp>()
  for (const birth of new Set(birthOf.values())) {
    const flagged = new Set<number>()
    for (const code of AGE_CONTRADICTIONS)
      for (const row of rowsOf.get(`${birth}\u0000${code}`) ?? []) flagged.add(row)
    if (flagged.size === 0) continue
    const key = (columnOf.get(birth) as { key: string }).key
    const readOf = (row: number) => {
      const value = results[row].values[birth]
      return typeof value === 'string' ? value : null
    }
    helpOf.set(
      birth,
      dateHelp({
        uploadYear: Number(uploadDate.slice(0, 4)),
        rows: [...flagged].sort((left, right) => left - right),
        readOf,
        rowNumber: (row) => file.rowNumbers[row],
        // A text date is shown as the file has it; a real date cell as the file displays it.
        shown: (row) => {
          const raw = file.rows[row][key]
          return file.shown(row, key) ?? (typeof raw === 'string' ? raw : null)
        },
        agrees: (row, iso) =>
          !normalizeImportedRow(
            validated,
            { ...valuesByFieldCode(mappings, file.rows[row]), [birth]: iso },
            rules,
            { uploadDate },
          ).errors.some((error) => AGE_CONTRADICTIONS.includes(error.code)),
      }),
    )
  }

  const rowProblems = [...groups].map(([key, problem]): FileCheckProblem => {
    const rows = rowsOf.get(key) ?? []
    return {
      ...problem,
      rowCount: rows.length,
      exampleRows: rows.slice(0, 3).map((i) => file.rowNumbers[i]),
    }
  })
  rowProblems.sort((left, right) => right.rowCount - left.rowCount)
  // The date help goes once on each birth date column, on its first contradiction line.
  for (const problem of rowProblems) {
    const date = AGE_CONTRADICTIONS.includes(problem.code) && helpOf.get(problem.fieldCode)
    if (!date) continue
    problem.date = date
    helpOf.delete(problem.fieldCode)
  }
  return {
    totalRows: file.rows.length,
    problemRows: problemRows.size,
    problems: [...problems, ...rowProblems],
  }
}
