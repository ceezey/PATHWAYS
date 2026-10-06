'use client'

import { ConfirmationDialog } from '@/components/pathways/confirmation-dialog'

export interface AnalyticsExportPreview {
  title: string
  columns: string[]
  rows: string[][]
  totalRows: number
}

/** Previews the first rows of the aggregate file before it is downloaded. */
export const AnalyticsExportPreviewDialog = ({
  context,
  downloading,
  format,
  onCancel,
  onDownload,
  preview,
}: {
  context: { project: string; period: string; view: string }
  downloading: boolean
  format: string
  onCancel: () => void
  onDownload: () => void
  preview: AnalyticsExportPreview | null
}) => (
  <ConfirmationDialog
    cancelLabel="Cancel"
    confirmDisabled={downloading}
    confirmLabel={downloading ? 'Downloading' : 'Download'}
    confirmVariant="default"
    description={`${context.view} for ${context.project}, ${context.period}. The ${format} file contains these aggregate rows only.`}
    onConfirm={onDownload}
    onOpenChange={(open) => {
      if (!open) onCancel()
    }}
    open={preview !== null}
    title="Export preview"
  >
    {preview ? (
      <div className="space-y-2" data-testid="analytics-export-preview">
        <p className="text-sm text-muted-foreground">
          Showing {preview.rows.length} of {preview.totalRows} rows.
        </p>
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{preview.title} export preview</caption>
            <thead className="sticky top-0 bg-surface-subtle">
              <tr>
                {preview.columns.map((column) => (
                  <th className="whitespace-nowrap p-2" key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr className="border-t" key={`${index}-${row[0]}-${row[1]}`}>
                  {row.map((cell, column) => (
                    <td className="p-2 tabular-nums" key={`${preview.columns[column]}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null}
  </ConfirmationDialog>
)
