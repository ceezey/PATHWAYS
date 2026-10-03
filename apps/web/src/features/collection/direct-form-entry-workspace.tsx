'use client'

import { FormDefinitionEntryField as EntryField } from './form-definition-entry-field'
import { SurveySubjectPicker } from './survey-subject-picker'

import { CheckCircle2, Save, Send, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, LoadingSkeleton, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

// Mirrors the API DIRECT_ENTRY_FORM_TYPES (V4-C11).
export const DIRECT_ENTRY_FORM_TYPES = [
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'ACTIVITY_MONITORING',
]

function verifySurveySubject(
  submission: DirectFormSubmission,
  form: DigitalFormDefinition,
  expected?: string | null,
) {
  if (submission.formId !== form.id || submission.formVersion !== form.version)
    throw new Error('The submission version could not be verified.')
  if (form.formType !== 'TRAINING_SURVEY') return
  if (
    submission.beneficiaryId !== null &&
    (typeof submission.beneficiaryId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        submission.beneficiaryId,
      ))
  )
    throw new Error('The persisted contributor could not be verified.')
  if (expected !== undefined && submission.beneficiaryId !== expected)
    throw new Error('The saved contributor does not match this submission.')
}

const StateShell = ({
  eyebrow = 'Data workspace',
  title = 'Direct form entry',
  children,
}: {
  eyebrow?: string
  title?: string
  children: ReactNode
}) => (
  <div className="space-y-6">
    <PageHeader eyebrow={eyebrow} title={title} />
    {children}
  </div>
)

