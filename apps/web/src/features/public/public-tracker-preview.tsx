'use client'

import { EyeOff } from 'lucide-react'
import Link from 'next/link'

import { AsyncState, EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { coreFeatureClient } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

import { PublicTrackerDetail } from './public-tracker-view'

const stateLabels = {
  FOR_REVIEW: 'For review',
  APPROVED: 'Approved, not public',
  PUBLISHED: 'Published',
} as const

// Staff preview of the current revision's frozen snapshot, read through the authorized publication API.
export const PublicTrackerPreview = ({ projectId }: { projectId: string }) => {
  const publication = useAuthorizedRead(
    'publication-detail',
    projectId,
    'public.preview',
    (signal) => coreFeatureClient.publication(projectId, signal),
  )
  if (publication.isPending)
    return (
      <AsyncState
        status="loading"
        title="Loading preview"
        description="Verifying the current revision."
      />
    )
  if (publication.isError)
    return (
      <AsyncState
        status="error"
        title="Preview unavailable"
        description="Current publication access could not be verified."
        onRetry={() => void publication.refetch()}
      />
    )
  const row = publication.data
  if (!row)
    return (
      <EmptyState
        action={
          <Button asChild variant="outline">
            <Link href="/transparency">Back to Public Tracker</Link>
          </Button>
        }
        className="min-h-80 rounded-lg border border-border bg-card"
        description="Submit a public summary for this project before opening the staff preview."
        icon={EyeOff}
        title="No public summary yet"
      />
    )
  return (
    <div className="-mx-4 overflow-hidden rounded-lg border border-border sm:mx-0">
      <PublicTrackerDetail
        project={{
          ...row.snapshot,
          publishedAt: row.state === 'PUBLISHED' ? row.updatedAt : undefined,
        }}
        state={`${stateLabels[row.state]} · Revision ${row.revision}`}
      />
    </div>
  )
}
