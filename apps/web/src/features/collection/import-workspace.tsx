'use client'

import { FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  DigitalFormDefinition,
  ImportBatchDefinition,
  ImportMappingInput,
  ImportRowDefinition,
  ImportSourceColumn,
  ProjectSummary,
} from '@/types/pathways'

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
  const canUpload = profile?.permissions.includes('imports.upload') === true
  const canReview = profile?.permissions.includes('imports.review') === true
  const canProcess = profile?.permissions.includes('imports.process') === true
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

  useEffect(() => {
    let mounted = true
    pathwaysClient
      .getProjects()
      .then((value) => {
        if (!mounted) return
        setProjects(value)
        setProjectId(value[0]?.id ?? '')
        setLoadState('ready')
      })
      .catch(() => mounted && setLoadState('error'))
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let mounted = true
    Promise.all([
      pathwaysClient.getDigitalForms(projectId),
      pathwaysClient.getImportBatches(projectId),
    ])
      .then(([formRecords, batchRecords]) => {
        if (!mounted) return
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
        if (mounted) toast.error('Import workspace data could not be loaded.')
      })
    return () => {
      mounted = false
    }
  }, [projectId])

  const selectedForm = forms.find((item) => item.id === (batch?.formId ?? formId))
  const sourceColumns: ImportSourceColumn[] =
    batch?.sourceColumns ??
    (batch?.sourceHeaders ?? []).map((header, index) => ({
      key: header,
      header,
      columnIndex: index + 1,
    }))
  const sourceColumnByKey = new Map(sourceColumns.map((column) => [column.key, column]))

  const loadBatch = async (batchId: string) => {
    setPending(true)
    try {
      const [detail, page] = await Promise.all([
        pathwaysClient.getImportBatch(projectId, batchId),
        pathwaysClient.getImportRows(projectId, batchId),
      ])
      const definition =
        forms.find((item) => item.id === detail.formId) ??
        (await pathwaysClient.getDigitalForm(projectId, detail.formId))
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
            return [column.key, reviewed?.targetField?.code ?? '__ignore__']
          }),
        ),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The import batch could not be loaded.')
    } finally {
      setPending(false)
    }
  }

  const refreshBatches = async () => {
    if (!projectId) return
    const records = await pathwaysClient.getImportBatches(projectId)
    setBatches(records)
    if (batch) await loadBatch(batch.id)
  }

  const upload = async () => {
    if (!file || !formId || !projectId) {
      toast.error('Choose a project, a published form, and one source file.')
      return
    }
    setPending(true)
    try {
      const created = await pathwaysClient.uploadImport(
        projectId,
        formId,
        crypto.randomUUID(),
        file,
      )
      setFile(null)
      await refreshBatches()
      await loadBatch(created.id)
      toast.success('The private upload was staged for mapping.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The source file could not be uploaded.')
    } finally {
      setPending(false)
    }
  }

  const saveMapping = async () => {
    if (!batch) return
    const mappings: ImportMappingInput[] = sourceColumns.map((column) => ({
      sourceFieldName: column.key,
      ignored: mapping[column.key] === '__ignore__',
      targetFieldCode: mapping[column.key] === '__ignore__' ? undefined : mapping[column.key],
    }))
    setPending(true)
    try {
      await pathwaysClient.saveImportMapping(projectId, batch.id, batch.mappingRevision, mappings)
      await loadBatch(batch.id)
      toast.success('Mapping revision saved. Validation results were reset.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The mapping could not be saved.')
    } finally {
      setPending(false)
    }
  }

  const validate = async () => {
    if (!batch) return
    setPending(true)
    try {
      await pathwaysClient.validateImport(projectId, batch.id, batch.mappingRevision)
      await loadBatch(batch.id)
      toast.success('Validation revision completed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Validation could not be completed.')
    } finally {
      setPending(false)
    }
  }

  const process = async () => {
    if (!batch) return
    setPending(true)
    try {
      await pathwaysClient.processImport(projectId, batch.id, batch.validationRevision)
      await loadBatch(batch.id)
      toast.success('A bounded processing checkpoint completed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Processing could not be completed.')
    } finally {
      setPending(false)
    }
  }

  const resume = async () => {
    if (!batch) return
    setPending(true)
    try {
      await pathwaysClient.resumeImportUpload(projectId, batch.id)
      await loadBatch(batch.id)
      toast.success('Stored source finalization resumed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stored source recovery failed.')
    } finally {
      setPending(false)
    }
  }

  const validationErrors = useMemo(
    () => rows.reduce((total, row) => total + row.validationErrors.length, 0),
    [rows],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data workspace"
        title="Metadata-Driven Data Integration"
        description="Upload a private CSV or workbook, review field mappings, validate every row, and promote only valid generic submissions."
      />

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
            server-generated private object key. CSV, XLSX and XLS are supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
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
            <Select value={formId} onValueChange={setFormId}>
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
              accept=".csv,.xlsx,.xls"
              disabled={!canUpload || pending}
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
            <CardDescription>Reload-safe progress and truthful processing totals.</CardDescription>
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
                          value={mapping[column.key] ?? '__ignore__'}
                          onValueChange={(value) =>
                            setMapping((current) => ({ ...current, [column.key]: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                        disabled={!canReview || pending || mappingLockedStatuses.has(batch.status)}
                        onClick={() => void saveMapping()}
                      >
                        Save new mapping revision
                      </Button>
                      <Button
                        disabled={
                          !canReview ||
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
                          !['VALIDATED', 'PROCESSING', 'PARTIALLY_PROCESSED'].includes(batch.status)
                        }
                        variant="outline"
                        onClick={() => void process()}
                      >
                        {batch.status === 'PROCESSING'
                          ? 'Resume processing checkpoint'
                          : 'Process next checkpoint'}
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
    </div>
  )
}
