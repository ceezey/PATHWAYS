'use client'

import { EmptyState, StatusBadge } from '@/components/pathways'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { enumLabel } from '../../collection.copy'
import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { batchTone } from '../import.utils'

export function ImportBatchList({
  state,
  review,
}: { state: Pick<ImportState, 'batch' | 'batches'>; review: Pick<BatchReview, 'loadBatch'> }) {
  const { batch, batches } = state
  const { loadBatch } = review
  return (
    <Card>
      <CardHeader>
        <CardTitle>Server import batches</CardTitle>
        <CardDescription>Reload-safe progress and truthful processing totals.</CardDescription>
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
              <StatusBadge tone={batchTone(item.status)}>{enumLabel(item.status)}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.formName} - v{item.formVersion}
            </p>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
