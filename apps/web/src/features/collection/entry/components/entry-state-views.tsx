'use client'

import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { AsyncState, EmptyState, LoadingSkeleton } from '@/components/pathways'
import { Button } from '@/components/ui/button'

import type { EntryActions } from '../hooks/use-entry-actions'
import type { EntryState } from '../hooks/use-entry-state'
import { StateShell } from './state-shell'

export function IdentifiedAccessUnavailable({
  state,
  actions,
  form,
}: {
  state: Pick<
    EntryState,
    'formId' | 'initialSubmissionId' | 'prepareSeparateResponse' | 'projectId'
  >
  actions: Pick<EntryActions, 'startSeparateResponse'>
  form: NonNullable<EntryState['form']>
}) {
  const { formId, initialSubmissionId, prepareSeparateResponse, projectId } = state
  const { startSeparateResponse } = actions
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
}

export function EntryLoadState({
  state,
}: { state: Pick<EntryState, 'loadStatus' | 'setLoadAttempt' | 'setLoadStatus'> }) {
  const { loadStatus, setLoadAttempt, setLoadStatus } = state
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

export function UnpublishedNotice({
  formShell,
}: { formShell: { eyebrow: string; title: string } }) {
  return (
    <StateShell {...formShell}>
      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Direct entry is available only for a published form version.</span>
      </div>
    </StateShell>
  )
}

export function UnavailableType({ formShell }: { formShell: { eyebrow: string; title: string } }) {
  return (
    <StateShell {...formShell}>
      <EmptyState
        title="Direct entry unavailable"
        description="Direct entry is available only for survey and monitoring forms."
      />
    </StateShell>
  )
}

export function RegistrationRedirect({
  formShell,
}: { formShell: { eyebrow: string; title: string } }) {
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
