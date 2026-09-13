'use client'

import { CheckCircle2, Save, Send } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/pathways'
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
import type {
  DigitalFormDefinition,
  DigitalFormFieldDefinition,
  DirectFormSubmission,
  FormValidationError,
} from '@/types/pathways'

export function DirectFormEntryWorkspace({
  projectId,
  formId,
}: { projectId: string; formId: string }) {
  const [form, setForm] = useState<DigitalFormDefinition | null>(null)
  const [submission, setSubmission] = useState<DirectFormSubmission | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<FormValidationError[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pending, setPending] = useState<'save' | 'validate' | 'submit' | null>(null)
  const [notice, setNotice] = useState('')
  const clientSubmissionId = useRef('')
  const storageKey = `pathways:direct-entry:${projectId}:${formId}`

  useEffect(() => {
    let active = true
    pathwaysClient
      .getDigitalForm(projectId, formId)
      .then(async (definition) => {
        if (!active) return
        const stored = window.localStorage.getItem(storageKey)
        const retryId = stored ?? crypto.randomUUID()
        window.localStorage.setItem(storageKey, retryId)
        clientSubmissionId.current = retryId
        setForm(definition)
        try {
          const persisted = await pathwaysClient.getDirectSubmissionByClientId(
            projectId,
            formId,
            retryId,
          )
          if (!active) return
          setSubmission(persisted)
          setValues(persisted.values)
          setNotice(
            persisted.status === 'VALIDATED'
              ? 'This record was already submitted.'
              : 'Your persisted draft was restored.',
          )
        } catch (error) {
          if (!(error instanceof PathwaysClientError) || error.code !== 'not_found') throw error
        }
        setLoadStatus('ready')
      })
      .catch(() => {
        if (active) setLoadStatus('error')
      })
    return () => {
      active = false
    }
  }, [formId, projectId, storageKey])

  const errorsByField = useMemo(
    () =>
      errors.reduce<Record<string, string[]>>((result, error) => {
        result[error.fieldCode] = [...(result[error.fieldCode] ?? []), error.message]
        return result
      }, {}),
    [errors],
  )

  const save = async () => {
    setPending('save')
    setNotice('')
    try {
      const result = submission
        ? await pathwaysClient.updateDirectSubmission(
            projectId,
            formId,
            submission.id,
            submission.updatedAt,
            values,
          )
        : await pathwaysClient.saveDirectSubmission(
            projectId,
            formId,
            clientSubmissionId.current,
            values,
          )
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice('Draft saved to PATHWAYS. You can safely reload before submitting.')
      return result
    } catch (error) {
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'The draft could not be saved.')
      return null
    } finally {
      setPending(null)
    }
  }

  const validate = async () => {
    setPending('validate')
    setNotice('')
    try {
      const result = submission
        ? await pathwaysClient.validateDirectSubmission(projectId, formId, submission.id)
        : await pathwaysClient.validateDigitalFormValues(projectId, formId, values)
      setErrors(result.errors)
      setNotice(
        result.valid ? 'All fields passed server validation.' : 'Review the highlighted fields.',
      )
    } catch (error) {
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'Validation could not be completed.')
    } finally {
      setPending(null)
    }
  }

  const submit = async () => {
    setPending('submit')
    setNotice('')
    try {
      const draft = submission
        ? await pathwaysClient.updateDirectSubmission(
            projectId,
            formId,
            submission.id,
            submission.updatedAt,
            values,
          )
        : await pathwaysClient.saveDirectSubmission(
            projectId,
            formId,
            clientSubmissionId.current,
            values,
          )
      const result = await pathwaysClient.submitDirectSubmission(
        projectId,
        formId,
        draft.id,
        draft.updatedAt,
      )
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice(`Submission validated against form version ${result.formVersion} and finalized.`)
    } catch (error) {
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'The record could not be submitted.')
    } finally {
      setPending(null)
    }
  }

  if (loadStatus !== 'ready' || !form) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        {loadStatus === 'loading'
          ? 'Loading the published form definition...'
          : 'The form could not be loaded. Check the project, form, and your access.'}
      </div>
    )
  }

  if (form.status !== 'PUBLISHED') {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-6 text-sm text-warning">
        Direct entry is available only for a published form version.
      </div>
    )
  }

  if (form.formType === 'BENEFICIARY_REGISTRATION') {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        <p>
          Beneficiary registration uses the registration workflow so the profile, enrollment,
          consent provenance, submission, and audit record are committed together.
        </p>
        <Button asChild>
          <Link href="/beneficiaries/new">Open beneficiary registration</Link>
        </Button>
      </div>
    )
  }

  const finalized = submission?.status === 'VALIDATED'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Form ${form.code} · version ${form.version}`}
        title={form.name}
        description="Save a draft, review server validation, and submit a version-pinned record."
        actions={
          <StatusBadge tone={finalized ? 'success' : 'info'}>
            {finalized ? 'Submitted' : 'Draft'}
          </StatusBadge>
        }
      />

      {notice ? (
        <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/10 px-4 py-3 text-sm text-info">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        {form.fields.map((field) => (
          <EntryField
            key={field.id ?? field.code}
            disabled={finalized}
            errors={errorsByField[field.code] ?? []}
            field={field}
            value={values[field.code]}
            onChange={(value) => setValues((current) => ({ ...current, [field.code]: value }))}
          />
        ))}

        {form.fields.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            This published form has no fields.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            disabled={Boolean(pending) || finalized}
            variant="outline"
            onClick={() => void save()}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {pending === 'save' ? 'Saving...' : 'Save draft'}
          </Button>
          <Button
            disabled={Boolean(pending) || finalized}
            variant="outline"
            onClick={() => void validate()}
          >
            {pending === 'validate' ? 'Validating...' : 'Validate'}
          </Button>
          <Button disabled={Boolean(pending) || finalized} onClick={() => void submit()}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {pending === 'submit' ? 'Submitting...' : 'Submit'}
          </Button>
          {finalized ? (
            <Button
              variant="outline"
              onClick={() => {
                window.localStorage.removeItem(storageKey)
                window.location.reload()
              }}
            >
              Start another record
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EntryField({
  disabled,
  errors,
  field,
  onChange,
  value,
}: {
  disabled: boolean
  errors: string[]
  field: DigitalFormFieldDefinition
  onChange: (value: unknown) => void
  value: unknown
}) {
  const id = `entry-${field.code}`
  const describedBy = errors.length ? `${id}-error` : undefined
  const common = {
    disabled,
    id,
    'aria-describedby': describedBy,
    'aria-invalid': errors.length > 0,
  }
  let control: ReactNode

  if (field.dataType === 'BOOLEAN') {
    control = (
      <Select
        disabled={disabled}
        value={value === true ? 'true' : value === false ? 'false' : 'unset'}
        onValueChange={(next) => onChange(next === 'unset' ? null : next === 'true')}
      >
        <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={errors.length > 0}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">Not answered</SelectItem>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    )
  } else if (field.dataType === 'SELECT') {
    control = (
      <Select
        disabled={disabled}
        value={typeof value === 'string' ? value : 'unset'}
        onValueChange={(next) => onChange(next === 'unset' ? null : next)}
      >
        <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={errors.length > 0}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">Not answered</SelectItem>
          {(field.allowedValues ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (field.dataType === 'MULTIPLE_SELECT') {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
    control = (
      <div id={id} className="grid gap-2 sm:grid-cols-2">
        {(field.allowedValues ?? []).map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              disabled={disabled}
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
    )
  } else if (field.dataType === 'LONG_TEXT') {
    control = (
      <textarea
        {...common}
        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else {
    const type =
      field.dataType === 'DATE'
        ? 'date'
        : field.dataType === 'INTEGER' || field.dataType === 'DECIMAL'
          ? 'number'
          : 'text'
    control = (
      <Input
        {...common}
        step={
          field.dataType === 'INTEGER' ? '1' : field.dataType === 'DECIMAL' ? '0.0001' : undefined
        }
        type={type}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? ' *' : ''}
      </Label>
      {control}
      {errors.length ? (
        <ul id={`${id}-error`} className="space-y-1 text-xs text-danger">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
