'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createFileSummary, importHeaderLabel } from '@pathways/imports'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, ConfirmationDialog, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  IMPORT_DUPLICATE_DECISION_UI_ENABLED,
  UNFINISHED_CONTROLS_UI_ENABLED,
} from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { activitiesClient } from '@/lib/api/activities'
import { formsClient } from '@/lib/api/forms'
import { importsClient } from '@/lib/api/imports'
import { indicatorsClient } from '@/lib/api/indicators'
import { projectsClient } from '@/lib/api/projects'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import { getVerifiedRouteAccess, principalHasAtomicPermission } from '@/lib/rbac/policy'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { cn } from '@/lib/utils'
import type {
  ActivitySummary,
  DigitalFormDefinition,
  DigitalFormType,
  Indicator,
  ProjectSummary,
} from '@/types/pathways'

import {
  type CollectionMode,
  type CollectionView,
  type FormField,
  type ImportStatus,
  type ParsedImport,
  type SavedForm,
  dataTypeLabels,
} from '../../collection.utils'
import {
  type MappingRow,
  createQuestionnaireMappingRows,
  createSmartMappingRows,
  getMappingReadiness,
} from '../../import/collection-import-state'
import { ImportProcessingPanel } from '../../import/components/import-processing-panel'
import { ImportView } from '../../import/components/import-view'
import { useImportBatch } from '../../import/hooks/use-import-batch'
import { useServerProcessing } from '../../import/hooks/use-server-processing'
import { importProcessingProgress } from '../../import/import-auto-continue'
import { parseImportPreview } from '../../import/import-preview'
import {
  fieldCodeFromText,
  fromDigitalForm,
  neatFormCode,
  toDigitalFormInput,
} from '../digital-form-contract'
import {
  type FormDefinitionExportFormat,
  formDefinitionExportRequest,
} from '../form-definition-export'
import { useFormFields } from '../hooks/use-form-fields'
import { BuilderView } from './builder-view'
import { FormsGeneratorView } from './forms-generator-view'

type ExportFormat = FormDefinitionExportFormat
/** The editable correction table paginates instead of capping, so every row stays correctable. */
const CORRECTION_PAGE_SIZE = 25

interface CollectionWorkspaceProps {
  initialMode?: CollectionMode
  initialView?: CollectionView
  initialProjectId?: string
  initialFormId?: string
}

