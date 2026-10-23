import { formsClient } from '@/lib/api/forms'

import { stashDraftSummary } from '../forms/draft-handoff'

/** Drafts a form version from a staged batch and keeps its change summary for the editor that opens next. */
export async function draftFormFromImport(
  projectId: string,
  formId: string,
  batchId: string,
  mappingRevision: number,
) {
  const { form, summary } = await formsClient.draftFromImport(
    projectId,
    formId,
    batchId,
    mappingRevision,
  )
  stashDraftSummary(form.id, summary)
  return { projectId: form.projectId, formId: form.id }
}
