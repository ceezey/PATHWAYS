import { type FieldIntakeRule, isCalculatedRule } from '@pathways/shared'
import { type DateOrder, fittingDateOrders } from '../date-order'
import type { IntakeField } from '../intake-rules'
import { type ImportRowNormalizationResult, normalizeImportedRow } from '../normalization'
import { type ImportColumnRule, buildImportValueMap } from '../value-map'

export interface ColumnMapping {
  sourceFieldName: string
  status: string
  dataType: ImportColumnRule['dataType'] | null
  valueMap: unknown
  dateOrder: string | null
  targetField: Pick<IntakeField, 'code' | 'dataType'> | null
}

export function storedValueMap(value: unknown): { from: string; to: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) =>
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.from === 'string' &&
    typeof entry.to === 'string'
      ? [{ from: entry.from, to: entry.to }]
      : [],
  )
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function normalizeIdentifier(value: string) {
  return value.normalize('NFKC').trim()
}

/** The reviewed value maps and declared types per target field; a text date column also gets its date order. */
export function columnRules(
  mappings: readonly ColumnMapping[],
  raws: readonly Record<string, unknown>[],
  referenceYear: number,
) {
  const rules = Object.create(null) as Record<string, ImportColumnRule>
  for (const mapping of mappings) {
    if (mapping.status !== 'MAPPED' || !mapping.targetField) continue
    rules[mapping.targetField.code] = {
      ...(mapping.dataType ? { dataType: mapping.dataType } : {}),
      ...(mapping.valueMap
        ? { valueMap: buildImportValueMap(storedValueMap(mapping.valueMap)) }
        : {}),
    }
  }
  // A text date column uses the reviewer's date order, else the one order that fits every value.
  for (const mapping of mappings) {
    const target = mapping.status === 'MAPPED' ? mapping.targetField : null
    if (!target || (mapping.dataType ?? target.dataType) !== 'DATE') continue
    const orders = mapping.dateOrder
      ? [mapping.dateOrder as DateOrder]
      : fittingDateOrders(
          raws.map((raw) => raw[mapping.sourceFieldName]),
          referenceYear,
        )
    if (orders.length === 1) {
      rules[target.code] = { ...rules[target.code], date: { order: orders[0], referenceYear } }
    }
  }
  return rules
}

/** A raw row keyed by the target field of each mapped column. */
export function valuesByFieldCode(
  mappings: readonly ColumnMapping[],
  raw: Record<string, unknown>,
) {
  const byFieldCode = Object.create(null) as Record<string, unknown>
  for (const mapping of mappings) {
    if (mapping.status === 'MAPPED' && mapping.targetField) {
      byFieldCode[mapping.targetField.code] = raw[mapping.sourceFieldName]
    }
  }
  return byFieldCode
}

// An unmapped field still takes part when it has a default or a calculation.
export const isSupplied = (field: IntakeField, mappedCodes: ReadonlySet<string>) =>
  mappedCodes.has(field.code) ||
  !!field.importDefault ||
  isCalculatedRule(field.rule as FieldIntakeRule | null)

/** The required form fields that no column, default or calculation supplies. */
export function unsuppliedRequired(
  formFields: readonly IntakeField[],
  mappedCodes: ReadonlySet<string>,
): IntakeField[] {
  return formFields.filter((field) => field.required && !isSupplied(field, mappedCodes))
}

/** Normalizes every row, then marks rows that share a metadata key or a registration client identifier. */
export function validateRows(input: {
  formType: string
  fields: IntakeField[]
  mappedFields: Array<IntakeField & { metadataKey: boolean }>
  mappings: readonly ColumnMapping[]
  raws: readonly Record<string, unknown>[]
  uploadDate: string
}): ImportRowNormalizationResult[] {
  const { formType, fields, mappedFields, mappings, raws, uploadDate } = input
  const rules = columnRules(mappings, raws, Number(uploadDate.slice(0, 4)))
  const results = raws.map((raw) => {
    const byFieldCode = valuesByFieldCode(mappings, raw)
    return { result: normalizeImportedRow(fields, byFieldCode, rules, { uploadDate }) }
  })
  // Two valid rows sharing a key are both marked, so neither is guessed to be the real one.
  const markDuplicates = (
    keyOf: (values: Record<string, unknown>) => string | null,
    fieldCode: string,
    code: string,
    message: string,
    includeInvalid = false,
  ) => {
    const seen = new Map<string, number[]>()
    results.forEach(({ result }, index) => {
      if (!result.valid && !includeInvalid) return
      const key = keyOf(result.values)
      if (key === null) return
      const entries = seen.get(key) ?? []
      entries.push(index)
      seen.set(key, entries)
    })
    for (const duplicates of seen.values()) {
      if (duplicates.length < 2) continue
      for (const index of duplicates) {
        results[index].result.valid = false
        results[index].result.errors.push({ fieldCode, code, message })
      }
    }
  }
  const metadataKeys = mappedFields.filter((field) => field.metadataKey).map((field) => field.code)
  if (metadataKeys.length > 0) {
    markDuplicates(
      (values) => stableJson(metadataKeys.map((code) => values[code])),
      metadataKeys.join(','),
      'DUPLICATE_BUSINESS_KEY',
      'The metadata key is duplicated within this import.',
    )
  }
  // One client Student ID on two rows would create or change one person twice, even if one twin is invalid.
  if (
    formType === 'BENEFICIARY_REGISTRATION' &&
    fields.some((field) => field.code === 'external_identifier_value')
  ) {
    markDuplicates(
      (values) => {
        const value = values.external_identifier_value
        return typeof value === 'string' && normalizeIdentifier(value) !== ''
          ? normalizeIdentifier(value)
          : null
      },
      'external_identifier_value',
      'IDENTITY_CONFLICT',
      'The client identifier is on more than one row of this import.',
      true,
    )
  }
  return results.map(({ result }) => result)
}
