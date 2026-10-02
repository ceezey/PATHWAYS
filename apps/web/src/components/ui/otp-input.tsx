'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

interface OtpInputProps {
  id?: string
  length?: number
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  label: string
  className?: string
}

const toSlots = (value: string, length: number) => {
  const chars = value.replace(/\D/g, '').slice(0, length).split('')
  return Array.from({ length }, (_, index) => chars[index] ?? '')
}

/**
 * Digits emitted upward must reflect what a fixed-length OTP means to a
 * backend: a contiguous run starting at box 1. If every box up to the last
 * filled one is full, emit them all; otherwise emit only the unbroken
 * prefix and let the (visually stable) gap stay a gap on screen.
 */
const emitValueFor = (slots: string[]) => {
  let lastFilled = -1
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index] !== '') {
      lastFilled = index
      break
    }
  }
  if (lastFilled === -1) return ''

  let hasGap = false
  for (let index = 0; index < lastFilled; index += 1) {
    if (slots[index] === '') {
      hasGap = true
      break
    }
  }
  if (!hasGap) return slots.slice(0, lastFilled + 1).join('')

  let prefixEnd = 0
  while (prefixEnd < slots.length && slots[prefixEnd] !== '') prefixEnd += 1
  return slots.slice(0, prefixEnd).join('')
}

/**
 * A group of single-digit boxes for entering a numeric one-time code.
 * Digits are visible (not masked): TOTP codes are short-lived and showing
 * them helps correct transcription errors before submitting.
 *
 * Box contents are tracked as a fixed-length local array so clearing a
 * middle box (or typing past a gap) never shifts later digits on screen;
 * only the value emitted to `onChange` collapses to a contiguous run.
 */
const OtpInput = React.forwardRef<HTMLDivElement, OtpInputProps>(
  ({ id, length = 6, value, onChange, disabled, autoFocus, label, className }, ref) => {
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([])
    const [slots, setSlots] = React.useState<string[]>(() => toSlots(value, length))
    const lastEmitted = React.useRef(value)

    React.useEffect(() => {
      if (value !== lastEmitted.current) {
        lastEmitted.current = value
        setSlots(toSlots(value, length))
      }
    }, [value, length])

    const applyNext = (next: string[]) => {
      setSlots(next)
      const emitted = emitValueFor(next)
      lastEmitted.current = emitted
      onChange(emitted)
    }

    const setDigitAt = (index: number, digit: string) => {
      const next = slots.slice()
      next[index] = digit
      applyNext(next)
    }

    const focusIndex = (index: number) => {
      const clamped = Math.max(0, Math.min(length - 1, index))
      inputRefs.current[clamped]?.focus()
      inputRefs.current[clamped]?.select()
    }

    const firstEmptyIndex = () => slots.findIndex((slot) => slot === '')

    // autoFocus on the input itself is flagged by lint/a11y/noAutofocus and,
    // more importantly, only ever fires on the DOM node's initial mount —
    // it would miss cases where `autoFocus` turns on after the group is
    // already rendered (e.g. a dialog that mounts this input before it
    // opens). Focusing imperatively once, when the prop is true, keeps the
    // same initial-focus behavior for both cases.
    React.useEffect(() => {
      if (autoFocus) {
        inputRefs.current[0]?.focus()
        inputRefs.current[0]?.select()
      }
    }, [autoFocus])

    const handleChange = (index: number, rawInput: string) => {
      const onlyDigits = rawInput.replace(/\D/g, '')
      if (!onlyDigits) {
        setDigitAt(index, '')
        return
      }

      // Never let typing land past the first gap: redirect to the first
      // empty box so later digits are never skipped over.
      const firstEmpty = firstEmptyIndex()
      const targetIndex = firstEmpty !== -1 && firstEmpty < index ? firstEmpty : index

      if (onlyDigits.length > 1) {
        // A fast typist or an IME can deliver more than one character at once.
        const chars = onlyDigits.split('')
        const next = slots.slice()
        let cursor = targetIndex
        for (const char of chars) {
          if (cursor >= length) break
          next[cursor] = char
          cursor += 1
        }
        applyNext(next)
        focusIndex(Math.min(cursor, length - 1))
        return
      }
      setDigitAt(targetIndex, onlyDigits)
      if (targetIndex < length - 1) focusIndex(targetIndex + 1)
    }

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        if (slots[index]) {
          setDigitAt(index, '')
          return
        }
        event.preventDefault()
        if (index > 0) {
          setDigitAt(index - 1, '')
          focusIndex(index - 1)
        }
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        focusIndex(index - 1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        focusIndex(index + 1)
        return
      }
      if (event.key === 'Delete') {
        event.preventDefault()
        setDigitAt(index, '')
      }
    }

    const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
      if (!pasted) return
      event.preventDefault()
      const firstEmpty = firstEmptyIndex()
      const targetIndex = firstEmpty !== -1 && firstEmpty < index ? firstEmpty : index
      const chars = pasted.split('')
      const next = slots.slice()
      let cursor = targetIndex
      for (const char of chars) {
        if (cursor >= length) break
        next[cursor] = char
        cursor += 1
      }
      applyNext(next)
      focusIndex(Math.min(cursor, length - 1))
    }

    return (
      <div
        ref={ref}
        // biome-ignore lint/a11y/useSemanticElements: <fieldset> ships browser
        // default border/padding that would change this control's layout;
        // role="group" plus aria-label gives the same grouping semantics
        // without altering the approved visual design.
        role="group"
        aria-label={label}
        className={cn('flex justify-between gap-2', className)}
      >
        {slots.map((digit, index) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP digit boxes have no identity beyond position; length never changes and boxes are never reordered, inserted, or removed.
            key={index}
            id={index === 0 ? id : undefined}
            ref={(node) => {
              inputRefs.current[index] = node
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={1}
            aria-label={`Digit ${index + 1} of ${length}`}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            className="h-11 w-11 rounded-md border border-input bg-card text-center text-lg font-medium text-foreground ring-offset-background transition-[border-color,box-shadow,color,background-color] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-disabled-foreground"
          />
        ))}
      </div>
    )
  },
)
OtpInput.displayName = 'OtpInput'

export { OtpInput }
