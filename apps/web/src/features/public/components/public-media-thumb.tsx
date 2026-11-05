'use client'

import { ImageOff, Video } from 'lucide-react'
import { useEffect, useState } from 'react'

import { publicMediaClient } from '@/lib/api/public-media'

// A photo loads as an authorized blob once it scrolls into view; a video shows a placeholder and is never fetched for a list.
// `fill` sizes it to its parent tile instead of the 64 px list square.
export const PublicMediaThumb = ({
  fill = false,
  label,
  mediaId,
  projectId,
  type,
}: {
  fill?: boolean
  label: string
  mediaId: string
  projectId: string
  type: 'PHOTO' | 'VIDEO'
}) => {
  const size = fill ? 'h-full w-full' : 'h-16 w-16 rounded-md'
  const box = `flex ${size} shrink-0 items-center justify-center bg-muted text-muted-foreground`
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (type !== 'PHOTO' || visible) return
    // Without IntersectionObserver the photo loads at once.
    if (typeof IntersectionObserver === 'undefined') return setVisible(true)
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, type, visible])

  useEffect(() => {
    if (type !== 'PHOTO' || !visible) return
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
  }, [projectId, mediaId, type, visible])

  if (type === 'VIDEO')
    return (
      <span aria-label={`Video: ${label}`} className={box} role="img">
        <Video aria-hidden="true" className="h-6 w-6" />
      </span>
    )
  if (url)
    // Blob URLs are browser-local and cannot use the Next.js image optimizer.
    return <img alt={label} className={`${size} shrink-0 object-cover`} src={url} />
  return (
    <span
      aria-label={failed ? `Preview unavailable: ${label}` : `Loading preview: ${label}`}
      className={box}
      ref={setNode}
      role="img"
    >
      <ImageOff aria-hidden="true" className="h-6 w-6" />
    </span>
  )
}
