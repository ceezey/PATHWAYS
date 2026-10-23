'use client'

import { RefreshCw } from 'lucide-react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { enumLabel } from '../../collection.copy'
import type { BatchIntake } from '../hooks/use-batch-intake'
import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { batchTone } from '../import.utils'

export function ImportBatchSummary({
  review,
  intake,
  pending,
  batch,
}: {
  review: Pick<BatchReview, 'loadBatch' | 'resume'>
  intake: Pick<BatchIntake, 'rerun' | 'rerunTarget'>
  pending: boolean
  batch: NonNullable<ImportState['batch']>
}) {
  const { loadBatch, resume } = review
  const { rerun, rerunTarget } = intake
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{batch.originalFileName}</CardTitle>
            <CardDescription>
              {batch.formName} - version {batch.formVersion}
            </CardDescription>
          </div>
          <StatusBadge tone={batchTone(batch.status)}>{enumLabel(batch.status)}</StatusBadge>
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
        {rerunTarget ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Version {rerunTarget.version} of this form is published. Re-run the same file against it
            without uploading again.
          </p>
        ) : null}
        {batch.failureCode ? (
          <p className="mt-4 rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
            Import notice: {enumLabel(batch.failureCode)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {batch.status === 'RECOVERY_REQUIRED' ? (
            <Button onClick={() => void resume()}>Resume stored upload</Button>
          ) : null}
          {rerunTarget ? (
            <Button className="min-h-11" disabled={pending} onClick={() => void rerun()}>
              Re-run import
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadBatch(batch.id)}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reload server state
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
