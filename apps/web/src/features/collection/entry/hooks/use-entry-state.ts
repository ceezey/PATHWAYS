import { useMemo, useRef, useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import {
  type SensitiveDraftOwner,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
} from '@/lib/auth/sensitive-drafts'
import type {
  DigitalFormDefinition,
  DirectFormSubmission,
  FormValidationError,
} from '@/types/pathways'

import type { EntryProps } from '../entry.utils'

export function useEntryState({
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
  const errorsByField = useMemo(
    () =>
      errors.reduce<Record<string, string[]>>((result, error) => {
        result[error.fieldCode] = [...(result[error.fieldCode] ?? []), error.message]
        return result
      }, {}),
    [errors],
  )
  return {
    begin,
    beneficiaryId,
    clientSubmissionId,
    errorsByField,
    form,
    formId,
    initialSubmissionId,
    loadAttempt,
    loadEpoch,
    loadStatus,
    newResponseOwner,
    notice,
    operation,
    pending,
    prepareSeparateResponse,
    projectId,
    scope,
    setBeneficiaryId,
    setErrors,
    setForm,
    setLoadAttempt,
    setLoadStatus,
    setNotice,
    setSubjectLocked,
    setSubmission,
    setValues,
    storageKey,
    subjectLocked,
    subjectOwner,
    submission,
    values,
  }
}

export type EntryState = ReturnType<typeof useEntryState>
