'use client'

import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
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
import type { ProjectSummary } from '@/types/pathways'

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
  code: 'BEN-PROT-',
  firstName: 'Beneficiary',
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

export const BeneficiaryForm = ({ projects }: { projects: ProjectSummary[] }) => {
  const router = useRouter()
  const [draft, setDraft] = useState<BeneficiaryDraft>(initialDraft)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(beneficiaryDraftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<keyof BeneficiaryDraft, unknown>>
        const restored = { ...initialDraft }

        for (const key of Object.keys(initialDraft) as Array<keyof BeneficiaryDraft>) {
          if (typeof parsed[key] === typeof initialDraft[key]) {
            Object.assign(restored, { [key]: parsed[key] })
          }
        }

        setDraft(restored)
        setDraftRecovered(true)
      }
    } catch {
      window.sessionStorage.removeItem(beneficiaryDraftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!draftHydrated) {
      return
    }

    if (JSON.stringify(draft) === JSON.stringify(initialDraft)) {
      window.sessionStorage.removeItem(beneficiaryDraftStorageKey)
    } else {
      window.sessionStorage.setItem(beneficiaryDraftStorageKey, JSON.stringify(draft))
    }
  }, [draft, draftHydrated])

  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = []

    if (!draft.code.trim() || draft.code.trim() === 'BEN-PROT-') {
      issues.push({ field: 'code', message: 'Enter a beneficiary code beyond BEN-PROT-.' })
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
    if (!draft.consentToParticipate) {
      issues.push({
        field: 'consentToParticipate',
        message: 'Confirm beneficiary consent to participate.',
      })
    }
    if (!draft.consentToStoreData) {
      issues.push({
        field: 'consentToStoreData',
        message: 'Confirm consent to store beneficiary data.',
      })
    }
    if (draft.isMinor && !draft.guardianConsent) {
      issues.push({
        field: 'guardianConsent',
        message: 'Confirm guardian consent for a beneficiary marked as a minor.',
      })
    }

    return issues
  }, [draft])

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

  const confirmSave = () => {
    // TODO(BACKEND): Save beneficiary profile and enrollments.
    setConfirmOpen(false)
    window.sessionStorage.removeItem(beneficiaryDraftStorageKey)
    toast.success('Beneficiary profile preview completed.', {
      description: 'No shared Beneficiary record was created.',
    })
    router.push('/beneficiaries')
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">Safe sample entry</StatusBadge>
            <StatusBadge tone="warning">Preview only</StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Add beneficiary
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Create a coded prototype profile with consent and project enrollment fields. Use
              non-identifying placeholder details only.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/beneficiaries">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to directory
          </Link>
        </Button>
      </section>

      {draftRecovered ? (
        <output
          aria-atomic="true"
          aria-live="polite"
          className="block rounded-sm border border-info/25 bg-info-subtle p-3 text-sm text-info"
        >
          Recovered your unsaved beneficiary draft from this browser tab.
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
              Required fields are checked in this browser before confirmation.
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
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
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
                  <SelectItem value="Not disclosed">Not disclosed</SelectItem>
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
              error={submitted ? fieldErrors.consentToParticipate : undefined}
              id={fieldIds.consentToParticipate}
              label="Beneficiary consent confirmed"
              onChange={(checked) => updateDraft('consentToParticipate', checked)}
              required
            />
            <ToggleField
              checked={draft.consentToStoreData}
              error={submitted ? fieldErrors.consentToStoreData : undefined}
              id={fieldIds.consentToStoreData}
              label="Data storage consent confirmed"
              onChange={(checked) => updateDraft('consentToStoreData', checked)}
              required
            />
            <ToggleField
              checked={draft.isMinor}
              id="beneficiary-is-minor"
              label="Beneficiary is a minor"
              onChange={(checked) => updateDraft('isMinor', checked)}
            />
            <ToggleField
              checked={draft.guardianConsent}
              error={submitted ? fieldErrors.guardianConsent : undefined}
              id={fieldIds.guardianConsent}
              label="Guardian consent confirmed"
              onChange={(checked) => updateDraft('guardianConsent', checked)}
              required={draft.isMinor}
            />
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
            <Button type="submit">
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save beneficiary
            </Button>
          </div>
        </form>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Prototype preview</h2>
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
          <p className="rounded-sm border border-warning/30 bg-warning-subtle p-3 text-xs leading-5 text-warning">
            This preview uses the current form only and must not include real or identifiable
            Beneficiary data.
          </p>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm prototype beneficiary profile</DialogTitle>
            <DialogDescription>
              Complete this coded profile preview. No shared Beneficiary record will be created.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border border-border bg-surface-subtle p-4 text-sm">
            <p className="font-medium">{draft.code}</p>
            <p className="mt-1 text-muted-foreground">
              {[draft.firstName, draft.middleName, draft.lastName].filter(Boolean).join(' ')}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSave} type="button">
              Complete preview
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
  error,
  id,
  label,
  onChange,
  required = false,
}: {
  checked: boolean
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
