import { useMemo } from 'react'

import { createFileSummary, importHeaderLabel } from '@pathways/imports'

import { formsClient } from '@/lib/api/forms'
import { importsClient } from '@/lib/api/imports'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { fingerprintOf } from '@/lib/forms/pending-create'

import type { ParsedImport } from '../../collection.utils'
import {
  createQuestionnaireMappingRows,
  createSmartMappingRows,
  getMappingReadiness,
} from '../../import/collection-import-state'
import { useServerProcessing } from '../../import/hooks/use-server-processing'
import { importProcessingProgress } from '../../import/import-auto-continue'
import { parseImportPreview } from '../../import/import-preview'
import { toDigitalFormInput } from '../digital-form-contract'
import { fieldFromHeader, formTitleFromFileName, toApiFormType } from '../forms.utils'
import type { CollectionGuard } from './use-collection-guard'
import type { CollectionState } from './use-collection-state'

export function useImportActions(state: CollectionState, guard: CollectionGuard) {
  const {
    current,
    duplicateDecision,
    editingBaseUpdatedAt,
    editingFormId,
    fields,
    formCreate,
    formDescription,
    formType,
    forms,
    importBatch,
    importStatus,
    intent,
    lastSelectedFileRef,
    mappingRows,
    mode,
    mutation,
    parsedImport,
    parsing,
    projectId,
    projects,
    selectedFieldId,
    setCorrectionPage,
    setEditingBaseUpdatedAt,
    setEditingFormId,
    setFields,
    setFormCode,
    setFormTitle,
    setForms,
    setHydratedFormId,
    setImportMessage,
    setImportStatus,
    setMappingRows,
    setParsedImport,
    setProceedDialogOpen,
    setSavedNotice,
    setSelectedFieldId,
    setUploadProgress,
    setView,
  } = state
  const { beginOperation, canUseExtend, editingReady, eligible } = guard
  const importSummary = useMemo(() => {
    if (!parsedImport) {
      return null
    }

    const needsReview = mappingRows.some(
      (row) => row.status === 'unmapped' || row.status === 'invalid',
    )

    return createFileSummary(
      parsedImport.fileName,
      parsedImport.fileType,
      parsedImport.headers,
      parsedImport.rows,
      [
        ...parsedImport.errors,
        ...(needsReview ? ['Validation found headers that need review.'] : []),
      ],
    )
  }, [parsedImport, mappingRows])

  const mappingReadiness = useMemo(() => getMappingReadiness(mappingRows), [mappingRows])
  const importCanProceed =
    importStatus === 'ready' && (Boolean(parsedImport?.rows.length) || mappingReadiness.canProceed)
  const parseSelectedFile = async (file: File) => {
    if (
      mutation.current ||
      !projectId ||
      !editingReady ||
      !projects.some((project) => project.id === projectId) ||
      !eligible('imports.read')
    )
      return
    const parseId = ++parsing.current
    const ownerProject = projectId
    const ownerForm = editingFormId
    const ownerRevision = editingBaseUpdatedAt
    const generation = sensitiveDraftGeneration()
    const validParse = () =>
      parseId === parsing.current &&
      generation === sensitiveDraftGeneration() &&
      eligible('imports.read') &&
      current.current.projectId === ownerProject &&
      current.current.editingFormId === ownerForm &&
      current.current.editingBaseUpdatedAt === ownerRevision
    intent.current++
    lastSelectedFileRef.current = file
    setUploadProgress(28)
    setImportStatus('reading')
    setImportMessage('Reading the selected file.')

    let parsed: ParsedImport

    try {
      // Advisory preview, parsed off the main thread; the server parse stays authoritative.
      const result = await parseImportPreview(file)
      if (!validParse()) return
      parsed = { fileName: file.name, ...result }

      if (!validParse()) return
      setParsedImport(parsed)
      setCorrectionPage(0)
      const selectedForm = forms.find(
        (form) =>
          form.id === editingFormId && form.projectId === projectId && form.status === 'PUBLISHED',
      )
      // Advisory AUTO_SMART_V2 preview against the published form, or against the draft
      // builder fields; a header-only questionnaire defines new fields instead.
      setMappingRows(
        selectedForm
          ? createSmartMappingRows(parsed.headers, parsed.rows, selectedForm.fields)
          : parsed.rows.length === 0
            ? createQuestionnaireMappingRows(parsed.headers)
            : createSmartMappingRows(
                parsed.headers,
                parsed.rows,
                toDigitalFormInput({ code: '', name: '', formType: 'OTHER', fields }).fields,
              ),
      )
      setUploadProgress(100)
      setImportStatus('ready')
      setImportMessage(
        parsed.rows.length === 0
          ? `Questionnaire structure ready for ${parsed.fileName}. Review the field mappings before creating the Draft.`
          : `Preview ready for ${parsed.fileName}. Review every mapping before proceeding.`,
      )

      if (mode === 'extend') {
        const importedFields = parsed.headers.map(fieldFromHeader)
        setFields(importedFields.length > 0 ? importedFields : fields)
        setSelectedFieldId(importedFields[0]?.id ?? selectedFieldId)
      }
    } catch (error) {
      if (!validParse()) return
      setUploadProgress(0)
      setImportStatus('error')
      const message = error instanceof Error ? error.message : 'Unable to parse this file.'
      setImportMessage(
        parsedImport
          ? `${message} Your previous preview and mapping work are retained. Retry or choose a different file.`
          : `${message} Retry or choose a different file.`,
      )
    }
  }

  const retrySelectedFile = () => {
    if (lastSelectedFileRef.current) {
      void parseSelectedFile(lastSelectedFileRef.current)
    }
  }
  const {
    processingRun,
    setProcessingRun,
    continueServerProcessing,
    resumeServerProcessing,
    stopServerProcessing,
  } = useServerProcessing({
    projectId,
    beginOperation,
    importBatch,
    setSavedNotice,
    setProceedDialogOpen,
    setImportMessage,
  })

  const closeProceedDialog = () => {
    if (mutation.current) return
    if (processingRun) {
      setImportMessage(
        `Import ${processingRun.batchId} paused after ${processingRun.progress.handled} of ${processingRun.progress.total} rows. Resume it from the Import workspace.`,
      )
      setProcessingRun(null)
    }
    setProceedDialogOpen(false)
  }

  const confirmImportProceed = async () => {
    if (!parsedImport || !importCanProceed || !projectId) return
    if (parsedImport.rows.length === 0 && !canUseExtend) {
      setImportMessage('Extend Existing Form is not available for this role.')
      setProceedDialogOpen(false)
      return
    }
    const permission = parsedImport.rows.length === 0 ? 'forms.manage' : 'imports.upload'
    const needed =
      parsedImport.rows.length === 0
        ? (['forms.manage', 'forms.templates.import'] as const)
        : (['imports.upload', 'imports.read'] as const)
    if (!needed.every((grant) => eligible(grant))) return
    const ticket = beginOperation(permission)
    if (!ticket) return
    try {
      if (parsedImport.rows.length === 0) {
        const importedFields = mappingRows
          .filter((mapping) => mapping.status === 'mapped')
          .map((mapping, index) => fieldFromHeader(mapping.targetField, index))
        if (!importedFields.length)
          throw new Error('Map at least one field before creating a form.')
        const importedTitle = formTitleFromFileName(parsedImport.fileName)
        const importedInput = toDigitalFormInput({
          code: importedTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 64),
          name: importedTitle,
          description: formDescription,
          formType: toApiFormType(formType),
          fields: importedFields,
        })
        const created = await formCreate.submit(fingerprintOf(importedInput.code), () =>
          formsClient.createDigitalForm(projectId, importedInput),
        )
        if (!created || !ticket.valid()) return
        setForms((current) => [...current, created])
        setEditingFormId(created.id)
        setHydratedFormId(created.id)
        setEditingBaseUpdatedAt(created.updatedAt)
        setFormCode(created.code)
        setFields(importedFields)
        setSelectedFieldId(importedFields[0]?.id ?? '')
        setFormTitle(importedTitle)
        setSavedNotice(
          `Draft form "${created.name}" created on the server from ${parsedImport.fileName}.`,
        )
        setProceedDialogOpen(false)
        setView('forms')
        return
      }
      const selectedForm = forms.find(
        (form) => form.id === editingFormId && form.projectId === projectId,
      )
      if (!selectedForm || selectedForm.status !== 'PUBLISHED') {
        throw new Error('Open a published form for this project before importing data.')
      }
      if (duplicateDecision !== 'pending') {
        throw new Error(
          'Automatic duplicate skip or keep is unavailable. Review server validation results instead.',
        )
      }
      const allowed = new Set(selectedForm.fields.map((field) => field.code))
      const decisions = mappingRows.map((row) => {
        if (row.status === 'mapped' && !allowed.has(row.targetField)) {
          throw new Error(`Field ${row.targetField} is not in the selected published form.`)
        }
        return {
          sourceFieldName: row.sourceColumn,
          targetFieldCode: row.status === 'mapped' ? row.targetField : undefined,
          ignored: row.status === 'ignored',
        }
      })
      const file = lastSelectedFileRef.current
      if (!file) throw new Error('Select the source file again before upload.')
      const generation = sensitiveDraftGeneration()
      const clientImportId = importBatch.uploadId([
        file,
        projectId,
        selectedForm.id,
        selectedForm.version,
        generation,
      ])
      const uploaded = await importsClient.uploadImport(
        projectId,
        selectedForm.id,
        clientImportId,
        file,
      )
      if (!ticket.valid('imports.upload')) return
      const automatic = await importBatch.mapAutomatically(projectId, uploaded)
      if (automatic && !ticket.valid('imports.read')) return
      const automaticRevision = automatic?.mappingRevision
      if (!ticket.valid('imports.read')) return
      if (
        !mappingReadiness.canProceed ||
        !(['imports.review', 'imports.validate', 'imports.process'] as const).every((grant) =>
          eligible(grant),
        )
      ) {
        setImportMessage(
          `Import ${uploaded.id} was staged. Unresolved mappings and processing require an authorized reviewer.`,
        )
        setProceedDialogOpen(false)
        return
      }
      const detail = await importsClient.getImportBatch(projectId, uploaded.id)
      if (!ticket.valid('imports.review')) return
      const sourceColumns = detail.sourceColumns
      if (!sourceColumns || sourceColumns.length !== decisions.length) {
        throw new Error('The server source columns could not be matched to the reviewed file.')
      }
      const mappings = decisions.map((decision, index) => {
        const column = sourceColumns.find((source) => source.columnIndex === index + 1)
        if (!column || column.header !== importHeaderLabel(decision.sourceFieldName)) {
          throw new Error(
            'The server source columns differ from the reviewed file. Review the batch before continuing.',
          )
        }
        return { ...decision, sourceFieldName: column.key }
      })
      const mapped = await importsClient.saveImportMapping(
        projectId,
        uploaded.id,
        detail.mappingRevision ?? automaticRevision ?? uploaded.mappingRevision,
        mappings,
      )
      if (!ticket.valid('imports.validate')) return
      const validated = await importsClient.validateImport(
        projectId,
        mapped.id,
        mapped.mappingRevision,
      )
      if (!ticket.valid('imports.process')) return
      if (validated.totals.invalid > 0) {
        setImportMessage(
          `Server validation found ${validated.totals.invalid} invalid rows. Review batch ${validated.id} before processing.`,
        )
        setProceedDialogOpen(false)
        return
      }
      await continueServerProcessing(ticket, {
        projectId,
        batchId: validated.id,
        validationRevision: validated.validationRevision,
        progress: importProcessingProgress(validated),
      })
    } catch (error) {
      if (!ticket.valid()) return
      setImportMessage(error instanceof Error ? error.message : 'Import failed.')
      setProceedDialogOpen(false)
    } finally {
      ticket.finish()
    }
  }
  return {
    closeProceedDialog,
    confirmImportProceed,
    importCanProceed,
    importSummary,
    mappingReadiness,
    parseSelectedFile,
    processingRun,
    resumeServerProcessing,
    retrySelectedFile,
    stopServerProcessing,
  }
}

export type ImportActions = ReturnType<typeof useImportActions>
