'use client'

import { Archive, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord, ProjectSummary, UpdateBeneficiaryInput } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

const sexCode = {
  Female: 'FEMALE',
  Male: 'MALE',
  'Prefer not to say': 'PREFER_NOT_TO_SAY',
} as const
const disabilityCode = {
  'With disability': 'WITH_DISABILITY',
  'Without disability': 'WITHOUT_DISABILITY',
  'Not disclosed': 'NOT_SPECIFIED',
} as const

export const BeneficiaryDetail = ({
  initial,
  projects,
  projectId,
  role,
}: {
  initial: BeneficiaryRecord
  projects: ProjectSummary[]
  projectId: string
  role: PathwaysRole
}) => {
  const router = useRouter()
  const [record, setRecord] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({
    subjectType: initial.subjectType === 'UNSPECIFIED_LEGACY' ? 'INDIVIDUAL' : initial.subjectType,
    displayName: initial.displayName,
    firstName: initial.firstName,
    middleName: initial.middleName ?? '',
    lastName: initial.lastName,
    sex: sexCode[initial.sex],
    birthDate: initial.birthDate ?? '',
    age: initial.age?.toString() ?? '',
    disabilityStatus: disabilityCode[initial.disabilityStatus],
    province: initial.province,
    city: initial.city,
    barangay: initial.barangay,
  })
  const currentProject = projects.find((project) => project.id === projectId)
  const canEdit = ['System Administrator', 'Monitoring and Evaluation Officer'].includes(role)
  const canArchive = ['System Administrator', 'Project Manager'].includes(role)
  const update = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError('')
    const input: UpdateBeneficiaryInput = {
      subjectType: draft.subjectType as UpdateBeneficiaryInput['subjectType'],
      displayName: draft.displayName || undefined,
      firstName: draft.firstName || undefined,
      middleName: draft.middleName || undefined,
      lastName: draft.lastName || undefined,
      sex: draft.sex,
      birthDate: draft.birthDate || undefined,
      ageAtRegistration: draft.age ? Number(draft.age) : undefined,
      disabilityStatus: draft.disabilityStatus,
      locationProvince: draft.province || undefined,
      locationCityMunicipality: draft.city || undefined,
      locationBarangay: draft.barangay || undefined,
      expectedUpdatedAt: record.updatedAt,
    }
    try {
      const updated = await pathwaysClient.updateBeneficiary(projectId, record.id, input)
      setRecord(updated)
      setEditing(false)
      toast.success('Beneficiary profile updated.')
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError ? cause.message : 'Profile could not be updated.',
      )
    } finally {
      setSaving(false)
    }
  }
  const archive = async () => {
    setSaving(true)
    setError('')
    try {
      await pathwaysClient.archiveBeneficiary(projectId, record.id, record.updatedAt)
      toast.success('Beneficiary profile archived.')
      router.push('/beneficiaries')
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError ? cause.message : 'Profile could not be archived.',
      )
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex gap-2">
            <StatusBadge tone="success">{record.enrollmentStatus}</StatusBadge>
            <StatusBadge tone="neutral">{record.subjectType.replaceAll('_', ' ')}</StatusBadge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{record.displayName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {record.code} · {currentProject?.title ?? 'Authorized project'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/beneficiaries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Directory
            </Link>
          </Button>
          {canEdit ? (
            <Button variant="outline" onClick={() => setEditing((value) => !value)}>
              Edit profile
            </Button>
          ) : null}
          {canArchive ? (
            <Button variant="destructive" disabled={saving} onClick={() => void archive()}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          ) : null}
        </div>
      </section>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {editing ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Edit shared profile</h2>
          <p className="text-sm text-muted-foreground">
            Saving is denied unless the actor has shared-profile authority for every active
            enrollment.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Subject type">
              <Select value={draft.subjectType} onValueChange={(v) => update('subjectType', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['INDIVIDUAL', 'GROUP', 'COMMUNITY'].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Display name">
              <Input
                value={draft.displayName}
                onChange={(e) => update('displayName', e.target.value)}
              />
            </Field>
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
              <Input value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} />
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
            <Field label="Province">
              <Input value={draft.province} onChange={(e) => update('province', e.target.value)} />
            </Field>
            <Field label="City">
              <Input value={draft.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field label="Barangay">
              <Input value={draft.barangay} onChange={(e) => update('barangay', e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void save()}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Profile and demographics</h2>
          <Row label="Display name" value={record.displayName} />
          <Row label="Location" value={record.location} />
          <Row label="Sex" value={record.sex} />
          <Row label="Birth date" value={record.birthDate ?? 'Not recorded'} />
          <Row label="Age at registration" value={record.age?.toString() ?? 'Not recorded'} />
          <Row label="Disability" value={record.disabilityStatus} />
        </section>
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Consent and enrollment</h2>
          <Row
            label="Participation consent"
            value={record.consentToParticipate ? 'Recorded' : 'Not recorded'}
          />
          <Row
            label="Data-processing consent"
            value={record.consentToStoreData ? 'Recorded' : 'Not recorded'}
          />
          <Row
            label="Guardian consent"
            value={
              record.isMinor
                ? record.guardianConsent
                  ? 'Recorded'
                  : 'Not recorded'
                : 'Not applicable'
            }
          />
          <Row
            label="Enrollment date"
            value={record.enrollments[0]?.enrolledAt ?? 'Not recorded'}
          />
          {record.consentProvenance.map((entry) => (
            <p key={`${entry.kind}-${entry.recordedAt}`} className="text-xs text-muted-foreground">
              {entry.kind.replaceAll('_', ' ')} · {entry.source.replaceAll('_', ' ')} ·{' '}
              {new Date(entry.recordedAt).toLocaleString()}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </div>
)
const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium">{value}</p>
  </div>
)
