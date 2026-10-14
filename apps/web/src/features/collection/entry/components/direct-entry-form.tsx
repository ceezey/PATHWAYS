'use client'

import { FormDefinitionEntryField as EntryField } from './form-definition-entry-field'
import { SurveySubjectPicker } from './survey-subject-picker'

import { CheckCircle2, Save, Send, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { removeSensitiveDraft } from '@/lib/auth/sensitive-drafts'

import type { EntryActions } from '../hooks/use-entry-actions'
import type { EntryState } from '../hooks/use-entry-state'

export function DirectEntryForm({
  state,
  actions,
  form,
}: {
  state: Pick<
    EntryState,
    | 'beneficiaryId'
    | 'errorsByField'
    | 'formId'
    | 'initialSubmissionId'
    | 'notice'
    | 'operation'
    | 'pending'
    | 'prepareSeparateResponse'
    | 'projectId'
    | 'scope'
    | 'setBeneficiaryId'
    | 'setValues'
    | 'storageKey'
    | 'subjectLocked'
    | 'subjectOwner'
    | 'submission'
    | 'values'
  >
  actions: Pick<EntryActions, 'save' | 'startSeparateResponse' | 'submit' | 'validate'>
  form: NonNullable<EntryState['form']>
}) {
  const {
    beneficiaryId,
    errorsByField,
    formId,
    initialSubmissionId,
    notice,
    operation,
    pending,
    prepareSeparateResponse,
    projectId,
    scope,
    setBeneficiaryId,
    setValues,
    storageKey,
    subjectLocked,
    subjectOwner,
    submission,
    values,
  } = state
  const { save, startSeparateResponse, submit, validate } = actions
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
