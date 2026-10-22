'use client'

import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const gap = 8
const closeDelayMs = 120

type Box = Readonly<{ left: number; top: number; bottom: number }>
type Size = Readonly<{ width: number; height: number }>

/** Tooltip position below the trigger, else above it, clamped inside the viewport. */
export const tooltipPosition = (trigger: Box, tip: Size, viewport: Size) => {
  const clamp = (value: number, max: number) => Math.max(gap, Math.min(value, max - gap))
  const below = trigger.bottom + gap
  const top = below + tip.height <= viewport.height - gap ? below : trigger.top - gap - tip.height
  return {
    left: clamp(trigger.left, viewport.width - tip.width),
    top: clamp(top, viewport.height - tip.height),
  }
}

export const MetricTooltip = ({ label, children }: { label: string; children: string }) => {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const show = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  // Leaving the trigger or the tip closes after a short delay, so the pointer can cross onto the tip.
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current)
    // A tip opened by keyboard focus stays while the trigger keeps focus.
    if (triggerRef.current === document.activeElement) return
    closeTimer.current = window.setTimeout(() => setOpen(false), closeDelayMs)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Escape anywhere dismisses an open tip and leaves focus where it was. Window capture runs before a Radix sheet's
  // document capture handler, so the first Escape closes only the tip, never the sheet and its unsaved edits.
  useEffect(() => {
    if (!open) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', dismiss, true)
    return () => window.removeEventListener('keydown', dismiss, true)
  }, [open])

  // Fixed in a portal, so a scrolling sheet or card can never clip it.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      const tip = tipRef.current
      if (!trigger || !tip) return
      const { left, top } = tooltipPosition(
        trigger.getBoundingClientRect(),
        { width: tip.offsetWidth, height: tip.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      )
      tip.style.left = `${left}px`
      tip.style.top = `${top}px`
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <span className="pointer-events-auto relative inline-flex">
      <button
        aria-describedby={open ? tooltipId : undefined}
        aria-label={`More information about ${label}`}
        className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onBlur={() => setOpen(false)}
        onClick={show}
        onFocus={show}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        ref={triggerRef}
        type="button"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            // pointer-events-auto keeps the tip hoverable inside a modal sheet that disables body pointer events.
            <span
              className="pointer-events-auto fixed z-[60] w-[min(16rem,calc(100vw-1rem))] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground shadow-dialog"
              id={tooltipId}
              onMouseEnter={show}
              onMouseLeave={hideSoon}
              ref={tipRef}
              role="tooltip"
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
