'use client'

import { Info } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const gap = 8

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
        aria-expanded={open}
        aria-label={`More information about ${label}`}
        className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            event.currentTarget.blur()
          }
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        ref={triggerRef}
        type="button"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[60] w-[min(16rem,calc(100vw-1rem))] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground shadow-dialog"
              id={tooltipId}
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
