import { AUTO_SMART_V2_LIMITS, type SmartMatchDecision, smartMatchColumns } from '@pathways/imports'

import type { FormFieldDataType } from '@/types/pathways'

import { fieldCodeFromText } from './digital-form-contract'

export type MappingStatus = 'mapped' | 'unmapped' | 'ignored' | 'invalid'

export interface MappingRow {
  id: string
  sourceColumn: string
  targetField: string
  status: MappingStatus
  /** The preview matcher pre-selected this target. */
  autoMatched?: boolean
  /** A weaker preview match the reviewer can accept; never pre-selected. */
  suggestedField?: string
}

export interface MappingReadiness {
  canProceed: boolean
  ignored: number
  invalid: number
  mapped: number
  message: string
  resolved: number
  total: number
  unmapped: number
}

/** A field the advisory preview can match a source column against. */
export interface PreviewMappingField {
  code: string
  label: string
  dataType: FormFieldDataType
  allowedValues?: readonly string[] | null
  minimumLength?: number | null
  maximumLength?: number | null
}

const unmatchedRows = (headers: readonly string[]): MappingRow[] =>
  headers.map((header, index) => ({
    id: `mapping-${index}`,
    sourceColumn: header,
    targetField: '',
    status: 'unmapped',
  }))

/**
 * Advisory preview with the same AUTO_SMART_V2 matcher the server runs, over the
 * client-parsed headers and a bounded prefix of rows. Only high-confidence matches are
 * pre-selected; weaker ones are offered as suggestions. The server result stays
 * authoritative.
 */
export const createSmartMappingRows = (
  headers: readonly string[],
  rows: readonly Record<string, unknown>[],
  fields: readonly PreviewMappingField[],
): MappingRow[] => {
  const sample = rows.slice(0, AUTO_SMART_V2_LIMITS.sampleRows)
  let decisions: SmartMatchDecision[]
  try {
    decisions = smartMatchColumns(
      headers.map((header, index) => ({
        key: `column_${String(index + 1).padStart(4, '0')}`,
        columnIndex: index + 1,
        header,
        samples: sample.map((row) => row[header]),
      })),
      fields.map((field) => ({ ...field, id: field.code })),
    )
  } catch {
    // Beyond the import bounds: the server rejects the file, so nothing is pre-selected.
    return unmatchedRows(headers)
  }
  return decisions.map((decision, index) => ({
    id: `mapping-${index}`,
    sourceColumn: headers[index],
    targetField: decision.targetFieldId ?? '',
    status: decision.targetFieldId ? 'mapped' : 'unmapped',
    ...(decision.targetFieldId ? { autoMatched: true } : {}),
    ...(decision.suggestedFieldId ? { suggestedField: decision.suggestedFieldId } : {}),
  }))
}

/**
 * A header-only questionnaire defines new draft fields: each named column becomes its
 * own field code. Blank headers are invalid and repeated codes stay unmapped.
 */
export const createQuestionnaireMappingRows = (headers: readonly string[]): MappingRow[] => {
  const seen = new Set<string>()
  return headers.map((header, index) => {
    const code = fieldCodeFromText(header)
    const duplicate = code !== '' && seen.has(code)
    seen.add(code)
    return {
      id: `mapping-${index}`,
      sourceColumn: header,
      targetField: code && !duplicate ? code : '',
      status: code === '' ? 'invalid' : duplicate ? 'unmapped' : 'mapped',
    }
  })
}

export const getMappingReadiness = (mappingRows: readonly MappingRow[]): MappingReadiness => {
  const invalid = mappingRows.filter((row) => row.status === 'invalid').length
  const unmapped = mappingRows.filter(
    (row) => row.status === 'unmapped' || (row.status === 'mapped' && !row.targetField),
  ).length
  const mapped = mappingRows.filter(
    (row) => row.status === 'mapped' && Boolean(row.targetField),
  ).length
  const ignored = mappingRows.filter((row) => row.status === 'ignored').length
  const total = mappingRows.length
  const resolved = mapped + ignored
  const canProceed = total > 0 && invalid === 0 && unmapped === 0

  let message = 'Select a source file to review its mappings.'

  if (total > 0 && canProceed) {
    message = `All ${total} source columns are resolved. You can proceed.`
  } else if (total > 0) {
    const remaining = [
      invalid > 0 ? `${invalid} invalid` : '',
      unmapped > 0 ? `${unmapped} unmapped` : '',
    ].filter(Boolean)
    message = `${remaining.join(' and ')} source ${remaining.length === 1 && invalid + unmapped === 1 ? 'column remains' : 'columns remain'}. Resolve them before proceeding.`
  }

  return { canProceed, ignored, invalid, mapped, message, resolved, total, unmapped }
}
