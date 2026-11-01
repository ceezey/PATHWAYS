import { toast } from 'sonner'

import type { OperationTicket } from '../../collection.utils'

import { PathwaysClientError } from '@/lib/api/core/request'
import { formsClient } from '@/lib/api/forms'
import { importsClient } from '@/lib/api/imports'
import { plural } from '@/lib/format/plural'
import type { ImportBatchDefinition, ImportMappingInput } from '@/types/pathways'

import { type ColumnRuleDraft, ruleToMappingInput } from '../components/import-value-map-editor'
import { runFileCheck } from '../file-check'
import { uploadFailure } from '../import.utils'
import { draftFormFromImport } from '../prepare-draft'
import type { ImportState } from './use-import-state'

// A batch's stored mapping in the form of the reviewer's draft.
const storedDraft = (
  detail: ImportBatchDefinition,
): { rules: Record<string, ColumnRuleDraft>; mapping: Record<string, string> } => ({
  rules: Object.fromEntries(
    (detail.mappings ?? []).map((stored) => [
      stored.sourceFieldName,
      {
        dataType: stored.dataType ?? '',
        pairs: stored.valueMap ?? [],
        dateOrder: stored.dateOrder ?? '',
      },
    ]),
  ),
  mapping: Object.fromEntries(
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
})

export function useBatchReview(state: ImportState) {
  const {
    batch,
    begin,
    canManageForms,
    file,
    fileCheck,
    fileInput,
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
    setChecking,
    setDraftTarget,
    setFile,
    setFileCheck,
    setFormOfferSeen,
    setForms,
    setMapping,
    setMappingNotice,
    setReceipts,
    setRows,
    setRules,
    setUploadRefusal,
    sheetName,
    sheetNames,
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
      // The list keeps its own copy of each status, so every reload here keeps the two in step.
      setBatches((current) =>
        current.map((item) => (item.id === detail.id ? { ...item, status: detail.status } : item)),
      )
      setRows(page.rows)
      const stored = storedDraft(detail)
      setRules(stored.rules)
      setMapping(stored.mapping)
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

  // The input is cleared too, because picking the same file again fires no change event otherwise.
  const clearFile = () => {
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const upload = async ({
    skipCheck = false,
    prepareForm = false,
    formOfferShown = false,
  } = {}) => {
    const form = forms.find(
      (definition) =>
        definition.id === formId &&
        definition.projectId === projectId &&
        definition.status === 'PUBLISHED',
    )
    if (!file || !formId || !projectId || !form) {
      toast.error('Choose a project, a published form, and one source file.')
      return
    }
    // Only a workbook with several sheets names one; a single sheet is read as it is.
    const chosenSheet = sheetNames && sheetNames.length > 1 ? sheetName : ''
    if (sheetNames === null || (sheetNames.length > 1 && !chosenSheet)) {
      toast.error('Choose the sheet to import.')
      return
    }
    const ticket = begin('imports.upload')
    if (!ticket) return
    setUploadRefusal('')
    try {
      if (!skipCheck) {
        // The check reads the file in this browser only; a file it cannot read goes to the server as before.
        setChecking(true)
        const report = await runFileCheck(file, form, chosenSheet)
        if (!ticket.valid('imports.upload')) return
        if (report) {
          setFileCheck(report)
          return
        }
      }
      const created = await importsClient.uploadImport(
        projectId,
        formId,
        importBatch.uploadId([file, projectId, formId, chosenSheet]),
        file,
        chosenSheet || undefined,
      )
      if (!ticket.valid('imports.upload')) return
      if (formOfferShown) setFormOfferSeen((seen) => new Set(seen).add(created.id))
      const receipt = await importBatch.mapAutomatically(projectId, created)
      if (receipt) {
        if (!ticket.valid('imports.read')) return
        setReceipts((current) => ({ ...current, [created.id]: receipt }))
      }
      await refreshBatches(ticket)
      if (!ticket.valid('imports.read')) return
      await loadBatch(created.id, ticket)
      if (!ticket.valid()) return
      const failure = uploadFailure(created)
      if (failure) toast.error(failure)
      else if (prepareForm) {
        try {
          const target = await draftFormFromImport(
            projectId,
            formId,
            created.id,
            receipt?.mappingRevision ?? created.mappingRevision,
          )
          if (!ticket.valid('forms.manage')) return
          setDraftTarget(target)
        } catch (error) {
          if (!ticket.valid()) return
          toast.error(error instanceof Error ? error.message : 'The form could not be prepared.')
        }
      } else
        toast.success(
          'The private upload was staged. Unresolved mappings require an authorized reviewer.',
        )
      clearFile()
      importBatch.forgetUpload()
    } catch (error) {
      if (ticket.valid()) {
        // A refusal for a missing permission stays on the upload card, where the reviewer picked the file.
        if (error instanceof PathwaysClientError && error.code === 'forbidden')
          setUploadRefusal(error.message)
        else
          toast.error(
            error instanceof Error
              ? error.message
              : 'The source file could not be uploaded. The same selected file can be retried.',
          )
      }
    } finally {
      setChecking(false)
      ticket.finish()
    }
  }

  const uploadAnyway = () => {
    const formOfferShown = canManageForms && fileCheck?.canPrepareForm === true
    setFileCheck(null)
    return upload({ skipCheck: true, formOfferShown })
  }

  const prepareFromFile = () => {
    setFileCheck(null)
    return upload({ skipCheck: true, prepareForm: true })
  }

  // Fixing the file is the only way out of the dialog that clears the chosen file.
  const fixFile = () => {
    setFileCheck(null)
    clearFile()
  }

  const mappingInputs = (
    draft: Record<string, string>,
    draftRules: Record<string, ColumnRuleDraft>,
  ): ImportMappingInput[] =>
    sourceColumns.map((column) => ({
      sourceFieldName: column.key,
      ignored: draft[column.key] === '__ignore__',
      targetFieldCode: draft[column.key] === '__ignore__' ? undefined : draft[column.key],
      ...(draft[column.key] === '__ignore__'
        ? {}
        : ruleToMappingInput(
            draftRules[column.key],
            selectedForm?.fields.find((field) => field.code === draft[column.key])?.dataType,
          )),
    }))

  const saveMapping = async (draft: Record<string, string>) => {
    if (!batch) return
    const mappings = mappingInputs(draft, rules)
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
            ? ` ${plural(remaining, 'column')} ${remaining === 1 ? 'needs' : 'need'} a target or an explicit ignore before the rows can be validated.`
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

  // A changed mapping is saved as a new revision first; an unchanged one keeps its revision.
  const validate = async () => {
    if (!batch) return
    if (
      mappingEditable &&
      sourceColumns.some((column) => !mapping[column.key] || mapping[column.key] === '__pending__')
    ) {
      toast.error('Resolve every pending source column before validating.')
      return
    }
    const ticket = begin('imports.validate')
    if (!ticket) return
    const stored = storedDraft(batch)
    const mappings = mappingInputs(mapping, rules)
    const changed =
      JSON.stringify(mappings) !== JSON.stringify(mappingInputs(stored.mapping, stored.rules))
    let saved = false
    try {
      let revision = batch.mappingRevision
      if (changed) {
        if (!ticket.valid('imports.review')) return
        const next = await importsClient.saveImportMapping(projectId, batch.id, revision, mappings)
        saved = true
        revision = next.mappingRevision
        if (!ticket.valid('imports.validate')) return
      }
      await importsClient.validateImport(projectId, batch.id, revision)
      if (!ticket.valid('imports.read')) return
      await loadBatch(batch.id, ticket)
      if (!ticket.valid()) return
      setMappingNotice(saved ? 'Mapping revision saved and rows validated.' : '')
      toast.success('Validation revision completed.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'Validation could not be completed.')
      // A saved revision must reach the card even when validation refused it, or a retry would be stale.
      if (saved) {
        setMappingNotice('Mapping revision saved, but the rows were not validated.')
        await loadBatch(batch.id, ticket).catch(() => undefined)
      }
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
  return {
    closeFileCheck: () => setFileCheck(null),
    confirmSuggestions,
    fixFile,
    loadBatch,
    refreshBatches,
    resume,
    upload,
    prepareFromFile,
    uploadAnyway,
    validate,
  }
}

export type BatchReview = ReturnType<typeof useBatchReview>
