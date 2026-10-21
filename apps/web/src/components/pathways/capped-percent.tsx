'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'

import { type Overrun, cappedPercentParts, overrunReason } from '@/lib/format/percent'

const TIP_WIDTH = 256
const TIP_ROOM = 136

/** A percent capped at 100; the overrun note explains the real figure on hover or focus. */
export const CappedPercent = ({
  value,
  overrun,
  digits,
  focusable = true,
}: {
  value: number | string
  overrun?: Overrun
  digits?: number
  /** False inside another control, such as a card button, so focus is not nested. */
  focusable?: boolean
}) => {
  const tipId = useId()
  const [at, setAt] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const parts = cappedPercentParts(value, digits)

  // A fixed tooltip would drift from its note on scroll, so scrolling closes it.
  useEffect(() => {
    if (!at) return
    const close = () => setAt(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [at])

  if (!parts.over) return <>{parts.value}</>
  const show = (event: { currentTarget: HTMLElement }) => {
    const box = event.currentTarget.getBoundingClientRect()
    const above = box.bottom + TIP_ROOM > window.innerHeight
    setAt({
      top: above ? box.top - 8 : box.bottom + 8,
      left: Math.max(16, Math.min(box.left, window.innerWidth - TIP_WIDTH - 16)),
      above,
    })
  }
  const hide = () => setAt(null)

  return (
    <>
      {parts.value}{' '}
      <span
        aria-describedby={at ? tipId : undefined}
        className="cursor-help whitespace-nowrap text-xs font-normal tracking-normal text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onBlur={hide}
        onClick={show}
        onFocus={show}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hide()
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        tabIndex={focusable ? 0 : undefined}
      >
        ({parts.over})
      </span>
      {at
        ? createPortal(
            <span
              className="fixed z-50 rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 tracking-normal text-popover-foreground shadow-dialog"
              id={tipId}
              role="tooltip"
              style={{
                top: at.top,
                left: at.left,
                width: `min(${TIP_WIDTH}px, calc(100vw - 2rem))`,
                transform: at.above ? 'translateY(-100%)' : undefined,
              }}
            >
              {overrunReason(value, overrun, digits)}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}
