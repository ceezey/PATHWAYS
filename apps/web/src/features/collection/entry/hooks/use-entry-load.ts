import { useEffect } from 'react'

import { PathwaysClientError } from '@/lib/api/core/request'
import { formsClient } from '@/lib/api/forms'
import { readSensitiveDraft, writeSensitiveDraft } from '@/lib/auth/sensitive-drafts'
import type { DirectFormSubmission } from '@/types/pathways'

import { verifySurveySubject } from '../entry.utils'
import type { EntryState } from './use-entry-state'

export function useEntryLoad(state: EntryState) {
  const {
    clientSubmissionId,
    formId,
    initialSubmissionId,
    loadAttempt,
    loadEpoch,
    projectId,
    scope,
    setBeneficiaryId,
    setForm,
    setLoadStatus,
    setNotice,
    setSubjectLocked,
    setSubmission,
    setValues,
    storageKey,
    subjectOwner,
  } = state
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt restarts the same load on Retry.
  useEffect(() => {
    let active = true
    const epoch = loadEpoch.current
    formsClient
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
            persisted = await formsClient.getDirectSubmission(
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
            persisted = await formsClient.getDirectSubmissionByClientId(projectId, formId, retryId)
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
}
