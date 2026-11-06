import { BadRequestException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'

import {
  beneficiaryAgeRuleMessages,
  businessCalendarDate,
  completedYearsAt,
  minimumBeneficiaryAge,
} from '@pathways/shared'

export { normalizeIdentifier } from '@pathways/imports/server'

const registrationCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/

const externalIdentifierTypePattern = /^[A-Z][A-Z0-9_]{1,31}$/

export function canonicalCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return registrationCodePattern.test(code) ? code : null
}

export function canonicalIdentifierType(value: unknown) {
  if (typeof value !== 'string') return null
  const type = value.trim().toUpperCase()
  if (!externalIdentifierTypePattern.test(type)) return null
  if (['PATHWAYS_CODE', 'EMAIL', 'NAME', 'BIRTH_DATE'].includes(type)) return null
  return type
}

export function canonicalIdentifierValue(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized.length >= 1 && normalized.length <= 160 ? normalized : null
}

export type NormalizedValue = string | number | boolean | string[] | null

export const writableProfileFields = new Set([
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
])

export function exactDate(value: NormalizedValue | undefined, field: string) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} must be a calendar date in YYYY-MM-DD format.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a real calendar date.`)
  }
  return date
}

function text(value: NormalizedValue | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function enumValue<T extends string>(
  value: NormalizedValue | undefined,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} is invalid.`)
  }
  return value as T
}

export const yearsAt = completedYearsAt

/** The configured business calendar date as a UTC-midnight date, the same clock as registration context. */
export function businessToday() {
  return new Date(
    `${businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)}T00:00:00.000Z`,
  )
}

export const guardianConsentRequiredMessage =
  'Guardian consent is required while the participant is under 18.'

/** Minor means under 18 on the given date by birth date, else by the supplied age; a future birth is no age. */
export function isMinorOn(birthDate: Date | null, age: number | null, on: Date) {
  const years = birthDate ? yearsAt(birthDate, on) : age
  return years !== null && years >= 0 && years < 18
}

/**
 * Minimum-age and future-birth-date rule shared by registration (direct and imported) and
 * profile edits. Existing under-age records stay valid; the caller decides when it applies.
 */
export function assertRegistrationAge(birthDate: Date | null, age: number | null, today: Date) {
  if (birthDate && birthDate > today) {
    throw new BadRequestException(beneficiaryAgeRuleMessages.futureBirthDate)
  }
  if (age !== null && age < minimumBeneficiaryAge) {
    throw new BadRequestException(beneficiaryAgeRuleMessages.belowMinimumAge)
  }
}

export function stableValues(value: Record<string, NormalizedValue>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  )
}

export type RegistrationProfile = {
  operation: 'CREATE' | 'LINK' | 'UPDATE'
  code: string
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'
  displayName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'
  birthDate: Date | null
  ageAtRegistration: number | null
  disabilityStatus: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'
  locationBarangay: string | null
  locationCityMunicipality: string | null
  locationProvince: string | null
  consentRecorded: true
  dataProcessingConsentRecorded: true
  isMinor: boolean
  guardianConsentRecorded: boolean
  enrollmentDate: Date
  externalIdentifier: { type: string; value: string } | null
  updateFields: string[]
}

