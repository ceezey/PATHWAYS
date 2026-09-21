import type { FormFieldValidationContract, FormValueError } from './form-data'

type RegistrationFieldRule = {
  dataType: FormFieldValidationContract['dataType']
  required?: boolean
  allowedValues?: readonly string[]
}

export const beneficiaryRegistrationFieldRules = {
  registration_operation: {
    dataType: 'SELECT',
    required: true,
    allowedValues: ['CREATE', 'LINK', 'UPDATE'],
  },
  beneficiary_code: { dataType: 'TEXT', required: true },
  subject_type: {
    dataType: 'SELECT',
    required: true,
    allowedValues: ['INDIVIDUAL', 'GROUP', 'COMMUNITY'],
  },
  display_name: { dataType: 'TEXT' },
  first_name: { dataType: 'TEXT' },
  middle_name: { dataType: 'TEXT' },
  last_name: { dataType: 'TEXT' },
  sex: {
    dataType: 'SELECT',
    allowedValues: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'],
  },
  birth_date: { dataType: 'DATE' },
  age_at_registration: { dataType: 'INTEGER' },
  disability_status: {
    dataType: 'SELECT',
    allowedValues: ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
  },
  location_barangay: { dataType: 'TEXT' },
  location_city_municipality: { dataType: 'TEXT' },
  location_province: { dataType: 'TEXT' },
  consent_recorded: { dataType: 'BOOLEAN', required: true },
  data_processing_consent_recorded: { dataType: 'BOOLEAN', required: true },
  is_minor: { dataType: 'BOOLEAN' },
  guardian_consent_recorded: { dataType: 'BOOLEAN' },
  enrollment_date: { dataType: 'DATE', required: true },
  external_identifier_type: { dataType: 'TEXT' },
  external_identifier_value: { dataType: 'TEXT' },
  profile_update_fields: {
    dataType: 'MULTIPLE_SELECT',
    allowedValues: [
      'display_name',
      'first_name',
      'middle_name',
      'last_name',
      'sex',
      'birth_date',
      'age_at_registration',
      'disability_status',
      'location_barangay',
      'location_city_municipality',
      'location_province',
    ],
  },
} as const satisfies Record<string, RegistrationFieldRule>

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

export function beneficiaryRegistrationDefinitionErrors(
  fields: readonly FormFieldValidationContract[],
): FormValueError[] {
  const fieldsByCode = new Map(fields.map((field) => [field.code, field]))
  const errors: FormValueError[] = []

  for (const [code, rule] of Object.entries(beneficiaryRegistrationFieldRules)) {
    const field = fieldsByCode.get(code)
    const required = 'required' in rule && rule.required
    if (!field) {
      if (required) {
        errors.push(definitionError(code, `Registration form requires the ${code} field.`))
      }
      continue
    }
    if (field.dataType !== rule.dataType) {
      errors.push(
        definitionError(code, `${field.label} must use ${rule.dataType}, not ${field.dataType}.`),
      )
      continue
    }
    if (required && !field.required) {
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

  return errors
}
