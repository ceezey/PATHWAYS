'use client'

import { useState } from 'react'

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
  onChange,
}: {
  id: string
  label: string
  fields: readonly { code: string; label: string }[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  // The chosen field stays listed so the trigger keeps showing it while filtering.
  const shown = fields
    .filter(
      (field) =>
        field.code === value || `${field.label} ${field.code}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={onChange}
      onOpenChange={(open) => !open && setQuery('')}
    >
      <SelectTrigger aria-label={label} id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <div className="sticky top-0 z-10 bg-popover p-1">
          <Input
            aria-label="Search fields"
            placeholder="Search fields"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Radix Select treats typed keys as typeahead; only ArrowDown passes through to reach the list.
            onKeyDown={(event) => event.key !== 'ArrowDown' && event.stopPropagation()}
          />
        </div>
        <SelectItem value="__pending__">Pending: select a target or explicit ignore</SelectItem>
        <SelectItem value="__ignore__">Ignore this source column</SelectItem>
        {shown.map((field) => (
          <SelectItem key={field.code} value={field.code}>
            {field.label} ({field.code})
          </SelectItem>
        ))}
        {shown.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No matching fields.</p>
        ) : null}
      </SelectContent>
    </Select>
  )
}
