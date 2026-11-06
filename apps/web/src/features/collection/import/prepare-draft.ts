import { formsClient } from '@/lib/api/forms'

/** Drafts a form version from a staged batch; the summary stays on the draft for whoever opens it. */
export async function draftFormFromImport(
  projectId: string,
  formId: string,
  batchId: string,
  mappingRevision: number,
) {
  const { form } = await formsClient.draftFromImport(projectId, formId, batchId, mappingRevision)
  return { projectId: form.projectId, formId: form.id }
}
