'use client'

import { DIRECT_ENTRY_FORM_TYPES } from '@pathways/shared'

import { EmptyState } from '@/components/pathways'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'

import type { EntryProps } from '../entry.utils'
import { useEntryActions } from '../hooks/use-entry-actions'
import { useEntryLoad } from '../hooks/use-entry-load'
import { useEntryState } from '../hooks/use-entry-state'
import { DirectEntryForm } from './direct-entry-form'
import {
  EntryLoadState,
  IdentifiedAccessUnavailable,
  RegistrationRedirect,
  UnavailableType,
  UnpublishedNotice,
} from './entry-state-views'
import { StateShell } from './state-shell'

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
function OwnedDirectFormEntryWorkspace(props: EntryProps & { scope: SensitiveDraftOwner }) {
  const state = useEntryState(props)
  useEntryLoad(state)
  const actions = useEntryActions(state)
  const { beneficiaryId, form, loadStatus, subjectOwner } = state
  if (form?.formType === 'TRAINING_SURVEY' && beneficiaryId && !subjectOwner?.isCurrent())
    return <IdentifiedAccessUnavailable state={state} actions={actions} form={form} />
  if (loadStatus !== 'ready' || !form) {
    return <EntryLoadState state={state} />
  }

  const formShell = { eyebrow: `Form ${form.code} · version ${form.version}`, title: form.name }

  if (form.status !== 'PUBLISHED') {
    return <UnpublishedNotice formShell={formShell} />
  }

  if (
    !(DIRECT_ENTRY_FORM_TYPES as readonly string[]).includes(form.formType) &&
    form.formType !== 'BENEFICIARY_REGISTRATION'
  ) {
    return <UnavailableType formShell={formShell} />
  }

  if (form.formType === 'BENEFICIARY_REGISTRATION') {
    return <RegistrationRedirect formShell={formShell} />
  }

  return <DirectEntryForm state={state} actions={actions} form={form} />
}
