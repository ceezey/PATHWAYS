import { PathwaysClientError } from '@/lib/api/core/request'
import { formsClient } from '@/lib/api/forms'
import { writeSensitiveDraft } from '@/lib/auth/sensitive-drafts'

import { verifySurveySubject } from '../entry.utils'
import type { EntryState } from './use-entry-state'

export function useEntryActions(state: EntryState) {
  const {
    begin,
    beneficiaryId,
    clientSubmissionId,
    form,
    formId,
    loadEpoch,
    newResponseOwner,
    operation,
    projectId,
    scope,
    setBeneficiaryId,
    setErrors,
    setLoadStatus,
    setNotice,
    setSubjectLocked,
    setSubmission,
    setValues,
    storageKey,
    submission,
    values,
  } = state
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
        ? await formsClient.updateDirectSubmission(
            projectId,
            formId,
            submission.id,
            submission.updatedAt,
            values,
          )
        : await formsClient.saveDirectSubmission(
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
      const result = await formsClient.validateDigitalFormValues(projectId, formId, values)
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
        ? await formsClient.updateDirectSubmission(
            projectId,
            formId,
            submission.id,
            submission.updatedAt,
            values,
          )
        : await formsClient.saveDirectSubmission(
            projectId,
            formId,
            clientSubmissionId.current,
            values,
            form.formType === 'TRAINING_SURVEY' && beneficiaryId ? beneficiaryId : undefined,
          )
      if (!ticket.valid()) return
      verifySurveySubject(draft, form, beneficiaryId || null)
      const result = await formsClient.submitDirectSubmission(
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
  return { save, startSeparateResponse, submit, validate }
}

export type EntryActions = ReturnType<typeof useEntryActions>
