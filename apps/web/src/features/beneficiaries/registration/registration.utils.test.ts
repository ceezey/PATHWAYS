import { describe, expect, it } from 'vitest'

import {
  missingRegistrationProfileFields,
  profileUpdateFieldsForForm,
  projectRegistrationValues,
  registrationAgeAtDate,
  registrationFieldCodes,
  registrationSubjectDefinitionErrors,
} from './registration.utils'

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

describe('Beneficiary registration values and ages', () => {
  it('preserves protected canonical precedence and omits fields not in the selected definition', () => {
    expect(
      projectRegistrationValues(
        [{ code: 'consent_recorded' }, { code: 'custom_detail' }],
        { consent_recorded: true, sex: 'NOT_SPECIFIED' },
        { consent_recorded: false, custom_detail: 'Synthetic', outside: 'omit' },
      ),
    ).toEqual({ consent_recorded: true, custom_detail: 'Synthetic' })
  })

  it('uses captured business calendar birthday boundaries and rejects invalid dates for applicability', () => {
    expect(registrationAgeAtDate('2008-09-28', '', '2026-09-27')).toEqual({ age: 17, error: null })
    expect(registrationAgeAtDate('2008-09-27', '', '2026-09-27')).toEqual({ age: 18, error: null })
    expect(registrationAgeAtDate('2026-99-99', '', '2026-09-27')).toEqual({
      age: null,
      error: null,
    })
    expect(registrationAgeAtDate('', '17', '2026-09-27')).toEqual({ age: 17, error: null })
  })

  it('reports the minimum age at the boundary and a future birth date as errors, not a silent null', () => {
    expect(registrationAgeAtDate('2021-09-27', '', '2026-09-27')).toEqual({ age: 5, error: null })
    expect(registrationAgeAtDate('2021-09-28', '', '2026-09-27')).toEqual({
      age: 4,
      error: 'Beneficiary must be at least 5 years old.',
    })
    expect(registrationAgeAtDate('', '4', '2026-09-27')).toEqual({
      age: 4,
      error: 'Beneficiary must be at least 5 years old.',
    })
    expect(registrationAgeAtDate('', '5', null)).toEqual({ age: 5, error: null })
    expect(registrationAgeAtDate('2026-09-28', '', '2026-09-27')).toEqual({
      age: null,
      error: 'Date of birth cannot be in the future.',
    })
    // An edit measures age at its enrollment date but caps the birth date at the business date.
    expect(registrationAgeAtDate('2021-01-01', '', '2026-01-15', '2026-09-27')).toEqual({
      age: 5,
      error: null,
    })
    expect(registrationAgeAtDate('2026-10-01', '', '2026-01-15', '2026-09-27').error).toBe(
      'Date of birth cannot be in the future.',
    )
  })
})
