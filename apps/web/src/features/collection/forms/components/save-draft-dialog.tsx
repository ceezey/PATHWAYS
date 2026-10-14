'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { CollectionState } from '../hooks/use-collection-state'
import type { FormActions } from '../hooks/use-form-actions'

export function SaveDraftDialog({
  state,
  formActions,
  mappedCount,
  sadddCount,
}: {
  state: Pick<
    CollectionState,
    | 'createPending'
    | 'fields'
    | 'formCreate'
    | 'formTitle'
    | 'mutation'
    | 'operationPending'
    | 'saveDialogOpen'
    | 'setSaveDialogOpen'
  >
  formActions: Pick<FormActions, 'saveDraftToApi'>
  mappedCount: number
  sadddCount: number
}) {
  const {
    createPending,
    fields,
    formCreate,
    formTitle,
    mutation,
    operationPending,
    saveDialogOpen,
    setSaveDialogOpen,
  } = state
  const { saveDraftToApi } = formActions
  return (
    <Dialog
      open={saveDialogOpen}
      onOpenChange={(open) => {
        if (!mutation.current) setSaveDialogOpen(open)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save form draft?</DialogTitle>
          <DialogDescription>
            This saves the validated definition as a Draft. Publishing remains a separate,
            permission-controlled action.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-surface-subtle p-4 text-sm">
          <p className="font-medium text-foreground">{formTitle}</p>
          <p className="mt-1 text-muted-foreground">
            {fields.length} fields, {mappedCount} mapped, {sadddCount} SADDD fields.
          </p>
        </div>
        {formCreate.notice ? (
          <output className="block text-sm text-info">{formCreate.notice}</output>
        ) : null}
        <DialogFooter>
          <Button
            disabled={operationPending}
            variant="outline"
            onClick={() => setSaveDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={operationPending || createPending}
            onClick={() => void saveDraftToApi()}
          >
            {operationPending || createPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {operationPending || createPending ? 'Saving...' : 'Save draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
