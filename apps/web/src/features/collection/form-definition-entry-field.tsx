'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DigitalFormFieldDefinition } from '@/types/pathways'
import type { ReactNode } from 'react'

export function FormDefinitionEntryField({
  disabled,
  errors,
  field,
  onChange,
  value,
}: {
  disabled: boolean
  errors: string[]
  field: DigitalFormFieldDefinition
  onChange: (value: unknown) => void
  value: unknown
}) {
  const id = `entry-${field.code}`
  const describedBy = errors.length ? `${id}-error` : undefined
  const common = {
    disabled,
    id,
    'aria-describedby': describedBy,
    'aria-invalid': errors.length > 0,
    'aria-required': field.required,
  }
  let control: ReactNode

  if (field.dataType === 'BOOLEAN') {
    control = (
      <Select
        disabled={disabled}
        value={value === true ? 'true' : value === false ? 'false' : 'unset'}
        onValueChange={(next) => onChange(next === 'unset' ? null : next === 'true')}
      >
        <SelectTrigger
          id={id}
          aria-describedby={describedBy}
          aria-invalid={errors.length > 0}
          aria-required={field.required}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">Not answered</SelectItem>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    )
  } else if (field.dataType === 'SELECT') {
    control = (
      <Select
        disabled={disabled}
        value={typeof value === 'string' ? `option:${value}` : 'unanswered'}
        onValueChange={(next) => {
          if (next === 'unanswered') onChange(null)
          else if (next.startsWith('option:')) onChange(next.slice('option:'.length))
        }}
      >
        <SelectTrigger
          id={id}
          aria-describedby={describedBy}
          aria-invalid={errors.length > 0}
          aria-required={field.required}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unanswered">Not answered</SelectItem>
          {(field.allowedValues ?? []).map((option) => (
            <SelectItem key={option} value={`option:${option}`}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (field.dataType === 'MULTIPLE_SELECT') {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
    control = (
      <fieldset
        id={id}
        tabIndex={-1}
        disabled={disabled}
        aria-invalid={errors.length > 0}
        aria-describedby={
          [field.required ? `${id}-requirement` : undefined, describedBy]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className="grid gap-2 sm:grid-cols-2"
      >
        <legend className="text-sm font-medium">
          {field.label}
          {field.required ? ' (required)' : ''}
        </legend>
        {field.required ? (
          <p id={`${id}-requirement`} className="text-xs text-muted-foreground">
            Choose at least {Math.max(1, field.minimumLength ?? 1)} option(s).
          </p>
        ) : null}
        {(field.allowedValues ?? []).map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              disabled={disabled}
              type="checkbox"
              aria-describedby={describedBy}
              aria-invalid={errors.length > 0}
              checked={selected.includes(option)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
      </fieldset>
    )
  } else if (field.dataType === 'LONG_TEXT') {
    control = (
      <textarea
        {...common}
        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else {
    const type =
      field.dataType === 'DATE'
        ? 'date'
        : field.dataType === 'INTEGER' || field.dataType === 'DECIMAL'
          ? 'number'
          : 'text'
    control = (
      <Input
        {...common}
        step={
          field.dataType === 'INTEGER' ? '1' : field.dataType === 'DECIMAL' ? '0.0001' : undefined
        }
        type={type}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <div className="space-y-2">
      {field.dataType !== 'MULTIPLE_SELECT' ? (
        <Label htmlFor={id}>
          {field.label}
          {field.required ? ' *' : ''}
        </Label>
      ) : null}
      {control}
      {errors.length ? (
        <ul id={`${id}-error`} className="space-y-1 text-xs text-danger">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