const toApiFormType = (type: string): DigitalFormType => type as DigitalFormType

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
  // A layout effect, so React's development StrictMode remount re-arms this flag before the
  // owned child's passive effects re-run. As a passive effect it ran after them, so the child's
  // mount-time ownership check saw a dead owner and skipped loading the project list.
  useLayoutEffect(() => {
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
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [editingFormId, setEditingFormId] = useState<string | undefined>(initialFormId)
  const [hydratedFormId, setHydratedFormId] = useState<string | undefined>()
  const [editingBaseUpdatedAt, setEditingBaseUpdatedAt] = useState<string | null>(null)
  const [indicatorIds, setIndicatorIds] = useState<string[]>([])
  // Format selection is hidden (docs/deferred-features.md); exports use the default.
  const exportFormat: ExportFormat = 'csv'
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

  const editingReady =
    !editingFormId ||
    (hydratedFormId === editingFormId &&
      forms.some((form) => form.id === editingFormId && form.projectId === projectId))
  // Keyed on primitives, not the profile object: a background `me` refetch hands back a new
  // object for the same identity and must not cancel an in-flight load. A response dropped
  // because the sensitive-draft generation moved (or the request lost ownership mid-flight)
  // is retried against the new generation instead of leaving the list empty.
  const hasProfile = Boolean(profile)
  const profileUserId = profile?.userId
  const profileOrganizationId = profile?.organizationId
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity primitives stand in for the profile object
  useEffect(() => {
    if (!role || !hasProfile || !eligible('projects.read', '')) return
    let active = true
    const maxAttempts = 3
    const load = async (attempt: number): Promise<void> => {
      const generation = sensitiveDraftGeneration()
      const retry = () => active && isCurrentOwner() && attempt < maxAttempts
      try {
        const records = await projectsClient.getProjectsForRole(role)
        if (!active || !isCurrentOwner()) return
        if (generation !== sensitiveDraftGeneration()) {
          if (retry()) return load(attempt + 1)
          // Retries exhausted: never render the dropped rows, but never stay on "Loading".
          setProjectsLoaded(true)
          setLoadError('Projects could not be loaded.')
          return
        }
        setProjects(records)
        setProjectId((current) => current || records[0]?.id || '')
        setProjectsLoaded(true)
      } catch (error: unknown) {
        if (!active || !isCurrentOwner()) return
        if (generation !== sensitiveDraftGeneration() && retry()) return load(attempt + 1)
        setProjectsLoaded(true)
        setLoadError(error instanceof Error ? error.message : 'Projects could not be loaded.')
      }
    }
    void load(1)
    return () => {
      active = false
    }
  }, [hasProfile, profileUserId, profileOrganizationId, role, eligible, isCurrentOwner, reloadKey])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey re-runs the load when Retry is pressed
  useEffect(() => {
    if (!projectId) {
      setForms([])
      setActivities([])
      setIndicators([])
      return
    }
    setFormsLoaded(false)
    setLoadError('')
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
          setLoadError(error instanceof Error ? error.message : `${label} could not be loaded.`)
        }
      }
    }
    if (canReadForms && eligible('forms.read', projectId)) {
      requests.push(
        load(formsClient.getDigitalForms(projectId), setForms, 'Forms', 'forms.read').then(() => {
          if (active) setFormsLoaded(true)
        }),
      )
    } else {
      setForms([])
      setFormsLoaded(true)
    }
    if (view === 'builder' && canReadActivities && eligible('activities.read', projectId)) {
      requests.push(
        load(
          activitiesClient.getActivities(projectId),
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
          indicatorsClient.getIndicators(projectId),
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
  }, [canReadActivities, canReadForms, canReadIndicators, projectId, view, eligible, reloadKey])

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
    // Generated once per new draft so a retried create reuses the same code.
    const code = formCode || neatFormCode(formTitle)
    if (!formCode) setFormCode(code)
    const input = toDigitalFormInput({
      code,
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
        ? await formsClient.updateDigitalForm(projectId, existing.id, {
            ...input,
            expectedUpdatedAt: editingBaseUpdatedAt ?? existing.updatedAt,
          })
        : await formCreate.submit(fingerprintOf(input.code), () =>
            formsClient.createDigitalForm(projectId, input),
          )
      if (!saved || !ticket.valid()) return
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
      const published = await formsClient.publishDigitalForm(
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
  const canReadProjects = principalHasAtomicPermission(profile, 'projects.read')
  // Without a selected project the list waits on the project load, unless projects cannot be read.
  const formsLoading = projectId ? !formsLoaded : !projectsLoaded && canReadProjects
  const loadErrorState = loadError ? (
    <AsyncState
      status="error"
      title="Collection data could not be loaded"
      description={loadError}
      onRetry={() => {
        setLoadError('')
        setReloadKey((key) => key + 1)
      }}
    />
  ) : null
  return (
    <fieldset disabled={operationPending} className="space-y-6">
      <PageHeader
        editableLabelKey="moduleCollection"
        title={labels.moduleCollection}
        actions={
          canOpenForms ? (
            <Button asChild>
              <Link href="/collection/forms">Forms</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {visibleModes.map((item) => (
          <Link
            key={item.id}
            className={cn(
              'rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
              {mode === item.id ? <StatusBadge tone="info">Selected</StatusBadge> : null}
            </div>
          </Link>
        ))}
      </div>

      {loadError && view !== 'forms' && view !== 'home' ? loadErrorState : null}

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
          status={formsLoading ? 'loading' : loadError ? 'error' : 'ready'}
          errorState={loadErrorState}
        />
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
                const created = await formsClient.createDigitalFormVersion(projectId, editingFormId)
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
                const created = await formsClient.generateDigitalForm(projectId, {
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
            <output className="block rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
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
              projectsLoaded={projectsLoaded}
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
          {UNFINISHED_CONTROLS_UI_ENABLED && IMPORT_DUPLICATE_DECISION_UI_ENABLED ? (
            <div className="space-y-2">
              <Label htmlFor="duplicate-decision">Duplicate records decision</Label>
              <Select
                value={duplicateDecision}
                onValueChange={(value) => {
                  if (mutation.current) return
                  intent.current++
                  setDuplicateDecision(value as 'pending' | 'skip' | 'keep')
                }}
              >
                <SelectTrigger id="duplicate-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Decide when duplicates are flagged</SelectItem>
                  <SelectItem disabled title="Not available yet" value="skip">
                    Skip duplicates (not available yet)
                  </SelectItem>
                  <SelectItem disabled title="Not available yet" value="keep">
                    Keep confirmed duplicates (not available yet)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
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
                      className="mt-2 max-w-full overflow-x-auto rounded-lg border border-border"
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
                      tabIndex={0}
                    >
                      <table className="min-w-max text-sm">
                        <TableBody>
                          {pageRows.map((row, relativeIndex) => {
                            const rowIndex = pageStart + relativeIndex
                            return (
                              <TableRow className="h-14" key={rowIndex}>
                                {parsedImport.headers.map((column) => {
                                  const cellValue = String(row[column] ?? '')
                                  return (
                                    <TableCell key={column}>
                                      <Input
                                        aria-label={`Row ${rowIndex + 1}: ${column}`}
                                        className="max-w-[220px] truncate"
                                        title={cellValue}
                                        value={cellValue}
                                        onChange={(event) =>
                                          updateCorrectionCell(rowIndex, column, event.target.value)
                                        }
                                      />
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                        </TableBody>
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
            projectsLoaded={projectsLoaded}
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
          <div className="rounded-md border bg-surface-subtle p-4 text-sm">
            <p className="font-medium text-foreground">{formTitle}</p>
            <p className="mt-1 text-muted-foreground">
              {fields.length} fields, {mappedCount} mapped, {sadddCount} SADDD fields.
            </p>
          </div>
          {formCreate.notice ? (
            <output className="block text-sm text-info">{formCreate.notice}</output>
          ) : null}
          <DialogFooter>
            <Button
              disabled={operationPending}
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={operationPending || createPending}
              onClick={() => void saveDraftToApi()}
            >
              {operationPending || createPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {operationPending || createPending ? 'Saving...' : 'Save draft'}
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
              <Button
                className="gap-2"
                disabled={operationPending || createPending}
                onClick={confirmImportProceed}
              >
                {operationPending || createPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {operationPending || createPending
                  ? 'Working...'
                  : parsedImport?.rows.length === 0
                    ? 'Create draft'
                    : 'Proceed'}
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
          <div className="rounded-md border border-border bg-surface-subtle p-3 text-sm">
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
