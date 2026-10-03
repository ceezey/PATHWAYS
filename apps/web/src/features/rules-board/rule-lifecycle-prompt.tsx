import { ConfirmationDialog } from '@/components/pathways'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Action = 'activate' | 'deactivate'
/** Confirmation prompt for activating or deactivating a rule; deactivation needs a note. */
export function LifecyclePrompt({
  action,
  note,
  onNote,
  onConfirm,
  onCancel,
}: {
  action: Action | null
  note: string
  onNote: (value: string) => void
  onConfirm: (action: Action) => void
  onCancel: () => void
}) {
  const title = action === 'activate' ? 'Activate rule' : 'Deactivate rule'
  return (
    <ConfirmationDialog
      confirmLabel={title}
      confirmVariant={action === 'activate' ? 'default' : 'destructive'}
      description={
        action === 'activate'
          ? 'Activate this version for deterministic evaluation and predefined recommendations?'
          : 'Deactivate this rule? Recorded history remains available.'
      }
      onConfirm={() => action && onConfirm(action)}
      onOpenChange={(open) => !open && onCancel()}
      open={action !== null}
      title={title}
    >
      {action === 'deactivate' ? (
        <div className="space-y-2">
          <Label htmlFor="rule-deactivate-note">Deactivation note</Label>
          <Textarea
            id="rule-deactivate-note"
            maxLength={2000}
            value={note}
            onChange={(event) => onNote(event.target.value)}
          />
        </div>
      ) : null}
    </ConfirmationDialog>
  )
}
