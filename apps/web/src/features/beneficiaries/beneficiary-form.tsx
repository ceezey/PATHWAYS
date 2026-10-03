'use client'

import { FormDefinitionEntryField } from '@/features/collection/form-definition-entry-field'
import {
  beneficiaryAgeRuleMessages,
  beneficiaryRegistrationFieldRules,
  businessCalendarDate,
  completedYearsAt,
  minimumBeneficiaryAge,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'
import { createdSince, hashFingerprint } from '@/lib/forms/pending-create'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  BeneficiaryRecord,
  BeneficiaryRegistrationContext,
  ProjectSummary,
} from '@/types/pathways'

const calendarDay = (value: string | null) => {
  if (!value) return null
  const day = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value ? day : null
}

export type RegistrationAge = { age: number | null; error: string | null }

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
type BeneficiaryDraft = {
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

const initialDraft: BeneficiaryDraft = {
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

const beneficiarySexValue = (value: string) => {
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

const beneficiaryDisabilityValue = (value: string) => {
  const values = {
    'With disability': 'WITH_DISABILITY',
    'Without disability': 'WITHOUT_DISABILITY',
    'Not specified': 'NOT_SPECIFIED',
  } as const
  const mapped = values[value as keyof typeof values]
  if (!mapped) throw new Error('Select a supported disability status.')
  return mapped
}

const draftFromBeneficiary = (
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

type BeneficiaryFieldKey =
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

type ValidationIssue = {
  field: BeneficiaryFieldKey
  message: string
}

const fieldIds: Record<BeneficiaryFieldKey, string> = {
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

export const BeneficiaryForm = (props: {
  projects: ProjectSummary[]
  beneficiary?: BeneficiaryRecord
}) => {
  const { profile } = useCurrentRole()
  const [projectId, setProjectId] = useState(
    props.beneficiary ? draftFromBeneficiary(props.beneficiary, props.projects).projectId : '',
  )
  const scope = useSensitiveDraftOwner(
    profile,
    'beneficiary',
    props.beneficiary ? 'beneficiaries.profiles.update' : 'beneficiaries.records.register',
    projectId || null,
    props.beneficiary?.id ?? null,
  )
  if (!scope) return <output>Current beneficiary access is required.</output>
  return (
    <ScopedBeneficiaryForm
      key={scope.key + scope.generation}
      {...props}
      scope={scope}
      selectedProjectId={projectId}
      onProjectChange={setProjectId}
    />
  )
}
const ScopedBeneficiaryForm = ({
  projects,
  beneficiary,
  scope,
  selectedProjectId,
  onProjectChange,
}: {
  projects: ProjectSummary[]
  beneficiary?: BeneficiaryRecord
  scope: SensitiveDraftOwner
  selectedProjectId: string
  onProjectChange: (projectId: string) => void
}) => {
  const router = useRouter()
  const { profile, role } = useCurrentRole()
  const pendingCreate = usePendingCreate<BeneficiaryRecord>({
    profile,
    kind: 'beneficiary',
    projectId: selectedProjectId || null,
    successMessage: 'Beneficiary registered',
    findCreated: async (fingerprint, startedAt) => {
      if (!role) return null
      const records = await pathwaysClient.getBeneficiaryRecordsForRole(role, selectedProjectId)
      for (const record of records) {
        if (!createdSince(record.updatedAt, startedAt)) continue
        const hash = await hashFingerprint(
          record.firstName,
          record.lastName,
          record.birthDate ?? '',
        )
        if (hash === fingerprint) return record
      }
      return null
    },
    onConfirmed: (record) => {
      removeSensitiveDraft(scope.key)
      router.push(`/beneficiaries/${record.id}?projectId=${encodeURIComponent(selectedProjectId)}`)
    },
  })
  const startingDraft = useMemo(
    () =>
      beneficiary
        ? draftFromBeneficiary(beneficiary, projects)
        : { ...initialDraft, projectId: selectedProjectId },
    [beneficiary, projects, selectedProjectId],
  )
  const draftStorageKey = scope.key
  const [draft, setDraft] = useState<BeneficiaryDraft>(startingDraft)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const clientRegistrationId = useRef<string | null>(null)
  const [registrationContext, setRegistrationContext] =
    useState<BeneficiaryRegistrationContext | null>(null)
  const [contextState, setContextState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [contextAttempt, setContextAttempt] = useState(0)
  const [selectedFormId, setSelectedFormId] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [definitionErrors, setDefinitionErrors] = useState<
    ReturnType<typeof validateAndNormalizeFormData>['errors']
  >([])
  useEffect(() => {
    if (beneficiary || !selectedProjectId || !scope.isCurrent()) return
    let active = true
    void contextAttempt
    setRegistrationContext(null)
    setSelectedFormId('')
    setCustomValues({})
    setDefinitionErrors([])
    setConfirmOpen(false)
    setContextState('loading')
    void pathwaysClient
      .getBeneficiaryRegistrationContext(selectedProjectId)
      // Without an eligible published form, provision the fixed system default form once; the
      // server rechecks registration scope and returns the refreshed blank context.
      .then((context) =>
        context.definitions.length === 0 && active && scope.isCurrent()
          ? pathwaysClient.ensureDefaultRegistrationForm(selectedProjectId)
          : context,
      )
      .then((context) => {
        if (!active || !scope.isCurrent()) return
        setRegistrationContext(context)
        setSelectedFormId(context.definitions.length === 1 ? context.definitions[0].id : '')
        setContextState('ready')
      })
      .catch(() => {
        if (active && scope.isCurrent()) setContextState('error')
      })
    return () => {
      active = false
    }
  }, [beneficiary, selectedProjectId, contextAttempt, scope.isCurrent])
  const registrationForm = registrationContext?.definitions.find(
    (definition) => definition.id === selectedFormId,
  )
  const customFields =
    registrationForm?.fields.filter(
      (field) => !Object.hasOwn(beneficiaryRegistrationFieldRules, field.code),
    ) ?? []

  useEffect(() => {
    setDraft(startingDraft)
    setDraftRecovered(false)
    setSubmitted(false)

    try {
      const stored = scope.isCurrent() ? readSensitiveDraft(draftStorageKey) : null
      if (stored) {
        const parsed = stored as Partial<Record<keyof BeneficiaryDraft, unknown>>
        if (parsed.projectId !== selectedProjectId) return
        const restored = { ...startingDraft }

        for (const key of Object.keys(startingDraft) as Array<keyof BeneficiaryDraft>) {
          if (
            beneficiary &&
            [
              'code',
              'projectId',
              'consentToParticipate',
              'consentToStoreData',
              'isMinor',
              'guardianConsent',
            ].includes(key)
          )
            continue
          if (
            typeof parsed[key] === typeof startingDraft[key] &&
            (typeof parsed[key] !== 'string' || (parsed[key] as string).length <= 10_000)
          ) {
            Object.assign(restored, { [key]: parsed[key] })
          }
        }

        setDraft(restored)
        setDraftRecovered(true)
      }
    } catch {
      removeSensitiveDraft(draftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [draftStorageKey, startingDraft, selectedProjectId, beneficiary, scope.isCurrent])

  useEffect(() => {
    if (!draftHydrated || !scope.isCurrent()) {
      return
    }

    if (JSON.stringify(draft) === JSON.stringify(startingDraft)) {
      removeSensitiveDraft(draftStorageKey)
    } else {
      writeSensitiveDraft(draftStorageKey, draft, scope.generation)
    }
  }, [draft, draftHydrated, draftStorageKey, startingDraft, scope.isCurrent, scope.generation])

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
  const registrationIsMinor = registrationAge === null ? null : registrationAge < 18
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

  const updateDraft = <Key extends keyof BeneficiaryDraft>(
    key: Key,
    value: BeneficiaryDraft[Key],
  ) => {
    setConfirmOpen(false)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Required-field errors appear after a save attempt; an age-rule error appears as soon as the
  // entered birth date or age breaks the rule.
  const visibleError = (field: BeneficiaryFieldKey) =>
    submitted || (ageRuleMessage && ageRuleField === field) ? fieldErrors[field] : undefined

  const controlA11y = (field: BeneficiaryFieldKey) => ({
    'aria-describedby': visibleError(field) ? `${fieldIds[field]}-error` : undefined,
    'aria-invalid': Boolean(visibleError(field)),
    id: fieldIds[field],
  })

  const registrationValues = () => {
    const values: Record<string, unknown> = {
      registration_operation: 'CREATE',
      beneficiary_code: draft.code.trim().toUpperCase(),
      subject_type: 'INDIVIDUAL',
      display_name: [
        supportsCode('first_name') ? draft.firstName : '',
        supportsCode('middle_name') ? draft.middleName : '',
        supportsCode('last_name') ? draft.lastName : '',
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' '),
      first_name: draft.firstName.trim(),
      middle_name: draft.middleName.trim() || null,
      last_name: draft.lastName.trim(),
      sex: supportsCode('sex') ? beneficiarySexValue(draft.sex) : null,
      birth_date: draft.birthDate || null,
      age_at_registration: submittedAge,
      disability_status: supportsCode('disability_status')
        ? beneficiaryDisabilityValue(draft.disabilityStatus)
        : null,
      location_barangay: draft.barangay.trim(),
      location_city_municipality: draft.city.trim(),
      location_province: draft.province.trim(),
      consent_recorded: draft.consentToParticipate,
      data_processing_consent_recorded: draft.consentToStoreData,
      is_minor: registrationIsMinor ?? draft.isMinor,
      guardian_consent_recorded: draft.guardianConsent,
      enrollment_date: registrationContext?.businessDate ?? null,
      external_identifier_type: null,
      external_identifier_value: null,
      profile_update_fields: null,
    }
    return projectRegistrationValues(registrationForm?.fields ?? [], values, customValues)
  }

  const individualSupportIssue =
    registrationForm &&
    (!supportsCode('first_name') ||
      !supportsCode('last_name') ||
      (!supportsCode('birth_date') && !supportsCode('age_at_registration')) ||
      (registrationIsMinor === true &&
        (!supportsCode('is_minor') || !supportsCode('guardian_consent_recorded'))))
      ? 'This published definition does not support the current individual registration. Choose another form or request an authorized form update.'
      : null
  const displayedValidationIssues = beneficiary
    ? validationIssues
    : validationIssues.filter((issue) =>
        issue.field === 'birthDate'
          ? supportsCode('birth_date') || supportsCode('age_at_registration')
          : supportsProfileField(issue.field),
      )
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)

    if (!beneficiary && individualSupportIssue) {
      toast.error(individualSupportIssue)
      return
    }
    const supportedIssues = displayedValidationIssues
    if (supportedIssues.length > 0) {
      toast.error('Check beneficiary form fields.', {
        description: `${supportedIssues.length} ${supportedIssues.length === 1 ? 'field needs' : 'fields need'} attention. Review the complete summary in the form.`,
      })
      document.getElementById(fieldIds[supportedIssues[0].field])?.focus()
      return
    }

    if (!beneficiary) {
      if (contextState !== 'ready' || !registrationForm || !scope.isCurrent()) {
        toast.error('Choose an available published registration form before continuing.')
        return
      }
      const values = registrationValues()
      if (!values.birth_date && values.age_at_registration == null) {
        toast.error('Enter the birth date or age accepted by the selected form.')
        return
      }
      const result = validateAndNormalizeFormData(registrationForm.fields, values)
      setDefinitionErrors(result.errors)
      if (!result.valid) {
        toast.error('Check registration form fields.')
        const first = result.errors[0]
        if (first) document.getElementById(`entry-${first.fieldCode}`)?.focus()
        return
      }
    }
    setConfirmOpen(true)
  }

  const confirmSave = async () => {
    if (saving || !scope.isCurrent()) return
    setSaving(true)

    try {
      if (beneficiary) {
        if (beneficiary.subjectType !== 'INDIVIDUAL') {
          throw new Error(
            'This editor supports individual beneficiary profiles. Group and community corrections remain unavailable.',
          )
        }
        const saved = await pathwaysClient.updateBeneficiary(draft.projectId, beneficiary.id, {
          subjectType: beneficiary.subjectType,
          displayName: [
            supportsCode('first_name') ? draft.firstName : '',
            supportsCode('middle_name') ? draft.middleName : '',
            supportsCode('last_name') ? draft.lastName : '',
          ]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' '),
          firstName: draft.firstName.trim(),
          middleName: draft.middleName.trim() || undefined,
          lastName: draft.lastName.trim(),
          sex: beneficiarySexValue(draft.sex),
          birthDate: draft.birthDate || undefined,
          ageAtRegistration: submittedAge ?? undefined,
          disabilityStatus: beneficiaryDisabilityValue(draft.disabilityStatus),
          locationBarangay: draft.barangay.trim(),
          locationCityMunicipality: draft.city.trim(),
          locationProvince: draft.province.trim(),
          expectedUpdatedAt: beneficiary.updatedAt,
        })
        if (!scope.isCurrent()) return
        removeSensitiveDraft(draftStorageKey)
        setConfirmOpen(false)
        toast.success('Beneficiary profile updated.')
        router.push(`/beneficiaries/${saved.id}?projectId=${encodeURIComponent(draft.projectId)}`)
        return
      }

      if (contextState !== 'ready' || !registrationForm || !registrationContext) {
        throw new Error('Choose an available published registration form before continuing.')
      }
      if (individualSupportIssue) throw new Error(individualSupportIssue)
      const values = registrationValues()
      if (!values.birth_date && values.age_at_registration == null)
        throw new Error('Enter the birth date or age accepted by the selected form.')
      const result = validateAndNormalizeFormData(registrationForm.fields, values)
      setDefinitionErrors(result.errors)
      if (!result.valid) throw new Error('Check registration form fields.')
      clientRegistrationId.current ??= crypto.randomUUID()
      if (!scope.isCurrent()) return
      const registrationId = clientRegistrationId.current
      const saved = await pendingCreate.submit(
        await hashFingerprint(draft.firstName, draft.lastName, draft.birthDate),
        () =>
          pathwaysClient.registerBeneficiary(draft.projectId, {
            formId: registrationForm.id,
            clientRegistrationId: registrationId,
            values: result.values,
          }),
      )
      if (!saved || !scope.isCurrent()) return
      removeSensitiveDraft(draftStorageKey)
      setConfirmOpen(false)
      clientRegistrationId.current = null
      toast.success('Beneficiary registered.')
      router.push(`/beneficiaries/${saved.id}?projectId=${encodeURIComponent(draft.projectId)}`)
    } catch (error) {
      if (!scope.isCurrent()) return
      toast.error(error instanceof Error ? error.message : 'The beneficiary could not be saved.')
    } finally {
      if (scope.isCurrent()) setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {beneficiary ? 'Edit beneficiary profile' : 'Add beneficiary'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {beneficiary
                ? 'Update this coded profile using the existing consent and project enrollment fields.'
                : 'Create a coded profile with consent and project enrollment fields.'}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link
            href={
              beneficiary
                ? `/beneficiaries/${beneficiary.id}?projectId=${encodeURIComponent(draft.projectId)}`
                : '/beneficiaries'
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {beneficiary ? 'Back to profile' : 'Back to directory'}
          </Link>
        </Button>
      </section>

      {draftRecovered ? (
        <output
          aria-atomic="true"
          aria-live="polite"
          className="block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info"
        >
          Recovered your unsaved beneficiary draft.
        </output>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="space-y-5 rounded-2xl border border-border bg-card p-5"
          noValidate
          onSubmit={handleSubmit}
        >
          {!beneficiary && selectedProjectId ? (
            <section aria-label="Registration form" className="space-y-3">
              {contextState === 'loading' ? <output>Loading registration forms.</output> : null}
              {contextState === 'error' ? (
                <div role="alert">
                  Registration forms could not be loaded.
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setContextAttempt((attempt) => attempt + 1)}
                  >
                    Retry registration forms
                  </Button>
                </div>
              ) : null}
              {contextState === 'ready' && registrationContext?.definitions.length === 0 ? (
                <p role="alert">
                  No registration form is available for this project. Ask a form manager to publish
                  one.
                </p>
              ) : null}
              {contextState === 'ready' &&
              registrationContext &&
              registrationContext.definitions.length > 1 ? (
                <>
                  <Label htmlFor="registration-definition">Published registration form</Label>
                  <Select
                    value={selectedFormId || 'unselected'}
                    disabled={saving}
                    onValueChange={(id) => {
                      setSelectedFormId(id === 'unselected' ? '' : id)
                      setCustomValues({})
                      setDefinitionErrors([])
                      setConfirmOpen(false)
                    }}
                  >
                    <SelectTrigger id="registration-definition" aria-required="true">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unselected">Choose a form</SelectItem>
                      {registrationContext.definitions.map((definition) => (
                        <SelectItem key={definition.id} value={definition.id}>
                          {definition.name} ({definition.code}, version {definition.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : null}
              {registrationForm ? (
                <p>
                  {registrationForm.name}, version {registrationForm.version}
                </p>
              ) : null}
              {registrationForm ? (
                <p className="text-sm text-muted-foreground">
                  Only fields supported by this selected definition are submitted. Unsupported
                  profile draft fields are not sent.
                </p>
              ) : null}
              {individualSupportIssue ? <p role="alert">{individualSupportIssue}</p> : null}
              {customFields.map((field) => (
                <FormDefinitionEntryField
                  key={field.id ?? field.code}
                  field={field}
                  disabled={saving}
                  value={customValues[field.code]}
                  errors={definitionErrors
                    .filter((error) => error.fieldCode === field.code)
                    .map((error) => error.message)}
                  onChange={(value) => {
                    setConfirmOpen(false)
                    setCustomValues((current) => ({ ...current, [field.code]: value }))
                  }}
                />
              ))}
              {definitionErrors.length ? (
                <ul role="alert" aria-label="Registration validation errors">
                  {definitionErrors.map((error) => (
                    <li key={[error.fieldCode, error.code, error.message].join(':')}>
                      {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          <div>
            <h2 className="text-lg font-semibold text-foreground">Profile information</h2>
            <p className="text-sm text-muted-foreground">
              Required fields are checked before confirmation.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              error={submitted ? fieldErrors.code : undefined}
              hidden={!supportsProfileField('code')}
              htmlFor={fieldIds.code}
              label="Beneficiary code"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('code')}
                value={draft.code}
                disabled={Boolean(beneficiary)}
                onChange={(event) => updateDraft('code', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.projectId : undefined}
              htmlFor={fieldIds.projectId}
              label="Project enrollment"
              required
            >
              <Select
                value={draft.projectId}
                disabled={Boolean(beneficiary)}
                onValueChange={onProjectChange}
              >
                <SelectTrigger aria-required="true" {...controlA11y('projectId')}>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              error={submitted ? fieldErrors.firstName : undefined}
              hidden={!supportsProfileField('firstName')}
              htmlFor={fieldIds.firstName}
              label="First name"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('firstName')}
                value={draft.firstName}
                onChange={(event) => updateDraft('firstName', event.target.value)}
              />
            </Field>
            <Field
              hidden={!supportsCode('middle_name')}
              htmlFor="beneficiary-middle-name"
              label="Middle name"
            >
              <Input
                id="beneficiary-middle-name"
                value={draft.middleName}
                onChange={(event) => updateDraft('middleName', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.lastName : undefined}
              hidden={!supportsProfileField('lastName')}
              htmlFor={fieldIds.lastName}
              label="Last name"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('lastName')}
                value={draft.lastName}
                onChange={(event) => updateDraft('lastName', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.sex : undefined}
              hidden={!supportsProfileField('sex')}
              htmlFor={fieldIds.sex}
              label="Sex"
              required
            >
              <Select value={draft.sex} onValueChange={(value) => updateDraft('sex', value)}>
                <SelectTrigger aria-required="true" {...controlA11y('sex')}>
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  <SelectItem value="Not specified">Not specified</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              error={visibleError('birthDate')}
              hidden={!supportsProfileField('birthDate')}
              htmlFor={fieldIds.birthDate}
              label="Birth date"
            >
              <Input
                {...controlA11y('birthDate')}
                max={maxBirthDate ?? undefined}
                type="date"
                value={draft.birthDate}
                onChange={(event) => updateDraft('birthDate', event.target.value)}
              />
            </Field>
            <Field
              error={visibleError('age')}
              errorId={`${fieldIds.age}-error`}
              hidden={!supportsProfileField('age')}
              htmlFor={fieldIds.age}
              label="Age"
            >
              <Input
                aria-describedby={
                  [
                    ageFromBirthDate ? `${fieldIds.age}-hint` : '',
                    visibleError('age') ? `${fieldIds.age}-error` : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                aria-invalid={Boolean(visibleError('age'))}
                id={fieldIds.age}
                max="130"
                min={minimumBeneficiaryAge}
                readOnly={ageFromBirthDate}
                type="number"
                value={ageFromBirthDate ? (registrationAge?.toString() ?? '') : draft.age}
                onChange={(event) => updateDraft('age', event.target.value)}
              />
              {ageFromBirthDate ? (
                <p className="text-xs text-muted-foreground" id={`${fieldIds.age}-hint`}>
                  Calculated from the birth date.
                </p>
              ) : null}
            </Field>
            <p aria-atomic="true" aria-live="polite" className="sr-only">
              {ageRuleMessage ?? ''}
            </p>
            <Field
              error={submitted ? fieldErrors.disabilityStatus : undefined}
              hidden={!supportsProfileField('disabilityStatus')}
              htmlFor={fieldIds.disabilityStatus}
              label="Disability status"
              required
            >
              <Select
                value={draft.disabilityStatus}
                onValueChange={(value) => updateDraft('disabilityStatus', value)}
              >
                <SelectTrigger aria-required="true" {...controlA11y('disabilityStatus')}>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="With disability">With disability</SelectItem>
                  <SelectItem value="Without disability">Without disability</SelectItem>
                  <SelectItem value="Not specified">Not specified</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              error={submitted ? fieldErrors.province : undefined}
              hidden={!supportsProfileField('province')}
              htmlFor={fieldIds.province}
              label="Province"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('province')}
                value={draft.province}
                onChange={(event) => updateDraft('province', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.city : undefined}
              hidden={!supportsProfileField('city')}
              htmlFor={fieldIds.city}
              label="City or municipality"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('city')}
                value={draft.city}
                onChange={(event) => updateDraft('city', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.barangay : undefined}
              hidden={!supportsProfileField('barangay')}
              htmlFor={fieldIds.barangay}
              label="Barangay"
              required
            >
              <Input
                aria-required="true"
                {...controlA11y('barangay')}
                value={draft.barangay}
                onChange={(event) => updateDraft('barangay', event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-4 md:grid-cols-2">
            <ToggleField
              checked={draft.consentToParticipate}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.consentToParticipate : undefined}
              hidden={!supportsProfileField('consentToParticipate')}
              id={fieldIds.consentToParticipate}
              label="Beneficiary consent confirmed"
              onChange={(checked) => updateDraft('consentToParticipate', checked)}
              required
            />
            <ToggleField
              checked={draft.consentToStoreData}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.consentToStoreData : undefined}
              hidden={!supportsProfileField('consentToStoreData')}
              id={fieldIds.consentToStoreData}
              label="Data storage consent confirmed"
              onChange={(checked) => updateDraft('consentToStoreData', checked)}
              required
            />
            <ToggleField
              hidden={!supportsCode('is_minor')}
              checked={beneficiary ? draft.isMinor : (registrationIsMinor ?? draft.isMinor)}
              disabled={Boolean(beneficiary) || registrationIsMinor !== null}
              id="beneficiary-is-minor"
              label="Beneficiary is a minor"
              onChange={(checked) => updateDraft('isMinor', checked)}
            />
            <ToggleField
              checked={draft.guardianConsent}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.guardianConsent : undefined}
              hidden={!supportsProfileField('guardianConsent')}
              id={fieldIds.guardianConsent}
              label="Guardian consent confirmed"
              onChange={(checked) => updateDraft('guardianConsent', checked)}
              required={beneficiary ? draft.isMinor : registrationIsMinor === true}
            />
            {beneficiary ? (
              <p className="text-sm leading-6 text-muted-foreground md:col-span-2">
                Consent and minor-status provenance are read only in this profile editor. The
                accepted profile update contract does not replace those recorded facts.
              </p>
            ) : null}
          </div>

          {submitted && displayedValidationIssues.length > 0 ? (
            <div
              className="rounded-xl border border-danger/25 bg-danger-subtle p-4 text-sm text-danger"
              aria-labelledby="beneficiary-error-summary-title"
              role="alert"
            >
              <p className="font-semibold" id="beneficiary-error-summary-title">
                Check {displayedValidationIssues.length}{' '}
                {displayedValidationIssues.length === 1 ? 'field' : 'fields'} before saving
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {displayedValidationIssues.map((issue) => (
                  <li key={issue.field}>
                    <a
                      className="font-medium underline underline-offset-2"
                      href={`#${fieldIds[issue.field]}`}
                      onClick={(event) => {
                        event.preventDefault()
                        document.getElementById(fieldIds[issue.field])?.focus()
                      }}
                    >
                      {issue.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pendingCreate.notice ? (
            <output className="block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info">
              {pendingCreate.notice}
            </output>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={saving || pendingCreate.confirming} type="submit">
              {pendingCreate.confirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {pendingCreate.confirming
                ? 'Saving...'
                : beneficiary
                  ? 'Save changes'
                  : 'Save beneficiary'}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Profile preview</h2>
          <div className="space-y-3 text-sm">
            <PreviewRow label="Code" value={draft.code || 'Pending'} />
            <PreviewRow
              label="Name"
              value={[
                supportsCode('first_name') ? draft.firstName : '',
                supportsCode('middle_name') ? draft.middleName : '',
                supportsCode('last_name') ? draft.lastName : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <PreviewRow
              label="Project"
              value={projects.find((item) => item.id === draft.projectId)?.title}
            />
            <PreviewRow
              label="Location"
              value={[
                supportsCode('location_barangay') ? draft.barangay : '',
                supportsCode('location_city_municipality') ? draft.city : '',
                supportsCode('location_province') ? draft.province : '',
              ]
                .filter(Boolean)
                .join(', ')}
            />
            <PreviewRow
              label="Consent"
              value={
                draft.consentToParticipate && draft.consentToStoreData ? 'Confirmed' : 'Pending'
              }
            />
          </div>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {beneficiary ? 'Confirm profile changes' : 'Confirm beneficiary profile'}
            </DialogTitle>
            <DialogDescription>
              {beneficiary
                ? 'Review these profile changes.'
                : 'Review this coded profile and project enrollment.'}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm">
            <p className="font-medium">{draft.code}</p>
            <p className="mt-1 text-muted-foreground">
              {[
                supportsCode('first_name') ? draft.firstName : '',
                supportsCode('middle_name') ? draft.middleName : '',
                supportsCode('last_name') ? draft.lastName : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={saving}
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={saving || pendingCreate.confirming}
              onClick={() => void confirmSave()}
              type="button"
            >
              {saving || pendingCreate.confirming
                ? 'Saving...'
                : beneficiary
                  ? 'Save changes'
                  : 'Save beneficiary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Field = ({
  hidden = false,
  htmlFor,
  label,
  error,
  errorId,
  required = false,
  children,
}: {
  hidden?: boolean
  htmlFor: string
  label: string
  error?: string
  errorId?: string
  required?: boolean
  children: React.ReactNode
}) =>
  hidden ? null : (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" id={errorId ?? `${htmlFor}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )

const ToggleField = ({
  hidden = false,
  checked,
  disabled = false,
  error,
  id,
  label,
  onChange,
  required = false,
}: {
  hidden?: boolean
  checked: boolean
  disabled?: boolean
  error?: string
  id: string
  label: string
  onChange: (checked: boolean) => void
  required?: boolean
}) =>
  hidden ? null : (
    <div className="space-y-2">
      <Label
        className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm"
        htmlFor={id}
      >
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          aria-required={required}
          checked={checked}
          className="h-4 w-4 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={id}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </span>
      </Label>
      {error ? (
        <p className="text-xs font-medium text-danger" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )

const PreviewRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-xl border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Pending'}</p>
  </div>
)
