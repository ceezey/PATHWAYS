'use client'

import { EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AsyncState, EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { publicMediaClient } from '@/lib/api/public-media'
import { publicationClient } from '@/lib/api/publication'
import type { PublicProjectResponse } from '@pathways/shared'

import { PublicTrackerDetail } from './public-tracker-view'

const stateLabels = {
  FOR_REVIEW: 'For review',
  APPROVED: 'Approved, not public',
  PUBLISHED: 'Published',
} as const

const noMedia: PublicProjectResponse['media'] = []

// Loads each picked item as an authorized blob URL; an item that fails (403) maps to '' and shows a placeholder.
const usePreviewMedia = (projectId: string, media: PublicProjectResponse['media']) => {
  const [urls, setUrls] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    if (media.length === 0) return
    let cancelled = false
    const made: string[] = []
    setUrls(null)
    Promise.all(
      media.map(async ({ id }) => {
        try {
          const blob = await publicMediaClient.contentBlob(projectId, id)
          if (cancelled) return [id, ''] as const
          const url = URL.createObjectURL(blob)
          made.push(url)
          return [id, url] as const
        } catch {
          return [id, ''] as const
        }
      }),
    ).then((entries) => !cancelled && setUrls(Object.fromEntries(entries)))
    return () => {
      cancelled = true
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [projectId, media])
  return urls
}

// Staff preview of the current revision's frozen snapshot, read through the authorized publication API.
export const PublicTrackerPreview = ({ projectId }: { projectId: string }) => {
  const publication = useAuthorizedRead(
    'publication-detail',
    projectId,
    'public.preview',
    (signal) => publicationClient.get(projectId, signal),
  )
  const media = publication.data?.snapshot.media ?? noMedia
  const urls = usePreviewMedia(projectId, media)
  if (publication.isPending || (media.length > 0 && !urls))
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
        mediaSrc={(id) => urls?.[id] ?? ''}
      />
    </div>
  )
}
