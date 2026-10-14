'use client'

import { validateAndNormalizeFormData } from '@pathways/shared'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { beneficiariesClient } from '@/lib/api/beneficiaries'
import { type SensitiveDraftOwner, removeSensitiveDraft } from '@/lib/auth/sensitive-drafts'
import { createdSince, hashFingerprint } from '@/lib/forms/pending-create'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import { useRegistrationContext } from '../hooks/use-registration-context'
import { useRegistrationDraft } from '../hooks/use-registration-draft'
import { useRegistrationValidation } from '../hooks/use-registration-validation'
import {
  type BeneficiaryDraft,
  type BeneficiaryFieldKey,
  beneficiaryDisabilityValue,
  beneficiarySexValue,
  fieldIds,
  projectRegistrationValues,
} from '../registration.utils'
import { ConfirmRegistrationDialog } from './confirm-registration-dialog'
import { ProfileFields } from './profile-fields'
import { ProfilePreview } from './profile-preview'
import { RegistrationDefinitionSection } from './registration-definition-section'
import { ValidationSummary } from './validation-summary'

export const BeneficiaryRegistrationForm = ({
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
      const records = await beneficiariesClient.getBeneficiaryRecordsForRole(
        role,
        selectedProjectId,
      )
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const clientRegistrationId = useRef<string | null>(null)
  const {
    registrationContext,
    contextState,
    setContextAttempt,
    selectedFormId,
    setSelectedFormId,
    customValues,
    setCustomValues,
    definitionErrors,
    setDefinitionErrors,
    registrationForm,
    customFields,
  } = useRegistrationContext({ beneficiary, selectedProjectId, scope, setConfirmOpen })
  const { draft, setDraft, draftRecovered, submitted, setSubmitted, draftStorageKey } =
    useRegistrationDraft({ beneficiary, projects, selectedProjectId, scope })
  const {
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
  } = useRegistrationValidation({ beneficiary, draft, registrationForm, registrationContext })

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
      guardian_consent_recorded: registrationIsMinor === true && draft.guardianConsent,
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
        const saved = await beneficiariesClient.updateBeneficiary(draft.projectId, beneficiary.id, {
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
          beneficiariesClient.registerBeneficiary(draft.projectId, {
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
            <RegistrationDefinitionSection
              contextState={contextState}
              setContextAttempt={setContextAttempt}
              registrationContext={registrationContext}
              selectedFormId={selectedFormId}
              setSelectedFormId={setSelectedFormId}
              setCustomValues={setCustomValues}
              setDefinitionErrors={setDefinitionErrors}
              registrationForm={registrationForm}
              customFields={customFields}
              customValues={customValues}
              definitionErrors={definitionErrors}
              saving={saving}
              setConfirmOpen={setConfirmOpen}
              individualSupportIssue={individualSupportIssue}
            />
          ) : null}
          <ProfileFields
            beneficiary={beneficiary}
            projects={projects}
            draft={draft}
            submitted={submitted}
            fieldErrors={fieldErrors}
            supportsProfileField={supportsProfileField}
            supportsCode={supportsCode}
            controlA11y={controlA11y}
            updateDraft={updateDraft}
            visibleError={visibleError}
            onProjectChange={onProjectChange}
            maxBirthDate={maxBirthDate}
            ageFromBirthDate={ageFromBirthDate}
            registrationAge={registrationAge}
            ageRuleMessage={ageRuleMessage}
            showsGuardianConsent={showsGuardianConsent}
          />

          {submitted && displayedValidationIssues.length > 0 ? (
            <ValidationSummary displayedValidationIssues={displayedValidationIssues} />
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

        <ProfilePreview draft={draft} projects={projects} supportsCode={supportsCode} />
      </div>

      <ConfirmRegistrationDialog
        confirmOpen={confirmOpen}
        setConfirmOpen={setConfirmOpen}
        beneficiary={beneficiary}
        draft={draft}
        supportsCode={supportsCode}
        saving={saving}
        pendingCreate={pendingCreate}
        confirmSave={confirmSave}
      />
    </div>
  )
}
