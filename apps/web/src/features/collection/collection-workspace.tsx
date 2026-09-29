'use client'

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  GripVertical,
  ListPlus,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createFileSummary } from '@pathways/imports'

import { PageHeader } from '@/components/layout/page-header'
import {
  ConfirmationDialog,
  ProgressBar,
  StatusBadge,
  UnavailableHint,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { getVerifiedRouteAccess, principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
import type {
  ActivitySummary,
  DigitalFormDefinition,
  DigitalFormType,
  Indicator,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import {
  type MappingReadiness,
  type MappingRow,
  type MappingStatus,
  createQuestionnaireMappingRows,
  createSmartMappingRows,
  getMappingReadiness,
} from './collection-import-state'
import {
  type BuilderFieldType,
  type BuilderFormField,
  fieldCodeFromText,
  formTypeLabels,
  fromDigitalForm,
  toDigitalFormInput,
} from './digital-form-contract'
import {
  type FormDefinitionExportFormat,
  formDefinitionExportFormats,
  formDefinitionExportRequest,
} from './form-definition-export'
import {
  type ImportProcessingOutcome,
  type ImportProcessingProgress,
  importProcessingProgress,
  runImportProcessing,
} from './import-auto-continue'
import { parseImportPreview } from './import-preview'
import { ImportProcessingPanel, type ImportProcessingState } from './import-processing-panel'

type ExportFormat = FormDefinitionExportFormat

type CollectionMode = 'scratch' | 'import' | 'extend'

/** The read-only Data preview and Metadata mapping tables render at most this many rows. */
const MAX_PREVIEW_ROWS = 5
/** The editable correction table paginates instead of capping, so every row stays correctable. */
const CORRECTION_PAGE_SIZE = 25
type CollectionView = 'home' | 'forms' | 'builder' | 'import'
type FieldType = BuilderFieldType
type ImportStatus = 'idle' | 'reading' | 'ready' | 'error'

interface CollectionWorkspaceProps {
  initialMode?: CollectionMode
  initialView?: CollectionView
  initialProjectId?: string
  initialFormId?: string
}

type FormField = BuilderFormField

interface ParsedImport {
  fileName: string
  fileType: 'csv' | 'xlsx'
  headers: string[]
  rows: Record<string, unknown>[]
  errors: string[]
  sheetNames?: string[]
}

interface SavedForm {
  id: string
  title: string
  type: string
  project: string
  fieldCount: number
  savedAt: string
}

const toApiFormType = (type: string): DigitalFormType => type as DigitalFormType

const metadataConnections = [
  'Youth trained - vocational skills',
  'Assessment delta (Effectiveness)',
  'Monitoring dashboard',
  'Beneficiary journey view',
  'Evaluation center',
]

const initialFields: FormField[] = [
  {
    id: 'field-beneficiary-id',
    label: 'Beneficiary ID',
    code: 'beneficiary_id',
    type: 'text',
    required: true,
    metadataKey: true,
    sadddField: false,
    allowedValues: [],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'mapped',
  },
  {
    id: 'field-attendance',
    label: 'Attendance status',
    code: 'attendance_status',
    type: 'single_select',
    required: true,
    metadataKey: false,
    sadddField: false,
    allowedValues: ['Present', 'Absent', 'Excused'],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'mapped',
  },
  {
    id: 'field-age-band',
    label: 'Age group',
    code: 'beneficiary_age_group',
    type: 'single_select',
    required: false,
    metadataKey: false,
    sadddField: true,
    allowedValues: ['10-14', '15-17', '18-24', '25+'],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'unmapped',
  },
]

const modeDetails: Array<{
  id: CollectionMode
  title: string
  description: string
  href: string
}> = [
  {
    id: 'import',
    title: 'Import existing file',
    description: 'Upload CSV, XLSX, XLS, or a text-based PDF and review detected mappings.',
    href: '/collection/import',
  },
  {
    id: 'scratch',
    title: 'Build forms',
    description: 'Create fields one by one with metadata guidance.',
    href: '/collection/forms/new',
  },
  {
    id: 'extend',
    title: 'Import then extend',
    description: 'Start from detected columns and add or modify fields.',
    href: '/collection/import?mode=extend',
  },
]

const dataTypeLabels: Record<FieldType, string> = {
  text: 'Text',
  long_text: 'Long text',
  integer: 'Integer',
  decimal: 'Decimal',
  date: 'Date',
  single_select: 'Single select',
  multi_select: 'Multiple select',
  boolean: 'Yes/No',
}

const statusTone = (status: MappingStatus) => {
  if (status === 'mapped') {
    return 'success'
  }

  if (status === 'ignored') {
    return 'neutral'
  }

  if (status === 'invalid') {
    return 'danger'
  }

  return 'warning'
}

const importedFieldLabels: Record<string, string> = {
  beneficiary_id: 'Beneficiary ID',
  attendance_status: 'Attendance status',
  pre_test_score: 'Pre-test score',
  post_test_score: 'Post-test score',
  activity_date: 'Activity date',
}

const fieldFromHeader = (header: string, index: number): FormField => {
  const code = fieldCodeFromText(header)

  return {
    id: `imported-${index}-${code}`,
    label:
      importedFieldLabels[code] ??
      header.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
    code,
    type:
      code === 'attendance_status'
        ? 'single_select'
        : code.includes('score')
          ? 'decimal'
          : code.includes('date')
            ? 'date'
            : 'text',
    required: ['beneficiary_id', 'activity_date'].includes(code),
    metadataKey: code.includes('beneficiary'),
    sadddField: ['age', 'sex', 'gender', 'disability'].some((token) => code.includes(token)),
    allowedValues: code === 'attendance_status' ? ['Present', 'Partial', 'Absent'] : [],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    // Each detected column defines this field, so it starts mapped to its own column.
    mappingStatus: code ? 'mapped' : 'invalid',
  }
}

const formTitleFromFileName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^pathways[\s_-]+/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || 'Imported Questionnaire'

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

export const CollectionWorkspace = (props: CollectionWorkspaceProps) => {
  const { profile } = useCurrentRole()
  const identity =
    profile?.userId && profile.organizationId
      ? JSON.stringify([
          profile.userId,
          profile.organizationId,
          [...profile.roles].sort(),
          [...profile.permissions].sort(),
          [...profile.assignedProjectIds].sort(),
          props.initialProjectId,
          props.initialFormId,
        ])
      : null
  const latestOwner = useRef(identity)
  latestOwner.current = identity
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const isCurrentOwner = useCallback(
    () => alive.current && latestOwner.current === identity,
    [identity],
  )
  if (!identity) return <output>Current collection access is required.</output>
  return <OwnedCollectionWorkspace key={identity} {...props} isCurrentOwner={isCurrentOwner} />
}
const OwnedCollectionWorkspace = ({
  initialMode = 'scratch',
  initialView = 'home',
  initialProjectId,
  initialFormId,
  isCurrentOwner,
}: CollectionWorkspaceProps & { isCurrentOwner: () => boolean }) => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const canReadForms = principalHasAtomicPermission(profile, 'forms.read')
  const canManageForms = principalHasAtomicPermission(profile, 'forms.manage')
  const canPublishForms = principalHasAtomicPermission(profile, 'forms.publish')
  const canGenerateForms = principalHasAtomicPermission(profile, 'forms.generate')
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  const canEncodeData = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/entry').allowed,
  )
  const canOpenForms = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/forms').allowed,
  )
  const canOpenImport = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/import').allowed,
  )
  const canUseExtend = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/import?mode=extend').allowed,
  )
  const [mode, setMode] = useState<CollectionMode>(initialMode)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [editingFormId, setEditingFormId] = useState<string | undefined>(initialFormId)
  const [hydratedFormId, setHydratedFormId] = useState<string | undefined>()
  const [editingBaseUpdatedAt, setEditingBaseUpdatedAt] = useState<string | null>(null)
  const [indicatorIds, setIndicatorIds] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
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
  const [fields, setFields] = useState<FormField[]>(initialFields)
  const [selectedFieldId, setSelectedFieldId] = useState(initialFields[0]?.id ?? '')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [proceedDialogOpen, setProceedDialogOpen] = useState(false)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [pendingDeleteField, setPendingDeleteField] = useState<FormField | null>(null)
  const [savedNotice, setSavedNotice] = useState('')
  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null)
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('No source file selected yet.')

  const mounted = useRef(true)
  const intent = useRef(0)
  const parsing = useRef(0)
  const mutation = useRef<object | null>(null)
  const [operationPending, setOperationPending] = useState(false)
  const [processingRun, setProcessingRun] = useState<{
    projectId: string
    batchId: string
    validationRevision: number
    state: ImportProcessingState
    progress: ImportProcessingProgress
    note?: string
  } | null>(null)
  const processingStopRequested = useRef(false)
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
  const eligible = useCallback(
    (
      permission: Parameters<typeof principalHasAtomicPermission>[1],
      wantedProject = current.current.projectId,
    ) => {
      const principal = current.current.profile
      return Boolean(
        isCurrentOwner() &&
          mounted.current &&
          principalHasAtomicPermission(principal, permission) &&
          (!wantedProject ||
            principal?.assignedProjectIds.includes(wantedProject) ||
            principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' ||
            principal?.roles[0] === 'PROGRAM_MANAGER'),
      )
    },
    [isCurrentOwner],
  )
  const beginOperation = (permission: Parameters<typeof principalHasAtomicPermission>[1]) => {
    if (
      mutation.current ||
      !eligible(permission) ||
      !projects.some((project) => project.id === projectId)
    )
      return null
    const snapshot = current.current
    const selectedFile = lastSelectedFileRef.current
    const actor = profile?.userId
    const organization = profile?.organizationId
    const originalIntent = intent.current
    const generation = sensitiveDraftGeneration()
    const marker = {}
    mutation.current = marker
    setOperationPending(true)
    const valid = (nextPermission = permission) => {
      const now = current.current
      return (
        mutation.current === marker &&
        originalIntent === intent.current &&
        generation === sensitiveDraftGeneration() &&
        lastSelectedFileRef.current === selectedFile &&
        eligible(nextPermission) &&
        actor === now.profile?.userId &&
        organization === now.profile?.organizationId &&
        snapshot.projectId === now.projectId &&
        snapshot.editingFormId === now.editingFormId &&
        snapshot.editingBaseUpdatedAt === now.editingBaseUpdatedAt &&
        snapshot.fields === now.fields &&
        snapshot.mappingRows === now.mappingRows &&
        snapshot.parsedImport === now.parsedImport &&
        snapshot.mode === now.mode &&
        snapshot.view === now.view &&
        snapshot.formTitle === now.formTitle &&
        snapshot.formType === now.formType &&
        snapshot.formCode === now.formCode &&
        snapshot.formDescription === now.formDescription &&
        snapshot.journeyStage === now.journeyStage &&
        snapshot.linkedActivityId === now.linkedActivityId &&
        snapshot.indicatorIds === now.indicatorIds &&
        snapshot.duplicateDecision === now.duplicateDecision &&
        snapshot.forms.find((form) => form.id === snapshot.editingFormId)?.updatedAt ===
          now.forms.find((form) => form.id === now.editingFormId)?.updatedAt
      )
    }
    const finish = () => {
      if (mutation.current === marker) {
        mutation.current = null
        if (mounted.current && isCurrentOwner()) setOperationPending(false)
      }
    }
    return { valid, finish }
  }
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
    uploadIdentity.current = null
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
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      if (mutation.current) return
      intent.current++
      parsing.current++
      setter(value)
    }
  const lastSelectedFileRef = useRef<File | null>(null)
  const uploadIdentity = useRef<{
    file: File
    projectId: string
    formId: string
    version: number
    generation: number
    id: string
  } | null>(null)

  const editingReady =
    !editingFormId ||
    (hydratedFormId === editingFormId &&
      forms.some((form) => form.id === editingFormId && form.projectId === projectId))
  useEffect(() => {
    if (!role || !profile || !eligible('projects.read', '')) return
    let active = true
    const generation = sensitiveDraftGeneration()
    pathwaysClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active || !isCurrentOwner() || generation !== sensitiveDraftGeneration()) return
        setProjects(records)
        setProjectId((current) => current || records[0]?.id || '')
      })
      .catch((error: unknown) => {
        if (active && isCurrentOwner() && generation === sensitiveDraftGeneration())
          setSavedNotice(error instanceof Error ? error.message : 'Projects could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [profile, role, eligible, isCurrentOwner])

  useEffect(() => {
    if (!projectId) {
      setForms([])
      setActivities([])
      setIndicators([])
      return
    }
    let active = true
    const generation = sensitiveDraftGeneration()
    const requests: Promise<void>[] = []
    const load = async <T,>(
      request: Promise<T>,
      apply: (value: T) => void,
      label: string,
      permission: Parameters<typeof principalHasAtomicPermission>[1],
    ) => {
      try {
        const value = await request
        if (
          active &&
          generation === sensitiveDraftGeneration() &&
          current.current.projectId === projectId &&
          eligible(permission, projectId)
        )
          apply(value)
      } catch (error) {
        if (
          active &&
          generation === sensitiveDraftGeneration() &&
          current.current.projectId === projectId &&
          eligible(permission, projectId)
        ) {
          setSavedNotice(error instanceof Error ? error.message : `${label} could not be loaded.`)
        }
      }
    }
    if (canReadForms && eligible('forms.read', projectId)) {
      requests.push(
        load(pathwaysClient.getDigitalForms(projectId), setForms, 'Forms', 'forms.read'),
      )
    } else {
      setForms([])
    }
    if (view === 'builder' && canReadActivities && eligible('activities.read', projectId)) {
      requests.push(
        load(
          pathwaysClient.getActivities(projectId),
          setActivities,
          'Activities',
          'activities.read',
        ),
      )
    } else {
      setActivities([])
    }
    if (view === 'builder' && canReadIndicators && eligible('monitoring.read', projectId)) {
      requests.push(
        load(
          pathwaysClient.getIndicators(projectId),
          setIndicators,
          'Indicators',
          'monitoring.read',
        ),
      )
    } else {
      setIndicators([])
    }
    void Promise.all(requests)
    return () => {
      active = false
    }
  }, [canReadActivities, canReadForms, canReadIndicators, projectId, view, eligible])

  const savedForms: SavedForm[] = forms.map((f) => ({
    id: f.id,
    title: f.name,
    type: f.status,
    project: projects.find((p) => p.id === f.projectId)?.title ?? f.projectId,
    fieldCount: f.fields.length,
    savedAt: f.updatedAt,
  }))
  const openSavedForm = (summary: SavedForm) => {
    if (mutation.current) return
    intent.current++
    parsing.current++
    lastSelectedFileRef.current = null
    uploadIdentity.current = null
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
  }, [initialFormId, forms])
  const selectedProject = projects.find((project) => project.id === projectId)
  const projectActivities = activities.filter((activity) => activity.projectId === projectId)
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0]

  const mappedCount = fields.filter((field) => field.mappingStatus === 'mapped').length
  const sadddCount = fields.filter((field) => field.sadddField).length
  const metadataCount = fields.filter((field) => field.metadataKey).length
  const metadataCoverage = fields.length === 0 ? 0 : Math.round((mappedCount / fields.length) * 100)

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
  const visibleModes = modeDetails.filter((item) => {
    if (item.id === 'scratch') return canManageForms
    if (item.id === 'import') return canOpenImport
    return canUseExtend
  })

  const updateField = (fieldId: string, patch: Partial<FormField>) => {
    if (mutation.current) return
    intent.current++
    setFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    )
  }

  const addField = () => {
    if (mutation.current) return
    intent.current++
    const nextNumber = fields.length + 1
    const field: FormField = {
      id: `field-${Date.now()}`,
      label: `New field ${nextNumber}`,
      code: `new_field_${nextNumber}`,
      type: 'text',
      required: false,
      metadataKey: false,
      sadddField: false,
      allowedValues: [],
      minimumValue: '',
      maximumValue: '',
      minimumLength: '',
      maximumLength: '',
      mappingStatus: 'unmapped',
    }

    setFields((currentFields) => [...currentFields, field])
    setSelectedFieldId(field.id)
  }

  const requestDeleteField = (fieldId: string) => {
    if (mutation.current) return
    intent.current++
    setPendingDeleteField(fields.find((field) => field.id === fieldId) ?? null)
  }

  const confirmDeleteField = () => {
    if (mutation.current) return
    intent.current++
    if (!pendingDeleteField) {
      return
    }

    const deletedIndex = fields.findIndex((field) => field.id === pendingDeleteField.id)
    const nextFields = fields.filter((field) => field.id !== pendingDeleteField.id)
    const nextSelectedFieldId =
      selectedFieldId === pendingDeleteField.id
        ? (nextFields[Math.min(deletedIndex, nextFields.length - 1)]?.id ?? '')
        : selectedFieldId

    setFields(nextFields)
    setSelectedFieldId(nextSelectedFieldId)
    setPendingDeleteField(null)
    toast.success(`${pendingDeleteField.label} deleted from this form.`)
    const focusGeneration = sensitiveDraftGeneration()
    window.setTimeout(() => {
      if (!isCurrentOwner() || !mounted.current || focusGeneration !== sensitiveDraftGeneration())
        return
      const focusTargetId = nextSelectedFieldId
        ? `collection-field-choice-${nextSelectedFieldId}`
        : 'collection-add-field'
      document.getElementById(focusTargetId)?.focus()
    }, 0)
  }

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    if (mutation.current) return
    intent.current++
    setFields((currentFields) => {
      const currentIndex = currentFields.findIndex((field) => field.id === fieldId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentFields.length) {
        return currentFields
      }

      const nextFields = [...currentFields]
      const [field] = nextFields.splice(currentIndex, 1)
      nextFields.splice(targetIndex, 0, field)
      return nextFields
    })
  }

  const openBuilder = (nextMode: CollectionMode) => {
    if (mutation.current) return
    intent.current++
    setMode(nextMode)
    setView(nextMode === 'import' || nextMode === 'extend' ? 'import' : 'builder')
  }

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

  const saveDraftToApi = async () => {
    if (!editingReady) {
      toast.error('The saved form must finish loading before it can be edited.')
      return
    }
    if (!canManageForms) {
      toast.error('Form management is not available for this role.')
      return
    }
    if (!projectId) {
      toast.error('Select an authorized project.')
      return
    }
    if (indicatorIds.length) {
      toast.error(
        'Indicator links cannot be saved by the current form API. Clear them before saving.',
      )
      return
    }
    const input = toDigitalFormInput({
      code:
        formCode ||
        formTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 64),
      name: formTitle.trim(),
      description: formDescription,
      formType: toApiFormType(formType),
      activityId: linkedActivityId || undefined,
      journeyStageId: journeyStage || undefined,
      fields,
    })
    const ticket = beginOperation('forms.manage')
    if (!ticket) return
    try {
      const existing = forms.find((form) => form.id === editingFormId)
      if (existing?.status === 'PUBLISHED') {
        toast.error('Published form fields are read-only. Create a new version before editing.')
        return
      }
      const saved = existing
        ? await pathwaysClient.updateDigitalForm(projectId, existing.id, {
            ...input,
            expectedUpdatedAt: editingBaseUpdatedAt ?? existing.updatedAt,
          })
        : await pathwaysClient.createDigitalForm(projectId, input)
      if (!ticket.valid()) return
      setForms((current) => [...current.filter((form) => form.id !== saved.id), saved])
      setEditingFormId(saved.id)
      setHydratedFormId(saved.id)
      setEditingBaseUpdatedAt(saved.updatedAt)
      setFormCode(saved.code)
      setSaveDialogOpen(false)
      setSavedNotice('Draft saved to the server.')
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'Form draft could not be saved.')
    } finally {
      ticket.finish()
    }
  }
  const publishFormToApi = async () => {
    if (!canPublishForms) {
      toast.error('Form publishing is not available for this role.')
      return
    }
    const existing = forms.find((form) => form.id === editingFormId)
    if (!existing || existing.status !== 'DRAFT') {
      toast.error('Save a persisted Draft before publishing it.')
      return
    }
    const ticket = beginOperation('forms.publish')
    if (!ticket) return
    try {
      const published = await pathwaysClient.publishDigitalForm(
        existing.projectId,
        existing.id,
        existing.updatedAt,
      )
      if (!ticket.valid()) return
      setForms((current) => [...current.filter((form) => form.id !== published.id), published])
      setEditingFormId(published.id)
      setSavedNotice('Form published to the server.')
      setView('forms')
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'Form could not be published.')
    } finally {
      ticket.finish()
    }
  }
  type OperationTicket = NonNullable<ReturnType<typeof beginOperation>>

  // Calls process until the batch is done, a call fails, or Stop is pressed. Each call
  // is a separate authorized request; progress comes from each server response.
  const continueServerProcessing = async (
    ticket: OperationTicket,
    target: {
      projectId: string
      batchId: string
      validationRevision: number
      progress: ImportProcessingProgress
    },
  ) => {
    let latest = target.progress
    processingStopRequested.current = false
    setProcessingRun({ ...target, state: 'running' })
    const outcome: ImportProcessingOutcome = await runImportProcessing({
      process: () =>
        pathwaysClient.processImport(target.projectId, target.batchId, target.validationRevision),
      onProgress: (next) => {
        latest = importProcessingProgress(next)
        if (ticket.valid('imports.process'))
          setProcessingRun((run) =>
            run?.batchId === target.batchId ? { ...run, progress: latest } : run,
          )
      },
      shouldStop: () => processingStopRequested.current || !ticket.valid('imports.process'),
    })
    if (!ticket.valid('imports.process')) {
      // Access or ownership changed; the server keeps its state and nothing stale is shown.
      setProcessingRun(null)
      return
    }
    if (outcome.kind === 'complete') {
      setProcessingRun(null)
      setSavedNotice(
        `Server import ${outcome.batch.id}: ${outcome.batch.totals.processed} processed, ${outcome.batch.totals.failed} failed.`,
      )
      setProceedDialogOpen(false)
      return
    }
    setProcessingRun({
      ...target,
      progress: latest,
      state: outcome.kind === 'stopped' ? 'stopped' : 'failed',
      note:
        outcome.kind === 'failed'
          ? outcome.error instanceof Error
            ? outcome.error.message
            : 'Processing could not be completed.'
          : outcome.kind === 'stalled'
            ? 'The remaining rows could not be processed. Review failed rows in the Import workspace.'
            : undefined,
    })
  }

  const resumeServerProcessing = async () => {
    const run = processingRun
    if (!run || (run.state !== 'stopped' && run.state !== 'failed')) return
    if (run.projectId !== projectId) return
    const ticket = beginOperation('imports.process')
    if (!ticket) return
    try {
      await continueServerProcessing(ticket, run)
    } catch (error) {
      if (ticket.valid('imports.process'))
        setImportMessage(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      ticket.finish()
    }
  }

  const stopServerProcessing = () => {
    processingStopRequested.current = true
    setProcessingRun((run) => (run?.state === 'running' ? { ...run, state: 'stopping' } : run))
  }

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
        const created = await pathwaysClient.createDigitalForm(
          projectId,
          toDigitalFormInput({
            code: importedTitle
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, '')
              .slice(0, 64),
            name: importedTitle,
            description: formDescription,
            formType: toApiFormType(formType),
            fields: importedFields,
          }),
        )
        if (!ticket.valid()) return
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
      const priorUpload = uploadIdentity.current
      const uploadAttempt =
        priorUpload &&
        priorUpload.file === file &&
        priorUpload.projectId === projectId &&
        priorUpload.formId === selectedForm.id &&
        priorUpload.version === selectedForm.version &&
        priorUpload.generation === generation
          ? priorUpload
          : {
              file,
              projectId,
              formId: selectedForm.id,
              version: selectedForm.version,
              generation,
              id: crypto.randomUUID(),
            }
      uploadIdentity.current = uploadAttempt
      const clientImportId = uploadAttempt.id
      const uploaded = await pathwaysClient.uploadImport(
        projectId,
        selectedForm.id,
        clientImportId,
        file,
      )
      if (!ticket.valid('imports.upload')) return
      let automaticRevision: number | undefined
      if (uploaded.mappingRevision === 0 && uploaded.storageStatus === 'STORED') {
        const automatic = await pathwaysClient.automaticImportMapping(projectId, uploaded.id, 0)
        if (!ticket.valid('imports.read')) return
        automaticRevision = automatic.mappingRevision
      }
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
      const detail = await pathwaysClient.getImportBatch(projectId, uploaded.id)
      if (!ticket.valid('imports.review')) return
      const sourceColumns = detail.sourceColumns
      if (!sourceColumns || sourceColumns.length !== decisions.length) {
        throw new Error('The server source columns could not be matched to the reviewed file.')
      }
      const mappings = decisions.map((decision, index) => {
        const column = sourceColumns.find((source) => source.columnIndex === index + 1)
        if (!column || column.header !== decision.sourceFieldName) {
          throw new Error(
            'The server source columns differ from the reviewed file. Review the batch before continuing.',
          )
        }
        return { ...decision, sourceFieldName: column.key }
      })
      const mapped = await pathwaysClient.saveImportMapping(
        projectId,
        uploaded.id,
        detail.mappingRevision ?? automaticRevision ?? uploaded.mappingRevision,
        mappings,
      )
      if (!ticket.valid('imports.validate')) return
      const validated = await pathwaysClient.validateImport(
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
  const downloadSavedForm = async (summary: SavedForm) => {
    const listed = forms.find((form) => form.id === summary.id)
    if (!listed) {
      toast.error('The selected persisted form could not be found.')
      return
    }
    const ticket = beginOperation('forms.export')
    if (!ticket || listed.projectId !== projectId) {
      ticket?.finish()
      return
    }
    try {
      // The server applies forms.export, project scope, artifact bounds and the audit row.
      const request = formDefinitionExportRequest(listed, exportFormat)
      await downloadCoreArtifact(request.url, request.fileName, () => ticket.valid())
      if (!ticket.valid()) return
      toast.success(
        `Exported ${listed.code} version ${listed.version} as ${exportFormat.toUpperCase()}.`,
      )
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'The form could not be exported.')
    } finally {
      ticket.finish()
    }
  }
  return (
    <fieldset disabled={operationPending} className="space-y-6">
      <PageHeader
        editableLabelKey="moduleCollection"
        eyebrow="Data workspace"
        title={labels.moduleCollection}
        actions={
          <>
            {canEncodeData ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/collection/entry">Encode data</Link>
              </Button>
            ) : null}
            {canOpenForms ? (
              <Button asChild size="sm">
                <Link href="/collection/forms">Forms</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {visibleModes.map((item) => (
          <Link
            key={item.id}
            className={cn(
              'rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              mode === item.id && 'border-primary bg-primary-subtle',
            )}
            href={item.href}
            onClick={() => openBuilder(item.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
              <StatusBadge tone={mode === item.id ? 'info' : 'neutral'}>
                {mode === item.id ? 'Selected' : 'Mode'}
              </StatusBadge>
            </div>
          </Link>
        ))}
      </div>

      {savedNotice ? (
        <div className="flex items-center justify-between rounded-sm border border-success/25 bg-success-subtle px-4 py-3 text-sm text-success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {savedNotice}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSavedNotice('')}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {view === 'forms' || view === 'home' ? (
        <FormsGeneratorView
          canCreate={canManageForms}
          canImport={canOpenImport}
          onOpen={openSavedForm}
          onCreate={() => {
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
          }}
          onDownload={downloadSavedForm}
          savedForms={savedForms}
        />
      ) : null}

      {view !== 'import' ? (
        <label className="block text-sm">
          Download format{' '}
          <select
            className="ml-2 rounded border p-2"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {formDefinitionExportFormats.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {view === 'builder' &&
        canManageForms &&
        forms.find((form) => form.id === editingFormId)?.status === 'PUBLISHED' && (
          <Button
            type="button"
            variant="outline"
            disabled={creatingVersion}
            onClick={async () => {
              if (!editingFormId || creatingVersion) return
              const ticket = beginOperation('forms.manage')
              if (!ticket) return
              setCreatingVersion(true)
              try {
                const created = await pathwaysClient.createDigitalFormVersion(
                  projectId,
                  editingFormId,
                )
                if (!ticket.valid()) return
                setForms((current) => [
                  ...current.filter((form) => form.id !== created.id),
                  created,
                ])
                setEditingFormId(created.id)
                setHydratedFormId(created.id)
                setEditingBaseUpdatedAt(created.updatedAt)
                setFormCode(created.code)
                setFormTitle(created.name)
                setFormDescription(created.description ?? '')
                setFormType(created.formType)
                setLinkedActivityId(created.activityId ?? '')
                setJourneyStage(created.journeyStageId ?? '')
                setFields(fromDigitalForm(created))
                setSelectedFieldId(fromDigitalForm(created)[0]?.id ?? '')
                setSavedNotice('A new draft version is ready for editing.')
              } catch (error) {
                if (!ticket.valid()) return
                toast.error(
                  error instanceof Error ? error.message : 'A new version could not be created.',
                )
              } finally {
                if (ticket.valid()) setCreatingVersion(false)
                ticket.finish()
              }
            }}
          >
            Create new version
          </Button>
        )}
      {view === 'builder' &&
        canGenerateForms &&
        forms.some((form) => form.id === editingFormId) && (
          <Button
            type="button"
            variant="outline"
            disabled={creatingVersion}
            onClick={async () => {
              const source = forms.find((form) => form.id === editingFormId)
              if (!source || creatingVersion) return
              const ticket = beginOperation('forms.generate')
              if (!ticket) return
              setCreatingVersion(true)
              try {
                const suffix = `_copy_${Date.now().toString(36)}`
                const created = await pathwaysClient.generateDigitalForm(projectId, {
                  sourceFormId: source.id,
                  code: `${source.code.slice(0, 64 - suffix.length)}${suffix}`,
                  name: `${source.name.slice(0, 150)} (copy)`,
                })
                if (!ticket.valid()) return
                setForms((current) => [...current, created])
                setSavedNotice(`Generated draft form ${created.name}.`)
              } catch (error) {
                if (!ticket.valid()) return
                toast.error(
                  error instanceof Error ? error.message : 'The form could not be generated.',
                )
              } finally {
                if (ticket.valid()) setCreatingVersion(false)
                ticket.finish()
              }
            }}
          >
            Generate copy
          </Button>
        )}
      {view === 'builder' ? (
        <>
          {!editingReady && (
            <output>
              The saved form is not ready. Wait for it to load, or return to Forms if it is
              unavailable.
            </output>
          )}
          <fieldset
            disabled={
              !canManageForms ||
              !editingReady ||
              forms.find((f) => f.id === editingFormId)?.status === 'PUBLISHED'
            }
            className="space-y-4"
          >
            <legend className="font-semibold">Form configuration</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="form-code">Form code</Label>
                <Input
                  id="form-code"
                  value={formCode}
                  readOnly={Boolean(editingFormId)}
                  placeholder="Generated from the title if left blank"
                  onChange={(event) => changeInput(setFormCode)(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="form-description">Description</Label>
                <Input
                  id="form-description"
                  value={formDescription}
                  onChange={(event) => changeInput(setFormDescription)(event.target.value)}
                />
              </div>
            </div>
            <div>
              <p id="linked-indicators-label">Linked indicators</p>
              {indicators
                .filter((i) => i.projectId === projectId)
                .map((i) => (
                  <label className="mr-4 inline-flex gap-2" key={i.id}>
                    <input
                      aria-describedby="linked-indicators-hint"
                      checked={indicatorIds.includes(i.id)}
                      disabled
                      onChange={(e) =>
                        changeInput(setIndicatorIds)(
                          e.target.checked
                            ? [...indicatorIds, i.id]
                            : indicatorIds.filter((id) => id !== i.id),
                        )
                      }
                      title="Not available yet"
                      type="checkbox"
                    />
                    {i.label} <span className="text-muted-foreground">(not available yet)</span>
                  </label>
                ))}
              <UnavailableHint id="linked-indicators-hint" />
            </div>
            <BuilderView
              addField={addField}
              canManage={canManageForms}
              canPublish={
                canPublishForms &&
                forms.find((form) => form.id === editingFormId)?.status === 'DRAFT' &&
                !forms.find((form) => form.id === editingFormId)?.createdByCurrentUser
              }
              deleteField={requestDeleteField}
              fields={fields}
              formTitle={formTitle}
              formType={formType}
              journeyStage={journeyStage}
              linkedActivityId={linkedActivityId}
              metadataCount={metadataCount}
              metadataCoverage={metadataCoverage}
              mappedCount={mappedCount}
              mode={mode}
              moveField={moveField}
              onPublish={() => void publishFormToApi()}
              projectActivities={projectActivities}
              projects={projects}
              projectId={projectId}
              sadddCount={sadddCount}
              selectedField={selectedField}
              selectedFieldId={selectedFieldId}
              selectedProject={selectedProject?.title ?? 'No project selected'}
              setFormTitle={changeInput(setFormTitle)}
              setFormType={changeInput(setFormType)}
              setJourneyStage={changeInput(setJourneyStage)}
              setLinkedActivityId={changeInput(setLinkedActivityId)}
              setProjectId={changeProject}
              setSaveDialogOpen={setSaveDialogOpen}
              setSelectedFieldId={setSelectedFieldId}
              updateField={updateField}
            />
          </fieldset>
        </>
      ) : null}

      {view === 'import' ? (
        <div className="space-y-4">
          <label>
            Duplicate records decision{' '}
            <select
              className="rounded border p-2"
              value={duplicateDecision}
              onChange={(e) => {
                if (mutation.current) return
                intent.current++
                setDuplicateDecision(e.target.value as 'pending' | 'skip' | 'keep')
              }}
            >
              <option value="pending">Decide when duplicates are flagged</option>
              <option disabled title="Not available yet" value="skip">
                Skip duplicates (not available yet)
              </option>
              <option disabled title="Not available yet" value="keep">
                Keep confirmed duplicates (not available yet)
              </option>
            </select>
          </label>
          {parsedImport?.rows.length
            ? (() => {
                const totalRows = parsedImport.rows.length
                const totalPages = Math.max(1, Math.ceil(totalRows / CORRECTION_PAGE_SIZE))
                const page = Math.min(correctionPage, totalPages - 1)
                const pageStart = page * CORRECTION_PAGE_SIZE
                const pageEnd = Math.min(pageStart + CORRECTION_PAGE_SIZE, totalRows)
                const pageRows = parsedImport.rows.slice(pageStart, pageEnd)
                return (
                  <details className="min-w-0">
                    <summary>Correct isolated data before reprocessing</summary>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {totalPages > 1 ? (
                        <output aria-live="polite" className="text-xs text-muted-foreground">
                          Rows {pageStart + 1}-{pageEnd} of {totalRows}
                        </output>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Rows {pageStart + 1}-{pageEnd} of {totalRows}
                        </p>
                      )}
                      {totalPages > 1 ? (
                        <div className="flex gap-2">
                          <Button
                            className="min-h-11"
                            disabled={page === 0}
                            onClick={() => setCorrectionPage((current) => Math.max(0, current - 1))}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Previous
                          </Button>
                          <Button
                            className="min-h-11"
                            disabled={pageEnd >= totalRows}
                            onClick={() => setCorrectionPage((current) => current + 1)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Next
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <section
                      aria-label="Isolated data rows awaiting correction"
                      className="mt-2 max-w-full overflow-x-auto"
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
                      tabIndex={0}
                    >
                      <table className="min-w-max">
                        <tbody>
                          {pageRows.map((row, relativeIndex) => {
                            const rowIndex = pageStart + relativeIndex
                            return (
                              <tr key={rowIndex}>
                                {parsedImport.headers.map((column) => {
                                  const cellValue = String(row[column] ?? '')
                                  return (
                                    <td key={column}>
                                      <Input
                                        aria-label={`Row ${rowIndex + 1}: ${column}`}
                                        className="max-w-[220px] truncate"
                                        title={cellValue}
                                        value={cellValue}
                                        onChange={(event) =>
                                          updateCorrectionCell(rowIndex, column, event.target.value)
                                        }
                                      />
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </section>
                  </details>
                )
              })()
            : null}
          <ImportView
            fields={fields}
            formTitle={formTitle}
            formType={formType}
            importCanProceed={importCanProceed}
            importMessage={importMessage}
            importStatus={importStatus}
            importSummary={importSummary}
            journeyStage={journeyStage}
            linkedActivityId={linkedActivityId}
            mappingRows={mappingRows}
            mappingReadiness={mappingReadiness}
            mode={mode}
            parsedImport={parsedImport}
            parseSelectedFile={parseSelectedFile}
            sourceFileEnabled={Boolean(
              projectId &&
                editingReady &&
                eligible('imports.read') &&
                projects.some((project) => project.id === projectId),
            )}
            projectActivities={projectActivities}
            projects={projects}
            projectId={projectId}
            selectedProject={selectedProject?.title ?? 'No project selected'}
            setFormTitle={changeInput(setFormTitle)}
            setFormType={changeInput(setFormType)}
            setJourneyStage={changeInput(setJourneyStage)}
            setLinkedActivityId={changeInput(setLinkedActivityId)}
            setMappingRows={(next) => {
              if (mutation.current) return
              intent.current++
              setMappingRows(next)
            }}
            setMode={changeInput(setMode)}
            setProceedDialogOpen={setProceedDialogOpen}
            setProjectId={changeProject}
            setView={changeInput(setView)}
            retrySelectedFile={retrySelectedFile}
            uploadProgress={uploadProgress}
          />
        </div>
      ) : null}

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          if (!mutation.current) setSaveDialogOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save form draft?</DialogTitle>
            <DialogDescription>
              This saves the validated definition as a Draft. Publishing remains a separate,
              permission-controlled action.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border bg-surface-subtle p-4 text-sm">
            <p className="font-medium text-foreground">{formTitle}</p>
            <p className="mt-1 text-muted-foreground">
              {fields.length} fields, {mappedCount} mapped, {sadddCount} SADDD fields.
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={operationPending}
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={operationPending} onClick={() => void saveDraftToApi()}>
              Save Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={proceedDialogOpen}
        onOpenChange={(open) => {
          if (mutation.current) return
          if (open) setProceedDialogOpen(true)
          else closeProceedDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parsedImport?.rows.length === 0 ? 'Create draft form?' : 'Review mapped fields?'}
            </DialogTitle>
            <DialogDescription>
              {parsedImport?.rows.length === 0
                ? 'The mapped columns will become questionnaire fields. You can edit the Draft from Forms before publishing.'
                : 'Valid rows will be imported; invalid rows remain isolated for correction and reprocessing.'}
            </DialogDescription>
          </DialogHeader>
          {processingRun ? (
            <ImportProcessingPanel
              canResume={!operationPending}
              focusOnMount
              note={processingRun.note}
              onResume={() => void resumeServerProcessing()}
              onStop={stopServerProcessing}
              progress={processingRun.progress}
              state={processingRun.state}
            />
          ) : null}
          <DialogFooter>
            <Button disabled={operationPending} variant="outline" onClick={closeProceedDialog}>
              {processingRun ? 'Close' : 'Cancel'}
            </Button>
            {processingRun ? null : (
              <Button disabled={operationPending} onClick={confirmImportProceed}>
                {parsedImport?.rows.length === 0 ? 'Create Draft' : 'Proceed'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}
        description="This removes the field and its current configuration from the form."
        onConfirm={confirmDeleteField}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteField(null)
          }
        }}
        open={Boolean(pendingDeleteField)}
        title={`Delete ${pendingDeleteField?.label ?? 'this field'}?`}
      >
        {pendingDeleteField ? (
          <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm">
            <p className="font-medium text-foreground">{pendingDeleteField.label}</p>
            <p className="mt-1 text-muted-foreground">
              Field code: {pendingDeleteField.code} · Type:{' '}
              {dataTypeLabels[pendingDeleteField.type]}
            </p>
          </div>
        ) : null}
      </ConfirmationDialog>
    </fieldset>
  )
}

const FormsGeneratorView = ({
  canCreate,
  canImport,
  onOpen,
  onCreate,
  onDownload,
  savedForms,
}: {
  canCreate: boolean
  canImport: boolean
  onOpen: (form: SavedForm) => void
  onCreate: () => void
  onDownload: (form: SavedForm) => void
  savedForms: SavedForm[]
}) => (
  <div className="rounded-lg border bg-card p-5">
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Form Generator</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Collection forms</h2>
      </div>
      {canCreate || canImport ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {canCreate ? (
              <DropdownMenuItem onClick={onCreate}>
                <ListPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create New
              </DropdownMenuItem>
            ) : null}
            {canImport ? (
              <DropdownMenuItem asChild>
                <Link href="/collection/import">
                  <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                  Import file
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>

    <div className="mt-4 space-y-3">
      {savedForms.map((form) => (
        <div
          key={form.id}
          className="grid gap-3 rounded-sm border bg-surface-subtle p-4 text-sm md:grid-cols-[1fr_auto]"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary-subtle text-primary">
              <Database className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-foreground">{form.title}</p>
              <p className="mt-1 text-muted-foreground">
                Status: {form.type} | {form.project} | {form.fieldCount} fields | Saved:{' '}
                {form.savedAt}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpen(form)}>
              Open form
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload(form)}>
              Export form
            </Button>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const BuilderView = ({
  addField,
  canManage,
  canPublish,
  deleteField,
  fields,
  formTitle,
  formType,
  journeyStage,
  linkedActivityId,
  metadataCount,
  metadataCoverage,
  mappedCount,
  mode,
  moveField,
  onPublish,
  projectActivities,
  projects,
  projectId,
  sadddCount,
  selectedField,
  selectedFieldId,
  selectedProject,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setProjectId,
  setSaveDialogOpen,
  setSelectedFieldId,
  updateField,
}: {
  addField: () => void
  canManage: boolean
  canPublish: boolean
  deleteField: (fieldId: string) => void
  fields: FormField[]
  formTitle: string
  formType: string
  journeyStage: string
  linkedActivityId: string
  metadataCount: number
  metadataCoverage: number
  mappedCount: number
  mode: CollectionMode
  moveField: (fieldId: string, direction: 'up' | 'down') => void
  onPublish: () => void
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectId: string
  sadddCount: number
  selectedField?: FormField
  selectedFieldId: string
  selectedProject: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setProjectId: (value: string) => void
  setSaveDialogOpen: (open: boolean) => void
  setSelectedFieldId: (fieldId: string) => void
  updateField: (fieldId: string, patch: Partial<FormField>) => void
}) => (
  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-4">
      <FormInfoPanel
        formTitle={formTitle}
        formType={formType}
        journeyStage={journeyStage}
        linkedActivityId={linkedActivityId}
        projectActivities={projectActivities}
        projects={projects}
        projectId={projectId}
        setFormTitle={setFormTitle}
        setFormType={setFormType}
        setJourneyStage={setJourneyStage}
        setLinkedActivityId={setLinkedActivityId}
        setProjectId={setProjectId}
      />

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {fields.length} Fields
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {mode === 'extend' ? 'Imported fields and extensions' : 'Form field list'}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StatusBadge tone="success">{mappedCount} mapped</StatusBadge>
            <StatusBadge tone="info">{metadataCount} metadata keys</StatusBadge>
            <StatusBadge tone="warning">{sadddCount} SADDD fields</StatusBadge>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className={cn(
                'rounded-sm border bg-background p-3 transition',
                selectedFieldId === field.id && 'border-primary bg-primary-subtle',
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <button
                  aria-pressed={selectedFieldId === field.id}
                  className="flex flex-1 items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-ring"
                  id={`collection-field-choice-${field.id}`}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                >
                  <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">{field.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dataTypeLabels[field.type]} | {field.code}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedFieldId === field.id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Selected
                        </span>
                      ) : null}
                      {field.required ? <StatusBadge tone="danger">Required</StatusBadge> : null}
                      {field.metadataKey ? (
                        <StatusBadge tone="info">Metadata key</StatusBadge>
                      ) : null}
                      {field.sadddField ? (
                        <StatusBadge tone="warning">SADDD field</StatusBadge>
                      ) : null}
                      <StatusBadge tone={statusTone(field.mappingStatus)}>
                        {field.mappingStatus}
                      </StatusBadge>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Move ${field.label} up`}
                    disabled={index === 0}
                    size="icon"
                    variant="ghost"
                    onClick={() => moveField(field.id, 'up')}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Move ${field.label} down`}
                    disabled={index === fields.length - 1}
                    size="icon"
                    variant="ghost"
                    onClick={() => moveField(field.id, 'down')}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Edit ${field.label}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedFieldId(field.id)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Delete ${field.label}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {selectedFieldId === field.id ? (
                <FieldEditor field={field} updateField={updateField} />
              ) : null}
            </div>
          ))}
        </div>

        {canManage ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <Button id="collection-add-field" variant="outline" onClick={addField}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add field
            </Button>
            <Button onClick={() => setSaveDialogOpen(true)}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save Draft
            </Button>
            {canPublish ? (
              <Button className="md:col-span-2" onClick={onPublish}>
                Publish saved draft
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-sm border border-dashed border-border p-3 text-sm text-muted-foreground">
            This form is available as read-only for your current role.
          </p>
        )}
      </div>
    </div>

    <aside className="min-w-0 space-y-4">
      <MetadataMapPanel
        fields={fields}
        mappedCount={mappedCount}
        metadataCoverage={metadataCoverage}
        selectedField={selectedField}
        selectedProject={selectedProject}
      />
      <FormPreviewPanel fields={fields} formTitle={formTitle} />
    </aside>
  </div>
)

const FormInfoPanel = ({
  formTitle,
  formType,
  journeyStage,
  linkedActivityId,
  projectActivities,
  projects,
  projectId,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setProjectId,
}: {
  formTitle: string
  formType: string
  journeyStage: string
  linkedActivityId: string
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectId: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setProjectId: (value: string) => void
}) => (
  <div className="rounded-lg border bg-card p-4">
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="form-title">Form information</Label>
        <Input
          id="form-title"
          value={formTitle}
          onChange={(event) => setFormTitle(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Form type</Label>
        <Select value={formType} onValueChange={setFormType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(formTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Project selection</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <JourneyStageSelector
          projectId={projectId}
          value={journeyStage}
          onChange={setJourneyStage}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Linked activity</Label>
        <Select value={linkedActivityId} onValueChange={setLinkedActivityId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an activity" />
          </SelectTrigger>
          <SelectContent>
            {projectActivities.map((activity) => (
              <SelectItem key={activity.id} value={activity.id}>
                {activity.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
)

const JourneyStageSelector = ({
  projectId,
  value,
  onChange,
}: { projectId: string; value: string; onChange: (value: string) => void }) => {
  const { profile } = useCurrentRole()
  const canRead = principalHasAtomicPermission(profile, 'journeys.read')
  const [stages, setStages] = useState<JourneyStageConfig[]>([])
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    setStages([])
    setUnavailable(false)
    if (projectId && canRead) {
      void pathwaysClient.getJourneyStages(projectId).then(
        (records) => {
          if (active) setStages(records)
        },
        () => {
          if (active) setUnavailable(true)
        },
      )
    }
    return () => {
      active = false
    }
  }, [projectId, canRead])
  return (
    <>
      <Label htmlFor="journey-stage">Journey stage</Label>
      <Select
        value={value || '__none__'}
        onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
        disabled={!canRead || unavailable}
      >
        <SelectTrigger id="journey-stage">
          <SelectValue placeholder="No linked stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No linked stage</SelectItem>
          {value && !stages.some((stage) => stage.id === value) && (
            <SelectItem value={value}>Previously selected stage</SelectItem>
          )}
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unavailable && (
        <p className="text-sm text-muted-foreground">
          Stages could not be loaded. The saved link is retained.
        </p>
      )}
    </>
  )
}

const FieldEditor = ({
  field,
  updateField,
}: {
  field: FormField
  updateField: (fieldId: string, patch: Partial<FormField>) => void
}) => (
  <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${field.id}-label`}>Field label</Label>
      <Input
        id={`${field.id}-label`}
        value={field.label}
        onChange={(event) => updateField(field.id, { label: event.target.value })}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${field.id}-code`}>Field code</Label>
      <Input
        id={`${field.id}-code`}
        value={field.code}
        onChange={(event) => updateField(field.id, { code: fieldCodeFromText(event.target.value) })}
      />
    </div>
    <div className="space-y-2">
      <Label>Data type</Label>
      <Select
        value={field.type}
        onValueChange={(value) => updateField(field.id, { type: value as FieldType })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(dataTypeLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label>Mapping status</Label>
      <Select
        value={field.mappingStatus}
        onValueChange={(value) => updateField(field.id, { mappingStatus: value as MappingStatus })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mapped">Mapped</SelectItem>
          <SelectItem value="unmapped">Unmapped</SelectItem>
          <SelectItem value="ignored">Ignored</SelectItem>
          <SelectItem value="invalid">Invalid</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {(field.type === 'single_select' || field.type === 'multi_select') && (
      <div className="space-y-2 md:col-span-2">
        <p className="text-sm font-medium">Allowed values</p>
        {field.allowedValues.map((value, index) => (
          <div key={`${field.id}-option-${index}`} className="flex gap-2">
            <Label className="sr-only" htmlFor={`${field.id}-option-${index}`}>
              Option {index + 1}
            </Label>
            <Input
              id={`${field.id}-option-${index}`}
              value={value}
              onChange={(event) =>
                updateField(field.id, {
                  allowedValues: field.allowedValues.map((option, i) =>
                    i === index ? event.target.value : option,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              aria-label={`Remove option ${index + 1}`}
              onClick={() =>
                updateField(field.id, {
                  allowedValues: field.allowedValues.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => updateField(field.id, { allowedValues: [...field.allowedValues, ''] })}
        >
          Add option
        </Button>
      </div>
    )}
    {(field.type === 'integer' || field.type === 'decimal' || field.type === 'date') && (
      <>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-minimum`}>
            Minimum {field.type === 'date' ? 'date' : 'value'}
          </Label>
          <Input
            id={`${field.id}-minimum`}
            type={field.type === 'date' ? 'date' : 'text'}
            value={field.minimumValue}
            onChange={(event) => updateField(field.id, { minimumValue: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-maximum`}>
            Maximum {field.type === 'date' ? 'date' : 'value'}
          </Label>
          <Input
            id={`${field.id}-maximum`}
            type={field.type === 'date' ? 'date' : 'text'}
            value={field.maximumValue}
            onChange={(event) => updateField(field.id, { maximumValue: event.target.value })}
          />
        </div>
      </>
    )}
    {(field.type === 'text' || field.type === 'long_text' || field.type === 'multi_select') && (
      <>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-min-length`}>
            Minimum {field.type === 'multi_select' ? 'selections' : 'length'}
          </Label>
          <Input
            id={`${field.id}-min-length`}
            type="number"
            min="0"
            value={field.minimumLength}
            onChange={(event) => updateField(field.id, { minimumLength: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-max-length`}>
            Maximum {field.type === 'multi_select' ? 'selections' : 'length'}
          </Label>
          <Input
            id={`${field.id}-max-length`}
            type="number"
            min="1"
            value={field.maximumLength}
            onChange={(event) => updateField(field.id, { maximumLength: event.target.value })}
          />
        </div>
      </>
    )}
    <div className="grid gap-2 sm:grid-cols-3 md:col-span-2">
      <ToggleRow
        checked={field.required}
        label="Required"
        onChange={(checked) => updateField(field.id, { required: checked })}
      />
      <ToggleRow
        checked={field.metadataKey}
        label="Metadata-key"
        onChange={(checked) => updateField(field.id, { metadataKey: checked })}
      />
      <ToggleRow
        checked={field.sadddField}
        label="SADDD-field"
        onChange={(checked) => updateField(field.id, { sadddField: checked })}
      />
    </div>
  </div>
)

const ToggleRow = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) => (
  <label className="flex items-center justify-between gap-3 rounded-sm border bg-surface-subtle px-3 py-2 text-sm">
    <span className="font-medium text-foreground">{label}</span>
    <input
      checked={checked}
      className="h-4 w-4 accent-primary"
      type="checkbox"
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
)

const MetadataMapPanel = ({
  fields,
  mappedCount,
  metadataCoverage,
  selectedField,
  selectedProject,
}: {
  fields: FormField[]
  mappedCount: number
  metadataCoverage: number
  selectedField?: FormField
  selectedProject: string
}) => (
  <div className="rounded-lg border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Metadata map</p>
        <p className="text-xs text-muted-foreground">Current field summary</p>
      </div>
      <StatusBadge tone="info">Current</StatusBadge>
    </div>
    <div className="mt-4 space-y-3 text-sm">
      <div className="rounded-sm bg-surface-subtle p-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Total fields</span>
          <span className="text-right font-medium text-foreground">{fields.length}</span>
          <span>Mapped</span>
          <span className="text-right font-medium text-success">{mappedCount}</span>
          <span>Unmapped</span>
          <span className="text-right font-medium text-warning">
            {fields.filter((field) => field.mappingStatus === 'unmapped').length}
          </span>
          <span>Invalid</span>
          <span className="text-right font-medium text-danger">
            {fields.filter((field) => field.mappingStatus === 'invalid').length}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar label="Metadata coverage" value={metadataCoverage} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Selected field</p>
        <div className="mt-2 rounded-sm border bg-surface-subtle p-3">
          <p className="font-medium text-foreground">
            {selectedField?.label ?? 'No field selected'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedField
              ? `Maps to ${selectedField.code} in ${selectedProject}.`
              : 'Choose a field to inspect metadata links.'}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {metadataConnections.map((item) => (
          <div key={item} className="rounded-sm bg-info-subtle px-3 py-2 text-xs text-info">
            {item}
          </div>
        ))}
      </div>
    </div>
  </div>
)

const FormPreviewPanel = ({ fields, formTitle }: { fields: FormField[]; formTitle: string }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-sm font-semibold text-foreground">Form preview</p>
    <p className="mt-1 text-xs text-muted-foreground">{formTitle}</p>
    <div className="mt-4 space-y-3">
      {fields.slice(0, 4).map((field) => (
        <div key={field.id} className="rounded-sm border bg-surface-subtle p-3">
          <Label>{field.label}</Label>
          <div className="mt-2 h-9 rounded-sm border bg-background px-3 py-2 text-xs text-muted-foreground">
            {field.type.includes('select')
              ? field.allowedValues.join(', ') || 'Option 1, Option 2'
              : dataTypeLabels[field.type]}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const ImportView = ({
  fields,
  formTitle,
  formType,
  importCanProceed,
  importMessage,
  importStatus,
  importSummary,
  journeyStage,
  linkedActivityId,
  mappingRows,
  mappingReadiness,
  mode,
  parsedImport,
  parseSelectedFile,
  sourceFileEnabled,
  projectActivities,
  projects,
  projectId,
  selectedProject,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setMappingRows,
  setMode,
  setProceedDialogOpen,
  setProjectId,
  setView,
  retrySelectedFile,
  uploadProgress,
}: {
  fields: FormField[]
  formTitle: string
  formType: string
  importCanProceed: boolean
  importMessage: string
  importStatus: ImportStatus
  importSummary: ReturnType<typeof createFileSummary> | null
  journeyStage: string
  linkedActivityId: string
  mappingRows: MappingRow[]
  mappingReadiness: MappingReadiness
  mode: CollectionMode
  parsedImport: ParsedImport | null
  parseSelectedFile: (file: File) => Promise<void>
  sourceFileEnabled: boolean
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectId: string
  selectedProject: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setMappingRows: React.Dispatch<React.SetStateAction<MappingRow[]>>
  setMode: (mode: CollectionMode) => void
  setProceedDialogOpen: (open: boolean) => void
  setProjectId: (value: string) => void
  setView: (view: CollectionView) => void
  retrySelectedFile: () => void
  uploadProgress: number
}) => (
  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-4">
      <FormInfoPanel
        formTitle={formTitle}
        formType={formType}
        journeyStage={journeyStage}
        linkedActivityId={linkedActivityId}
        projectActivities={projectActivities}
        projects={projects}
        projectId={projectId}
        setFormTitle={setFormTitle}
        setFormType={setFormType}
        setJourneyStage={setJourneyStage}
        setLinkedActivityId={setLinkedActivityId}
        setProjectId={setProjectId}
      />

      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed bg-surface-subtle px-4 py-8 text-center">
          <FileUp className="h-8 w-8 text-primary" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-foreground">
            Upload your existing form file
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Select a CSV, XLS, or XLSX file to review and map its columns before import.
          </p>
          <div className="mt-4 w-full max-w-xl space-y-2 text-left">
            <Label htmlFor="collection-import-file">Source file</Label>
            <Input
              disabled={!sourceFileEnabled}
              accept=".csv,.xls,.xlsx"
              aria-describedby="collection-import-file-help"
              id="collection-import-file"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]

                if (file) {
                  void parseSelectedFile(file)
                }
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground" id="collection-import-file-help">
              Choose one CSV, XLS, or XLSX file.
              {!sourceFileEnabled
                ? ' Project and selected form access must be ready before choosing a file.'
                : null}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMode('scratch')
                setView('builder')
              }}
            >
              Build Forms
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <ProgressBar
            label="File reading progress"
            tone={
              importStatus === 'error' ? 'danger' : importStatus === 'ready' ? 'success' : 'info'
            }
            value={uploadProgress}
          />
          <output
            aria-atomic="true"
            aria-live="polite"
            className={cn(
              'block rounded-md px-3 py-2 text-sm',
              importStatus === 'error'
                ? 'bg-danger-subtle font-medium text-danger'
                : 'bg-surface-subtle text-muted-foreground',
            )}
            data-import-status={importStatus}
          >
            {importMessage}
          </output>
          {importStatus === 'error' ? (
            <Button size="sm" type="button" variant="outline" onClick={retrySelectedFile}>
              Retry reading file
            </Button>
          ) : null}
        </div>
      </div>

      {importSummary ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryMetric label="File" value={importSummary.fileName} />
            <SummaryMetric label="Rows" value={String(importSummary.totalRows)} />
            <SummaryMetric label="Columns" value={String(importSummary.totalColumns)} />
          </div>
          {parsedImport?.sheetNames?.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Sheets detected: {parsedImport.sheetNames.join(', ')}
            </p>
          ) : null}
          {importSummary.warnings.length > 0 ? (
            <div className="mt-3 rounded-sm bg-warning-subtle p-3 text-xs text-warning">
              {importSummary.warnings.join(' ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {mappingRows.length > 0 ? (
        <MappingTable
          canProceed={importCanProceed}
          createsDraft={parsedImport?.rows.length === 0}
          fields={fields}
          mappingRows={mappingRows}
          mappingReadiness={mappingReadiness}
          setMappingRows={setMappingRows}
          setProceedDialogOpen={setProceedDialogOpen}
          setView={setView}
          mode={mode}
        />
      ) : null}

      {parsedImport ? <DataPreview parsedImport={parsedImport} /> : null}
    </div>

    <aside className="min-w-0 space-y-4">
      <ImportValidationPanel
        canProceed={importCanProceed}
        mappingReadiness={mappingReadiness}
        parsedImport={parsedImport}
      />
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Connected to</p>
        <p className="mt-1 text-xs text-muted-foreground">{selectedProject}</p>
        <div className="mt-3 space-y-2">
          {metadataConnections.map((item) => (
            <div key={item} className="rounded-sm bg-info-subtle px-3 py-2 text-xs text-info">
              {item}
            </div>
          ))}
        </div>
      </div>
    </aside>
  </div>
)

const SummaryMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-sm bg-surface-subtle p-3">
    <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
  </div>
)

const MappingTable = ({
  canProceed,
  createsDraft,
  fields,
  mappingRows,
  mappingReadiness,
  mode,
  setMappingRows,
  setProceedDialogOpen,
  setView,
}: {
  canProceed: boolean
  createsDraft: boolean
  fields: FormField[]
  mappingRows: MappingRow[]
  mappingReadiness: MappingReadiness
  mode: CollectionMode
  setMappingRows: React.Dispatch<React.SetStateAction<MappingRow[]>>
  setProceedDialogOpen: (open: boolean) => void
  setView: (view: CollectionView) => void
}) => {
  const labelFor = (code: string) => fields.find((field) => field.code === code)?.label ?? code
  // Header-only questionnaires target new field codes that are not builder fields yet.
  const targetOptions = [
    ...fields.map((field) => ({ code: field.code, label: field.label })),
    ...mappingRows
      .filter((row) => row.targetField && !fields.some((field) => field.code === row.targetField))
      .map((row) => ({ code: row.targetField, label: row.sourceColumn })),
  ].filter((option, index, all) => all.findIndex((other) => other.code === option.code) === index)
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Metadata mapping</h2>
          <p className="text-sm text-muted-foreground">
            Review source columns, target fields, and validation states.
          </p>
        </div>
        <div className="flex gap-2">
          {mode === 'extend' ? (
            <Button size="sm" variant="outline" onClick={() => setView('builder')}>
              Extend in builder
            </Button>
          ) : null}
          <Button
            aria-describedby="mapping-readiness-message"
            disabled={!canProceed}
            size="sm"
            onClick={() => setProceedDialogOpen(true)}
          >
            {createsDraft ? 'Create Draft' : 'Proceed'}
          </Button>
        </div>
      </div>
      <p
        className={cn(
          'mt-3 rounded-md px-3 py-2 text-sm',
          canProceed && mappingReadiness.canProceed
            ? 'bg-success-subtle text-success'
            : 'bg-warning-subtle text-warning',
        )}
        id="mapping-readiness-message"
      >
        {canProceed && !mappingReadiness.canProceed && !createsDraft
          ? 'This file can be uploaded to staging. An authorized reviewer must resolve unmatched columns before validation and processing.'
          : canProceed
            ? mappingReadiness.message
            : mappingReadiness.canProceed
              ? 'The current file must finish successfully before proceeding.'
              : mappingReadiness.message}
      </p>
      <section
        aria-label="Metadata mapping rows"
        className="mt-4 max-w-full overflow-x-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
        tabIndex={0}
      >
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Source columns</th>
              <th className="px-3 py-2">Target fields</th>
              <th className="px-3 py-2">Mapping status</th>
            </tr>
          </thead>
          <tbody>
            {mappingRows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="max-w-[220px] px-3 py-3 font-medium text-foreground">
                  <span className="block truncate" title={row.sourceColumn}>
                    {row.sourceColumn}
                  </span>
                  {row.autoMatched && row.status === 'mapped' ? (
                    <StatusBadge tone="success">Auto-matched</StatusBadge>
                  ) : null}
                  {row.suggestedField && row.status !== 'mapped' ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Suggested: {labelFor(row.suggestedField)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={row.targetField || 'none'}
                    onValueChange={(value) =>
                      setMappingRows((currentRows) =>
                        currentRows.map((currentRow) =>
                          currentRow.id === row.id
                            ? {
                                ...currentRow,
                                targetField: value === 'none' ? '' : value,
                                status: value === 'none' ? 'unmapped' : 'mapped',
                                autoMatched: false,
                              }
                            : currentRow,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No target field</SelectItem>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={row.status}
                    onValueChange={(value) =>
                      setMappingRows((currentRows) =>
                        currentRows.map((currentRow) =>
                          currentRow.id === row.id
                            ? { ...currentRow, status: value as MappingStatus }
                            : currentRow,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem disabled={!row.targetField} value="mapped">
                        Mapped
                      </SelectItem>
                      <SelectItem value="unmapped">Unmapped</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

const DataPreview = ({ parsedImport }: { parsedImport: ParsedImport }) => (
  <div className="min-w-0 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold text-foreground">Data preview</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Showing the first {Math.min(parsedImport.rows.length, MAX_PREVIEW_ROWS)} of{' '}
      {parsedImport.rows.length} rows for mapping and validation review.
    </p>
    <section
      aria-label="Data preview rows"
      className="mt-4 max-w-full overflow-x-auto"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
      tabIndex={0}
    >
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            {parsedImport.headers.map((header) => (
              <th key={header} className="max-w-[220px] truncate px-3 py-2" title={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsedImport.rows.slice(0, MAX_PREVIEW_ROWS).map((row, index) => (
            <tr key={`${parsedImport.fileName}-${index}`} className="border-t">
              {parsedImport.headers.map((header) => {
                const cellText = formatValue(row[header])
                return (
                  <td
                    key={header}
                    className="max-w-[220px] truncate px-3 py-3 text-muted-foreground"
                    title={cellText}
                  >
                    {cellText}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </div>
)

const ImportValidationPanel = ({
  canProceed,
  mappingReadiness,
  parsedImport,
}: {
  canProceed: boolean
  mappingReadiness: MappingReadiness
  parsedImport: ParsedImport | null
}) => {
  const { ignored, invalid, mapped, resolved, total, unmapped } = mappingReadiness
  const progress = total === 0 ? 0 : Math.round((resolved / total) * 100)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Validation summary</p>
          <p className="text-xs text-muted-foreground">Column and row checks</p>
        </div>
        <StatusBadge
          tone={
            invalid > 0
              ? 'danger'
              : !canProceed && parsedImport
                ? 'warning'
                : parsedImport
                  ? 'success'
                  : 'neutral'
          }
        >
          {parsedImport ? (canProceed ? 'Ready to proceed' : 'Needs review') : 'Waiting'}
        </StatusBadge>
      </div>
      <div className="mt-4 space-y-3">
        <ProgressBar label="Resolved columns" value={progress} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <SummaryPill label="Mapped" tone="success" value={mapped} />
          <SummaryPill label="Unmapped" tone="warning" value={unmapped} />
          <SummaryPill label="Ignored" tone="neutral" value={ignored} />
          <SummaryPill label="Invalid" tone="danger" value={invalid} />
        </div>
        <p className="rounded-sm bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground">
          Validation checks column headings and preview rows before import.
        </p>
      </div>
    </div>
  )
}

const SummaryPill = ({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'success' | 'warning' | 'neutral' | 'danger'
  value: number
}) => (
  <div className="rounded-sm border bg-surface-subtle p-2">
    <p className="text-muted-foreground">{label}</p>
    <p
      className={cn(
        'mt-1 text-lg font-semibold',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'neutral' && 'text-muted-foreground',
        tone === 'danger' && 'text-danger',
      )}
    >
      {value}
    </p>
  </div>
)
