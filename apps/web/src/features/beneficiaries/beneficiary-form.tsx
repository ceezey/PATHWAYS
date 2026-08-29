'use client'

import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
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

export const BeneficiaryForm = ({ projects }: { projects: ProjectSummary[] }) => {
  const [draft, setDraft] = useState<BeneficiaryDraft>(initialDraft)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const errors = useMemo(() => {
    const nextErrors: string[] = []

    if (!draft.code.trim()) {
      nextErrors.push('Beneficiary code is required.')
    }
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      nextErrors.push('Name fields are required.')
    }
    if (!draft.sex) {
      nextErrors.push('Sex is required.')
    }
    if (!draft.birthDate && !draft.age) {
      nextErrors.push('Birth date or age is required.')
    }
    if (!draft.disabilityStatus) {
      nextErrors.push('Disability status is required.')
    }
    if (!draft.province.trim() || !draft.city.trim() || !draft.barangay.trim()) {
      nextErrors.push('Location fields are required.')
    }
    if (!draft.projectId) {
      nextErrors.push('Project enrollment is required.')
    }
    if (!draft.consentToParticipate || !draft.consentToStoreData) {
      nextErrors.push('Consent flags must be confirmed.')
    }
    if (draft.isMinor && !draft.guardianConsent) {
      nextErrors.push('Guardian consent is required when the beneficiary is marked as a minor.')
    }

    return nextErrors
  }, [draft])

  const updateDraft = <Key extends keyof BeneficiaryDraft>(
    key: Key,
    value: BeneficiaryDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const handleSubmit = () => {
    setSubmitted(true)

    if (errors.length > 0) {
      toast.error('Check beneficiary form fields.', {
        description: errors[0],
      })
      return
    }

    setConfirmOpen(true)
  }

  const confirmSave = () => {
    setConfirmOpen(false)
    toast.error('Beneficiary profile was not saved.', {
      description: 'The beneficiary backend integration is not configured. Your draft remains.',
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">Unsaved draft</StatusBadge>
            <StatusBadge tone="warning">Backend not configured</StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Add beneficiary
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Prepare a coded profile with consent and project enrollment fields. Submission stays
              disabled until the beneficiary backend is connected.
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Profile information</h2>
            <p className="text-sm text-muted-foreground">
              Required fields are checked before submission.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Beneficiary code" error={submitted && !draft.code.trim()}>
              <Input
                aria-label="Beneficiary code"
                value={draft.code}
                onChange={(event) => updateDraft('code', event.target.value)}
              />
            </Field>
            <Field label="Project enrollment" error={submitted && !draft.projectId}>
              <Select
                value={draft.projectId}
                onValueChange={(value) => updateDraft('projectId', value)}
              >
                <SelectTrigger aria-label="Project enrollment">
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
            <Field label="First name" error={submitted && !draft.firstName.trim()}>
              <Input
                aria-label="First name"
                value={draft.firstName}
                onChange={(event) => updateDraft('firstName', event.target.value)}
              />
            </Field>
            <Field label="Middle name">
              <Input
                aria-label="Middle name"
                value={draft.middleName}
                onChange={(event) => updateDraft('middleName', event.target.value)}
              />
            </Field>
            <Field label="Last name" error={submitted && !draft.lastName.trim()}>
              <Input
                aria-label="Last name"
                value={draft.lastName}
                onChange={(event) => updateDraft('lastName', event.target.value)}
              />
            </Field>
            <Field label="Sex" error={submitted && !draft.sex}>
              <Select value={draft.sex} onValueChange={(value) => updateDraft('sex', value)}>
                <SelectTrigger aria-label="Sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Birth date">
              <Input
                aria-label="Birth date"
                type="date"
                value={draft.birthDate}
                onChange={(event) => updateDraft('birthDate', event.target.value)}
              />
            </Field>
            <Field label="Age" error={submitted && !draft.birthDate && !draft.age}>
              <Input
                aria-label="Age"
                min="0"
                type="number"
                value={draft.age}
                onChange={(event) => updateDraft('age', event.target.value)}
              />
            </Field>
            <Field label="Disability status" error={submitted && !draft.disabilityStatus}>
              <Select
                value={draft.disabilityStatus}
                onValueChange={(value) => updateDraft('disabilityStatus', value)}
              >
                <SelectTrigger aria-label="Disability status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="With disability">With disability</SelectItem>
                  <SelectItem value="Without disability">Without disability</SelectItem>
                  <SelectItem value="Not disclosed">Not disclosed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Province" error={submitted && !draft.province.trim()}>
              <Input
                aria-label="Province"
                value={draft.province}
                onChange={(event) => updateDraft('province', event.target.value)}
              />
            </Field>
            <Field label="City or municipality" error={submitted && !draft.city.trim()}>
              <Input
                aria-label="City or municipality"
                value={draft.city}
                onChange={(event) => updateDraft('city', event.target.value)}
              />
            </Field>
            <Field label="Barangay" error={submitted && !draft.barangay.trim()}>
              <Input
                aria-label="Barangay"
                value={draft.barangay}
                onChange={(event) => updateDraft('barangay', event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-2">
            <ToggleField
              checked={draft.consentToParticipate}
              label="Beneficiary consent confirmed"
              onChange={(checked) => updateDraft('consentToParticipate', checked)}
            />
            <ToggleField
              checked={draft.consentToStoreData}
              label="Data storage consent confirmed"
              onChange={(checked) => updateDraft('consentToStoreData', checked)}
            />
            <ToggleField
              checked={draft.isMinor}
              label="Beneficiary is a minor"
              onChange={(checked) => updateDraft('isMinor', checked)}
            />
            <ToggleField
              checked={draft.guardianConsent}
              label="Guardian consent confirmed"
              onChange={(checked) => updateDraft('guardianConsent', checked)}
            />
          </div>

          {submitted && errors.length > 0 ? (
            <div
              className="rounded-lg border border-danger/20 bg-danger/10 p-4 text-sm text-danger"
              role="alert"
            >
              {errors[0]}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} type="button">
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save beneficiary
            </Button>
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Draft preview</h2>
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
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
            This is an unsaved draft. Do not enter real or identifiable beneficiary data until the
            approved storage integration is configured.
          </p>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit beneficiary profile</DialogTitle>
            <DialogDescription>
              The beneficiary write endpoint is not configured, so this draft cannot be saved.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
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
              Attempt save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Field = ({
  label,
  error = false,
  children,
}: {
  label: string
  error?: boolean
  children: React.ReactNode
}) => (
  <div className="space-y-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    {children}
    {error ? <span className="text-xs text-danger">Required</span> : null}
  </div>
)

const ToggleField = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) => (
  <Label className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm">
    <input
      className="h-4 w-4 rounded border-border"
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    {label}
  </Label>
)

const PreviewRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-md border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Pending'}</p>
  </div>
)
