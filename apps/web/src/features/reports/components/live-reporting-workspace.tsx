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
import { PrintReportView } from '@/features/reports/print/print-report-view'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { projectsClient } from '@/lib/api/projects'
import { reportsClient } from '@/lib/api/reports'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import type { ReportKind } from '@/types/pathways'
import { type ReportKindCode, grantedReportKinds, reportKindGrants } from '@pathways/shared'
import { Download, FileSpreadsheet, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { reportFileName } from '../reports.utils'

type Principal = Parameters<typeof principalHasAtomicPermission>[0]
export const reportKindLabels: Record<ReportKindCode, string> = {
  PROJECT_SUMMARY: 'Project summary',
  INDICATOR_SUMMARY: 'Indicator summary',
  BENEFICIARY_SUMMARY: 'Beneficiary summary',
  SURVEY_FORM_RESULTS: 'Survey results',
  MONITORING_REPORT: 'Monitoring report',
  EVALUATION_REPORT: 'Evaluation report',
}

/** Kinds the principal may open: the shared grants, for a principal with exactly one role. */
export const allowedKinds = (profile: Principal): ReportKindCode[] =>
  profile?.roles.length === 1 ? grantedReportKinds(profile.roles[0], profile.permissions) : []

const day = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })
export function LiveReportingWorkspace({
  initialKind,
  previewOnly = false,
}: { initialKind: ReportKind; previewOnly?: boolean }) {
  const { profile } = useCurrentRole()
  const [selection, setSelection] = useState<string | null>(null)
  const [selectedKind, setKind] = useState<ReportKindCode>(
    initialKind === 'indicator-summary'
      ? 'INDICATOR_SUMMARY'
      : initialKind === 'beneficiary-summary'
        ? 'BENEFICIARY_SUMMARY'
        : initialKind === 'survey-results'
          ? 'SURVEY_FORM_RESULTS'
          : 'PROJECT_SUMMARY',
  )
  const allowed = allowedKinds(profile)
  const kind = allowed.includes(selectedKind) ? selectedKind : (allowed[0] ?? 'PROJECT_SUMMARY')
  const projects = useAuthorizedRead('report-projects', null, 'reports.read', (signal) =>
    projectsClient.getProjects(signal),
  )
  const currentProjects = !projects.isError && !projects.isPending ? projects.data : undefined
  const project = currentProjects?.find((value) => value.id === selection) ?? currentProjects?.[0]
  const id = project?.id ?? null
  const [selectedForm, setSelectedForm] = useState<string | null>(null)
  const forms = useAuthorizedRead(
    'report-survey-forms',
    id,
    'forms.read',
    (signal) => reportsClient.surveyForms(id ?? '', signal),
    Boolean(id && kind === 'SURVEY_FORM_RESULTS'),
  )
  const currentForms = id && !forms.isError && !forms.isPending ? forms.data : undefined
  const formId =
    kind === 'SURVEY_FORM_RESULTS'
      ? (currentForms?.find((form) => form.id === selectedForm)?.id ?? currentForms?.[0]?.id)
      : undefined
  const [selectedRound, setSelectedRound] = useState<string | null>(null)
  const rounds = useAuthorizedRead(
    'report-evaluation-rounds',
    id,
    reportKindGrants.EVALUATION_REPORT.permission,
    (signal) => reportsClient.evaluationRounds(id ?? '', signal),
    Boolean(id && kind === 'EVALUATION_REPORT'),
  )
  const currentRounds = id && !rounds.isError && !rounds.isPending ? rounds.data : undefined
  const round =
    kind === 'EVALUATION_REPORT'
      ? (currentRounds?.find((value) => value.id === selectedRound) ?? currentRounds?.[0])
      : undefined
  const evaluationId = round?.id
  const contextReady = Boolean(
    id &&
      (kind !== 'SURVEY_FORM_RESULTS' || formId) &&
      (kind !== 'EVALUATION_REPORT' || evaluationId),
  )
  const preview = useAuthorizedRead(
    `report-preview:${kind}:${formId ?? ''}:${evaluationId ?? ''}`,
    id,
    reportKindGrants[kind].permission,
    (signal) => reportsClient.reportPreview(id ?? '', kind, signal, formId, evaluationId),
    contextReady,
  )
  const reports = useAuthorizedRead(
    'report-artifacts',
    id,
    'reports.read',
    (signal) => reportsClient.reports(id ?? '', signal),
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
    `${kind}:${formId ?? ''}:${evaluationId ?? ''}`,
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
  const [statusMessage, setStatusMessage] = useState('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: Clear transient state when its authorization ownership changes.
  useEffect(() => {
    setName(null)
    setBusy(false)
  }, [owner?.key, owner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset the selected survey when the authorized project changes.
  useEffect(() => {
    setSelectedForm(null)
    setSelectedRound(null)
  }, [id])
  const download = async (reportId: string, name: string, extension: string) => {
    const captured = exportOwner
    if (!captured?.isCurrent()) return
    setStatusMessage(`Downloading report as ${extension.toUpperCase()}.`)
    try {
      await downloadCoreArtifact(
        `/projects/${id}/reports/${reportId}/export`,
        reportFileName(name, reportId, extension),
        captured.isCurrent,
      )
      if (captured.isCurrent()) setStatusMessage(`Report downloaded as ${extension.toUpperCase()}.`)
    } catch (error) {
      if (captured.isCurrent()) {
        const message = error instanceof Error ? error.message : 'Report download unavailable.'
        setStatusMessage(message)
        toast.error(message)
      }
    }
  }
  const generate = async () => {
    if (!owner?.isCurrent() || !id || busy || !currentPreview) return
    const captured = owner
    const label = reportKindLabels[kind]
    const base = kind === 'EVALUATION_REPORT' && round ? round.title : (project?.title ?? 'Project')
    const fallbackName = `${base.slice(0, 199 - label.length)} ${label}`
    const body = {
      name: currentName.trim() || fallbackName,
      kind,
      format,
      ...(formId ? { formId } : {}),
      ...(evaluationId ? { evaluationId } : {}),
    }
    const clientRequestId = requests.forBody(`${captured.key}:${captured.generation}`, body)
    setBusy(true)
    setStatusMessage('Generating report.')
    try {
      const acknowledgement = await reportsClient.generateReport(id, { clientRequestId, ...body })
      if (captured.isCurrent()) {
        requests.acknowledge(clientRequestId)
        await reports.refetch()
        if (captured.isCurrent()) {
          // A fallback PDF carries the same data in a plain layout, so say it will not match.
          const message = acknowledgement.pdfFallback
            ? 'Private report generated in a plain layout. The designed page could not be rendered, so the PDF will not match the preview.'
            : 'Private report generated.'
          setStatusMessage(message)
          if (acknowledgement.pdfFallback) toast.warning(message)
          else toast.success(message)
        }
      }
    } catch (error) {
      if (captured.isCurrent()) {
        const message =
          (error as { status?: number } | null)?.status === 409 && kind === 'EVALUATION_REPORT'
            ? 'No signed-off evaluation exists for this project yet, so the report cannot be generated.'
            : error instanceof Error
              ? error.message
              : 'Report generation unavailable.'
        setStatusMessage(message)
        toast.error(message)
      }
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
      <p aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
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
            <Select value={kind} onValueChange={(value) => setKind(value as ReportKindCode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((value) => (
                  <SelectItem key={value} value={value}>
                    {reportKindLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          {kind === 'EVALUATION_REPORT' && (
            <Label className="space-y-2">
              <span>Round</span>
              <Select
                value={evaluationId ?? ''}
                onValueChange={setSelectedRound}
                disabled={!currentRounds?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a round" />
                </SelectTrigger>
                <SelectContent>
                  {currentRounds?.map((value) => (
                    <SelectItem key={value.id} value={value.id}>
                      {`${value.title}${value.signedOffAt ? ` · Signed off ${day(value.signedOffAt)}` : ''}${value.overallScore ? ` · ${value.overallScore}` : ''}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {id && !rounds.isPending && !rounds.isError && !currentRounds?.length && (
                <span className="block text-xs text-muted-foreground">
                  No signed-off evaluation round yet
                </span>
              )}
              {rounds.isError && (
                <span className="block text-xs text-destructive">
                  Evaluation rounds could not be verified.
                </span>
              )}
            </Label>
          )}
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
            <span className="block text-xs text-muted-foreground">
              PDF includes charts and DSD styling.
            </span>
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
          {!previewOnly && principalHasAtomicPermission(profile, 'reports.generate') && (
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
          // The same component the designed PDF renders, so the export matches this preview.
          <div className="overflow-x-auto">
            <PrintReportView
              report={{
                title: currentName || reportKindLabels[kind],
                kind: currentPreview.kind,
                columns: currentPreview.columns,
                rows: currentPreview.rows,
                sections: currentPreview.sections,
                generatedAt: currentPreview.generatedAt,
                unavailableReasons: currentPreview.unavailableReasons,
              }}
            />
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
                  {report.evaluation && (
                    <p className="text-sm text-muted-foreground">
                      Round: {report.evaluation.title} ({report.evaluation.periodStart} to{' '}
                      {report.evaluation.periodEnd})
                    </p>
                  )}
                </div>
                {principalHasAtomicPermission(profile, 'reports.export') && (
                  <Button
                    variant="outline"
                    disabled={report.status !== 'GENERATED' || !report.format}
                    onClick={() =>
                      void download(report.id, report.name, report.format?.toLowerCase() ?? '')
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
