import {
  beneficiaryAgeRuleMessages,
  beneficiaryRegistrationFieldRules,
  completedYearsAt,
  minimumBeneficiaryAge,
} from '@pathways/shared'

import type {
  BeneficiaryRecord,
  DigitalFormFieldDefinition,
  ProjectSummary,
} from '@/types/pathways'

type RegistrationSubjectType = 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'

const registrationProfileFieldLabels = {
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

const calendarDay = (value: string | null) => {
  if (!value) return null
  const day = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value ? day : null
}

type RegistrationAge = { age: number | null; error: string | null }

/**
 * Age in completed years at the reference date (the enrollment date; for a new registration the
 * server business date). A birth date after maxBirthDate (the business date) is reported as an
 * error instead of a silent null, as is an age below the minimum.
 */
export function registrationAgeAtDate(
  birthDate: string,
  age: string,
  referenceDate: string | null,
  maxBirthDate: string | null = referenceDate,
): RegistrationAge {
  const belowMinimum = (value: number): RegistrationAge => ({
    age: value,
    error: value < minimumBeneficiaryAge ? beneficiaryAgeRuleMessages.belowMinimumAge : null,
  })
  if (birthDate) {
    const born = calendarDay(birthDate)
    const latest = calendarDay(maxBirthDate)
    if (born && latest && born > latest)
      return { age: null, error: beneficiaryAgeRuleMessages.futureBirthDate }
    const reference = calendarDay(referenceDate)
    if (!born || !reference || born > reference) return { age: null, error: null }
    const result = completedYearsAt(born, reference)
    return result <= 130 ? belowMinimum(result) : { age: null, error: null }
  }
  if (!age.trim()) return { age: null, error: null }
  const result = Number(age)
  return Number.isInteger(result) && result >= 0 && result <= 130
    ? belowMinimum(result)
    : { age: null, error: null }
}

export function projectRegistrationValues(
  fields: readonly { code: string }[],
  protectedValues: Readonly<Record<string, unknown>>,
  customValues: Readonly<Record<string, unknown>>,
) {
  return Object.fromEntries(
    fields
      .filter(
        (field) =>
          Object.hasOwn(protectedValues, field.code) ||
          (!Object.hasOwn(beneficiaryRegistrationFieldRules, field.code) &&
            Object.hasOwn(customValues, field.code)),
      )
      .map((field) => [
        field.code,
        Object.hasOwn(protectedValues, field.code)
          ? protectedValues[field.code]
          : customValues[field.code],
      ]),
  )
}
export type BeneficiaryDraft = {
  code: string
  firstName: string
  middleName: string
  lastName: string
  sex: string
  birthDate: string
  age: string
  disabilityStatus: string
  province: string
  city: string
  barangay: string
  consentToParticipate: boolean
  consentToStoreData: boolean
  isMinor: boolean
  guardianConsent: boolean
  projectId: string
}

export const initialDraft: BeneficiaryDraft = {
  code: '',
  firstName: '',
  middleName: '',
  lastName: '',
  sex: '',
  birthDate: '',
  age: '',
  disabilityStatus: '',
  province: '',
  city: '',
  barangay: '',
  consentToParticipate: false,
  consentToStoreData: false,
  isMinor: false,
  guardianConsent: false,
  projectId: '',
}

export const beneficiarySexValue = (value: string) => {
  const values = {
    Female: 'FEMALE',
    Male: 'MALE',
    Other: 'OTHER',
    'Prefer not to say': 'PREFER_NOT_TO_SAY',
    'Not specified': 'NOT_SPECIFIED',
  } as const
  const mapped = values[value as keyof typeof values]
  if (!mapped) throw new Error('Select a supported sex value.')
  return mapped
}

export const beneficiaryDisabilityValue = (value: string) => {
  const values = {
    'With disability': 'WITH_DISABILITY',
    'Without disability': 'WITHOUT_DISABILITY',
    'Not specified': 'NOT_SPECIFIED',
  } as const
  const mapped = values[value as keyof typeof values]
  if (!mapped) throw new Error('Select a supported disability status.')
  return mapped
}

export const draftFromBeneficiary = (
  beneficiary: BeneficiaryRecord,
  projects: ProjectSummary[],
): BeneficiaryDraft => ({
  code: beneficiary.code,
  firstName: beneficiary.firstName,
  middleName: beneficiary.middleName ?? '',
  lastName: beneficiary.lastName,
  sex: beneficiary.sex,
  birthDate: beneficiary.birthDate ?? '',
  age: beneficiary.age === undefined ? '' : String(beneficiary.age),
  disabilityStatus: beneficiary.disabilityStatus,
  province: beneficiary.province,
  city: beneficiary.city,
  barangay: beneficiary.barangay,
  consentToParticipate: beneficiary.consentToParticipate,
  consentToStoreData: beneficiary.consentToStoreData,
  isMinor: beneficiary.isMinor,
  guardianConsent: beneficiary.guardianConsent,
  projectId:
    beneficiary.enrollments.find((enrollment) =>
      projects.some((project) => project.id === enrollment.projectId),
    )?.projectId ??
    beneficiary.projectIds.find((projectId) =>
      projects.some((project) => project.id === projectId),
    ) ??
    '',
})

export type BeneficiaryFieldKey =
  | 'code'
  | 'projectId'
  | 'firstName'
  | 'lastName'
  | 'sex'
  | 'birthDate'
  | 'age'
  | 'disabilityStatus'
  | 'province'
  | 'city'
  | 'barangay'
  | 'consentToParticipate'
  | 'consentToStoreData'
  | 'guardianConsent'

export type ValidationIssue = {
  field: BeneficiaryFieldKey
  message: string
}

export const fieldIds: Record<BeneficiaryFieldKey, string> = {
  code: 'beneficiary-code',
  projectId: 'beneficiary-project',
  firstName: 'beneficiary-first-name',
  lastName: 'beneficiary-last-name',
  sex: 'beneficiary-sex',
  birthDate: 'beneficiary-birth-date',
  age: 'beneficiary-age',
  disabilityStatus: 'beneficiary-disability-status',
  province: 'beneficiary-province',
  city: 'beneficiary-city',
  barangay: 'beneficiary-barangay',
  consentToParticipate: 'beneficiary-participation-consent',
  consentToStoreData: 'beneficiary-storage-consent',
  guardianConsent: 'beneficiary-guardian-consent',
}
