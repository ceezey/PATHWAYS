'use client'

import { EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { AsyncState, EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { publicMediaClient } from '@/lib/api/public-media'
import { publicationClient } from '@/lib/api/publication'
import type { PublicProjectResponse } from '@pathways/shared'

import { PublicTrackerDetail } from './public-tracker-view'

export const stateLabels = {
  FOR_REVIEW: 'For review',
  APPROVED: 'Approved, not public',
  PUBLISHED: 'Published',
} as const

type Slot = { url: string } | 'loading' | 'failed'

// Photos load as authorized blobs at once, a video only when asked; unmount aborts downloads and revokes the URLs.
const usePreviewMedia = (projectId: string, media: PublicProjectResponse['media']) => {
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const loader = useRef<(id: string) => void>(() => {})
  // Keyed by the photo ids, so a rebuilt draft array with the same photos does not reload them.
  const photos = media
    .filter((item) => item.type === 'PHOTO')
    .map((item) => item.id)
    .join(' ')
  useEffect(() => {
    const controller = new AbortController()
    const made: string[] = []
    const set = (id: string, slot: Slot) => setSlots((all) => ({ ...all, [id]: slot }))
    const load = (id: string) => {
      set(id, 'loading')
      publicMediaClient
        .contentBlob(projectId, id, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return
          const url = URL.createObjectURL(blob)
          made.push(url)
          set(id, { url })
        })
        .catch(() => !controller.signal.aborted && set(id, 'failed'))
    }
    loader.current = load
    setSlots({})
    for (const id of photos.split(' ').filter(Boolean)) load(id)
    return () => {
      controller.abort()
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [projectId, photos])
  const src = (id: string) => {
    const slot = slots[id]
    return typeof slot === 'object' ? slot.url : ''
  }
  const placeholder = (id: string) => {
    const slot = slots[id]
    if (slot === 'loading') return 'Loading preview'
    if (slot || media.find((item) => item.id === id)?.type !== 'VIDEO') return undefined
    return (
      <Button onClick={() => loader.current(id)} size="sm" type="button" variant="outline">
        Load video preview
      </Button>
    )
  }
  return { src, placeholder }
}

type Project = Parameters<typeof PublicTrackerDetail>[0]['project']

// One project page as staff see it, with media loaded through the authorized API.
export const PreviewFrame = ({
  project,
  state,
  draft,
}: { project: Project; state: string; draft?: boolean }) => {
  const preview = usePreviewMedia(project.id, project.media)
  return (
    <div className="-mx-4 overflow-hidden rounded-lg border border-border sm:mx-0">
      <PublicTrackerDetail
        project={project}
        state={state}
        mediaSrc={preview.src}
        mediaPlaceholder={preview.placeholder}
        draft={draft}
      />
    </div>
  )
}

// Staff preview of the current revision's frozen snapshot, read through the authorized publication API.
export const PublicTrackerPreview = ({ projectId }: { projectId: string }) => {
  const publication = useAuthorizedRead(
    'publication-detail',
    projectId,
    'public.preview',
    (signal) => publicationClient.get(projectId, signal),
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
    <PreviewFrame
      project={{
        ...row.snapshot,
        publishedAt: row.state === 'PUBLISHED' ? row.updatedAt : undefined,
      }}
      state={`${stateLabels[row.state]} · Revision ${row.revision}`}
    />
  )
}
