import type { FormFieldValidationContract } from '@pathways/shared'

export type ImportDataType = FormFieldValidationContract['dataType']

export const IMPORT_VALUE_MAP_LIMITS = Object.freeze({ maxEntries: 50, maxTextLength: 100 })

/** Data types a reviewer may declare for a column, by target field type. */
const COMPATIBLE_TYPES: Record<ImportDataType, readonly ImportDataType[]> = {
  TEXT: ['TEXT'],
  LONG_TEXT: ['TEXT', 'LONG_TEXT'],
  SELECT: ['TEXT', 'SELECT'],
  MULTIPLE_SELECT: ['MULTIPLE_SELECT'],
  INTEGER: ['INTEGER'],
  DECIMAL: ['INTEGER', 'DECIMAL'],
  DATE: ['DATE'],
  BOOLEAN: ['BOOLEAN'],
}

export function compatibleImportDataTypes(target: ImportDataType): readonly ImportDataType[] {
  return COMPATIBLE_TYPES[target]
}

export interface ImportValueMapEntry {
  from: string
  to: string
}

export interface ImportColumnRule {
  dataType?: ImportDataType
  valueMap?: ReadonlyMap<string, string>
}

export const mapKey = (value: string) => value.normalize('NFKC').trim().toLowerCase()

/** Builds the exact-match lookup; keys are NFKC, trimmed and case-folded, duplicates are rejected. */
export function buildImportValueMap(entries: readonly ImportValueMapEntry[]): Map<string, string> {
  if (entries.length > IMPORT_VALUE_MAP_LIMITS.maxEntries) throw new Error('VALUE_MAP_TOO_LARGE')
  const map = new Map<string, string>()
  for (const { from, to } of entries) {
    const key = mapKey(from)
    if (!key || map.has(key)) throw new Error('VALUE_MAP_INVALID')
    map.set(key, to)
  }
  return map
}
