export type MappingStatus = 'mapped' | 'unmapped' | 'ignored' | 'invalid'

export interface MappingRow {
  id: string
  sourceColumn: string
  targetField: string
  status: MappingStatus
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

export const normalizeImportHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const createMappingRows = (
  headers: string[],
  expectedHeaders: readonly string[],
): MappingRow[] =>
  headers.map((header, index) => {
    const normalized = normalizeImportHeader(header)
    const isKnown = expectedHeaders.includes(normalized)
    const isInvalid = normalized.length === 0

    return {
      id: `mapping-${index}-${normalized || 'blank'}`,
      sourceColumn: header,
      targetField: isKnown ? normalized : '',
      status: isInvalid ? 'invalid' : isKnown ? 'mapped' : 'unmapped',
    }
  })

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
