import { toast } from 'sonner'

import { importsClient } from '@/lib/api/imports'

import { importOutcomeMessage } from '../../collection.copy'
import { draftFormFromImport } from '../prepare-draft'
import type { BatchProcessing } from './use-batch-processing'
import type { BatchReview } from './use-batch-review'
import type { ImportState } from './use-import-state'

// Prepares a form from an uncovered batch and re-runs a batch against a newer published form version.
export function useBatchIntake(state: ImportState, review: BatchReview, run: BatchProcessing) {
  const {
    batch,
    begin,
    canManageForms,
    canProcess,
    canUpload,
    canValidate,
    forms,
    importBatch,
    projectId,
    setDraftTarget,
    setReceipts,
  } = state
  const { loadBatch, refreshBatches } = review

  // Only the uploader may re-run, and only before validation has started.
  const rerunTarget =
    batch?.uploadedByCurrentUser && canUpload && ['UPLOADED', 'MAPPED'].includes(batch.status)
      ? forms
          .filter(
            (form) =>
              form.code === batch.formCode &&
              form.status === 'PUBLISHED' &&
              form.version > batch.formVersion,
          )
          .reduce<(typeof forms)[number] | null>(
            (newest, form) => (!newest || form.version > newest.version ? form : newest),
            null,
          )
      : null

  const prepareForm = async () => {
    if (!batch || !canManageForms) return
    const ticket = begin('forms.manage')
    if (!ticket) return
    try {
      const target = await draftFormFromImport(
        projectId,
        batch.formId,
        batch.id,
        batch.mappingRevision,
      )
      if (!ticket.valid()) return
      setDraftTarget(target)
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'The form could not be prepared.')
    } finally {
      ticket.finish()
    }
  }

  const rerun = async () => {
    if (!batch || !rerunTarget) return
    const ticket = begin('imports.upload')
    if (!ticket) return
    let validated: Awaited<ReturnType<typeof importsClient.validateImport>> | undefined
    try {
      const created = await importsClient.rerunImport(projectId, batch.id, rerunTarget.id)
      if (!ticket.valid('imports.upload')) return
      const receipt = await importBatch.mapAutomatically(projectId, created)
      if (receipt) {
        if (!ticket.valid('imports.read')) return
        setReceipts((current) => ({ ...current, [created.id]: receipt }))
      }
      // A covered file goes on to validation and processing with the permissions the uploader holds.
      let checked: typeof validated
      if (receipt?.coverage === 'COVERED' && canValidate && canProcess) {
        if (!ticket.valid('imports.validate')) return
        checked = await importsClient.validateImport(projectId, created.id, receipt.mappingRevision)
      }
      await refreshBatches(ticket)
      if (!ticket.valid('imports.read')) return
      await loadBatch(created.id, ticket)
      if (!ticket.valid()) return
      toast.success(`Import re-run against version ${rerunTarget.version} of the form.`)
      validated = checked
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'The import could not be re-run.')
    } finally {
      ticket.finish()
    }
    if (!validated) return
    if (validated.totals.valid === 0)
      toast.success(importOutcomeMessage({ ...validated.totals, processed: 0 }))
    else await run.processBatch(validated, (done) => importOutcomeMessage(done.totals))
  }

  return { prepareForm, rerun, rerunTarget }
}

export type BatchIntake = ReturnType<typeof useBatchIntake>
