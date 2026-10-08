import {
  type FormFieldValidationContract,
  type FormValueError,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { type ImportColumnRule, mapKey } from './value-map'

interface ImportValueError {
  fieldCode: string
  code: string
  message: string
}

interface ImportRowNormalizationResult {
  valid: boolean
  values: Record<string, string | number | boolean | string[] | null>
  errors: ImportValueError[]
}

function conversionError(field: FormFieldValidationContract, code: string, message: string) {
  return { fieldCode: field.code, code, message }
}

function convert(
  field: FormFieldValidationContract,
  raw: unknown,
): { value: string | number | boolean | string[] | null; error?: ImportValueError } {
  if (raw === null || raw === undefined || raw === '') return { value: null }
  if (field.dataType === 'TEXT' || field.dataType === 'LONG_TEXT' || field.dataType === 'SELECT') {
    if (typeof raw !== 'string') {
      return { value: null, error: conversionError(field, 'AMBIGUOUS_TEXT', 'Expected text.') }
    }
    return { value: raw }
  }
  if (field.dataType === 'INTEGER') {
    if (typeof raw === 'number' && Number.isSafeInteger(raw)) return { value: raw }
    if (typeof raw === 'string' && /^-?(?:0|[1-9][0-9]*)$/.test(raw.trim())) {
      const value = Number(raw.trim())
      if (Number.isSafeInteger(value)) return { value }
    }
    return {
      value: null,
      error: conversionError(field, 'AMBIGUOUS_INTEGER', 'Expected a canonical whole number.'),
    }
  }
  if (field.dataType === 'DECIMAL') {
    const value = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw
    if (typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/.test(value.trim())) {
      return { value: value.trim() }
    }
    return {
      value: null,
      error: conversionError(
        field,
        'AMBIGUOUS_DECIMAL',
        'Expected a non-exponential decimal with at most four fractional digits.',
      ),
    }
  }
  if (field.dataType === 'DATE') {
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      return { value: raw.trim() }
    }
    return {
      value: null,
      error: conversionError(field, 'AMBIGUOUS_DATE', 'Expected a YYYY-MM-DD calendar date.'),
    }
  }
  if (field.dataType === 'BOOLEAN') {
    if (typeof raw === 'boolean') return { value: raw }
    if (typeof raw === 'string' && /^(true|false)$/i.test(raw.trim())) {
      return { value: raw.trim().toLowerCase() === 'true' }
    }
    return {
      value: null,
      error: conversionError(field, 'AMBIGUOUS_BOOLEAN', 'Expected true or false.'),
    }
  }
  if (field.dataType === 'MULTIPLE_SELECT') {
    if (Array.isArray(raw) && raw.every((value) => typeof value === 'string')) {
      return { value: raw }
    }
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
          return { value: parsed }
        }
      } catch {
        // The bounded error below deliberately avoids reflecting source values.
      }
    }
    return {
      value: null,
      error: conversionError(
        field,
        'AMBIGUOUS_MULTI_SELECT',
        'Expected a JSON array of choice strings.',
      ),
    }
  }
  return {
    value: null,
    error: conversionError(field, 'UNSUPPORTED_TYPE', 'The field type is not supported.'),
  }
}

function mappedError(error: FormValueError): ImportValueError {
  return {
    fieldCode: error.fieldCode,
    code: error.code,
    message: error.message,
  }
}

function translate(raw: unknown, rule: ImportColumnRule | undefined): unknown {
  if (!rule?.valueMap || (typeof raw !== 'string' && typeof raw !== 'number')) return raw
  const mapped = rule.valueMap.get(mapKey(String(raw)))
  return mapped === undefined ? raw : mapped
}

/** Applies the reviewed value map, then the declared type check, then the field's own coercion. */
export function normalizeImportedRow(
  fields: readonly FormFieldValidationContract[],
  rawValuesByFieldCode: Readonly<Record<string, unknown>>,
  rules: Readonly<Record<string, ImportColumnRule>> = {},
): ImportRowNormalizationResult {
  const values: Record<string, string | number | boolean | string[] | null> = Object.create(null)
  const errors: ImportValueError[] = []
  for (const field of fields) {
    const rule = Object.hasOwn(rules, field.code) ? rules[field.code] : undefined
    const raw = translate(rawValuesByFieldCode[field.code], rule)
    const declared =
      rule?.dataType && rule.dataType !== field.dataType
        ? convert({ ...field, dataType: rule.dataType }, raw)
        : null
    const converted = declared?.error ? declared : convert(field, raw)
    values[field.code] = converted.value
    if (converted.error) errors.push(converted.error)
  }
  if (errors.length > 0) return { valid: false, values, errors }
  const validated = validateAndNormalizeFormData(fields, values, 'final')
  return {
    valid: validated.valid,
    values: validated.values,
    errors: validated.errors.map(mappedError),
  }
}
