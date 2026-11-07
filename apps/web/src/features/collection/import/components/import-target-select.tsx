'use client'

import { type KeyboardEvent, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// A column's target picker: form fields sorted by label and narrowed by a search box.
export function ImportTargetSelect({
  id,
  label,
  fields,
  value,
  disabled,
  describedBy,
  onChange,
}: {
  id: string
  label: string
  fields: readonly { code: string; label: string }[]
  value: string
  disabled: boolean
  // The id of a line that explains this column, read after the label.
  describedBy?: string
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const needle = query.trim().toLowerCase()
  // The chosen field stays listed so the trigger keeps showing it while filtering.
  const shown = fields
    .filter(
      (field) =>
        field.code === value || `${field.label} ${field.code}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.label.localeCompare(b.label))
  const nothingFound = needle !== '' && shown.every((field) => field.code === value)
  // Focus opens on a list item, so a typed letter or ArrowUp from the first item goes to the search box.
  const toSearch = (event: KeyboardEvent<HTMLDivElement>) => {
    const input = search.current
    if (!input || event.target === input) return
    const letter = event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey
    const first = event.currentTarget.querySelector('[role="option"]') === event.target
    if (!letter && !(event.key === 'ArrowUp' && first)) return
    event.preventDefault()
    if (letter) setQuery((current) => current + event.key)
    input.focus()
  }
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={onChange}
      onOpenChange={(open) => !open && setQuery('')}
    >
      <SelectTrigger aria-describedby={describedBy} aria-label={label} id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent onKeyDown={toSearch}>
        <div className="sticky top-0 z-10 bg-popover p-1">
          <Input
            ref={search}
            aria-label="Search fields"
            placeholder="Search fields"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Radix Select treats typed keys as typeahead; ArrowDown and Escape pass through to the list.
            onKeyDown={(event) =>
              event.key !== 'ArrowDown' && event.key !== 'Escape' && event.stopPropagation()
            }
          />
        </div>
        <SelectItem value="__pending__">Pending: select a target or explicit ignore</SelectItem>
        <SelectItem value="__ignore__">Ignore this source column</SelectItem>
        {shown.map((field) => (
          <SelectItem key={field.code} value={field.code}>
            {field.label} ({field.code})
          </SelectItem>
        ))}
        {nothingFound ? (
          <output className="block px-2 py-2 text-sm text-muted-foreground">
            No matching fields.
          </output>
        ) : null}
      </SelectContent>
    </Select>
  )
}
