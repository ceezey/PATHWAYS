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
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { compareHeaders, createFileSummary, parseCsv, parseWorkbook } from '@pathways/imports'

import { PageHeader } from '@/components/layout/page-header'
import { ConfirmationDialog, ProgressBar, StatusBadge } from '@/components/pathways'
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
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { cn } from '@/lib/utils'
import { mockActivities } from '@/mocks/pathways/activities'
import { mockProjects } from '@/mocks/pathways/projects'

import {
  type MappingReadiness,
  type MappingRow,
  type MappingStatus,
  createMappingRows,
  getMappingReadiness,
  normalizeImportHeader,
} from './collection-import-state'

type CollectionMode = 'scratch' | 'import' | 'extend'
type CollectionView = 'home' | 'forms' | 'builder' | 'import'
type FieldType = 'text' | 'number' | 'date' | 'single_select' | 'multi_select' | 'boolean'
type ImportStatus = 'idle' | 'reading' | 'ready' | 'error'

interface CollectionWorkspaceProps {
  initialMode?: CollectionMode
  initialView?: CollectionView
}

interface FormField {
  id: string
  label: string
  code: string
  type: FieldType
  required: boolean
  metadataKey: boolean
  sadddField: boolean
  allowedValues: string
  mappingStatus: MappingStatus
}

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

const expectedImportHeaders = [
  'beneficiary_id',
  'attendance_status',
  'pre_test_score',
  'post_test_score',
  'activity_date',
]

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
    allowedValues: '',
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
    allowedValues: 'Present, Absent, Excused',
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
    allowedValues: '10-14, 15-17, 18-24, 25+',
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
    description: 'Upload XLS, XLSX, or CSV and review detected mappings.',
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
  number: 'Number',
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

const fieldFromHeader = (header: string, index: number): FormField => ({
  id: `imported-${index}-${normalizeImportHeader(header)}`,
  label: header.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
  code: normalizeImportHeader(header),
  type: header.toLowerCase().includes('date') ? 'date' : 'text',
  required: ['beneficiary_id', 'activity_date'].includes(normalizeImportHeader(header)),
  metadataKey: normalizeImportHeader(header).includes('beneficiary'),
  sadddField: ['age', 'sex', 'gender', 'disability'].some((token) =>
    normalizeImportHeader(header).includes(token),
  ),
  allowedValues: '',
  mappingStatus: expectedImportHeaders.includes(normalizeImportHeader(header))
    ? 'mapped'
    : 'unmapped',
})

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

