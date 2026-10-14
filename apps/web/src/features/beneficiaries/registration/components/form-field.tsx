'use client'

import { Label } from '@/components/ui/label'

export const Field = ({
  hidden = false,
  htmlFor,
  label,
  error,
  errorId,
  required = false,
  children,
}: {
  hidden?: boolean
  htmlFor: string
  label: string
  error?: string
  errorId?: string
  required?: boolean
  children: React.ReactNode
}) =>
  hidden ? null : (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" id={errorId ?? `${htmlFor}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
