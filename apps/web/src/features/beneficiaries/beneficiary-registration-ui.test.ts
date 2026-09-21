import { describe, expect, it } from 'vitest'

import {
  missingRegistrationProfileFields,
  profileUpdateFieldsForForm,
  registrationFieldCodes,
  registrationSubjectDefinitionErrors,
} from './beneficiary-registration-ui'

const fields = (...codes: string[]) => codes.map((code) => ({ code }))

describe('Beneficiary registration UI field coverage', () => {
  it('reports profile fields omitted by the published form instead of implying they will be saved', () => {
    const codes = registrationFieldCodes(
      fields(
        'registration_operation',
        'beneficiary_code',
        'subject_type',
        'first_name',
        'last_name',
        'sex',
        'birth_date',
        'is_minor',
        'consent_recorded',
        'data_processing_consent_recorded',
        'guardian_consent_recorded',
        'enrollment_date',
      ),
    )

    expect(missingRegistrationProfileFields(codes)).toEqual(
      expect.arrayContaining([
        'Display name',
        'Middle name',
        'Age at registration',
        'Disability status',
        'Province',
        'City or municipality',
        'Barangay',
      ]),
    )
  })

  it('accepts an individual-capable definition with first/last name and birth date', () => {
    const codes = registrationFieldCodes(
      fields('first_name', 'last_name', 'birth_date', 'is_minor', 'guardian_consent_recorded'),
    )
    expect(registrationSubjectDefinitionErrors(codes, 'INDIVIDUAL')).toEqual([])
  })

  it('rejects an individual definition with neither birth date nor age', () => {
    const codes = registrationFieldCodes(
      fields('first_name', 'last_name', 'is_minor', 'guardian_consent_recorded'),
    )
    expect(registrationSubjectDefinitionErrors(codes, 'INDIVIDUAL')).toContain(
      'The selected form must collect birth_date or age_at_registration for individuals.',
    )
  })

  it('requires display_name for group/community registration', () => {
    const codes = registrationFieldCodes(fields('is_minor', 'guardian_consent_recorded'))
    expect(registrationSubjectDefinitionErrors(codes, 'GROUP')).toContain(
      'The selected form does not collect display_name for groups or communities.',
    )
  })

  it('does not allow UPDATE to name profile fields the form did not collect', () => {
    const codes = registrationFieldCodes(fields('display_name', 'first_name', 'last_name'))
    expect(profileUpdateFieldsForForm(codes)).toEqual(['display_name', 'first_name', 'last_name'])
  })
})
