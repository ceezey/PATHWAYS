import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { formsClient } from '@/lib/api/forms'
import type { AutomaticMappingReceipt } from '@/lib/api/imports.schema'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import type {
  ActivitySummary,
  DigitalFormDefinition,
  Indicator,
  ProjectSummary,
} from '@/types/pathways'

import type {
  CollectionMode,
  CollectionView,
  ImportStatus,
  ParsedImport,
} from '../../collection.utils'
import type { MappingRow } from '../../import/collection-import-state'
import { useImportBatch } from '../../import/hooks/use-import-batch'
import { type CollectionWorkspaceProps, initialFields } from '../forms.utils'
import { useFormFields } from '../hooks/use-form-fields'

export function useCollectionState({
  initialMode = 'scratch',
  initialView = 'home',
  initialProjectId,
  initialFormId,
  isCurrentOwner,
}: CollectionWorkspaceProps & { isCurrentOwner: () => boolean }) {
  const { role, profile } = useCurrentRole()
  const [mode, setMode] = useState<CollectionMode>(initialMode)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [editingFormId, setEditingFormId] = useState<string | undefined>(initialFormId)
  const [hydratedFormId, setHydratedFormId] = useState<string | undefined>()
  const [editingBaseUpdatedAt, setEditingBaseUpdatedAt] = useState<string | null>(null)
  const [indicatorIds, setIndicatorIds] = useState<string[]>([])
  const [duplicateDecision, setDuplicateDecision] = useState<'pending' | 'skip' | 'keep'>('pending')
  const [correctionPage, setCorrectionPage] = useState(0)
  const [view, setView] = useState<CollectionView>(initialView)
  const [formTitle, setFormTitle] = useState('Journey 1 - Intake & Assessment Form')
  const [formType, setFormType] = useState('OTHER')
  const [formCode, setFormCode] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [journeyStage, setJourneyStage] = useState('')
  const [linkedActivityId, setLinkedActivityId] = useState('')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [proceedDialogOpen, setProceedDialogOpen] = useState(false)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [savedNotice, setSavedNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  // The change summary of a draft made from an import comes with the draft, so its publisher sees it too.
  const editingForm = forms.find((form) => form.id === editingFormId)
  const draftSummary = editingForm?.status === 'DRAFT' ? editingForm.draftSummary : null
  // The uploaded batch whose file needs the form updated first, so its upload result can offer Prepare form.
  const [stagedCoverage, setStagedCoverage] = useState<{
    batchId: string
    formId: string
    receipt: AutomaticMappingReceipt
  } | null>(null)
  // The draft form just prepared from that batch, which the page then opens in the editor.
  const [draftTarget, setDraftTarget] = useState<{ projectId: string; formId: string } | null>(null)
  // Success notices show as a toast pop-up instead of an inline banner.
  useEffect(() => {
    if (!savedNotice) return
    toast.success(savedNotice)
    setSavedNotice('')
  }, [savedNotice])
  const [reloadKey, setReloadKey] = useState(0)
  const [formsLoaded, setFormsLoaded] = useState(false)
  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null)
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('No source file selected yet.')

  const mounted = useRef(true)
  const intent = useRef(0)
  const parsing = useRef(0)
  const mutation = useRef<object | null>(null)
  const {
    fields,
    setFields,
    selectedFieldId,
    setSelectedFieldId,
    pendingDeleteField,
    setPendingDeleteField,
    updateField,
    addField,
    requestDeleteField,
    confirmDeleteField,
    moveField,
  } = useFormFields(initialFields, { mutation, intent, mounted, isCurrentOwner })
  const [operationPending, setOperationPending] = useState(false)
  const formCreate = usePendingCreate<DigitalFormDefinition>({
    profile,
    kind: 'digital-form',
    projectId: projectId || null,
    successMessage: 'Draft form created',
    findCreated: async (fingerprint, startedAt) =>
      (await formsClient.getDigitalForms(projectId)).find(
        (form) =>
          fingerprintOf(form.code) === fingerprint && createdSince(form.updatedAt, startedAt),
      ),
    onConfirmed: (created) => {
      setForms((current) => [...current.filter((form) => form.id !== created.id), created])
      setSaveDialogOpen(false)
      setSavedNotice(`Draft form "${created.name}" is saved on the server.`)
    },
  })
  const createPending = formCreate.confirming
  const importBatch = useImportBatch()
  const current = useRef({
    profile,
    projectId,
    editingFormId,
    editingBaseUpdatedAt,
    fields,
    mappingRows,
    parsedImport,
    mode,
    view,
    formTitle,
    formType,
    formCode,
    formDescription,
    journeyStage,
    linkedActivityId,
    indicatorIds,
    duplicateDecision,
    forms,
  })
  current.current = {
    profile,
    projectId,
    editingFormId,
    editingBaseUpdatedAt,
    fields,
    mappingRows,
    parsedImport,
    mode,
    view,
    formTitle,
    formType,
    formCode,
    formDescription,
    journeyStage,
    linkedActivityId,
    indicatorIds,
    duplicateDecision,
    forms,
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      intent.current++
      parsing.current++
    }
  }, [])
  const lastSelectedFileRef = useRef<File | null>(null)
  return {
    activities,
    addField,
    confirmDeleteField,
    correctionPage,
    createPending,
    creatingVersion,
    current,
    draftSummary,
    draftTarget,
    duplicateDecision,
    editingBaseUpdatedAt,
    editingFormId,
    fields,
    formCode,
    formCreate,
    formDescription,
    formTitle,
    formType,
    forms,
    formsLoaded,
    hydratedFormId,
    importBatch,
    importMessage,
    importStatus,
    indicatorIds,
    initialFormId,
    intent,
    isCurrentOwner,
    journeyStage,
    lastSelectedFileRef,
    linkedActivityId,
    loadError,
    mappingRows,
    mode,
    mounted,
    moveField,
    mutation,
    operationPending,
    parsedImport,
    parsing,
    pendingDeleteField,
    proceedDialogOpen,
    profile,
    projectId,
    projects,
    projectsLoaded,
    reloadKey,
    requestDeleteField,
    role,
    saveDialogOpen,
    selectedFieldId,
    setActivities,
    setCorrectionPage,
    setCreatingVersion,
    setDraftTarget,
    setStagedCoverage,
    stagedCoverage,
    setDuplicateDecision,
    setEditingBaseUpdatedAt,
    setEditingFormId,
    setFields,
    setFormCode,
    setFormDescription,
    setFormTitle,
    setFormType,
    setForms,
    setFormsLoaded,
    setHydratedFormId,
    setImportMessage,
    setImportStatus,
    setIndicatorIds,
    setIndicators,
    setJourneyStage,
    setLinkedActivityId,
    setLoadError,
    setMappingRows,
    setMode,
    setOperationPending,
    setParsedImport,
    setPendingDeleteField,
    setProceedDialogOpen,
    setProjectId,
    setProjects,
    setProjectsLoaded,
    setReloadKey,
    setSaveDialogOpen,
    setSavedNotice,
    setSelectedFieldId,
    setUploadProgress,
    setView,
    updateField,
    uploadProgress,
    view,
  }
}

export type CollectionState = ReturnType<typeof useCollectionState>
