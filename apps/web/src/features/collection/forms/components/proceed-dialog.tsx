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

import { ImportProcessingPanel } from '../../import/components/import-processing-panel'
import type { CollectionState } from '../hooks/use-collection-state'
import type { ImportActions } from '../hooks/use-import-actions'

export function ProceedDialog({
  state,
  importActions,
}: {
  state: Pick<
    CollectionState,
    | 'createPending'
    | 'mutation'
    | 'operationPending'
    | 'parsedImport'
    | 'proceedDialogOpen'
    | 'setProceedDialogOpen'
  >
  importActions: Pick<
    ImportActions,
    | 'closeProceedDialog'
    | 'confirmImportProceed'
    | 'processingRun'
    | 'resumeServerProcessing'
    | 'stopServerProcessing'
  >
}) {
  const {
    createPending,
    mutation,
    operationPending,
    parsedImport,
    proceedDialogOpen,
    setProceedDialogOpen,
  } = state
  const {
    closeProceedDialog,
    confirmImportProceed,
    processingRun,
    resumeServerProcessing,
    stopServerProcessing,
  } = importActions
  return (
    <Dialog
      open={proceedDialogOpen}
      onOpenChange={(open) => {
        if (mutation.current) return
        if (open) setProceedDialogOpen(true)
        else closeProceedDialog()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parsedImport?.rows.length === 0 ? 'Create draft form?' : 'Review mapped fields?'}
          </DialogTitle>
          <DialogDescription>
            {parsedImport?.rows.length === 0
              ? 'The mapped columns will become questionnaire fields. You can edit the Draft from Forms before publishing.'
              : 'Valid rows will be imported; invalid rows remain isolated for correction and reprocessing.'}
          </DialogDescription>
        </DialogHeader>
        {processingRun ? (
          <ImportProcessingPanel
            canResume={!operationPending}
            focusOnMount
            note={processingRun.note}
            onResume={() => void resumeServerProcessing()}
            onStop={stopServerProcessing}
            progress={processingRun.progress}
            state={processingRun.state}
          />
        ) : null}
        <DialogFooter>
          <Button disabled={operationPending} variant="outline" onClick={closeProceedDialog}>
            {processingRun ? 'Close' : 'Cancel'}
          </Button>
          {processingRun ? null : (
            <Button
              className="gap-2"
              disabled={operationPending || createPending}
              onClick={confirmImportProceed}
            >
              {operationPending || createPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {operationPending || createPending
                ? 'Working...'
                : parsedImport?.rows.length === 0
                  ? 'Create draft'
                  : 'Proceed'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
