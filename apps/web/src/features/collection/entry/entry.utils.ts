import type { DigitalFormDefinition, DirectFormSubmission } from '@/types/pathways'

export function verifySurveySubject(
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

export type EntryProps = {
  initialSubmissionId?: string
  projectId: string
  formId: string
}
