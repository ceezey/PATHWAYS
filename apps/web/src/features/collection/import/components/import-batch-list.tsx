'use client'

import { CircleAlert, FileUp, FolderSearch } from 'lucide-react'

import { EmptyState, LoadingSkeleton, StatusBadge } from '@/components/pathways'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { enumLabel } from '../../collection.copy'
import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { batchTone } from '../import.utils'

export function ImportBatchList({
  state,
  review,
}: {
  state: Pick<ImportState, 'batch' | 'batches' | 'canUpload' | 'formsState' | 'projectId'>
  review: Pick<BatchReview, 'loadBatch'>
}) {
  const { batch, batches, canUpload, formsState, projectId } = state
  const { loadBatch } = review
  // The card already frames the state, so it drops its own border.
  const framed = 'border-0 px-0'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Server import batches</CardTitle>
        <CardDescription>Reload-safe progress and truthful processing totals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!projectId ? (
          <EmptyState
            className={framed}
            icon={FolderSearch}
            title="No project selected"
            description="Select a project to see its imports."
          />
        ) : formsState === 'loading' ? (
          <LoadingSkeleton lines={3} />
        ) : formsState === 'error' ? (
          <EmptyState
            className={framed}
            icon={CircleAlert}
            tone="danger"
            title="Imports could not be loaded"
            description="Check your connection and access, then reload the page."
          />
        ) : batches.length === 0 ? (
          <EmptyState
            className={framed}
            icon={FileUp}
            title="No imports yet"
            description={
              canUpload
                ? 'Upload a source file to start the first import.'
                : 'Imports uploaded to this project will appear here.'
            }
          />
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
