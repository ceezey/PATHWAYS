'use client'

import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { DigitalFormDefinition, ProjectSummary } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

type Draft = {
  projectId: string
  formId: string
  operation: 'CREATE' | 'LINK' | 'UPDATE'
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'
  code: string
  displayName: string
  firstName: string
  middleName: string
  lastName: string
  sex: string
  birthDate: string
  age: string
  disability: string
  province: string
  city: string
  barangay: string
  enrollmentDate: string
  externalType: string
  externalValue: string
  consent: boolean
  dataConsent: boolean
  isMinor: boolean
  guardianConsent: boolean
}

export const BeneficiaryForm = ({
  projects,
  forms,
  role,
}: { projects: ProjectSummary[]; forms: DigitalFormDefinition[]; role: PathwaysRole }) => {
  const router = useRouter()
  const firstProject = projects[0]?.id ?? ''
  const [clientRegistrationId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft>({
    projectId: firstProject,
    formId: forms.find((form) => form.projectId === firstProject)?.id ?? '',
    operation: 'CREATE',
    subjectType: 'INDIVIDUAL',
    code: '',
    displayName: '',
    firstName: '',
    middleName: '',
    lastName: '',
    sex: 'NOT_SPECIFIED',
    birthDate: '',
    age: '',
    disability: 'NOT_SPECIFIED',
    province: '',
    city: '',
    barangay: '',
    enrollmentDate: new Date().toISOString().slice(0, 10),
    externalType: '',
    externalValue: '',
    consent: false,
    dataConsent: false,
    isMinor: false,
    guardianConsent: false,
  })
  const projectForms = useMemo(
    () => forms.filter((form) => form.projectId === draft.projectId),
    [draft.projectId, forms],
  )
  const selectedForm = projectForms.find((form) => form.id === draft.formId)
  const codes = new Set(selectedForm?.fields.map((field) => field.code) ?? [])
  const requiredContract = [
    'registration_operation',
    'beneficiary_code',
    'subject_type',
    'consent_recorded',
    'data_processing_consent_recorded',
    'enrollment_date',
  ]
  const contractReady = requiredContract.every((code) => codes.has(code))
  const canReviewIdentity = ['System Administrator', 'Monitoring and Evaluation Officer'].includes(
    role,
  )
  const individual = draft.subjectType === 'INDIVIDUAL'
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const selectProject = (projectId: string) =>
    setDraft((current) => ({
      ...current,
      projectId,
      formId: forms.find((form) => form.projectId === projectId)?.id ?? '',
    }))

  const save = async () => {
    setError('')
    if (!selectedForm || !contractReady) {
      setError('Select a published registration form with the required domain fields.')
      return
    }
    if (!draft.code.trim() || !draft.consent || !draft.dataConsent) {
      setError('Code and both explicit consent confirmations are required.')
      return
    }
    if (
      individual &&
      (!draft.firstName.trim() || !draft.lastName.trim() || (!draft.birthDate && !draft.age))
    ) {
      setError('Individuals require first and last names plus a birth date or age.')
      return
    }
    if (!individual && !draft.displayName.trim()) {
      setError('Groups and communities require a display name.')
      return
    }
    if (draft.isMinor !== draft.guardianConsent) {
      setError('Guardian consent must be confirmed exactly when the record is a minor.')
      return
    }
    const candidates: Record<string, unknown> = {
      registration_operation: draft.operation,
      beneficiary_code: draft.code.trim().toUpperCase(),
      subject_type: draft.subjectType,
      display_name: draft.displayName.trim() || null,
      first_name: individual ? draft.firstName.trim() : null,
      middle_name: individual ? draft.middleName.trim() || null : null,
      last_name: individual ? draft.lastName.trim() : null,
      sex: individual ? draft.sex : 'NOT_SPECIFIED',
      birth_date: individual && draft.birthDate ? draft.birthDate : null,
      age_at_registration: individual && draft.age ? Number(draft.age) : null,
      disability_status: draft.disability,
      location_barangay: draft.barangay.trim() || null,
      location_city_municipality: draft.city.trim() || null,
      location_province: draft.province.trim() || null,
      consent_recorded: draft.consent,
      data_processing_consent_recorded: draft.dataConsent,
      is_minor: individual && draft.isMinor,
      guardian_consent_recorded: individual && draft.guardianConsent,
      enrollment_date: draft.enrollmentDate,
      external_identifier_type: draft.externalType.trim().toUpperCase() || null,
      external_identifier_value: draft.externalValue.trim() || null,
      profile_update_fields:
        draft.operation === 'UPDATE'
          ? [
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
            ]
          : null,
    }
    const values = Object.fromEntries(
      Object.entries(candidates).filter(([code]) => codes.has(code)),
    )
    setSaving(true)
    try {
      const record = await pathwaysClient.registerBeneficiary(draft.projectId, {
        formId: draft.formId,
        clientRegistrationId,
        values,
      })
      toast.success('Beneficiary registration saved.')
      router.push(`/beneficiaries/${record.id}?projectId=${encodeURIComponent(draft.projectId)}`)
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError ? cause.message : 'Registration could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h1 className="text-3xl font-semibold">Register beneficiary</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create, explicitly link, or explicitly update through a published versioned form.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/beneficiaries">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Directory
          </Link>
        </Button>
      </section>
      <section className="space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Project">
            <Select value={draft.projectId} onValueChange={selectProject}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Published registration form">
            <Select value={draft.formId} onValueChange={(v) => update('formId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select form" />
              </SelectTrigger>
              <SelectContent>
                {projectForms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} · v{f.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Operation">
            <Select
              value={draft.operation}
              onValueChange={(v) => update('operation', v as Draft['operation'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CREATE">Create new</SelectItem>
                {canReviewIdentity ? (
                  <>
                    <SelectItem value="LINK">Link exact existing</SelectItem>
                    <SelectItem value="UPDATE">Explicit profile update</SelectItem>
                  </>
                ) : null}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject type">
            <Select
              value={draft.subjectType}
              onValueChange={(v) => update('subjectType', v as Draft['subjectType'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="GROUP">Group</SelectItem>
                <SelectItem value="COMMUNITY">Community</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Beneficiary code">
            <Input value={draft.code} onChange={(e) => update('code', e.target.value)} />
          </Field>
          <Field label="Display name">
            <Input
              value={draft.displayName}
              onChange={(e) => update('displayName', e.target.value)}
            />
          </Field>
          {individual ? (
            <>
              <Field label="First name">
                <Input
                  value={draft.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                />
              </Field>
              <Field label="Middle name">
                <Input
                  value={draft.middleName}
                  onChange={(e) => update('middleName', e.target.value)}
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={draft.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                />
              </Field>
              <Field label="Sex">
                <Select value={draft.sex} onValueChange={(v) => update('sex', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Birth date">
                <Input
                  type="date"
                  value={draft.birthDate}
                  onChange={(e) => update('birthDate', e.target.value)}
                />
              </Field>
              <Field label="Age at registration">
                <Input
                  type="number"
                  min="0"
                  max="130"
                  value={draft.age}
                  onChange={(e) => update('age', e.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field label="Disability status">
            <Select value={draft.disability} onValueChange={(v) => update('disability', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Enrollment date">
            <Input
              type="date"
              value={draft.enrollmentDate}
              onChange={(e) => update('enrollmentDate', e.target.value)}
            />
          </Field>
          <Field label="Province">
            <Input value={draft.province} onChange={(e) => update('province', e.target.value)} />
          </Field>
          <Field label="City or municipality">
            <Input value={draft.city} onChange={(e) => update('city', e.target.value)} />
          </Field>
          <Field label="Barangay">
            <Input value={draft.barangay} onChange={(e) => update('barangay', e.target.value)} />
          </Field>
          <Field label="External identifier namespace">
            <Input
              value={draft.externalType}
              onChange={(e) => update('externalType', e.target.value)}
              placeholder="e.g. PARTNER_CASE_ID"
            />
          </Field>
          <Field label="External identifier value">
            <Input
              value={draft.externalValue}
              onChange={(e) => update('externalValue', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Check
            label="Participation consent recorded"
            checked={draft.consent}
            onChange={(v) => update('consent', v)}
          />
          <Check
            label="Data-processing consent recorded"
            checked={draft.dataConsent}
            onChange={(v) => update('dataConsent', v)}
          />
          {individual ? (
            <>
              <Check
                label="Record is a minor"
                checked={draft.isMinor}
                onChange={(v) => update('isMinor', v)}
              />
              <Check
                label="Guardian consent recorded"
                checked={draft.guardianConsent}
                onChange={(v) => update('guardianConsent', v)}
              />
            </>
          ) : null}
        </div>
        {!contractReady && draft.formId ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            This form is published but does not contain the required registration contract.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button disabled={saving || !contractReady} onClick={() => void save()}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save registration'}
          </Button>
        </div>
      </section>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </div>
)
const Check = ({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <Label className="flex items-center gap-3 rounded-md border border-border p-3">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </Label>
)
