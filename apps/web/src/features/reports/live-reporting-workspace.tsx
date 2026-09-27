'use client'
import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
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
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient, downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { ReportKind } from '@/types/pathways'
import { Download, FileSpreadsheet, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const kinds = {
  PROJECT_SUMMARY: { label: 'Project summary', permission: 'reports.project.read' },
  INDICATOR_SUMMARY: { label: 'Indicator summary', permission: 'reports.indicator.read' },
  BENEFICIARY_SUMMARY: { label: 'Beneficiary summary', permission: 'reports.beneficiary.read' },
  SURVEY_FORM_RESULTS: { label: 'Survey results', permission: 'reports.project.read' },
} as const
type Kind = keyof typeof kinds
export function LiveReportingWorkspace({
  initialKind,
  previewOnly = false,
}: { initialKind: ReportKind; previewOnly?: boolean }) {
  const { profile } = useCurrentRole()
  const [selection, setSelection] = useState<string | null>(null)
  const [selectedKind, setKind] = useState<Kind>(
    initialKind === 'indicator-summary'
      ? 'INDICATOR_SUMMARY'
      : initialKind === 'beneficiary-summary'
        ? 'BENEFICIARY_SUMMARY'
        : initialKind === 'survey-results'
          ? 'SURVEY_FORM_RESULTS'
          : 'PROJECT_SUMMARY',
  )
  const allowed = (Object.keys(kinds) as Kind[]).filter(
    (kind) =>
      principalHasAtomicPermission(profile, kinds[kind].permission) &&
      (kind !== 'SURVEY_FORM_RESULTS' || principalHasAtomicPermission(profile, 'assessments.read')),
  )
  const kind = allowed.includes(selectedKind) ? selectedKind : (allowed[0] ?? 'PROJECT_SUMMARY')
  const projects = useAuthorizedRead('report-projects', null, 'reports.read', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const currentProjects = !projects.isError && !projects.isPending ? projects.data : undefined
  const project = currentProjects?.find((value) => value.id === selection) ?? currentProjects?.[0]
  const id = project?.id ?? null
  const [selectedForm, setSelectedForm] = useState<string | null>(null)
  const forms = useAuthorizedRead(
    'report-survey-forms',
    id,
    'forms.read',
    (signal) => coreDataClient.surveyForms(id ?? '', signal),
    Boolean(id && kind === 'SURVEY_FORM_RESULTS'),
  )
  const currentForms = id && !forms.isError && !forms.isPending ? forms.data : undefined
  const formId =
    kind === 'SURVEY_FORM_RESULTS'
      ? (currentForms?.find((form) => form.id === selectedForm)?.id ?? currentForms?.[0]?.id)
      : undefined
  const contextReady = Boolean(id && (kind !== 'SURVEY_FORM_RESULTS' || formId))
  const preview = useAuthorizedRead(
    `report-preview:${kind}:${formId ?? ''}`,
    id,
    kinds[kind].permission,
    (signal) => coreDataClient.reportPreview(id ?? '', kind, signal, formId),
    contextReady,
  )
  const reports = useAuthorizedRead(
    'report-artifacts',
    id,
    'reports.read',
    (signal) => coreDataClient.reports(id ?? '', signal),
    contextReady,
  )
  const currentPreview =
    contextReady && !preview.isError && !preview.isPending ? preview.data : undefined
  const currentReports =
    contextReady && !reports.isError && !reports.isPending ? reports.data : undefined
  const owner = useSensitiveDraftOwner(
    profile,
    'report-generation',
    'reports.generate',
    id,
    `${kind}:${formId ?? ''}`,
    Boolean(currentPreview),
  )
  const exportOwner = useSensitiveDraftOwner(
    profile,
    'report-export',
    'reports.export',
    id,
    id,
    Boolean(currentReports),
  )
  const requests = useOperationRequestId()
  const [name, setName] = useState<{ owner: string; generation: number; value: string } | null>(
    null,
  )
  const currentName =
    owner && name?.owner === owner.key && name.generation === owner.generation ? name.value : ''
  const [format, setFormat] = useState<'CSV' | 'XLSX' | 'XLS' | 'PDF'>('PDF')
  const [busy, setBusy] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Clear transient state when its authorization ownership changes.
  useEffect(() => {
    setName(null)
    setBusy(false)
  }, [owner?.key, owner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset the selected survey when the authorized project changes.
  useEffect(() => {
    setSelectedForm(null)
  }, [id])
  const download = async (reportId: string, extension: string) => {
    const captured = exportOwner
    if (!captured?.isCurrent()) return
    try {
      await downloadCoreArtifact(
        `/projects/${id}/reports/${reportId}/export`,
        `report-${reportId}.${extension}`,
        captured.isCurrent,
      )
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Report download unavailable.')
    }
  }
  const generate = async () => {
    if (!owner?.isCurrent() || !id || busy || !currentPreview) return
    const captured = owner
    const label = kinds[kind].label
    const fallbackName = `${(project?.title ?? 'Project').slice(0, 199 - label.length)} ${label}`
    const body = {
      name: currentName.trim() || fallbackName,
      kind,
      format,
      ...(formId ? { formId } : {}),
    }
    const clientRequestId = requests.forBody(`${captured.key}:${captured.generation}`, body)
    setBusy(true)
    try {
      await coreDataClient.generateReport(id, { clientRequestId, ...body })
      if (captured.isCurrent()) {
        requests.acknowledge(clientRequestId)
        await reports.refetch()
        if (captured.isCurrent()) toast.success('Private report generated.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Report generation unavailable.')
    } finally {
      if (captured.isCurrent()) setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting"
        title="Reports Workspace"
        description="Preview current authorized data and generate a private, immutable report artifact."
      />
      <SectionCard
        title="Report context"
        description="Unavailable and suppressed cells retain their meaning in every export."
      >
        {projects.isError ? (
          <AsyncState
            status="error"
            title="Project access unavailable"
            description="Current report project access could not be verified."
            onRetry={() => void projects.refetch()}
          />
        ) : projects.isPending ? (
          <AsyncState
            status="loading"
            title="Loading projects"
            description="Verifying current report project access."
          />
        ) : null}
        {kind === 'SURVEY_FORM_RESULTS' && (
          <div className="mb-4 space-y-2">
            <Label className="block space-y-2">
              <span>Published training survey</span>
              <Select
                value={formId ?? ''}
                onValueChange={setSelectedForm}
                disabled={!id || forms.isError || forms.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a published survey" />
                </SelectTrigger>
                <SelectContent>
                  {currentForms?.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name} · version {form.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            {forms.isError && (
              <AsyncState
                status="error"
                title="Survey access unavailable"
                description="Current survey access could not be verified."
                onRetry={() => void forms.refetch()}
              />
            )}
            {id && !forms.isPending && !forms.isError && !currentForms?.length && (
              <p className="text-sm text-muted-foreground">
                No currently published training survey is available.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <Label className="space-y-2">
            <span>Project</span>
            <Select
              value={id ?? ''}
              onValueChange={setSelection}
              disabled={projects.isError || projects.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {currentProjects?.map((value) => (
                  <SelectItem key={value.id} value={value.id}>
                    {value.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-2">
            <span>Report type</span>
            <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((value) => (
                  <SelectItem key={value} value={value}>
                    {kinds[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-2">
            <span>Format</span>
            <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['CSV', 'XLSX', 'XLS', 'PDF'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Label className="grow space-y-2">
            <span>Report name</span>
            <Input
              maxLength={200}
              disabled={!owner}
              value={currentName}
              onChange={(event) =>
                owner &&
                setName({
                  owner: owner.key,
                  generation: owner.generation,
                  value: event.target.value,
                })
              }
              placeholder="Project report"
            />
          </Label>
          {!previewOnly && (
            <Button
              disabled={
                !owner ||
                !currentPreview?.columns.length ||
                busy ||
                preview.isError ||
                preview.isPending
              }
              onClick={() => void generate()}
            >
              <Save className="mr-2 h-4 w-4" />
              {busy ? 'Generating' : 'Generate private report'}
            </Button>
          )}
        </div>
      </SectionCard>
      <SectionCard
        title="Preview"
        description={
          currentPreview
            ? `Current data generated ${new Date(currentPreview.generatedAt).toLocaleString()}.`
            : 'A preview uses your current database permissions.'
        }
      >
        {!contextReady ? (
          <EmptyState
            title="Report context unavailable"
            description="Choose a currently authorized project and, for survey results, a published survey."
          />
        ) : preview.isPending && id ? (
          <AsyncState
            status="loading"
            title="Loading preview"
            description="Verifying current report access."
          />
        ) : preview.isError ? (
          <AsyncState
            status="error"
            title="Preview unavailable"
            description="Current report access or source data could not be verified."
            onRetry={() => void preview.refetch()}
          />
        ) : !currentPreview?.rows.length ? (
          <EmptyState
            title="No report rows"
            description={
              currentPreview?.unavailableReasons.join(' ') ||
              'Choose an authorized project with recorded report data.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {currentPreview.columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPreview.rows.map((row) => (
                  <TableRow key={JSON.stringify(row)}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={`${cellIndex}-${currentPreview.columns[cellIndex]}`}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Saved reports"
        description="Downloads recheck current report scope and permissions before transferring private bytes."
      >
        {!contextReady ? (
          <EmptyState
            title="Saved reports unavailable"
            description="Verify the current report context before viewing private artifacts."
          />
        ) : reports.isPending ? (
          <AsyncState
            status="loading"
            title="Loading saved reports"
            description="Verifying current report access."
          />
        ) : reports.isError ? (
          <EmptyState
            title="Saved reports unavailable"
            description="Reload to verify current access."
          />
        ) : !currentReports?.length ? (
          <EmptyState
            title="No saved reports"
            description="Generate a report from the preview above."
            icon={FileSpreadsheet}
          />
        ) : (
          <div className="space-y-3">
            {currentReports.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4"
              >
                <div>
                  <p className="font-semibold">{report.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {report.format ?? 'Format not set'} · <StatusBadge>{report.status}</StatusBadge>
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={
                    report.status !== 'GENERATED' ||
                    !report.format ||
                    !principalHasAtomicPermission(profile, 'reports.export')
                  }
                  onClick={() => void download(report.id, report.format?.toLowerCase() ?? '')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