export function parseRegistration(
  values: Record<string, NormalizedValue>,
  today: Date = businessToday(),
  options: { guardianFromProfile?: boolean } = {},
): RegistrationProfile {
  const operation = enumValue(
    values.registration_operation,
    ['CREATE', 'LINK', 'UPDATE'] as const,
    'registration_operation',
  )
  const code = canonicalCode(values.beneficiary_code)
  if (!code) throw new BadRequestException('beneficiary_code is invalid.')
  const subjectType = enumValue(
    values.subject_type,
    ['INDIVIDUAL', 'GROUP', 'COMMUNITY'] as const,
    'subject_type',
  )
  const enrollmentDate = exactDate(values.enrollment_date, 'enrollment_date')
  if (!enrollmentDate) throw new BadRequestException('enrollment_date is required.')
  if (enrollmentDate > today) throw new BadRequestException('enrollment_date cannot be future.')

  const participationConsent = values.consent_recorded
  const dataConsent = values.data_processing_consent_recorded
  if (participationConsent !== true || dataConsent !== true) {
    throw new BadRequestException(
      'Participation and data-processing consent must be explicitly recorded.',
    )
  }
  const guardianConsent = values.guardian_consent_recorded === true
  const birthDate = exactDate(values.birth_date, 'birth_date')
  const age = values.age_at_registration
  if (
    age !== null &&
    age !== undefined &&
    (!Number.isInteger(age) || Number(age) < 0 || Number(age) > 130)
  ) {
    throw new BadRequestException('age_at_registration must be an integer from 0 through 130.')
  }
  const ageAtRegistration = typeof age === 'number' ? age : null

  let isMinor = false
  const firstName = text(values.first_name)
  const middleName = text(values.middle_name)
  const lastName = text(values.last_name)
  const explicitDisplayName = text(values.display_name)
  if (subjectType === 'INDIVIDUAL') {
    if (!firstName || !lastName) {
      throw new BadRequestException('Individual registrations require first_name and last_name.')
    }
    if (!birthDate && ageAtRegistration === null) {
      throw new BadRequestException(
        'Individual registrations require birth_date or age_at_registration.',
      )
    }
    if (birthDate && birthDate > today) {
      throw new BadRequestException(beneficiaryAgeRuleMessages.futureBirthDate)
    }
    if (birthDate && birthDate > enrollmentDate) {
      throw new BadRequestException('birth_date cannot be after enrollment_date.')
    }
    if (
      birthDate &&
      ageAtRegistration !== null &&
      yearsAt(birthDate, enrollmentDate) !== ageAtRegistration
    ) {
      throw new BadRequestException('birth_date and age_at_registration are inconsistent.')
    }
    const derivedAge = birthDate ? yearsAt(birthDate, enrollmentDate) : ageAtRegistration
    assertRegistrationAge(birthDate, derivedAge, today)
    // Minor status is current, so the supplied is_minor is ignored; only a minor needs guardian consent.
    isMinor = isMinorOn(birthDate, ageAtRegistration, today)
    // An import that links or updates a profile is judged by the stored guardian flag, not the row's.
    const profileJudges = options.guardianFromProfile && operation !== 'CREATE'
    if (isMinor && !guardianConsent && !profileJudges) {
      throw new BadRequestException(guardianConsentRequiredMessage)
    }
  } else {
    if (!explicitDisplayName)
      throw new BadRequestException('Group/community records require display_name.')
    if (
      firstName ||
      middleName ||
      lastName ||
      birthDate ||
      ageAtRegistration !== null ||
      values.is_minor === true ||
      guardianConsent ||
      (values.sex != null && values.sex !== 'NOT_SPECIFIED')
    ) {
      throw new BadRequestException(
        'Person-only name, age, birth and guardian fields do not apply to groups or communities.',
      )
    }
  }

  const identifierTypeValue = values.external_identifier_type
  const identifierValueValue = values.external_identifier_value
  const identifierType = canonicalIdentifierType(identifierTypeValue)
  const identifierValue = canonicalIdentifierValue(identifierValueValue)
  if (
    (identifierTypeValue != null || identifierValueValue != null) &&
    (!identifierType || !identifierValue)
  ) {
    throw new BadRequestException(
      'External identifier type and value must be supplied together and use a stable non-demographic namespace.',
    )
  }

  const updateFieldsValue = values.profile_update_fields
  const updateFields = Array.isArray(updateFieldsValue)
    ? updateFieldsValue.filter((item): item is string => typeof item === 'string')
    : []
  if (operation === 'UPDATE') {
    if (
      updateFields.length === 0 ||
      updateFields.some((field) => !writableProfileFields.has(field))
    ) {
      throw new BadRequestException(
        'UPDATE requires an explicit allowlisted profile_update_fields selection.',
      )
    }
  } else if (updateFields.length > 0) {
    throw new BadRequestException('profile_update_fields is only valid for UPDATE.')
  }

  return {
    operation,
    code,
    subjectType,
    displayName: explicitDisplayName ?? [firstName, middleName, lastName].filter(Boolean).join(' '),
    firstName,
    middleName,
    lastName,
    sex: enumValue(
      values.sex ?? 'NOT_SPECIFIED',
      ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const,
      'sex',
    ),
    birthDate,
    ageAtRegistration,
    disabilityStatus: enumValue(
      values.disability_status ?? 'NOT_SPECIFIED',
      ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const,
      'disability_status',
    ),
    locationBarangay: text(values.location_barangay),
    locationCityMunicipality: text(values.location_city_municipality),
    locationProvince: text(values.location_province),
    consentRecorded: true,
    dataProcessingConsentRecorded: true,
    isMinor,
    guardianConsentRecorded: guardianConsent,
    enrollmentDate,
    externalIdentifier:
      identifierType && identifierValue ? { type: identifierType, value: identifierValue } : null,
    updateFields,
  }
}