export const CollectionWorkspace = ({
  initialMode = 'scratch',
  initialView = 'home',
}: CollectionWorkspaceProps) => {
  const { labels } = usePrototypeLabels()
  const [mode, setMode] = useState<CollectionMode>(initialMode)
  const [view, setView] = useState<CollectionView>(initialView)
  const [formTitle, setFormTitle] = useState('Journey 1 - Intake & Assessment Form')
  const [formType, setFormType] = useState('Pre/Post Assessment')
  const [projectId, setProjectId] = useState(mockProjects[0]?.id ?? '')
  const [journeyStage, setJourneyStage] = useState('J1 - Intake & assessment')
  const [linkedActivityId, setLinkedActivityId] = useState(
    mockActivities.find((activity) => activity.projectId === mockProjects[0]?.id)?.id ??
      mockActivities[0]?.id ??
      '',
  )
  const [fields, setFields] = useState<FormField[]>(initialFields)
  const [selectedFieldId, setSelectedFieldId] = useState(initialFields[0]?.id ?? '')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [proceedDialogOpen, setProceedDialogOpen] = useState(false)
  const [pendingDeleteField, setPendingDeleteField] = useState<FormField | null>(null)
  const [savedNotice, setSavedNotice] = useState('')
  const [savedForms, setSavedForms] = useState<SavedForm[]>([
    {
      id: 'saved-journey-1',
      title: 'Journey 1 - Forms',
      type: 'Training Survey',
      project: 'FutureMakers NCR',
      fieldCount: 5,
      savedAt: '2026-06-22',
    },
  ])
  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null)
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('No source file selected yet.')
  const lastSelectedFileRef = useRef<File | null>(null)

  const selectedProject =
    mockProjects.find((project) => project.id === projectId) ?? mockProjects[0]
  const projectActivities = mockActivities.filter((activity) => activity.projectId === projectId)
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0]

  const mappedCount = fields.filter((field) => field.mappingStatus === 'mapped').length
  const sadddCount = fields.filter((field) => field.sadddField).length
  const metadataCount = fields.filter((field) => field.metadataKey).length
  const metadataCoverage = fields.length === 0 ? 0 : Math.round((mappedCount / fields.length) * 100)

  const importSummary = useMemo(() => {
    if (!parsedImport) {
      return null
    }

    const comparison = compareHeaders(
      expectedImportHeaders,
      parsedImport.headers.map(normalizeImportHeader),
    )

    return createFileSummary(
      parsedImport.fileName,
      parsedImport.fileType,
      parsedImport.headers,
      parsedImport.rows,
      [
        ...parsedImport.errors,
        ...(comparison.matches ? [] : ['Mock validation found headers that need review.']),
      ],
    )
  }, [parsedImport])

  const mappingReadiness = useMemo(() => getMappingReadiness(mappingRows), [mappingRows])
  const importCanProceed = importStatus === 'ready' && mappingReadiness.canProceed

  const updateField = (fieldId: string, patch: Partial<FormField>) => {
    setFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    )
  }

  const addField = () => {
    const nextNumber = fields.length + 1
    const field: FormField = {
      id: `field-${Date.now()}`,
      label: `New field ${nextNumber}`,
      code: `new_field_${nextNumber}`,
      type: 'text',
      required: false,
      metadataKey: false,
      sadddField: false,
      allowedValues: '',
      mappingStatus: 'unmapped',
    }

    setFields((currentFields) => [...currentFields, field])
    setSelectedFieldId(field.id)
  }

  const requestDeleteField = (fieldId: string) => {
    setPendingDeleteField(fields.find((field) => field.id === fieldId) ?? null)
  }

  const confirmDeleteField = () => {
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
    window.setTimeout(() => {
      const focusTargetId = nextSelectedFieldId
        ? `collection-field-choice-${nextSelectedFieldId}`
        : 'collection-add-field'
      document.getElementById(focusTargetId)?.focus()
    }, 0)
  }

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
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
    setMode(nextMode)
    setView(nextMode === 'import' || nextMode === 'extend' ? 'import' : 'builder')
  }

  const parseSelectedFile = async (file: File) => {
    lastSelectedFileRef.current = file
    setUploadProgress(28)
    setImportStatus('reading')
    setImportMessage('Reading the file in this browser. Nothing is being uploaded.')

    const extension = file.name.split('.').pop()?.toLowerCase()
    let parsed: ParsedImport

    try {
      if (extension === 'csv') {
        const text = await file.text()
        const result = parseCsv<Record<string, string>>(text)
        parsed = {
          fileName: file.name,
          fileType: 'csv',
          headers: result.headers,
          rows: result.data,
          errors: result.errors,
        }
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer()
        const result = parseWorkbook(buffer)
        parsed = {
          fileName: file.name,
          fileType: 'xlsx',
          headers: result.headers,
          rows: result.rows,
          errors: [],
          sheetNames: result.sheetNames,
        }
      } else {
        throw new Error('Choose a CSV, XLS, or XLSX file for this prototype.')
      }

      setParsedImport(parsed)
      setMappingRows(createMappingRows(parsed.headers, expectedImportHeaders))
      setUploadProgress(100)
      setImportStatus('ready')
      setImportMessage(
        `Preview ready for ${parsed.fileName}. Review every mapping before proceeding.`,
      )

      if (mode === 'extend') {
        const importedFields = parsed.headers.map(fieldFromHeader)
        setFields(importedFields.length > 0 ? importedFields : fields)
        setSelectedFieldId(importedFields[0]?.id ?? selectedFieldId)
      }
    } catch (error) {
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

  const savePrototypeForm = () => {
    // TODO(BACKEND): Create and update digital form definitions.
    // TODO(DATABASE): Persist form fields, import batches, and mapping records.
    const savedForm: SavedForm = {
      id: `saved-${Date.now()}`,
      title: formTitle || 'Untitled collection form',
      type: formType,
      project: selectedProject?.title ?? 'Unassigned project',
      fieldCount: fields.length,
      savedAt: 'Prototype session',
    }

    setSavedForms((currentForms) => [savedForm, ...currentForms])
    setSaveDialogOpen(false)
    setSavedNotice('Saved successfully in this prototype session.')
    setView('forms')
  }

  const confirmImportProceed = () => {
    if (!importCanProceed) {
      return
    }

    // TODO(STORAGE): Upload source dataset.
    // TODO(BACKEND): Submit metadata mappings and validation results.
    // TODO(DATABASE): Persist form fields, import batches, and mapping records.
    setProceedDialogOpen(false)
    setSavedNotice('Import mapping marked ready for future production validation.')
  }

  const downloadSavedForm = (form: SavedForm) => {
    const summary = JSON.stringify(
      {
        ...form,
        note: 'Prototype summary created in this browser; no shared record was changed.',
      },
      null,
      2,
    )
    const downloadUrl = URL.createObjectURL(
      new Blob([summary], { type: 'application/json;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    const fileName = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    anchor.href = downloadUrl
    anchor.download = `${fileName || 'collection-form'}-summary.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
    toast.success('Form summary downloaded.', {
      description: 'The summary was created in your browser for this prototype.',
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data workspace"
        title={labels.moduleCollection}
        description="Build digital forms, map imported files, and preview validation without uploading source data."
        actions={
          <Button asChild size="sm">
            <Link href="/collection/forms">Forms</Link>
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {modeDetails.map((item) => (
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
          onCreate={() => openBuilder('scratch')}
          onDownload={downloadSavedForm}
          onImport={(nextMode) => openBuilder(nextMode)}
          savedForms={savedForms}
        />
      ) : null}

      {view === 'builder' ? (
        <BuilderView
          addField={addField}
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
          projectActivities={projectActivities}
          projectId={projectId}
          sadddCount={sadddCount}
          selectedField={selectedField}
          selectedFieldId={selectedFieldId}
          selectedProject={selectedProject?.title ?? 'FutureMakers NCR'}
          setFormTitle={setFormTitle}
          setFormType={setFormType}
          setJourneyStage={setJourneyStage}
          setLinkedActivityId={setLinkedActivityId}
          setProjectId={setProjectId}
          setSaveDialogOpen={setSaveDialogOpen}
          setSelectedFieldId={setSelectedFieldId}
          updateField={updateField}
        />
      ) : null}

      {view === 'import' ? (
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
          projectActivities={projectActivities}
          projectId={projectId}
          selectedProject={selectedProject?.title ?? 'FutureMakers NCR'}
          setFormTitle={setFormTitle}
          setFormType={setFormType}
          setJourneyStage={setJourneyStage}
          setLinkedActivityId={setLinkedActivityId}
          setMappingRows={setMappingRows}
          setMode={setMode}
          setProceedDialogOpen={setProceedDialogOpen}
          setProjectId={setProjectId}
          setView={setView}
          retrySelectedFile={retrySelectedFile}
          uploadProgress={uploadProgress}
        />
      ) : null}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proceed with Save As?</DialogTitle>
            <DialogDescription>
              This saves the form for the current browser session only. It does not change shared
              form definitions or mappings.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border bg-surface-subtle p-4 text-sm">
            <p className="font-medium text-foreground">{formTitle}</p>
            <p className="mt-1 text-muted-foreground">
              {fields.length} fields, {mappedCount} mapped, {sadddCount} SADDD fields.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePrototypeForm}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={proceedDialogOpen} onOpenChange={setProceedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review mapped fields?</DialogTitle>
            <DialogDescription>
              This prototype marks the mapping as ready, but it does not upload the source dataset
              or run production validation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProceedDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmImportProceed}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}
        description="This removes the field and its current configuration from this browser-session form."
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
    </div>
  )
}

const FormsGeneratorView = ({
  onCreate,
  onDownload,
  onImport,
  savedForms,
}: {
  onCreate: () => void
  onDownload: (form: SavedForm) => void
  onImport: (mode: CollectionMode) => void
  savedForms: SavedForm[]
}) => (
  <div className="rounded-lg border bg-card p-5">
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Form Generator</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Collection forms</h2>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onCreate}>
            <ListPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create New
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onImport('import')}>
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
            Import .xlsx
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onImport('import')}>
            <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
            Import .csv
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
                Form type: {form.type} | {form.project} | {form.fieldCount} fields | Saved:{' '}
                {form.savedAt}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/collection/forms/new">Open form builder</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload(form)}>
              Download summary
            </Button>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const BuilderView = ({
  addField,
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
  projectActivities,
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
  projectActivities: typeof mockActivities
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
  <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
    <div className="space-y-4">
      <FormInfoPanel
        formTitle={formTitle}
        formType={formType}
        journeyStage={journeyStage}
        linkedActivityId={linkedActivityId}
        projectActivities={projectActivities}
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

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Button id="collection-add-field" variant="outline" onClick={addField}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add field
          </Button>
          <Button onClick={() => setSaveDialogOpen(true)}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save As
          </Button>
        </div>
      </div>
    </div>

    <aside className="space-y-4">
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
  projectActivities: typeof mockActivities
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
            <SelectItem value="Pre/Post Assessment">Pre/Post Assessment</SelectItem>
            <SelectItem value="Training Survey">Training Survey</SelectItem>
            <SelectItem value="Attendance and Activity Update">
              Attendance and Activity Update
            </SelectItem>
            <SelectItem value="Beneficiary Intake">Beneficiary Intake</SelectItem>
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
            {mockProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="journey-stage">Journey stage</Label>
        <Input
          id="journey-stage"
          value={journeyStage}
          onChange={(event) => setJourneyStage(event.target.value)}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Linked activity</Label>
        <Select value={linkedActivityId} onValueChange={setLinkedActivityId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an activity" />
          </SelectTrigger>
          <SelectContent>
            {(projectActivities.length > 0 ? projectActivities : mockActivities).map((activity) => (
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
        onChange={(event) =>
          updateField(field.id, { code: normalizeImportHeader(event.target.value) })
        }
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
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor={`${field.id}-values`}>Allowed values</Label>
      <Input
        id={`${field.id}-values`}
        placeholder="Separate choices with commas"
        value={field.allowedValues}
        onChange={(event) => updateField(field.id, { allowedValues: event.target.value })}
      />
    </div>
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
        <p className="text-xs text-muted-foreground">Live prototype summary</p>
      </div>
      <StatusBadge tone="info">Mock</StatusBadge>
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
              ? field.allowedValues || 'Option 1, Option 2'
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
  projectActivities,
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
  projectActivities: typeof mockActivities
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
  <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
    <div className="space-y-4">
      <FormInfoPanel
        formTitle={formTitle}
        formType={formType}
        journeyStage={journeyStage}
        linkedActivityId={linkedActivityId}
        projectActivities={projectActivities}
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
            The prototype reads CSV, XLS, or XLSX locally, then suggests metadata mappings. No
            production upload is performed.
          </p>
          <div className="mt-4 w-full max-w-xl space-y-2 text-left">
            <Label htmlFor="collection-import-file">Source file</Label>
            <Input
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
              Choose one CSV, XLS, or XLSX file. It is read locally in this browser and is not
              uploaded.
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

    <aside className="space-y-4">
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
  fields,
  mappingRows,
  mappingReadiness,
  mode,
  setMappingRows,
  setProceedDialogOpen,
  setView,
}: {
  canProceed: boolean
  fields: FormField[]
  mappingRows: MappingRow[]
  mappingReadiness: MappingReadiness
  mode: CollectionMode
  setMappingRows: React.Dispatch<React.SetStateAction<MappingRow[]>>
  setProceedDialogOpen: (open: boolean) => void
  setView: (view: CollectionView) => void
}) => (
  <div className="rounded-lg border bg-card p-4">
    <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Metadata mapping</h2>
        <p className="text-sm text-muted-foreground">
          Review source columns, target fields, and mock validation states.
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
          Proceed
        </Button>
      </div>
    </div>
    <p
      className={cn(
        'mt-3 rounded-md px-3 py-2 text-sm',
        canProceed ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning',
      )}
      id="mapping-readiness-message"
    >
      {canProceed
        ? mappingReadiness.message
        : mappingReadiness.canProceed
          ? 'The current file must finish successfully before proceeding.'
          : mappingReadiness.message}
    </p>
    <div className="mt-4 overflow-x-auto">
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
              <td className="px-3 py-3 font-medium text-foreground">{row.sourceColumn}</td>
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
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.code}>
                        {field.label}
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
    </div>
  </div>
)

const DataPreview = ({ parsedImport }: { parsedImport: ParsedImport }) => (
  <div className="rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold text-foreground">Data preview</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      First rows are shown client-side for prototype review only.
    </p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            {parsedImport.headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsedImport.rows.slice(0, 5).map((row, index) => (
            <tr key={`${parsedImport.fileName}-${index}`} className="border-t">
              {parsedImport.headers.map((header) => (
                <td key={header} className="px-3 py-3 text-muted-foreground">
                  {formatValue(row[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
          <p className="text-xs text-muted-foreground">Mock validation only</p>
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
          This demonstration checks column headings and preview rows only. Full production
          validation is not connected yet.
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
