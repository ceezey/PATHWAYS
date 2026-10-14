'use client'

import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { Download, FileSpreadsheet } from 'lucide-react'
import type { ReportContext } from '../hooks/use-report-context'
import type { ReportGeneration } from '../hooks/use-report-generation'

export function SavedReportsCard({
  context,
  generation,
}: {
  context: Pick<ReportContext, 'profile' | 'contextReady' | 'reports' | 'currentReports'>
  generation: Pick<ReportGeneration, 'download'>
}) {
  const { profile, contextReady, reports, currentReports } = context
  const { download } = generation
  return (
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
  )
}
