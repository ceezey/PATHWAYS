export const supportedFormFieldTypes = [
  'TEXT',
  'LONG_TEXT',
  'INTEGER',
  'DECIMAL',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTIPLE_SELECT',
] as const

export type SupportedFormFieldType = (typeof supportedFormFieldTypes)[number]
export type FormValidationMode = 'draft' | 'final'

export const formDefinitionLimits = {
  fields: 100,
  codeLength: 64,
  labelLength: 160,
  textLength: 2_000,
  longTextLength: 10_000,
  allowedValues: 100,
  allowedValueLength: 120,
  multiSelectValues: 50,
  integerMinimum: -2_147_483_648,
  integerMaximum: 2_147_483_647,
  decimalIntegerDigits: 14,
  decimalFractionDigits: 4,
} as const

export interface FormFieldValidationContract {
  code: string
  label: string
  dataType: SupportedFormFieldType
  required: boolean
  allowedValues?: readonly string[] | null
  minimumValue?: string | number | null
  maximumValue?: string | number | null
  minimumDate?: string | null
  maximumDate?: string | null
  minimumLength?: number | null
  maximumLength?: number | null
}

export interface FormValueError {
  fieldCode: string
  code:
    | 'invalid_definition'
    | 'invalid_payload'
    | 'unknown_field'
    | 'required'
    | 'invalid_type'
    | 'invalid_value'
    | 'below_minimum'
    | 'above_maximum'
    | 'too_short'
    | 'too_long'
  message: string
}

export interface FormValidationResult {
  valid: boolean
  values: Record<string, string | number | boolean | string[] | null>
  errors: FormValueError[]
}

const safeFieldCode = /^[a-z][a-z0-9_]{0,63}$/
const integerPattern = /^-?(?:0|[1-9][0-9]*)$/
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const reservedKeys = new Set(['__proto__', 'constructor', 'prototype'])

const error = (
  fieldCode: string,
  code: FormValueError['code'],
  message: string,
): FormValueError => ({ fieldCode, code, message })

function canonicalDecimal(value: string | number): string | null {
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const source = typeof value === 'number' ? String(value) : value.trim()
  if (!decimalPattern.test(source)) return null
  const negative = source.startsWith('-')
  const unsigned = negative ? source.slice(1) : source
  const [integerPart, fractionPart = ''] = unsigned.split('.')
  if (integerPart.length > formDefinitionLimits.decimalIntegerDigits) return null
  const fraction = fractionPart.replace(/0+$/, '')
  const normalized = `${integerPart}${fraction ? `.${fraction}` : ''}`
  return negative && normalized !== '0' ? `-${normalized}` : normalized
}

function decimalUnits(value: string): bigint {
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [integerPart, fractionPart = ''] = unsigned.split('.')
  const units = BigInt(integerPart) * 10_000n + BigInt(fractionPart.padEnd(4, '0'))
  return negative ? -units : units
}

