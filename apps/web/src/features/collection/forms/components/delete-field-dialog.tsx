'use client'

import { ConfirmationDialog } from '@/components/pathways'

import { dataTypeLabels } from '../../collection.utils'
import type { CollectionState } from '../hooks/use-collection-state'

export function DeleteFieldDialog({
  state,
}: {
  state: Pick<
    CollectionState,
    'confirmDeleteField' | 'pendingDeleteField' | 'setPendingDeleteField'
  >
}) {
  const { confirmDeleteField, pendingDeleteField, setPendingDeleteField } = state
  return (
    <ConfirmationDialog
      confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}
      description="This removes the field and its current configuration from the form."
      onConfirm={confirmDeleteField}
      onOpenChange={(open) => {
        if (!open) {
          setPendingDeleteField(null)
        }
      }}
      open={Boolean(pendingDeleteField)}
      title={`Delete ${pendingDeleteField?.label ?? 'this field'}?`}
    >
      {pendingDeleteField ? (
        <div className="rounded-md border border-border bg-surface-subtle p-3 text-sm">
          <p className="font-medium text-foreground">{pendingDeleteField.label}</p>
          <p className="mt-1 text-muted-foreground">
            Field code: {pendingDeleteField.code} · Type: {dataTypeLabels[pendingDeleteField.type]}
          </p>
        </div>
      ) : null}
    </ConfirmationDialog>
  )
}
