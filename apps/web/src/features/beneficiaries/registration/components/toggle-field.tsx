'use client'

import { Label } from '@/components/ui/label'

export const ToggleField = ({
  hidden = false,
  checked,
  disabled = false,
  error,
  id,
  label,
  onChange,
  required = false,
}: {
  hidden?: boolean
  checked: boolean
  disabled?: boolean
  error?: string
  id: string
  label: string
  onChange: (checked: boolean) => void
  required?: boolean
}) =>
  hidden ? null : (
    <div className="space-y-2">
      <Label
        className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm"
        htmlFor={id}
      >
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          aria-required={required}
          checked={checked}
          className="h-4 w-4 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={id}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </span>
      </Label>
      {error ? (
        <p className="text-xs font-medium text-danger" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
