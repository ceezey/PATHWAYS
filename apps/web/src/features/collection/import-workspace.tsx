'use client'

import { ArrowLeft, RefreshCw, Upload } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, LoadingCard, StatusBadge } from '@/components/pathways'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { getVerifiedRouteAccess, principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { cn } from '@/lib/utils'
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
import { enumLabel } from './import-status-labels'
import {
  type ColumnRuleDraft,
  ImportValueMapEditor,
  emptyColumnRule,
  ruleToMappingInput,
} from './import-value-map-editor'

const mappingLockedStatuses = new Set(['PROCESSING', 'PARTIALLY_PROCESSED', 'PROCESSED', 'FAILED'])

function batchTone(status: ImportBatchDefinition['status']) {
  if (status === 'PROCESSED') return 'success' as const
  if (status === 'FAILED' || status === 'RECOVERY_REQUIRED') return 'danger' as const
  if (status === 'PARTIALLY_PROCESSED') return 'warning' as const
  return 'info' as const
}

function rowTone(status: ImportRowDefinition['status']) {
  if (status === 'PROCESSED') return 'success' as const
  if (status === 'INVALID' || status === 'FAILED') return 'danger' as const
  return status === 'UNPROCESSED' ? ('warning' as const) : ('info' as const)
}

const headClass = 'h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

type StoredMapping = NonNullable<ImportBatchDefinition['mappings']>[number]

const matchReasonLabels: Record<string, string> = {
  EXACT: 'exact name',
  SYNONYM: 'known synonym',
  SYNONYM_REVIEW: 'related term',
  TOKEN_SET: 'same words',
  TOKEN_OVERLAP: 'shared words',
  EDIT_DISTANCE: 'close spelling',
}

/** Why the server auto-mapped a column, or null for manual and pending choices. */
function automaticMatchReason(stored: StoredMapping | undefined) {
  if (stored?.status !== 'MAPPED' || !stored.validationMessage) return null
  if (stored.validationMessage.startsWith('AUTO_SMART_V2:')) {
    return matchReasonLabels[stored.matchReason ?? ''] ?? 'automatic match'
  }
  return stored.validationMessage.startsWith('AUTO_CODE_LABEL_V1:') ? 'exact name' : null
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function displayValue(value: unknown) {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '')
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

export function ImportWorkspace() {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(profile, 'import-workspace', 'imports.read', null, null)
  if (!scope) return <output>Current import access is required.</output>
  // Sorted so a permission/assignment grant that is re-fetched with the same entries in a
  // different order (e.g. after a token refresh) does not read as a changed key and force
  // an unnecessary remount that would drop the workspace's in-progress project selection.
  const accessKey = JSON.stringify([
    [...(profile?.roles ?? [])].sort(),
    [...(profile?.permissions ?? [])].sort(),
    [...(profile?.assignedProjectIds ?? [])].sort(),
  ])
  return <OwnedImportWorkspace key={scope.key + scope.generation + accessKey} scope={scope} />
}
function OwnedImportWorkspace({ scope }: { scope: SensitiveDraftOwner }) {
  const { profile } = useCurrentRole()
  const { labels } = useDisplayLabels()
  const canUpload = principalHasAtomicPermission(profile, 'imports.upload')
  const canReview = principalHasAtomicPermission(profile, 'imports.review')
  const canValidate = principalHasAtomicPermission(profile, 'imports.validate')
  const canProcess = principalHasAtomicPermission(profile, 'imports.process')
  const canOpenForms = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/forms').allowed,
  )
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [formsState, setFormsState] = useState<'loading' | 'ready' | 'error'>('ready')
  const [formId, setFormId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [batches, setBatches] = useState<ImportBatchDefinition[]>([])
  const [batch, setBatch] = useState<ImportBatchDefinition | null>(null)
  const [rows, setRows] = useState<ImportRowDefinition[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<Record<string, ColumnRuleDraft>>({})
  const [mappingNotice, setMappingNotice] = useState('')
  const mappingHeading = useRef<HTMLSpanElement>(null)
  const [pending, setPending] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt restarts the project load on Retry.
  useEffect(() => {
    let mounted = true
    pathwaysClient
      .getProjects()
      .then((value) => {
        if (!mounted || !scope.isCurrent()) return
        setProjects(value)
        // Only default when nothing is chosen yet; a refetch (or a remount whose key was
        // recomputed from the same access grants) must not discard the current pick.
        setProjectId((current) => current || value[0]?.id || '')
        setLoadState('ready')
      })
      .catch(() => mounted && scope.isCurrent() && setLoadState('error'))
    return () => {
      mounted = false
    }
  }, [scope.isCurrent, loadAttempt])

  useEffect(() => {
    if (!projectId) return
    let mounted = true
    setForms([])
    setFormsState('loading')
    setBatches([])
    setBatch(null)
    setRows([])
    setMapping({})
    setRules({})
    Promise.all([
      pathwaysClient.getDigitalForms(projectId),
      pathwaysClient.getImportBatches(projectId),
    ])
      .then(([formRecords, batchRecords]) => {
        if (!mounted || !scope.isCurrent() || latest.current.projectId !== projectId) return
        const published = formRecords.filter((item) => item.status === 'PUBLISHED')
        setForms(published)
        setFormsState('ready')
        setFormId((current) =>
          published.some((item) => item.id === current) ? current : (published[0]?.id ?? ''),
        )
        setBatches(batchRecords)
        setBatch(null)
        setRows([])
      })
      .catch(() => {
        if (mounted && scope.isCurrent() && latest.current.projectId === projectId) {
          setFormsState('error')
          toast.error('Import workspace data could not be loaded.')
        }
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
  const storedMappingByKey = new Map(
    (batch?.mappings ?? []).map((stored) => [stored.sourceFieldName, stored]),
  )
  const mappingEditable = Boolean(
    batch && canReview && !pending && !mappingLockedStatuses.has(batch.status),
  )
  // Server suggestions still open in the reviewer's draft, for fields of the pinned form.
  const openSuggestions = sourceColumns.flatMap((column) => {
    const stored = storedMappingByKey.get(column.key)
    const suggestion = stored?.status === 'PENDING' ? stored.suggestedField : null
    return suggestion &&
      (mapping[column.key] ?? '__pending__') === '__pending__' &&
      selectedForm?.fields.some((field) => field.code === suggestion.code)
      ? [{ column, code: suggestion.code, label: suggestion.label }]
      : []
  })

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
      await pathwaysClient.saveImportMapping(projectId, batch.id, batch.mappingRevision, mappings)
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
      if (!ticket.valid('imports.read')) {
        // Access or ownership changed; the server keeps its state and nothing stale is shown.
        setProcessing(null)
        return
      }
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
        editableLabelKey="moduleCollection"
        title={labels.moduleCollection}
        description="Upload a private CSV, workbook or text-based PDF, review field mappings, validate every row, and promote only valid generic submissions."
        actions={
          canOpenForms ? (
            <Button asChild variant="outline">
              <Link href="/collection/forms">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Forms
              </Link>
            </Button>
          ) : undefined
        }
      />

      {visibleProcessing ? (
        // Outside the disabled fieldset so Stop stays available while processing runs.
        <ImportProcessingPanel
          canResume={canProcess && !pending}
          focusOnMount
          note={visibleProcessing.note}
          onResume={() => void process()}
          onStop={stopProcessing}
          progress={visibleProcessing.progress}
          state={visibleProcessing.state}
        />
      ) : null}

      <fieldset disabled={pending} className="space-y-6">
        {loadState !== 'ready' ? (
          <AsyncState
            status={loadState}
            title={
              loadState === 'loading'
                ? 'Loading authorized projects'
                : 'Authorized projects could not be loaded'
            }
            description={
              loadState === 'loading'
                ? 'Projects you can import into will appear here.'
                : 'Check your connection and access, then try again.'
            }
            onRetry={() => {
              setLoadState('loading')
              setLoadAttempt((current) => current + 1)
            }}
          />
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
            {projectId && formsState === 'loading' ? (
              <LoadingCard
                className="md:col-span-2"
                title="Loading published form versions"
                description="Published forms for this project will appear here."
              />
            ) : (
              <div className="space-y-2">
                <Label>Published form version</Label>
                <Select
                  disabled={projectId !== '' && forms.length === 0}
                  value={formId}
                  onValueChange={(value) => {
                    if (!mutation.current && scope.isCurrent()) {
                      setFormId(value)
                      setFile(null)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !projectId
                          ? 'Choose form'
                          : formsState === 'error'
                            ? 'Forms could not be loaded.'
                            : forms.length === 0
                              ? 'No forms available.'
                              : 'Choose form'
                      }
                    />
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
            )}
            <div className={cn('space-y-2', projectId && formsState === 'loading' && 'hidden')}>
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
                <EmptyState title="None yet" description="No imports found." />
              ) : null}
              {batches.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={batch?.id === item.id}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    batch?.id === item.id && 'border-primary bg-info-subtle',
                  )}
                  type="button"
                  onClick={() => void loadBatch(item.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{item.originalFileName}</span>
                    <StatusBadge tone={batchTone(item.status)}>
                      {enumLabel(item.status)}
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
              <EmptyState
                title="No import selected"
                description="Select a persisted import batch to map, validate, review, or resume."
              />
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
                        {enumLabel(batch.status)}
                      </StatusBadge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      {Object.entries(batch.totals).map(([label, value]) => (
                        <div key={label} className="rounded-md bg-surface-subtle p-3">
                          <p className="text-xs text-muted-foreground">{enumLabel(label)}</p>
                          <p className="text-lg font-semibold">{value}</p>
                        </div>
                      ))}
                    </div>
                    {batch.failureCode ? (
                      <p className="mt-4 rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
                        Import notice: {enumLabel(batch.failureCode)}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {batch.status === 'RECOVERY_REQUIRED' ? (
                        <Button onClick={() => void resume()}>Resume stored upload</Button>
                      ) : null}
                      <Button variant="outline" onClick={() => void loadBatch(batch.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Reload server state
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {sourceColumns.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle>
                            <span ref={mappingHeading} tabIndex={-1}>
                              Reviewed mapping revision {batch.mappingRevision}
                            </span>
                          </CardTitle>
                          <CardDescription>
                            Every source column must target one field or be explicitly ignored.
                          </CardDescription>
                        </div>
                        {canReview ? (
                          <Button
                            disabled={!mappingEditable || openSuggestions.length === 0}
                            variant="outline"
                            onClick={() => confirmSuggestions(openSuggestions)}
                          >
                            Confirm all suggestions
                          </Button>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <output aria-live="polite" className="block text-sm text-muted-foreground">
                        {mappingNotice}
                      </output>
                      {sourceColumns.map((column) => {
                        const stored = storedMappingByKey.get(column.key)
                        const automatic = automaticMatchReason(stored)
                        const targetField = selectedForm?.fields.find(
                          (field) => field.code === mapping[column.key],
                        )
                        const suggestion = openSuggestions.find(
                          (item) => item.column.key === column.key,
                        )
                        return (
                          <div
                            key={column.key}
                            className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-2"
                          >
                            <div className="space-y-1">
                              <span className="block break-all text-sm font-medium">
                                Column {column.columnIndex}: {column.header}
                              </span>
                              {automatic ? (
                                <StatusBadge tone="success">Auto-matched: {automatic}</StatusBadge>
                              ) : null}
                              {suggestion ? (
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span>Suggested: {suggestion.label}</span>
                                  {canReview ? (
                                    <Button
                                      aria-label={`Confirm suggestion ${suggestion.label} for column ${column.columnIndex}`}
                                      disabled={!mappingEditable}
                                      size="sm"
                                      className="min-h-11"
                                      variant="outline"
                                      onClick={() => confirmSuggestions([suggestion], column.key)}
                                    >
                                      Confirm
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      An authorized reviewer can confirm it.
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <Select
                              disabled={!mappingEditable}
                              value={mapping[column.key] ?? '__pending__'}
                              onValueChange={(value) =>
                                !mutation.current &&
                                scope.isCurrent() &&
                                setMapping((current) => ({ ...current, [column.key]: value }))
                              }
                            >
                              <SelectTrigger
                                aria-label={`Target for column ${column.columnIndex}: ${column.header}`}
                                id={`import-mapping-target-${column.key}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__pending__">
                                  Pending: select a target or explicit ignore
                                </SelectItem>
                                <SelectItem value="__ignore__">
                                  Ignore this source column
                                </SelectItem>
                                {selectedForm?.fields.map((field) => (
                                  <SelectItem key={field.code} value={field.code}>
                                    {field.label} ({field.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {targetField ? (
                              <div className="sm:col-span-2">
                                <ImportValueMapEditor
                                  columnLabel={`column ${column.columnIndex}`}
                                  disabled={!mappingEditable}
                                  fieldType={targetField.dataType}
                                  idPrefix={`import-rule-${column.key}`}
                                  rule={rules[column.key] ?? emptyColumnRule}
                                  onChange={(next) =>
                                    !mutation.current &&
                                    scope.isCurrent() &&
                                    setRules((current) => ({ ...current, [column.key]: next }))
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      <div className="flex flex-wrap gap-2">
                        <Button disabled={!mappingEditable} onClick={() => void saveMapping()}>
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
                  <CardContent>
                    {rows.length === 0 ? (
                      <EmptyState title="None yet" description="No staged rows are available." />
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table className="min-w-[720px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className={headClass}>Source row</TableHead>
                              <TableHead className={headClass}>Status</TableHead>
                              <TableHead className={headClass}>Original values</TableHead>
                              <TableHead className={headClass}>Validation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((row) => (
                              <TableRow key={row.id} className="h-14 border-border">
                                <TableCell className="align-top">{row.rowNumber}</TableCell>
                                <TableCell className="align-top">
                                  <StatusBadge tone={rowTone(row.status)}>
                                    {enumLabel(row.status)}
                                  </StatusBadge>
                                </TableCell>
                                <TableCell className="align-top">
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
                                </TableCell>
                                <TableCell className="align-top">
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
                                      {enumLabel(row.processingErrorCode)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">No errors</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  )
}
