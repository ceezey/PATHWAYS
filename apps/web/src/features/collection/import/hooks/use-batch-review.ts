import { toast } from 'sonner'

import type { OperationTicket } from '../../collection.utils'

import { formsClient } from '@/lib/api/forms'
import { importsClient } from '@/lib/api/imports'
import { plural } from '@/lib/format/plural'
import type { ImportMappingInput } from '@/types/pathways'

import { ruleToMappingInput } from '../components/import-value-map-editor'
import { uploadFailure } from '../import.utils'
import type { ImportState } from './use-import-state'

export function useBatchReview(state: ImportState) {
  const {
    batch,
    begin,
    file,
    formId,
    forms,
    importBatch,
    latest,
    mapping,
    mappingEditable,
    mappingHeading,
    mounted,
    mutation,
    openSuggestions,
    projectId,
    rules,
    scope,
    selectedForm,
    setBatch,
    setBatches,
    setFile,
    setForms,
    setMapping,
    setMappingNotice,
    setReceipts,
    setRows,
    setRules,
    sourceColumns,
  } = state
  const loadBatch = async (batchId: string, parentTicket?: OperationTicket) => {
    const ticket = parentTicket ?? begin('imports.read')
    if (!ticket || !ticket.valid('imports.read')) return
    try {
      const [detail, page] = await Promise.all([
        importsClient.getImportBatch(projectId, batchId),
        importsClient.getImportRows(projectId, batchId),
      ])
      if (!ticket.valid('forms.read')) return
      const definition =
        forms.find((item) => item.id === detail.formId) ??
        (await formsClient.getDigitalForm(projectId, detail.formId))
      if (!ticket.valid('imports.read')) return
      setForms((current) =>
        current.some((item) => item.id === definition.id) ? current : [...current, definition],
      )
      if (latest.current.batch?.id !== detail.id) setMappingNotice('')
      setBatch(detail)
      setRows(page.rows)
      setRules(
        Object.fromEntries(
          (detail.mappings ?? []).map((stored) => [
            stored.sourceFieldName,
            { dataType: stored.dataType ?? '', pairs: stored.valueMap ?? [] },
          ]),
        ),
      )
      setMapping(
        Object.fromEntries(
          (
            detail.sourceColumns ??
            (detail.sourceHeaders ?? []).map((header, index) => ({
              key: header,
              header,
              columnIndex: index + 1,
            }))
          ).map((column) => {
            const reviewed = detail.mappings?.find((item) => item.sourceFieldName === column.key)
            return [
              column.key,
              reviewed?.status === 'IGNORED'
                ? '__ignore__'
                : reviewed?.status === 'MAPPED' && reviewed.targetField
                  ? reviewed.targetField.code
                  : '__pending__',
            ]
          }),
        ),
      )
    } catch (error) {
      if (parentTicket && ticket.valid('imports.read')) throw error
      if (ticket.valid('imports.read'))
        toast.error(
          error instanceof Error ? error.message : 'The import batch could not be loaded.',
        )
    } finally {
      if (!parentTicket) ticket.finish()
    }
  }

  const refreshBatches = async (parentTicket?: OperationTicket) => {
    if (!projectId) return
    const ticket = parentTicket ?? begin('imports.read')
    if (!ticket || !ticket.valid('imports.read')) return
    try {
      const records = await importsClient.getImportBatches(projectId)
      if (!ticket.valid('imports.read')) return
      setBatches(records)
      if (batch) await loadBatch(batch.id, ticket)
    } catch (error) {
      if (parentTicket && ticket.valid('imports.read')) throw error
      if (ticket.valid('imports.read'))
        toast.error(
          error instanceof Error ? error.message : 'Import batches could not be refreshed.',
        )
    } finally {
      if (!parentTicket) ticket.finish()
    }
  }

  const upload = async () => {
    if (
      !file ||
      !formId ||
      !projectId ||
      !forms.some(
        (definition) =>
          definition.id === formId &&
          definition.projectId === projectId &&
          definition.status === 'PUBLISHED',
      )
    ) {
      toast.error('Choose a project, a published form, and one source file.')
      return
    }
    const ticket = begin('imports.upload')
    if (!ticket) return
    try {
      const created = await importsClient.uploadImport(
        projectId,
        formId,
        importBatch.uploadId([file, projectId, formId]),
        file,
      )
      if (!ticket.valid('imports.upload')) return
      const receipt = await importBatch.mapAutomatically(projectId, created)
      if (receipt) {
        if (!ticket.valid('imports.read')) return
        setReceipts((current) => ({ ...current, [created.id]: receipt }))
      }
      await refreshBatches(ticket)
      if (!ticket.valid('imports.read')) return
      await loadBatch(created.id, ticket)
      if (!ticket.valid()) return
      setFile(null)
      importBatch.forgetUpload()
      const failure = uploadFailure(created)
      if (failure) toast.error(failure)
      else
        toast.success(
          'The private upload was staged. Unresolved mappings require an authorized reviewer.',
        )
    } catch (error) {
      if (ticket.valid())
        toast.error(
          error instanceof Error
            ? error.message
            : 'The source file could not be uploaded. The same selected file can be retried.',
        )
    } finally {
      ticket.finish()
    }
  }

  const saveMapping = async (draft = mapping) => {
    if (
      !batch ||
      sourceColumns.some((column) => !draft[column.key] || draft[column.key] === '__pending__')
    ) {
      toast.error('Resolve every pending source column before saving.')
      return
    }
    const mappings: ImportMappingInput[] = sourceColumns.map((column) => ({
      sourceFieldName: column.key,
      ignored: draft[column.key] === '__ignore__',
      targetFieldCode: draft[column.key] === '__ignore__' ? undefined : draft[column.key],
      ...(draft[column.key] === '__ignore__'
        ? {}
        : ruleToMappingInput(
            rules[column.key],
            selectedForm?.fields.find((field) => field.code === draft[column.key])?.dataType,
          )),
    }))
    const ticket = begin('imports.review')
    if (!ticket) return
    try {
      await importsClient.saveImportMapping(projectId, batch.id, batch.mappingRevision, mappings)
      if (!ticket.valid('imports.read')) return
      await loadBatch(batch.id, ticket)
      if (!ticket.valid()) return
      setMappingNotice('Mapping revision saved. Validation results were reset.')
      toast.success('Mapping revision saved. Validation results were reset.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'The mapping could not be saved.')
    } finally {
      ticket.finish()
    }
  }

  // Confirming accepts server suggestions into this reviewer's draft. When that resolves every
  // column, the new manual revision is saved at once under imports.review.
  const confirmSuggestions = (items: typeof openSuggestions, focusKey?: string) => {
    if (!batch || !mappingEditable || mutation.current || !scope.isCurrent() || !items.length)
      return
    const next = { ...mapping }
    const chosen = new Set(
      Object.values(next).filter((value) => value !== '__pending__' && value !== '__ignore__'),
    )
    let applied = 0
    let skipped = 0
    for (const item of items) {
      if (chosen.has(item.code)) {
        skipped++
        continue
      }
      next[item.column.key] = item.code
      chosen.add(item.code)
      applied++
    }
    setMapping(next)
    const remaining = sourceColumns.filter(
      (column) => !next[column.key] || next[column.key] === '__pending__',
    ).length
    const skippedNote = skipped
      ? ` ${plural(skipped, 'suggestion')} skipped because the field is already chosen for another column.`
      : ''
    if (applied > 0 && remaining === 0) {
      setMappingNotice(`${plural(applied, 'suggestion')} confirmed. Saving the mapping revision.`)
      void saveMapping(next)
    } else {
      setMappingNotice(
        `${plural(applied, 'suggestion')} confirmed.${skippedNote}${
          remaining
            ? ` ${plural(remaining, 'column')} ${remaining === 1 ? 'needs' : 'need'} a target or an explicit ignore before the revision can be saved.`
            : ''
        }`,
      )
    }
    window.setTimeout(() => {
      if (!mounted.current) return
      const target = focusKey
        ? document.getElementById(`import-mapping-target-${focusKey}`)
        : mappingHeading.current
      target?.focus()
    }, 0)
  }

  const validate = async () => {
    if (!batch) return
    const ticket = begin('imports.validate')
    if (!ticket) return
    try {
      await importsClient.validateImport(projectId, batch.id, batch.mappingRevision)
      if (!ticket.valid('imports.read')) return
      await loadBatch(batch.id, ticket)
      if (!ticket.valid()) return
      toast.success('Validation revision completed.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'Validation could not be completed.')
    } finally {
      ticket.finish()
    }
  }
  const resume = async () => {
    if (!batch) return
    const ticket = begin('imports.upload')
    if (!ticket) return
    try {
      await importsClient.resumeImportUpload(projectId, batch.id)
      if (!ticket.valid('imports.upload')) return
      const stored = await importsClient.getImportBatch(projectId, batch.id)
      if (!ticket.valid('imports.upload')) return
      const receipt = await importBatch.mapAutomatically(projectId, stored)
      if (receipt) setReceipts((current) => ({ ...current, [stored.id]: receipt }))
      if (!ticket.valid('imports.read')) return
      await loadBatch(batch.id, ticket)
      if (!ticket.valid()) return
      toast.success('Stored source finalization resumed.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'Stored source recovery failed.')
    } finally {
      ticket.finish()
    }
  }
  return { confirmSuggestions, loadBatch, refreshBatches, resume, saveMapping, upload, validate }
}

export type BatchReview = ReturnType<typeof useBatchReview>
