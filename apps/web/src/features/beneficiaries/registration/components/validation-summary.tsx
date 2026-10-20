'use client'

import { type ValidationIssue, fieldIds } from '../registration.utils'

export const ValidationSummary = ({
  displayedValidationIssues,
}: {
  displayedValidationIssues: ValidationIssue[]
}) => (
  <div
    className="rounded-xl border border-danger/25 bg-danger-subtle p-4 text-sm text-danger"
    aria-labelledby="beneficiary-error-summary-title"
    role="alert"
  >
    <p className="font-semibold" id="beneficiary-error-summary-title">
      Check {displayedValidationIssues.length}{' '}
      {displayedValidationIssues.length === 1 ? 'field' : 'fields'} before saving
    </p>
    <ul className="mt-2 list-disc space-y-1 pl-5">
      {displayedValidationIssues.map((issue) => (
        <li key={issue.field}>
          <a
            className="font-medium underline underline-offset-2"
            href={`#${fieldIds[issue.field]}`}
            onClick={(event) => {
              event.preventDefault()
              document.getElementById(fieldIds[issue.field])?.focus()
            }}
          >
            {issue.message}
          </a>
        </li>
      ))}
    </ul>
  </div>
)