type EntryProps = {
  initialSubmissionId?: string
  projectId: string
  formId: string
}
export function DirectFormEntryWorkspace(props: EntryProps) {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(
    profile,
    'direct-entry-retry',
    'submissions.write',
    props.projectId,
    JSON.stringify([props.formId, props.initialSubmissionId ?? null]),
  )
  if (!scope)
    return (
      <StateShell>
        <EmptyState
          title="Access required"
          description="Current direct entry access is required."
        />
      </StateShell>
    )
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
  const { profile } = useCurrentRole()
  const subjectOwner = useSensitiveDraftOwner(
    profile,
    'survey-contributor',
    'beneficiaries.records.read',
    projectId,
    formId,
  )
  const newResponseOwner = useSensitiveDraftOwner(
    profile,
    'direct-entry-retry',
    'submissions.write',
    projectId,
    JSON.stringify([formId, null]),
  )
  const prepareSeparateResponse = (event: { preventDefault: () => void }) => {
    if (operation.current || !scope.isCurrent() || !newResponseOwner?.isCurrent()) {
      event.preventDefault()
      return
    }
    removeSensitiveDraft(newResponseOwner.key)
  }
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [subjectLocked, setSubjectLocked] = useState(false)
  const [form, setForm] = useState<DigitalFormDefinition | null>(null)
  const [submission, setSubmission] = useState<DirectFormSubmission | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<FormValidationError[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pending, setPending] = useState<'save' | 'validate' | 'submit' | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const clientSubmissionId = useRef('')
  const loadEpoch = useRef(0)
  const storageKey = scope.key
  const operation = useRef<object | null>(null)
  const currentFormVersion = useRef<number | null>(null)
  currentFormVersion.current = form?.version ?? null
  const begin = (kind: 'save' | 'validate' | 'submit') => {
    if (
      operation.current ||
      (beneficiaryId && !subjectOwner?.isCurrent()) ||
      !scope.isCurrent() ||
      !form ||
      form.status !== 'PUBLISHED' ||
      loadStatus !== 'ready'
    )
      return null
    const identifiedOwner = beneficiaryId ? subjectOwner : null
    const marker = {}
    const version = form.version
    operation.current = marker
    setPending(kind)
    setNotice(null)
    return {
      valid: () =>
        scope.isCurrent() &&
        (!identifiedOwner || identifiedOwner.isCurrent()) &&
        operation.current === marker &&
        currentFormVersion.current === version,
      finish: () => {
        if (operation.current === marker) {
          operation.current = null
          if (scope.isCurrent()) setPending(null)
        }
      },
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt restarts the same load on Retry.
  useEffect(() => {
    let active = true
    const epoch = loadEpoch.current
    pathwaysClient
      .getDigitalForm(projectId, formId)
      .then(async (definition) => {
        if (!active || epoch !== loadEpoch.current || !scope.isCurrent()) return
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
            if (!active || epoch !== loadEpoch.current || !scope.isCurrent()) return
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
          if (!active || epoch !== loadEpoch.current || !scope.isCurrent()) return
          verifySurveySubject(persisted, definition)
          if (
            persisted.formId !== formId ||
            persisted.formVersion !== definition.version ||
            (persisted.beneficiaryId !== null &&
              persisted.beneficiaryId !== undefined &&
              (definition.formType !== 'TRAINING_SURVEY' ||
                !subjectOwner?.isCurrent() ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  persisted.beneficiaryId,
                )))
          )
            throw new Error('The persisted contributor could not be verified.')
          setBeneficiaryId(persisted.beneficiaryId ?? '')
          setSubjectLocked(true)
          setSubmission(persisted)
          setValues(persisted.values)
          setNotice({
            text:
              persisted.status === 'VALIDATED'
                ? 'This record was already submitted.'
                : 'Your persisted draft was restored.',
          })
        } catch (error) {
          if (!active || epoch !== loadEpoch.current || !scope.isCurrent()) return
          if (!(error instanceof PathwaysClientError) || error.code !== 'not_found') throw error
          if (initialSubmissionId) throw error
          // Preserve the exact allocated request identity when the server has no draft yet.
          if (!clientSubmissionId.current)
            throw new Error('A draft retry identity could not be allocated.')
        }
        if (active && epoch === loadEpoch.current && scope.isCurrent()) setLoadStatus('ready')
      })
      .catch(() => {
        if (active && epoch === loadEpoch.current && scope.isCurrent()) setLoadStatus('error')
      })
    return () => {
      active = false
    }
  }, [
    loadAttempt,
    formId,
    initialSubmissionId,
    projectId,
    storageKey,
    scope.isCurrent,
    scope.generation,
    subjectOwner?.isCurrent,
  ])

  const errorsByField = useMemo(
    () =>
      errors.reduce<Record<string, string[]>>((result, error) => {
        result[error.fieldCode] = [...(result[error.fieldCode] ?? []), error.message]
        return result
      }, {}),
    [errors],
  )

  const startSeparateResponse = () => {
    if (operation.current || !scope.isCurrent() || !form || !newResponseOwner?.isCurrent()) return
    loadEpoch.current++
    const nextId = crypto.randomUUID()
    clientSubmissionId.current = nextId
    writeSensitiveDraft(
      storageKey,
      { formVersion: form.version, clientSubmissionId: nextId },
      scope.generation,
    )
    setSubmission(null)
    setValues({})
    setBeneficiaryId('')
    setSubjectLocked(false)
    setErrors([])
    setNotice({
      text: 'A separate response is ready. The previous attempt and its history remain unchanged.',
    })
    setLoadStatus('ready')
  }

  const save = async () => {
    if (!form) return
    const ticket = begin('save')
    if (!ticket) return
    try {
      if (!submission) setSubjectLocked(true)
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
            form.formType === 'TRAINING_SURVEY' && beneficiaryId ? beneficiaryId : undefined,
          )
      if (!ticket.valid()) return
      verifySurveySubject(result, form, beneficiaryId || null)
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice({ text: 'Draft saved to PATHWAYS. You can safely reload before submitting.' })
      return result
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice({
        text: error instanceof Error ? error.message : 'The draft could not be saved.',
        error: true,
      })
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
      setNotice({
        text: result.valid
          ? 'All fields passed server validation.'
          : 'Review the highlighted fields.',
        error: !result.valid,
      })
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice({
        text: error instanceof Error ? error.message : 'Validation could not be completed.',
        error: true,
      })
    } finally {
      ticket.finish()
    }
  }

  const submit = async () => {
    if (!form) return
    const ticket = begin('submit')
    if (!ticket) return
    try {
      if (!submission) setSubjectLocked(true)
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
            form.formType === 'TRAINING_SURVEY' && beneficiaryId ? beneficiaryId : undefined,
          )
      if (!ticket.valid()) return
      verifySurveySubject(draft, form, beneficiaryId || null)
      const result = await pathwaysClient.submitDirectSubmission(
        projectId,
        formId,
        draft.id,
        draft.updatedAt,
      )
      if (!ticket.valid()) return
      verifySurveySubject(result, form, beneficiaryId || null)
      setSubmission(result)
      setValues(result.values)
      setErrors([])
      setNotice({
        text: `Submission validated against form version ${result.formVersion} and finalized.`,
      })
    } catch (error) {
      if (!ticket.valid()) return
      if (error instanceof PathwaysClientError) setErrors(error.fieldErrors)
      setNotice({
        text: error instanceof Error ? error.message : 'The record could not be submitted.',
        error: true,
      })
    } finally {
      ticket.finish()
    }
  }

  if (form?.formType === 'TRAINING_SURVEY' && beneficiaryId && !subjectOwner?.isCurrent())
    return (
      <StateShell eyebrow={`Form ${form.code} · version ${form.version}`} title={form.name}>
        <EmptyState
          title="Identified survey access unavailable"
          description="Current identified survey access is unavailable. Existing values and contributor details are hidden; the saved record is unchanged."
          action={
            initialSubmissionId ? (
              <Button asChild variant="outline">
                <Link
                  onClick={prepareSeparateResponse}
                  href={`/collection/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/entries/new`}
                >
                  Open a separate response
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={startSeparateResponse}>
                Open a separate response
              </Button>
            )
          }
        />
      </StateShell>
    )
  if (loadStatus !== 'ready' || !form) {
    return (
      <StateShell>
        {loadStatus === 'loading' ? (
          <LoadingSkeleton />
        ) : (
          <AsyncState
            status="error"
            title="The form could not be loaded"
            description="Check the project, form, and your access."
            onRetry={() => {
              setLoadStatus('loading')
              setLoadAttempt((current) => current + 1)
            }}
          />
        )}
      </StateShell>
    )
  }

  const formShell = { eyebrow: `Form ${form.code} · version ${form.version}`, title: form.name }

  if (form.status !== 'PUBLISHED') {
    return (
      <StateShell {...formShell}>
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Direct entry is available only for a published form version.</span>
        </div>
      </StateShell>
    )
  }

  if (
    !DIRECT_ENTRY_FORM_TYPES.includes(form.formType) &&
    form.formType !== 'BENEFICIARY_REGISTRATION'
  ) {
    return (
      <StateShell {...formShell}>
        <EmptyState
          title="Direct entry unavailable"
          description="Direct entry is available only for survey and monitoring forms."
        />
      </StateShell>
    )
  }

  if (form.formType === 'BENEFICIARY_REGISTRATION') {
    return (
      <StateShell {...formShell}>
        <EmptyState
          title="Use the registration workflow"
          description="Beneficiary registration uses the registration workflow so the profile, enrollment, consent provenance, submission, and audit record are committed together."
          action={
            <Button asChild>
              <Link href="/beneficiaries/new">Open beneficiary registration</Link>
            </Button>
          }
        />
      </StateShell>
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
        <div
          role={notice.error ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            notice.error
              ? 'border-danger/30 bg-danger-subtle text-danger'
              : 'border-success/30 bg-success-subtle text-success'
          }`}
        >
          {notice.error ? (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-5 pt-5">
          {form.formType === 'TRAINING_SURVEY' ? (
            <SurveySubjectPicker
              projectId={projectId}
              formId={formId}
              value={beneficiaryId}
              locked={subjectLocked || Boolean(submission) || Boolean(pending)}
              onChange={(value) => {
                if (!operation.current && !subjectLocked && scope.isCurrent())
                  setBeneficiaryId(value)
              }}
            />
          ) : null}
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

          {form.formType === 'TRAINING_SURVEY' && subjectLocked && !finalized ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                The previous draft or uncertain save may already exist. Retry preserves its exact
                contributor and submission identifier. Starting a separate response preserves that
                prior record; review it in the project's entries.
              </p>
              {initialSubmissionId ? (
                <Button asChild variant="outline">
                  <Link
                    onClick={prepareSeparateResponse}
                    href={`/collection/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/entries/new`}
                  >
                    Start a separate response
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={Boolean(pending)}
                  onClick={startSeparateResponse}
                >
                  Start a separate response
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              disabled={
                Boolean(pending) ||
                finalized ||
                Boolean(beneficiaryId && !subjectOwner?.isCurrent())
              }
              variant="outline"
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {pending === 'save' ? 'Saving...' : 'Save draft'}
            </Button>
            <Button
              disabled={
                Boolean(pending) ||
                finalized ||
                Boolean(beneficiaryId && !subjectOwner?.isCurrent())
              }
              variant="outline"
              onClick={() => void validate()}
            >
              {pending === 'validate' ? 'Validating...' : 'Validate'}
            </Button>
            <Button
              disabled={
                Boolean(pending) ||
                finalized ||
                Boolean(beneficiaryId && !subjectOwner?.isCurrent())
              }
              onClick={() => void submit()}
            >
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {pending === 'submit' ? 'Submitting...' : 'Submit'}
            </Button>
            {finalized ? (
              initialSubmissionId ? (
                <Button asChild variant="outline">
                  <Link
                    onClick={prepareSeparateResponse}
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
        </CardContent>
      </Card>
    </div>
  )
}