function validCalendarDate(value: string) {
  const match = datePattern.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 2100) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function definitionErrors(fields: readonly FormFieldValidationContract[]) {
  const errors: FormValueError[] = []
  if (fields.length < 1 || fields.length > formDefinitionLimits.fields) {
    errors.push(
      error(
        '$form',
        'invalid_definition',
        `A form must contain between 1 and ${formDefinitionLimits.fields} fields.`,
      ),
    )
    return errors
  }
  const codes = new Set<string>()
  for (const field of fields) {
    const code = typeof field.code === 'string' ? field.code : ''
    if (!safeFieldCode.test(code) || reservedKeys.has(code) || codes.has(code)) {
      errors.push(
        error(code || '$field', 'invalid_definition', 'Field code is unsafe or duplicated.'),
      )
    }
    codes.add(code)
    if (
      typeof field.label !== 'string' ||
      field.label.trim().length < 1 ||
      field.label.trim().length > formDefinitionLimits.labelLength
    ) {
      errors.push(error(code, 'invalid_definition', 'Field label is invalid.'))
    }
    if (!supportedFormFieldTypes.includes(field.dataType)) {
      errors.push(error(code, 'invalid_definition', 'Field type is unsupported.'))
      continue
    }
    const malformedAllowedValues =
      field.allowedValues != null && !Array.isArray(field.allowedValues)
    const allowed = Array.isArray(field.allowedValues) ? field.allowedValues : []
    if (field.dataType === 'SELECT' || field.dataType === 'MULTIPLE_SELECT') {
      if (
        malformedAllowedValues ||
        allowed.length < 1 ||
        allowed.length > formDefinitionLimits.allowedValues ||
        allowed.some(
          (item) =>
            typeof item !== 'string' ||
            item.trim().length < 1 ||
            item.trim().length > formDefinitionLimits.allowedValueLength,
        ) ||
        new Set(allowed.map((item) => item.trim())).size !== allowed.length
      ) {
        errors.push(error(code, 'invalid_definition', 'Allowed values are invalid or duplicated.'))
      }
    } else if (malformedAllowedValues || allowed.length) {
      errors.push(error(code, 'invalid_definition', 'Allowed values apply only to select fields.'))
    }
    const textField = field.dataType === 'TEXT' || field.dataType === 'LONG_TEXT'
    const lengthField = textField || field.dataType === 'MULTIPLE_SELECT'
    const defaultMaximum =
      field.dataType === 'LONG_TEXT'
        ? formDefinitionLimits.longTextLength
        : field.dataType === 'MULTIPLE_SELECT'
          ? formDefinitionLimits.multiSelectValues
          : formDefinitionLimits.textLength
    if (
      (field.minimumLength != null || field.maximumLength != null) &&
      (!lengthField ||
        !Number.isInteger(field.minimumLength ?? 0) ||
        !Number.isInteger(field.maximumLength ?? defaultMaximum) ||
        (field.minimumLength ?? 0) < 0 ||
        (field.maximumLength ?? defaultMaximum) < 1 ||
        (field.maximumLength ?? defaultMaximum) > defaultMaximum ||
        (field.minimumLength ?? 0) > (field.maximumLength ?? defaultMaximum))
    ) {
      errors.push(error(code, 'invalid_definition', 'Length or item-count limits are invalid.'))
    }
    const numericField = field.dataType === 'INTEGER' || field.dataType === 'DECIMAL'
    const dateField = field.dataType === 'DATE'
    if ((field.minimumValue != null || field.maximumValue != null) && !numericField) {
      errors.push(error(code, 'invalid_definition', 'Numeric limits apply only to numeric fields.'))
    } else if (numericField) {
      const minimum = field.minimumValue == null ? null : canonicalDecimal(field.minimumValue)
      const maximum = field.maximumValue == null ? null : canonicalDecimal(field.maximumValue)
      if (
        (field.minimumValue != null && minimum == null) ||
        (field.maximumValue != null && maximum == null) ||
        (minimum != null && maximum != null && decimalUnits(minimum) > decimalUnits(maximum))
      ) {
        errors.push(error(code, 'invalid_definition', 'Numeric limits are invalid.'))
      }
    }
    if ((field.minimumDate != null || field.maximumDate != null) && !dateField) {
      errors.push(
        error(code, 'invalid_definition', 'Calendar-date limits apply only to date fields.'),
      )
    } else if (dateField) {
      const minimum = field.minimumDate
      const maximum = field.maximumDate
      if (
        (minimum != null && !validCalendarDate(minimum)) ||
        (maximum != null && !validCalendarDate(maximum)) ||
        (minimum != null && maximum != null && minimum > maximum)
      ) {
        errors.push(error(code, 'invalid_definition', 'Calendar-date limits are invalid.'))
      }
    }
  }
  return errors
}

