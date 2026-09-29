'use client'

import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { EditablePageHeadingKey } from '@/constants/display-labels'

// Organization display-label editing is deferred (docs/cr-pathways-frontend-usability.md, F-07):
// there is no server endpoint to save a page heading yet, so this stays a disabled, self-contained
// control rather than opening a dialog that would fail on save.
export const PageHeadingEditor = ({
  labelKey,
  title,
}: {
  labelKey: EditablePageHeadingKey
  title: string
}) => {
  const hintId = `page-heading-editor-hint-${labelKey}`

  return (
    <>
      <Button
        aria-describedby={hintId}
        aria-disabled="true"
        aria-label={`Edit ${title} page heading`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        size="icon"
        title="Not available yet"
        type="button"
        variant="ghost"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="sr-only" id={hintId}>
        Not available yet
      </span>
    </>
  )
}
