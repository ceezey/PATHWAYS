import { reportsClient } from '@/lib/api/reports'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { reportKindLabels } from '../reports.copy'
import { reportFileName } from '../reports.utils'
import type { ReportContext } from './use-report-context'

export const useReportGeneration = (
  context: Pick<
    ReportContext,
    | 'profile'
    | 'id'
    | 'kind'
    | 'formId'
    | 'evaluationId'
    | 'project'
    | 'round'
    | 'currentPreview'
    | 'currentReports'
    | 'reports'
  >,
) => {
  const {
    profile,
    id,
    kind,
    formId,
    evaluationId,
    project,
    round,
    currentPreview,
    currentReports,
    reports,
  } = context
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
  return { owner, currentName, setName, format, setFormat, busy, statusMessage, download, generate }
}

export type ReportGeneration = ReturnType<typeof useReportGeneration>
