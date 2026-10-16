'use client'

import type {
  ComponentPropsWithoutRef,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  Ref,
  WheelEventHandler,
} from 'react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const defaultResizableWidth = 480
const minimumResizableWidth = 480
const maximumResizableWidth = 960
const resizeStep = 40

const widthBounds = (viewportWidth: number) => {
  const maximum = Math.max(
    minimumResizableWidth,
    Math.min(maximumResizableWidth, viewportWidth - 48),
  )
  return { minimum: Math.min(minimumResizableWidth, maximum), maximum }
}
const clampWidth = (value: number, bounds: ReturnType<typeof widthBounds>) =>
  Math.min(bounds.maximum, Math.max(bounds.minimum, value))

export const SidePanel = ({
  title,
  description,
  children,
  containedScroll = false,
  onOverlayWheel,
  scrollRef,
  className,
  resizable = false,
  resizeLabel = 'Resize panel',
}: {
  title: string
  description: string
  children: ReactNode
  containedScroll?: boolean
  onOverlayWheel?: WheelEventHandler<HTMLDivElement>
  scrollRef?: Ref<HTMLDivElement>
  className?: string
  /** Desktop-only horizontal resizing for an opt-in contextual edit panel. */
  resizable?: boolean
  resizeLabel?: string
}) => (
  <ResizablePanel
    className={className}
    containedScroll={containedScroll}
    description={description}
    resizeLabel={resizeLabel}
    resizable={resizable}
    scrollRef={scrollRef}
    title={title}
    overlayProps={onOverlayWheel ? { onWheel: onOverlayWheel } : undefined}
  >
    {children}
  </ResizablePanel>
)

const ResizablePanel = ({
  title,
  description,
  children,
  containedScroll,
  overlayProps,
  scrollRef,
  className,
  resizable,
  resizeLabel,
}: {
  title: string
  description: string
  children: ReactNode
  containedScroll: boolean
  overlayProps?: ComponentPropsWithoutRef<typeof SheetContent>['overlayProps']
  scrollRef?: Ref<HTMLDivElement>
  className?: string
  resizable: boolean
  resizeLabel: string
}) => {
  const [width, setWidth] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const dragStart = useRef<{ pointerId: number; clientX: number; width: number } | null>(null)
  const bounds = widthBounds(viewportWidth ?? maximumResizableWidth + 48)
  const desktop = viewportWidth === null || viewportWidth >= 640
  useEffect(() => {
    if (!resizable) return
    const updateViewport = () => {
      const nextViewportWidth = window.innerWidth
      const nextBounds = widthBounds(nextViewportWidth)
      setViewportWidth(nextViewportWidth)
      setWidth((current) =>
        nextViewportWidth < 640 || current === null ? null : clampWidth(current, nextBounds),
      )
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [resizable])
  const resize = (value: number) => setWidth(clampWidth(value, bounds))
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextWidth = clampWidth(width ?? defaultResizableWidth, bounds)
    dragStart.current = { clientX: event.clientX, pointerId: event.pointerId, width: nextWidth }
    setWidth(nextWidth)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const continueResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    resize(start.width + start.clientX - event.clientX)
  }
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current?.pointerId !== event.pointerId) return
    dragStart.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <SheetContent
      className={cn(
        containedScroll
          ? 'flex h-dvh max-h-dvh w-full flex-col overflow-hidden sm:max-w-xl'
          : 'w-full overflow-y-auto sm:max-w-xl',
        resizable && 'sm:max-w-none',
        className,
      )}
      data-resizable={resizable || undefined}
      overlayProps={overlayProps}
      style={resizable && desktop && width ? { width: `${width}px` } : undefined}
    >
      {resizable ? (
        <div
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemax={bounds.maximum}
          aria-valuemin={bounds.minimum}
          aria-valuenow={width ?? defaultResizableWidth}
          className="absolute -left-5 top-0 z-10 hidden h-full w-11 cursor-col-resize touch-none sm:block focus-visible:outline-none before:absolute before:inset-y-0 before:left-5 before:w-px before:bg-border hover:before:bg-primary focus-visible:before:w-0.5 focus-visible:before:bg-primary"
          role="separator"
          tabIndex={0}
          onKeyDown={(event) => {
            const current = width ?? defaultResizableWidth
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              resize(current + resizeStep)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              resize(current - resizeStep)
            }
            if (event.key === 'Home') {
              event.preventDefault()
              resize(bounds.minimum)
            }
            if (event.key === 'End') {
              event.preventDefault()
              resize(bounds.maximum)
            }
          }}
          onPointerDown={startResize}
          onPointerMove={continueResize}
          onPointerUp={finishResize}
        />
      ) : null}
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div
        className={containedScroll ? 'mt-6 min-h-0 flex-1 overflow-y-auto pr-1' : 'mt-6'}
        data-side-panel-scroll={containedScroll ? 'true' : undefined}
        ref={scrollRef}
      >
        {children}
      </div>
    </SheetContent>
  )
}
