'use client'

import { ArrowLeft, Save } from 'lucide-react'
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
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'

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
const beneficiaryDraftStorageKey = 'pathways.beneficiaryDraft'

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

export const BeneficiaryForm = ({
  projects,
  beneficiary,
}: {
  projects: ProjectSummary[]
  beneficiary?: BeneficiaryRecord
}) => {
  const router = useRouter()
  const startingDraft = useMemo(
    () => (beneficiary ? draftFromBeneficiary(beneficiary, projects) : initialDraft),
    [beneficiary, projects],
  )
  const draftStorageKey = beneficiary
    ? `${beneficiaryDraftStorageKey}.${beneficiary.id}`
    : beneficiaryDraftStorageKey
  const [draft, setDraft] = useState<BeneficiaryDraft>(startingDraft)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const clientRegistrationId = useRef<string | null>(null)

  useEffect(() => {
    setDraft(startingDraft)
    setDraftRecovered(false)
    setSubmitted(false)

    try {
      const stored = window.sessionStorage.getItem(draftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<keyof BeneficiaryDraft, unknown>>
        const restored = { ...startingDraft }

        for (const key of Object.keys(startingDraft) as Array<keyof BeneficiaryDraft>) {
          if (typeof parsed[key] === typeof startingDraft[key]) {
            Object.assign(restored, { [key]: parsed[key] })
          }
        }

        setDraft(restored)
        setDraftRecovered(true)
      }
    } catch {
      window.sessionStorage.removeItem(draftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [draftStorageKey, startingDraft])

  useEffect(() => {
    if (!draftHydrated) {
      return
    }

    if (JSON.stringify(draft) === JSON.stringify(startingDraft)) {
      window.sessionStorage.removeItem(draftStorageKey)
    } else {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
    }
  }, [draft, draftHydrated, draftStorageKey, startingDraft])

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
    if (!draft.sex) {
      issues.push({ field: 'sex', message: 'Select a sex value.' })
    }
    if (!draft.birthDate && !draft.age) {
      issues.push({ field: 'birthDate', message: 'Enter a birth date or an age.' })
    }
    if (!draft.disabilityStatus) {
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
    if (!beneficiary && draft.isMinor && !draft.guardianConsent) {
      issues.push({
        field: 'guardianConsent',
        message: 'Confirm guardian consent for a beneficiary marked as a minor.',
      })
    }

    return issues
  }, [beneficiary, draft])

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
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const controlA11y = (field: BeneficiaryFieldKey) => ({
    'aria-describedby': submitted && fieldErrors[field] ? `${fieldIds[field]}-error` : undefined,
    'aria-invalid': submitted && Boolean(fieldErrors[field]),
    id: fieldIds[field],
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)

    if (validationIssues.length > 0) {
      toast.error('Check beneficiary form fields.', {
        description: `${validationIssues.length} ${validationIssues.length === 1 ? 'field needs' : 'fields need'} attention. Review the complete summary in the form.`,
      })
      document.getElementById(fieldIds[validationIssues[0].field])?.focus()
      return
    }

    setConfirmOpen(true)
  }

  const confirmSave = async () => {
    if (saving) return
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
          displayName: [draft.firstName, draft.middleName, draft.lastName]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' '),
          firstName: draft.firstName.trim(),
          middleName: draft.middleName.trim() || undefined,
          lastName: draft.lastName.trim(),
          sex: beneficiarySexValue(draft.sex),
          birthDate: draft.birthDate || undefined,
          ageAtRegistration: draft.age ? Number(draft.age) : undefined,
          disabilityStatus: beneficiaryDisabilityValue(draft.disabilityStatus),
          locationBarangay: draft.barangay.trim(),
          locationCityMunicipality: draft.city.trim(),
          locationProvince: draft.province.trim(),
          expectedUpdatedAt: beneficiary.updatedAt,
        })
        window.sessionStorage.removeItem(draftStorageKey)
        setConfirmOpen(false)
        toast.success('Beneficiary profile updated.')
        router.push(`/beneficiaries/${saved.id}?projectId=${encodeURIComponent(draft.projectId)}`)
        return
      }

      const forms = await pathwaysClient.getDigitalForms(draft.projectId)
      const registrationForm = forms
        .filter(
          (form) => form.formType === 'BENEFICIARY_REGISTRATION' && form.status === 'PUBLISHED',
        )
        .sort((first, second) => second.version - first.version)[0]
      if (!registrationForm) {
        throw new Error('No published beneficiary registration form is available for this project.')
      }
      clientRegistrationId.current ??= crypto.randomUUID()
      const saved = await pathwaysClient.registerBeneficiary(draft.projectId, {
        formId: registrationForm.id,
        clientRegistrationId: clientRegistrationId.current,
        values: {
          registration_operation: 'CREATE',
          beneficiary_code: draft.code.trim().toUpperCase(),
          subject_type: 'INDIVIDUAL',
          display_name: [draft.firstName, draft.middleName, draft.lastName]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' '),
          first_name: draft.firstName.trim(),
          middle_name: draft.middleName.trim() || null,
          last_name: draft.lastName.trim(),
          sex: beneficiarySexValue(draft.sex),
          birth_date: draft.birthDate || null,
          age_at_registration: draft.age ? Number(draft.age) : null,
          disability_status: beneficiaryDisabilityValue(draft.disabilityStatus),
          location_barangay: draft.barangay.trim(),
          location_city_municipality: draft.city.trim(),
          location_province: draft.province.trim(),
          consent_recorded: draft.consentToParticipate,
          data_processing_consent_recorded: draft.consentToStoreData,
          is_minor: draft.isMinor,
          guardian_consent_recorded: draft.guardianConsent,
          enrollment_date: new Date().toISOString().slice(0, 10),
          external_identifier_type: null,
          external_identifier_value: null,
          profile_update_fields: null,
        },
      })
      window.sessionStorage.removeItem(draftStorageKey)
      setConfirmOpen(false)
      clientRegistrationId.current = null
      toast.success('Beneficiary registered.')
      router.push(`/beneficiaries/${saved.id}?projectId=${encodeURIComponent(draft.projectId)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The beneficiary could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:flex-row md:items-start md:justify-between">
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
          className="block rounded-sm border border-info/25 bg-info-subtle p-3 text-sm text-info"
        >
          Recovered your unsaved beneficiary draft.
        </output>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="space-y-5 rounded-lg border border-border bg-card p-5"
          noValidate
          onSubmit={handleSubmit}
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">Profile information</h2>
            <p className="text-sm text-muted-foreground">
              Required fields are checked before confirmation.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              error={submitted ? fieldErrors.code : undefined}
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
                onValueChange={(value) => updateDraft('projectId', value)}
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
            <Field htmlFor="beneficiary-middle-name" label="Middle name">
              <Input
                id="beneficiary-middle-name"
                value={draft.middleName}
                onChange={(event) => updateDraft('middleName', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.lastName : undefined}
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
              error={submitted ? fieldErrors.birthDate : undefined}
              htmlFor={fieldIds.birthDate}
              label="Birth date"
            >
              <Input
                {...controlA11y('birthDate')}
                type="date"
                value={draft.birthDate}
                onChange={(event) => updateDraft('birthDate', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.birthDate : undefined}
              errorId={`${fieldIds.age}-error`}
              htmlFor={fieldIds.age}
              label="Age"
            >
              <Input
                aria-describedby={
                  submitted && fieldErrors.birthDate ? `${fieldIds.age}-error` : undefined
                }
                aria-invalid={submitted && Boolean(fieldErrors.birthDate)}
                id={fieldIds.age}
                min="0"
                type="number"
                value={draft.age}
                onChange={(event) => updateDraft('age', event.target.value)}
              />
            </Field>
            <Field
              error={submitted ? fieldErrors.disabilityStatus : undefined}
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

          <div className="grid gap-3 rounded-sm border border-border bg-surface-subtle p-4 md:grid-cols-2">
            <ToggleField
              checked={draft.consentToParticipate}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.consentToParticipate : undefined}
              id={fieldIds.consentToParticipate}
              label="Beneficiary consent confirmed"
              onChange={(checked) => updateDraft('consentToParticipate', checked)}
              required
            />
            <ToggleField
              checked={draft.consentToStoreData}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.consentToStoreData : undefined}
              id={fieldIds.consentToStoreData}
              label="Data storage consent confirmed"
              onChange={(checked) => updateDraft('consentToStoreData', checked)}
              required
            />
            <ToggleField
              checked={draft.isMinor}
              disabled={Boolean(beneficiary)}
              id="beneficiary-is-minor"
              label="Beneficiary is a minor"
              onChange={(checked) => updateDraft('isMinor', checked)}
            />
            <ToggleField
              checked={draft.guardianConsent}
              disabled={Boolean(beneficiary)}
              error={submitted ? fieldErrors.guardianConsent : undefined}
              id={fieldIds.guardianConsent}
              label="Guardian consent confirmed"
              onChange={(checked) => updateDraft('guardianConsent', checked)}
              required={draft.isMinor}
            />
            {beneficiary ? (
              <p className="text-sm leading-6 text-muted-foreground md:col-span-2">
                Consent and minor-status provenance are read only in this profile editor. The
                accepted profile update contract does not replace those recorded facts.
              </p>
            ) : null}
          </div>

          {submitted && validationIssues.length > 0 ? (
            <div
              className="rounded-sm border border-danger/25 bg-danger-subtle p-4 text-sm text-danger"
              aria-labelledby="beneficiary-error-summary-title"
              role="alert"
            >
              <p className="font-semibold" id="beneficiary-error-summary-title">
                Check {validationIssues.length} {validationIssues.length === 1 ? 'field' : 'fields'}{' '}
                before saving
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validationIssues.map((issue) => (
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

          <div className="flex justify-end">
            <Button disabled={saving} type="submit">
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {beneficiary ? 'Save changes' : 'Save beneficiary'}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Profile preview</h2>
          <div className="space-y-3 text-sm">
            <PreviewRow label="Code" value={draft.code || 'Pending'} />
            <PreviewRow
              label="Name"
              value={[draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ')}
            />
            <PreviewRow
              label="Project"
              value={projects.find((item) => item.id === draft.projectId)?.title}
            />
            <PreviewRow
              label="Location"
              value={[draft.barangay, draft.city, draft.province].filter(Boolean).join(', ')}
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
          <div className="rounded-sm border border-border bg-surface-subtle p-4 text-sm">
            <p className="font-medium">{draft.code}</p>
            <p className="mt-1 text-muted-foreground">
              {[draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ')}
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
            <Button disabled={saving} onClick={() => void confirmSave()} type="button">
              {saving ? 'Saving...' : beneficiary ? 'Save changes' : 'Save beneficiary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Field = ({
  htmlFor,
  label,
  error,
  errorId,
  required = false,
  children,
}: {
  htmlFor: string
  label: string
  error?: string
  errorId?: string
  required?: boolean
  children: React.ReactNode
}) => (
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
  checked,
  disabled = false,
  error,
  id,
  label,
  onChange,
  required = false,
}: {
  checked: boolean
  disabled?: boolean
  error?: string
  id: string
  label: string
  onChange: (checked: boolean) => void
  required?: boolean
}) => (
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
  <div className="rounded-md border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Pending'}</p>
  </div>
)
