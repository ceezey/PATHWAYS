'use client'

import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { fileParts as copy } from '../../collection.copy'

/** Tells the person a survey already has a draft form, with the design system's button to open it. */
export function showExistingDraft(survey: string, version: number, open: () => void) {
  const id = `existing-draft-${survey}`
  toast.info(copy.existingDraft(survey, version), {
    id,
    position: 'bottom-right',
    action: (
      <Button
        className="ml-auto shrink-0"
        onClick={() => {
          toast.dismiss(id)
          open()
        }}
        size="sm"
      >
        {copy.openDraft}
      </Button>
    ),
  })
}
