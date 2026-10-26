'use client'

import type { ImportRowReviewFieldResponse } from '@pathways/shared'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { selectClass } from '../../forms/components/intake-controls'

export type ReviewField = ImportRowReviewFieldResponse
type Cell = ReviewField['file']

export const cellText = (value: Cell | undefined) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// What the reviewer typed, as the API expects the field's value.
export const ownPayload = (field: ReviewField, text: string) =>
  field.dataType === 'BOOLEAN'
    ? text === 'Yes'
    : field.dataType === 'MULTIPLE_SELECT'
      ? text
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : text

/** One value the reviewer can click to keep. */
export function ChoiceCell({
  label,
  column,
  value,
  picked,
  disabled,
  onPick,
}: {
  label: string
  column: string
  value: Cell
  picked: boolean
  disabled?: boolean
  onPick: () => void
}) {
  const text = cellText(value)
  return (
    <button
      aria-label={`${label}, ${column}: ${text ?? 'empty'}`}
      aria-pressed={picked}
      className={cn(
        'min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground',
        picked
          ? 'border-primary bg-info-subtle font-medium'
          : 'border-input bg-card hover:bg-muted',
      )}
      disabled={disabled}
      onClick={onPick}
      type="button"
    >
      {text ?? <span className="text-muted-foreground">Empty</span>}
    </button>
  )
}

/** The reviewer's own value: a dropdown for a choice field, otherwise a text box. */
export function OwnValue({
  field,
  text,
  invalid,
  describedBy,
  onChange,
}: {
  field: ReviewField
  text: string
  invalid: boolean
  describedBy?: string
  onChange: (text: string) => void
}) {
  const options = field.dataType === 'BOOLEAN' ? ['Yes', 'No'] : field.options
  const common = {
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-label': `${field.label}, Your value`,
  }
  if (options && (field.dataType === 'SELECT' || field.dataType === 'BOOLEAN')) {
    return (
      <select
        {...common}
        className={cn(selectClass, text && 'border-primary bg-info-subtle')}
        onChange={(event) => onChange(event.target.value)}
        value={text}
      >
        <option value="">Choose an answer</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  return (
    <Input
      {...common}
      className={cn(text && 'border-primary bg-info-subtle')}
      onChange={(event) => onChange(event.target.value)}
      placeholder={
        field.dataType === 'MULTIPLE_SELECT' ? 'Separate answers with commas' : undefined
      }
      type={field.dataType === 'DATE' ? 'date' : 'text'}
      value={text}
    />
  )
}
