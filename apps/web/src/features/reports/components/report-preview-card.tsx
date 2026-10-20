'use client'

import { AsyncState, EmptyState, SectionCard } from '@/components/pathways'
import { PrintReportView } from '@/features/reports/print/print-report-view'
import type { ReportContext } from '../hooks/use-report-context'
import type { ReportGeneration } from '../hooks/use-report-generation'
import { reportKindLabels } from '../reports.copy'

export function ReportPreviewCard({
  context,
  generation,
}: {
  context: Pick<ReportContext, 'contextReady' | 'id' | 'kind' | 'preview' | 'currentPreview'>
  generation: Pick<ReportGeneration, 'currentName'>
}) {
  const { contextReady, id, kind, preview, currentPreview } = context
  const { currentName } = generation
  return (
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
  )
}
