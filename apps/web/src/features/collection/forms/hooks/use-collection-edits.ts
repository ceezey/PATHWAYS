import { useEffect, useRef } from 'react'

import type { CollectionMode, SavedForm } from '../../collection.utils'
import { fromDigitalForm } from '../digital-form-contract'
import { initialFields } from '../forms.utils'
import type { CollectionState } from './use-collection-state'

export function useCollectionEdits(state: CollectionState) {
  const {
    forms,
    importBatch,
    initialFormId,
    intent,
    lastSelectedFileRef,
    mutation,
    parsing,
    projectId,
    projects,
    setCorrectionPage,
    setEditingBaseUpdatedAt,
    setEditingFormId,
    setFields,
    setFormCode,
    setFormDescription,
    setFormTitle,
    setFormType,
    setForms,
    setHydratedFormId,
    setImportMessage,
    setImportStatus,
    setIndicatorIds,
    setJourneyStage,
    setLinkedActivityId,
    setMappingRows,
    setMode,
    setParsedImport,
    setProceedDialogOpen,
    setProjectId,
    setSavedNotice,
    setSelectedFieldId,
    setStagedCoverage,
    setUploadProgress,
    setView,
  } = state
  // Edits the isolated correction table in place; rows live in parsedImport so the
  // correction stays available to whatever eventually reprocesses the batch.
  const updateCorrectionCell = (rowIndex: number, column: string, value: string) => {
    setParsedImport((current) => {
      if (!current) return current
      const rows = current.rows.slice()
      rows[rowIndex] = { ...rows[rowIndex], [column]: value }
      return { ...current, rows }
    })
  }
  const changeProject = (next: string) => {
    if (mutation.current || next === projectId) return
    intent.current++
    parsing.current++
    lastSelectedFileRef.current = null
    importBatch.forgetUpload()
    setParsedImport(null)
    setCorrectionPage(0)
    setImportStatus('idle')
    setUploadProgress(0)
    setImportMessage('No source file selected yet.')
    setMappingRows([])
    setProceedDialogOpen(false)
    setEditingFormId(undefined)
    setHydratedFormId(undefined)
    setEditingBaseUpdatedAt(null)
    setStagedCoverage(null)
    setForms([])
    setFields(initialFields)
    setFormCode('')
    setFormDescription('')
    setJourneyStage('')
    setLinkedActivityId('')
    setIndicatorIds([])
    setProjectId(next)
  }

  const changeInput =
    <T>(setter: (value: T) => void) =>
    (value: T) => {
      if (mutation.current) return
      intent.current++
      parsing.current++
      setter(value)
    }
  const savedForms: SavedForm[] = forms.map((f) => ({
    id: f.id,
    // Same name and version label as the import form picker.
    title: `${f.name} - v${f.version}`,
    type: f.status,
    projectId: f.projectId,
    project: projects.find((p) => p.id === f.projectId)?.title ?? f.projectId,
    fieldCount: f.fields.length,
    savedAt: f.updatedAt,
  }))
  const openSavedForm = (summary: SavedForm) => {
    if (mutation.current) return
    intent.current++
    parsing.current++
    lastSelectedFileRef.current = null
    importBatch.forgetUpload()
    setParsedImport(null)
    setCorrectionPage(0)
    setMappingRows([])
    const form = forms.find((f) => f.id === summary.id)
    if (!form) return
    setEditingFormId(form.id)
    setHydratedFormId(form.id)
    setEditingBaseUpdatedAt(form.updatedAt)
    setProjectId(form.projectId)
    setFormTitle(form.name)
    setFormCode(form.code)
    setFormDescription(form.description ?? '')
    setFormType(form.formType)
    setLinkedActivityId(form.activityId ?? '')
    setJourneyStage(form.journeyStageId ?? '')
    setIndicatorIds([])
    setFields(fromDigitalForm(form))
    setSelectedFieldId(fromDigitalForm(form)[0]?.id ?? '')
    setView('builder')
    if (form.status === 'PUBLISHED')
      setSavedNotice(
        'This published form is read-only in this view. Create a new version before changing its fields.',
      )
  }
  const initializedForm = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the setters of the state hook are stable
  useEffect(() => {
    if (!initialFormId || initializedForm.current === initialFormId) return
    const form = forms.find((item) => item.id === initialFormId)
    if (!form) return
    initializedForm.current = initialFormId
    setEditingFormId(form.id)
    setHydratedFormId(form.id)
    setEditingBaseUpdatedAt(form.updatedAt)
    setProjectId(form.projectId)
    setFormTitle(form.name)
    setFormCode(form.code)
    setFormDescription(form.description ?? '')
    setFormType(form.formType)
    setLinkedActivityId(form.activityId ?? '')
    setJourneyStage(form.journeyStageId ?? '')
    setFields(fromDigitalForm(form))
    setSelectedFieldId(fromDigitalForm(form)[0]?.id ?? '')
  }, [initialFormId, forms, setFields, setSelectedFieldId])
  const openBuilder = (nextMode: CollectionMode) => {
    if (mutation.current) return
    intent.current++
    setMode(nextMode)
    setView(nextMode === 'import' || nextMode === 'extend' ? 'import' : 'builder')
  }
  const startNewForm = () => {
    if (mutation.current) return
    intent.current++
    parsing.current++
    setEditingFormId(undefined)
    setHydratedFormId(undefined)
    setEditingBaseUpdatedAt(null)
    setFormCode('')
    setFormDescription('')
    setFormType('OTHER')
    setFormTitle('')
    setJourneyStage('')
    setLinkedActivityId('')
    setFields(initialFields)
    openBuilder('scratch')
  }
  return {
    changeInput,
    changeProject,
    openBuilder,
    openSavedForm,
    savedForms,
    startNewForm,
    updateCorrectionCell,
  }
}

export type CollectionEdits = ReturnType<typeof useCollectionEdits>
