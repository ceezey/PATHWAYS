'use client'

import { ImageOff, Video } from 'lucide-react'
import { useEffect, useState } from 'react'

import { publicMediaClient } from '@/lib/api/public-media'

const box =
  'flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'

// A photo loads as an authorized blob; a video shows a placeholder so no large file is fetched for a list.
export const PublicMediaThumb = ({
  label,
  mediaId,
  projectId,
  type,
}: {
  label: string
  mediaId: string
  projectId: string
  type: 'PHOTO' | 'VIDEO'
}) => {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (type !== 'PHOTO') return
    let cancelled = false
    let objectUrl: string | null = null
    publicMediaClient
      .contentBlob(projectId, mediaId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [projectId, mediaId, type])

  if (type === 'VIDEO')
    return (
      <span aria-label={`Video: ${label}`} className={box} role="img">
        <Video aria-hidden="true" className="h-6 w-6" />
      </span>
    )
  if (url)
    // Blob URLs are browser-local and cannot use the Next.js image optimizer.
    return <img alt={label} className="h-16 w-16 shrink-0 rounded-md object-cover" src={url} />
  return (
    <span
      aria-label={failed ? `Preview unavailable: ${label}` : `Loading preview: ${label}`}
      className={box}
      role="img"
    >
      <ImageOff aria-hidden="true" className="h-6 w-6" />
    </span>
  )
}