export function validateAndNormalizeFormData(
  fields: readonly FormFieldValidationContract[],
  input: unknown,
  mode: FormValidationMode = 'final',
): FormValidationResult {
  const errors = definitionErrors(fields)
  const values: FormValidationResult['values'] = {}
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    errors.push(error('$form', 'invalid_payload', 'Responses must be a plain object.'))
    return { valid: false, values, errors }
  }
  const record = input as Record<string, unknown>
  const knownCodes = new Set(fields.map((field) => field.code))
  for (const key of Object.keys(record)) {
    if (!safeFieldCode.test(key) || reservedKeys.has(key) || !knownCodes.has(key)) {
      errors.push(
        error(key, 'unknown_field', 'Response field is not defined by this form version.'),
      )
    }
  }
  if (errors.some((item) => item.code === 'invalid_definition')) {
    return { valid: false, values, errors }
  }

  for (const field of fields) {
    const raw = record[field.code]
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (Array.isArray(raw) && raw.length === 0)
    if (empty) {
      values[field.code] = null
      if (mode === 'final' && field.required) {
        errors.push(error(field.code, 'required', `${field.label} is required.`))
      }
      continue
    }

    if (field.dataType === 'TEXT' || field.dataType === 'LONG_TEXT') {
      if (typeof raw !== 'string') {
        errors.push(error(field.code, 'invalid_type', `${field.label} must be text.`))
        continue
      }
      const normalized = raw.trim()
      const minimum = field.minimumLength ?? 0
      const maximum =
        field.maximumLength ??
        (field.dataType === 'LONG_TEXT'
          ? formDefinitionLimits.longTextLength
          : formDefinitionLimits.textLength)
      if (normalized.length < minimum) {
        errors.push(error(field.code, 'too_short', `${field.label} is shorter than ${minimum}.`))
      } else if (normalized.length > maximum) {
        errors.push(error(field.code, 'too_long', `${field.label} is longer than ${maximum}.`))
      } else {
        values[field.code] = normalized
      }
      continue
    }

    if (field.dataType === 'INTEGER') {
      const source =
        typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
      if (!integerPattern.test(source)) {
        errors.push(error(field.code, 'invalid_type', `${field.label} must be an integer.`))
        continue
      }
      const normalized = Number(source)
      if (
        !Number.isSafeInteger(normalized) ||
        normalized < formDefinitionLimits.integerMinimum ||
        normalized > formDefinitionLimits.integerMaximum
      ) {
        errors.push(
          error(field.code, 'invalid_value', `${field.label} is outside the integer range.`),
        )
        continue
      }
      const units = decimalUnits(String(normalized))
      const minimum =
        field.minimumValue == null
          ? null
          : decimalUnits(canonicalDecimal(field.minimumValue) as string)
      const maximum =
        field.maximumValue == null
          ? null
          : decimalUnits(canonicalDecimal(field.maximumValue) as string)
      if (minimum != null && units < minimum) {
        errors.push(error(field.code, 'below_minimum', `${field.label} is below its minimum.`))
      } else if (maximum != null && units > maximum) {
        errors.push(error(field.code, 'above_maximum', `${field.label} is above its maximum.`))
      } else {
        values[field.code] = normalized
      }
      continue
    }

    if (field.dataType === 'DECIMAL') {
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        errors.push(error(field.code, 'invalid_type', `${field.label} must be a decimal.`))
        continue
      }
      const normalized = canonicalDecimal(raw)
      if (normalized == null) {
        errors.push(
          error(
            field.code,
            'invalid_value',
            `${field.label} must have at most four decimal places.`,
          ),
        )
        continue
      }
      const units = decimalUnits(normalized)
      const minimum =
        field.minimumValue == null
          ? null
          : decimalUnits(canonicalDecimal(field.minimumValue) as string)
      const maximum =
        field.maximumValue == null
          ? null
          : decimalUnits(canonicalDecimal(field.maximumValue) as string)
      if (minimum != null && units < minimum) {
        errors.push(error(field.code, 'below_minimum', `${field.label} is below its minimum.`))
      } else if (maximum != null && units > maximum) {
        errors.push(error(field.code, 'above_maximum', `${field.label} is above its maximum.`))
      } else {
        values[field.code] = normalized
      }
      continue
    }

    if (field.dataType === 'DATE') {
      if (typeof raw !== 'string' || !validCalendarDate(raw)) {
        errors.push(
          error(field.code, 'invalid_value', `${field.label} must be a YYYY-MM-DD calendar date.`),
        )
      } else if (field.minimumDate != null && raw < field.minimumDate) {
        errors.push(
          error(field.code, 'below_minimum', `${field.label} is before its minimum date.`),
        )
      } else if (field.maximumDate != null && raw > field.maximumDate) {
        errors.push(error(field.code, 'above_maximum', `${field.label} is after its maximum date.`))
      } else {
        values[field.code] = raw
      }
      continue
    }

    if (field.dataType === 'BOOLEAN') {
      if (typeof raw !== 'boolean') {
        errors.push(error(field.code, 'invalid_type', `${field.label} must be true or false.`))
      } else {
        values[field.code] = raw
      }
      continue
    }

    const allowedValues = (field.allowedValues ?? []).map((item) => item.trim())
    if (field.dataType === 'SELECT') {
      if (typeof raw !== 'string' || !allowedValues.includes(raw.trim())) {
        errors.push(error(field.code, 'invalid_value', `${field.label} is not an allowed value.`))
      } else {
        values[field.code] = raw.trim()
      }
      continue
    }

    if (
      !Array.isArray(raw) ||
      raw.length > formDefinitionLimits.multiSelectValues ||
      raw.some((item) => typeof item !== 'string' || !allowedValues.includes(item.trim())) ||
      new Set(raw.map((item) => (typeof item === 'string' ? item.trim() : ''))).size !== raw.length
    ) {
      errors.push(
        error(field.code, 'invalid_value', `${field.label} contains invalid or duplicate values.`),
      )
    } else if (raw.length < (field.minimumLength ?? 0)) {
      errors.push(error(field.code, 'too_short', `${field.label} has too few selected values.`))
    } else if (raw.length > (field.maximumLength ?? formDefinitionLimits.multiSelectValues)) {
      errors.push(error(field.code, 'too_long', `${field.label} has too many selected values.`))
    } else {
      values[field.code] = raw.map((item) => (item as string).trim())
    }
  }
  return { valid: errors.length === 0, values, errors }
}
