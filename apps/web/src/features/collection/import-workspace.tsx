'use client'

import { FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  DigitalFormDefinition,
  ImportBatchDefinition,
  ImportMappingInput,
  ImportRowDefinition,
  ImportSourceColumn,
  ProjectSummary,
} from '@/types/pathways'

import {
  type ImportProcessingProgress,
  importProcessingComplete,
  importProcessingProgress,
  runImportProcessing,
} from './import-auto-continue'
import { ImportProcessingPanel, type ImportProcessingState } from './import-processing-panel'

const mappingLockedStatuses = new Set(['PROCESSING', 'PARTIALLY_PROCESSED', 'PROCESSED', 'FAILED'])

function batchTone(status: ImportBatchDefinition['status']) {
  if (status === 'PROCESSED') return 'success' as const
  if (status === 'FAILED' || status === 'RECOVERY_REQUIRED') return 'danger' as const
  if (status === 'PARTIALLY_PROCESSED') return 'warning' as const
  return 'info' as const
}

function displayValue(value: unknown) {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '')
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

export function ImportWorkspace() {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(profile, 'import-workspace', 'imports.read', null, null)
  if (!scope) return <output>Current import access is required.</output>
  const accessKey = JSON.stringify([
    profile?.roles,
    profile?.permissions,
    profile?.assignedProjectIds,
  ])
  return <OwnedImportWorkspace key={scope.key + scope.generation + accessKey} scope={scope} />
}
function OwnedImportWorkspace({ scope }: { scope: SensitiveDraftOwner }) {
  const { profile } = useCurrentRole()
  const canUpload = principalHasAtomicPermission(profile, 'imports.upload')
  const canReview = principalHasAtomicPermission(profile, 'imports.review')
  const canValidate = principalHasAtomicPermission(profile, 'imports.validate')
  const canProcess = principalHasAtomicPermission(profile, 'imports.process')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [formId, setFormId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [batches, setBatches] = useState<ImportBatchDefinition[]>([])
  const [batch, setBatch] = useState<ImportBatchDefinition | null>(null)
  const [rows, setRows] = useState<ImportRowDefinition[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [processing, setProcessing] = useState<{
    batchId: string
    state: ImportProcessingState
    progress: ImportProcessingProgress
    note?: string
  } | null>(null)
  const stopRequested = useRef(false)
  const mounted = useRef(true)
  const mutation = useRef<object | null>(null)
  const latest = useRef({ projectId, formId, file, batch, profile })
  latest.current = { projectId, formId, file, batch, profile }
  const uploadIdentity = useRef<{
    file: File
    projectId: string
    formId: string
    id: string
  } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const eligible = (
    permission: Parameters<typeof principalHasAtomicPermission>[1],
    wantedProject = latest.current.projectId,
  ) => {
    const principal = latest.current.profile
    return (
      mounted.current &&
      scope.isCurrent() &&
      principalHasAtomicPermission(principal, permission) &&
      (!wantedProject ||
        principal?.assignedProjectIds.includes(wantedProject) ||
        principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' ||
        principal?.roles[0] === 'PROGRAM_MANAGER')
    )
  }
  const begin = (permission: Parameters<typeof principalHasAtomicPermission>[1]) => {
    if (mutation.current || !eligible(permission)) return null
    const snapshot = latest.current
    const marker = {}
    mutation.current = marker
    setPending(true)
    return {
      valid: (nextPermission = permission) =>
        mutation.current === marker &&
        eligible(nextPermission) &&
        snapshot.projectId === latest.current.projectId &&
        snapshot.formId === latest.current.formId &&
        snapshot.file === latest.current.file,
      finish: () => {
        if (mutation.current === marker) {
          mutation.current = null
          if (mounted.current && scope.isCurrent()) setPending(false)
        }
      },
    }
  }
  type Ticket = NonNullable<ReturnType<typeof begin>>

  useEffect(() => {
    let mounted = true
    pathwaysClient
      .getProjects()
      .then((value) => {
        if (!mounted || !scope.isCurrent()) return
        setProjects(value)
        setProjectId(value[0]?.id ?? '')
        setLoadState('ready')
      })
      .catch(() => mounted && scope.isCurrent() && setLoadState('error'))
    return () => {
      mounted = false
    }
  }, [scope.isCurrent])

  useEffect(() => {
    if (!projectId) return
    let mounted = true
    setForms([])
    setBatches([])
    setBatch(null)
    setRows([])
    setMapping({})
    Promise.all([
      pathwaysClient.getDigitalForms(projectId),
      pathwaysClient.getImportBatches(projectId),
    ])
      .then(([formRecords, batchRecords]) => {
        if (!mounted || !scope.isCurrent() || latest.current.projectId !== projectId) return
        const published = formRecords.filter((item) => item.status === 'PUBLISHED')
        setForms(published)
        setFormId((current) =>
          published.some((item) => item.id === current) ? current : (published[0]?.id ?? ''),
        )
        setBatches(batchRecords)
        setBatch(null)
        setRows([])
      })
      .catch(() => {
        if (mounted && scope.isCurrent() && latest.current.projectId === projectId)
          toast.error('Import workspace data could not be loaded.')
      })
    return () => {
      mounted = false
    }
  }, [projectId, scope.isCurrent])

  const selectedForm = forms.find((item) => item.id === (batch?.formId ?? formId))
  const sourceColumns: ImportSourceColumn[] =
    batch?.sourceColumns ??
    (batch?.sourceHeaders ?? []).map((header, index) => ({
      key: header,
      header,
      columnIndex: index + 1,
    }))
  const sourceColumnByKey = new Map(sourceColumns.map((column) => [column.key, column]))

  const loadBatch = async (batchId: string, parentTicket?: Ticket) => {
    const ticket = parentTicket ?? begin('imports.read')
    if (!ticket || !ticket.valid('imports.read')) return
    try {
      const [detail, page] = await Promise.all([
        pathwaysClient.getImportBatch(projectId, batchId),
        pathwaysClient.getImportRows(projectId, batchId),
      ])
      if (!ticket.valid('forms.read')) return
      const definition =
        forms.find((item) => item.id === detail.formId) ??
        (await pathwaysClient.getDigitalForm(projectId, detail.formId))
      if (!ticket.valid('imports.read')) return
      setForms((current) =>
        current.some((item) => item.id === definition.id) ? current : [...current, definition],
      )
      setBatch(detail)
      setRows(page.rows)
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

  const refreshBatches = async (parentTicket?: Ticket) => {
    if (!projectId) return
    const ticket = parentTicket ?? begin('imports.read')
    if (!ticket || !ticket.valid('imports.read')) return
    try {
      const records = await pathwaysClient.getImportBatches(projectId)
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
    if (
      !uploadIdentity.current ||
      uploadIdentity.current.file !== file ||
      uploadIdentity.current.projectId !== projectId ||
      uploadIdentity.current.formId !== formId
    ) {
      uploadIdentity.current = { file, projectId, formId, id: crypto.randomUUID() }
    }
    try {
      const created = await pathwaysClient.uploadImport(
        projectId,
        formId,
        uploadIdentity.current.id,
        file,
      )
      if (!ticket.valid('imports.upload')) return
      if (created.mappingRevision === 0 && created.storageStatus === 'STORED') {
        await pathwaysClient.automaticImportMapping(projectId, created.id, 0)
        if (!ticket.valid('imports.read')) return
      }
      await refreshBatches(ticket)
      if (!ticket.valid('imports.read')) return
      await loadBatch(created.id, ticket)
      if (!ticket.valid()) return
      setFile(null)
      uploadIdentity.current = null
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

  const saveMapping = async () => {
    if (
      !batch ||
      sourceColumns.some((column) => !mapping[column.key] || mapping[column.key] === '__pending__')
    ) {
      toast.error('Resolve every pending source column before saving.')
      return
    }
    const mappings: ImportMappingInput[] = sourceColumns.map((column) => ({
      sourceFieldName: column.key,
      ignored: mapping[column.key] === '__ignore__',
      targetFieldCode: mapping[column.key] === '__ignore__' ? undefined : mapping[column.key],
    }))
    const ticket = begin('imports.review')
    if (!ticket) return
    try {
      await pathwaysClient.saveImportMapping(projectId, batch.id, batch.mappingRevision, mappings)
      if (!ticket.valid('imports.read')) return
      await loadBatch(batch.id, ticket)
      if (!ticket.valid()) return
      toast.success('Mapping revision saved. Validation results were reset.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'The mapping could not be saved.')
    } finally {
      ticket.finish()
    }
  }

  const validate = async () => {
    if (!batch) return
    const ticket = begin('imports.validate')
    if (!ticket) return
    try {
      await pathwaysClient.validateImport(projectId, batch.id, batch.mappingRevision)
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

  // Keeps calling the server until the batch is done, a call fails, or Stop is pressed.
  const process = async () => {
    if (!batch) return
    const ticket = begin('imports.process')
    if (!ticket) return
    const target = batch
    let latest = importProcessingProgress(target)
    stopRequested.current = false
    setProcessing({ batchId: target.id, state: 'running', progress: latest })
    try {
      const outcome = await runImportProcessing({
        process: () =>
          pathwaysClient.processImport(projectId, target.id, target.validationRevision),
        onProgress: (next) => {
          latest = importProcessingProgress(next)
          if (ticket.valid('imports.read'))
            setProcessing((current) =>
              current?.batchId === target.id ? { ...current, progress: latest } : current,
            )
        },
        shouldStop: () => stopRequested.current || !ticket.valid('imports.process'),
      })
      if (!ticket.valid('imports.read')) return
      const note =
        outcome.kind === 'failed'
          ? outcome.error instanceof Error
            ? outcome.error.message
            : 'Processing could not be completed.'
          : outcome.kind === 'stalled'
            ? 'The remaining rows could not be processed. Review failed rows before retrying.'
            : undefined
      setProcessing({
        batchId: target.id,
        state:
          outcome.kind === 'complete'
            ? 'complete'
            : outcome.kind === 'stopped'
              ? 'stopped'
              : 'failed',
        progress: latest,
        note,
      })
      await loadBatch(target.id, ticket)
      if (!ticket.valid()) return
      if (outcome.kind === 'complete') toast.success('Import processing finished.')
      else if (note) toast.error(note)
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'Processing could not be completed.')
    } finally {
      ticket.finish()
    }
  }

  const stopProcessing = () => {
    stopRequested.current = true
    setProcessing((current) =>
      current?.state === 'running' ? { ...current, state: 'stopping' } : current,
    )
  }

  const resume = async () => {
    if (!batch) return
    const ticket = begin('imports.upload')
    if (!ticket) return
    try {
      await pathwaysClient.resumeImportUpload(projectId, batch.id)
      if (!ticket.valid('imports.upload')) return
      const stored = await pathwaysClient.getImportBatch(projectId, batch.id)
      if (!ticket.valid('imports.upload')) return
      if (stored.mappingRevision === 0 && stored.storageStatus === 'STORED') {
        await pathwaysClient.automaticImportMapping(projectId, batch.id, 0)
        if (!ticket.valid('imports.read')) return
      }
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

  const validationErrors = useMemo(
    () => rows.reduce((total, row) => total + row.validationErrors.length, 0),
    [rows],
  )

  const visibleProcessing = processing && processing.batchId === batch?.id ? processing : null
  const processingInterrupted =
    visibleProcessing?.state === 'failed' || visibleProcessing?.state === 'stopped'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data workspace"
        title="Metadata-Driven Data Integration"
        description="Upload a private CSV, workbook or text-based PDF, review field mappings, validate every row, and promote only valid generic submissions."
      />

      {visibleProcessing ? (
        // Outside the disabled fieldset so Stop stays available while processing runs.
        <ImportProcessingPanel
          canResume={canProcess && !pending}
          note={visibleProcessing.note}
          onResume={() => void process()}
          onStop={stopProcessing}
          progress={visibleProcessing.progress}
          state={visibleProcessing.state}
        />
      ) : null}

      <fieldset disabled={pending} className="space-y-6">
        {loadState !== 'ready' ? (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            {loadState === 'loading'
              ? 'Loading authorized projects...'
              : 'Authorized projects could not be loaded.'}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Private source upload</CardTitle>
            <CardDescription>
              Files are sent to the backend, checked within finite limits, and stored under a
              server-generated private object key. CSV, XLSX, XLS and text-based PDF are supported.
              Scanned PDFs have no text to read; export those as CSV or XLSX.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  if (mutation.current || !scope.isCurrent()) return
                  setProjectId(value)
                  setFile(null)
                  setFormId('')
                  setForms([])
                  setBatches([])
                  setBatch(null)
                  setRows([])
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose project" />
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
              <Label>Published form version</Label>
              <Select
                value={formId}
                onValueChange={(value) => {
                  if (!mutation.current && scope.isCurrent()) {
                    setFormId(value)
                    setFile(null)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose form" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name} - v{form.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-file">Source file</Label>
              <Input
                id="import-file"
                key={projectId}
                accept=".csv,.xlsx,.xls,.pdf"
                disabled={!canUpload || pending}
                type="file"
                onChange={(event) => {
                  if (!mutation.current && scope.isCurrent())
                    setFile(event.target.files?.[0] ?? null)
                }}
              />
            </div>
            <div className="md:col-span-3">
              <Button
                disabled={!canUpload || pending || !file || !formId}
                onClick={() => void upload()}
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {pending ? 'Working...' : 'Upload privately'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Server import batches</CardTitle>
              <CardDescription>
                Reload-safe progress and truthful processing totals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No imports found.</p>
              ) : null}
              {batches.map((item) => (
                <button
                  key={item.id}
                  className="w-full rounded-md border p-3 text-left hover:border-primary/50"
                  type="button"
                  onClick={() => void loadBatch(item.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{item.originalFileName}</span>
                    <StatusBadge tone={batchTone(item.status)}>
                      {item.status.replaceAll('_', ' ')}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.formName} - v{item.formVersion}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {!batch ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Select a persisted import batch to map, validate, review, or resume.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>{batch.originalFileName}</CardTitle>
                        <CardDescription>
                          {batch.formName} - version {batch.formVersion}
                        </CardDescription>
                      </div>
                      <StatusBadge tone={batchTone(batch.status)}>
                        {batch.status.replaceAll('_', ' ')}
                      </StatusBadge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      {Object.entries(batch.totals).map(([label, value]) => (
                        <div key={label} className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs uppercase text-muted-foreground">{label}</p>
                          <p className="text-lg font-semibold">{value}</p>
                        </div>
                      ))}
                    </div>
                    {batch.failureCode ? (
                      <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                        Import notice: {batch.failureCode.replaceAll('_', ' ')}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {batch.status === 'RECOVERY_REQUIRED' ? (
                        <Button onClick={() => void resume()}>Resume stored upload</Button>
                      ) : null}
                      <Button variant="outline" onClick={() => void loadBatch(batch.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reload server state
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {sourceColumns.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Reviewed mapping revision {batch.mappingRevision}</CardTitle>
                      <CardDescription>
                        Every source column must target one field or be explicitly ignored.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {sourceColumns.map((column) => (
                        <div
                          key={column.key}
                          className="grid items-center gap-3 rounded-md border p-3 sm:grid-cols-2"
                        >
                          <span className="break-all text-sm font-medium">
                            Column {column.columnIndex}: {column.header}
                          </span>
                          <Select
                            disabled={
                              !canReview || pending || mappingLockedStatuses.has(batch.status)
                            }
                            value={mapping[column.key] ?? '__pending__'}
                            onValueChange={(value) =>
                              !mutation.current &&
                              scope.isCurrent() &&
                              setMapping((current) => ({ ...current, [column.key]: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__pending__">
                                Pending: select a target or explicit ignore
                              </SelectItem>
                              <SelectItem value="__ignore__">Ignore this source column</SelectItem>
                              {selectedForm?.fields.map((field) => (
                                <SelectItem key={field.code} value={field.code}>
                                  {field.label} ({field.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={
                            !canReview || pending || mappingLockedStatuses.has(batch.status)
                          }
                          onClick={() => void saveMapping()}
                        >
                          Save new mapping revision
                        </Button>
                        <Button
                          disabled={
                            !canValidate ||
                            pending ||
                            batch.mappingRevision < 1 ||
                            mappingLockedStatuses.has(batch.status)
                          }
                          variant="outline"
                          onClick={() => void validate()}
                        >
                          Validate all rows
                        </Button>
                        <Button
                          disabled={
                            !canProcess ||
                            pending ||
                            batch.validationRevision < 1 ||
                            !['VALIDATED', 'PROCESSING', 'PARTIALLY_PROCESSED'].includes(
                              batch.status,
                            )
                          }
                          variant="outline"
                          onClick={() => void process()}
                        >
                          {processingInterrupted ||
                          batch.status === 'PROCESSING' ||
                          (batch.status === 'PARTIALLY_PROCESSED' &&
                            !importProcessingComplete(batch))
                            ? 'Resume processing'
                            : 'Process all valid rows'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>Authorized row review</CardTitle>
                    <CardDescription>
                      {rows.length} rows loaded; {validationErrors} bounded validation errors. Raw
                      previews are never shown to aggregate-only roles.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No staged rows are available.</p>
                    ) : (
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2">Source row</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Original values</th>
                            <th className="p-2">Validation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-b align-top">
                              <td className="p-2">{row.rowNumber}</td>
                              <td className="p-2">
                                <StatusBadge
                                  tone={
                                    row.status === 'PROCESSED'
                                      ? 'success'
                                      : row.status === 'INVALID' || row.status === 'FAILED'
                                        ? 'danger'
                                        : row.status === 'UNPROCESSED'
                                          ? 'warning'
                                          : 'info'
                                  }
                                >
                                  {row.status}
                                </StatusBadge>
                              </td>
                              <td className="p-2">
                                <dl className="space-y-1">
                                  {Object.entries(row.rawData).map(([key, value]) => (
                                    <div key={key}>
                                      <dt className="inline font-medium">
                                        {sourceColumnByKey.has(key)
                                          ? `Column ${sourceColumnByKey.get(key)?.columnIndex}: ${sourceColumnByKey.get(key)?.header}`
                                          : key}
                                        :{' '}
                                      </dt>
                                      <dd className="inline text-muted-foreground">
                                        {displayValue(value)}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </td>
                              <td className="p-2">
                                {row.validationErrors.length ? (
                                  <ul className="space-y-1 text-danger">
                                    {row.validationErrors.map((error) => (
                                      <li key={`${error.fieldCode}-${error.code}`}>
                                        {error.fieldCode}: {error.message}
                                      </li>
                                    ))}
                                  </ul>
                                ) : row.processingErrorCode ? (
                                  <span className="text-warning">
                                    {row.processingErrorCode.replaceAll('_', ' ')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">No errors</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm text-info">
          <FileSpreadsheet className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Beneficiary registration rows remain marked unprocessed until P04 supplies the domain
          handler; generic valid rows alone become versioned submissions.
        </div>
      </fieldset>
    </div>
  )
}
