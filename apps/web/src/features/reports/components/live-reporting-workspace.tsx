'use client'

import { PageHeader } from '@/components/layout/page-header'
import type { ReportKind } from '@/types/pathways'
import { useReportContext } from '../hooks/use-report-context'
import { useReportGeneration } from '../hooks/use-report-generation'
import { ReportContextCard } from './report-context-card'
import { ReportPreviewCard } from './report-preview-card'
import { SavedReportsCard } from './saved-reports-card'

export function LiveReportingWorkspace({
  initialKind,
  previewOnly = false,
}: { initialKind: ReportKind; previewOnly?: boolean }) {
  const context = useReportContext(initialKind)
  const generation = useReportGeneration(context)
  const { statusMessage } = generation
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
      <ReportContextCard context={context} generation={generation} previewOnly={previewOnly} />
      <ReportPreviewCard context={context} generation={generation} />
      <SavedReportsCard context={context} generation={generation} />
    </div>
  )
}
