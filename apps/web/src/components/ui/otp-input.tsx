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

/**
 * A group of single-digit boxes for entering a numeric one-time code.
 * Digits are visible (not masked): TOTP codes are short-lived and showing
 * them helps correct transcription errors before submitting.
 */
const OtpInput = React.forwardRef<HTMLDivElement, OtpInputProps>(
  ({ id, length = 6, value, onChange, disabled, autoFocus, label, className }, ref) => {
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([])
    const digits = React.useMemo(() => {
      const chars = value.replace(/\D/g, '').slice(0, length).split('')
      return Array.from({ length }, (_, index) => chars[index] ?? '')
    }, [value, length])

    const setDigitAt = (index: number, digit: string) => {
      const next = digits.slice()
      next[index] = digit
      onChange(next.join('').replace(/\s+$/, ''))
    }

    const focusIndex = (index: number) => {
      const clamped = Math.max(0, Math.min(length - 1, index))
      inputRefs.current[clamped]?.focus()
      inputRefs.current[clamped]?.select()
    }

    const handleChange = (index: number, rawInput: string) => {
      const onlyDigits = rawInput.replace(/\D/g, '')
      if (!onlyDigits) {
        setDigitAt(index, '')
        return
      }
      if (onlyDigits.length > 1) {
        // A fast typist or an IME can deliver more than one character at once.
        const chars = onlyDigits.split('')
        const next = digits.slice()
        let cursor = index
        for (const char of chars) {
          if (cursor >= length) break
          next[cursor] = char
          cursor += 1
        }
        onChange(next.join('').slice(0, length))
        focusIndex(Math.min(cursor, length - 1))
        return
      }
      setDigitAt(index, onlyDigits)
      if (index < length - 1) focusIndex(index + 1)
    }

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        if (digits[index]) {
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
      const chars = pasted.split('')
      const next = digits.slice()
      let cursor = index
      for (const char of chars) {
        if (cursor >= length) break
        next[cursor] = char
        cursor += 1
      }
      onChange(next.join('').slice(0, length))
      focusIndex(Math.min(cursor, length - 1))
    }

    return (
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn('flex justify-between gap-2', className)}
      >
        {digits.map((digit, index) => (
          <input
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
            autoFocus={autoFocus && index === 0}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            className="h-11 w-11 rounded-md border border-input bg-background text-center text-lg font-medium text-foreground ring-offset-background transition-[border-color,box-shadow,color,background-color] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-disabled-foreground"
          />
        ))}
      </div>
    )
  },
)
OtpInput.displayName = 'OtpInput'

export { OtpInput }
