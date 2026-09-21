import type { DigitalFormFieldDefinition } from '@/types/pathways'

export type RegistrationSubjectType = 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'

export const registrationProfileFieldLabels = {
  display_name: 'Display name',
  first_name: 'First name',
  middle_name: 'Middle name',
  last_name: 'Last name',
  sex: 'Sex',
  birth_date: 'Birth date',
  age_at_registration: 'Age at registration',
  disability_status: 'Disability status',
  location_province: 'Province',
  location_city_municipality: 'City or municipality',
  location_barangay: 'Barangay',
  external_identifier_type: 'External identifier namespace',
  external_identifier_value: 'External identifier value',
  is_minor: 'Minor status',
  guardian_consent_recorded: 'Guardian consent',
} as const

type RegistrationProfileFieldCode = keyof typeof registrationProfileFieldLabels

export function registrationFieldCodes(
  fields: readonly Pick<DigitalFormFieldDefinition, 'code'>[],
) {
  return new Set(fields.map((field) => field.code))
}

export function missingRegistrationProfileFields(codes: ReadonlySet<string>) {
  return (Object.keys(registrationProfileFieldLabels) as RegistrationProfileFieldCode[])
    .filter((code) => !codes.has(code))
    .map((code) => registrationProfileFieldLabels[code])
}

export function registrationSubjectDefinitionErrors(
  codes: ReadonlySet<string>,
  subjectType: RegistrationSubjectType,
) {
  const errors: string[] = []
  if (subjectType === 'INDIVIDUAL') {
    if (!codes.has('first_name')) errors.push('The selected form does not collect first_name.')
    if (!codes.has('last_name')) errors.push('The selected form does not collect last_name.')
    if (!codes.has('birth_date') && !codes.has('age_at_registration')) {
      errors.push(
        'The selected form must collect birth_date or age_at_registration for individuals.',
      )
    }
  } else if (!codes.has('display_name')) {
    errors.push('The selected form does not collect display_name for groups or communities.')
  }

  const hasMinor = codes.has('is_minor')
  const hasGuardian = codes.has('guardian_consent_recorded')
  if (hasMinor !== hasGuardian) {
    errors.push('Minor status and guardian consent fields must be collected together.')
  }

  const hasIdentifierType = codes.has('external_identifier_type')
  const hasIdentifierValue = codes.has('external_identifier_value')
  if (hasIdentifierType !== hasIdentifierValue) {
    errors.push('External identifier namespace and value fields must be collected together.')
  }
  return errors
}

export function profileUpdateFieldsForForm(codes: ReadonlySet<string>) {
  return [
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
  ].filter((code) => codes.has(code))
}
