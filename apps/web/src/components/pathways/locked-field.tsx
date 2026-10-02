'use client'

import { Lock } from 'lucide-react'
import { useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export const lockedFieldMessage = 'You are not authorized to change this field'

/**
 * A field the caller may read but not change. The control is disabled for input
 * (`readOnly` with `aria-disabled`) yet stays keyboard-focusable, so the reason is reachable
 * by keyboard and hover, and `aria-describedby` always points at it for screen readers.
 * It has no `name` and is never registered with a form, so a request never sends it.
 * Only pass values the caller may read: an unreadable value is omitted, not locked.
 */
export const LockedField = ({
  className,
  label,
  multiline = false,
  value,
}: {
  className?: string
  label: string
  multiline?: boolean
  value: string
}) => {
  const controlId = useId()
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const control = {
    'aria-describedby': tooltipId,
    'aria-disabled': true,
    className:
      'cursor-not-allowed border-border bg-secondary pr-10 text-muted-foreground hover:border-border',
    'data-locked-field': '',
    id: controlId,
    onBlur: () => setOpen(false),
    onFocus: () => setOpen(true),
    // Escape dismisses the reason without moving focus (WCAG 1.4.13).
    onKeyDown: (event: { key: string }) => {
      if (event.key === 'Escape') setOpen(false)
    },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    readOnly: true,
    value,
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label
        className="block text-sm font-semibold leading-none text-foreground"
        htmlFor={controlId}
      >
        {label}
      </label>
      <div className="relative">
        {multiline ? (
          <Textarea {...control} rows={Math.min(4, Math.max(2, value.split('\n').length))} />
        ) : (
          <Input {...control} />
        )}
        <Lock
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground"
        />
        <span
          className={
            open
              ? 'absolute left-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-dialog'
              : 'sr-only'
          }
          data-state={open ? 'open' : 'closed'}
          id={tooltipId}
          role="tooltip"
        >
          {lockedFieldMessage}
        </span>
      </div>
    </div>
  )
}
