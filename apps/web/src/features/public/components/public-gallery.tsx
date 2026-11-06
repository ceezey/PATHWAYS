'use client'

import { ImageOff, Maximize2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { Eyebrow, shell } from './public-sections'

type GalleryItem = {
  id: string
  type: 'PHOTO' | 'VIDEO'
  caption: string
  src: string
  placeholder?: ReactNode
}

// Blob and API URLs cannot use the Next.js image optimizer.
const Media = ({
  item,
  className,
  onError,
}: { item: GalleryItem; className: string; onError: () => void }) =>
  item.type === 'PHOTO' ? (
    <img alt={item.caption} className={className} onError={onError} src={item.src} />
  ) : (
    <video
      className={`${className} bg-ink`}
      controls
      onError={onError}
      preload="metadata"
      src={item.src}
    >
      <track kind="captions" />
    </video>
  )

// An item without a source shows its placeholder, or a neutral one when the viewer may not read it.
const Tile = ({
  item,
  large,
  onError,
  onOpen,
}: { item: GalleryItem; large?: boolean; onError: () => void; onOpen: () => void }) => {
  const open = `View full size: ${item.caption}`
  return (
    <figure className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-lg bg-muted ${large ? 'aspect-video' : 'aspect-[4/3]'}`}
      >
        {!item.src ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageOff aria-hidden="true" className="h-6 w-6" />
            {item.placeholder ?? 'Preview not available'}
          </div>
        ) : item.type === 'PHOTO' ? (
          <button aria-label={open} className="block h-full w-full" onClick={onOpen} type="button">
            <Media className="h-full w-full object-cover" item={item} onError={onError} />
          </button>
        ) : (
          <>
            <Media className="h-full w-full object-contain" item={item} onError={onError} />
            <button
              aria-label={open}
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md bg-ink/70 text-white hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onOpen}
              type="button"
            >
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      <figcaption className="text-sm leading-6 text-muted-foreground">{item.caption}</figcaption>
    </figure>
  )
}

// One large lead item, a grid of the rest, and a full-size view with the caption; an item that fails to load is hidden.
export const PublicGallery = ({ items }: { items: GalleryItem[] }) => {
  const [active, setActive] = useState<GalleryItem | null>(null)
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const shown = items.filter((item) => !broken.has(item.id))
  if (shown.length === 0) return null
  const hide = (id: string) => () => {
    setBroken((previous) => new Set(previous).add(id))
    setActive((current) => (current?.id === id ? null : current))
  }
  const [lead, ...rest] = shown
  return (
    <section className={`${shell} pb-8 sm:pb-12`}>
      <Card className="space-y-5 p-6 sm:p-8">
        <div>
          <Eyebrow tone="text-primary">Gallery</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Photos and videos
          </h2>
        </div>
        <div data-testid="gallery-lead">
          <Tile item={lead} large onError={hide(lead.id)} onOpen={() => setActive(lead)} />
        </div>
        {rest.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery-grid">
            {rest.map((item) => (
              <Tile
                item={item}
                key={item.id}
                onError={hide(item.id)}
                onOpen={() => setActive(item)}
              />
            ))}
          </div>
        )}
      </Card>
      <Dialog onOpenChange={(open) => !open && setActive(null)} open={Boolean(active)}>
        {active ? (
          <DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{active.caption}</DialogTitle>
            </DialogHeader>
            <Media
              className="max-h-[60vh] w-full object-contain"
              item={active}
              onError={hide(active.id)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}
