import type { FormFieldValidationContract, FormValueError } from './form-data'

type ActivityMonitoringFieldRule = {
  dataType: FormFieldValidationContract['dataType']
  required?: boolean
  allowedValues?: readonly string[]
}

export const activityMonitoringFieldRules = {
  beneficiary_code: { dataType: 'TEXT', required: true },
  participation_date: { dataType: 'DATE', required: true },
  attendance_status: {
    dataType: 'SELECT',
    required: true,
    allowedValues: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'],
  },
  progress_status: {
    dataType: 'SELECT',
    required: true,
    allowedValues: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'],
  },
} as const satisfies Record<string, ActivityMonitoringFieldRule>

const optionalActivityMonitoringFieldRules = {
  progress_notes: ['TEXT', 'LONG_TEXT'],
} as const

const sameValues = (actual: readonly string[] | null | undefined, expected: readonly string[]) => {
  if (!actual || actual.length !== expected.length) return false
  const actualValues = new Set(actual)
  return actualValues.size === expected.length && expected.every((value) => actualValues.has(value))
}

const definitionError = (fieldCode: string, message: string): FormValueError => ({
  fieldCode,
  code: 'invalid_definition',
  message,
})

export function activityMonitoringDefinitionErrors(
  fields: readonly FormFieldValidationContract[],
): FormValueError[] {
  const fieldsByCode = new Map(fields.map((field) => [field.code, field]))
  const errors: FormValueError[] = []

  for (const [code, rule] of Object.entries(activityMonitoringFieldRules)) {
    const field = fieldsByCode.get(code)
    if (!field) {
      errors.push(definitionError(code, `Activity monitoring form requires the ${code} field.`))
      continue
    }
    if (field.dataType !== rule.dataType) {
      errors.push(
        definitionError(code, `${field.label} must use ${rule.dataType}, not ${field.dataType}.`),
      )
      continue
    }
    if (rule.required && !field.required) {
      errors.push(definitionError(code, `${field.label} must be required.`))
    }
    if ('allowedValues' in rule && !sameValues(field.allowedValues, rule.allowedValues)) {
      errors.push(
        definitionError(
          code,
          `${field.label} must allow exactly: ${rule.allowedValues.join(', ')}.`,
        ),
      )
    }
  }

  for (const [code, allowedTypes] of Object.entries(optionalActivityMonitoringFieldRules)) {
    const field = fieldsByCode.get(code)
    if (field && !allowedTypes.includes(field.dataType as never)) {
      errors.push(
        definitionError(code, `${field.label} must use one of: ${allowedTypes.join(', ')}.`),
      )
    }
  }

  return errors
}
