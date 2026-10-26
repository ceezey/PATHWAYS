import { businessCalendarDate } from '@pathways/shared'
import { useMemo } from 'react'

import type { BeneficiaryRecord, BeneficiaryRegistrationContext } from '@/types/pathways'
import {
  type BeneficiaryDraft,
  type BeneficiaryFieldKey,
  type ValidationIssue,
  registrationAgeAtDate,
} from '../registration.utils'

export const useRegistrationValidation = ({
  beneficiary,
  draft,
  registrationForm,
  registrationContext,
}: {
  beneficiary?: BeneficiaryRecord
  draft: BeneficiaryDraft
  registrationForm?: BeneficiaryRegistrationContext['definitions'][number]
  registrationContext: BeneficiaryRegistrationContext | null
}) => {
  const profileFieldCodes: Partial<Record<BeneficiaryFieldKey, string>> = {
    code: 'beneficiary_code',
    firstName: 'first_name',
    lastName: 'last_name',
    sex: 'sex',
    birthDate: 'birth_date',
    age: 'age_at_registration',
    disabilityStatus: 'disability_status',
    province: 'location_province',
    city: 'location_city_municipality',
    barangay: 'location_barangay',
    consentToParticipate: 'consent_recorded',
    consentToStoreData: 'data_processing_consent_recorded',
    guardianConsent: 'guardian_consent_recorded',
  }
  const supportsCode = (code: string) =>
    Boolean(
      beneficiary ||
        !registrationForm ||
        registrationForm.fields.some((field) => field.code === code),
    )
  const supportsProfileField = (key: BeneficiaryFieldKey) =>
    !profileFieldCodes[key] || supportsCode(profileFieldCodes[key])

  const acceptsBirthDate = Boolean(
    !registrationForm || registrationForm.fields.some((field) => field.code === 'birth_date'),
  )
  const acceptsAge = Boolean(
    !registrationForm ||
      registrationForm.fields.some((field) => field.code === 'age_at_registration'),
  )
  const acceptedBirthDate = beneficiary || acceptsBirthDate ? draft.birthDate : ''
  const acceptedAge = beneficiary || acceptsAge ? draft.age : ''
  // A new registration is enrolled on the server business date; an edit keeps its enrollment date.
  const maxBirthDate = beneficiary
    ? businessCalendarDate(new Date(), 'Asia/Manila')
    : (registrationContext?.businessDate ?? null)
  const ageReferenceDate = beneficiary
    ? (beneficiary.enrollments.find((enrollment) => enrollment.projectId === draft.projectId)
        ?.enrolledAt ?? null)
    : (registrationContext?.businessDate ?? null)
  const ageAssessment = registrationAgeAtDate(
    acceptedBirthDate,
    acceptedAge,
    ageReferenceDate,
    maxBirthDate,
  )
  const registrationAge = ageAssessment.age
  const ageFromBirthDate = Boolean(acceptedBirthDate)
  const submittedAge = ageFromBirthDate
    ? registrationAge
    : acceptedAge.trim()
      ? Number(acceptedAge)
      : null
  // Edits of existing records apply the age rules only when the birth date or age changes.
  const ageRuleApplies =
    !beneficiary ||
    draft.birthDate !== (beneficiary.birthDate ?? '') ||
    submittedAge !== (beneficiary.age ?? null)
  const ageRuleMessage = ageRuleApplies ? ageAssessment.error : null
  const ageRuleField: BeneficiaryFieldKey = ageFromBirthDate ? 'birthDate' : 'age'
  // Minor means under 18 today, by the birth date or else the supplied age, as the server judges it.
  const currentAge = registrationAgeAtDate(
    acceptedBirthDate,
    acceptedAge,
    maxBirthDate,
    maxBirthDate,
  ).age
  const registrationIsMinor = currentAge === null ? null : currentAge < 18
  // Guardian consent only applies to minors; a record without a usable age keeps its stored status.
  const showsGuardianConsent = registrationIsMinor ?? (beneficiary ? draft.isMinor : false)
  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = []

    if (!draft.code.trim()) {
      issues.push({ field: 'code', message: 'Enter a beneficiary code.' })
    }
    if (!draft.projectId) {
      issues.push({ field: 'projectId', message: 'Select a project enrollment.' })
    }
    if (!draft.firstName.trim()) {
      issues.push({ field: 'firstName', message: 'Enter a first name.' })
    }
    if (!draft.lastName.trim()) {
      issues.push({ field: 'lastName', message: 'Enter a last name.' })
    }
    if (!['Female', 'Male', 'Other', 'Prefer not to say', 'Not specified'].includes(draft.sex)) {
      issues.push({ field: 'sex', message: 'Select a sex value.' })
    }
    if (!acceptedBirthDate && !acceptedAge) {
      issues.push({
        field: acceptsBirthDate ? 'birthDate' : 'age',
        message: 'Enter the birth date or age accepted by the selected form.',
      })
    }
    if (ageRuleMessage) issues.push({ field: ageRuleField, message: ageRuleMessage })
    if (
      !['With disability', 'Without disability', 'Not specified'].includes(draft.disabilityStatus)
    ) {
      issues.push({ field: 'disabilityStatus', message: 'Select a disability status.' })
    }
    if (!draft.province.trim()) {
      issues.push({ field: 'province', message: 'Enter a province.' })
    }
    if (!draft.city.trim()) {
      issues.push({ field: 'city', message: 'Enter a city or municipality.' })
    }
    if (!draft.barangay.trim()) {
      issues.push({ field: 'barangay', message: 'Enter a barangay.' })
    }
    if (!beneficiary && !draft.consentToParticipate) {
      issues.push({
        field: 'consentToParticipate',
        message: 'Confirm beneficiary consent to participate.',
      })
    }
    if (!beneficiary && !draft.consentToStoreData) {
      issues.push({
        field: 'consentToStoreData',
        message: 'Confirm consent to store beneficiary data.',
      })
    }
    if (!beneficiary && registrationIsMinor === true && !draft.guardianConsent) {
      issues.push({
        field: 'guardianConsent',
        message: 'Confirm guardian consent for a beneficiary marked as a minor.',
      })
    }

    return issues
  }, [
    beneficiary,
    draft,
    acceptedBirthDate,
    acceptedAge,
    acceptsBirthDate,
    registrationIsMinor,
    ageRuleMessage,
    ageRuleField,
  ])

  const fieldErrors = useMemo(
    () =>
      Object.fromEntries(validationIssues.map((issue) => [issue.field, issue.message])) as Partial<
        Record<BeneficiaryFieldKey, string>
      >,
    [validationIssues],
  )

  return {
    supportsCode,
    supportsProfileField,
    maxBirthDate,
    registrationAge,
    ageFromBirthDate,
    submittedAge,
    ageRuleMessage,
    ageRuleField,
    registrationIsMinor,
    showsGuardianConsent,
    validationIssues,
    fieldErrors,
  }
}
