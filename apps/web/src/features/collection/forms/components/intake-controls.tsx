'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A native select at the 44px control height, as the rule forms use. */
export const selectClass =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-disabled-foreground'

/** A list of short texts shown as chips, with one input to add the next. */
export function ChipListInput({
  id,
  noun,
  values,
  max,
  maxLength,
  readOnly,
  onChange,
}: {
  id: string
  noun: string
  values: string[]
  max: number
  maxLength: number
  readOnly: boolean
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    if (readOnly || values.length >= max) return
    const text = draft.trim()
    if (text && !values.includes(text)) onChange([...values, text])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      {values.length ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center rounded-full border border-border bg-muted pl-3 text-sm"
            >
              <span>{value}</span>
              <Button
                aria-label={`Remove ${noun} ${value}`}
                disabled={readOnly}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Label className="sr-only" htmlFor={id}>
          New {noun}
        </Label>
        <Input
          disabled={readOnly}
          id={id}
          maxLength={maxLength}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            add()
          }}
        />
        <Button
          disabled={readOnly || values.length >= max}
          type="button"
          variant="outline"
          onClick={add}
        >
          Add {noun}
        </Button>
      </div>
    </div>
  )
}

/** Picks one of the form's own field codes, or none yet. */
export function FieldSelect({
  id,
  label,
  value,
  codes,
  readOnly,
  onChange,
}: {
  id: string
  label: string
  value: string
  codes: string[]
  readOnly: boolean
  onChange: (code: string) => void
}) {
  const options = value && !codes.includes(value) ? [value, ...codes] : codes
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        className={selectClass}
        disabled={readOnly}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a field</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  )
}
