'use client'

import { FormDefinitionEntryField as EntryField } from './form-definition-entry-field'

import { CheckCircle2, Save, Send } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  DigitalFormDefinition,
  DirectFormSubmission,
  FormValidationError,
} from '@/types/pathways'

type EntryProps = { initialSubmissionId?: string; projectId: string; formId: string }
export function DirectFormEntryWorkspace(props: EntryProps) {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(
    profile,
    'direct-entry-retry',
    'submissions.write',
    props.projectId,
    JSON.stringify([props.formId, props.initialSubmissionId ?? null]),
  )
  if (!scope) return <output>Current direct entry access is required.</output>
  return (
    <OwnedDirectFormEntryWorkspace key={scope.key + scope.generation} {...props} scope={scope} />
  )
}
function OwnedDirectFormEntryWorkspace({
  initialSubmissionId,
  projectId,
  formId,
  scope,
}: EntryProps & { scope: SensitiveDraftOwner }) {
  const [form, setForm] = useState<DigitalFormDefinition | null>(null)
  const [submission, setSubmission] = useState<DirectFormSubmission | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<FormValidationError[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pending, setPending] = useState<'save' | 'validate' | 'submit' | null>(null)
  const [notice, setNotice] = useState('')
  const clientSubmissionId = useRef('')
  const storageKey = scope.key
  const operation = useRef<object | null>(null)
  const currentFormVersion = useRef<number | null>(null)
  currentFormVersion.current = form?.version ?? null
  const begin = (kind: 'save' | 'validate' | 'submit') => {
    if (
      operation.current ||
      !scope.isCurrent() ||
      !form ||
      form.status !== 'PUBLISHED' ||
      loadStatus !== 'ready'
    )
      return null
    const marker = {}
    const version = form.version
    operation.current = marker
    setPending(kind)
    setNotice('')
    return {
      valid: () =>
        scope.isCurrent() && operation.current === marker && currentFormVersion.current === version,
      finish: () => {
        if (operation.current === marker) {
          operation.current = null
          if (scope.isCurrent()) setPending(null)
        }
      },
    }
  }

  useEffect(() => {
    let active = true
    pathwaysClient
      .getDigitalForm(projectId, formId)
      .then(async (definition) => {
        if (!active || !scope.isCurrent()) return
        if (definition.projectId !== projectId || definition.id !== formId)
          throw new Error('The selected form could not be verified.')
        setForm(definition)
        if (
          definition.status !== 'PUBLISHED' ||
          definition.formType === 'BENEFICIARY_REGISTRATION'
        ) {
          setLoadStatus('ready')
          return
        }
        try {
          let persisted: DirectFormSubmission
          if (initialSubmissionId) {
            persisted = await pathwaysClient.getDirectSubmission(
              projectId,
              formId,
              initialSubmissionId,
            )
          } else {
            const stored = readSensitiveDraft(storageKey)
            const retryId =
              stored?.formVersion === definition.version &&
              typeof stored.clientSubmissionId === 'string' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                stored.clientSubmissionId,
              )
                ? stored.clientSubmissionId
                : crypto.randomUUID()
            if (!active || !scope.isCurrent()) return
            writeSensitiveDraft(
              storageKey,
              { formVersion: definition.version, clientSubmissionId: retryId },
              scope.generation,
            )
            clientSubmissionId.current = retryId
            persisted = await pathwaysClient.getDirectSubmissionByClientId(
              projectId,
              formId,
              retryId,
            )
          }
          if (!active || !scope.isCurrent()) return
          setSubmission(persisted)
          setValues(persisted.values)
          setNotice(
            persisted.status === 'VALIDATED'
              ? 'This record was already submitted.'
              : 'Your persisted draft was restored.',
          )
        } catch (error) {
          if (!active || !scope.isCurrent()) return
          if (!(error instanceof PathwaysClientError) || error.code !== 'not_found') throw error
          if (initialSubmissionId) throw error
          // Preserve the exact allocated request identity when the server has no draft yet.
          if (!clientSubmissionId.current)
            throw new Error('A draft retry identity could not be allocated.')
        }
        if (active && scope.isCurrent()) setLoadStatus('ready')
      })
      .catch(() => {
        if (active && scope.isCurrent()) setLoadStatus('error')
      })
    return () => {
      active = false
    }
  }, [formId, initialSubmissionId, projectId, storageKey, scope.isCurrent, scope.generation])

  const errorsByField = useMemo(
    () =>
      errors.reduce<Record<string, string[]>>((result, error) => {
        result[error.fieldCode] = [...(result[error.fieldCode] ?? []), error.message]
        return result
      }, {}),
    [errors],
  )

  const save = async () => {
    const ticket = begin('save')
    if (!ticket) return
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
      if (!ticket.valid()) return
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice('Draft saved to PATHWAYS. You can safely reload before submitting.')
      return result
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'The draft could not be saved.')
      return null
    } finally {
      ticket.finish()
    }
  }

  const validate = async () => {
    const ticket = begin('validate')
    if (!ticket) return
    try {
      const result = await pathwaysClient.validateDigitalFormValues(projectId, formId, values)
      if (!ticket.valid()) return
      setErrors(result.errors)
      setNotice(
        result.valid ? 'All fields passed server validation.' : 'Review the highlighted fields.',
      )
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'Validation could not be completed.')
    } finally {
      ticket.finish()
    }
  }

  const submit = async () => {
    const ticket = begin('submit')
    if (!ticket) return
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
      if (!ticket.valid()) return
      const result = await pathwaysClient.submitDirectSubmission(
        projectId,
        formId,
        draft.id,
        draft.updatedAt,
      )
      if (!ticket.valid()) return
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice(`Submission validated against form version ${result.formVersion} and finalized.`)
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'The record could not be submitted.')
    } finally {
      ticket.finish()
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
            disabled={finalized || Boolean(pending)}
            errors={errorsByField[field.code] ?? []}
            field={field}
            value={values[field.code]}
            onChange={(value) => {
              if (!operation.current && scope.isCurrent())
                setValues((current) => ({ ...current, [field.code]: value }))
            }}
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
            initialSubmissionId ? (
              <Button asChild variant="outline">
                <Link
                  href={`/collection/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/entries/new`}
                >
                  Start another record
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  if (operation.current || !scope.isCurrent()) return
                  removeSensitiveDraft(storageKey)
                  window.location.reload()
                }}
              >
                Start another record
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
